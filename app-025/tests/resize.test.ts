import { describe, it, expect } from 'vitest';
import type { Item } from '../src/core/types';
import {
  migrateFactor,
  migrateLayout,
  aspectRatioDiffers,
  ASPECT_DIFF_THRESHOLD,
} from '../src/core/resize';

/** 换缸布局迁移：比例换算 + 越界收回 + 字段保留 */

const rock: Item = {
  id: 'i-rock',
  kind: 'hardscape',
  name: '青龙石',
  x: 30,
  y: 22,
  scaleCm: 40,
  rotDeg: 30,
  displacement: 0.55,
  shape: 'rock',
};
const plant: Item = {
  id: 'i-plant',
  kind: 'plant',
  name: '红宫廷',
  x: 45,
  y: 22,
  scaleCm: 50,
  rotDeg: 0,
  layer: 'back',
  lightNeed: 'high',
  growth: 'fast',
  qty: 10,
};

describe('migrateFactor 三种换算比例', () => {
  it('等比例放大 60×45 → 90×45：长度 1.5 / 宽度 1 / 面积 √1.5', () => {
    const oldT = { l: 60, w: 45 };
    const newT = { l: 90, w: 45 };
    expect(migrateFactor(oldT, newT, 'length')).toBeCloseTo(1.5, 10);
    expect(migrateFactor(oldT, newT, 'width')).toBeCloseTo(1, 10);
    // 手工核算：√((90×45)/(60×45)) = √1.5
    expect(migrateFactor(oldT, newT, 'area')).toBeCloseTo(Math.sqrt(1.5), 10);
  });

  it('方缸换细长缸 60×60 → 120×30：长度 2 / 宽度 0.5 / 面积 1（折中）', () => {
    const oldT = { l: 60, w: 60 };
    const newT = { l: 120, w: 30 };
    expect(migrateFactor(oldT, newT, 'length')).toBeCloseTo(2, 10);
    expect(migrateFactor(oldT, newT, 'width')).toBeCloseTo(0.5, 10);
    // 手工核算：√((120×30)/(60×60)) = √1 = 1
    expect(migrateFactor(oldT, newT, 'area')).toBeCloseTo(1, 10);
  });

  it('旧缸尺寸为 0 时不产生 NaN/Infinity', () => {
    for (const mode of ['length', 'width', 'area'] as const) {
      expect(Number.isFinite(migrateFactor({ l: 0, w: 0 }, { l: 60, w: 45 }, mode))).toBe(true);
    }
  });
});

describe('aspectRatioDiffers 长宽比差异提示', () => {
  it('方缸 → 细长缸 差异大', () => {
    expect(aspectRatioDiffers({ l: 60, w: 60 }, { l: 120, w: 30 })).toBe(true);
  });
  it('同比例缩放 差异小', () => {
    expect(aspectRatioDiffers({ l: 60, w: 45 }, { l: 90, w: 67.5 })).toBe(false);
  });
  it('阈值边界：比值达到 ASPECT_DIFF_THRESHOLD 即提示', () => {
    // 60/45=1.333，90/45=2 → 2/1.333=1.5 ≥ 阈值
    expect(aspectRatioDiffers({ l: 60, w: 45 }, { l: 90, w: 45 })).toBe(true);
    expect(ASPECT_DIFF_THRESHOLD).toBeGreaterThan(1);
  });
});

describe('migrateLayout 位置与尺寸换算', () => {
  it('k=2 放大：位置与尺寸都 ×2，且保留层次/旋转/排水系数等字段', () => {
    const items: Item[] = [
      { ...rock, x: 10, y: 20, scaleCm: 15 },
      { ...plant, x: 15, y: 15, scaleCm: 25 },
    ];
    const { items: out, changes } = migrateLayout(items, { l: 60, w: 45 }, { l: 120, w: 90 }, 'length');
    expect(changes).toHaveLength(0);
    const r = out.find((i) => i.id === 'i-rock')!;
    expect(r.x).toBe(20);
    expect(r.y).toBe(40);
    expect(r.scaleCm).toBe(30);
    // 保留项：旋转角 / 排水系数 / 形状
    expect(r.rotDeg).toBe(30);
    expect(r.displacement).toBe(0.55);
    expect(r.shape).toBe('rock');
    const p = out.find((i) => i.id === 'i-plant')!;
    expect(p.x).toBe(30);
    expect(p.y).toBe(30);
    expect(p.scaleCm).toBe(50);
    // 保留项：层次 / 光照 / 生长 / 株数
    expect(p.layer).toBe('back');
    expect(p.lightNeed).toBe('high');
    expect(p.growth).toBe('fast');
    expect(p.qty).toBe(10);
  });

  it('面积等比：方缸 60×60 → 细长缸 120×30，k=1 位置尺寸不变', () => {
    const items: Item[] = [{ ...plant, x: 30, y: 15, scaleCm: 20 }];
    const { items: out, changes } = migrateLayout(items, { l: 60, w: 60 }, { l: 120, w: 30 }, 'area');
    expect(out[0].x).toBe(30);
    expect(out[0].y).toBe(15);
    expect(out[0].scaleCm).toBe(20);
    expect(changes).toHaveLength(0);
  });

  it('换算结果保留 1 位小数', () => {
    const items: Item[] = [{ ...plant, x: 7, y: 11, scaleCm: 9 }];
    const { items: out } = migrateLayout(items, { l: 60, w: 45 }, { l: 90, w: 45 }, 'length');
    // 7×1.5=10.5、11×1.5=16.5、9×1.5=13.5，均为 0.1 的倍数
    for (const v of [out[0].x, out[0].y, out[0].scaleCm]) {
      expect(Math.round(v * 10) / 10).toBe(v);
    }
  });
});

describe('migrateLayout 越界收回与改动清单', () => {
  it('位置越界 → 自动收回边界内并单独列出（from=换算值, to=收回值）', () => {
    // 60×45 → 30×45（按长度 k=0.5）：(58,42) → (29,21)，半径 2.5，x 越界收回 27.5
    const items: Item[] = [{ ...plant, x: 58, y: 42, scaleCm: 10 }];
    const { items: out, changes } = migrateLayout(items, { l: 60, w: 45 }, { l: 30, w: 45 }, 'length');
    expect(out[0].x).toBe(27.5); // 手工核算：30 − 5/2 = 27.5
    expect(out[0].y).toBe(21);
    expect(out[0].scaleCm).toBe(5);
    expect(changes).toHaveLength(1);
    expect(changes[0].id).toBe('i-plant');
    expect(changes[0].name).toBe('红宫廷');
    expect(changes[0].from).toEqual({ x: 29, y: 21, scaleCm: 5 });
    expect(changes[0].to).toEqual({ x: 27.5, y: 21, scaleCm: 5 });
    expect(changes[0].reasons.join()).toContain('收回');
  });

  it('硬景观按 0.7 高度包围盒收回（旋转按包围盒近似）', () => {
    // 60×45 → 40×20（按长度 k=2/3）：(30,22) → (20,14.7)，半高 26.7×0.35≈9.3，y 收回 10.7
    const items: Item[] = [{ ...rock, x: 30, y: 22, scaleCm: 40 }];
    const { items: out, changes } = migrateLayout(items, { l: 60, w: 45 }, { l: 40, w: 20 }, 'length');
    expect(out[0].scaleCm).toBe(26.7); // 手工核算：40×2/3≈26.67→26.7
    expect(out[0].x).toBe(20);
    expect(out[0].y).toBe(10.7); // 手工核算：20 − 26.7×0.35 = 10.655 → 10.7
    expect(changes).toHaveLength(1);
    expect(changes[0].reasons.join()).toContain('收回');
  });

  it('尺寸超过新缸 → 先压缩到能放进缸，再居中收回', () => {
    // 90×45 → 30×30（按宽度 k=2/3）：50cm 水草 → 33.3cm > 30cm 缸宽，压缩到 30 并居中
    const items: Item[] = [{ ...plant, x: 45, y: 22, scaleCm: 50 }];
    const { items: out, changes } = migrateLayout(items, { l: 90, w: 45 }, { l: 30, w: 30 }, 'width');
    expect(out[0].scaleCm).toBe(30);
    expect(out[0].x).toBe(15);
    expect(out[0].y).toBe(15);
    expect(changes).toHaveLength(1);
    expect(changes[0].reasons.join()).toContain('压缩');
    expect(changes[0].reasons.join()).toContain('收回');
    expect(changes[0].from.scaleCm).toBe(33.3); // 手工核算：50×2/3≈33.33→33.3
  });

  it('未越界的素材不出现在改动清单', () => {
    const items: Item[] = [
      { ...plant, x: 30, y: 22, scaleCm: 10 },
      { ...rock, x: 15, y: 15, scaleCm: 10 },
    ];
    const { changes } = migrateLayout(items, { l: 60, w: 45 }, { l: 90, w: 60 }, 'area');
    expect(changes).toHaveLength(0);
  });

  it('多件越界时逐件列出', () => {
    const items: Item[] = [
      { ...plant, id: 'p1', name: '草一', x: 58, y: 5, scaleCm: 10 },
      { ...plant, id: 'p2', name: '草二', x: 58, y: 42, scaleCm: 10 },
      { ...plant, id: 'p3', name: '草三', x: 30, y: 22, scaleCm: 10 },
    ];
    const { changes } = migrateLayout(items, { l: 60, w: 45 }, { l: 30, w: 45 }, 'length');
    expect(changes.map((c) => c.id).sort()).toEqual(['p1', 'p2']);
  });
});

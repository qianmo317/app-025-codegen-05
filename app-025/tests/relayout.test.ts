import { describe, it, expect } from 'vitest';
import type { Item } from '../src/core/types';
import {
  scaleFactors,
  relayoutItems,
  reasonLabel,
  type ScaleMode,
} from '../src/core/relayout';

const oldTank = { l: 60, w: 40 };

function rock(over: Partial<Item> = {}): Item {
  return {
    id: 'r1',
    kind: 'hardscape',
    name: '青龙石',
    x: 30,
    y: 20,
    scaleCm: 20,
    rotDeg: 0,
    displacement: 0.55,
    shape: 'rock',
    ...over,
  };
}
function plant(over: Partial<Item> = {}): Item {
  return {
    id: 'p1',
    kind: 'plant',
    name: '红宫廷',
    x: 30,
    y: 20,
    scaleCm: 10,
    rotDeg: 0,
    layer: 'back',
    lightNeed: 'high',
    growth: 'fast',
    qty: 12,
    ...over,
  };
}

describe('scaleFactors 三种换算模式', () => {
  it('按长度为准：统一取新长/旧长', () => {
    // 60×40 方缸 → 120×40 细长缸
    const f = scaleFactors(oldTank, 120, 40, 'length');
    expect(f).toEqual({ sx: 2, sy: 2, ss: 2 });
  });

  it('按宽度为准：统一取新宽/旧宽', () => {
    const f = scaleFactors(oldTank, 120, 80, 'width');
    expect(f.sx).toBe(2);
    expect(f.sy).toBe(2);
    expect(f.ss).toBe(2);
  });

  it('面积等比：取 √(新面积/旧面积)', () => {
    // 60×40=2400 → 120×80=9600，面积 ×4 → k=2
    const f = scaleFactors(oldTank, 120, 80, 'area');
    expect(f.ss).toBeCloseTo(2, 10);
    // 60×40=2400 → 90×40=3600，面积 ×1.5 → k=√1.5
    const f2 = scaleFactors(oldTank, 90, 40, 'area');
    expect(f2.ss).toBeCloseTo(Math.sqrt(1.5), 10);
  });

  it('缩小缸时三个模式给出不同系数（长宽比差得远）', () => {
    // 60×40 → 30×40：长度减半、宽度不变
    expect(scaleFactors(oldTank, 30, 40, 'length').ss).toBe(0.5);
    expect(scaleFactors(oldTank, 30, 40, 'width').ss).toBe(1);
    expect(scaleFactors(oldTank, 30, 40, 'area').ss).toBeCloseTo(Math.sqrt(0.5), 10);
  });
});

describe('relayoutItems 位置与尺寸换算', () => {
  it('按长度 ×2：x/y/尺寸同步放大，缸内素材不产生改动记录', () => {
    const res = relayoutItems([rock({ x: 30, y: 20, scaleCm: 10 })], oldTank, 120, 80, 'length');
    expect(res.items[0].x).toBe(60);
    expect(res.items[0].y).toBe(40);
    expect(res.items[0].scaleCm).toBe(20);
    expect(res.adjusted).toHaveLength(0);
  });

  it('位置按比例换算（中心点归一化再乘新尺寸）', () => {
    // 60×40 中的 (15,10) 即 1/4 处；新缸 120×40 按长度模式 k=2 → (30,20)
    const res = relayoutItems([plant({ x: 15, y: 10 })], oldTank, 120, 40, 'length');
    expect(res.items[0].x).toBe(30);
    expect(res.items[0].y).toBe(20);
  });

  it('面积等比：位置与尺寸统一按 √面积比', () => {
    const res = relayoutItems([rock({ x: 30, y: 20, scaleCm: 20 })], oldTank, 90, 60, 'area');
    const k = Math.sqrt((90 * 60) / (60 * 40));
    expect(res.items[0].x).toBeCloseTo(30 * k, 1);
    expect(res.items[0].scaleCm).toBeCloseTo(20 * k, 1);
  });
});

describe('越界自动收回', () => {
  it('按长度放大到细长缸时，宽度方向越界 → 夹回边界并记录', () => {
    // 60×40 → 120×40，k=2。素材 y=20（半高 20*0.7/2=7 → 缩放后半高 14）
    // 新 y=40，maxY=40-14=26 → 夹回 26
    const res = relayoutItems([rock({ x: 30, y: 20, scaleCm: 20, rotDeg: 0 })], oldTank, 120, 40, 'length');
    const it = res.items[0];
    expect(it.x).toBe(60);
    expect(it.y).toBe(26);
    expect(res.adjusted).toHaveLength(1);
    expect(res.adjusted[0].reasons).toContain('position-y');
    expect(res.adjusted[0].reasons).not.toContain('position-x');
    // 收回后确实在缸内（含包围盒）
    expect(it.y + (it.scaleCm * 0.7) / 2).toBeLessThanOrEqual(40 + 1e-6);
  });

  it('长度方向越界同样夹回并记录', () => {
    // 换到更窄短的缸 30×40，按宽度模式 k=1（尺寸不变 20cm，半宽 10）
    // 旧 x=30 → 新 x=30，maxX=30-10=20 → 夹回 20
    const res = relayoutItems([rock({ x: 30, y: 20 })], oldTank, 30, 40, 'width');
    expect(res.items[0].x).toBe(20);
    expect(res.adjusted[0].reasons).toContain('position-x');
  });

  it('素材比新缸还大 → 先等比缩小到放得下，再夹位置', () => {
    // 60×40 → 120×10 细长缸，按长度 k=2：石头 20→40cm
    // 无旋转包围盒 40×28：宽向 28 > 10 放不下 → 缩到 10/28×40 ≈ 14.3cm
    const res = relayoutItems([rock({ x: 30, y: 20, scaleCm: 20 })], oldTank, 120, 10, 'length');
    const it = res.items[0];
    // 宽向包围盒（scale*0.7）不得超过新宽 10
    expect(it.scaleCm * 0.7).toBeLessThanOrEqual(10 + 1e-6);
    expect(it.y).toBeCloseTo(5, 1); // 宽度方向只剩居中位置
    expect(res.adjusted[0].reasons).toContain('scale-fit');
  });

  it('旋转后的石头按旋转包围盒收回（保守不越界）', () => {
    // 30×20cm 石头旋转 90°：长边转到宽度方向
    const res = relayoutItems(
      [rock({ x: 30, y: 20, scaleCm: 30, rotDeg: 90 })],
      oldTank,
      120,
      40,
      'length',
    );
    const it = res.items[0];
    // k=2 → 60cm；90° 时 hx=0.7*60/2=21, hy=60/2=30；新宽 40 放不下 → 缩小
    expect(it.scaleCm).toBeLessThanOrEqual(40); // 宽度方向包围 ≤ 40
    expect(it.y + it.scaleCm / 2).toBeLessThanOrEqual(40 + 1e-6);
    expect(res.adjusted[0].reasons).toContain('scale-fit');
  });

  it('收回后所有素材包围盒都在新缸内', () => {
    const items = [
      rock({ id: 'a', x: 60, y: 40, scaleCm: 30 }),
      rock({ id: 'b', x: 0, y: 0, scaleCm: 12, shape: 'wood', displacement: 0.3 }),
      plant({ id: 'c', x: 30, y: 20, scaleCm: 18, layer: 'front' }),
    ];
    const newL = 40;
    const newW = 25;
    (['length', 'width', 'area'] as ScaleMode[]).forEach((mode) => {
      const res = relayoutItems(items, oldTank, newL, newW, mode);
      res.items.forEach((it) => {
        if (it.kind === 'hardscape') {
          const t = (Math.abs(it.rotDeg) * Math.PI) / 180;
          const hx = (it.scaleCm * (Math.abs(Math.cos(t)) + 0.7 * Math.abs(Math.sin(t)))) / 2;
          const hy = (it.scaleCm * (Math.abs(Math.sin(t)) + 0.7 * Math.abs(Math.cos(t)))) / 2;
          expect(it.x - hx).toBeGreaterThanOrEqual(-1e-6);
          expect(it.x + hx).toBeLessThanOrEqual(newL + 1e-6);
          expect(it.y - hy).toBeGreaterThanOrEqual(-1e-6);
          expect(it.y + hy).toBeLessThanOrEqual(newW + 1e-6);
        } else {
          expect(it.x - it.scaleCm / 2).toBeGreaterThanOrEqual(-1e-6);
          expect(it.x + it.scaleCm / 2).toBeLessThanOrEqual(newL + 1e-6);
          expect(it.y - it.scaleCm / 2).toBeGreaterThanOrEqual(-1e-6);
          expect(it.y + it.scaleCm / 2).toBeLessThanOrEqual(newW + 1e-6);
        }
      });
    });
  });
});

describe('属性保留', () => {
  it('层次、旋转角、株数保留', () => {
    const res = relayoutItems(
      [plant({ rotDeg: 47, layer: 'front', qty: 33 })],
      oldTank,
      120,
      80,
      'length',
    );
    expect(res.items[0].rotDeg).toBe(47);
    expect(res.items[0].layer).toBe('front');
    expect(res.items[0].qty).toBe(33);
    expect(res.items[0].lightNeed).toBe('high');
    expect(res.items[0].growth).toBe('fast');
  });

  it('硬景观排水系数与形状不动', () => {
    const res = relayoutItems(
      [rock({ displacement: 0.55, shape: 'rock', rotDeg: 15 }),
       rock({ id: 'w1', displacement: 0.3, shape: 'wood' })],
      oldTank,
      30,
      20,
      'area',
    );
    expect(res.items[0].displacement).toBe(0.55);
    expect(res.items[0].shape).toBe('rock');
    expect(res.items[1].displacement).toBe(0.3);
    expect(res.items[1].shape).toBe('wood');
  });

  it('素材 id 与数量、顺序保持不变', () => {
    const items = [rock({ id: 'a' }), plant({ id: 'b' }), rock({ id: 'c', shape: 'wood', displacement: 0.3 })];
    const res = relayoutItems(items, oldTank, 90, 60, 'area');
    expect(res.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('不改写原始入参（纯函数）', () => {
    const items = [rock({ x: 60, y: 40, scaleCm: 30 })];
    const snapshot = JSON.parse(JSON.stringify(items));
    relayoutItems(items, oldTank, 20, 20, 'length');
    expect(items).toEqual(snapshot);
  });
});

describe('reasonLabel', () => {
  it('三种原因都有中文文案', () => {
    expect(reasonLabel('position-x')).toContain('长度');
    expect(reasonLabel('position-y')).toContain('宽度');
    expect(reasonLabel('scale-fit')).toContain('缩小');
  });
});

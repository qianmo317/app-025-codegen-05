import type { Item, Tank } from './types';

/**
 * 换缸布局迁移（纯函数，可单测）：
 * 换更大/更小的缸时，把旧布局按新缸尺寸整体换算。
 * - 位置与尺寸都乘统一比例 k（等比缩，不拉伸变形，旋转角度才有意义）；
 * - 长宽比差得远时单一比例会失真，提供 按长度 / 按宽度 / 按面积 三种 k 供选择；
 * - 换算后越界的素材自动收回边界内（尺寸超缸的先压缩），被改动的单独列出；
 * - 层次 / 旋转角 / 排水系数等字段不在此触碰，原样保留。
 */

export type MigrateMode = 'length' | 'width' | 'area';

export const MIGRATE_MODES: { mode: MigrateMode; label: string; hint: string }[] = [
  { mode: 'length', label: '按长度为准', hint: 'k = 新长 ÷ 旧长，适合长宽比接近、主要看长度变化的缸' },
  { mode: 'width', label: '按宽度为准', hint: 'k = 新宽 ÷ 旧宽，适合以前后景深变化为主的缸' },
  { mode: 'area', label: '按面积等比', hint: 'k = √(新底面积 ÷ 旧底面积)，方缸换细长缸时的折中' },
];

/** 新旧缸长宽比差异阈值（超过则提示用户对比三种模式） */
export const ASPECT_DIFF_THRESHOLD = 1.25;

/** 换算比例 k：三种模式都是统一比例（x/y/尺寸同乘 k），保证素材不变形 */
export function migrateFactor(
  oldT: Pick<Tank, 'l' | 'w'>,
  newT: Pick<Tank, 'l' | 'w'>,
  mode: MigrateMode,
): number {
  const ol = Math.max(1e-6, oldT.l);
  const ow = Math.max(1e-6, oldT.w);
  switch (mode) {
    case 'length':
      return newT.l / ol;
    case 'width':
      return newT.w / ow;
    case 'area':
      return Math.sqrt((newT.l * newT.w) / (ol * ow));
  }
}

/** 新旧缸长宽比是否差得远（如方缸 → 细长缸） */
export function aspectRatioDiffers(a: Pick<Tank, 'l' | 'w'>, b: Pick<Tank, 'l' | 'w'>): boolean {
  const ra = a.l / Math.max(1e-6, a.w);
  const rb = b.l / Math.max(1e-6, b.w);
  return Math.max(ra, rb) / Math.min(ra, rb) >= ASPECT_DIFF_THRESHOLD;
}

export type MigrateChange = {
  id: string;
  name: string;
  /** 纯换算后（未收回边界）的值 */
  from: { x: number; y: number; scaleCm: number };
  /** 收回边界后的最终值 */
  to: { x: number; y: number; scaleCm: number };
  reasons: string[];
};

export type MigrateResult = {
  items: Item[];
  /** 换算后越界、被自动改动的素材（未越界的不列出） */
  changes: MigrateChange[];
};

/** 平面图占用半宽/半深（与 Canvas 渲染一致：硬景观 w=scale、h=0.7·scale；水草为圆；旋转按包围盒近似） */
function halfExtents(it: Item, scaleCm: number): { hx: number; hy: number } {
  return it.kind === 'hardscape'
    ? { hx: scaleCm / 2, hy: scaleCm * 0.35 }
    : { hx: scaleCm / 2, hy: scaleCm / 2 };
}

/** 素材能放进新缸的最大尺寸（硬景观高向占 0.7·scale） */
function maxScaleFor(it: Item, L: number, W: number): number {
  return it.kind === 'hardscape' ? Math.min(L, W / 0.7) : Math.min(L, W);
}

/** 把中心坐标夹取到 [half, len−half]；素材比缸还大时居中 */
function clampCenter(v: number, half: number, len: number): number {
  if (half * 2 >= len) return round1(len / 2);
  return round1(Math.min(Math.max(v, half), len - half));
}

/**
 * 整体迁移布局：位置与尺寸 ×k，再逐件收回边界。
 * 仅改 x/y/scaleCm；layer、rotDeg、displacement、qty 等全部保留。
 */
export function migrateLayout(
  items: Item[],
  oldTank: Pick<Tank, 'l' | 'w'>,
  newTank: Pick<Tank, 'l' | 'w'>,
  mode: MigrateMode,
): MigrateResult {
  const k = migrateFactor(oldTank, newTank, mode);
  const L = newTank.l;
  const W = newTank.w;
  const changes: MigrateChange[] = [];

  const next = items.map((it) => {
    const from = {
      x: round1(it.x * k),
      y: round1(it.y * k),
      scaleCm: Math.max(1, round1(it.scaleCm * k)),
    };
    const reasons: string[] = [];

    // ① 尺寸本身超过新缸 → 先压缩到能放进缸
    let s = from.scaleCm;
    const maxS = maxScaleFor(it, L, W);
    if (s > maxS) {
      s = round1(maxS);
      reasons.push(`尺寸换算后 ${from.scaleCm}cm 超过新缸，已压缩到 ${s}cm`);
    }

    // ② 中心坐标收回边界内
    const { hx, hy } = halfExtents(it, s);
    const x = clampCenter(from.x, hx, L);
    const y = clampCenter(from.y, hy, W);
    if (x !== from.x || y !== from.y) {
      reasons.push(`位置 (${from.x}, ${from.y}) 超出缸体，已收回 (${x}, ${y})`);
    }

    if (reasons.length > 0) {
      changes.push({ id: it.id, name: it.name, from, to: { x, y, scaleCm: s }, reasons });
    }
    return { ...it, x, y, scaleCm: s };
  });

  return { items: next, changes };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

import type { Item, Tank } from './types';

/**
 * 换缸布局换算（需求：换更大/更小缸后，把旧布局按新缸整体搬过去）。
 * 纯函数模块，全部逻辑可单测，页面组件只做展示与动作收集（见项目约定）。
 *
 * - length：以「长」为准，位置与尺寸统一按 新长/旧长 换算
 * - width：以「宽」为准，统一按 新宽/旧宽 换算
 * - area：面积等比，统一按 √(新底面积/旧底面积) 换算（长宽同比例，底面积按 k² 变化）
 *
 * 换算后超出新缸的素材：先把尺寸等比收回到放得下，再把中心点夹回边界内；
 * 被自动改动过的素材通过 adjusted 单独列出。层次、旋转角度、排水系数等一律保留。
 */

export type ScaleMode = 'length' | 'width' | 'area';

export type AdjustReason = 'position-x' | 'position-y' | 'scale-fit';

export type ScaleFactors = {
  /** 长度方向（x）位置换算比例 */
  sx: number;
  /** 宽度方向（y）位置换算比例 */
  sy: number;
  /** 素材尺寸换算比例 */
  ss: number;
};

export type AdjustedItem = {
  /** 换算并收回边界后的素材 */
  item: Item;
  /** 被自动改动的原因（可能多个） */
  reasons: AdjustReason[];
  fromX: number;
  fromY: number;
  fromScale: number;
};

export type RelayoutResult = ScaleFactors & {
  /** 全部素材换算后的新布局（顺序与旧布局一致） */
  items: Item[];
  /** 被自动收回边界/缩放过的素材 */
  adjusted: AdjustedItem[];
};

const EPS = 1e-9;

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 坐标取 0.1cm 后再向边界内侧夹一次，保证取整误差不会让包围盒出界 */
function clampRound1(n: number, min: number, max: number): number {
  let v = round1(n);
  if (v < min) v = Math.ceil(min * 10) / 10;
  if (v > max) v = Math.floor(max * 10) / 10;
  // min/max 本身可能比 0.1 粒度更细，夹后仍越界时退回未取整的精确值
  if (v < min || v > max) v = n;
  return round1(v);
}

/** 换算比例（三种模式）。面积等比：k = √(新面积/旧面积) */
export function scaleFactors(oldTank: Pick<Tank, 'l' | 'w'>, newL: number, newW: number, mode: ScaleMode): ScaleFactors {
  switch (mode) {
    case 'length': {
      const k = newL / oldTank.l;
      return { sx: k, sy: k, ss: k };
    }
    case 'width': {
      const k = newW / oldTank.w;
      return { sx: k, sy: k, ss: k };
    }
    case 'area': {
      const k = Math.sqrt((newL * newW) / (oldTank.l * oldTank.w));
      return { sx: k, sy: k, ss: k };
    }
  }
}

/**
 * 素材在新尺寸下的旋转包围盒半宽/半高（cm，保守值）。
 * 硬景观按 scaleCm × 0.7×scaleCm 的矩形旋转计；水草为圆形（与旋转无关）。
 */
export function halfExtents(item: Item, scaleCm: number): { hx: number; hy: number } {
  if (item.kind === 'hardscape') {
    const a = scaleCm;
    const b = scaleCm * 0.7;
    const t = (Math.abs(item.rotDeg) * Math.PI) / 180;
    const cos = Math.abs(Math.cos(t));
    const sin = Math.abs(Math.sin(t));
    return { hx: (a * cos + b * sin) / 2, hy: (a * sin + b * cos) / 2 };
  }
  return { hx: scaleCm / 2, hy: scaleCm / 2 };
}

/**
 * 把旧缸 items 按选定模式整体换算到新缸尺寸。
 * 不改任何入参；新素材保留 id（同一批石头/草），仅改 x/y/scaleCm。
 */
export function relayoutItems(
  items: Item[],
  oldTank: Pick<Tank, 'l' | 'w'>,
  newL: number,
  newW: number,
  mode: ScaleMode,
): RelayoutResult {
  const { sx, sy, ss } = scaleFactors(oldTank, newL, newW, mode);
  const next: Item[] = [];
  const adjusted: AdjustedItem[] = [];

  for (const it of items) {
    const reasons: AdjustReason[] = [];

    // 1) 按比例换算
    let nx = it.x * sx;
    let ny = it.y * sy;
    let ns = it.scaleCm * ss;

    // 2) 素材本身比新缸还大 → 等比缩小到放得下（保留长宽比与旋转角）
    let { hx, hy } = halfExtents(it, ns);
    if (2 * hx > newL + EPS || 2 * hy > newW + EPS) {
      const fit = Math.min(newL / (2 * hx), newW / (2 * hy));
      ns *= fit;
      ({ hx, hy } = halfExtents(it, ns));
      reasons.push('scale-fit');
    }

    // 尺寸取 0.1cm；取整进位可能反而越界，按 0.1cm 步进向下退到放得下
    ns = round1(ns);
    ({ hx, hy } = halfExtents(it, ns));
    while (2 * hx > newL + EPS || 2 * hy > newW + EPS) {
      ns = round1(ns - 0.1);
      if (ns <= 0) break;
      ({ hx, hy } = halfExtents(it, ns));
    }

    // 3) 中心点收回缸内（任一方向越界才记录）
    const minX = hx;
    const maxX = newL - hx;
    const minY = hy;
    const maxY = newW - hy;
    if (nx < minX - EPS || nx > maxX + EPS) reasons.push('position-x');
    if (ny < minY - EPS || ny > maxY + EPS) reasons.push('position-y');
    nx = clampRound1(Math.min(maxX, Math.max(minX, nx)), minX, maxX);
    ny = clampRound1(Math.min(maxY, Math.max(minY, ny)), minY, maxY);

    const moved: Item = { ...it, x: nx, y: ny, scaleCm: ns };
    next.push(moved);
    if (reasons.length > 0) {
      adjusted.push({
        item: moved,
        reasons,
        fromX: round1(it.x),
        fromY: round1(it.y),
        fromScale: round1(it.scaleCm),
      });
    }
  }

  return { sx, sy, ss, items: next, adjusted };
}

/** 人类可读的改动原因（供预览列表展示） */
export function reasonLabel(reason: AdjustReason): string {
  switch (reason) {
    case 'position-x':
      return '长度方向越界，已收回';
    case 'position-y':
      return '宽度方向越界，已收回';
    case 'scale-fit':
      return '尺寸超过新缸，已等比缩小';
  }
}

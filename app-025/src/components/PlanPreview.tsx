import type { Item } from '../core/types';
import { LAYER_COLORS } from './Canvas';

/**
 * 只读平面图（换缸预览用）：不挂任何事件，新旧两张并排对比。
 * 渲染口径与 Canvas 平面图保持一致（硬景观 0.7 宽矩形、水草圆、层次描边）。
 */

const GRID_CM = 5;

type Props = {
  l: number; // 新/旧缸长 cm
  w: number; // 新/旧缸宽 cm
  items: Item[];
  /** 被自动改动的素材 id（在新图上红圈高亮） */
  highlightIds?: Set<string>;
  testid?: string;
};

export default function PlanPreview({ l, w, items, highlightIds, testid }: Props) {
  // 两张图按容器等宽缩放，viewBox 跟随各自缸体（长宽比不同也不会拉伸）
  const W = 360;
  const pxPerCm = W / l;
  const H = w * pxPerCm;

  const grid: React.ReactNode[] = [];
  for (let c = 0; c <= l; c += GRID_CM) {
    grid.push(
      <line key={`v${c}`} x1={c * pxPerCm} y1={0} x2={c * pxPerCm} y2={H} className="grid-line" />,
    );
  }
  for (let c = 0; c <= w; c += GRID_CM) {
    grid.push(
      <line key={`h${c}`} x1={0} y1={c * pxPerCm} x2={W} y2={c * pxPerCm} className="grid-line" />,
    );
  }

  return (
    <svg
      data-testid={testid ?? 'plan-preview'}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', background: '#eaf3f6', display: 'block' }}
    >
      {grid}
      <rect x={0} y={0} width={W} height={H} fill="#c9b18a" opacity={0.2} pointerEvents="none" />
      {items.map((it) => {
        const cx = it.x * pxPerCm;
        const cy = it.y * pxPerCm;
        const s = it.scaleCm * pxPerCm;
        const stroke = it.kind === 'plant' ? LAYER_COLORS[it.layer ?? 'mid'] : '#6b4f2a';
        const fill = it.kind === 'plant' ? '#7dbb6c' : '#a08050';
        const opacity = it.kind === 'hardscape' ? 0.9 : 0.75;
        const flagged = highlightIds?.has(it.id);
        const shape =
          it.kind === 'hardscape' ? (
            <rect x={cx - s / 2} y={cy - (s * 0.7) / 2} width={s} height={s * 0.7} rx={s * 0.15} fill={fill} stroke={stroke} strokeWidth={1.5} opacity={opacity} transform={`rotate(${it.rotDeg} ${cx} ${cy})`} />
          ) : (
            <circle cx={cx} cy={cy} r={Math.max(3, s / 2)} fill={fill} stroke={stroke} strokeWidth={1.5} opacity={opacity} />
          );
        return (
          <g key={it.id} data-testid={`preview-item-${it.id}`}>
            {shape}
            {flagged && (
              it.kind === 'hardscape' ? (
                <rect
                  x={cx - s / 2 - 2}
                  y={cy - (s * 0.7) / 2 - 2}
                  width={s + 4}
                  height={s * 0.7 + 4}
                  rx={(s * 0.15) + 2}
                  fill="none"
                  stroke="#c0392b"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  transform={`rotate(${it.rotDeg} ${cx} ${cy})`}
                />
              ) : (
                <circle cx={cx} cy={cy} r={Math.max(3, s / 2) + 2.5} fill="none" stroke="#c0392b" strokeWidth={2} strokeDasharray="5 3" />
              )
            )}
          </g>
        );
      })}
      {/* 缸体外框最后画，盖住贴边素材 */}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke="#333" strokeWidth={2} pointerEvents="none" />
    </svg>
  );
}

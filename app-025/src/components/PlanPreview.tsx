import type { Item, Tank } from '../core/types';
import { LAYER_COLORS } from './Canvas';

/**
 * 静态平面图（仅展示，无交互）：换缸迁移预览等场景的新旧对比用。
 * 渲染规则与 Canvas 平面图一致：硬景观矩形(w=scale, h=0.7·scale)、水草圆、
 * z-order 硬景观在下、水草按 后→中→前 叠放，保留旋转角。
 */

const PX_PER_CM = 5;
const GRID_CM = 5;

export default function PlanPreview({
  tank,
  items,
  testid,
}: {
  tank: Pick<Tank, 'l' | 'w'>;
  items: Item[];
  testid?: string;
}) {
  const W = tank.l * PX_PER_CM;
  const H = tank.w * PX_PER_CM;

  const LAYER_ORDER = { back: 0, mid: 1, front: 2 } as const;
  const sorted = [...items].sort((a, b) => {
    const ka = a.kind === 'hardscape' ? -1 : LAYER_ORDER[a.layer ?? 'mid'];
    const kb = b.kind === 'hardscape' ? -1 : LAYER_ORDER[b.layer ?? 'mid'];
    return ka - kb;
  });

  const grid: JSX.Element[] = [];
  for (let c = GRID_CM; c < tank.l; c += GRID_CM) {
    grid.push(<line key={`v${c}`} x1={c * PX_PER_CM} y1={0} x2={c * PX_PER_CM} y2={H} className="grid-line" />);
  }
  for (let c = GRID_CM; c < tank.w; c += GRID_CM) {
    grid.push(<line key={`h${c}`} x1={0} y1={c * PX_PER_CM} x2={W} y2={c * PX_PER_CM} className="grid-line" />);
  }

  return (
    <svg
      data-testid={testid}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', background: '#eaf3f6', border: '1px solid var(--line)', borderRadius: 6, display: 'block' }}
    >
      <rect x={0} y={0} width={W} height={H} fill="#c9b18a" opacity={0.25} />
      {grid}
      {sorted.map((it) => {
        const s = it.scaleCm * PX_PER_CM;
        const cx = it.x * PX_PER_CM;
        const cy = it.y * PX_PER_CM;
        const common = {
          stroke: it.kind === 'plant' ? LAYER_COLORS[it.layer ?? 'mid'] : '#6b4f2a',
          strokeWidth: 1.5,
          fill: it.kind === 'plant' ? '#7dbb6c' : '#a08050',
          opacity: it.kind === 'hardscape' ? 0.9 : 0.75,
          transform: `rotate(${it.rotDeg} ${cx} ${cy})`,
        };
        return it.kind === 'hardscape' ? (
          <rect
            key={it.id}
            data-testid={`preview-item-${it.id}`}
            x={cx - s / 2}
            y={cy - s / 2}
            width={s}
            height={s * 0.7}
            rx={s * 0.15}
            {...common}
          />
        ) : (
          <circle
            key={it.id}
            data-testid={`preview-item-${it.id}`}
            cx={cx}
            cy={cy}
            r={Math.max(2, s / 2)}
            {...common}
          />
        );
      })}
    </svg>
  );
}

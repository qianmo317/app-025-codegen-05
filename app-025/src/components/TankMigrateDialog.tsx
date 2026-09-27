import { useMemo, useState } from 'react';
import type { Plan } from '../core/types';
import {
  relayoutItems,
  reasonLabel,
  type ScaleMode,
} from '../core/relayout';
import PlanPreview from './PlanPreview';

/**
 * 换缸迁移向导：
 * 1. 打开时对旧缸/旧布局做快照（之后在弹窗里的任何操作都不写 store）
 * 2. 选择换算模式（按长度/按宽度/面积等比）与新缸尺寸，实时预览新旧两张平面图
 * 3. 超出边界的素材自动收回并单独列出
 * 4. 点「确认迁移」才一次性写入；「取消」整份退回（store 从未被改动）
 */

type Props = {
  plan: Plan; // 打开瞬间的方案（旧缸 + 旧布局）
  onConfirm: (next: { l: number; w: number; h: number; items: Plan['items'] }) => void;
  onCancel: () => void;
};

const MODES: { key: ScaleMode; label: string; desc: string }[] = [
  { key: 'length', label: '按长度为准', desc: '位置与尺寸统一 ×（新长÷旧长）' },
  { key: 'width', label: '按宽度为准', desc: '位置与尺寸统一 ×（新宽÷旧宽）' },
  { key: 'area', label: '面积等比', desc: '统一 × √（新底面积÷旧底面积）' },
];

export default function TankMigrateDialog({ plan, onConfirm, onCancel }: Props) {
  const oldTank = plan.tank;
  const [l, setL] = useState(oldTank.l);
  const [w, setW] = useState(oldTank.w);
  const [h, setH] = useState(oldTank.h);
  const [mode, setMode] = useState<ScaleMode>('length');

  const valid = l > 0 && w > 0 && h > 0;
  const result = useMemo(
    () => (valid ? relayoutItems(plan.items, { l: oldTank.l, w: oldTank.w }, l, w, mode) : null),
    [plan.items, oldTank.l, oldTank.w, l, w, mode, valid],
  );

  const kLen = valid ? l / oldTank.l : 0;
  const kWid = valid ? w / oldTank.w : 0;
  // 长宽比差异显著（>15%）时提示必须明确选模式，不能默认想当然
  const ratioGap = valid ? Math.max(kLen, kWid) / Math.min(kLen, kWid) : 1;
  const farRatio = ratioGap > 1.15;
  const highlight = useMemo(
    () => new Set((result?.adjusted ?? []).map((a) => a.item.id)),
    [result],
  );

  return (
    <div
      className="modal-overlay"
      data-testid="migrate-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <h3>换缸迁移布局</h3>
          <button className="btn ghost sm" data-testid="migrate-close" onClick={onCancel} aria-label="关闭">
            ✕
          </button>
        </div>

        {plan.items.length === 0 && (
          <div className="warnbox" data-testid="migrate-empty">
            当前方案还没有摆放素材，迁移将只更新缸体尺寸。
          </div>
        )}

        <div className="migrate-controls">
          <div className="migrate-dims">
            <span className="muted small">新缸尺寸</span>
            <label>
              长 cm
              <input type="number" min={1} data-testid="migrate-l" value={l} onChange={(e) => setL(Number(e.target.value))} />
            </label>
            <label>
              宽 cm
              <input type="number" min={1} data-testid="migrate-w" value={w} onChange={(e) => setW(Number(e.target.value))} />
            </label>
            <label>
              高 cm
              <input type="number" min={1} data-testid="migrate-h" value={h} onChange={(e) => setH(Number(e.target.value))} />
            </label>
          </div>

          <div className="migrate-modes" role="radiogroup" aria-label="换算模式">
            {MODES.map((m) => (
              <label key={m.key} className={`mode-opt ${mode === m.key ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="migrate-mode"
                  data-testid={`migrate-mode-${m.key}`}
                  checked={mode === m.key}
                  onChange={() => setMode(m.key)}
                />
                <span>
                  <b>{m.label}</b>
                  <span className="muted small"> {m.desc}</span>
                </span>
              </label>
            ))}
          </div>

          {valid && (
            <p className="muted small" data-testid="migrate-ratios">
              旧缸 {oldTank.l}×{oldTank.w}cm（长宽比 {(oldTank.l / oldTank.w).toFixed(2)}）
              → 新缸 {l}×{w}cm（长宽比 {(l / w).toFixed(2)}）；长度 ×{kLen.toFixed(2)}、宽度 ×
              {kWid.toFixed(2)}
              {farRatio && ' · 长宽比差异较大，请确认换算模式'}
            </p>
          )}
        </div>

        <div className="migrate-preview">
          <figure className="migrate-fig">
            <figcaption>
              旧布局（{oldTank.l}×{oldTank.w}cm）
            </figcaption>
            <PlanPreview testid="migrate-preview-old" l={oldTank.l} w={oldTank.w} items={plan.items} />
          </figure>
          <div className="migrate-arrow">→</div>
          <figure className="migrate-fig">
            <figcaption>
              迁移预览（{valid ? `${l}×${w}cm` : '尺寸无效'}）
              {result && <span className="muted small"> · 实际换算系数 ×{result.ss.toFixed(3)}</span>}
            </figcaption>
            {valid && result && (
              <PlanPreview
                testid="migrate-preview-new"
                l={l}
                w={w}
                items={result.items}
                highlightIds={highlight}
              />
            )}
          </figure>
        </div>

        {result && result.adjusted.length > 0 && (
          <div className="migrate-adjusted" data-testid="migrate-adjusted">
            <h4>以下 {result.adjusted.length} 件超出新缸，已自动收回边界内（红圈标注）：</h4>
            <ul>
              {result.adjusted.map((a) => (
                <li key={a.item.id} data-testid={`adjusted-${a.item.id}`}>
                  <b>
                    {a.item.name}
                  </b>
                  （{a.item.kind === 'hardscape' ? '硬景观' : a.item.layer === 'front' ? '前景草' : a.item.layer === 'back' ? '后景草' : '中景草'}）：
                  位置 ({a.fromX}, {a.fromY}) → ({a.item.x}, {a.item.y}) cm
                  {a.reasons.includes('scale-fit') && (
                    <>
                      ；尺寸 {a.fromScale} → {a.item.scaleCm} cm
                    </>
                  )}
                  <span className="muted small"> — {a.reasons.map(reasonLabel).join('、')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result && result.adjusted.length === 0 && plan.items.length > 0 && (
          <p className="okbox small" data-testid="migrate-no-adjust">
            所有素材换算后均在新缸边界内，无需额外调整。
          </p>
        )}

        <div className="modal-foot">
          <button className="btn" data-testid="migrate-cancel" onClick={onCancel}>
            取消（整份退回）
          </button>
          <button
            className="btn primary"
            data-testid="migrate-confirm"
            disabled={!valid}
            onClick={() =>
              result &&
              onConfirm({
                l,
                w,
                h,
                items: result.items,
              })
            }
          >
            确认迁移（写入新方案）
          </button>
        </div>
      </div>
    </div>
  );
}

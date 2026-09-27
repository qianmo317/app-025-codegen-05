import { useMemo, useState } from 'react';
import type { Plan } from '../core/types';
import {
  MIGRATE_MODES,
  aspectRatioDiffers,
  migrateFactor,
  migrateLayout,
  type MigrateMode,
} from '../core/resize';
import { updatePlan } from '../state/plans';
import PlanPreview from './PlanPreview';

/**
 * 换缸迁移对话框：
 * 输入新缸尺寸 → 选换算模式（按长度/按宽度/按面积）→ 新旧平面图对比预览
 * → 确认才写入方案；取消直接关闭，方案原样保留（所有改动只存在于本组件局部 state）。
 */
export default function MigrateDialog({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [l, setL] = useState(plan.tank.l);
  const [w, setW] = useState(plan.tank.w);
  const [h, setH] = useState(plan.tank.h);
  const [mode, setMode] = useState<MigrateMode>('length');

  const valid = l > 0 && w > 0 && h > 0;
  const draft = { ...plan.tank, l, w, h };
  const k = migrateFactor(plan.tank, draft, mode);
  const result = useMemo(
    () => migrateLayout(plan.items, plan.tank, draft, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.items, plan.tank, l, w, mode],
  );
  const aspectDiff = aspectRatioDiffers(plan.tank, draft);

  function confirm() {
    // 确认才写入：缸体尺寸 + 迁移后的素材一次性提交
    updatePlan(plan.id, { tank: { ...plan.tank, l, w, h }, items: result.items });
    onClose();
  }

  return (
    <div className="modal-mask" data-testid="migrate-dialog">
      <div className="modal">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>换缸迁移布局</h3>
          <button className="btn ghost" data-testid="migrate-cancel" onClick={onClose}>
            ✕ 取消
          </button>
        </div>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          当前 {plan.tank.l} × {plan.tank.w} × {plan.tank.h} cm，共 {plan.items.length} 件素材。
          层次、旋转角度与硬景观排水系数保持不变；确认前不会改动方案。
        </p>

        <div className="migrate-form">
          <div className="grid4">
            <NumField label="新缸长 cm" value={l} onChange={setL} testid="migrate-l" />
            <NumField label="新缸宽 cm" value={w} onChange={setW} testid="migrate-w" />
            <NumField label="新缸高 cm" value={h} onChange={setH} testid="migrate-h" />
            <div className="migrate-factor" data-testid="migrate-factor">
              换算比例 <b>k = {k.toFixed(2)}</b>
            </div>
          </div>
          <div className="row" data-testid="migrate-modes">
            {MIGRATE_MODES.map((m) => (
              <label className="chk" key={m.mode} title={m.hint}>
                <input
                  type="radio"
                  name="migrate-mode"
                  data-testid={`migrate-mode-${m.mode}`}
                  checked={mode === m.mode}
                  onChange={() => setMode(m.mode)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {MIGRATE_MODES.find((m) => m.mode === mode)!.hint}
          </p>
          {aspectDiff && (
            <div className="warnbox" data-testid="migrate-aspect-hint">
              ⚠ 新旧缸长宽比差异较大（{plan.tank.l}×{plan.tank.w} → {l}×{w}），
              单一比例会失真，建议切换三种换算方式对比预览后再确认。
            </div>
          )}
        </div>

        <div className="migrate-previews">
          <div>
            <div className="muted small">当前 · {plan.tank.l} × {plan.tank.w} cm</div>
            <PlanPreview tank={plan.tank} items={plan.items} testid="migrate-old-view" />
          </div>
          <div>
            <div className="muted small">迁移后 · {l} × {w} cm（{MIGRATE_MODES.find((m) => m.mode === mode)!.label}）</div>
            <PlanPreview tank={draft} items={result.items} testid="migrate-new-view" />
          </div>
        </div>

        {result.changes.length > 0 ? (
          <div className="warnbox" data-testid="migrate-changes">
            <b>{result.changes.length} 件素材越界，已自动收回边界内：</b>
            {result.changes.map((c) => (
              <div key={c.id} data-testid={`migrate-change-${c.id}`}>
                「{c.name}」{c.reasons.join('；')}
              </div>
            ))}
          </div>
        ) : (
          <div className="okbox" data-testid="migrate-changes-none">
            全部素材换算后都在新缸边界内，无需收回。
          </div>
        )}

        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn" data-testid="migrate-cancel-bottom" onClick={onClose}>
            取消（保持原方案）
          </button>
          <button
            className="btn primary"
            data-testid="migrate-confirm"
            disabled={!valid}
            title={valid ? '写入新缸尺寸与迁移后的布局' : '缸体尺寸必须大于 0'}
            onClick={confirm}
          >
            确认迁移（写入方案）
          </button>
        </div>
      </div>
    </div>
  );
}

function NumField(props: { label: string; value: number; onChange: (v: number) => void; testid?: string }) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        data-testid={props.testid}
        value={props.value}
        step={1}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isNaN(v)) props.onChange(v);
        }}
      />
    </label>
  );
}

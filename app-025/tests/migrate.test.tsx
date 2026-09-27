import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';
import { upsertPlan, newPlan, deletePlan, getPlans, getPlan } from '../src/state/plans';
import type { Item } from '../src/core/types';

/** 换缸迁移对话框：预览对比 → 确认写入 / 取消整份退回 */

const ROCK: Item = {
  id: 'i-rock',
  kind: 'hardscape',
  name: '青龙石',
  x: 20,
  y: 15,
  scaleCm: 15,
  rotDeg: 30,
  displacement: 0.55,
  shape: 'rock',
};
const PLANT: Item = {
  id: 'i-plant',
  kind: 'plant',
  name: '红宫廷',
  x: 40,
  y: 10,
  scaleCm: 10,
  rotDeg: 0,
  layer: 'back',
  lightNeed: 'high',
  growth: 'fast',
  qty: 10,
};

function seedAndOpen(items: Item[] = [ROCK, PLANT]) {
  const plan = newPlan('迁移测试缸'); // 默认缸 60×45×45
  upsertPlan({ ...plan, items });
  window.location.hash = `/plan/${plan.id}`;
  render(<App />);
  return plan;
}

async function openDialog() {
  await userEvent.click(await screen.findByTestId('open-migrate'));
  return screen.findByTestId('migrate-dialog');
}

describe('换缸迁移对话框', () => {
  beforeEach(() => {
    window.location.hash = '/';
    localStorage.clear();
    getPlans().forEach((p) => deletePlan(p.id));
  });

  it('从编辑器打开后同时显示新旧两张平面图与三种换算模式', async () => {
    seedAndOpen();
    await openDialog();
    expect(screen.getByTestId('migrate-old-view')).toBeInTheDocument();
    expect(screen.getByTestId('migrate-new-view')).toBeInTheDocument();
    // 旧图里有两件素材
    expect(screen.getByTestId('migrate-old-view').querySelectorAll('[data-testid^="preview-item-"]')).toHaveLength(2);
    expect(screen.getByTestId('migrate-mode-length')).toBeInTheDocument();
    expect(screen.getByTestId('migrate-mode-width')).toBeInTheDocument();
    expect(screen.getByTestId('migrate-mode-area')).toBeInTheDocument();
  });

  it('切换换算模式会更新换算比例（方缸→细长缸不能只按一个比例缩）', async () => {
    seedAndOpen();
    await openDialog();
    fireEvent.change(screen.getByTestId('migrate-l'), { target: { value: '120' } });
    fireEvent.change(screen.getByTestId('migrate-w'), { target: { value: '30' } });
    // 60×45 → 120×30：长度 k=2、宽度 k≈0.67、面积 k≈1.15
    await userEvent.click(screen.getByTestId('migrate-mode-length'));
    expect(screen.getByTestId('migrate-factor').textContent).toContain('2.00');
    await userEvent.click(screen.getByTestId('migrate-mode-width'));
    expect(screen.getByTestId('migrate-factor').textContent).toContain('0.67');
    await userEvent.click(screen.getByTestId('migrate-mode-area'));
    expect(screen.getByTestId('migrate-factor').textContent).toContain('1.15');
    // 长宽比差异大 → 提示对比三种模式
    expect(screen.getByTestId('migrate-aspect-hint')).toBeInTheDocument();
  });

  it('确认后才写入：新缸尺寸与迁移布局一次性生效，层次/旋转/排水系数保留', async () => {
    const plan = seedAndOpen();
    await openDialog();
    fireEvent.change(screen.getByTestId('migrate-l'), { target: { value: '120' } });
    await userEvent.click(screen.getByTestId('migrate-mode-length')); // k=2
    await userEvent.click(screen.getByTestId('migrate-confirm'));

    expect(screen.queryByTestId('migrate-dialog')).toBeNull();
    const saved = getPlan(plan.id)!;
    expect(saved.tank.l).toBe(120);
    expect(saved.tank.w).toBe(45);
    const rock = saved.items.find((i) => i.id === 'i-rock')!;
    expect(rock.x).toBe(40);
    expect(rock.y).toBe(30);
    expect(rock.scaleCm).toBe(30);
    expect(rock.rotDeg).toBe(30); // 旋转角保留
    expect(rock.displacement).toBe(0.55); // 排水系数不动
    const plant = saved.items.find((i) => i.id === 'i-plant')!;
    expect(plant.layer).toBe('back'); // 层次保留
    expect(plant.qty).toBe(10);
    // 编辑器缸体参数同步
    expect((screen.getByTestId('tank-l') as HTMLInputElement).value).toBe('120');
  });

  it('取消则整份退回：缸体与布局保持原样', async () => {
    const plan = seedAndOpen();
    await openDialog();
    fireEvent.change(screen.getByTestId('migrate-l'), { target: { value: '120' } });
    fireEvent.change(screen.getByTestId('migrate-w'), { target: { value: '30' } });
    await userEvent.click(screen.getByTestId('migrate-mode-area'));
    await userEvent.click(screen.getByTestId('migrate-cancel-bottom'));

    expect(screen.queryByTestId('migrate-dialog')).toBeNull();
    const saved = getPlan(plan.id)!;
    expect(saved.tank.l).toBe(60);
    expect(saved.tank.w).toBe(45);
    expect(saved.items).toEqual([ROCK, PLANT]); // 素材原封不动
  });

  it('越界素材自动收回并在预览下方单独列出', async () => {
    // 靠边的水草：(58,42) 10cm，60×45 → 30×45（按长度 k=0.5）后 x 越界
    seedAndOpen([{ ...PLANT, x: 58, y: 42, scaleCm: 10 }]);
    await openDialog();
    fireEvent.change(screen.getByTestId('migrate-l'), { target: { value: '30' } });
    const box = screen.getByTestId('migrate-changes');
    expect(box.textContent).toContain('红宫廷');
    expect(box.textContent).toContain('收回');
    expect(screen.getByTestId('migrate-change-i-plant')).toBeInTheDocument();
  });

  it('全部素材都在边界内时显示无需收回', async () => {
    seedAndOpen();
    await openDialog(); // 尺寸不变 → 无越界
    expect(screen.getByTestId('migrate-changes-none')).toBeInTheDocument();
  });
});

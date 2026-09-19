import type { Entity, GameBundle, RoundRow, SeriesDetail } from './api.ts';
import { Card, Empty, inputCls } from './ui.tsx';
import { makeWinnerFn, maxRoundsOf, pickedOfSide } from './series-util.ts';

/**
 * 通用逐轮录入板。
 *
 * 只认识内核的概念：第 n 轮、双方出了谁、结果是什么、胜利条件。
 * 没有登记专属视图的游戏直接用它 —— **cs2 单挑就是这种情况，一个新组件都没写。**
 */
export default function RoundBoardGeneric({
  detail,
  bundle,
  entityById,
  onSave,
  name,
  stepNo = '',
}: {
  detail: SeriesDetail;
  bundle: GameBundle;
  entityById: Map<number, Entity>;
  onSave: (rounds: RoundRow[]) => void;
  name: (i: 0 | 1) => string;
  stepNo?: string;
}) {
  const winnerOf = makeWinnerFn(bundle.game.roundResults);
  const maxR = maxRoundsOf(detail);
  const picked = pickedOfSide(detail);
  const allEnabled = bundle.entities.filter((e) => e.enabled);

  const working: RoundRow[] = Array.from({ length: maxR }, (_, i) => {
    const idx = i + 1;
    return (
      detail.rounds.find((r) => r.idx === idx) ?? {
        idx,
        initiativeSide: null,
        side0Entity: null,
        side1Entity: null,
        result: 'pending',
        winKind: '',
        note: '',
      }
    );
  });

  const derive = (rows: RoundRow[]) => {
    const score: [number, number] = [0, 0];
    let terminal = 0;
    let doubleForfeit = false;
    for (const r of rows) {
      if (r.result === 'pending') continue;
      terminal++;
      if (r.result === 'double_forfeit') doubleForfeit = true;
      const w = winnerOf(r.result);
      if (w !== null) score[w]++;
    }
    const winBy = detail.winBy ?? bundle.game.winBy;
    return {
      score,
      terminal,
      concluded: score[0] >= winBy || score[1] >= winBy || doubleForfeit || terminal >= maxR,
    };
  };

  const { score, terminal, concluded } = derive(working);

  const persist = (rows: RoundRow[]) => {
    const d = derive(rows);
    const vis = d.concluded ? Math.max(d.terminal, 1) : Math.min(d.terminal + 1, maxR);
    onSave(rows.slice(0, vis).filter((r) => r.result !== 'pending' || r.side0Entity || r.side1Entity));
  };

  const update = (idx: number, patch: Partial<RoundRow>) => {
    persist(working.map((r) => (r.idx === idx ? { ...r, ...patch } : r)));
  };

  const optionsFor = (side: 0 | 1, current: number | null) => {
    // 有 BP 的游戏只能出本场选到的；没有 BP 的游戏（cs2）任意对象都能出
    const base = picked[side].length > 0 ? picked[side].map((id) => entityById.get(id)) : allEnabled;
    const list = base.filter((e): e is Entity => !!e);
    if (current !== null && !list.some((e) => e.id === current)) {
      const extra = entityById.get(current);
      if (extra) return [...list, extra];
    }
    return list;
  };

  const visible = concluded ? Math.max(terminal, 1) : Math.min(terminal + 1, maxR);
  const winBy = detail.winBy ?? bundle.game.winBy;

  return (
    <Card
      title={`${stepNo}逐轮（${score[0]} : ${score[1]}）`}

      right={
        <span className="text-[11px] text-slate-400">
          {concluded ? '本场已结束' : `下一轮：第 ${Math.min(terminal + 1, maxR)} 轮`}
        </span>
      }
    >
      <div className="mb-3 flex items-center gap-3 text-xs">
        <span className="text-slate-400">
          {name(0)} <b className="font-mono text-lg text-slate-100">{score[0]}</b>
        </span>
        <span className="text-slate-600">:</span>
        <span className="text-slate-400">
          <b className="font-mono text-lg text-slate-100">{score[1]}</b> {name(1)}
        </span>
        <span className="text-slate-500">先到 {winBy} 分赢</span>
      </div>

      <div className="grid gap-2">
        {working.slice(0, visible).map((r) => (
          <div key={r.idx} className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
            <div className="mb-2 text-[11px] font-semibold text-slate-300">第 {r.idx} 轮</div>
            <div className="grid items-end gap-2 sm:grid-cols-[auto_1fr_auto_1fr]">
              <span className="text-[11px] text-slate-500">{name(0)}</span>
              <select
                className={inputCls}
                value={r.side0Entity ?? ''}
                onChange={(e) => update(r.idx, { side0Entity: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">—</option>
                {optionsFor(0, r.side0Entity).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <span className="text-center text-[11px] text-slate-500">vs</span>
              <select
                className={inputCls}
                value={r.side1Entity ?? ''}
                onChange={(e) => update(r.idx, { side1Entity: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">—</option>
                {optionsFor(1, r.side1Entity).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>

              <span className="text-[11px] text-slate-500">结果</span>
              <select className={inputCls} value={r.result} onChange={(e) => update(r.idx, { result: e.target.value })}>
                {bundle.game.roundResults.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-500">胜利条件</span>
              <select
                className={inputCls}
                value={r.winKind}
                disabled={winnerOf(r.result) === null}
                onChange={(e) => update(r.idx, { winKind: e.target.value })}
              >
                <option value="">—</option>
                {bundle.game.winKinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
        {maxR === 0 && <Empty>这套规则没有轮次。</Empty>}
      </div>
    </Card>
  );
}

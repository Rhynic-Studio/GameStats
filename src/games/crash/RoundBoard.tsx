import type { Entity, GameBundle, RoundRow, SeriesDetail } from '../../web/api.ts';
import { Card, Pill, cx, inputCls } from '../../web/ui.tsx';
import {
  buffsBeforeRound,
  initiativeChooser,
  makeWinnerFn,
  maxRoundsOf,
  pickedOfSide,
} from '../../web/series-util.ts';

/**
 * crash 专属的逐轮录入板。
 *
 * 通用内核只认识"第 n 轮、双方出了谁、结果是什么"；这里额外体现 crash 的两条规则：
 *   1. 先攻权：第 1 轮由 BP 先手方选，之后由上一轮败方选
 *   2. 劣势加强：输掉一轮后本方角色获得一层加强（可叠加），界面上直接标出来
 * 这两条在别的游戏里没有，所以代码留在这个游戏的目录里，不进内核。
 */
export default function CrashRoundBoard({
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
    const concluded =
      score[0] >= detail.winBy || score[1] >= detail.winBy || doubleForfeit || terminal >= maxR;
    return { score, terminal, concluded };
  };

  const { score, terminal, concluded } = derive(working);
  const visible = concluded ? Math.max(terminal, 1) : Math.min(terminal + 1, maxR);

  const persist = (rows: RoundRow[]) => {
    const d = derive(rows);
    const vis = d.concluded ? Math.max(d.terminal, 1) : Math.min(d.terminal + 1, maxR);
    onSave(
      rows
        .slice(0, vis)
        .filter(
          (r) => r.result !== 'pending' || r.side0Entity || r.side1Entity || r.initiativeSide !== null,
        ),
    );
  };

  const update = (idx: number, patch: Partial<RoundRow>) => {
    persist(working.map((r) => (r.idx === idx ? { ...r, ...patch } : r)));
  };

  const optionsFor = (side: 0 | 1, current: number | null) => {
    const ids = picked[side].length > 0 ? picked[side] : detail.pool.map((p) => p.entityId);
    const list = current !== null && !ids.includes(current) ? [...ids, current] : ids;
    return list.map((id) => entityById.get(id)).filter((e): e is Entity => !!e);
  };

  return (
    <Card
      title={`${stepNo}逐轮（${score[0]} : ${score[1]}）`}

      right={
        <span className="text-[11px] text-slate-400">
          {concluded ? '本场已结束' : `下一轮：第 ${Math.min(terminal + 1, maxR)} 轮`}
        </span>
      }
    >
      {/* 比分条 */}
      <div className="mb-3 flex items-center gap-3 text-xs">
        <span className="text-slate-400">
          {name(0)} <b className="font-mono text-lg text-slate-100">{score[0]}</b>
        </span>
        <span className="text-slate-600">:</span>
        <span className="text-slate-400">
          <b className="font-mono text-lg text-slate-100">{score[1]}</b> {name(1)}
        </span>
        <span className="text-slate-500">先到 {detail.winBy} 分赢</span>
      </div>

      <div className="grid gap-2">
        {working.slice(0, visible).map((r) => {
          const chooser = initiativeChooser(detail, working, r.idx, winnerOf);
          const buffs = buffsBeforeRound(detail, working, r.idx, winnerOf);
          const w = winnerOf(r.result);
          return (
            <div key={r.idx} className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-semibold text-slate-300">第 {r.idx} 轮</span>
                <span className="text-slate-500">
                  先攻由 <b className="text-slate-300">{chooser === null ? '—' : name(chooser)}</b> 选
                </span>
                {([0, 1] as const).map((s) => (
                  <Pill key={s} tone={buffs[s] > 0 ? 'amber' : 'slate'}>
                    {name(s)} 加强 +{buffs[s]}
                  </Pill>
                ))}
                {w !== null && <Pill tone="green">{name(w)} 拿下</Pill>}
              </div>

              <div className="grid items-end gap-2 sm:grid-cols-[auto_1fr_auto_1fr]">
                <span className="text-[11px] text-slate-500">先攻方</span>
                <select
                  className={cx(inputCls, 'sm:col-span-3')}
                  value={r.initiativeSide ?? ''}
                  onChange={(e) =>
                    update(r.idx, { initiativeSide: e.target.value === '' ? null : (Number(e.target.value) as 0 | 1) })
                  }
                >
                  <option value="">未定</option>
                  <option value={0}>{name(0)} 先攻</option>
                  <option value={1}>{name(1)} 先攻</option>
                </select>

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
                <select
                  className={inputCls}
                  value={r.result}
                  onChange={(e) => update(r.idx, { result: e.target.value })}
                >
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
          );
        })}
      </div>
    </Card>
  );
}

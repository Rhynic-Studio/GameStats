import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Entity, type RoundRow, type SeriesDetail } from '../api.ts';
import { useGame } from '../GameLayout.tsx';
import { Card, Empty, Pill, Saved, cx } from '../ui.tsx';
import { roundBoardFor } from '../round-board.ts';
import { slotsOf } from '../../shared/types.ts';

export default function Entry() {
  const { bundle } = useGame();
  const nav = useNavigate();
  const { id: idStr } = useParams();
  const id = Number(idStr);
  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    api
      .series(bundle.game.slug, id)
      .then(setDetail)
      .catch((e) => setError(String(e.message ?? e)));
  }, [bundle.game.slug, id]);

  const run = async (fn: () => Promise<{ detail: SeriesDetail }>) => {
    setSaved('saving');
    setError(null);
    try {
      const r = await fn();
      setDetail(r.detail);
      setSaved('saved');
      setTimeout(() => setSaved((s) => (s === 'saved' ? 'idle' : s)), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaved('error');
    }
  };

  const entityById = useMemo(
    () => new Map(bundle.entities.map((e) => [e.id, e])),
    [bundle.entities],
  );

  if (error && !detail) return <p className="text-rose-300">{error}</p>;
  if (!detail) return <p className="text-slate-400">加载中…</p>;

  const game = bundle.game.slug;
  const RoundBoard = roundBoardFor(game);
  const name = (i: 0 | 1) => detail.sides[i].playerName;
  /** 规则有没有 BP 阶段 —— 没有的话整块进池/BP 都不出现（cs2 单挑就是） */
  const hasDraft = detail.hasDraft;
  const poolNo = hasDraft ? '① ' : '';
  const draftNo = hasDraft ? '② ' : '';
  const roundNo = hasDraft ? '③ ' : '① ';

  const poolIds = detail.pool.map((p) => p.entityId);
  const togglePool = (e: Entity) => {
    const next = poolIds.includes(e.id) ? poolIds.filter((x) => x !== e.id) : [...poolIds, e.id];
    void run(() => api.putPool(game, id, next));
  };

  const statusText = {
    drafting: '录 BP 中',
    ready: 'BP 完成，待开打',
    playing: '进行中',
    done: '已结束',
  }[detail.status];

  return (
    <div className="grid gap-4">
      {/* ---------- 顶部：对局头 ---------- */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="text-base font-semibold text-slate-100">
            {name(0)}
            <span className="mx-2 font-mono text-slate-400">
              {detail.score[0]} : {detail.score[1]}
            </span>
            {name(1)}
          </div>
          {detail.isDraw && <Pill tone="slate">平局</Pill>}
          {detail.concluded && !detail.isDraw && detail.winnerSide !== null && (
            <Pill tone="green">{name(detail.winnerSide)} 胜</Pill>
          )}
          <Pill tone="sky">{detail.rulesetLabel}</Pill>
          <span className="text-xs text-slate-500">{detail.playedAt}</span>
          <span className="text-xs text-amber-300">{statusText}</span>
          <div className="ml-auto flex items-center gap-3">
            <Saved state={saved} />
            <button
              onClick={async () => {
                if (!confirm('删除这场对局？')) return;
                await api.deleteSeries(game, id);
                nav(`/${game}/history`);
              }}
              className="text-xs text-slate-500 transition hover:text-rose-300"
            >
              删除
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
          {hasDraft && (
            <>
              <span>
                BP 先手方：<b className="text-slate-200">{name(detail.bpFirstSide)}</b>
              </span>
              <span>
                进池：{detail.progress.poolCount}/{detail.progress.poolSize}
              </span>
              <span>
                BP：{detail.progress.draftFilled}/{detail.progress.draftTotal}
              </span>
            </>
          )}
          <span>
            轮次：{detail.progress.roundsDone}/{detail.progress.roundsTotal}
            <span className="ml-1 text-slate-500">（先到 {detail.winBy} 分赢）</span>
          </span>
        </div>
        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      </Card>

      {/* ---------- 进池 / BP：只有带 BP 阶段的规则才有这两块 ---------- */}
      {hasDraft && (
        <Card
          title={`${poolNo}进池名单（${detail.progress.poolCount}/${detail.ruleset.poolSize ?? 0}）`}

        >
          <div className="flex flex-wrap gap-1.5">
            {bundle.entities.map((e) => {
              const on = poolIds.includes(e.id);
              return (
                <button
                  key={e.id}
                  onClick={() => togglePool(e)}
                  className={cx(
                    'rounded-lg border px-2.5 py-1 text-xs transition',
                    on
                      ? 'border-sky-500 bg-sky-600/80 text-white'
                      : 'border-slate-600 bg-slate-800/60 text-slate-300 hover:border-slate-400',
                    !e.enabled && 'opacity-40',
                  )}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
          {detail.progress.poolCount > (detail.ruleset.poolSize ?? 0) && (
            <p className="mt-2 text-xs text-amber-300">
              已超出这套规则的池子大小（{detail.ruleset.poolSize}），确认没点错？
            </p>
          )}
        </Card>
      )}

      {hasDraft && (
        <DraftBoard
          detail={detail}
          entities={entityById}
          stepNo={draftNo}
          onSave={(actions) => run(() => api.putDraft(game, id, actions))}
        />
      )}

      {/* ---------- 逐轮：没有登记专属板的游戏自动用通用板 ---------- */}
      <RoundBoard
        detail={detail}
        bundle={bundle}
        entityById={entityById}
        onSave={(rounds: RoundRow[]) => run(() => api.putRounds(game, id, rounds))}
        name={name}
        stepNo={roundNo}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 通用 BP 板：完全由规则里的槽位序列驱动，换游戏不用改代码             */
/* ------------------------------------------------------------------ */

function DraftBoard({
  detail,
  entities,
  stepNo,
  onSave,
}: {
  detail: SeriesDetail;
  entities: Map<number, Entity>;
  stepNo: string;
  onSave: (actions: { slotIndex: number; entityId: number }[]) => void;
}) {
  const ruleset = detail.ruleset;
  const slots = slotsOf(ruleset);
  const sideOf = (who: 'first' | 'second') => (who === 'first' ? detail.bpFirstSide : ((1 - detail.bpFirstSide) as 0 | 1));
  const at = new Map(detail.draft.map((a) => [a.slotIndex, a.entityId]));
  const current = slots.findIndex((_, i) => !at.has(i));
  const pool = detail.pool.map((p) => entities.get(p.entityId)!).filter(Boolean);
  const banned = new Set(
    detail.draft.filter((a) => slots[a.slotIndex]?.kind === 'ban').map((a) => a.entityId),
  );
  const used = new Set(detail.draft.map((a) => a.entityId));

  const place = (entityId: number) => {
    if (current < 0) return;
    onSave([...detail.draft, { slotIndex: current, entityId }]);
  };
  const remove = (slotIndex: number) => {
    onSave(detail.draft.filter((a) => a.slotIndex !== slotIndex));
  };

  let banNo = 0;
  let pickNo = 0;

  return (
    <Card
      title={`${stepNo}BP（${detail.draft.length}/${slots.length}）`}

    >
      <ol className="grid gap-1">
        {slots.map((slot, i) => {
          const eid = at.get(i);
          const no = slot.kind === 'ban' ? ++banNo : ++pickNo;
          const isCurrent = i === current;
          const side = sideOf(slot.who);
          return (
            <li
              key={i}
              className={cx(
                'flex items-center gap-3 rounded-lg border px-3 py-1.5 text-xs',
                isCurrent ? 'border-sky-500 bg-sky-900/30' : 'border-slate-700/50 bg-slate-900/30',
              )}
            >
              <span className="w-12 font-mono text-slate-400">
                {no}
                {slot.kind}
              </span>
              <span className={cx('w-28', side === detail.bpFirstSide ? 'text-sky-300' : 'text-violet-300')}>
                {detail.sides[side].playerName}
                {side === detail.bpFirstSide && <span className="ml-1 text-[10px] text-slate-500">BP先手</span>}
              </span>
              <span className={cx('flex-1', slot.kind === 'ban' ? 'text-rose-300' : 'text-slate-100')}>
                {eid ? (entities.get(eid)?.name ?? '?') : isCurrent ? '← 当前' : '—'}
              </span>
              {eid && (
                <button onClick={() => remove(i)} className="text-[11px] text-slate-500 hover:text-rose-300">
                  撤销
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4">
        <div className="mb-2 text-[11px] text-slate-400">
          {current < 0
            ? 'BP 已录完'
            : `从池子里点一个给「${slots[current].kind === 'ban' ? 'ban' : 'pick'}」`}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pool.map((e) => {
            const isUsed = used.has(e.id);
            return (
              <button
                key={e.id}
                disabled={isUsed || current < 0}
                onClick={() => place(e.id)}
                className={cx(
                  'rounded-lg border px-2.5 py-1 text-xs transition',
                  isUsed
                    ? banned.has(e.id)
                      ? 'border-rose-800 bg-rose-950/60 text-rose-400/60 line-through'
                      : 'border-slate-700 bg-slate-800/40 text-slate-500 line-through'
                    : 'border-slate-600 bg-slate-800/60 text-slate-200 hover:border-sky-500 hover:bg-sky-900/40',
                )}
              >
                {e.name}
              </button>
            );
          })}
          {pool.length === 0 && <Empty>还没录进池名单</Empty>}
        </div>
      </div>
    </Card>
  );
}

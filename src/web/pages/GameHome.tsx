import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Overview } from '../api.ts';
import { useGame } from '../GameLayout.tsx';
import { Card, Empty, Pill } from '../ui.tsx';

const statusLabel: Record<string, [string, 'slate' | 'sky' | 'amber' | 'green']> = {
  drafting: ['录 BP 中', 'amber'],
  ready: ['待开打', 'sky'],
  playing: ['进行中', 'sky'],
  done: ['已结束', 'green'],
};

export default function GameHome() {
  const { bundle } = useGame();
  const [ov, setOv] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.overview(bundle.game.slug).then(setOv).catch((e) => setError(String(e.message ?? e)));
  }, [bundle.game.slug]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="new"
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
        >
          + 新建对局
        </Link>
        {(ov?.inProgress ?? 0) > 0 && (
          <span className="text-xs text-amber-300">{ov!.inProgress} 场还没录完</span>
        )}
      </div>

      {error && <p className="text-rose-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['对局总数', ov?.seriesCount],
          ['已结束', ov?.concluded],
          ['打过的小局', ov?.roundCount],
          ['玩家 / 角色', ov ? `${ov.playerCount} / ${ov.entityCount}` : undefined],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-3">
            <div className="text-[11px] text-slate-400">{label}</div>
            <div className="mt-1 text-xl font-semibold text-slate-100">{value ?? '—'}</div>
          </div>
        ))}
      </div>

      {ov && ov.entitiesNeverPlayed.length > 0 && (
        <p className="text-xs text-slate-500">
          从没上过场的角色：{ov.entitiesNeverPlayed.join('、')}
        </p>
      )}

      <Card title="最近的局">
        {!ov ? (
          <Empty>加载中…</Empty>
        ) : ov.recent.length === 0 ? (
          <Empty>还没有记录。点上面的「新建对局」开始。</Empty>
        ) : (
          <ul className="divide-y divide-slate-700/50">
            {ov.recent.map((s) => {
              const [label, tone] = statusLabel[s.status] ?? ['—', 'slate'];
              return (
                <li key={s.id}>
                  <Link to={`s/${s.id}`} className="flex items-center gap-3 py-2 hover:bg-slate-800/40">
                    <span className="w-24 text-xs text-slate-500">{s.playedAt}</span>
                    <span className="flex-1 text-sm text-slate-200">
                      {s.sides[0].playerName}
                      <span className="mx-2 font-mono text-slate-400">
                        {s.score[0]} : {s.score[1]}
                      </span>
                      {s.sides[1].playerName}
                      {s.isDraw && <span className="ml-2 text-xs text-slate-400">平局</span>}
                    </span>
                    <span className="text-[11px] text-slate-500">{s.rulesetLabel}</span>
                    <Pill tone={tone}>{label}</Pill>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type SeriesSummary } from '../api.ts';
import { useGame } from '../GameLayout.tsx';
import { Card, Empty, Pill } from '../ui.tsx';

const statusMeta: Record<string, [string, 'slate' | 'sky' | 'amber' | 'green']> = {
  drafting: ['录 BP 中', 'amber'],
  ready: ['待开打', 'sky'],
  playing: ['进行中', 'sky'],
  done: ['已结束', 'green'],
};

export default function History() {
  const { bundle } = useGame();
  const [list, setList] = useState<SeriesSummary[] | null>(null);
  const [only, setOnly] = useState<'all' | 'unfinished' | 'done'>('all');

  useEffect(() => {
    api.seriesList(bundle.game.slug).then(setList).catch(() => setList([]));
  }, [bundle.game.slug]);

  const rows = (list ?? []).filter((s) =>
    only === 'all' ? true : only === 'done' ? s.status === 'done' : s.status !== 'done',
  );

  return (
    <Card
      title={`对局记录（${rows.length}）`}
      right={
        <div className="flex gap-1">
          {(
            [
              ['all', '全部'],
              ['unfinished', '未录完'],
              ['done', '已结束'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setOnly(k)}
              className={`rounded-md px-2 py-1 text-[11px] ${
                only === k ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-700/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {!list ? (
        <Empty>加载中…</Empty>
      ) : rows.length === 0 ? (
        <Empty>
          还没有对局。<Link to="../new" relative="path" className="text-sky-400">新建一个</Link>
        </Empty>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-slate-500">
              <th className="py-1 font-normal">日期</th>
              <th className="font-normal">对局</th>
              <th className="font-normal">规则</th>
              <th className="font-normal">进度</th>
              <th className="font-normal">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {rows.map((s) => {
              const [label, tone] = statusMeta[s.status] ?? ['—', 'slate'];
              return (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="py-2 text-xs text-slate-500">{s.playedAt}</td>
                  <td>
                    <Link to={`../s/${s.id}`} relative="path" className="text-slate-200 hover:text-sky-300">
                      {s.sides[0].playerName}
                      <span className="mx-2 font-mono text-slate-400">
                        {s.score[0]}:{s.score[1]}
                      </span>
                      {s.sides[1].playerName}
                    </Link>
                    {s.isDraw && <span className="ml-2 text-[11px] text-slate-400">平局</span>}
                  </td>
                  <td className="text-[11px] text-slate-500">{s.rulesetLabel}</td>
                  <td className="text-[11px] text-slate-500">
                    {s.hasDraft && (
                      <>
                        池 {s.progress.poolCount}/{s.progress.poolSize} · BP {s.progress.draftFilled}/
                        {s.progress.draftTotal} ·{' '}
                      </>
                    )}
                    轮 {s.progress.roundsDone}/{s.progress.roundsTotal}
                  </td>
                  <td>
                    <Pill tone={tone}>{label}</Pill>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

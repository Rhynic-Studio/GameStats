import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type GameBrief } from '../api.ts';

export default function GamePicker() {
  const [games, setGames] = useState<GameBrief[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.games().then(setGames).catch((e) => setError(String(e.message ?? e)));
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold text-slate-100">battle-stats</h1>
      <p className="mt-1 text-sm text-slate-400">内网对战数据统计。选一个游戏。</p>

      {error && <p className="mt-6 text-rose-300">{error}</p>}
      {!games && !error && <p className="mt-6 text-slate-400">加载中…</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {games?.map((g) => (
          <Link
            key={g.slug}
            to={`/${g.slug}`}
            className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 transition hover:border-sky-600 hover:bg-slate-800/60"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-base font-semibold text-slate-100">{g.name}</span>
              <code className="text-[11px] text-slate-500">/{g.slug}</code>
            </div>
            <p className="mt-1 text-xs text-slate-400">{g.tagline}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

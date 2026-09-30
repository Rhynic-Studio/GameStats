import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { cs2, crash } from './common/api.ts';
import { ALL_GAMES } from '../shared/games.ts';
import Cs2List from './cs2/MatchList.tsx';
import Cs2View from './cs2/MatchView.tsx';
import Cs2Edit from './cs2/MatchEdit.tsx';
import Cs2Stats from './cs2/Stats.tsx';
import CrashList from './crash/MatchList.tsx';
import CrashView from './crash/MatchView.tsx';
import CrashEdit from './crash/MatchEdit.tsx';
import CrashStats from './crash/Stats.tsx';

declare global {
  interface Window {
    /** 服务端写进 index.html 的：启用了哪些游戏 */
    __GAMES__?: string[];
  }
}

// 服务端没写（比如 vite dev 直接跑前端、没经过服务端）就当作全都启用
const ENABLED: string[] = window.__GAMES__ ?? ALL_GAMES.map((g) => g.slug);
const on = (slug: string) => ENABLED.includes(slug);

/** 首页卡片下面那行「N 场 · 最近 X」 */
const counts: Record<string, () => Promise<{ playedAt: string }[]>> = {
  cs2: cs2.matches,
  crash: crash.matches,
};

function Home() {
  const list = ALL_GAMES.filter((g) => on(g.slug));
  const [meta, setMeta] = useState<Record<string, { count: number; last?: string }>>({});

  useEffect(() => {
    for (const g of list) {
      counts[g.slug]?.()
        .then((ms) => setMeta((m) => ({ ...m, [g.slug]: { count: ms.length, last: ms[0]?.playedAt } })))
        .catch(() => {});
    }
    // 列表来自模块常量，不会变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="home">
      <h1>game-stats</h1>
      <p className="muted">对战数据统计</p>
      <div className="game-grid">
        {list.map((g) => (
          <Link className="game-card" to={`/${g.slug}`} key={g.slug}>
            <span className="game-name">{g.name}</span>
            <span className="muted small">{g.tagline}</span>
            <span className="game-meta muted small">
              {meta[g.slug] ? `${meta[g.slug].count} 场` : ''}
              {meta[g.slug]?.last ? ` · 最近 ${meta[g.slug].last}` : ''}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />

      {on('cs2') && (
        <>
          <Route path="/cs2" element={<Cs2List />} />
          <Route path="/cs2/new" element={<Cs2Edit />} />
          <Route path="/cs2/stats" element={<Cs2Stats />} />
          <Route path="/cs2/:id" element={<Cs2View />} />
          <Route path="/cs2/:id/edit" element={<Cs2Edit />} />
        </>
      )}

      {on('crash') && (
        <>
          <Route path="/crash" element={<CrashList />} />
          <Route path="/crash/new" element={<CrashEdit />} />
          <Route path="/crash/stats" element={<CrashStats />} />
          <Route path="/crash/:id" element={<CrashView />} />
          <Route path="/crash/:id/edit" element={<CrashEdit />} />
        </>
      )}

      {/* 被禁用的游戏、还有拼错的地址，一律回首页 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

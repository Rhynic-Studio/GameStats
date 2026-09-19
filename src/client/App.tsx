import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { cs2, crash } from './common/api.ts';
import Cs2List from './cs2/MatchList.tsx';
import Cs2View from './cs2/MatchView.tsx';
import Cs2Edit from './cs2/MatchEdit.tsx';
import Cs2Stats from './cs2/Stats.tsx';
import CrashList from './crash/MatchList.tsx';
import CrashView from './crash/MatchView.tsx';
import CrashEdit from './crash/MatchEdit.tsx';
import CrashStats from './crash/Stats.tsx';

interface GameCard {
  to: string;
  name: string;
  tagline: string;
  count?: number;
  last?: string;
}

function Games() {
  const [games, setGames] = useState<GameCard[]>([
    { to: '/cs2', name: 'CS2 单挑', tagline: '手枪 / 长枪 / 狙击 / solo三项' },
    { to: '/crash', name: 'Crash', tagline: '1v1 · 抽池 · ban/pick · BO3' },
  ]);

  useEffect(() => {
    Promise.all([cs2.matches(), crash.matches()])
      .then(([a, b]) => {
        setGames((gs) => [
          { ...gs[0], count: a.length, last: a[0]?.playedAt },
          { ...gs[1], count: b.length, last: b[0]?.playedAt },
        ]);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="home">
      <h1>battle-stats</h1>
      <p className="muted">对战数据统计</p>
      <div className="game-grid">
        {games.map((g) => (
          <Link className="game-card" to={g.to} key={g.to}>
            <span className="game-name">{g.name}</span>
            <span className="muted small">{g.tagline}</span>
            <span className="game-meta muted small">
              {g.count === undefined ? '' : `${g.count} 场`}
              {g.last ? ` · 最近 ${g.last}` : ''}
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
      <Route path="/" element={<Games />} />
      <Route path="/cs2" element={<Cs2List />} />
      <Route path="/cs2/new" element={<Cs2Edit />} />
      <Route path="/cs2/stats" element={<Cs2Stats />} />
      <Route path="/cs2/:id" element={<Cs2View />} />
      <Route path="/cs2/:id/edit" element={<Cs2Edit />} />
      <Route path="/crash" element={<CrashList />} />
      <Route path="/crash/new" element={<CrashEdit />} />
      <Route path="/crash/stats" element={<CrashStats />} />
      <Route path="/crash/:id" element={<CrashView />} />
      <Route path="/crash/:id/edit" element={<CrashEdit />} />
    </Routes>
  );
}

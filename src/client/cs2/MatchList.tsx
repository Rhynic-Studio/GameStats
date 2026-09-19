import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../common/api.ts';
import type { MatchSummary } from '../../shared/types.ts';

export default function MatchList() {
  const [matches, setMatches] = useState<MatchSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState('playedAt');
  const [desc, setDesc] = useState(true);

  useEffect(() => {
    api.matches().then(setMatches).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  const rank = (m: MatchSummary, key: string): number | string => {
    switch (key) {
      case 'playedAt':
        return m.playedAt;
      case 'playerA':
        return m.playerA.name;
      case 'playerB':
        return m.playerB.name;
      case 'mode':
        return m.mode.id;
      case 'scoreA':
        return m.scoreA;
      case 'scoreB':
        return m.scoreB;
      case 'rounds':
        return m.rounds;
      default:
        return 0;
    }
  };

  const rows = useMemo(() => {
    if (!matches) return [];
    return [...matches].sort((x, y) => {
      const a = rank(x, sortKey);
      const b = rank(y, sortKey);
      const d = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return desc ? -d : d;
    });
  }, [matches, sortKey, desc]);

  const click = (key: string) => {
    if (key === sortKey) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(false);
    }
  };
  const arrow = (key: string) => (sortKey === key ? (desc ? ' ▼' : ' ▲') : '');

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/">游戏</Link> / CS2 单挑
      </div>
      <div className="bar">
        <h1>CS2 单挑</h1>
        <span className="spacer" />
        <Link to="/cs2/stats">统计</Link>
        <Link to="/cs2/new">+ 新的一场</Link>
      </div>
      {err && <p className="err">{err}</p>}
      {!matches && !err && <p>加载中…</p>}

      {matches && matches.length === 0 && <p className="muted">还没有记录。</p>}

      {rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th onClick={() => click('playedAt')}>日期{arrow('playedAt')}</th>
              <th onClick={() => click('playerA')}>玩家 A{arrow('playerA')}</th>
              <th onClick={() => click('scoreA')} className="num">
                比分{arrow('scoreA')}
              </th>
              <th onClick={() => click('scoreB')} className="num">
                比分{arrow('scoreB')}
              </th>
              <th onClick={() => click('playerB')}>玩家 B{arrow('playerB')}</th>
              <th onClick={() => click('mode')}>单挑{arrow('mode')}</th>
              <th onClick={() => click('rounds')} className="num">
                局数{arrow('rounds')}
              </th>
              <th className="plain">备注</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.playedAt}</td>
                <td>
                  <Link to={`/cs2/${m.id}`}>{m.playerA.name}</Link>
                </td>
                <td className="num">{m.scoreA}</td>
                <td className="num">{m.scoreB}</td>
                <td>{m.playerB.name}</td>
                <td>{m.mode.name}</td>
                <td className="num">{m.rounds}</td>
                <td className="muted small">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

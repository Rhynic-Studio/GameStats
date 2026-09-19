import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../common/api.ts';
import { Card, TopBar } from '../common/Card.tsx';
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
      <TopBar current="list" />

      <Card
        title="对局记录"
        actions={
          <Link to="/cs2/new">
            <button className="primary">+ 新的一场</button>
          </Link>
        }
        flush
      >
        {err && <p className="err card-body">{err}</p>}
        {!matches && !err && <p className="muted card-body">加载中…</p>}
        {matches && matches.length === 0 && <p className="muted card-body">还没有记录。</p>}

        {rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th onClick={() => click('playedAt')}>日期{arrow('playedAt')}</th>
                <th className="plain">对局方</th>
                <th onClick={() => click('mode')}>单挑{arrow('mode')}</th>
                <th className="plain">比分</th>
                <th onClick={() => click('rounds')} className="num">
                  局数{arrow('rounds')}
                </th>
                <th className="plain">备注</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/cs2/${m.id}`}>{m.playedAt}</Link>
                  </td>
                  <td>
                    {m.playerA.name} <span className="muted">vs</span> {m.playerB.name}
                  </td>
                  <td>{m.mode.name}</td>
                  <td>
                    <b>{m.scoreA}</b> : <b>{m.scoreB}</b>
                    {m.winner && (
                      <span className="muted small">
                        {' '}
                        {m.winner === 'A' ? m.playerA.name : m.playerB.name} 胜
                      </span>
                    )}
                  </td>
                  <td className="num">{m.rounds}</td>
                  <td className="muted small">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

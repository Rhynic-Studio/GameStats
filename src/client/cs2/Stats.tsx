import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cs2 } from '../common/api.ts';
import { Card, TopBar } from '../common/Card.tsx';
import { StatBoard } from '../common/StatBoard.tsx';
import type { StatTable, Player } from '../../shared/types.ts';

export default function Stats() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [params, setParams] = useSearchParams();
  const [tables, setTables] = useState<StatTable[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const player = params.get('player') ?? '';
  const opponent = params.get('opponent') ?? '';
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    cs2.lists().then((l) => setPlayers(l.players)).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    cs2
      .stats(player ? Number(player) : undefined, opponent ? Number(opponent) : undefined)
      .then(setTables)
      .catch((e) => setErr(String(e.message ?? e)));
  }, [player, opponent]);

  return (
    <div className="page">
      <TopBar game="cs2" name="CS2 单挑" current="stats" />
      {err && <p className="err">{err}</p>}
      <StatBoard
        tables={player ? tables : null}
        empty={!player ? <p className="muted">选一个玩家。</p> : undefined}
      >
        <Card title="筛选">
          <div className="fields">
            <label className="field">
              玩家
              <select value={player} onChange={(e) => set('player', e.target.value)}>
                <option value="">（选择玩家）</option>
                {players?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              对手
              <select value={opponent} onChange={(e) => set('opponent', e.target.value)}>
                <option value="">全部</option>
                {players
                  ?.filter((p) => String(p.id) !== player)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </Card>
      </StatBoard>
    </div>
  );
}

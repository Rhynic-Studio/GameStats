import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { crash } from '../common/api.ts';
import { Card, TopBar } from '../common/Card.tsx';
import { StatBoard } from '../common/StatBoard.tsx';
import type { Player, StatTable } from '../../shared/types.ts';

export default function Stats() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [params, setParams] = useSearchParams();
  const [tables, setTables] = useState<StatTable[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const player = params.get('player') ?? '';
  const set = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('player', value);
    else next.delete('player');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    crash.lists().then((l) => setPlayers(l.players)).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    crash.stats(player ? Number(player) : undefined).then(setTables).catch((e) => setErr(String(e.message ?? e)));
  }, [player]);

  return (
    <div className="page">
      <TopBar game="crash" name="Crash" current="stats" />
      {err && <p className="err">{err}</p>}
      <StatBoard tables={tables}>
        <Card title="筛选">
          <div className="fields">
            <label className="field">
              玩家
              <select value={player} onChange={(e) => set(e.target.value)}>
                <option value="">全部</option>
                {players?.map((p) => (
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

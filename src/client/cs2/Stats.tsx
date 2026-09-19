import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Lists } from '../common/api.ts';
import { StatTableView } from '../common/SortableTable.tsx';
import type { StatTable } from '../../shared/types.ts';

export default function Stats() {
  const [lists, setLists] = useState<Lists | null>(null);
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
    api.lists().then(setLists).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    api
      .stats(player ? Number(player) : undefined, opponent ? Number(opponent) : undefined)
      .then(setTables)
      .catch((e) => setErr(String(e.message ?? e)));
  }, [player, opponent]);

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/">游戏</Link> / <Link to="/cs2">CS2 单挑</Link> / 统计
      </div>
      <div className="bar">
        <h1>统计</h1>
        <span className="spacer" />
        <Link to="/cs2">对局记录</Link>
      </div>
      {err && <p className="err">{err}</p>}

      <div className="row" style={{ marginBottom: 20 }}>
        <label className="field">
          玩家
          <select value={player} onChange={(e) => set('player', e.target.value)}>
            <option value="">（选择玩家）</option>
            {lists?.players.map((p) => (
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
            {lists?.players
              .filter((p) => String(p.id) !== player)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
      </div>

      {!player && <p className="muted">选一个玩家。</p>}
      {player && tables?.map((t) => <StatTableView key={t.key} table={t} />)}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Lists } from '../common/api.ts';
import { Card, TopBar } from '../common/Card.tsx';
import { StatTableView } from '../common/SortableTable.tsx';
import type { StatTable } from '../../shared/types.ts';

/** 左边的项目列表：没有 group 的平铺，有 group 的归到那一组下面 */
function navGroups(tables: StatTable[]) {
  const groups: { name?: string; items: StatTable[] }[] = [];
  for (const t of tables) {
    const last = groups[groups.length - 1];
    if (t.group) {
      if (last && last.name === t.group) last.items.push(t);
      else groups.push({ name: t.group, items: [t] });
    } else {
      groups.push({ items: [t] });
    }
  }
  return groups;
}

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

  const current = params.get('stat') ?? tables?.[0]?.key ?? '';
  const groups = useMemo(() => navGroups(tables ?? []), [tables]);
  const shown = tables?.find((t) => t.key === current) ?? tables?.[0];

  return (
    <div className="page">
      <TopBar current="stats" />
      {err && <p className="err">{err}</p>}

      <div className="cols">
        <Card flush>
          <ul className="navlist">
            {groups.map((g, gi) => (
              <li key={gi}>
                {g.name && <div className="group">{g.name}</div>}
                <ul className="navlist" style={{ padding: 0 }}>
                  {g.items.map((t) => (
                    <li key={t.key} className={g.name ? 'sub' : ''}>
                      <button
                        className={shown?.key === t.key ? 'on' : ''}
                        onClick={() => set('stat', t.key)}
                      >
                        {t.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>

        <div>
          <Card title="筛选">
            <div className="fields">
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
          </Card>

          {!player && <p className="muted" style={{ marginTop: 16 }}>选一个玩家。</p>}
          {player && shown && (
            <div style={{ marginTop: 16 }}>
              <StatTableView key={shown.key} table={shown} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

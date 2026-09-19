import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { crash } from '../common/api.ts';
import { Card, TopBar } from '../common/Card.tsx';
import { StatBoard } from '../common/StatBoard.tsx';
import type { Player, StatTable } from '../../shared/types.ts';

/** 规则之间的数值口径不一样，默认看最新的那套 */
const DEFAULT_RULE = 'bp2';

export default function Stats() {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [rules, setRules] = useState<{ key: string; label: string }[]>([]);
  const [colors, setColors] = useState<Map<number, string>>(new Map());
  const [params, setParams] = useSearchParams();
  const [tables, setTables] = useState<StatTable[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const player = params.get('player') ?? '';
  const rule = params.get('rule') ?? DEFAULT_RULE;

  const put = (key: string, value: string, dropWhen: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== dropWhen) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    crash
      .lists()
      .then((l) => {
        setPlayers(l.players);
        setRules(l.rules.map((r) => ({ key: r.key, label: r.label })));
        setColors(new Map(l.roles.map((r) => [r.id, `#${r.color}`])));
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, []);

  useEffect(() => {
    crash
      .stats(player ? Number(player) : undefined, rule)
      .then(setTables)
      .catch((e) => setErr(String(e.message ?? e)));
  }, [player, rule]);

  return (
    <div className="page">
      <TopBar game="crash" name="Crash" current="stats" />
      {err && <p className="err">{err}</p>}
      <StatBoard tables={tables} colorOf={(id) => colors.get(id)}>
        <Card title="筛选">
          <div className="fields">
            <label className="field">
              规则
              <select value={rule} onChange={(e) => put('rule', e.target.value, DEFAULT_RULE)}>
                {rules.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              玩家
              <select value={player} onChange={(e) => put('player', e.target.value, '')}>
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

import { useEffect, useMemo, useState } from 'react';
import { api, type StatTable, type StatValue } from '../api.ts';
import { useGame } from '../GameLayout.tsx';
import { Card, Empty, cx, inputCls } from '../ui.tsx';

const fmtValue = (v: StatValue, ratio: boolean) => {
  if (v.den === 0) return '—';
  if (!ratio) return Number.isInteger(v.value) ? String(v.value) : v.value.toFixed(2);
  return `${(v.value * 100).toFixed(1)}%`;
};

export default function Stats() {
  const { bundle } = useGame();
  const slug = bundle.game.slug;
  const [recipe, setRecipe] = useState(bundle.presets[0]?.key ?? '');
  const [ruleset, setRuleset] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [table, setTable] = useState<StatTable | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recipe) return;
    const params: Record<string, string> = { recipe };
    if (ruleset) params.ruleset = ruleset;
    if (from) params.from = from;
    if (to) params.to = to;
    setTable(null);
    api
      .stats(slug, params)
      .then((r) => {
        setTable(r.tables[0] ?? null);
        setError(null);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [slug, recipe, ruleset, from, to]);

  const preset = useMemo(() => bundle.presets.find((p) => p.key === recipe), [bundle.presets, recipe]);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card title="统计表">
        <ul className="grid gap-0.5">
          {bundle.presets.map((p) => (
            <li key={p.key}>
              <button
                onClick={() => setRecipe(p.key)}
                className={cx(
                  'w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition',
                  recipe === p.key ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700/60',
                )}
              >
                {p.title}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4">
        <Card title="过滤">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">BP 规则</span>
              <select className={inputCls} value={ruleset} onChange={(e) => setRuleset(e.target.value)}>
                <option value="">全部规则</option>
                {bundle.rulesets.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">起</span>
              <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-slate-400">止</span>
              <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
        </Card>

        <Card title={table?.title ?? preset?.title ?? '统计'}>
          {error && <p className="text-xs text-rose-300">{error}</p>}
          {!table && !error && <Empty>加载中…</Empty>}
          {table && table.rows.length === 0 && <Empty>还没有数据。先录几场对局。</Empty>}
          {table && table.rows.length > 0 && (
            <>
              <div className="mb-2 text-[11px] text-slate-500">{table.rows.length} 行</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] text-slate-500">
                      {table.columns.map((c) => (
                        <th key={c.key} className="py-1 pr-3 font-normal">
                          {c.label}
                        </th>
                      ))}
                      {table.metricCols.map((m) => (
                        <th key={m.key} className="py-1 pr-3 text-right font-normal">
                          {m.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/40">
                    {table.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        {r.keys.map((k, j) => (
                          <td key={j} className="py-1.5 pr-3 text-slate-200">
                            {k}
                          </td>
                        ))}
                        {r.values.map((v, j) => (
                          <td key={j} className="py-1.5 pr-3 text-right font-mono">
                            <span className={v.den === 0 ? 'text-slate-600' : 'text-slate-100'}>
                              {fmtValue(v, table.metricCols[j].ratio)}
                            </span>
                            <span className="ml-2 text-[10px] text-slate-500">
                              {v.num}/{v.den}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

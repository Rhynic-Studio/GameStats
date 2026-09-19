import { useMemo, useState } from 'react';
import type { Cell, StatTable } from '../../shared/types.ts';

/** 点列头排序。名单类的列按内部 id 排，数字类的列按数值排。 */
export function StatTableView({ table }: { table: StatTable }) {
  const [sortKey, setSortKey] = useState(table.columns[0].key);
  const [desc, setDesc] = useState(false);

  const rows = useMemo(() => {
    const rank = (c: Cell | undefined) => (typeof c === 'number' ? c : c === null || c === undefined ? -1 : c.id);
    return [...table.rows].sort((x, y) => {
      const a = rank(x[sortKey]);
      const b = rank(y[sortKey]);
      return desc ? b - a : a - b;
    });
  }, [table, sortKey, desc]);

  const click = (key: string) => {
    if (key === sortKey) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(false);
    }
  };

  const text = (c: Cell | undefined, kind: string) => {
    if (c === undefined || c === null) return '—';
    if (typeof c === 'number') return kind === 'percent' ? `${(c * 100).toFixed(1)}%` : String(c);
    return c.name;
  };

  return (
    <section>
      {table.group && <h2>{table.group}</h2>}
      {table.group ? <h3>{table.title}</h3> : <h2>{table.title}</h2>}
      <table>
        <thead>
          <tr>
            {table.columns.map((c) => (
              <th key={c.key} className={c.kind === 'list' ? '' : 'num'} onClick={() => click(c.key)}>
                {c.label}
                {sortKey === c.key ? (desc ? ' ▼' : ' ▲') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {table.columns.map((c) => (
                <td key={c.key} className={c.kind === 'list' ? '' : 'num'}>
                  {text(r[c.key], c.kind)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

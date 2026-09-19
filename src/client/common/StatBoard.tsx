import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Cell, GridTable, MatrixTable, StatTable } from '../../shared/types.ts';
import { Card } from './Card.tsx';

/* ---------------- 网格表 ---------------- */

function GridView({ table }: { table: GridTable }) {
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
    <Card title={table.title} flush>
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
    </Card>
  );
}

/* ---------------- 矩阵 ---------------- */

function MatrixView({ table, colorOf }: { table: MatrixTable; colorOf?: (id: number) => string | undefined }) {
  return (
    <Card title={table.title} flush>
      <div className="scroll-x">
        <table className="matrix">
          <thead>
            <tr>
              <th className="plain sticky-col">{table.rowHeader}</th>
              {table.cols.map((c) => (
                <th key={c.id} className="num" style={{ color: colorOf?.(c.id) }}>
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.id}>
                <td className="sticky-col" style={{ color: colorOf?.(r.id) }}>
                  {r.name}
                </td>
                {r.cells.map((v, i) => (
                  <td key={i} className="num">
                    {v === null ? <span className="muted">—</span> : `${(v * 100).toFixed(0)}%`}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function TableView({ table, colorOf }: { table: StatTable; colorOf?: (id: number) => string | undefined }) {
  return table.kind === 'matrix' ? <MatrixView table={table} colorOf={colorOf} /> : <GridView table={table} />;
}

/* ---------------- 双栏版面 ---------------- */

export function StatBoard({
  tables,
  children,
  empty,
  colorOf,
}: {
  tables: StatTable[] | null;
  children?: ReactNode;
  empty?: ReactNode;
  colorOf?: (id: number) => string | undefined;
}) {
  const [params, setParams] = useSearchParams();

  const navs = useMemo(() => {
    const out: { key: string; group?: string; label: string }[] = [];
    for (const t of tables ?? []) {
      if (!out.some((n) => n.key === t.navKey)) {
        out.push({ key: t.navKey, group: t.navGroup, label: t.navLabel });
      }
    }
    return out;
  }, [tables]);

  const current = params.get('stat') ?? navs[0]?.key ?? '';
  const shown = (tables ?? []).filter((t) => t.navKey === current);

  const click = (key: string) => {
    const next = new URLSearchParams(params);
    next.set('stat', key);
    setParams(next, { replace: true });
  };

  return (
    <div className="cols">
      <Card flush>
        <ul className="navlist">
          {navs.map((n, i) => (
            <li key={n.key}>
              {n.group && navs[i - 1]?.group !== n.group && <div className="group">{n.group}</div>}
              <ul className="navlist" style={{ padding: 0 }}>
                <li className={n.group ? 'sub' : ''}>
                  <button className={current === n.key ? 'on' : ''} onClick={() => click(n.key)}>
                    {n.label}
                  </button>
                </li>
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <div>
        {children}
        {empty}
        {!empty && (
          <div style={{ marginTop: 16 }}>
            {shown.map((t, i) => (
              <div key={i} style={{ marginTop: i === 0 ? 0 : 16 }}>
                <TableView table={t} colorOf={colorOf} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

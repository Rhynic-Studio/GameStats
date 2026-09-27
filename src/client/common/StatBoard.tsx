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
    const cmp = (x: Record<string, Cell>, y: Record<string, Cell>) => {
      const a = rank(x[sortKey]);
      const b = rank(y[sortKey]);
      return desc ? b - a : a - b;
    };
    const source = table.rows;
    if (!table.groupBy) return [...source].sort(cmp);

    // 分组的表：同一块的行是一个整体。
    // 按分组列排 → 整块一起动；按别的列排 → 只调整块内顺序，块之间不动。
    const key = (r: Record<string, Cell>) => {
      const c = r[table.groupBy as string];
      return c !== null && typeof c === 'object' ? String(c.id) : String(c);
    };
    const blocks = new Map<string, Record<string, Cell>[]>();
    for (const r of source) {
      const k = key(r);
      const g = blocks.get(k);
      if (g) g.push(r);
      else blocks.set(k, [r]);
    }
    const list = [...blocks.values()];
    if (sortKey === table.groupBy) {
      list.sort((x, y) => cmp(x[0], y[0]));
      return list.flat();
    }
    for (const g of list) g.sort(cmp);
    return list.flat();
  }, [table, sortKey, desc]);

  // 分组列只在每块第一行写名字，其余留空
  const grouped = (r: Record<string, Cell>, i: number) => {
    if (!table.groupBy || i === 0) return false;
    const prev = rows[i - 1][table.groupBy as string];
    const cur = r[table.groupBy as string];
    const id = (c: Cell | undefined) => (c !== null && typeof c === 'object' ? c.id : c);
    return id(prev) === id(cur);
  };

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
            <tr key={i} className={table.groupBy && i > 0 && !grouped(r, i) ? 'group-start' : ''}>
              {table.columns.map((c) => {
                const isGroupCol = table.groupBy === c.key;
                return (
                  <td
                    key={c.key}
                    className={[c.kind === 'list' ? '' : 'num', isGroupCol ? 'group-cell' : '']
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {grouped(r, i) && isGroupCol ? '' : text(r[c.key], c.kind)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ---------------- 矩阵 ---------------- */

function MatrixView({ table, colorOf }: { table: MatrixTable; colorOf?: (id: number) => string | undefined }) {
  const [open, setOpen] = useState<{ r: number; c: number } | null>(null);
  const drill = table.drill;
  const key = open === null ? '' : `${table.rows[open.r].id}:${table.cols[open.c].id}`;
  const detail = drill && open !== null ? drill.cells[key] : undefined;

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
            {table.rows.map((r, ri) => (
              <tr key={r.id}>
                <td className="sticky-col" style={{ color: colorOf?.(r.id) }}>
                  {r.name}
                </td>
                {r.cells.map((v, ci) => {
                  const canOpen = drill !== undefined && drill.cells[`${r.id}:${table.cols[ci].id}`] !== undefined;
                  const here = open?.r === ri && open?.c === ci;
                  return (
                    <td
                      key={ci}
                      className={`num${canOpen ? ' drillable' : ''}${here ? ' open' : ''}`}
                      onClick={canOpen ? () => setOpen(here ? null : { r: ri, c: ci }) : undefined}
                    >
                      {v === null ? <span className="muted">—</span> : `${(v * 100).toFixed(0)}%`}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {drill && open !== null && (
        <div className="drill">
          <div className="drill-head">
            <b>
              {table.rows[open.r].name} × {table.cols[open.c].name}
            </b>
            <span className="muted small">{drill.label}</span>
            <button className="quiet" onClick={() => setOpen(null)}>
              收起
            </button>
          </div>
          {detail === undefined ? (
            <p className="muted small">这两个没打过。</p>
          ) : (
            <table className="matrix">
              <thead>
                <tr>
                  <th className="plain sticky-col">{table.cols[open.c].name}</th>
                  {drill.colLabels.map((l) => (
                    <th key={l} className="num">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.map((row, i) => (
                  <tr key={i}>
                    <td className="sticky-col">{drill.rowLabels[i]}</td>
                    {row.map((cell, j) => (
                      <td key={j} className="num" title={cell.n === 0 ? undefined : `${cell.n} 小局`}>
                        {cell.rate === null ? (
                          <span className="muted">·</span>
                        ) : (
                          `${(cell.rate * 100).toFixed(0)}%`
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
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

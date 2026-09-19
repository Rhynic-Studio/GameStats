import type { ReactNode } from 'react';

export function Card({
  title,
  actions,
  children,
  flush,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-head">
          {title && <span className="card-title">{title}</span>}
          <span className="spacer" />
          {actions && <span className="actions">{actions}</span>}
        </header>
      )}
      <div className={flush ? 'card-body flush' : 'card-body'}>{children}</div>
    </section>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <div className="crumbs">
      {items.map((c, i) => (
        <span key={i}>
          {i > 0 && <span className="sep">/</span>}
          {c.to ? <a href={c.to}>{c.label}</a> : c.label}
        </span>
      ))}
    </div>
  );
}

export function TopBar({ current }: { current: 'list' | 'stats' }) {
  return (
    <div className="topbar">
      <div className="crumbs">
        <a href="/">游戏</a>
        <span className="sep">/</span>
        CS2 单挑
      </div>
      <nav>
        {current === 'list' ? <span>对局记录</span> : <a href="/cs2">对局记录</a>}
        {current === 'stats' ? <span>统计</span> : <a href="/cs2/stats">统计</a>}
      </nav>
    </div>
  );
}

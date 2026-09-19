import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

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
          {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
        </span>
      ))}
    </div>
  );
}

export function TopBar({
  game,
  name,
  current,
}: {
  game: string;
  name: string;
  current: "list" | "stats";
}) {
  return (
    <div className="topbar">
      <div className="crumbs">
        <Link to="/">游戏</Link>
        <span className="sep">/</span>
        {name}
      </div>
      <nav>
        {current === "list" ? <span>对局记录</span> : <Link to={`/${game}`}>对局记录</Link>}
        {current === "stats" ? <span>统计</span> : <Link to={`/${game}/stats`}>统计</Link>}
      </nav>
    </div>
  );
}

/** 就地确认的删除按钮，不弹系统对话框 */
export function DeleteButton({ onConfirm }: { onConfirm: () => void | Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button className="quiet danger" onClick={() => setAsking(true)}>
        删除
      </button>
    );
  }

  return (
    <span className="confirm">
      <span className="muted small">确定删掉？</span>
      <button
        className="danger-solid"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
          }
        }}
      >
        删除
      </button>
      <button className="quiet" disabled={busy} onClick={() => setAsking(false)}>
        取消
      </button>
    </span>
  );
}

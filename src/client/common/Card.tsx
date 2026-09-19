import { useState, type ReactNode } from 'react';

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
        <a href="/">游戏</a>
        <span className="sep">/</span>
        {name}
      </div>
      <nav>
        {current === "list" ? <span>对局记录</span> : <a href={`/${game}`}>对局记录</a>}
        {current === "stats" ? <span>统计</span> : <a href={`/${game}/stats`}>统计</a>}
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

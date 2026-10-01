import { useLayoutEffect, useRef, useState, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Me } from './me.tsx';

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
    <div className="topline">
      <div className="crumbs">
        {items.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="sep">/</span>}
            {c.to ? <Link to={c.to}>{c.label}</Link> : c.label}
          </span>
        ))}
      </div>
      <Me />
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
      <Me />
    </div>
  );
}

/**
 * 备注、评论这种长度说不准的地方用的文本框：起手就有 rows 行那么高，
 * 写多了跟着长，长到 maxRows 行封顶，再多就在框里自己滚。
 */
export function GrowText({
  value,
  onChange,
  rows = 4,
  maxRows = 10,
  className,
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  maxRows?: number;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'rows' | 'className'>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 20;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const edge = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);

    // 高度按 border-box 算，而 scrollHeight 只到 padding 为止，边框得自己补回来
    const min = rows * line + pad + edge;
    const max = maxRows * line + pad + edge;

    el.style.height = 'auto';
    const want = Math.max(min, el.scrollHeight + edge);
    el.style.height = `${Math.min(want, max)}px`;
    el.style.overflowY = want > max ? 'auto' : 'hidden';
  }, [value, rows, maxRows]);

  return (
    <textarea
      ref={ref}
      className={className ? `grow ${className}` : 'grow'}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

/** 就地确认的删除按钮，不弹系统对话框 */
export function DeleteButton({
  onConfirm,
  className = 'quiet danger',
}: {
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <button className={className} onClick={() => setAsking(true)}>
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

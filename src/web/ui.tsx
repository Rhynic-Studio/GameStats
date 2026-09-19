import type { ReactNode } from 'react';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export function Card({ title, right, children }: { title?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-4">
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && <h3 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h3>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  const styles = {
    default: 'border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-100',
    primary: 'border-sky-500 bg-sky-600 hover:bg-sky-500 text-white',
    ghost: 'border-transparent bg-transparent hover:bg-slate-700/60 text-slate-300',
    danger: 'border-rose-700 bg-rose-900/60 hover:bg-rose-800 text-rose-100',
  }[variant];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'rounded-lg border px-3 py-1.5 text-xs transition disabled:cursor-not-allowed disabled:opacity-40',
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'sky' | 'amber' | 'rose' | 'green' | 'violet' }) {
  const tones = {
    slate: 'bg-slate-700/60 text-slate-200 border-slate-600',
    sky: 'bg-sky-900/60 text-sky-200 border-sky-700',
    amber: 'bg-amber-900/50 text-amber-200 border-amber-700',
    rose: 'bg-rose-900/50 text-rose-200 border-rose-700',
    green: 'bg-emerald-900/50 text-emerald-200 border-emerald-700',
    violet: 'bg-violet-900/50 text-violet-200 border-violet-700',
  }[tone];
  return <span className={cx('rounded-md border px-1.5 py-0.5 text-[11px] leading-none', tones)}>{children}</span>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'rounded-lg border border-slate-600 bg-slate-800/80 px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500';

export function Saved({ state }: { state: 'idle' | 'saving' | 'saved' | 'error'; }) {
  if (state === 'idle') return null;
  const map = {
    saving: ['text-slate-400', '保存中…'],
    saved: ['text-emerald-400', '已保存'],
    error: ['text-rose-400', '保存失败'],
  } as const;
  const [cls, text] = map[state as 'saving' | 'saved' | 'error'];
  return <span className={cx('text-[11px]', cls)}>{text}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-xs text-slate-500">{children}</p>;
}

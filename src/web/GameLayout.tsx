import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, type GameBundle } from './api.ts';
import { cx } from './ui.tsx';

const Ctx = createContext<{ bundle: GameBundle; reload: () => Promise<void> } | null>(null);

export function useGame() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame 必须在 GameLayout 内使用');
  return v;
}

const TABS = [
  { seg: '', label: '概览' },
  { seg: 'history', label: '对局记录' },
  { seg: 'stats', label: '统计' },
  { seg: 'rules', label: '规则' },
  { seg: 'data', label: '角色 / 玩家' },
];

export default function GameLayout() {
  const { game = '' } = useParams();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [bundle, setBundle] = useState<GameBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setBundle(await api.game(game));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [game]);

  useEffect(() => {
    setBundle(null);
    void reload();
  }, [reload]);

  if (error) return <div className="p-8 text-rose-300">加载失败：{error}</div>;
  if (!bundle) return <div className="p-8 text-slate-400">加载中…</div>;

  const label = bundle.game.entityTypes[0]?.label ?? '数据';
  const segs = pathname.split('/').filter(Boolean); // [game, ...rest]
  const rest = segs.slice(1);

  /** 面包屑：最后一项是当前位置，倒数第二项就是「返回」的目标 */
  const crumbs: { label: string; to: string }[] = [
    { label: '游戏', to: '/' },
    { label: bundle.game.name, to: `/${game}` },
  ];
  if (rest[0] === 's' && rest[1]) {
    crumbs.push({ label: '对局记录', to: `/${game}/history` });
    crumbs.push({ label: `对局 #${rest[1]}`, to: `/${game}/s/${rest[1]}` });
  } else if (rest[0] === 'new') {
    crumbs.push({ label: '新建对局', to: `/${game}/new` });
  } else if (rest[0]) {
    const t = TABS.find((x) => x.seg === rest[0]);
    if (t) crumbs.push({ label: t.seg === 'data' ? `${label} / 玩家` : t.label, to: `/${game}/${t.seg}` });
  }
  const parent = crumbs[crumbs.length - 2];
  const current = crumbs[crumbs.length - 1];

  return (
    <Ctx.Provider value={{ bundle, reload }}>
      <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-3 p-4 sm:p-6">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            onClick={() => nav(parent.to)}
            disabled={crumbs.length < 2}
            className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-700/60 disabled:opacity-30"
          >
            ← {parent.label}
          </button>
          <h1 className="text-lg font-semibold text-slate-100">{bundle.game.name}</h1>
          <nav className="ml-auto flex flex-wrap gap-1">
            {TABS.map((t) => (
              <NavLink
                key={t.seg}
                to={t.seg ? `/${game}/${t.seg}` : `/${game}`}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs transition',
                  (rest[0] ?? '') === t.seg ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700/60',
                )}
              >
                {t.seg === 'data' ? `${label} / 玩家` : t.label}
              </NavLink>
            ))}
          </nav>
        </header>

        {rest.length > 0 && (
          <nav className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-700">/</span>}
                {i === crumbs.length - 1 ? (
                  <span className="text-slate-300">{c.label}</span>
                ) : (
                  <Link to={c.to} className="hover:text-slate-300">
                    {c.label}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        )}

        <Outlet />
      </div>
    </Ctx.Provider>
  );
}

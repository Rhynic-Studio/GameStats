import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { login, logout, me } from './api.ts';

/**
 * 站点级的身份：谁登录了，全站共用一份。放在顶层的 Provider 里，
 * 顶栏的那个控件和评论框读的是同一个值 —— 在哪儿登录都一样。
 */
const Ctx = createContext<{ user: string; setUser: (u: string) => void }>({
  user: '',
  setUser: () => {},
});

export function MeProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState('');

  useEffect(() => {
    me()
      .then((r) => setUser(r.user))
      .catch(() => {});
  }, []);

  return <Ctx.Provider value={{ user, setUser }}>{children}</Ctx.Provider>;
}

export const useMe = () => useContext(Ctx);

/** 顶栏右边那个，样子照 movie-pool：没登录就是一个名字框 + 登录按钮，登录后是名字 + 退出 */
export function Me() {
  const { user, setUser } = useMe();
  const [who, setWho] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const enter = async () => {
    if (!who.trim()) return;
    try {
      setUser((await login(who.trim())).user);
      setWho('');
      setErr(null);
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  };

  if (user) {
    return (
      <span className="me">
        <span className="who" title="当前身份">
          {user}
        </span>
        <button
          className="quiet"
          onClick={async () => {
            await logout().catch(() => {});
            setUser('');
          }}
        >
          退出
        </button>
      </span>
    );
  }

  return (
    <form
      className="me login"
      onSubmit={(e) => {
        e.preventDefault();
        void enter();
      }}
    >
      {err && <span className="err small">{err}</span>}
      <input
        value={who}
        maxLength={24}
        placeholder="你的名字"
        autoComplete="off"
        onChange={(e) => setWho(e.target.value)}
      />
      <button className="primary" disabled={!who.trim()}>
        登录
      </button>
    </form>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Card, DeleteButton, GrowText } from './Card.tsx';
import { comments as api } from './api.ts';
import { useMe } from './me.tsx';
import { md } from './markdown.ts';
import type { Comment } from '../../shared/types.ts';

const ANON = '匿名';
const author = (c: Comment) => c.user || ANON;

function stamp(c: Comment): string {
  const d = new Date(c.createdAt);
  const p = (n: number) => String(n).padStart(2, '0');
  const at = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return c.editedAt ? `${at} · 已编辑` : at;
}

interface Ctx {
  items: Comment[];
  user: string;
  editing: { id: number; body: string } | null;
  setEditing: (v: { id: number; body: string } | null) => void;
  replyTo: number | null;
  openReply: (c: Comment) => void;
  closeReply: () => void;
  replyBody: string;
  setReplyBody: (v: string) => void;
  reply: (parent: number) => void;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}

/** 定义在组件外面 —— 写成里层组件的话每次 render 都是新类型，React 会整棵重挂，输入框一直丢焦点 */
function Row({ c, ctx }: { c: Comment; ctx: Ctx }) {
  const kids = ctx.items.filter((x) => (x.parentId ?? null) === c.id);
  const mine = !!ctx.user && c.user === ctx.user;
  // 匿名的谁都能清，署了名的只有本人能动
  const removable = !!ctx.user && (c.user === '' || c.user === ctx.user);
  const isEditing = ctx.editing?.id === c.id;

  return (
    <div className="cmt">
      <div className="cmt-head">
        <span className="cmt-user">{author(c)}</span>
        <span className="cmt-time">{stamp(c)}</span>
        <span className="spacer" />
        <button className="cmt-act" onClick={() => ctx.openReply(c)}>
          回复
        </button>
        {mine && !isEditing && (
          <button
            className="cmt-act"
            onClick={() => {
              ctx.closeReply();
              ctx.setEditing({ id: c.id, body: c.body });
            }}
          >
            编辑
          </button>
        )}
        {removable && !isEditing && (
          <DeleteButton className="cmt-act danger" onConfirm={() => ctx.run(() => api.remove(c.id))} />
        )}
      </div>

      {isEditing ? (
        <div className="cmt-form">
          <GrowText value={ctx.editing!.body} onChange={(body) => ctx.setEditing({ id: c.id, body })} rows={3} maxRows={12} />
          <div className="cmt-foot">
            <button className="quiet" onClick={() => ctx.setEditing(null)}>
              取消
            </button>
            <button
              className="primary"
              disabled={!ctx.editing!.body.trim()}
              onClick={() =>
                ctx.run(async () => {
                  await api.edit(c.id, ctx.editing!.body);
                  ctx.setEditing(null);
                })
              }
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="cmt-body" dangerouslySetInnerHTML={{ __html: md(c.body) }} />
      )}

      {ctx.replyTo === c.id && (
        <div className="cmt-form">
          <GrowText value={ctx.replyBody} onChange={ctx.setReplyBody} rows={3} maxRows={12} />
          <div className="cmt-foot">
            <button className="quiet" onClick={ctx.closeReply}>
              取消
            </button>
            <button className="primary" disabled={!ctx.replyBody.trim()} onClick={() => ctx.reply(c.id)}>
              回复
            </button>
          </div>
        </div>
      )}

      {kids.length > 0 && (
        <div className="cmt-replies">
          {kids.map((k) => (
            <Row key={k.id} c={k} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Comments({ game, matchId }: { game: string; matchId: number }) {
  const { user } = useMe();
  const [items, setItems] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(() => api.list(game, matchId).then(setItems), [game, matchId]);

  useEffect(() => {
    reload().catch((e) => setErr(String(e.message ?? e)));
  }, [reload]);

  /** 改完都要重新拉一次列表 —— 排序、编辑时间、还有别人的新评论都以服务端为准 */
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  };

  const post = () =>
    run(async () => {
      await api.add(game, matchId, draft);
      setDraft('');
    });

  const ctx: Ctx = {
    items,
    user,
    editing,
    setEditing,
    replyTo,
    openReply: (c) => {
      setEditing(null);
      setReplyBody('');
      setReplyTo((cur) => (cur === c.id ? null : c.id));
    },
    closeReply: () => setReplyTo(null),
    replyBody,
    setReplyBody,
    reply: (parent) =>
      run(async () => {
        await api.add(game, matchId, replyBody, parent);
        setReplyBody('');
        setReplyTo(null);
      }),
    run,
  };

  return (
    <Card title={`评论（${items.length}）`}>
      {items.length > 0 && (
        <div className="comments">
          {items
            .filter((c) => c.parentId === null)
            .map((c) => (
              <Row key={c.id} c={c} ctx={ctx} />
            ))}
        </div>
      )}

      <div className="cmt-compose">
        <GrowText
          value={draft}
          onChange={setDraft}
          rows={4}
          maxRows={14}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim()) void post();
          }}
        />
        <div className="cmt-foot">
          <span className="cmt-as">{user || ANON}</span>
          <button className="primary" disabled={!draft.trim()} onClick={post}>
            发表
          </button>
        </div>
      </div>

      {err && <p className="err small">{err}</p>}
    </Card>
  );
}

import { db } from './db.ts';
import type { Comment } from '../shared/types.ts';

const MAX_USER = 24;
const MAX_BODY = 2000;

/** 登录时自己写的那个名字，只做去空白和长度限制 —— 它是自称，不是账号 */
export function cleanUser(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) throw new Error('id 不能是空的');
  if (s.length > MAX_USER) throw new Error(`id 最多 ${MAX_USER} 个字`);
  return s;
}

function cleanBody(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) throw new Error('评论不能是空的');
  if (s.length > MAX_BODY) throw new Error(`评论最多 ${MAX_BODY} 个字`);
  return s;
}

export function listComments(game: string, matchId: number): Comment[] {
  return db()
    .prepare(
      `SELECT id, parent_id AS parentId, user, body, created_at AS createdAt, edited_at AS editedAt
         FROM comments
        WHERE game = ? AND match_id = ?
        ORDER BY id`,
    )
    .all(game, matchId) as unknown as Comment[];
}

/** 回复只能回到本场里真实存在的某一条上，否则 parent_id 指到别的场次去了 */
function checkParent(game: string, matchId: number, parent: unknown): number | null {
  if (parent === null || parent === undefined || parent === '') return null;
  const id = Number(parent);
  const row = db().prepare(`SELECT id FROM comments WHERE id = ? AND game = ? AND match_id = ?`).get(id, game, matchId);
  if (!row) throw new Error('要回复的那条评论不在了');
  return id;
}

export function addComment(
  game: string,
  matchId: number,
  parent: unknown,
  user: string,
  body: unknown,
): number {
  const parentId = checkParent(game, matchId, parent);
  const r = db()
    .prepare(`INSERT INTO comments (game, match_id, parent_id, user, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(game, matchId, parentId, user, cleanBody(body), new Date().toISOString());
  return Number(r.lastInsertRowid);
}

export function editComment(id: number, user: string, body: unknown): void {
  const r = db()
    .prepare(`UPDATE comments SET body = ?, edited_at = ? WHERE id = ? AND user = ?`)
    .run(cleanBody(body), new Date().toISOString(), id, user);
  if (r.changes === 0) throw new Error('只能改自己的评论');
}

/**
 * 匿名评论没有作者，撂着就没人能清了，所以登录的人可以删它；
 * 署了名的只有本人能删 —— 别人的名字挂在上面的东西，谁也不能替人删。
 *
 * 删的时候连它下面的一串回复一起删掉。
 */
export function removeComment(id: number, by: string): void {
  const d = db();
  const row = d.prepare(`SELECT user FROM comments WHERE id = ?`).get(id) as { user: string } | undefined;
  if (!row) return;
  if (row.user !== '' && row.user !== by) throw new Error('只能删自己的和匿名的');

  const kids = d.prepare(`SELECT id FROM comments WHERE parent_id = ?`);
  const doomed: number[] = [];
  const collect = (pid: number) => {
    doomed.push(pid);
    for (const k of kids.all(pid) as { id: number }[]) collect(k.id);
  };
  collect(id);

  // 倒着删：子行先走，parent_id 上的外键就不会被踩
  const del = d.prepare(`DELETE FROM comments WHERE id = ?`);
  for (const x of doomed.reverse()) del.run(x);
}

export function removeForMatch(game: string, matchId: number): void {
  const d = db();
  // 先把回复关系解开：parent_id 上有外键，父行先没子行还指着它就会报错
  d.prepare(`UPDATE comments SET parent_id = NULL WHERE game = ? AND match_id = ?`).run(game, matchId);
  d.prepare(`DELETE FROM comments WHERE game = ? AND match_id = ?`).run(game, matchId);
}

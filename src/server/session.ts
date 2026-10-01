import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { db } from './db.ts';

const NAME = 'game_stats_user';
const YEAR = 365 * 24 * 60 * 60;

/**
 * 密钥第一次用到时生成一把存进库里。存库不是为了保密（这本来就是个内网可信站点），
 * 是为了进程重启以后已经发出去的 cookie 还认 —— 换成内存里的随机数，重启一次所有人得重新登录。
 */
function secret(): Buffer {
  const d = db();
  const row = d.prepare(`SELECT value FROM site_meta WHERE key = 'cookie_secret'`).get() as
    | { value: string }
    | undefined;
  if (row) return Buffer.from(row.value, 'hex');

  const fresh = randomBytes(32);
  d.prepare(`INSERT INTO site_meta (key, value) VALUES ('cookie_secret', ?)`).run(fresh.toString('hex'));
  return fresh;
}

function mac(user: string): Buffer {
  return createHmac('sha256', secret()).update(user, 'utf8').digest();
}

/** 值 = base64url(名字).base64url(hmac)。签名只拦手改，不拦冒充 —— 这里本来就不防冒充 */
function sign(user: string): string {
  return `${Buffer.from(user, 'utf8').toString('base64url')}.${mac(user).toString('base64url')}`;
}

function verify(token: string): string {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return '';

  const user = Buffer.from(payload, 'base64url').toString('utf8');
  const want = Buffer.from(sig, 'base64url');
  const got = mac(user);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return '';
  return user;
}

export function currentUser(c: Context): string {
  const token = getCookie(c, NAME);
  return token ? verify(token) : '';
}

export function setUser(c: Context, user: string, path: string): void {
  setCookie(c, NAME, sign(user), {
    path: cookiePath(path),
    maxAge: YEAR,
    httpOnly: true,
    sameSite: 'Lax',
  });
}

export function clearUser(c: Context, path: string): void {
  deleteCookie(c, NAME, { path: cookiePath(path) });
}

/** 挂在子路径下时，身份 cookie 只走那道门，不往同一个域名下的邻居那边漏 */
export function cookiePath(prefix: string): string {
  return prefix.replace(/\/+$/, '') || '/';
}

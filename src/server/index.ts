import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { db } from './db.ts';
import * as cs2 from './cs2.ts';
import * as crash from './crash.ts';

const app = new Hono();
const api = new Hono();

api.onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400));

const GAMES = [
  { slug: 'cs2', name: 'CS2 单挑' },
  { slug: 'crash', name: 'Crash' },
];

api.get('/games', (c) => c.json(GAMES));

/* ---------------- cs2 ---------------- */

api.get('/cs2/lists', (c) => c.json(cs2.lists()));
api.get('/cs2/matches', (c) => c.json(cs2.listMatches()));
api.get('/cs2/matches/:id', (c) => {
  const m = cs2.getMatch(Number(c.req.param('id')));
  if (!m) return c.json({ error: '对局不存在' }, 404);
  return c.json(m);
});
api.post('/cs2/matches', async (c) => c.json({ id: cs2.createMatch(await c.req.json()) }));
api.put('/cs2/matches/:id', async (c) => {
  cs2.updateMatch(Number(c.req.param('id')), await c.req.json());
  return c.json({ ok: true });
});
api.delete('/cs2/matches/:id', (c) => {
  cs2.deleteMatch(Number(c.req.param('id')));
  return c.json({ ok: true });
});
api.post('/cs2/players', async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  cs2.ensurePlayer(name);
  return c.json(cs2.lists());
});
api.get('/cs2/stats', (c) => {
  const p = c.req.query('player');
  const o = c.req.query('opponent');
  return c.json(cs2.stats(p ? Number(p) : undefined, o ? Number(o) : undefined));
});

/* ---------------- crash ---------------- */

api.get('/crash/lists', (c) => c.json(crash.lists()));
api.get('/crash/matches', (c) => c.json(crash.listMatches()));
api.get('/crash/matches/:id', (c) => {
  const m = crash.getMatch(Number(c.req.param('id')));
  if (!m) return c.json({ error: '对局不存在' }, 404);
  return c.json(m);
});
api.post('/crash/matches', async (c) => c.json({ id: crash.createMatch(await c.req.json()) }));
api.put('/crash/matches/:id', async (c) => {
  crash.updateMatch(Number(c.req.param('id')), await c.req.json());
  return c.json({ ok: true });
});
api.delete('/crash/matches/:id', (c) => {
  crash.deleteMatch(Number(c.req.param('id')));
  return c.json({ ok: true });
});
api.post('/crash/players', async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  crash.ensurePlayer(name);
  return c.json(crash.lists());
});
api.get('/crash/stats', (c) => {
  const p = c.req.query('player');
  return c.json(crash.stats(p ? Number(p) : undefined, c.req.query('rule') || undefined));
});

app.route('/api', api);

const webRoot = process.env.WEB_ROOT ?? './dist/web';
const indexHtmlPath = join(webRoot, 'index.html');
// 启动时先读一次：路径不对要在这里就炸，不要等第一个请求
readFileSync(indexHtmlPath, 'utf8');
// 之后每次请求再读一遍 —— 文件很小，省得前端重新构建后忘了重启服务
const indexHtml = () => readFileSync(indexHtmlPath, 'utf8');

/**
 * 这个应用可以被挂在任意路径下——根、/game-stats/、甚至同时好几处，
 * 所以前缀按请求算，不是一个进程级配置：
 *
 *   1. 代理剥掉了前缀，就得用 X-Forwarded-Prefix 说一声剥掉的是哪一段；
 *   2. 代理没剥，路径里就带着前缀——第一个游戏路径段之前的部分就是它；
 *   3. 两者都没有才是真·根部署。
 *
 * 兜底留一个 BASE_PATH 环境变量，给「剥了前缀又没法加请求头」的代理用。
 */
function prefixOf(c: { req: { header: (k: string) => string | undefined; url: string } }): string {
  const forwarded = (c.req.header('x-forwarded-prefix') ?? '').trim();
  if (forwarded && forwarded !== '/') {
    return `/${forwarded.replace(/^\/+|\/+$/g, '')}/`;
  }

  const segments = new URL(c.req.url).pathname.split('/').filter(Boolean);
  const at = segments.findIndex((s) => GAMES.some((g) => g.slug === s));
  const before = at === -1 ? segments : segments.slice(0, at);
  if (before.length > 0) return `/${before.join('/')}/`;
  if (at !== -1) return '/';

  const fallback = (process.env.BASE_PATH ?? '').trim();
  return fallback && fallback !== '/' ? `/${fallback.replace(/^\/+|\/+$/g, '')}/` : '/';
}

// 代理没剥前缀时，路径里就带着前缀：/game-stats/api/…、/game-stats/assets/…。
// 把 /api/ 或 /assets/ 之前那一段砍掉重走一遍，于是同一份构建挂在哪个前缀下都行，
// 也不用要求代理必须剥前缀——剥不剥都认。
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const at = Math.max(path.indexOf('/api/'), path.indexOf('/assets/'));
  if (at > 0) {
    const url = new URL(c.req.url);
    url.pathname = path.slice(at);
    return app.fetch(new Request(url, c.req.raw));
  }
  await next();
});

// 没有扩展名的路径当页面请求：返回 index.html，并带上 <base>。
// 资源和前端路由都相对它解析，所以同一份构建挂在哪个前缀下都对。
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api') || extname(path)) {
    await next();
    return;
  }
  return c.html(indexHtml().replace(/<head>/, `<head>\n    <base href="${prefixOf(c)}">`));
});

// 直接刷新深层链接（/前缀/crash）时，页面里的相对资源会被解析成
// /前缀/crash/assets/xxx，这里砍掉 /assets/ 之前的部分再找一次。
app.use(
  '/*',
  serveStatic({
    root: webRoot,
    rewriteRequestPath: (path) => {
      const at = path.indexOf('/assets/');
      return at > 0 ? path.slice(at) : path;
    },
  }),
);

const port = Number(process.env.PORT ?? 8787);
db();
serve({ fetch: app.fetch, port, hostname: process.env.HOST }, (info) => {
  console.log(`http://127.0.0.1:${info.port}`);
});

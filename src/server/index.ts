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

api.get('/games', (c) => c.json([{ slug: 'cs2', name: 'CS2 单挑' }, { slug: 'crash', name: 'Crash' }]));

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
  return c.json(crash.stats(p ? Number(p) : undefined));
});

app.route('/api', api);

const webRoot = process.env.WEB_ROOT ?? './dist/web';
const indexHtml = readFileSync(join(webRoot, 'index.html'), 'utf8');

/**
 * 部署在子路径下时前端要知道前缀。X-Forwarded-Prefix 优先，其次 BASE_PATH。
 * 两个都没有就不注入 <base>：资源本身就是相对路径，跟着地址栏走，
 * 放在任意前缀下都能开——只有直接刷新深层链接时才需要显式配一个。
 */
function prefixOf(c: { req: { header: (k: string) => string | undefined } }): string | null {
  const raw = (c.req.header('x-forwarded-prefix') ?? process.env.BASE_PATH ?? '').trim();
  if (!raw || raw === '/') return null;
  return (raw.startsWith('/') ? raw : `/${raw}`).replace(/\/+$/, '') + '/';
}

// 没有扩展名的路径当页面请求：返回注入了 <base> 的 index.html，
// 这样资源、接口、前端路由都相对这个前缀解析。
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api') || extname(path)) {
    await next();
    return;
  }
  const prefix = prefixOf(c);
  return c.html(prefix ? indexHtml.replace(/<head>/, `<head>\n    <base href="${prefix}">`) : indexHtml);
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

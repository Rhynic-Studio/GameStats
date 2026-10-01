import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { db } from './db.ts';
import * as cs2 from './cs2.ts';
import * as crash from './crash.ts';
import * as comments from './comments.ts';
import { clearUser, currentUser, setUser } from './session.ts';
import { ALL_GAMES } from '../shared/games.ts';

const app = new Hono();
const api = new Hono();

api.onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400));

/**
 * 服务哪些游戏，由 GAMES 环境变量给（逗号分隔的 slug）。
 *
 * **不设这个变量 = 全都服务；设成空串 = 一个都不服务。** 两者不一样：
 * 前者是「没意见」，后者是明确要求全关（nix 那边 enableGames = [] 就是这种）。
 */
function parseGames(raw: string | undefined): string[] {
  const all: string[] = ALL_GAMES.map((g) => g.slug);
  if (raw === undefined) return all;

  const want = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = want.filter((s) => !all.includes(s));
  if (unknown.length > 0) {
    throw new Error(`GAMES 里有不认识的游戏：${unknown.join('、')}（只有 ${all.join('、')}）`);
  }
  // 按配置里给的顺序返回，首页卡片的顺序就跟着它走
  return want;
}

const ENABLED = parseGames(process.env.GAMES);
const on = (slug: string) => ENABLED.includes(slug);

/**
 * 已知的游戏**全部**都要认。前缀推断（prefixOf）靠它判断路径里哪一段是游戏，
 * 被禁用的 slug 也必须算数 —— 否则挂在子路径下时前缀会被多算一段。
 */
const KNOWN_SLUGS: string[] = ALL_GAMES.map((g) => g.slug);

api.get('/games', (c) => c.json(ALL_GAMES.filter((g) => on(g.slug))));

/* ---------------- cs2 ---------------- */

if (on('cs2')) {
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
    const id = Number(c.req.param('id'));
    cs2.deleteMatch(id);
    comments.removeForMatch('cs2', id);
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

}

/* ---------------- crash ---------------- */

if (on('crash')) {
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
    const id = Number(c.req.param('id'));
    crash.deleteMatch(id);
    comments.removeForMatch('crash', id);
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

}

/* ---------------- 登录 ---------------- */

api.get('/me', (c) => c.json({ user: currentUser(c) }));

api.post('/login', async (c) => {
  const user = comments.cleanUser((await c.req.json()).user);
  setUser(c, user, prefixOf(c));
  return c.json({ user });
});

api.post('/logout', (c) => {
  clearUser(c, prefixOf(c));
  return c.json({ user: '' });
});

/* ---------------- 评论 ---------------- */

/** 评论挂在具体某一场上，所以先得确认这个游戏开着 —— 关掉的游戏不该还能发评论进来 */
function gameOf(raw: unknown): string {
  const slug = String(raw ?? '');
  if (!on(slug)) throw new Error(`不认识的游戏：${slug}`);
  return slug;
}

/** 对局没了评论就该跟着没，所以发之前先看这一场在不在 */
const matchExists = (game: string, id: number) =>
  Boolean(game === 'cs2' ? cs2.getMatch(id) : crash.getMatch(id));

api.get('/comments', (c) => {
  const game = gameOf(c.req.query('game'));
  return c.json(comments.listComments(game, Number(c.req.query('match'))));
});

api.post('/comments', async (c) => {
  const { game: slug, match, parent, body } = await c.req.json();
  const game = gameOf(slug);
  const matchId = Number(match);
  if (!matchExists(game, matchId)) return c.json({ error: '对局不存在' }, 404);

  // 没登录就按匿名发：名字留空存着，显示的时候才落成「匿名」。
  // 空名字和任何真名字都不相等，所以匿名的那条谁也编辑不了。
  return c.json({ id: comments.addComment(game, matchId, parent, currentUser(c), body) });
});

api.put('/comments/:id', async (c) => {
  const user = currentUser(c);
  if (!user) return c.json({ error: '先登录' }, 401);

  comments.editComment(Number(c.req.param('id')), user, (await c.req.json()).body);
  return c.json({ ok: true });
});

api.delete('/comments/:id', (c) => {
  const user = currentUser(c);
  if (!user) return c.json({ error: '先登录' }, 401);

  comments.removeComment(Number(c.req.param('id')), user);
  return c.json({ ok: true });
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

  // 接口请求的路径是「前缀 + /api/…」，/api 及其后面都不是前缀的一部分。
  // 不先砍掉的话，根部署下的 /api/login 会被算成挂在 /api/login/ 上。
  const all = new URL(c.req.url).pathname.split('/').filter(Boolean);
  const api = all.indexOf('api');
  const segments = api === -1 ? all : all.slice(0, api);

  const at = segments.findIndex((s) => KNOWN_SLUGS.includes(s));
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

    const req = new Request(url, c.req.raw);
    // 前缀是在这一步砍掉的，后面再想知道「挂在哪儿」就只能靠这行说明。
    // 代理已经说过前缀的情况就不覆盖它。
    if (!req.headers.has('x-forwarded-prefix')) req.headers.set('x-forwarded-prefix', path.slice(0, at));

    return app.fetch(req);
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
  // 顺便把「启用了哪些游戏」也写进去：前端一上来就知道该渲染哪些路由，
  // 不用再问一次接口，也就不会先闪一下空白。
  return c.html(
    indexHtml()
      .replace(/<head>/, `<head>\n    <base href="${prefixOf(c)}">`)
      .replace('</head>', `    <script>window.__GAMES__ = ${JSON.stringify(ENABLED)}</script>\n  </head>`),
  );
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
  // 把启用了哪些游戏也打出来 —— 配成空列表时站点是空的，日志里得看得出来
  console.log(`http://127.0.0.1:${info.port}  games: ${ENABLED.join(',') || '(none)'}`);
});

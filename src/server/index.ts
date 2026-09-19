import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { db } from './db.ts';
import * as cs2 from './cs2.ts';

const app = new Hono();
const api = new Hono();

api.onError((err, c) => c.json({ error: err instanceof Error ? err.message : String(err) }, 400));

api.get('/games', (c) => c.json([{ slug: 'cs2', name: 'CS2 单挑' }]));

api.get('/cs2/lists', (c) => c.json(cs2.lists()));

api.get('/cs2/matches', (c) => c.json(cs2.listMatches()));

api.get('/cs2/matches/:id', (c) => {
  const m = cs2.getMatch(Number(c.req.param('id')));
  if (!m) return c.json({ error: '对局不存在' }, 404);
  return c.json(m);
});

api.post('/cs2/matches', async (c) => {
  const id = cs2.createMatch(await c.req.json());
  return c.json({ id });
});

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

app.route('/api', api);

app.use('/*', serveStatic({ root: './dist/web' }));
app.get('*', serveStatic({ path: './dist/web/index.html' }));

const port = Number(process.env.PORT ?? 8787);
db();
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`http://127.0.0.1:${info.port}`);
});

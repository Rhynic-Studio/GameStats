import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { allGames, getPreset, getPresets, loadGame, readGameConfigFile, saveGame } from './game-loader.ts';
import { db } from './db.ts';
import { buildFacts, type FactFilter } from './facts.ts';
import { computeTable } from '../shared/stats.ts';
import * as repo from './repo.ts';
import type { Side, StatRecipe } from '../shared/types.ts';
import { maxRoundsOf, slotsOf } from '../shared/types.ts';

const app = new Hono();
const api = new Hono();

api.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
});

/* ------------------------------------------------------------------ */
/* 元信息                                                              */
/* ------------------------------------------------------------------ */

api.get('/games', (c) =>
  c.json(
    allGames().map((g) => ({
      slug: g.slug,
      name: g.name,
      tagline: g.tagline,
      entityLabel: g.entityTypes[0]?.label ?? '实体',
    })),
  ),
);

api.get('/g/:game', (c) => {
  const game = loadGame(c.req.param('game'));
  const { seedEntities: _seed, ...def } = game;
  return c.json({
    game: def,
    rulesets: game.rulesets,
    entities: repo.listEntities(game.slug),
    players: repo.listPlayers(game.slug),
    presets: getPresets(game.slug).map((p) => ({ key: p.key, title: p.title, note: p.note, grain: p.grain })),
  });
});

/* ------------------------------------------------------------------ */
/* 游戏配置：整个定义存在库里，界面可以直接改，不碰任何源码文件         */
/* ------------------------------------------------------------------ */

api.get('/g/:game/config', (c) => c.json(loadGame(c.req.param('game'))));

api.put('/g/:game/config', async (c) => {
  const slug = c.req.param('game');
  const cur = loadGame(slug);
  const body = (await c.req.json()) as typeof cur;

  // slug 是路径，不允许改
  const next: typeof cur = { ...cur, ...body, slug: cur.slug };

  if (!Array.isArray(next.rulesets) || next.rulesets.length === 0) throw new Error('至少要有一套规则');
  const keys = new Set<string>();
  for (const rs of next.rulesets) {
    if (!rs.key?.trim()) throw new Error('规则的 key 不能为空');
    if (!rs.label?.trim()) throw new Error(`规则 ${rs.key} 缺名字`);
    if (keys.has(rs.key)) throw new Error(`规则 key 重复: ${rs.key}`);
    keys.add(rs.key);
    for (const s of rs.slots ?? []) {
      if (s.who !== 'first' && s.who !== 'second') throw new Error(`规则 ${rs.key}: 槽位的执行方只能是 first / second`);
      if (s.kind !== 'ban' && s.kind !== 'pick') throw new Error(`规则 ${rs.key}: 槽位类型只能是 ban / pick`);
    }
  }
  if (!keys.has(next.defaultRulesetKey)) throw new Error('默认规则必须存在');

  // 已经有对局在用的规则不能被删掉，否则历史数据解析不出来
  const used = new Set(
    (db().prepare(`SELECT DISTINCT ruleset_key AS k FROM series WHERE game = ?`).all(slug) as any[]).map((r) => r.k),
  );
  const gone = [...used].filter((k) => !keys.has(k));
  if (gone.length) throw new Error(`这些规则还有对局在用，不能删：${gone.join('、')}`);

  saveGame(slug, next);
  return c.json({ ok: true, config: next });
});

/** 把库里的配置丢掉，重新读 games/<slug>/game.json */
api.post('/g/:game/config/reload-from-file', (c) => {
  const slug = c.req.param('game');
  const cfg = readGameConfigFile(slug);
  saveGame(slug, cfg);
  return c.json({ ok: true, config: cfg });
});

/* ------------------------------------------------------------------ */
/* 玩家                                                                */
/* ------------------------------------------------------------------ */

api.post('/g/:game/players', async (c) => {
  const game = loadGame(c.req.param('game'));
  const body = await c.req.json<{ name: string; aliases?: string[] }>();
  repo.ensurePlayer(game.slug, body.name);
  if (body.aliases?.length) {
    db()
      .prepare(`UPDATE players SET aliases = ? WHERE game = ? AND name = ?`)
      .run(repo.joinAliases(body.aliases), game.slug, body.name.trim());
  }
  return c.json({ ok: true, players: repo.listPlayers(game.slug) });
});

api.patch('/g/:game/players/:id', async (c) => {
  const game = loadGame(c.req.param('game'));
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; aliases?: string[]; enabled?: boolean }>();
  const cur = db().prepare(`SELECT * FROM players WHERE id = ?`).get(id) as any;
  if (!cur) return c.json({ error: '玩家不存在' }, 404);
  db()
    .prepare(`UPDATE players SET name = ?, aliases = ?, enabled = ? WHERE id = ?`)
    .run(
      body.name?.trim() || cur.name,
      body.aliases ? repo.joinAliases(body.aliases) : cur.aliases,
      body.enabled === undefined ? cur.enabled : body.enabled ? 1 : 0,
      id,
    );
  return c.json({ ok: true, players: repo.listPlayers(game.slug) });
});

/* ------------------------------------------------------------------ */
/* 实体（角色 / 英雄 / 模式）                                          */
/* ------------------------------------------------------------------ */

api.post('/g/:game/entities', async (c) => {
  const game = loadGame(c.req.param('game'));
  const body = await c.req.json<{ name: string; aliases?: string[] }>();
  const type = game.entityTypes[0]?.key ?? 'default';
  const n = db().prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM entities WHERE game = ?`).get(game.slug) as any;
  db()
    .prepare(`INSERT OR IGNORE INTO entities (game, type, name, aliases, sort) VALUES (?, ?, ?, ?, ?)`)
    .run(game.slug, type, body.name.trim(), repo.joinAliases(body.aliases ?? []), n.n);
  return c.json({ ok: true, entities: repo.listEntities(game.slug) });
});

api.patch('/g/:game/entities/:id', async (c) => {
  const game = loadGame(c.req.param('game'));
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; aliases?: string[]; enabled?: boolean }>();
  const cur = db().prepare(`SELECT * FROM entities WHERE id = ?`).get(id) as any;
  if (!cur) return c.json({ error: '实体不存在' }, 404);
  db()
    .prepare(`UPDATE entities SET name = ?, aliases = ?, enabled = ? WHERE id = ?`)
    .run(
      body.name?.trim() || cur.name,
      body.aliases ? repo.joinAliases(body.aliases) : cur.aliases,
      body.enabled === undefined ? cur.enabled : body.enabled ? 1 : 0,
      id,
    );
  return c.json({ ok: true, entities: repo.listEntities(game.slug) });
});

/* ------------------------------------------------------------------ */
/* 对局                                                                */
/* ------------------------------------------------------------------ */

api.get('/g/:game/series', (c) => c.json(repo.listSeries(c.req.param('game'))));

api.get('/g/:game/series/:id', (c) => {
  const detail = repo.getSeriesDetail(c.req.param('game'), Number(c.req.param('id')));
  if (!detail) return c.json({ error: '对局不存在' }, 404);
  return c.json(detail);
});

api.post('/g/:game/series', async (c) => {
  const game = loadGame(c.req.param('game'));
  const body = await c.req.json<{
    player0: string;
    player1: string;
    bpFirstSide: Side;
    rulesetKey?: string;
    playedAt?: string;
    note?: string;
  }>();
  const rulesetKey = body.rulesetKey ?? game.defaultRulesetKey;
  if (!game.rulesets.some((r) => r.key === rulesetKey)) throw new Error(`未知规则: ${rulesetKey}`);
  if (!body.player0?.trim() || !body.player1?.trim()) throw new Error('两边都要有玩家名');
  if (body.player0.trim() === body.player1.trim()) throw new Error('两边不能是同一个人');

  const p0 = repo.ensurePlayer(game.slug, body.player0);
  const p1 = repo.ensurePlayer(game.slug, body.player1);
  const playedAt = body.playedAt?.trim() || new Date().toISOString().slice(0, 10);
  const res = db()
    .prepare(`INSERT INTO series (game, ruleset_key, played_at, bp_first_side, note) VALUES (?, ?, ?, ?, ?)`)
    .run(game.slug, rulesetKey, playedAt, body.bpFirstSide === 1 ? 1 : 0, body.note ?? '');
  const id = Number(res.lastInsertRowid);
  const ins = db().prepare(`INSERT INTO series_players (series_id, side, player_id) VALUES (?, ?, ?)`);
  ins.run(id, 0, p0);
  ins.run(id, 1, p1);
  return c.json({ ok: true, id, detail: repo.getSeriesDetail(game.slug, id) });
});

api.patch('/g/:game/series/:id', async (c) => {
  const game = loadGame(c.req.param('game'));
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    rulesetKey?: string;
    playedAt?: string;
    bpFirstSide?: Side;
    note?: string;
    player0?: string;
    player1?: string;
  }>();
  const cur = db().prepare(`SELECT * FROM series WHERE id = ? AND game = ?`).get(id, game.slug) as any;
  if (!cur) return c.json({ error: '对局不存在' }, 404);

  if (body.player0 !== undefined || body.player1 !== undefined) {
    const names = [body.player0, body.player1];
    const upd = db().prepare(`UPDATE series_players SET player_id = ? WHERE series_id = ? AND side = ?`);
    names.forEach((n, side) => {
      if (n === undefined) return;
      if (!n.trim()) throw new Error('玩家名不能为空');
      upd.run(repo.ensurePlayer(game.slug, n), id, side);
    });
  }
  db()
    .prepare(`UPDATE series SET ruleset_key = ?, played_at = ?, bp_first_side = ?, note = ? WHERE id = ?`)
    .run(
      body.rulesetKey ?? cur.ruleset_key,
      body.playedAt ?? cur.played_at,
      body.bpFirstSide === undefined ? cur.bp_first_side : body.bpFirstSide === 1 ? 1 : 0,
      body.note ?? cur.note,
      id,
    );
  return c.json({ ok: true, detail: repo.getSeriesDetail(game.slug, id) });
});

api.delete('/g/:game/series/:id', (c) => {
  db().prepare(`DELETE FROM series WHERE id = ? AND game = ?`).run(Number(c.req.param('id')), c.req.param('game'));
  return c.json({ ok: true });
});

/** 进池名单：整体替换，可以只存一部分（对局还没录完） */
api.put('/g/:game/series/:id/pool', async (c) => {
  const game = loadGame(c.req.param('game'));
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ entityIds: number[] }>();
  const detail = repo.getSeriesDetail(game.slug, id);
  if (!detail) return c.json({ error: '对局不存在' }, 404);
  const ids = [...new Set(body.entityIds ?? [])];
  const valid = new Set(repo.listEntities(game.slug).map((e) => e.id));
  for (const e of ids) if (!valid.has(e)) throw new Error(`实体 ${e} 不属于这个游戏`);

  const d = db();
  d.prepare(`DELETE FROM pool WHERE series_id = ?`).run(id);
  const ins = d.prepare(`INSERT INTO pool (series_id, entity_id, seq) VALUES (?, ?, ?)`);
  ids.forEach((e, i) => ins.run(id, e, i));
  // 进池名单变了，BP 里指向"已不在池中"的选择要清掉
  for (const a of detail.draft) if (!ids.includes(a.entityId)) {
    d.prepare(`DELETE FROM draft_actions WHERE series_id = ? AND slot_index = ?`).run(id, a.slotIndex);
  }
  return c.json({ ok: true, detail: repo.getSeriesDetail(game.slug, id) });
});

/** BP 动作：整体替换 */
api.put('/g/:game/series/:id/draft', async (c) => {
  const game = loadGame(c.req.param('game'));
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ actions: { slotIndex: number; entityId: number }[] }>();
  const detail = repo.getSeriesDetail(game.slug, id);
  if (!detail) return c.json({ error: '对局不存在' }, 404);

  const ruleset = detail.ruleset;
  const poolIds = new Set(detail.pool.map((p) => p.entityId));
  const seen = new Set<number>();
  const d = db();
  d.prepare(`DELETE FROM draft_actions WHERE series_id = ?`).run(id);
  const ins = d.prepare(`INSERT INTO draft_actions (series_id, slot_index, entity_id) VALUES (?, ?, ?)`);
  for (const a of body.actions ?? []) {
    const slot = slotsOf(ruleset)[a.slotIndex];
    if (!slot) throw new Error(`槽位 ${a.slotIndex} 不属于规则 ${ruleset.key}`);
    if (!poolIds.has(a.entityId)) throw new Error('只能选进池的角色');
    // 同一角色只能被 ban/pick 一次
    if (seen.has(a.entityId)) throw new Error('同一个角色不能重复 ban/pick');
    seen.add(a.entityId);
    ins.run(id, a.slotIndex, a.entityId);
  }
  return c.json({ ok: true, detail: repo.getSeriesDetail(game.slug, id) });
});

/** 逐轮结果：整体替换 */
api.put('/g/:game/series/:id/rounds', async (c) => {
  const game = loadGame(c.req.param('game'));
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{
    rounds: {
      idx: number;
      initiativeSide: Side | null;
      side0Entity: number | null;
      side1Entity: number | null;
      result: string;
      winKind?: string;
      note?: string;
    }[];
  }>();
  const detail = repo.getSeriesDetail(game.slug, id);
  if (!detail) return c.json({ error: '对局不存在' }, 404);

  const resultKeys = new Set(game.roundResults.map((r) => r.key));
  const maxRounds = maxRoundsOf(detail.ruleset);
  const d = db();
  d.prepare(`DELETE FROM rounds WHERE series_id = ?`).run(id);
  const ins = d.prepare(
    `INSERT INTO rounds (series_id, idx, initiative_side, side0_entity, side1_entity, result, win_kind, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of body.rounds ?? []) {
    if (r.idx < 1 || r.idx > maxRounds) throw new Error(`轮次 ${r.idx} 超出范围（最多 ${maxRounds} 轮）`);
    if (!resultKeys.has(r.result)) throw new Error(`未知结果类型: ${r.result}`);
    ins.run(
      id,
      r.idx,
      r.initiativeSide ?? null,
      r.side0Entity ?? null,
      r.side1Entity ?? null,
      r.result,
      r.winKind ?? '',
      r.note ?? '',
    );
  }
  return c.json({ ok: true, detail: repo.getSeriesDetail(game.slug, id) });
});

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

function factFilter(c: { req: { query: (k: string) => string | undefined } }): FactFilter {
  const f: FactFilter = {};
  const rs = c.req.query('ruleset');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const player = c.req.query('player');
  if (rs) f.ruleset = rs;
  if (from) f.from = from;
  if (to) f.to = to;
  if (player) f.playerId = Number(player);
  return f;
}

const table = (game: string, recipe: StatRecipe, filter: FactFilter) =>
  computeTable(recipe, buildFacts(game, filter));

api.get('/g/:game/stats', (c) => {
  const game = c.req.param('game');
  const filter = factFilter(c);
  const only = c.req.query('recipe');
  const recipes = only ? [getPreset(game, only)] : getPresets(game);
  return c.json({
    tables: recipes.map((r) => table(game, r, filter)),
    filter,
  });
});

api.get('/g/:game/overview', (c) => {
  const game = c.req.param('game');
  const list = repo.listSeries(game);
  const facts = buildFacts(game);
  const concluded = list.filter((s) => s.concluded).length;
  const rounds = facts.round_side.length / 2;
  const entities = repo.listEntities(game);
  const entityIds = new Set(facts.round_side.map((f) => f.entityId));
  return c.json({
    seriesCount: list.length,
    concluded,
    inProgress: list.length - concluded,
    roundCount: rounds,
    playerCount: repo.listPlayers(game).length,
    entityCount: entities.length,
    entitiesNeverPlayed: entities.filter((e) => !entityIds.has(e.id)).map((e) => e.name),
    recent: list.slice(0, 8),
  });
});

app.route('/api', api);

// 生产模式下托管 vite 构建产物
app.use('/*', serveStatic({ root: './dist/web' }));
app.get('*', serveStatic({ path: './dist/web/index.html' }));

const port = Number(process.env.PORT ?? 8787);
db(); // 启动即建表 + 同步规则集
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`battle-stats api  →  http://127.0.0.1:${info.port}`);
});

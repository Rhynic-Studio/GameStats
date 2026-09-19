import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readGameConfigFile, gameSlugs } from './game-loader.ts';

/**
 * 通用内核的存储层。表结构里没有任何具体游戏的字段。
 *
 * **权威性：数据库是唯一权威。**
 * `games/<slug>/game.json` 只在库里还没有这个游戏时导入一次（种子），
 * 之后所有改动都在界面上做，改完可以「导出配置」把当前状态写回 JSON 备份。
 * 所以日常改规则、改角色**不需要碰任何源码文件**。
 */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

/* 游戏定义整块存 JSON —— 规则、结果类型、实体类型都在里面 */
CREATE TABLE IF NOT EXISTS games (
  slug        TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  game       TEXT NOT NULL,
  name       TEXT NOT NULL,
  aliases    TEXT NOT NULL DEFAULT '',
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (game, name)
);

CREATE TABLE IF NOT EXISTS entities (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  game    TEXT NOT NULL,
  type    TEXT NOT NULL,
  name    TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game, type, name)
);

CREATE TABLE IF NOT EXISTS series (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  game          TEXT NOT NULL,
  ruleset_key   TEXT NOT NULL,
  played_at     TEXT NOT NULL,
  bp_first_side INTEGER NOT NULL DEFAULT 0,
  note          TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS series_players (
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  side      INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(id),
  PRIMARY KEY (series_id, side)
);

CREATE TABLE IF NOT EXISTS pool (
  series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL REFERENCES entities(id),
  seq       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series_id, entity_id)
);

CREATE TABLE IF NOT EXISTS draft_actions (
  series_id  INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  entity_id  INTEGER NOT NULL REFERENCES entities(id),
  PRIMARY KEY (series_id, slot_index)
);

CREATE TABLE IF NOT EXISTS rounds (
  series_id       INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  idx             INTEGER NOT NULL,
  initiative_side INTEGER,
  side0_entity    INTEGER REFERENCES entities(id),
  side1_entity    INTEGER REFERENCES entities(id),
  result          TEXT NOT NULL DEFAULT 'pending',
  win_kind        TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (series_id, idx)
);

CREATE INDEX IF NOT EXISTS idx_series_game ON series(game, played_at);
CREATE INDEX IF NOT EXISTS idx_pool_series ON pool(series_id);
CREATE INDEX IF NOT EXISTS idx_draft_series ON draft_actions(series_id);
`;

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  const path = resolve(process.env.DB_PATH ?? 'data/stats.db');
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec(SCHEMA);
  // 早期版本把规则集存在单独的 rulesets 表里，现在整块进 games.config_json
  d.exec(`DROP TABLE IF EXISTS rulesets`);
  seedFromConfig(d);
  _db = d;
  return d;
}

/** 扫描 games/ 目录，把还没有入库的游戏定义导入一次。已存在的一律不动。 */
function seedFromConfig(d: DatabaseSync): void {
  const existing = new Set(
    (d.prepare(`SELECT slug FROM games`).all() as Record<string, any>[]).map((r) => r.slug as string),
  );
  for (const slug of gameSlugs()) {
    if (existing.has(slug)) continue;
    const cfg = readGameConfigFile(slug);
    d.prepare(`INSERT INTO games (slug, config_json) VALUES (?, ?)`).run(slug, JSON.stringify(cfg));
    const type = cfg.entityTypes?.[0]?.key ?? 'default';
    (cfg.seedEntities ?? []).forEach((e, i) => {
      d.prepare(
        `INSERT OR IGNORE INTO entities (game, type, name, aliases, sort) VALUES (?, ?, ?, ?, ?)`,
      ).run(slug, type, e.name, e.aliases ?? '', i);
    });
  }
}

/** 测试用：跑一个内存库 */
export function useMemoryDb(): DatabaseSync {
  const d = new DatabaseSync(':memory:');
  d.exec(SCHEMA);
  seedFromConfig(d);
  _db = d;
  return d;
}

export function writeGameConfig(slug: string, config: unknown): void {
  db()
    .prepare(`UPDATE games SET config_json = ?, updated_at = datetime('now') WHERE slug = ?`)
    .run(JSON.stringify(config), slug);
}

/** 库里的游戏 slug 列表（即当前所有可用的游戏） */
export function dbGameSlugs(): string[] {
  return (db().prepare(`SELECT slug FROM games ORDER BY slug`).all() as Record<string, any>[]).map(
    (r) => r.slug as string,
  );
}

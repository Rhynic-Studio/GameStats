import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL UNIQUE,
  aliases TEXT NOT NULL DEFAULT ''
);

/* 项目：手枪 / 长枪 / 狙击。sort 就是内部顺序 */
CREATE TABLE IF NOT EXISTS cs2_items (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

/* 单挑：手枪单挑 / 长枪单挑 / 狙击单挑 / solo三项 */
CREATE TABLE IF NOT EXISTS cs2_modes (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cs2_matches (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at TEXT NOT NULL,
  player_a  INTEGER NOT NULL REFERENCES players(id),
  player_b  INTEGER NOT NULL REFERENCES players(id),
  mode_id   INTEGER NOT NULL REFERENCES cs2_modes(id),
  note      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cs2_entries (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES cs2_matches(id) ON DELETE CASCADE,
  item_id  INTEGER NOT NULL REFERENCES cs2_items(id),
  score_a  INTEGER NOT NULL,
  score_b  INTEGER NOT NULL,
  seq      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cs2_entries_match ON cs2_entries(match_id);
`;

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  const path = resolve(process.env.DB_PATH ?? 'data/stats.db');
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec(SCHEMA);
  seed(d);
  _db = d;
  return d;
}

function seed(d: DatabaseSync): void {
  const item = d.prepare(`INSERT OR IGNORE INTO cs2_items (name, sort) VALUES (?, ?)`);
  ['手枪', '长枪', '狙击'].forEach((n, i) => item.run(n, i + 1));

  const mode = d.prepare(`INSERT OR IGNORE INTO cs2_modes (name, sort) VALUES (?, ?)`);
  ['手枪单挑', '长枪单挑', '狙击单挑', 'solo三项'].forEach((n, i) => mode.run(n, i + 1));
}

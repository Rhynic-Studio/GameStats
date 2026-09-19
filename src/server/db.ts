import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CS2_SCHEMA = `
CREATE TABLE IF NOT EXISTS cs2_items (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

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

const CRASH_SCHEMA = `
CREATE TABLE IF NOT EXISTS crash_roles (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS crash_matches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at  TEXT NOT NULL,
  player_a   INTEGER NOT NULL REFERENCES players(id),
  player_b   INTEGER NOT NULL REFERENCES players(id),
  rule       TEXT NOT NULL,
  first_side INTEGER NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS crash_pool (
  match_id INTEGER NOT NULL REFERENCES crash_matches(id) ON DELETE CASCADE,
  role_id  INTEGER NOT NULL REFERENCES crash_roles(id),
  seq      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, role_id)
);

CREATE TABLE IF NOT EXISTS crash_draft (
  match_id INTEGER NOT NULL REFERENCES crash_matches(id) ON DELETE CASCADE,
  seq      INTEGER NOT NULL,
  role_id  INTEGER NOT NULL REFERENCES crash_roles(id),
  PRIMARY KEY (match_id, seq)
);

CREATE TABLE IF NOT EXISTS crash_rounds (
  match_id        INTEGER NOT NULL REFERENCES crash_matches(id) ON DELETE CASCADE,
  idx             INTEGER NOT NULL,
  initiative_side INTEGER,
  role_a          INTEGER REFERENCES crash_roles(id),
  role_b          INTEGER REFERENCES crash_roles(id),
  result          TEXT NOT NULL DEFAULT 'pending',
  win_kind        TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (match_id, idx)
);
`;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  name    TEXT NOT NULL UNIQUE,
  aliases TEXT NOT NULL DEFAULT ''
);

`;

const CS2_ITEMS = ['手枪', '长枪', '狙击'];
const CS2_MODES = ['手枪单挑', '长枪单挑', '狙击单挑', 'solo三项'];
const CRASH_ROLES = [
  '艾娅', '拔刀', '冰女', '妮妮', '妮娜', '阿兰', '妖姬',
  '娜吉', '芙芙', '火女', '德鲁伊', '骇客', '怪盗', '商旅',
];

let _db: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (_db) return _db;
  const path = resolve(process.env.DB_PATH ?? 'data/stats.db');
  mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  d.exec(SCHEMA);
  d.exec(CS2_SCHEMA);
  d.exec(CRASH_SCHEMA);

  const item = d.prepare(`INSERT OR IGNORE INTO cs2_items (name, sort) VALUES (?, ?)`);
  CS2_ITEMS.forEach((n, i) => item.run(n, i + 1));
  const mode = d.prepare(`INSERT OR IGNORE INTO cs2_modes (name, sort) VALUES (?, ?)`);
  CS2_MODES.forEach((n, i) => mode.run(n, i + 1));
  const role = d.prepare(`INSERT OR IGNORE INTO crash_roles (name, sort) VALUES (?, ?)`);
  CRASH_ROLES.forEach((n, i) => role.run(n, i + 1));

  _db = d;
  return d;
}

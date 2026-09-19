import { db } from './db.ts';
import type { Entry, MatchDetail, MatchSummary, StatTable, Cell } from '../shared/types.ts';

/**
 * 局数 = 2 × 胜方得分 − 1。
 * 单项 21:19 → 41 局；solo三项 三项总分 27:17 → 53 局。
 */
export const roundsOf = (a: number, b: number) => 2 * Math.max(a, b) - 1;

type Row = Record<string, any>;

interface RawMatch {
  id: number;
  playedAt: string;
  playerA: number;
  playerB: number;
  modeId: number;
  note: string;
  entries: { itemId: number; scoreA: number; scoreB: number }[];
}

const num = (v: unknown) => Number(v);

export function lists() {
  const d = db();
  return {
    items: d.prepare(`SELECT id, name FROM cs2_items ORDER BY sort, id`).all() as Row[],
    modes: d.prepare(`SELECT id, name FROM cs2_modes ORDER BY sort, id`).all() as Row[],
    players: d.prepare(`SELECT id, name FROM players ORDER BY name`).all() as Row[],
  };
}

function totals(entries: { scoreA: number; scoreB: number }[]) {
  const a = entries.reduce((s, e) => s + e.scoreA, 0);
  const b = entries.reduce((s, e) => s + e.scoreB, 0);
  return { a, b };
}

function loadMatches(): RawMatch[] {
  const d = db();
  const matches = d.prepare(`SELECT * FROM cs2_matches ORDER BY played_at DESC, id DESC`).all() as Row[];
  if (matches.length === 0) return [];
  const entries = d.prepare(`SELECT * FROM cs2_entries ORDER BY match_id, seq, id`).all() as Row[];
  const byMatch = new Map<number, RawMatch['entries']>();
  for (const e of entries) {
    const arr = byMatch.get(num(e.match_id)) ?? [];
    arr.push({ itemId: num(e.item_id), scoreA: num(e.score_a), scoreB: num(e.score_b) });
    byMatch.set(num(e.match_id), arr);
  }
  return matches.map((m) => ({
    id: num(m.id),
    playedAt: String(m.played_at),
    playerA: num(m.player_a),
    playerB: num(m.player_b),
    modeId: num(m.mode_id),
    note: String(m.note ?? ''),
    entries: byMatch.get(num(m.id)) ?? [],
  }));
}

function nameMap(table: string) {
  const rows = db().prepare(`SELECT id, name FROM ${table}`).all() as Row[];
  return new Map<number, string>(rows.map((r) => [num(r.id), String(r.name)]));
}

function toSummary(m: RawMatch, playerNames: Map<number, string>, modeNames: Map<number, string>): MatchSummary {
  const t = totals(m.entries);
  return {
    id: m.id,
    playedAt: m.playedAt,
    playerA: { id: m.playerA, name: playerNames.get(m.playerA) ?? '?' },
    playerB: { id: m.playerB, name: playerNames.get(m.playerB) ?? '?' },
    mode: { id: m.modeId, name: modeNames.get(m.modeId) ?? '?' },
    scoreA: t.a,
    scoreB: t.b,
    rounds: roundsOf(t.a, t.b),
    winner: t.a === t.b ? null : t.a > t.b ? 'A' : 'B',
    note: m.note,
  };
}

export function listMatches(): MatchSummary[] {
  const playerNames = nameMap('players');
  const modeNames = nameMap('cs2_modes');
  return loadMatches().map((m) => toSummary(m, playerNames, modeNames));
}

export function getMatch(id: number): MatchDetail | null {
  const m = loadMatches().find((x) => x.id === id);
  if (!m) return null;
  const summary = toSummary(m, nameMap('players'), nameMap('cs2_modes'));
  return { ...summary, entries: m.entries };
}

export function ensurePlayer(name: string): number {
  const n = name.trim();
  if (!n) throw new Error('玩家名不能为空');
  const d = db();
  const found = d.prepare(`SELECT id FROM players WHERE name = ?`).get(n) as Row | undefined;
  if (found) return num(found.id);
  return num(d.prepare(`INSERT INTO players (name) VALUES (?)`).run(n).lastInsertRowid);
}

export function createMatch(body: {
  playedAt?: string;
  playerA: string;
  playerB: string;
  modeId: number;
  note?: string;
  entries: { itemId: number; scoreA: number; scoreB: number }[];
}): number {
  const a = ensurePlayer(body.playerA);
  const b = ensurePlayer(body.playerB);
  if (a === b) throw new Error('两边不能是同一个人');
  const d = db();
  const id = num(
    d
      .prepare(`INSERT INTO cs2_matches (played_at, player_a, player_b, mode_id, note) VALUES (?, ?, ?, ?, ?)`)
      .run(body.playedAt?.trim() || new Date().toISOString().slice(0, 10), a, b, body.modeId, body.note ?? '')
      .lastInsertRowid,
  );
  writeEntries(id, body.entries);
  return id;
}

export function updateMatch(
  id: number,
  body: {
    playedAt?: string;
    playerA?: string;
    playerB?: string;
    modeId?: number;
    note?: string;
    entries?: { itemId: number; scoreA: number; scoreB: number }[];
  },
): void {
  const d = db();
  const cur = d.prepare(`SELECT * FROM cs2_matches WHERE id = ?`).get(id) as Row | undefined;
  if (!cur) throw new Error('对局不存在');
  const a = body.playerA === undefined ? num(cur.player_a) : ensurePlayer(body.playerA);
  const b = body.playerB === undefined ? num(cur.player_b) : ensurePlayer(body.playerB);
  if (a === b) throw new Error('两边不能是同一个人');
  d.prepare(`UPDATE cs2_matches SET played_at = ?, player_a = ?, player_b = ?, mode_id = ?, note = ? WHERE id = ?`).run(
    body.playedAt ?? String(cur.played_at),
    a,
    b,
    body.modeId ?? num(cur.mode_id),
    body.note ?? String(cur.note ?? ''),
    id,
  );
  if (body.entries) {
    d.prepare(`DELETE FROM cs2_entries WHERE match_id = ?`).run(id);
    writeEntries(id, body.entries);
  }
}

function writeEntries(matchId: number, entries: { itemId: number; scoreA: number; scoreB: number }[]): void {
  if (!entries?.length) throw new Error('至少要有一组比分');
  const seen = new Set<number>();
  const ins = db().prepare(`INSERT INTO cs2_entries (match_id, item_id, score_a, score_b, seq) VALUES (?, ?, ?, ?, ?)`);
  entries.forEach((e, i) => {
    if (seen.has(e.itemId)) throw new Error('同一个项目只能出现一次');
    seen.add(e.itemId);
    if (!Number.isFinite(e.scoreA) || !Number.isFinite(e.scoreB) || e.scoreA < 0 || e.scoreB < 0) {
      throw new Error('比分必须是非负整数');
    }
    ins.run(matchId, e.itemId, e.scoreA, e.scoreB, i);
  });
}

export function deleteMatch(id: number): void {
  db().prepare(`DELETE FROM cs2_matches WHERE id = ?`).run(id);
}

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

const list = (id: number, name: string): Cell => ({ id, name });
const rate = (win: number, total: number) => (total === 0 ? null : win / total);

export function stats(playerId?: number, opponentId?: number): StatTable[] {
  const d = db();
  const items = (d.prepare(`SELECT id, name FROM cs2_items ORDER BY sort, id`).all() as Row[]).map((r) => ({
    id: num(r.id),
    name: String(r.name),
  }));
  const modes = (d.prepare(`SELECT id, name FROM cs2_modes ORDER BY sort, id`).all() as Row[]).map((r) => ({
    id: num(r.id),
    name: String(r.name),
  }));

  const all = loadMatches();
  const picked = all.filter((m) => {
    if (playerId === undefined) return true;
    const inMatch = m.playerA === playerId || m.playerB === playerId;
    if (!inMatch) return false;
    if (opponentId === undefined) return true;
    return m.playerA === opponentId || m.playerB === opponentId;
  });

  /* 1. 单挑胜率 —— 行 = 单挑，按场次 */
  const modeRows = modes.map((mode) => {
    const ms = picked.filter((m) => m.modeId === mode.id);
    let win = 0;
    for (const m of ms) {
      const t = totals(m.entries);
      if (t.a === t.b) continue;
      if (playerId === undefined) continue;
      const mine = m.playerA === playerId ? t.a : t.b;
      const theirs = m.playerA === playerId ? t.b : t.a;
      if (mine > theirs) win++;
    }
    return {
      单挑: list(mode.id, mode.name),
      胜率: playerId === undefined ? null : rate(win, ms.length),
      场次: ms.length,
    };
  });

  /* 2. 项目胜率 —— 行 = 项目，按局数 */
  const itemRows = items.map((item) => {
    let myScore = 0;
    let rounds = 0;
    for (const m of picked) {
      for (const e of m.entries) {
        if (e.itemId !== item.id) continue;
        const r = roundsOf(e.scoreA, e.scoreB);
        rounds += r;
        if (playerId !== undefined) myScore += m.playerA === playerId ? e.scoreA : e.scoreB;
      }
    }
    return {
      项目: list(item.id, item.name),
      胜率: playerId === undefined ? null : rate(myScore, rounds),
      局数: rounds,
    };
  });

  /* 3. solo三项高阶数据 · 项目优胜 —— 行 = 项目 */
  const soloId = modes.find((m) => m.name === 'solo三项')?.id;
  const soloMatches = picked.filter((m) => m.modeId === soloId);
  const winRows = items.map((item) => {
    let win = 0;
    let played = 0;
    for (const m of soloMatches) {
      const e = m.entries.find((x) => x.itemId === item.id);
      if (!e) continue;
      played++;
      if (playerId === undefined) continue;
      const mine = m.playerA === playerId ? e.scoreA : e.scoreB;
      const theirs = m.playerA === playerId ? e.scoreB : e.scoreA;
      if (mine > theirs) win++;
    }
    return {
      项目: list(item.id, item.name),
      优胜数: win,
      优胜率: playerId === undefined ? null : rate(win, played),
    };
  });

  return [
    {
      key: 'mode-rate',
      title: '单挑胜率',
      columns: [
        { key: '单挑', label: '单挑', kind: 'list' },
        { key: '胜率', label: '胜率', kind: 'percent' },
        { key: '场次', label: '场次', kind: 'number' },
      ],
      rows: modeRows,
    },
    {
      key: 'item-rate',
      title: '项目胜率',
      columns: [
        { key: '项目', label: '项目', kind: 'list' },
        { key: '胜率', label: '胜率', kind: 'percent' },
        { key: '局数', label: '局数', kind: 'number' },
      ],
      rows: itemRows,
    },
    {
      key: 'solo-win',
      group: 'solo三项高阶数据',
      title: '项目优胜',
      columns: [
        { key: '项目', label: '项目', kind: 'list' },
        { key: '优胜数', label: '优胜数', kind: 'number' },
        { key: '优胜率', label: '优胜率', kind: 'percent' },
      ],
      rows: winRows,
    },
  ];
}

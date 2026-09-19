import type { GameDef, Side, StatRecipe } from '../shared/types.ts';
import { hasDraft, maxRoundsOf, poolSizeOf, slotsOf, winByOf } from '../shared/types.ts';
import { db } from './db.ts';
import { deriveSeries } from './facts.ts';
import { loadGame } from './game-loader.ts';

export interface SeriesSummary {
  id: number;
  game: string;
  rulesetKey: string;
  rulesetLabel: string;
  playedAt: string;
  note: string;
  sides: { playerId: number | null; playerName: string }[];
  bpFirstSide: Side;
  score: [number, number];
  winnerSide: Side | null;
  isDraw: boolean;
  concluded: boolean;
  status: 'drafting' | 'ready' | 'playing' | 'done';
  /** 这套规则有没有 BP 阶段 —— 界面据此决定要不要显示进池/BP */
  hasDraft: boolean;
  /** 这套规则的胜负线 */
  winBy: number;
  progress: {
    poolCount: number;
    poolSize: number;
    draftFilled: number;
    draftTotal: number;
    roundsDone: number;
    roundsTotal: number;
  };
}

type Row = Record<string, any>;
const plain = <T extends Row>(r: T | undefined): T | undefined => (r ? { ...r } : undefined);

/* ------------------------------------------------------------------ */
/* 玩家 / 实体                                                         */
/* ------------------------------------------------------------------ */

export interface PlayerRow {
  id: number;
  game: string;
  name: string;
  aliases: string[];
  enabled: number;
  created_at: string;
}

export interface EntityRow {
  id: number;
  game: string;
  type: string;
  name: string;
  aliases: string[];
  enabled: number;
  sort: number;
}

export function listPlayers(game: string): PlayerRow[] {
  return (db().prepare(`SELECT * FROM players WHERE game = ? ORDER BY name`).all(game) as Row[]).map((r) => ({
    ...r,
    aliases: splitAliases(r.aliases),
  })) as PlayerRow[];
}

export function ensurePlayer(game: string, name: string): number {
  const n = name.trim();
  if (!n) throw new Error('玩家名不能为空');
  const d = db();
  const found = plain(d.prepare(`SELECT id FROM players WHERE game = ? AND name = ?`).get(game, n) as Row);
  if (found) return found.id as number;
  const res = d.prepare(`INSERT INTO players (game, name) VALUES (?, ?)`).run(game, n);
  return Number(res.lastInsertRowid);
}

export function listEntities(game: string): EntityRow[] {
  return (db().prepare(`SELECT * FROM entities WHERE game = ? ORDER BY sort, id`).all(game) as Row[]).map((r) => ({
    ...r,
    aliases: splitAliases(r.aliases),
  })) as EntityRow[];
}

const splitAliases = (s: string | null | undefined) =>
  (s ?? '')
    .split(/[,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export const joinAliases = (xs: string[]) => xs.join(',');

/* ------------------------------------------------------------------ */
/* 对局                                                                */
/* ------------------------------------------------------------------ */

export function listSeries(gameSlug: string): SeriesSummary[] {
  const game = loadGame(gameSlug);
  const rows = db()
    .prepare(`SELECT * FROM series WHERE game = ? ORDER BY played_at DESC, id DESC`)
    .all(gameSlug) as Row[];
  return rows.map((r) => summarize(game, r));
}

export function getSeriesSummary(gameSlug: string, id: number): SeriesSummary | null {
  const game = loadGame(gameSlug);
  const r = plain(db().prepare(`SELECT * FROM series WHERE id = ? AND game = ?`).get(id, gameSlug) as Row);
  return r ? summarize(game, r) : null;
}

function summarize(game: GameDef, s: Row): SeriesSummary {
  const d = db();
  const ruleset = game.rulesets.find((r) => r.key === s.ruleset_key) ?? game.rulesets[0]!;
  const sp = d.prepare(`SELECT * FROM series_players WHERE series_id = ?`).all(s.id) as Row[];
  const pool = d.prepare(`SELECT * FROM pool WHERE series_id = ?`).all(s.id) as Row[];
  const draft = d.prepare(`SELECT * FROM draft_actions WHERE series_id = ?`).all(s.id) as Row[];
  const rounds = d
    .prepare(`SELECT * FROM rounds WHERE series_id = ? ORDER BY idx`)
    .all(s.id) as Row[];

  const playerName = (side: Side) => {
    const row = sp.find((x) => x.side === side);
    if (!row) return '?';
    const p = plain(d.prepare(`SELECT name FROM players WHERE id = ?`).get(row.player_id) as Row);
    return (p?.name as string) ?? '?';
  };

  const derived = deriveSeries(game, ruleset, s.bp_first_side as Side, rounds);
  const roundsTotal = maxRoundsOf(ruleset);
  const roundsDone = rounds.filter((r) => r.result !== 'pending').length;
  const draftTotal = slotsOf(ruleset).length;
  const draftRequired = hasDraft(ruleset);

  let status: SeriesSummary['status'] = 'drafting';
  if (draft.length >= draftTotal) {
    status = roundsDone === 0 ? 'ready' : derived.concluded ? 'done' : 'playing';
  }

  return {
    id: s.id,
    game: s.game,
    rulesetKey: ruleset.key,
    rulesetLabel: ruleset.label,
    playedAt: s.played_at,
    note: s.note ?? '',
    sides: [
      { playerId: sp.find((x) => x.side === 0)?.player_id ?? null, playerName: playerName(0) },
      { playerId: sp.find((x) => x.side === 1)?.player_id ?? null, playerName: playerName(1) },
    ],
    bpFirstSide: s.bp_first_side as Side,
    score: derived.score,
    winnerSide: derived.seriesWinner,
    isDraw: derived.isDraw,
    concluded: derived.concluded,
    status,
    progress: {
      poolCount: pool.length,
      poolSize: poolSizeOf(ruleset),
      draftFilled: draft.length,
      draftTotal,
      roundsDone,
      roundsTotal,
    },
    hasDraft: draftRequired,
    winBy: winByOf(ruleset, game),
  };
}

export function getSeriesDetail(gameSlug: string, id: number) {
  const game = loadGame(gameSlug);
  const summary = getSeriesSummary(gameSlug, id);
  if (!summary) return null;
  const d = db();
  const ruleset = game.rulesets.find((r) => r.key === summary.rulesetKey)!;
  const pool = (d.prepare(`SELECT * FROM pool WHERE series_id = ? ORDER BY seq`).all(id) as Row[]).map((r) => ({
    entityId: r.entity_id as number,
    seq: r.seq as number,
  }));
  const draft = (d.prepare(`SELECT * FROM draft_actions WHERE series_id = ? ORDER BY slot_index`).all(id) as Row[]).map(
    (r) => ({ slotIndex: r.slot_index as number, entityId: r.entity_id as number }),
  );
  const rounds = (d.prepare(`SELECT * FROM rounds WHERE series_id = ? ORDER BY idx`).all(id) as Row[]).map((r) => ({
    idx: r.idx as number,
    initiativeSide: r.initiative_side as Side | null,
    side0Entity: r.side0_entity as number | null,
    side1Entity: r.side1_entity as number | null,
    result: r.result as string,
    winKind: (r.win_kind ?? '') as string,
    note: (r.note ?? '') as string,
  }));
  const derived = deriveSeries(
    game,
    ruleset,
    summary.bpFirstSide,
    rounds.map((r) => ({ ...r, result: r.result })),
  );
  return {
    ...summary,
    ruleset,
    pool,
    draft,
    rounds,
    /** 每轮开打前双方的加强层数 —— 界面上要直接显示，帮玩家确认规则 */
    buffsBefore: Object.fromEntries(derived.buffsBefore),
    maxBuffs: derived.maxBuffs,
  };
}

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

export function rulesetLabel(game: GameDef, key: string) {
  return game.rulesets.find((r) => r.key === key)?.label ?? key;
}

export function presetList(gameSlug: string, presets: StatRecipe[]) {
  const game = loadGame(gameSlug);
  return presets.map((p) => ({
    key: p.key,
    title: p.title,
    note: p.note,
    grain: p.grain,
    rulesetLabels: undefined,
    game: game.slug,
  }));
}

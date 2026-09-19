import type {
  FactBundle,
  GameDef,
  RoundResultDef,
  RoundSideFact,
  RulesetDef,
  SeriesEntityFact,
  SeriesPlayerFact,
  SeriesSlotFact,
  Side,
} from '../shared/types.ts';
import { maxRoundsOf, slotsOf, winByOf } from '../shared/types.ts';
import { db } from './db.ts';
import { loadGame } from './game-loader.ts';

/**
 * 事实推导层。
 *
 * 数据库里只存**原始事实**（谁跟谁打、池子里有谁、第几槽选了谁、每轮谁赢）。
 * 一切派生量都在这里算出来：
 *   - 系列赛比分与胜负（含弃赛 / 平局 / 进行中）
 *   - 每轮的**劣势加强层数**（= 本轮之前该方输了几轮）
 *   - "被 pick" 与 "实际上场" 的区分
 *
 * 所以录入界面不需要让人填 buff、不需要让人填比分 —— 少填一项就少一个错。
 */

export interface FactFilter {
  ruleset?: string;
  from?: string;
  to?: string;
  /** 只看某个玩家参与的对局 */
  playerId?: number;
}

type Row = Record<string, any>;

interface SeriesCtx {
  players: Map<Side, number>;
  concluded: boolean;
  score: [number, number];
  seriesWinner: Side | null;
  isDraw: boolean;
  /** 每轮开打前各方的加强层数 */
  buffsBefore: Map<number, [number, number]>;
  maxBuffs: [number, number];
  lostRound1: [boolean, boolean];
  bpFirst: Side;
}

export function buildFacts(gameSlug: string, filter: FactFilter = {}): FactBundle {
  const d = db();
  const game = loadGame(gameSlug);
  const empty: FactBundle = { series_entity: [], series_slot: [], round_side: [], series_player: [] };

  const where = ['game = ?'];
  const args: any[] = [gameSlug];
  if (filter.ruleset) (where.push('ruleset_key = ?'), args.push(filter.ruleset));
  if (filter.from) (where.push('played_at >= ?'), args.push(filter.from));
  if (filter.to) (where.push('played_at <= ?'), args.push(filter.to));

  const seriesRows = d
    .prepare(
      `SELECT id, ruleset_key, played_at, bp_first_side FROM series
       WHERE ${where.join(' AND ')} ORDER BY played_at, id`,
    )
    .all(...args) as Row[];
  if (seriesRows.length === 0) return empty;

  const ids = seriesRows.map((s) => s.id);
  const ph = ids.map(() => '?').join(',');

  const entityNames = new Map<number, string>(
    (d.prepare(`SELECT id, name FROM entities WHERE game = ?`).all(gameSlug) as Row[]).map((e) => [e.id, e.name]),
  );
  const allEntityIds = [...entityNames.keys()];
  const playerNames = new Map<number, string>(
    (d.prepare(`SELECT id, name FROM players WHERE game = ?`).all(gameSlug) as Row[]).map((p) => [p.id, p.name]),
  );

  const group = <T extends Row>(rows: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of rows) {
      const arr = m.get(r.series_id);
      if (arr) arr.push(r);
      else m.set(r.series_id, [r]);
    }
    return m;
  };

  const spBy = group(d.prepare(`SELECT * FROM series_players WHERE series_id IN (${ph})`).all(...ids) as Row[]);
  const poolBy = group(d.prepare(`SELECT * FROM pool WHERE series_id IN (${ph})`).all(...ids) as Row[]);
  const draftBy = group(
    d.prepare(`SELECT * FROM draft_actions WHERE series_id IN (${ph}) ORDER BY slot_index`).all(...ids) as Row[],
  );
  const roundBy = group(
    d.prepare(`SELECT * FROM rounds WHERE series_id IN (${ph}) ORDER BY idx`).all(...ids) as Row[],
  );

  const facts: FactBundle = { series_entity: [], series_slot: [], round_side: [], series_player: [] };
  const resDefs = new Map<string, RoundResultDef>(game.roundResults.map((r) => [r.key, r]));

  for (const s of seriesRows) {
    const ruleset = game.rulesets.find((r) => r.key === s.ruleset_key) ?? game.rulesets[0]!;
    const sp = spBy.get(s.id) ?? [];
    const rounds = roundBy.get(s.id) ?? [];
    const draft = draftBy.get(s.id) ?? [];

    const ctx = {
      ...deriveSeries(game, ruleset, s.bp_first_side as Side, rounds),
      players: new Map<Side, number>(sp.map((r: Row) => [r.side as Side, r.player_id as number])),
    };
    // 双方玩家都还没记全的对局是半成品，不参与统计
    if (ctx.players.size < 2) continue;
    if (filter.playerId && ![0, 1].some((side) => ctx.players.get(side as Side) === filter.playerId)) continue;

    const name = (side: Side) => playerNames.get(ctx.players.get(side)!) ?? '?';

    /* ---------------- series_entity：漏斗 ---------------- */
    const poolSet = new Set<number>((poolBy.get(s.id) ?? []).map((r) => r.entity_id));
    const banned = new Set<number>();
    const picked = new Set<number>();
    for (const a of draft) {
      const slot = slotsOf(ruleset)[a.slot_index];
      if (!slot) continue;
      (slot.kind === 'ban' ? banned : picked).add(a.entity_id);
    }

    // 只有"真打过"的轮才算上场：投降 / 弃赛的轮不算对局
    const playStats = new Map<number, { wins: number; losses: number }>();
    for (const r of rounds) {
      const def = resDefs.get(r.result);
      if (!def?.played || def.winner === null) continue;
      for (const side of [0, 1] as Side[]) {
        const eid = side === 0 ? r.side0_entity : r.side1_entity;
        if (eid == null) continue;
        const st = playStats.get(eid) ?? { wins: 0, losses: 0 };
        if (def.winner === side) st.wins++;
        else st.losses++;
        playStats.set(eid, st);
      }
    }

    for (const eid of allEntityIds) {
      const st = playStats.get(eid);
      facts.series_entity.push({
        seriesId: s.id,
        playedAt: s.played_at,
        rulesetKey: ruleset.key,
        entityId: eid,
        entityName: entityNames.get(eid)!,
        inPool: poolSet.has(eid),
        banned: banned.has(eid),
        picked: picked.has(eid),
        played: !!st,
        playedWins: st?.wins ?? 0,
        playedLosses: st?.losses ?? 0,
        concluded: ctx.concluded,
      } satisfies SeriesEntityFact);
    }

    /* ---------------- series_slot：顺位 ---------------- */
    const actionAt = new Map<number, number>(draft.map((a) => [a.slot_index, a.entity_id]));
    let banNo = 0;
    let pickNo = 0;
    slotsOf(ruleset).forEach((slot, i) => {
      const eid = actionAt.get(i) ?? null;
      facts.series_slot.push({
        seriesId: s.id,
        playedAt: s.played_at,
        rulesetKey: ruleset.key,
        slotIndex: i,
        slotNo: slot.kind === 'ban' ? ++banNo : ++pickNo,
        kind: slot.kind,
        who: slot.who,
        entityId: eid,
        entityName: eid === null ? null : (entityNames.get(eid) ?? null),
      } satisfies SeriesSlotFact);
    });

    /* ---------------- round_side：对位 / 先攻 / 加强 ---------------- */
    for (const r of rounds) {
      const def = resDefs.get(r.result);
      if (!def?.played || def.winner === null) continue;
      if (r.side0_entity == null || r.side1_entity == null) continue;
      const buffs = ctx.buffsBefore.get(r.idx) ?? [0, 0];
      const initiative = (r.initiative_side ?? null) as Side | null;
      for (const side of [0, 1] as Side[]) {
        const opp = (side === 0 ? 1 : 0) as Side;
        const eid = side === 0 ? r.side0_entity : r.side1_entity;
        const oeid = side === 0 ? r.side1_entity : r.side0_entity;
        facts.round_side.push({
          seriesId: s.id,
          playedAt: s.played_at,
          rulesetKey: ruleset.key,
          roundIdx: r.idx,
          side,
          playerId: ctx.players.get(side)!,
          playerName: name(side),
          opponentId: ctx.players.get(opp)!,
          opponentName: name(opp),
          entityId: eid,
          entityName: entityNames.get(eid) ?? '?',
          opponentEntityId: oeid,
          opponentEntityName: entityNames.get(oeid) ?? '?',
          won: def.winner === side,
          isInitiative: initiative === side,
          isBpFirst: ctx.bpFirst === side,
          buffs: buffs[side],
          opponentBuffs: buffs[opp],
          buffEdge: buffs[side] - buffs[opp],
        } satisfies RoundSideFact);
      }
    }

    /* ---------------- series_player：BO 级 ---------------- */
    if (!ctx.concluded) continue;
    for (const side of [0, 1] as Side[]) {
      const opp = (side === 0 ? 1 : 0) as Side;
      const won = ctx.seriesWinner === side;
      facts.series_player.push({
        seriesId: s.id,
        playedAt: s.played_at,
        rulesetKey: ruleset.key,
        side,
        playerId: ctx.players.get(side)!,
        playerName: name(side),
        opponentId: ctx.players.get(opp)!,
        opponentName: name(opp),
        won,
        drawn: ctx.isDraw,
        scoreFor: ctx.score[side],
        scoreAgainst: ctx.score[opp],
        isBpFirst: ctx.bpFirst === side,
        lostRound1: ctx.lostRound1[side],
        comeback: won && ctx.lostRound1[side],
        maxBuffs: ctx.maxBuffs[side],
      } satisfies SeriesPlayerFact);
    }
  }

  return facts;
}

/**
 * 单场对局的派生分析（纯函数，列表页和统计层共用同一份逻辑）。
 *
 * **劣势加强规则**：输掉一轮，本方之后所有战斗里的角色获得一层加强。
 * 所以第 n 轮的加强层数 = 该方在第 1..n-1 轮里输掉的轮数（可叠加）。
 * 纯推导，录入时不用填。
 */
export function deriveSeries(
  game: GameDef,
  ruleset: RulesetDef,
  bpFirst: Side,
  rounds: Row[],
): Omit<SeriesCtx, 'players'> {
  const resDefs = new Map<string, RoundResultDef>(game.roundResults.map((r) => [r.key, r]));

  const buffsBefore = new Map<number, [number, number]>();
  const running: [number, number] = [0, 0];
  const score: [number, number] = [0, 0];
  const lostRound1: [boolean, boolean] = [false, false];
  const maxBuffs: [number, number] = [0, 0];
  let sawDoubleForfeit = false;
  let terminal = 0;

  for (const r of rounds) {
    buffsBefore.set(r.idx, [running[0], running[1]]);
    maxBuffs[0] = Math.max(maxBuffs[0], running[0]);
    maxBuffs[1] = Math.max(maxBuffs[1], running[1]);

    const def = resDefs.get(r.result);
    if (!def || def.key === 'pending') continue;
    terminal++;

    if (def.winner !== null) {
      score[def.winner]++;
      const loser = (def.winner === 0 ? 1 : 0) as Side;
      running[loser]++; // 输的一方拿到一层加强
      if (r.idx === 1) lostRound1[loser] = true;
    }
    if (def.key === 'double_forfeit') sawDoubleForfeit = true;
  }

  const winBy = winByOf(ruleset, game);
  let seriesWinner: Side | null = null;
  if (score[0] >= winBy) seriesWinner = 0;
  else if (score[1] >= winBy) seriesWinner = 1;

  const maxRounds = maxRoundsOf(ruleset);
  const concluded = seriesWinner !== null || sawDoubleForfeit || terminal >= maxRounds;
  if (concluded && seriesWinner === null && score[0] !== score[1]) {
    seriesWinner = score[0] > score[1] ? 0 : 1;
  }

  return {
    concluded,
    score,
    seriesWinner,
    isDraw: concluded && seriesWinner === null,
    buffsBefore,
    maxBuffs,
    lostRound1,
    bpFirst,
  };
}

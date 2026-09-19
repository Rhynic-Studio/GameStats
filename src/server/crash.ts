import { db } from './db.ts';
import { PENDING } from '../shared/crash.ts';
import { MAX_ROUNDS, RULES, ROUND_RESULTS, WIN_BY, WIN_KINDS, isPlayed, winnerOf } from '../shared/crash.ts';
import type { CrashRuleset } from '../shared/types.ts';
import type {
  CrashMatchDetail,
  CrashRound,

  CrashSummary,
  GridTable,
  ListItem,
  MatrixTable,
  StatTable,
  Cell,
} from '../shared/types.ts';


type Row = Record<string, any>;
const num = (v: unknown) => Number(v);

/* ------------------------------------------------------------------ */
/* 读                                                                  */
/* ------------------------------------------------------------------ */

export function lists() {
  const d = db();
  return {
    roles: d.prepare(`SELECT id, name FROM crash_roles ORDER BY sort, id`).all() as Row[],
    players: d.prepare(`SELECT id, name FROM players ORDER BY name`).all() as Row[],
    rules: Object.values(RULES).map((r) => ({ key: r.key, label: r.label, poolSize: r.poolSize })),
    roundResults: ROUND_RESULTS.map((r) => ({ key: r.key })),
    winKinds: WIN_KINDS,
  };
}

interface RawMatch {
  id: number;
  playedAt: string;
  playerA: number;
  playerB: number;
  rule: string;
  firstSide: 0 | 1;
  note: string;
  inProgress: boolean;
  pool: number[];
  draft: Map<number, number>;
  rounds: CrashRound[];
}

function loadMatches(): RawMatch[] {
  const d = db();
  const ms = d.prepare(`SELECT * FROM crash_matches ORDER BY played_at DESC, id DESC`).all() as Row[];
  if (ms.length === 0) return [];
  const pool = d.prepare(`SELECT * FROM crash_pool ORDER BY match_id, seq`).all() as Row[];
  const draft = d.prepare(`SELECT * FROM crash_draft ORDER BY match_id, seq`).all() as Row[];
  const rounds = d.prepare(`SELECT * FROM crash_rounds ORDER BY match_id, idx`).all() as Row[];

  const poolBy = new Map<number, number[]>();
  for (const p of pool) poolBy.set(num(p.match_id), [...(poolBy.get(num(p.match_id)) ?? []), num(p.role_id)]);
  const draftBy = new Map<number, Map<number, number>>();
  for (const a of draft) {
    const m = draftBy.get(num(a.match_id)) ?? new Map<number, number>();
    m.set(num(a.seq), num(a.role_id));
    draftBy.set(num(a.match_id), m);
  }
  const roundBy = new Map<number, CrashRound[]>();
  for (const r of rounds) {
    const list = roundBy.get(num(r.match_id)) ?? [];
    list.push({
      idx: num(r.idx),
      initiativeSide: r.initiative_side === null ? null : (num(r.initiative_side) as 0 | 1),
      roleA: r.role_a === null ? null : num(r.role_a),
      roleB: r.role_b === null ? null : num(r.role_b),
      result: String(r.result),
      winKind: String(r.win_kind ?? ''),
    });
    roundBy.set(num(r.match_id), list);
  }

  return ms.map((m) => ({
    id: num(m.id),
    playedAt: String(m.played_at),
    playerA: num(m.player_a),
    playerB: num(m.player_b),
    rule: String(m.rule),
    firstSide: num(m.first_side) as 0 | 1,
    note: String(m.note ?? ''),
    inProgress: num(m.in_progress) === 1,
    pool: poolBy.get(num(m.id)) ?? [],
    draft: draftBy.get(num(m.id)) ?? new Map(),
    rounds: roundBy.get(num(m.id)) ?? [],
  }));
}

/** 逐轮的比分、buff 状态、结论 */
function derive(m: RawMatch) {
  const score: [number, number] = [0, 0];
  const buffs = new Map<number, [boolean, boolean]>();
  let terminal = 0;
  let sawDoubleForfeit = false;
  for (const r of m.rounds) {
    buffs.set(r.idx, [score[1] !== 0, score[0] !== 0]); // 败方带 buff：对方得分不是 0
    if (r.result === 'pending') continue;
    terminal++;
    if (r.result === 'double_forfeit') sawDoubleForfeit = true;
    const w = winnerOf(r.result);
    if (w !== null) score[w]++;
  }
  let winner: 0 | 1 | null = null;
  if (score[0] >= WIN_BY) winner = 0;
  else if (score[1] >= WIN_BY) winner = 1;
  const concluded = winner !== null || sawDoubleForfeit || terminal >= MAX_ROUNDS;
  if (concluded && winner === null && score[0] !== score[1]) winner = score[0] > score[1] ? 0 : 1;
  return { score, buffs, concluded, winner, isDraw: concluded && winner === null, terminal };
}

const playerNames = () =>
  new Map<number, string>(
    (db().prepare(`SELECT id, name FROM players`).all() as Row[]).map((r) => [num(r.id), String(r.name)]),
  );

const roleList = (): ListItem[] =>
  (db().prepare(`SELECT id, name FROM crash_roles ORDER BY sort, id`).all() as Row[]).map((r) => ({
    id: num(r.id),
    name: String(r.name),
  }));

function toSummary(m: RawMatch, d: ReturnType<typeof derive>, names: Map<number, string>): CrashSummary {
  return {
    id: m.id,
    playedAt: m.playedAt,
    playerA: { id: m.playerA, name: names.get(m.playerA) ?? '?' },
    playerB: { id: m.playerB, name: names.get(m.playerB) ?? '?' },
    rule: m.rule,
    ruleLabel: RULES[m.rule]?.label ?? m.rule,
    firstSide: m.firstSide,
    note: m.note,
    inProgress: m.inProgress,
    score: d.score,
    winner: d.winner,
    isDraw: d.isDraw,
    concluded: d.concluded,
    poolCount: m.pool.length,
    draftCount: m.draft.size,
    roundsDone: d.terminal,
  };
}

export function listMatches(): CrashSummary[] {
  const names = playerNames();
  return loadMatches().map((m) => toSummary(m, derive(m), names));
}

export function getMatch(id: number): CrashMatchDetail | null {
  const m = loadMatches().find((x) => x.id === id);
  if (!m) return null;
  const d = derive(m);
  return {
    ...toSummary(m, d, playerNames()),
    pool: m.pool,
    draft: Object.fromEntries(m.draft),
    rounds: m.rounds,
  };
}

/* ------------------------------------------------------------------ */
/* 写                                                                  */
/* ------------------------------------------------------------------ */

export function ensurePlayer(name: string): number {
  const n = name.trim();
  if (!n) throw new Error('玩家名不能为空');
  const d = db();
  const found = d.prepare(`SELECT id FROM players WHERE name = ?`).get(n) as Row | undefined;
  if (found) return num(found.id);
  return num(d.prepare(`INSERT INTO players (name) VALUES (?)`).run(n).lastInsertRowid);
}

interface MatchBody {
  playedAt?: string;
  playerA?: string;
  playerB?: string;
  rule?: string;
  firstSide?: 0 | 1;
  note?: string;
  inProgress?: boolean;
  pool?: number[];
  draft?: { seq: number; roleId: number }[];
  rounds?: CrashRound[];
}

function writeChildren(id: number, body: MatchBody, rule: CrashRuleset) {
  const d = db();
  if (body.pool) {
    d.prepare(`DELETE FROM crash_pool WHERE match_id = ?`).run(id);
    const ins = d.prepare(`INSERT INTO crash_pool (match_id, role_id, seq) VALUES (?, ?, ?)`);
    body.pool.forEach((roleId, i) => ins.run(id, roleId, i));
  }
  if (body.draft) {
    d.prepare(`DELETE FROM crash_draft WHERE match_id = ?`).run(id);
    const ins = d.prepare(`INSERT INTO crash_draft (match_id, seq, role_id) VALUES (?, ?, ?)`);
    const seen = new Set<number>();
    for (const a of body.draft) {
      if (!rule.slots[a.seq]) throw new Error(`槽位 ${a.seq} 不属于 ${rule.label}`);
      if (seen.has(a.roleId)) throw new Error('同一个角色不能重复 ban / pick');
      seen.add(a.roleId);
      ins.run(id, a.seq, a.roleId);
    }
  }
  if (body.rounds) {
    d.prepare(`DELETE FROM crash_rounds WHERE match_id = ?`).run(id);
    const ins = d.prepare(
      `INSERT INTO crash_rounds (match_id, idx, initiative_side, role_a, role_b, result, win_kind)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of body.rounds) {
      if (r.idx < 1 || r.idx > MAX_ROUNDS) throw new Error(`轮次超出范围（最多 ${MAX_ROUNDS} 轮）`);
      if (r.result !== PENDING && !ROUND_RESULTS.some((x) => x.key === r.result)) throw new Error(`未知结果: ${r.result}`);
      ins.run(id, r.idx, r.initiativeSide ?? null, r.roleA ?? null, r.roleB ?? null, r.result, r.winKind ?? '');
    }
  }
}

export function createMatch(body: MatchBody): number {
  const rule = RULES[body.rule ?? ''] ?? RULES.bp;
  const a = ensurePlayer(body.playerA ?? '');
  const b = ensurePlayer(body.playerB ?? '');
  if (a === b) throw new Error('两边不能是同一个人');
  const id = num(
    db()
      .prepare(
        `INSERT INTO crash_matches (played_at, player_a, player_b, rule, first_side, note, in_progress)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.playedAt?.trim() || new Date().toISOString().slice(0, 10),
        a,
        b,
        rule.key,
        body.firstSide === 1 ? 1 : 0,
        body.note ?? '',
        body.inProgress ? 1 : 0,
      ).lastInsertRowid,
  );
  writeChildren(id, body, rule);
  return id;
}

export function updateMatch(id: number, body: MatchBody): void {
  const d = db();
  const cur = d.prepare(`SELECT * FROM crash_matches WHERE id = ?`).get(id) as Row | undefined;
  if (!cur) throw new Error('对局不存在');
  const rule = RULES[body.rule ?? String(cur.rule)] ?? RULES.bp;
  const a = body.playerA === undefined ? num(cur.player_a) : ensurePlayer(body.playerA);
  const b = body.playerB === undefined ? num(cur.player_b) : ensurePlayer(body.playerB);
  if (a === b) throw new Error('两边不能是同一个人');
  d.prepare(
    `UPDATE crash_matches SET played_at = ?, player_a = ?, player_b = ?, rule = ?, first_side = ?, note = ?, in_progress = ?
     WHERE id = ?`,
  ).run(
    body.playedAt ?? String(cur.played_at),
    a,
    b,
    rule.key,
    body.firstSide === undefined ? num(cur.first_side) : body.firstSide === 1 ? 1 : 0,
    body.note ?? String(cur.note ?? ''),
    body.inProgress === undefined ? num(cur.in_progress) : body.inProgress ? 1 : 0,
    id,
  );
  writeChildren(id, body, rule);
}

export function deleteMatch(id: number): void {
  db().prepare(`DELETE FROM crash_matches WHERE id = ?`).run(id);
}

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

interface RoundFact {
  matchId: number;
  playedAt: string;
  rule: string;
  idx: number;
  me: 0 | 1;
  opp: 0 | 1;
  myPlayer: number;
  oppPlayer: number;
  myRole: number;
  oppRole: number;
  won: boolean;
  initiative: boolean;
  buffState: '都无' | '我优' | '我劣' | '都有';
}

interface PoolFact {
  matchId: number;
  playedAt: string;
  rule: string;
  roleId: number;
  banned: boolean;
  picked: boolean;
  firstBan: boolean;
  firstPick: boolean;
}

function buildFacts(playerId?: number) {
  const names = playerNames();
  const roundFacts: RoundFact[] = [];
  const poolFacts: PoolFact[] = [];
  const seriesFacts: { matchId: number; concluded: boolean; roundFacts: RoundFact[] }[] = [];

  for (const m of loadMatches()) {
    if (playerId !== undefined && m.playerA !== playerId && m.playerB !== playerId) continue;
    const d = derive(m);
    const rule = RULES[m.rule];

    const firstPickSeq = rule?.slots.findIndex((s) => s.kind === 'pick') ?? -1;
    const firstBanSeq = rule?.slots.findIndex((s) => s.kind === 'ban') ?? -1;
    for (const roleId of m.pool) {
      let banned = false;
      let picked = false;
      let firstBan = false;
      let firstPick = false;
      for (const [seq, rid] of m.draft) {
        if (rid !== roleId) continue;
        const slot = rule?.slots[seq];
        if (!slot) continue;
        if (slot.kind === 'ban') {
          banned = true;
          if (seq === firstBanSeq) firstBan = true;
        } else {
          picked = true;
          if (seq === firstPickSeq) firstPick = true;
        }
      }
      poolFacts.push({
        matchId: m.id,
        playedAt: m.playedAt,
        rule: m.rule,
        roleId,
        banned,
        picked,
        firstBan,
        firstPick,
      });
    }

    const mine: RoundFact[] = [];
    for (const r of m.rounds) {
      if (!isPlayed(r.result)) continue;
      if (r.roleA === null || r.roleB === null) continue;
      const w = winnerOf(r.result);
      if (w === null) continue;
      const buff = d.buffs.get(r.idx) ?? [false, false];
      for (const side of [0, 1] as const) {
        const opp = (side === 0 ? 1 : 0) as 0 | 1;
        const myBuff = buff[side];
        const oppBuff = buff[opp];
        mine.push({
          matchId: m.id,
          playedAt: m.playedAt,
          rule: m.rule,
          idx: r.idx,
          me: side,
          opp,
          myPlayer: side === 0 ? m.playerA : m.playerB,
          oppPlayer: side === 0 ? m.playerB : m.playerA,
          myRole: side === 0 ? r.roleA : r.roleB,
          oppRole: side === 0 ? r.roleB : r.roleA,
          won: w === side,
          initiative: r.initiativeSide === side,
          buffState: myBuff && oppBuff ? '都有' : myBuff ? '我优' : oppBuff ? '我劣' : '都无',
        });
      }
    }
    roundFacts.push(...mine);
    seriesFacts.push({ matchId: m.id, concluded: d.concluded, roundFacts: mine });
  }

  void names;
  void seriesFacts;
  return { roundFacts, poolFacts };
}

const rate = (win: number, total: number) => (total === 0 ? null : win / total);
const roleCell = (r: ListItem): Cell => ({ id: r.id, name: r.name });

function grid(
  navKey: string,
  navGroup: string | undefined,
  navLabel: string,
  title: string,
  columns: GridTable['columns'],
  rows: Record<string, Cell>[],
): GridTable {
  return { kind: 'grid', navKey, navGroup, navLabel, title, columns, rows };
}

function matrixTable(
  navKey: string,
  navGroup: string | undefined,
  navLabel: string,
  title: string,
  roles: ListItem[],
  facts: RoundFact[],
): MatrixTable {
  const tally = new Map<string, [number, number]>();
  for (const f of facts) {
    const k = `${f.myRole}:${f.oppRole}`;
    const t = tally.get(k) ?? [0, 0];
    t[0] += f.won ? 1 : 0;
    t[1] += 1;
    tally.set(k, t);
  }
  return {
    kind: 'matrix',
    navKey,
    navGroup,
    navLabel,
    title,
    rowHeader: '角色',
    colHeader: '对手角色',
    cols: roles.map((r) => ({ id: r.id, name: r.name })),
    rows: roles.map((me) => ({
      id: me.id,
      name: me.name,
      cells: roles.map((opp) => {
        const t = tally.get(`${me.id}:${opp.id}`);
        return t ? rate(t[0], t[1]) : null;
      }),
    })),
  };
}

export function stats(playerId?: number): StatTable[] {
  const { roundFacts, poolFacts } = buildFacts(playerId);
  const roles = roleList();
  const out: StatTable[] = [];

  /* 基础 · 角色 BP 率 —— 分母是角色出现的场次 */
  out.push(
    grid(
      'bp',
      '基础',
      '角色 BP 率',
      '角色 BP 率',
      [
        { key: '角色', label: '角色', kind: 'list' },
        { key: 'bp率', label: 'bp率', kind: 'percent' },
        { key: 'ban率', label: 'ban率', kind: 'percent' },
        { key: 'pick率', label: 'pick率', kind: 'percent' },
        { key: '首ban率', label: '首ban率', kind: 'percent' },
        { key: '首pick率', label: '首pick率', kind: 'percent' },
        { key: '出现', label: '出现', kind: 'number' },
      ],
      roles.map((role) => {
        const rows = poolFacts.filter((f) => f.roleId === role.id);
        return {
          角色: roleCell(role),
          bp率: rate(rows.filter((f) => f.banned || f.picked).length, rows.length),
          ban率: rate(rows.filter((f) => f.banned).length, rows.length),
          pick率: rate(rows.filter((f) => f.picked).length, rows.length),
          首ban率: rate(rows.filter((f) => f.firstBan).length, rows.length),
          首pick率: rate(rows.filter((f) => f.firstPick).length, rows.length),
          出现: rows.length,
        };
      }),
    ),
  );

  /* 基础 · 角色总胜率（不看 buff）+ 矩阵 */
  out.push(
    grid(
      'win',
      '基础',
      '角色总胜率',
      '角色总胜率',
      [
        { key: '角色', label: '角色', kind: 'list' },
        { key: '胜率', label: '胜率', kind: 'percent' },
        { key: '轮数', label: '轮数', kind: 'number' },
      ],
      roles.map((role) => {
        const rows = roundFacts.filter((f) => f.myRole === role.id);
        return {
          角色: roleCell(role),
          胜率: rate(rows.filter((f) => f.won).length, rows.length),
          轮数: rows.length,
        };
      }),
    ),
  );
  out.push(matrixTable('win', '基础', '角色总胜率', '角色对角色胜率', roles, roundFacts));

  /* 基础 · 先攻胜率 */
  out.push(
    grid(
      'initiative',
      '基础',
      '先攻胜率',
      '角色先攻胜率',
      [
        { key: '角色', label: '角色', kind: 'list' },
        { key: '胜率', label: '胜率', kind: 'percent' },
        { key: '轮数', label: '轮数', kind: 'number' },
      ],
      roles.map((role) => {
        const rows = roundFacts.filter((f) => f.myRole === role.id && f.initiative);
        return {
          角色: roleCell(role),
          胜率: rate(rows.filter((f) => f.won).length, rows.length),
          轮数: rows.length,
        };
      }),
    ),
  );
  out.push(
    grid(
      'initiative',
      '基础',
      '先攻胜率',
      '玩家先攻胜率',
      [
        { key: '玩家', label: '玩家', kind: 'list' },
        { key: '胜率', label: '胜率', kind: 'percent' },
        { key: '轮数', label: '轮数', kind: 'number' },
      ],
      (db().prepare(`SELECT id, name FROM players ORDER BY name`).all() as Row[]).map((p) => {
        const id = num(p.id);
        const rows = roundFacts.filter((f) => f.myPlayer === id && f.initiative);
        return {
          玩家: { id, name: String(p.name) } as Cell,
          胜率: rate(rows.filter((f) => f.won).length, rows.length),
          轮数: rows.length,
        };
      }),
    ),
  );

  /* 高阶 · 四类胜率，各自带矩阵 */
  const kinds: { navKey: string; label: string; title: string; keep: (s: RoundFact['buffState']) => boolean }[] = [
    { navKey: 'nobuff', label: '首发胜率', title: '首发胜率', keep: (s) => s === '都无' },
    { navKey: 'adv', label: '优势胜率', title: '优势胜率（落后方 vs 领先方）', keep: (s) => s === '我优' },
    { navKey: 'final', label: '决战胜率', title: '决战胜率（最终局）', keep: (s) => s === '都有' },
    {
      navKey: 'fair',
      label: '公平胜率',
      title: '公平胜率（首发+最终局）',
      keep: (s) => s === '都无' || s === '都有',
    },
  ];
  for (const k of kinds) {
    const rows = roundFacts.filter((f) => k.keep(f.buffState));
    out.push(
      grid(
        k.navKey,
        '高阶',
        k.label,
        k.title,
        [
          { key: '角色', label: '角色', kind: 'list' },
          { key: '胜率', label: '胜率', kind: 'percent' },
          { key: '轮数', label: '轮数', kind: 'number' },
        ],
        roles.map((role) => {
          const mine = rows.filter((f) => f.myRole === role.id);
          return {
            角色: roleCell(role),
            胜率: rate(mine.filter((f) => f.won).length, mine.length),
            轮数: mine.length,
          };
        }),
      ),
    );
    out.push(matrixTable(k.navKey, '高阶', k.label, `${k.title} · 矩阵`, roles, rows));
  }

  return out;
}

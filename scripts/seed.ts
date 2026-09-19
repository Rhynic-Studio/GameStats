/**
 * 把 `docs/raw-logs.md` 里的三份真实 log 录进库里，作为验收基准。
 *
 * 用法：`npm run seed`（会先清空 crash 的对局数据，玩家保留）
 *
 * 录完会打印关键统计，用来人工核对是否与 docs/raw-logs.md 里的解析一致。
 */
import { db } from '../src/server/db.ts';
import { loadGame, getPresets } from '../src/server/game-loader.ts';
import { buildFacts } from '../src/server/facts.ts';
import { computeTable } from '../src/shared/stats.ts';
import { ensurePlayer, listEntities } from '../src/server/repo.ts';
import type { Side } from '../src/shared/types.ts';

const GAME = 'crash';
const game = loadGame(GAME);
const d = db();

/* ---------- 清空两个游戏的对局数据（玩家/角色保留） ---------- */
d.exec(`DELETE FROM series`);

const entityId = new Map(listEntities(GAME).map((e) => [e.name, e.id]));
const E = (name: string) => {
  const id = entityId.get(name);
  if (!id) throw new Error(`角色不存在: ${name}（现有：${[...entityId.keys()].join('、')}）`);
  return id;
};

/* ---------- 小工具 ---------- */
function newSeries(p0: string, p1: string, bpFirstSide: Side, rulesetKey: string, playedAt: string, note: string) {
  const res = d
    .prepare(`INSERT INTO series (game, ruleset_key, played_at, bp_first_side, note) VALUES (?, ?, ?, ?, ?)`)
    .run(GAME, rulesetKey, playedAt, bpFirstSide, note);
  const id = Number(res.lastInsertRowid);
  const ins = d.prepare(`INSERT INTO series_players (series_id, side, player_id) VALUES (?, ?, ?)`);
  ins.run(id, 0, ensurePlayer(GAME, p0));
  ins.run(id, 1, ensurePlayer(GAME, p1));
  return id;
}

function setPool(id: number, names: string[]) {
  const ins = d.prepare(`INSERT INTO pool (series_id, entity_id, seq) VALUES (?, ?, ?)`);
  names.forEach((n, i) => ins.run(id, E(n), i));
}

/** slots 按规则槽位顺序给角色名，null 表示这步还没录 */
function setDraft(id: number, slots: (string | null)[]) {
  const ins = d.prepare(`INSERT INTO draft_actions (series_id, slot_index, entity_id) VALUES (?, ?, ?)`);
  slots.forEach((n, i) => {
    if (n) ins.run(id, i, E(n));
  });
}

function setRounds(
  id: number,
  rounds: {
    idx: number;
    initiative: Side | null;
    s0: string | null;
    s1: string | null;
    result: string;
    winKind?: string;
  }[],
) {
  const ins = d.prepare(
    `INSERT INTO rounds (series_id, idx, initiative_side, side0_entity, side1_entity, result, win_kind)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const r of rounds) {
    ins.run(id, r.idx, r.initiative, r.s0 ? E(r.s0) : null, r.s1 ? E(r.s1) : null, r.result, r.winKind ?? '');
  }
}

/* ================================================================== */
/* log1 —— 纯pick 规则（当时叫"不完整bp"）：抽 6，无 ban，先手先 pick   */
/* ================================================================== */
{
  const id = newSeries('wsq', 'mzy', 0, 'v1-pick6', '2026-08-01', 'log1 纯pick');
  setPool(id, ['艾娅', '拔刀', '冰女', '妮妮', '妮娜', '阿兰']);
  // 先手1pick 阿兰 / 后手23pick 拔刀 艾娅 / 先手45pick 冰女 妮娜 / 后手6pick 妮妮
  setDraft(id, ['阿兰', '拔刀', '艾娅', '冰女', '妮娜', '妮妮']);
  setRounds(id, [
    // round1: 阿兰 vs 艾娅，BP先手方(wsq)选先攻 → 自己先攻；阿兰胜
    { idx: 1, initiative: 0, s0: '阿兰', s1: '艾娅', result: 'side0' },
    // round2: 妮娜 vs 拔刀，上轮败方(mzy)选先攻 → 自己先攻；妮娜胜
    { idx: 2, initiative: 1, s0: '妮娜', s1: '拔刀', result: 'side0' },
  ]);
}

/* ================================================================== */
/* log2 —— 旧BP（已停用）：抽 10，各 1 ban，先手先 pick                */
/* ================================================================== */
{
  const id = newSeries('mzy', 'wsq', 0, 'v2-bp10-old', '2026-08-02', 'log2 旧BP');
  setPool(id, ['妖姬', '娜吉', '芙芙', '拔刀', '火女', '冰女', '妮妮', '德鲁伊', '骇客', '怪盗']);
  // 先手1ban 冰女 / 后手2ban 骇客 / 先手1pick 拔刀 / 后手23pick 德鲁伊 娜吉
  // 先手45pick 芙芙 怪盗 / 后手6pick 妖姬
  setDraft(id, ['冰女', '骇客', '拔刀', '德鲁伊', '娜吉', '芙芙', '怪盗', '妖姬']);
  setRounds(id, [
    { idx: 1, initiative: 0, s0: '怪盗', s1: '妖姬', result: 'side0' },
    { idx: 2, initiative: 1, s0: '拔刀', s1: '德鲁伊', result: 'side1' },
    { idx: 3, initiative: null, s0: null, s1: null, result: 'double_forfeit' },
  ]);
}

/* ================================================================== */
/* log3 —— 现行BP：抽 10，各 1 ban，**后手**先 pick；打到一半          */
/* ================================================================== */
{
  const id = newSeries('mzy', 'zhj', 0, 'v3-bp10', '2026-08-03', 'log3 现行BP（进行中）');
  setPool(id, ['娜吉', '火女', '怪盗', '拔刀', '妖姬', '芙芙', '妮妮', '商旅', '艾娅', '骇客']);
  // 先手1ban 怪盗 / 后手2ban 骇客 / 后手1pick 芙芙 / 先手23pick 拔刀 艾娅
  // 后手45pick 商旅 娜吉 / 先手6pick 妮妮
  setDraft(id, ['怪盗', '骇客', '芙芙', '拔刀', '艾娅', '商旅', '娜吉', '妮妮']);
  setRounds(id, [
    { idx: 1, initiative: 0, s0: '妮妮', s1: '芙芙', result: 'pending' },
  ]);
}

/* ================================================================== */
/* cs2 单挑 —— 没有抽池 / 没有 ban-pick，建局后直接录轮次              */
/* ================================================================== */
{
  const CS2 = 'cs2';
  const modeId = new Map(listEntities(CS2).map((e) => [e.name, e.id]));
  const M = (n: string) => modeId.get(n)!;

  const cs2Series = (
    p0: string,
    p1: string,
    rulesetKey: string,
    playedAt: string,
    rounds: { idx: number; s0: string; s1: string; result: string; winKind?: string }[],
  ) => {
    const res = d
      .prepare(`INSERT INTO series (game, ruleset_key, played_at, bp_first_side, note) VALUES (?, ?, ?, 0, '')`)
      .run(CS2, rulesetKey, playedAt);
    const id = Number(res.lastInsertRowid);
    const ins = d.prepare(`INSERT INTO series_players (series_id, side, player_id) VALUES (?, ?, ?)`);
    ins.run(id, 0, ensurePlayer(CS2, p0));
    ins.run(id, 1, ensurePlayer(CS2, p1));
    const insR = d.prepare(
      `INSERT INTO rounds (series_id, idx, initiative_side, side0_entity, side1_entity, result, win_kind)
       VALUES (?, ?, NULL, ?, ?, ?, ?)`,
    );
    for (const r of rounds) insR.run(id, r.idx, M(r.s0), M(r.s1), r.result, r.winKind ?? '');
    return id;
  };

  // BO3：wsq 2:1 mzy
  cs2Series('wsq', 'mzy', 'bo3-modes', '2026-08-05', [
    { idx: 1, s0: '手枪单挑', s1: '手枪单挑', result: 'side0', winKind: '战胜' },
    { idx: 2, s0: '长枪单挑', s1: '长枪单挑', result: 'side1', winKind: '战胜' },
    { idx: 3, s0: '狙击单挑', s1: '狙击单挑', result: 'side0', winKind: '积分胜' },
  ]);

  // BO3 打到 2:0 提前结束
  cs2Series('wsq', 'zhj', 'bo3-modes', '2026-08-06', [
    { idx: 1, s0: '手枪单挑', s1: '手枪单挑', result: 'side1' },
    { idx: 2, s0: '长枪单挑', s1: '长枪单挑', result: 'side1' },
  ]);

  // solo 三项：整块记成一轮
  cs2Series('mzy', 'zhj', 'solo-three', '2026-08-07', [
    { idx: 1, s0: 'solo三项', s1: 'solo三项', result: 'side0', winKind: '积分胜' },
  ]);

  // BO5：mzy 3:1 wsq
  cs2Series('mzy', 'wsq', 'bo5-modes', '2026-08-08', [
    { idx: 1, s0: '手枪单挑', s1: '手枪单挑', result: 'side0' },
    { idx: 2, s0: '长枪单挑', s1: '长枪单挑', result: 'side0' },
    { idx: 3, s0: '狙击单挑', s1: '狙击单挑', result: 'side1' },
    { idx: 4, s0: '手枪单挑', s1: '手枪单挑', result: 'side0' },
  ]);
}

/* ================================================================== */
/* 核对输出                                                            */
/* ================================================================== */
const facts = buildFacts(GAME);
console.log('\n=== crash 事实行数 ===');
console.log(
  `series_entity=${facts.series_entity.length}  series_slot=${facts.series_slot.length}  ` +
    `round_side=${facts.round_side.length}  series_player=${facts.series_player.length}`,
);

const cs2Facts = buildFacts('cs2');
console.log('=== cs2 事实行数 ===');
console.log(
  `series_entity=${cs2Facts.series_entity.length}  series_slot=${cs2Facts.series_slot.length}  ` +
    `round_side=${cs2Facts.round_side.length}  series_player=${cs2Facts.series_player.length}`,
);

const show = (slug: string, key: string) => {
  const recipe = getPresets(slug).find((p) => p.key === key)!;
  const t = computeTable(recipe, slug === GAME ? facts : cs2Facts);
  console.log(`\n=== [${slug}] ${t.title} ===`);
  const head = [...t.columns.map((c) => c.label), ...t.metricCols.map((m) => m.label)];
  console.log(head.join('\t'));
  for (const r of t.rows) {
    const cells = [
      ...r.keys,
      ...r.values.map((v, i) =>
        v.den === 0
          ? '—'
          : t.metricCols[i].ratio
            ? `${(v.value * 100).toFixed(1)}% (${v.num}/${v.den})`
            : `${Number.isInteger(v.value) ? v.value : v.value.toFixed(2)} (${v.num}/${v.den})`,
      ),
    ];
    console.log(cells.join('\t'));
  }
};

for (const k of ['funnel', 'buff-split', 'buff-level', 'initiative', 'player-vs-player', 'comeback']) {
  show(GAME, k);
}

for (const k of ['mode-winrate', 'player-mode', 'player-vs-player', 'scoreboard']) {
  show('cs2', k);
}

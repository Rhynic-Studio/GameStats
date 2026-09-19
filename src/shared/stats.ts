import type {
  DimensionDef,
  FactBundle,
  Grain,
  MetricDef,
  SeriesEntityFact,
  SeriesPlayerFact,
  SeriesSlotFact,
  RoundSideFact,
  StatRecipe,
  StatTable,
  StatValue,
} from './types.ts';

/**
 * 统计引擎：事实粒度 × 维度 × 指标。
 *
 * 全部在内存里 group by。数据量是"几个人打几百场"，SQL 聚合带来的复杂度不值得。
 * 想加新统计：优先在这里加一个维度或指标，再写一条配方；只有确实特殊的才写代码。
 */

const pct = (num: number, den: number): StatValue => ({
  num,
  den,
  value: den === 0 ? 0 : num / den,
});

/** 计数型指标：value 就是次数本身，不是比例 */
const cnt = (n: number): StatValue => ({ num: n, den: n, value: n });

const sum = (rows: number[]) => rows.reduce((a, b) => a + b, 0);

/* ------------------------------------------------------------------ */
/* 维度池                                                              */
/* ------------------------------------------------------------------ */

type DimMap<G extends Grain> = Record<string, DimensionDef<G>>;

const sideName = (who: 'first' | 'second') => (who === 'first' ? '先手方' : '后手方');

export const DIMENSIONS: { [G in Grain]: DimMap<G> } = {
  /* 每（系列赛 × 角色）—— 漏斗统计 */
  series_entity: {
    entity: { key: 'entity', label: '角色', grain: 'series_entity', get: (r) => r.entityName },
    ruleset: { key: 'ruleset', label: 'BP规则', grain: 'series_entity', get: (r) => r.rulesetKey },
    inPool: {
      key: 'inPool',
      label: '是否进池',
      grain: 'series_entity',
      get: (r: SeriesEntityFact) => (r.inPool ? '进池' : '没进池'),
    },
    everPlayed: {
      key: 'everPlayed',
      label: '是否上场过',
      grain: 'series_entity',
      get: (r: SeriesEntityFact) => (r.played ? '上场过' : '没上场'),
    },
    month: { key: 'month', label: '月份', grain: 'series_entity', get: (r) => r.playedAt.slice(0, 7) },
  },

  /* 每（系列赛 × 槽位）—— 顺位统计，1ban率 / 首pick率 */
  series_slot: {
    entity: { key: 'entity', label: '角色', grain: 'series_slot', get: (r) => r.entityName },
    slot: {
      key: 'slot',
      label: '槽位',
      grain: 'series_slot',
      get: (r: SeriesSlotFact) => `${r.slotNo}${r.kind}`,
    },
    kind: {
      key: 'kind',
      label: '动作',
      grain: 'series_slot',
      get: (r: SeriesSlotFact) => (r.kind === 'ban' ? 'ban' : 'pick'),
    },
    who: { key: 'who', label: '执行方', grain: 'series_slot', get: (r) => sideName(r.who) },
    ruleset: { key: 'ruleset', label: 'BP规则', grain: 'series_slot', get: (r) => r.rulesetKey },
  },

  /* 每（轮 × 一方）—— 对位、玩家×角色、先攻 */
  round_side: {
    entity: { key: 'entity', label: '角色', grain: 'round_side', get: (r) => r.entityName },
    opponentEntity: {
      key: 'opponentEntity',
      label: '对手角色',
      grain: 'round_side',
      get: (r) => r.opponentEntityName,
    },
    player: { key: 'player', label: '玩家', grain: 'round_side', get: (r) => r.playerName },
    opponent: { key: 'opponent', label: '对手', grain: 'round_side', get: (r) => r.opponentName },
    initiative: {
      key: 'initiative',
      label: '先攻',
      grain: 'round_side',
      get: (r: RoundSideFact) => (r.isInitiative ? '先攻' : '后攻'),
    },
    bpFirst: {
      key: 'bpFirst',
      label: 'BP顺位',
      grain: 'round_side',
      get: (r: RoundSideFact) => (r.isBpFirst ? 'BP先手' : 'BP后手'),
    },
    roundIdx: { key: 'roundIdx', label: '轮次', grain: 'round_side', get: (r) => `第${r.roundIdx}轮` },
    ruleset: { key: 'ruleset', label: 'BP规则', grain: 'round_side', get: (r) => r.rulesetKey },
    month: { key: 'month', label: '月份', grain: 'round_side', get: (r) => r.playedAt.slice(0, 7) },

    /* ---- 劣势加强（输一轮，之后的战斗里角色获得加强）---- */
    buff: {
      key: 'buff',
      label: '加强',
      grain: 'round_side',
      get: (r: RoundSideFact) => (r.buffs > 0 ? '带加强' : '无加强'),
    },
    buffLevel: {
      key: 'buffLevel',
      label: '加强层数',
      grain: 'round_side',
      get: (r: RoundSideFact) => `+${r.buffs}`,
    },
    buffEdge: {
      key: 'buffEdge',
      label: '加强差',
      grain: 'round_side',
      get: (r: RoundSideFact) => (r.buffEdge > 0 ? '加强领先' : r.buffEdge < 0 ? '加强落后' : '加强持平'),
    },
  },

  /* 每（系列赛 × 一方）—— 玩家 vs 玩家、BO 胜率 */
  series_player: {
    player: { key: 'player', label: '玩家', grain: 'series_player', get: (r) => r.playerName },
    opponent: { key: 'opponent', label: '对手', grain: 'series_player', get: (r) => r.opponentName },
    bpFirst: {
      key: 'bpFirst',
      label: 'BP顺位',
      grain: 'series_player',
      get: (r: SeriesPlayerFact) => (r.isBpFirst ? 'BP先手' : 'BP后手'),
    },
    ruleset: { key: 'ruleset', label: 'BP规则', grain: 'series_player', get: (r) => r.rulesetKey },
    month: { key: 'month', label: '月份', grain: 'series_player', get: (r) => r.playedAt.slice(0, 7) },
    lostRound1: {
      key: 'lostRound1',
      label: '首轮结果',
      grain: 'series_player',
      get: (r: SeriesPlayerFact) => (r.lostRound1 ? '首轮败' : '首轮胜'),
    },
    maxBuffs: {
      key: 'maxBuffs',
      label: '最高加强',
      grain: 'series_player',
      get: (r: SeriesPlayerFact) => `+${r.maxBuffs}`,
    },
  },
};

/* ------------------------------------------------------------------ */
/* 指标池                                                              */
/* ------------------------------------------------------------------ */

type MetricMap<G extends Grain> = Record<string, MetricDef<G>>;

export const METRICS: { [G in Grain]: MetricMap<G> } = {
  series_entity: {
    pool_rate: {
      key: 'pool_rate',
      label: '进池率',
      grain: 'series_entity',
      ratio: true,
      compute: (rows: SeriesEntityFact[]) =>
        pct(rows.filter((r) => r.inPool).length, rows.length),
    },
    ban_rate: {
      key: 'ban_rate',
      label: '进池后被ban率',
      grain: 'series_entity',
      ratio: true,
      // 分母 = 该角色**进池的**对局，避免"这把没抽到它"污染 BP 偏好
      compute: (rows: SeriesEntityFact[]) => {
        const pool = rows.filter((r) => r.inPool);
        return pct(pool.filter((r) => r.banned).length, pool.length);
      },
    },
    pick_rate: {
      key: 'pick_rate',
      label: '进池后被pick率',
      grain: 'series_entity',
      ratio: true,
      compute: (rows: SeriesEntityFact[]) => {
        const pool = rows.filter((r) => r.inPool);
        return pct(pool.filter((r) => r.picked).length, pool.length);
      },
    },
    play_rate: {
      key: 'play_rate',
      label: '被选后上场率',
      grain: 'series_entity',
      ratio: true,
      // 分母只数**被 pick 且对局已打完**的场次。这样两件事被分开：
      //   - 被 ban 导致根本没机会上场 → 不进这个分母（不然被 ban 会假装成"选了不上"）
      //   - 被 pick 但因 2:0 提前结束没轮到上场 → 进分母、算没上场，这才是真实信息
      compute: (rows: SeriesEntityFact[]) => {
        const picked = rows.filter((r) => r.picked && r.concluded);
        return pct(picked.filter((r) => r.played).length, picked.length);
      },
    },
    win_rate: {
      key: 'win_rate',
      label: '上场胜率',
      grain: 'series_entity',
      ratio: true,
      compute: (rows: SeriesEntityFact[]) =>
        pct(sum(rows.map((r) => r.playedWins)), sum(rows.map((r) => r.playedWins + r.playedLosses))),
    },
    pool_times: {
      key: 'pool_times',
      label: '进池次数',
      grain: 'series_entity',
      ratio: false,
      compute: (rows) => cnt(rows.filter((r) => r.inPool).length),
    },
    play_times: {
      key: 'play_times',
      label: '上场轮数',
      grain: 'series_entity',
      ratio: false,
      compute: (rows) => cnt(sum(rows.map((r) => r.playedWins + r.playedLosses))),
    },
  },

  series_slot: {
    slot_share: {
      key: 'slot_share',
      label: '占该槽位比例',
      grain: 'series_slot',
      ratio: true,
      compute: (rows) => pct(rows.filter((r) => r.entityId !== null).length, rows.length),
    },
    times: {
      key: 'times',
      label: '次数',
      grain: 'series_slot',
      ratio: false,
      compute: (rows) => cnt(rows.length),
    },
  },

  round_side: {
    win_rate: {
      key: 'win_rate',
      label: '胜率',
      grain: 'round_side',
      ratio: true,
      compute: (rows: RoundSideFact[]) => pct(rows.filter((r) => r.won).length, rows.length),
    },
    rounds: {
      key: 'rounds',
      label: '出场轮数',
      grain: 'round_side',
      ratio: false,
      compute: (rows) => cnt(rows.length),
    },
  },

  series_player: {
    series_win_rate: {
      key: 'series_win_rate',
      label: 'BO胜率',
      grain: 'series_player',
      ratio: true,
      compute: (rows: SeriesPlayerFact[]) => pct(rows.filter((r) => r.won).length, rows.length),
    },
    draw_rate: {
      key: 'draw_rate',
      label: '平局率',
      grain: 'series_player',
      ratio: true,
      compute: (rows: SeriesPlayerFact[]) => pct(rows.filter((r) => r.drawn).length, rows.length),
    },
    series_count: {
      key: 'series_count',
      label: '场次',
      grain: 'series_player',
      ratio: false,
      compute: (rows) => cnt(rows.length),
    },
    comeback_rate: {
      key: 'comeback_rate',
      label: '首轮败后翻盘率',
      grain: 'series_player',
      ratio: true,
      // 分母只有"输掉第 1 轮"的场次
      compute: (rows: SeriesPlayerFact[]) => {
        const lost = rows.filter((r) => r.lostRound1);
        return pct(lost.filter((r) => r.comeback).length, lost.length);
      },
    },
    net_score: {
      key: 'net_score',
      label: '场均净胜轮',
      grain: 'series_player',
      ratio: false,
      compute: (rows) => {
        if (rows.length === 0) return pct(0, 0);
        const d = sum(rows.map((r) => r.scoreFor - r.scoreAgainst));
        return { num: d, den: rows.length, value: d / rows.length };
      },
    },
  },
};

/* ------------------------------------------------------------------ */
/* 执行配方                                                            */
/* ------------------------------------------------------------------ */

export function computeTable(recipe: StatRecipe, facts: FactBundle): StatTable {
  const allRows = facts[recipe.grain] as any[];
  const rows = recipe.filter ? allRows.filter(recipe.filter as any) : allRows;

  const dims = recipe.dimensions.map((k) => {
    const d = (DIMENSIONS[recipe.grain] as Record<string, DimensionDef>)[k];
    if (!d) throw new Error(`配方 ${recipe.key}: 未知维度 ${recipe.grain}.${k}`);
    return d;
  });
  const mets = recipe.metrics.map((k) => {
    const m = (METRICS[recipe.grain] as Record<string, MetricDef>)[k];
    if (!m) throw new Error(`配方 ${recipe.key}: 未知指标 ${recipe.grain}.${k}`);
    return m;
  });

  // 按维度元组分组；任一维度取值为 null 的行不参与（例如"未选"角色在按角色分组时）
  const groups = new Map<string, { keys: string[]; rows: any[] }>();
  for (const row of rows) {
    const keys = dims.map((d) => d.get(row));
    if (keys.some((k) => k === null || k === undefined)) continue;
    const id = keys.join('\u0000');
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { keys: keys as string[], rows: [] }));
    g.rows.push(row);
  }

  let out = [...groups.values()].map((g) => ({
    keys: g.keys,
    values: mets.map((m) => m.compute(g.rows as any)),
  }));

  const sortKey = recipe.sortBy ?? recipe.metrics[0];
  const sortIdx = Math.max(0, recipe.metrics.indexOf(sortKey));
  const desc = recipe.sortDesc ?? true;
  out.sort((a, b) => {
    const av = a.values[sortIdx];
    const bv = b.values[sortIdx];
    // 分母为 0 的行永远沉底，避免"0/0 显示成 0%"霸榜
    if (av.den === 0 !== (bv.den === 0)) return av.den === 0 ? 1 : -1;
    const d = av.value - bv.value;
    return desc ? -d : d;
  });

  if (recipe.minDen && recipe.minDen > 1) {
    out = out.filter((r) => r.values.some((v) => v.den >= recipe.minDen!));
  }

  return {
    recipeKey: recipe.key,
    title: recipe.title,
    note: recipe.note,
    columns: dims.map((d) => ({ key: d.key, label: recipe.labels?.[d.key] ?? d.label })),
    metricCols: mets.map((m) => ({
      key: m.key,
      label: recipe.labels?.[m.key] ?? m.label,
      ratio: m.ratio,
    })),
    rows: out,
    rowCount: rows.length,
  };
}

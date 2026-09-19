/**
 * 通用内核的类型定义。
 *
 * 这里**不出现任何具体游戏的词**（没有"角色"、没有"ban"的具体数量）。
 * 每个游戏通过 GameDef 声明自己的规则，内核只认这些声明。
 */

export type Side = 0 | 1;

export const other = (s: Side): Side => (s === 0 ? 1 : 0);

/* ------------------------------------------------------------------ */
/* 游戏定义                                                            */
/* ------------------------------------------------------------------ */

/** 游戏里的"可选对象"种类：crash 的角色、lol 的英雄、cs2 的模式 */
export interface EntityTypeDef {
  key: string; // 'character'
  label: string; // '角色'
}

/** BP 的一个动作槽位：谁动 + 做什么 */
export interface DraftSlot {
  who: 'first' | 'second';
  kind: 'ban' | 'pick';
}

/**
 * 一套对局规则。规则会演进，所以它们是**并存的版本**而不是"当前规则"。
 * 对局必须记录自己用的哪一套，否则跨规则统计会串味。
 *
 * 它描述的是「一场对局的形状」：抽不抽池、ban/pick 顺序、最多打几轮、赢几轮算赢。
 * 没有 BP 阶段的游戏（cs2 单挑、以后的纯比分游戏）把 poolSize / slots 省掉即可。
 */
export interface RulesetDef {
  key: string;
  label: string;
  /** 从全集里抽几个进池。没有抽池环节就省略 */
  poolSize?: number;
  /** ban / pick 的动作序列，顺序即执行顺序。没有 BP 环节就省略 */
  slots?: DraftSlot[];
  /** 最多打几轮。省略时由 pick 槽位数推导（每方 pick 几个 = 打几轮）*/
  rounds?: number;
  /** 这套规则的胜负线。省略时用 GameDef 上的默认值 */
  winBy?: number;
  bestOf?: number;
  /** 停用的规则不再出现在新建对局的选项里，但历史数据照常展示 */
  deprecated?: boolean;
  note?: string;
}

/** 一轮的结果类型（可配置，例如以后加"掉线判负"） */
export interface RoundResultDef {
  key: string;
  label: string;
  /** 哪个 side 获胜；null = 无人获胜（双方弃赛） */
  winner: Side | null;
  /** 这一轮是否真的打过（用于"未打完"和"弃赛"的区分） */
  played: boolean;
}

export type EntryStep = 'meta' | 'pool' | 'draft' | 'rounds';

/**
 * 「1 胜 / 投降 / 双方弃赛 / 未打完」这套结果类型几乎所有对战游戏都一样，
 * 抽出来共用。游戏想加自己的（掉线判负、超时…）就在自己的 GameDef 里覆盖。
 */
export const DEFAULT_ROUND_RESULTS: RoundResultDef[] = [
  { key: 'side0', label: '玩家1 胜', winner: 0, played: true },
  { key: 'side1', label: '玩家2 胜', winner: 1, played: true },
  { key: 'side0_forfeit', label: '玩家1 投降', winner: 1, played: false },
  { key: 'side1_forfeit', label: '玩家2 投降', winner: 0, played: false },
  { key: 'double_forfeit', label: '双方弃赛', winner: null, played: false },
  { key: 'pending', label: '未打完', winner: null, played: false },
];

export interface GameDef {
  slug: string;
  name: string;
  tagline: string;
  entityTypes: EntityTypeDef[];
  rulesets: RulesetDef[];
  defaultRulesetKey: string;
  /** BO3 → bestOf 3, winBy 2 */
  bestOf: number;
  winBy: number;
  roundResults: RoundResultDef[];
  /** 胜利条件（可选填），如 战胜 / 积分胜 */
  winKinds: string[];
  /**
   * 初始实体名单。只在"这个游戏在库里一个实体都没有"的时候播种，
   * 之后以数据库为准（可以在界面上改名/加别名/停用）。
   */
  seedEntities: { name: string; aliases?: string }[];
  /** 录入分几步，顺序即流程 */
  entrySteps: EntryStep[];
  /** 首页默认展示的统计配方 key */
  statPresets: string[];
}

/* ------------------------------------------------------------------ */
/* 规则派生量（内核用它，游戏不用自己算）                                */
/* ------------------------------------------------------------------ */

/** 没有 BP 环节的规则返回空数组 —— 调用方不用到处写 `?? []` */
export const slotsOf = (rs: RulesetDef): DraftSlot[] => rs.slots ?? [];

/** 这套规则有没有 ban/pick 阶段 */
export const hasDraft = (rs: RulesetDef): boolean => slotsOf(rs).length > 0;

export const poolSizeOf = (rs: RulesetDef): number => rs.poolSize ?? 0;

export const slotsOfKind = (rs: RulesetDef, kind: 'ban' | 'pick') =>
  slotsOf(rs)
    .map((s, i) => ({ ...s, index: i }))
    .filter((s) => s.kind === kind);

/** 每方能 pick 几个 —— 也就是最多打几轮 */
export const picksPerSide = (rs: RulesetDef) => slotsOfKind(rs, 'pick').length / 2;

/** 一次 BO 最多打几轮。没写 rounds 就由 pick 数推导 */
export const maxRoundsOf = (rs: RulesetDef): number => rs.rounds ?? Math.max(1, picksPerSide(rs));

export const winByOf = (rs: RulesetDef, game: { winBy: number }): number => rs.winBy ?? game.winBy;

export const bestOfOf = (rs: RulesetDef, game: { bestOf: number }): number => rs.bestOf ?? game.bestOf;

/* ------------------------------------------------------------------ */
/* 统计引擎：事实粒度 × 维度 × 指标                                     */
/* ------------------------------------------------------------------ */

export type Grain = 'series_entity' | 'series_slot' | 'round_side' | 'series_player';

/** 每（系列赛 × 角色）一行 —— 漏斗统计的载体：进池 / 被ban / 被pick / 上场 / 胜 */
export interface SeriesEntityFact {
  seriesId: number;
  playedAt: string;
  rulesetKey: string;
  entityId: number;
  entityName: string;
  inPool: boolean;
  banned: boolean;
  picked: boolean;
  played: boolean;
  playedWins: number;
  playedLosses: number;
  /** 这场对局是否已经打完。上场率的分母只数打完的局 —— 没打完的还没轮到上场 */
  concluded: boolean;
}

/** 每（系列赛 × 槽位）一行 —— "1ban率""首pick率"这类顺位统计的载体 */
export interface SeriesSlotFact {
  seriesId: number;
  playedAt: string;
  rulesetKey: string;
  slotIndex: number;
  slotNo: number; // ban / pick 各自从 1 开始编号（与 log 写法一致）
  kind: 'ban' | 'pick';
  who: 'first' | 'second';
  entityId: number | null;
  entityName: string | null;
}

/** 每（轮 × 一方）一行 —— 对位、玩家×角色、先攻、buff 的载体 */
export interface RoundSideFact {
  seriesId: number;
  playedAt: string;
  rulesetKey: string;
  roundIdx: number;
  side: Side;
  playerId: number;
  playerName: string;
  opponentId: number;
  opponentName: string;
  entityId: number;
  entityName: string;
  opponentEntityId: number;
  opponentEntityName: string;
  won: boolean;
  isInitiative: boolean;
  isBpFirst: boolean;
  /** 本轮开打前，本方已经输掉的轮数 = 角色吃到的加强层数 */
  buffs: number;
  /** 对手本轮的加强层数 */
  opponentBuffs: number;
  /** 领先/落后：本方加强层数 - 对手加强层数 */
  buffEdge: number;
}

/** 每（系列赛 × 一方）一行 —— 玩家 vs 玩家、BO 胜率的载体 */
export interface SeriesPlayerFact {
  seriesId: number;
  playedAt: string;
  rulesetKey: string;
  side: Side;
  playerId: number;
  playerName: string;
  opponentId: number;
  opponentName: string;
  won: boolean;
  drawn: boolean;
  scoreFor: number;
  scoreAgainst: number;
  isBpFirst: boolean;
  /** 输掉了第 1 轮（之后一直背着 comeback 局面） */
  lostRound1: boolean;
  /** 输掉第 1 轮之后仍然赢下整个 BO */
  comeback: boolean;
  /** 本方吃到的最大加强层数 */
  maxBuffs: number;
}

export interface FactBundle {
  series_entity: SeriesEntityFact[];
  series_slot: SeriesSlotFact[];
  round_side: RoundSideFact[];
  series_player: SeriesPlayerFact[];
}

/** 一次统计的分母/分子，界面上直接显示成 `12 / 34` */
export interface StatValue {
  value: number;
  num: number;
  den: number;
}

export interface DimensionDef<G extends Grain = Grain> {
  key: string;
  label: string;
  grain: G;
  get: (row: FactBundle[G][number]) => string | null;
}

export interface MetricDef<G extends Grain = Grain> {
  key: string;
  label: string;
  grain: G;
  /** 是不是"越大越好"的比率（决定排序方向与显示成百分比还是整数） */
  ratio: boolean;
  compute: (rows: FactBundle[G][number][]) => StatValue;
}

/**
 * 一条统计配方。配方是**数据**，所以"想看新维度"通常只是加一条配方，不用写代码。
 * 配方写在游戏目录里（`src/games/<game>/presets.ts`），可以带过滤函数。
 */
export interface StatRecipe {
  key: string;
  title: string;
  grain: Grain;
  /** 分组维度（dimension key），决定表格的行 */
  dimensions: string[];
  /** 要算的指标（metric key），决定表格的列 */
  metrics: string[];
  /** 行级过滤，例如"只看 ban 槽位" */
  filter?: (row: FactBundle[Grain][number]) => boolean;
  /**
   * 覆盖列标题。内核里的维度叫 `entity`（标签「角色」），
   * 但 cs2 里同一个维度是「模式」—— 游戏在自己的配方里改个名就行，内核不用知道。
   */
  labels?: Record<string, string>;
  note?: string;
  /** 生成时的附加排序：默认按第一个指标降序 */
  sortBy?: string;
  sortDesc?: boolean;
  /** 样本数小于该值的行不显示 */
  minDen?: number;
}

export interface StatTable {
  recipeKey: string;
  title: string;
  note?: string;
  /** 分组维度列 */
  columns: { key: string; label: string }[];
  /** 指标列 */
  metricCols: { key: string; label: string; ratio: boolean }[];
  rows: { keys: string[]; values: StatValue[] }[];
  /** 参与统计的原始行数，界面上用来显示"样本量" */
  rowCount: number;
}

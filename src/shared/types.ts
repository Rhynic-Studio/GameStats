export interface Player {
  id: number;
  name: string;
}

export interface ListItem {
  id: number;
  name: string;
}

export interface MatchSummary {
  id: number;
  playedAt: string;
  playerA: Player;
  playerB: Player;
  mode: ListItem;
  scoreA: number;
  scoreB: number;
  rounds: number;
  winner: 'A' | 'B' | null;
  note: string;
}

export interface Entry {
  itemId: number;
  scoreA: number;
  scoreB: number;
}

export interface MatchDetail extends MatchSummary {
  entries: Entry[];
}

/** 局数 = 2 × 胜方得分 − 1 */
export const roundsOf = (a: number, b: number) => 2 * Math.max(a, b) - 1;

/* ------------------------------------------------------------------ */
/* 统计表                                                              */
/* ------------------------------------------------------------------ */

/** 一个格子：名单类的列给 id（排序用）和名字，数字类的列给数，没数据给 null */
export type Cell = number | { id: number; name: string } | null;

interface TableCommon {
  /** 左栏挂在哪一项下面 */
  navKey: string;
  /** 左栏分组 */
  navGroup?: string;
  /** 左栏项名 */
  navLabel: string;
  /** 卡片标题 */
  title: string;
}

export interface GridTable extends TableCommon {
  kind: 'grid';
  columns: { key: string; label: string; kind: 'list' | 'number' | 'percent' }[];
  rows: Record<string, Cell>[];
}

export interface MatrixTable extends TableCommon {
  kind: 'matrix';
  rowHeader: string;
  colHeader: string;
  cols: { id: number; name: string }[];
  rows: { id: number; name: string; cells: (number | null)[] }[];
}

export type StatTable = GridTable | MatrixTable;

/* ------------------------------------------------------------------ */
/* crash                                                               */
/* ------------------------------------------------------------------ */

export interface CrashRole extends ListItem {}

export interface DraftSlotDef {
  kind: 'ban' | 'pick';
  side: 'first' | 'second';
}

export interface CrashRuleset {
  key: string;
  label: string;
  poolSize: number;
  slots: DraftSlotDef[];
}

export interface CrashRound {
  idx: number;
  initiativeSide: 0 | 1 | null;
  roleA: number | null;
  roleB: number | null;
  result: string;
  winKind: string;
}

export interface CrashMatchDetail {
  id: number;
  playedAt: string;
  playerA: Player;
  playerB: Player;
  rule: string;
  ruleLabel: string;
  firstSide: 0 | 1;
  note: string;
  pool: number[];
  /** 槽位序号 → 角色 id */
  draft: Record<number, number>;
  rounds: CrashRound[];
  score: [number, number];
  winner: 0 | 1 | null;
  isDraw: boolean;
  concluded: boolean;
}

export interface CrashSummary {
  id: number;
  playedAt: string;
  playerA: Player;
  playerB: Player;
  rule: string;
  ruleLabel: string;
  firstSide: 0 | 1;
  note: string;
  score: [number, number];
  winner: 0 | 1 | null;
  isDraw: boolean;
  concluded: boolean;
  poolCount: number;
  draftCount: number;
  roundsDone: number;
}

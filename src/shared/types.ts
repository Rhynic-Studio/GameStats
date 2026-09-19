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

/** 统计表里的一个格子：名单类的列给 id（排序用）和名字，数字类的列给数 */
export type Cell = number | { id: number; name: string } | null;

export interface StatTable {
  key: string;
  /** 分区名。有的话先显示分区，再显示这一项 */
  group?: string;
  title: string;
  columns: { key: string; label: string; kind: 'list' | 'number' | 'percent' }[];
  rows: Record<string, Cell>[];
}

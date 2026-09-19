import type { CrashRuleset } from './types.ts';

const F = 'first' as const;
const S = 'second' as const;
const P = (side: 'first' | 'second') => ({ kind: 'pick' as const, side });
const B = (side: 'first' | 'second') => ({ kind: 'ban' as const, side });

/** 两套规则。slots 就是 ban / pick 的执行顺序 */
export const RULES: Record<string, CrashRuleset> = {
  first: {
    key: 'first',
    label: '初见模式',
    poolSize: 6,
    slots: [P(F), P(S), P(S), P(F), P(F), P(S)],
  },
  bp: {
    key: 'bp',
    label: 'bp模式',
    poolSize: 10,
    slots: [B(F), B(S), P(S), P(F), P(F), P(S), P(S), P(F)],
  },
};

export const ROUND_RESULTS = [
  { key: 'a', label: '玩家1 胜', winner: 0 },
  { key: 'b', label: '玩家2 胜', winner: 1 },
  { key: 'a_forfeit', label: '玩家1 投降', winner: 1 },
  { key: 'b_forfeit', label: '玩家2 投降', winner: 0 },
  { key: 'double_forfeit', label: '双方弃赛', winner: null },
  { key: 'pending', label: '未打完', winner: null },
];

export const MAX_ROUNDS = 3;
export const WIN_BY = 2;

export const winnerOf = (result: string): 0 | 1 | null =>
  (ROUND_RESULTS.find((r) => r.key === result)?.winner ?? null) as 0 | 1 | null;

export const isPlayed = (result: string) => result === 'a' || result === 'b';

export const sideOf = (slot: { side: 'first' | 'second' }, firstSide: 0 | 1): 0 | 1 =>
  slot.side === 'first' ? firstSide : ((1 - firstSide) as 0 | 1);

/** 每轮开打前的大比分 —— 大比分不是 0 的一方带 buff */
export function scoreBefore(rounds: { idx: number; result: string }[], idx: number): [number, number] {
  const s: [number, number] = [0, 0];
  for (const r of rounds) {
    if (r.idx >= idx) break;
    const w = winnerOf(r.result);
    if (w !== null) s[w]++;
  }
  return s;
}


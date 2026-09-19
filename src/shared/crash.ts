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

/** 还没录结果时用的内部状态，不出现在选项里 */
export const PENDING = 'pending';

/** 轮结果。获胜 / 弃赛(算对方赢) / 平局 */
export const ROUND_RESULTS: { key: string; winner: 0 | 1 | null; played: boolean }[] = [
  { key: 'a', winner: 0, played: true },
  { key: 'b', winner: 1, played: true },
  { key: 'a_forfeit', winner: 1, played: false },
  { key: 'b_forfeit', winner: 0, played: false },
  { key: 'draw', winner: null, played: false },
];

export const WIN_KINDS = ['战斗胜利', '人气胜利'];

export const MAX_ROUNDS = 3;
export const WIN_BY = 2;

export const winnerOf = (result: string): 0 | 1 | null =>
  ROUND_RESULTS.find((r) => r.key === result)?.winner ?? null;

export const isPlayed = (result: string) => ROUND_RESULTS.find((r) => r.key === result)?.played === true;

/** 轮结果在界面上显示成什么（带上真的玩家名） */
export function resultLabel(key: string, a: string, b: string): string {
  switch (key) {
    case 'a':
      return `${a} 获胜`;
    case 'b':
      return `${b} 获胜`;
    case 'a_forfeit':
      return `${a} 弃赛（${b} 获胜）`;
    case 'b_forfeit':
      return `${b} 弃赛（${a} 获胜）`;
    case 'draw':
      return '平局';
    default:
      return '未录';
  }
}

export const sideOf = (slot: { side: 'first' | 'second' }, firstSide: 0 | 1): 0 | 1 =>
  slot.side === 'first' ? firstSide : ((1 - firstSide) as 0 | 1);

/** 每轮开打前的大比分 */
export function scoreBefore(rounds: { idx: number; result: string }[], idx: number): [number, number] {
  const s: [number, number] = [0, 0];
  for (const r of rounds) {
    if (r.idx >= idx) break;
    const w = winnerOf(r.result);
    if (w !== null) s[w]++;
  }
  return s;
}

/** 败方带 buff：自己输过（也就是对方的大比分不是 0） */
export function hasBuff(rounds: { idx: number; result: string }[], idx: number, side: 0 | 1): boolean {
  const s = scoreBefore(rounds, idx);
  return s[side === 0 ? 1 : 0] !== 0;
}

export const buffState = (mine: boolean, theirs: boolean): '都无' | '我优' | '我劣' | '都有' =>
  mine && theirs ? '都有' : mine ? '我优' : theirs ? '我劣' : '都无';

/** 这一轮由谁决定先攻：第 1 轮是 BP 先手方，之后是上一轮的败方 */
export function initiativeDecider(
  rounds: { idx: number; result: string }[],
  idx: number,
  firstSide: 0 | 1,
): 0 | 1 | null {
  if (idx === 1) return firstSide;
  const prev = rounds.find((r) => r.idx === idx - 1);
  if (!prev) return null;
  const w = winnerOf(prev.result);
  return w === null ? null : ((w === 0 ? 1 : 0) as 0 | 1);
}

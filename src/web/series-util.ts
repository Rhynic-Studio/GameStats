import type { RoundRow, Ruleset, SeriesDetail } from './api.ts';
import { maxRoundsOf as maxRoundsOfRuleset, slotsOf } from '../shared/types.ts';

export type WinnerFn = (resultKey: string) => 0 | 1 | null;

export const makeWinnerFn = (defs: { key: string; winner: 0 | 1 | null }[]): WinnerFn => {
  const m = new Map(defs.map((d) => [d.key, d.winner]));
  return (k) => m.get(k) ?? null;
};

export const sideOfWho = (detail: SeriesDetail, who: 'first' | 'second'): 0 | 1 =>
  who === 'first' ? detail.bpFirstSide : ((1 - detail.bpFirstSide) as 0 | 1);

/** 某一方这一场能上场的角色 = 他在 pick 槽位里选到的角色 */
export function pickedOfSide(detail: SeriesDetail): [number[], number[]] {
  const out: [number[], number[]] = [[], []];
  if (!detail.ruleset) return out;
  for (const a of detail.draft) {
    const slot = slotsOf(detail.ruleset as Ruleset)[a.slotIndex];
    if (!slot || slot.kind !== 'pick') continue;
    out[sideOfWho(detail, slot.who)].push(a.entityId);
  }
  return out;
}

export const maxRoundsOf = (detail: SeriesDetail) => maxRoundsOfRuleset(detail.ruleset as Ruleset);

/** 统一入口：某套规则最多打几轮（对 Ruleset 对象本身用） */
export const maxRoundsOfRs = (rs: Ruleset) => maxRoundsOfRuleset(rs);

/**
 * 某一轮开打前双方的加强层数。
 * 输掉一轮 → 本方之后所有战斗里的角色 +1 层，所以这里是**可叠加**的推导。
 */
export function buffsBeforeRound(
  detail: SeriesDetail,
  rounds: RoundRow[],
  idx: number,
  winnerOf: WinnerFn,
): [number, number] {
  const running: [number, number] = [0, 0];
  for (const r of rounds) {
    if (r.idx >= idx) break;
    const w = winnerOf(r.result);
    if (w !== null) running[w === 0 ? 1 : 0]++;
  }
  return running;
}

/** 这一轮的先攻该由谁选：第 1 轮是 BP 先手方，第 2 轮起是上一轮的败方 */
export function initiativeChooser(
  detail: SeriesDetail,
  rounds: RoundRow[],
  idx: number,
  winnerOf: WinnerFn,
): 0 | 1 | null {
  if (idx === 1) return detail.bpFirstSide;
  const prev = rounds.find((r) => r.idx === idx - 1);
  if (!prev) return null;
  const w = winnerOf(prev.result);
  return w === null ? null : (((w === 0 ? 1 : 0) as 0 | 1));
}

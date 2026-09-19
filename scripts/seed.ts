/** 录示例数据 + 三份真实 log（log2 的旧 bp 规则不在支持范围内，跳过） */
import { db } from '../src/server/db.ts';
import * as cs2 from '../src/server/cs2.ts';
import * as crash from '../src/server/crash.ts';

const d = db();
d.exec(`DELETE FROM cs2_entries; DELETE FROM cs2_matches; DELETE FROM crash_pool; DELETE FROM crash_draft; DELETE FROM crash_rounds; DELETE FROM crash_matches; DELETE FROM players;`);

/* ---------------- cs2 ---------------- */

const mode = (n: string) => Number((d.prepare(`SELECT id FROM cs2_modes WHERE name = ?`).get(n) as any).id);
const item = (n: string) => Number((d.prepare(`SELECT id FROM cs2_items WHERE name = ?`).get(n) as any).id);
const addCs2 = (playedAt: string, a: string, b: string, m: string, scores: [string, number, number][]) =>
  cs2.createMatch({
    playedAt,
    playerA: a,
    playerB: b,
    modeId: mode(m),
    entries: scores.map(([it, x, y]) => ({ itemId: item(it), scoreA: x, scoreB: y })),
  });

addCs2('2026-08-01', 'wsq', 'mzy', '手枪单挑', [['手枪', 21, 19]]);
addCs2('2026-08-02', 'wsq', 'mzy', 'solo三项', [['手枪', 6, 4], ['长枪', 19, 9], ['狙击', 2, 4]]);
addCs2('2026-08-03', 'wsq', 'zhj', '长枪单挑', [['长枪', 16, 14]]);
addCs2('2026-08-05', 'mzy', 'zhj', '狙击单挑', [['狙击', 13, 15]]);
addCs2('2026-08-06', 'wsq', 'zhj', 'solo三项', [['手枪', 10, 2], ['长枪', 5, 9], ['狙击', 7, 3]]);
addCs2('2026-08-07', 'mzy', 'wsq', '手枪单挑', [['手枪', 18, 21]]);

/* ---------------- crash ---------------- */

const role = (n: string) => {
  const row = d.prepare(`SELECT id FROM crash_roles WHERE name = ?`).get(n) as any;
  if (!row) throw new Error(`角色不存在: ${n}`);
  return Number(row.id) as number;
};

const addCrash = (
  playedAt: string,
  a: string,
  b: string,
  ruleKey: string,
  firstSide: 0 | 1,
  pool: string[],
  draft: string[],
  rounds: { idx: number; initiative: 0 | 1 | null; roleA: string | null; roleB: string | null; result: string }[],
  note = '',
) =>
  crash.createMatch({
    playedAt,
    playerA: a,
    playerB: b,
    rule: ruleKey,
    firstSide,
    note,
    pool: pool.map(role),
    draft: draft.map((n, seq) => ({ seq, roleId: role(n) })),
    rounds: rounds.map((r) => ({
      idx: r.idx,
      initiativeSide: r.initiative,
      roleA: r.roleA ? role(r.roleA) : null,
      roleB: r.roleB ? role(r.roleB) : null,
      result: r.result,
      winKind: '',
    })),
  });

// log1：初见模式，wsq 先手，2:0
addCrash('2026-08-01', 'wsq', 'mzy', 'first', 0,
  ['艾娅', '拔刀', '冰女', '妮妮', '妮娜', '阿兰'],
  ['阿兰', '拔刀', '艾娅', '冰女', '妮娜', '妮妮'],
  [
    { idx: 1, initiative: 0, roleA: '阿兰', roleB: '艾娅', result: 'a' },
    { idx: 2, initiative: 1, roleA: '妮娜', roleB: '拔刀', result: 'a' },
  ],
  'log1');

// log3：bp模式，mzy 先手，打到一半
addCrash('2026-08-03', 'mzy', 'zhj', 'bp', 0,
  ['娜吉', '火女', '怪盗', '拔刀', '妖姬', '芙芙', '妮妮', '商旅', '艾娅', '骇客'],
  ['怪盗', '骇客', '芙芙', '拔刀', '艾娅', '商旅', '娜吉', '妮妮'],
  [{ idx: 1, initiative: 0, roleA: '妮妮', roleB: '芙芙', result: 'pending' }],
  'log3');

/* ---------------- 打印核对 ---------------- */

const show = (tables: any[]) => {
  for (const t of tables) {
    console.log(`\n[${t.navGroup ?? ''}] ${t.title}`);
    if (t.kind === 'matrix') {
      const head = ['', ...t.cols.map((c: any) => c.name)];
      console.log(head.join('\t'));
      for (const r of t.rows) {
        console.log([r.name, ...r.cells.map((v: number | null) => (v === null ? '—' : (v * 100).toFixed(0) + '%'))].join('\t'));
      }
    } else {
      console.log(t.columns.map((c: any) => c.label).join('\t'));
      for (const r of t.rows) {
        console.log(
          t.columns
            .map((c: any) => {
              const v = r[c.key];
              if (v === null || v === undefined) return '—';
              if (typeof v === 'number') return c.kind === 'percent' ? (v * 100).toFixed(1) + '%' : String(v);
              return v.name;
            })
            .join('\t'),
        );
      }
    }
  }
};

console.log('=== cs2 ===');
show(cs2.stats(1));
console.log('\n=== crash ===');
show(crash.stats());

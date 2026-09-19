/** 录几场示例数据，跑 `npx tsx scripts/seed.ts` */
import { db } from '../src/server/db.ts';
import * as cs2 from '../src/server/cs2.ts';

db().exec(`DELETE FROM cs2_entries; DELETE FROM cs2_matches; DELETE FROM players;`);

const mode = (name: string) =>
  Number((db().prepare(`SELECT id FROM cs2_modes WHERE name = ?`).get(name) as any).id);
const item = (name: string) =>
  Number((db().prepare(`SELECT id FROM cs2_items WHERE name = ?`).get(name) as any).id);

const add = (
  playedAt: string,
  a: string,
  b: string,
  modeName: string,
  scores: [string, number, number][],
) =>
  cs2.createMatch({
    playedAt,
    playerA: a,
    playerB: b,
    modeId: mode(modeName),
    entries: scores.map(([it, x, y]) => ({ itemId: item(it), scoreA: x, scoreB: y })),
  });

add('2026-08-01', 'wsq', 'mzy', '手枪单挑', [['手枪', 21, 19]]);
add('2026-08-02', 'wsq', 'mzy', 'solo三项', [
  ['手枪', 6, 4],
  ['长枪', 19, 9],
  ['狙击', 2, 4],
]);
add('2026-08-03', 'wsq', 'zhj', '长枪单挑', [['长枪', 16, 14]]);
add('2026-08-05', 'mzy', 'zhj', '狙击单挑', [['狙击', 13, 15]]);
add('2026-08-06', 'wsq', 'zhj', 'solo三项', [
  ['手枪', 10, 2],
  ['长枪', 5, 9],
  ['狙击', 7, 3],
]);
add('2026-08-07', 'mzy', 'wsq', '手枪单挑', [['手枪', 18, 21]]);

console.log('录了', (db().prepare(`SELECT COUNT(*) n FROM cs2_matches`).get() as any).n, '场');
for (const t of cs2.stats(1)) {
  console.log('\n' + t.title);
  console.log(t.columns.map((c) => c.label).join('\t'));
  for (const r of t.rows) {
    console.log(
      t.columns
        .map((c) => {
          const v = r[c.key];
          if (typeof v === 'number') return c.kind === 'percent' ? (v * 100).toFixed(1) + '%' : String(v);
          return (v as any).name;
        })
        .join('\t'),
    );
  }
}

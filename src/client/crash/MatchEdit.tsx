import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { crash } from '../common/api.ts';
import { Card, Crumbs } from '../common/Card.tsx';
import {
  MAX_ROUNDS,
  PENDING,
  RULES,
  ROUND_RESULTS,
  WIN_BY,
  WIN_KINDS,
  initiativeDecider,
  resultLabel,
  sideOf,
  winnerOf,
} from '../../shared/crash.ts';
import type { CrashLists } from '../common/api.ts';
import type { CrashRound } from '../../shared/types.ts';

const other = (s: 0 | 1): 0 | 1 => (s === 0 ? 1 : 0);
const emptyRound = (idx: number): CrashRound => ({
  idx,
  initiativeSide: null,
  roleA: null,
  roleB: null,
  result: PENDING,
  winKind: '',
});

export default function MatchEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const [lists, setLists] = useState<CrashLists | null>(null);
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10));
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [rule, setRule] = useState('bp');
  const [firstSide, setFirstSide] = useState<0 | 1>(0);
  const [note, setNote] = useState('');
  const [pool, setPool] = useState<number[]>([]);
  const [draft, setDraft] = useState<Record<number, number>>({});
  const [rounds, setRounds] = useState<CrashRound[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const l = await crash.lists();
      setLists(l);
      if (id) {
        const m = await crash.match(Number(id));
        setPlayedAt(m.playedAt);
        setPlayerA(m.playerA.name);
        setPlayerB(m.playerB.name);
        setRule(m.rule);
        setFirstSide(m.firstSide);
        setNote(m.note);
        setPool(m.pool);
        setDraft(m.draft);
        setRounds(m.rounds);
      }
    })().catch((e) => setErr(String(e.message ?? e)));
  }, [id]);

  const nameA = playerA.trim() || '玩家1';
  const nameB = playerB.trim() || '玩家2';
  const name = (s: 0 | 1) => (s === 0 ? nameA : nameB);

  const ruleset = RULES[rule] ?? RULES.bp;
  const roleOf = (rid: number | null) => lists?.roles.find((r) => r.id === rid);
  const roleName = (rid: number | null) => (rid === null ? '—' : (roleOf(rid)?.name ?? '?'));
  const roleColor = (rid: number | null) => {
    const c = roleOf(rid)?.color;
    return c ? `#${c}` : undefined;
  };

  const pickRule = (key: string) => {
    setRule(key);
    setDraft(Object.fromEntries(Object.entries(draft).filter(([seq]) => Number(seq) < (RULES[key] ?? RULES.bp).slots.length)));
  };

  const usedRoles = useMemo(() => new Set(Object.values(draft)), [draft]);
  const current = ruleset.slots.findIndex((_, i) => draft[i] === undefined);
  const available = pool.filter((rid) => !usedRoles.has(rid));

  const sidePicks: [number[], number[]] = [[], []];
  for (const [seq, rid] of Object.entries(draft)) {
    const slot = ruleset.slots[Number(seq)];
    if (slot?.kind === 'pick') sidePicks[sideOf(slot, firstSide)].push(rid);
  }

  const all = Array.from({ length: MAX_ROUNDS }, (_, i) => rounds.find((r) => r.idx === i + 1) ?? emptyRound(i + 1));
  const done = all.filter((r) => r.result !== PENDING);
  const score: [number, number] = [0, 0];
  for (const r of all) {
    const w = winnerOf(r.result);
    if (w !== null) score[w]++;
  }
  const concluded = score[0] >= WIN_BY || score[1] >= WIN_BY || done.length >= MAX_ROUNDS;
  const visible = concluded ? Math.max(done.length, 1) : Math.min(done.length + 1, MAX_ROUNDS);

  const setRound = (idx: number, patch: Partial<CrashRound>) =>
    setRounds(all.map((r) => (r.idx === idx ? { ...r, ...patch } : r)));

  const save = async (inProgress: boolean) => {
    setErr(null);
    try {
      const body = {
        playedAt,
        playerA,
        playerB,
        rule,
        firstSide,
        note,
        inProgress,
        pool,
        draft: Object.entries(draft).map(([seq, roleId]) => ({ seq: Number(seq), roleId })),
        rounds: all.slice(0, visible).filter((r) => r.result !== PENDING || r.roleA || r.roleB),
      };
      if (id) await crash.update(Number(id), body);
      else await crash.create(body);
      nav('/crash');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!lists) return <div className="page">{err ? <p className="err">{err}</p> : <p className="muted">加载中…</p>}</div>;

  let banNo = 0;
  let pickNo = 0;

  return (
    <div className="page">
      <Crumbs
        items={[
          { label: '游戏', to: '/' },
          { label: 'Crash', to: '/crash' },
          ...(id ? [{ label: '查看对局', to: `/crash/${id}` }] : []),
          { label: id ? '修改' : '新的一场' },
        ]}
      />

      <Card
        title={id ? '修改对局' : '新的一场'}
        actions={
          <>
            <button onClick={() => nav(id ? `/crash/${id}` : '/crash')}>取消</button>
            <button onClick={() => save(true)} disabled={!playerA.trim() || !playerB.trim()}>
              暂存
            </button>
            <button className="primary" onClick={() => save(false)} disabled={!playerA.trim() || !playerB.trim()}>
              保存
            </button>
          </>
        }
      >
        <div className="fields">
          <label className="field">
            日期
            <input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
          </label>
          <div className="field">
            对局方
            <div className="pair">
              <input list="players" value={playerA} onChange={(e) => setPlayerA(e.target.value)} />
              <span className="muted">vs</span>
              <input list="players" value={playerB} onChange={(e) => setPlayerB(e.target.value)} />
            </div>
          </div>
          <datalist id="players">
            {lists.players.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <label className="field">
            规则
            <select value={rule} onChange={(e) => pickRule(e.target.value)}>
              {lists.rules.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            BP 先手方
            <select value={firstSide} onChange={(e) => setFirstSide(Number(e.target.value) as 0 | 1)}>
              <option value={0}>{nameA}</option>
              <option value={1}>{nameB}</option>
            </select>
          </label>
          <label className="field">
            备注
            <input style={{ width: 160 }} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      </Card>

      <Card title={`角色池（${pool.length} / ${ruleset.poolSize}）`}>
        <div className="chips">
          {lists.roles.map((r) => (
            <button
              key={r.id}
              className={`chip role${pool.includes(r.id) ? ' on' : ''}`}
              style={{ color: `#${r.color}` }}
              onClick={() => {
                if (usedRoles.has(r.id)) return;
                setPool(pool.includes(r.id) ? pool.filter((x) => x !== r.id) : [...pool, r.id]);
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      </Card>

      <Card title={`BP（${Object.keys(draft).length} / ${ruleset.slots.length}）`}>
        <table>
          <tbody>
            {ruleset.slots.map((slot, i) => {
              const no = slot.kind === 'ban' ? ++banNo : ++pickNo;
              const rid = draft[i];
              return (
                <tr key={i} className={i === current ? 'current-row' : ''}>
                  <td className="muted small" style={{ width: 70 }}>
                    {no}
                    {slot.kind}
                  </td>
                  <td style={{ width: 170 }}>
                    {name(sideOf(slot, firstSide))}
                    {slot.side === 'first' && <span className="muted small"> BP先手</span>}
                  </td>
                  <td className="role-name" style={{ color: roleColor(rid ?? null) }}>
                    {rid === undefined ? (i === current ? '← 当前' : '—') : roleName(rid)}
                  </td>
                  <td style={{ width: 76 }}>
                    {rid !== undefined && (
                      <button
                        className="quiet"
                        onClick={() => setDraft(Object.fromEntries(Object.entries(draft).filter(([k]) => Number(k) !== i)))}
                      >
                        撤销
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="chips" style={{ marginTop: 14 }}>
          {available.length === 0 ? (
            <span className="muted small">{pool.length === 0 ? '先从上面选角色池' : '都选完了'}</span>
          ) : (
            available.map((rid) => (
              <button
                key={rid}
                className="chip role"
                style={{ color: roleColor(rid) }}
                disabled={current < 0}
                onClick={() => setDraft({ ...draft, [current]: rid })}
              >
                {roleName(rid)}
              </button>
            ))
          )}
        </div>
      </Card>

      <Card title={`逐轮（${score[0]} : ${score[1]}）`}>
        {all.slice(0, visible).map((r) => {
          const decider = initiativeDecider(all, r.idx, firstSide, rule);
          const w = winnerOf(r.result);
          const running: [number, number] = [0, 0];
          for (const x of all) {
            if (x.idx > r.idx) break;
            const ww = winnerOf(x.result);
            if (ww !== null) running[ww]++;
          }
          const decidedHere = w !== null && running[w] >= WIN_BY;
          const loser = w === null || decidedHere ? null : (w === 0 ? nameB : nameA);
          return (
            <div key={r.idx} className="round-block">
              <div className="round-head">
                <b>第 {r.idx} 轮</b>
                {w !== null && (
                  <span className="tag done">
                    {resultLabel(r.result, nameA, nameB)}
                    {r.winKind ? ` · ${r.winKind}` : ''}
                  </span>
                )}
              </div>

              <div className="kv">
                <span>决定先攻</span>
                <div>
                  {decider === null ? '—' : `${name(decider)}`}
                  {r.idx === 1 && <span className="muted small">（{rule === 'bp' ? 'BP 后手方' : 'BP 先手方'}）</span>}
                  {r.idx > 1 && <span className="muted small">（上一轮败方）</span>}
                </div>

                <span>他的选择</span>
                <div>
                  <select
                    value={r.initiativeSide === null || decider === null ? '' : r.initiativeSide === decider ? 'self' : 'other'}
                    disabled={decider === null}
                    onChange={(e) => {
                      if (decider === null) return;
                      setRound(r.idx, {
                        initiativeSide: e.target.value === '' ? null : e.target.value === 'self' ? decider : other(decider),
                      });
                    }}
                  >
                    <option value="">未定</option>
                    <option value="self">先攻</option>
                    <option value="other">后攻</option>
                  </select>
                </div>

                {([0, 1] as const).map((side) => (
                  <div key={side} style={{ display: 'contents' }}>
                    <span>{name(side)} 出战</span>
                    <div>
                      <select
                        value={(side === 0 ? r.roleA : r.roleB) ?? ''}
                        onChange={(e) =>
                          setRound(
                            r.idx,
                            side === 0
                              ? { roleA: e.target.value === '' ? null : Number(e.target.value) }
                              : { roleB: e.target.value === '' ? null : Number(e.target.value) },
                          )
                        }
                      >
                        <option value="">—</option>
                        {sidePicks[side].map((rid) => (
                          <option key={rid} value={rid}>
                            {roleName(rid)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}

                <span>结果</span>
                <div>
                  <select value={r.result} onChange={(e) => setRound(r.idx, { result: e.target.value })}>
                    <option value={PENDING}>未录</option>
                    {ROUND_RESULTS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {resultLabel(x.key, nameA, nameB)}
                      </option>
                    ))}
                  </select>
                </div>

                <span>胜利条件</span>
                <div>
                  <select
                    value={r.winKind}
                    disabled={w === null}
                    onChange={(e) => setRound(r.idx, { winKind: e.target.value })}
                  >
                    <option value="">—</option>
                    {WIN_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                {r.idx < MAX_ROUNDS && (
                  <>
                    <span>战败补偿</span>
                    <div className="muted">{loser === null ? '无' : loser + ' 获得'}</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {err && <p className="err">{err}</p>}
    </div>
  );
}

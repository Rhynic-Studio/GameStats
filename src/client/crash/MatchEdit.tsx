import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { crash } from '../common/api.ts';
import { Card, Crumbs } from '../common/Card.tsx';
import { MAX_ROUNDS, RULES, ROUND_RESULTS, WIN_BY, scoreBefore, sideOf, winnerOf } from '../../shared/crash.ts';
import type { CrashLists } from '../common/api.ts';
import type { CrashRound } from '../../shared/types.ts';

const emptyRound = (idx: number): CrashRound => ({
  idx,
  initiativeSide: null,
  roleA: null,
  roleB: null,
  result: 'pending',
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

  const ruleset = RULES[rule] ?? RULES.bp;
  const roleName = (rid: number) => lists?.roles.find((r) => r.id === rid)?.name ?? '?';

  /** 换规则时把不属于新槽位序列的 ban/pick 丢掉 */
  const pickRule = (key: string) => {
    setRule(key);
    const slots = (RULES[key] ?? RULES.bp).slots.length;
    setDraft(Object.fromEntries(Object.entries(draft).filter(([seq]) => Number(seq) < slots)));
  };

  const draftByRole = useMemo(() => {
    const m = new Map<number, { seq: number; kind: 'ban' | 'pick'; side: 'first' | 'second' }>();
    for (const [seq, rid] of Object.entries(draft)) {
      const slot = ruleset.slots[Number(seq)];
      if (slot) m.set(rid, { seq: Number(seq), ...slot });
    }
    return m;
  }, [draft, ruleset]);

  const current = ruleset.slots.findIndex((_, i) => draft[i] === undefined);
  /** 每一方 pick 到的角色，逐轮就从这里面出 */
  const sidePicks: [number[], number[]] = [[], []];
  for (const [seq, rid] of Object.entries(draft)) {
    const slot = ruleset.slots[Number(seq)];
    if (slot?.kind === 'pick') sidePicks[sideOf(slot, firstSide)].push(rid);
  }

  const parsedRounds = Array.from({ length: MAX_ROUNDS }, (_, i) => rounds.find((r) => r.idx === i + 1) ?? emptyRound(i + 1));
  const terminal = parsedRounds.filter((r) => r.result !== 'pending').length;
  const score: [number, number] = [0, 0];
  for (const r of parsedRounds) {
    const w = winnerOf(r.result);
    if (w !== null) score[w]++;
  }
  const concluded = score[0] >= WIN_BY || score[1] >= WIN_BY || terminal >= MAX_ROUNDS;
  const visible = concluded ? Math.max(terminal, 1) : Math.min(terminal + 1, MAX_ROUNDS);

  const setRound = (idx: number, patch: Partial<CrashRound>) =>
    setRounds(parsedRounds.map((r) => (r.idx === idx ? { ...r, ...patch } : r)));

  const save = async () => {
    setErr(null);
    try {
      const body = {
        playedAt,
        playerA,
        playerB,
        rule,
        firstSide,
        note,
        pool,
        draft: Object.entries(draft).map(([seq, roleId]) => ({ seq: Number(seq), roleId })),
        rounds: parsedRounds.filter((r) => r.result !== 'pending' || r.roleA || r.roleB || r.initiativeSide !== null),
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
          ...(id ? [{ label: '这一场', to: `/crash/${id}` }] : []),
          { label: id ? '修改' : '新的一场' },
        ]}
      />

      <Card
        title={id ? '修改这一场' : '新的一场'}
        actions={
          <>
            <button onClick={() => nav(id ? `/crash/${id}` : '/crash')}>取消</button>
            <button className="primary" onClick={save} disabled={!playerA.trim() || !playerB.trim()}>
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
              <option value={0}>{playerA || '玩家1'}</option>
              <option value={1}>{playerB || '玩家2'}</option>
            </select>
          </label>
          <label className="field">
            备注
            <input style={{ width: 160 }} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      </Card>

      <Card title={`出现（${pool.length} / ${ruleset.poolSize}）`}>
        <div className="chips">
          {lists.roles.map((r) => {
            const on = pool.includes(r.id);
            const inDraft = draftByRole.has(r.id);
            return (
              <button
                key={r.id}
                className={`chip${on ? ' on' : ''}${inDraft ? ' used' : ''}`}
                onClick={() => {
                  if (inDraft) return;
                  setPool(on ? pool.filter((x) => x !== r.id) : [...pool, r.id]);
                }}
              >
                {r.name}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title={`BP（${Object.keys(draft).length} / ${ruleset.slots.length}）`}>
        <table>
          <tbody>
            {ruleset.slots.map((slot, i) => {
              const no = slot.kind === 'ban' ? ++banNo : ++pickNo;
              const rid = draft[i];
              const owner = sideOf(slot, firstSide);
              return (
                <tr key={i} className={i === current ? 'current-row' : ''}>
                  <td className="muted small" style={{ width: 70 }}>
                    {no}
                    {slot.kind}
                  </td>
                  <td style={{ width: 150 }}>
                    {owner === 0 ? playerA || '玩家1' : playerB || '玩家2'}
                    {slot.side === 'first' && <span className="muted small"> BP先手</span>}
                  </td>
                  <td>{rid ? roleName(rid) : i === current ? '← 当前' : '—'}</td>
                  <td style={{ width: 76 }}>
                    {rid && (
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

        <div className="chips" style={{ marginTop: 12 }}>
          {pool.length === 0 && <span className="muted small">先从上面选出现名单</span>}
          {pool.map((rid) => {
            const used = draftByRole.get(rid);
            return (
              <button
                key={rid}
                className={`chip${used ? ' used' : ''}`}
                disabled={!!used || current < 0}
                onClick={() => setDraft({ ...draft, [current]: rid })}
              >
                {roleName(rid)}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title={`逐轮（${score[0]} : ${score[1]}）`}>
        {parsedRounds.slice(0, visible).map((r) => {
          const before = scoreBefore(parsedRounds, r.idx);
          const mine = r.initiativeSide === null ? null : before;
          void mine;
                  const w = winnerOf(r.result);
          return (
            <div key={r.idx} className="round-block">
              <div className="round-head">
                <b>第 {r.idx} 轮</b>
                <span className="muted small">
                  {playerA || '玩家1'} buff {before[0] !== 0 ? '有' : '无'} · {playerB || '玩家2'} buff{' '}
                  {before[1] !== 0 ? '有' : '无'}
                </span>
                {w !== null && (
                  <span className="tag done">{w === 0 ? playerA || '玩家1' : playerB || '玩家2'} 拿下</span>
                )}
              </div>
              <div className="fields">
                <label className="field">
                  先攻方
                  <select
                    value={r.initiativeSide ?? ''}
                    onChange={(e) =>
                      setRound(r.idx, { initiativeSide: e.target.value === '' ? null : (Number(e.target.value) as 0 | 1) })
                    }
                  >
                    <option value="">未定</option>
                    <option value={0}>{playerA || '玩家1'}</option>
                    <option value={1}>{playerB || '玩家2'}</option>
                  </select>
                </label>
                {([0, 1] as const).map((side) => (
                  <label className="field" key={side}>
                    {side === 0 ? playerA || '玩家1' : playerB || '玩家2'}
                    <select
                      value={(side === 0 ? r.roleA : r.roleB) ?? ''}
                      onChange={(e) =>
                        setRound(r.idx, side === 0
                          ? { roleA: e.target.value === '' ? null : Number(e.target.value) }
                          : { roleB: e.target.value === '' ? null : Number(e.target.value) })
                      }
                    >
                      <option value="">—</option>
                      {sidePicks[side].map((rid) => (
                        <option key={rid} value={rid}>
                          {roleName(rid)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="field">
                  结果
                  <select value={r.result} onChange={(e) => setRound(r.idx, { result: e.target.value })}>
                    {ROUND_RESULTS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  胜利条件
                  <select
                    value={r.winKind}
                    disabled={w === null}
                    onChange={(e) => setRound(r.idx, { winKind: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="战胜">战胜</option>
                    <option value="积分胜">积分胜</option>
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </Card>

      {err && <p className="err">{err}</p>}
    </div>
  );
}

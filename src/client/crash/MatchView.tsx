import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { crash } from '../common/api.ts';
import { Card, Crumbs } from '../common/Card.tsx';
import { RULES, ROUND_RESULTS, scoreBefore, sideOf, winnerOf } from '../../shared/crash.ts';
import type { CrashLists } from '../common/api.ts';
import type { CrashMatchDetail } from '../../shared/types.ts';

export default function MatchView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [m, setM] = useState<CrashMatchDetail | null>(null);
  const [lists, setLists] = useState<CrashLists | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([crash.match(Number(id)), crash.lists()])
      .then(([mm, ll]) => {
        setM(mm);
        setLists(ll);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, [id]);

  if (err) return <div className="page"><p className="err">{err}</p></div>;
  if (!m || !lists) return <div className="page muted">加载中…</div>;

  const roleset = RULES[m.rule] ?? RULES.bp;
  const roleName = (rid: number | null) => (rid === null ? '—' : (lists.roles.find((r) => r.id === rid)?.name ?? '?'));
  const pname = (side: 0 | 1) => (side === 0 ? m.playerA.name : m.playerB.name);

  let banNo = 0;
  let pickNo = 0;

  return (
    <div className="page">
      <Crumbs items={[{ label: '游戏', to: '/' }, { label: 'Crash', to: '/crash' }, { label: '这一场' }]} />

      <Card
        title={
          <span className="big">
            {m.playerA.name} {m.score[0]} : {m.score[1]} {m.playerB.name}
          </span>
        }
        actions={
          <>
            <span className="muted small">
              {m.isDraw ? '平局' : m.concluded && m.winner !== null ? `${pname(m.winner)} 胜` : '进行中'}
            </span>
            <Link to={`/crash/${m.id}/edit`}>
              <button className="primary">修改</button>
            </Link>
          </>
        }
        flush
      >
        <div className="card-body fields" style={{ borderBottom: '1px solid var(--line)' }}>
          <label className="field">
            日期
            <span>{m.playedAt}</span>
          </label>
          <label className="field">
            规则
            <span>{m.ruleLabel}</span>
          </label>
          <label className="field">
            BP 先手方
            <span>{pname(m.firstSide)}</span>
          </label>
          <label className="field">
            备注
            <span>{m.note || '—'}</span>
          </label>
        </div>

        <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            出现
          </div>
          <div className="chips">
            {m.pool.map((rid) => (
              <span key={rid} className="tag">
                {roleName(rid)}
              </span>
            ))}
          </div>
        </div>

        <table>
          <tbody>
            {roleset.slots.map((slot, i) => {
              const no = slot.kind === 'ban' ? ++banNo : ++pickNo;
              const rid = m.draft[i] ?? null;
              return (
                <tr key={i}>
                  <td className="muted small" style={{ width: 70 }}>
                    {no}
                    {slot.kind}
                  </td>
                  <td style={{ width: 150 }}>
                    {pname(sideOf(slot, m.firstSide))}
                    {slot.side === 'first' && <span className="muted small"> BP先手</span>}
                  </td>
                  <td>{roleName(rid)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title={`逐轮（${m.score[0]} : ${m.score[1]}）`}>
        {m.rounds.length === 0 && <span className="muted small">还没录</span>}
        {m.rounds.map((r) => {
          const before = scoreBefore(m.rounds, r.idx);
          const w = winnerOf(r.result);
          const label = ROUND_RESULTS.find((x) => x.key === r.result)?.label ?? r.result;
                  return (
            <div key={r.idx} className="round-block">
              <div className="round-head">
                <b>第 {r.idx} 轮</b>
                <span className="muted small">
                  {m.playerA.name} buff {before[0] !== 0 ? '有' : '无'} · {m.playerB.name} buff{' '}
                  {before[1] !== 0 ? '有' : '无'}
                </span>
              </div>
              <div className="fields">
                <label className="field">
                  先攻方
                  <span>{r.initiativeSide === null ? '—' : pname(r.initiativeSide)}</span>
                </label>
                <label className="field">
                  {m.playerA.name}
                  <span>{roleName(r.roleA)}</span>
                </label>
                <label className="field">
                  {m.playerB.name}
                  <span>{roleName(r.roleB)}</span>
                </label>
                <label className="field">
                  结果
                  <span>
                    {label}
                    {w !== null && r.winKind ? ` · ${r.winKind}` : ''}
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      </Card>

      <p>
        <button onClick={() => nav('/crash')}>← 返回对局记录</button>
      </p>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { crash } from '../common/api.ts';
import { Card, Crumbs } from '../common/Card.tsx';
import { RULES, hasBuff, initiativeDecider, resultLabel, scoreBefore, sideOf } from '../../shared/crash.ts';
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
        if (mm.inProgress) {
          nav(`/crash/${mm.id}/edit`, { replace: true });
          return;
        }
        setM(mm);
        setLists(ll);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, [id, nav]);

  if (err) return <div className="page"><p className="err">{err}</p></div>;
  if (!m || !lists) return <div className="page muted">加载中…</div>;

  const ruleset = RULES[m.rule] ?? RULES.bp;
  const roleOf = (rid: number | null) => lists.roles.find((r) => r.id === rid);
  const roleName = (rid: number | null) => (rid === null ? '—' : (roleOf(rid)?.name ?? '?'));
  const roleColor = (rid: number | null) => {
    const c = roleOf(rid)?.color;
    return c ? `#${c}` : undefined;
  };
  const name = (side: 0 | 1) => (side === 0 ? m.playerA.name : m.playerB.name);

  let banNo = 0;
  let pickNo = 0;

  return (
    <div className="page">
      <Crumbs items={[{ label: '游戏', to: '/' }, { label: 'Crash', to: '/crash' }, { label: '查看对局' }]} />

      <Card
        title={
          <span className="big">
            {m.playerA.name} {m.score[0]} : {m.score[1]} {m.playerB.name}
          </span>
        }
        actions={
          <>
            <span className="muted small">{m.isDraw ? '平局' : m.concluded && m.winner !== null ? `${name(m.winner)} 胜` : '进行中'}</span>
            <Link to={`/crash/${m.id}/edit`}>
              <button className="primary">修改</button>
            </Link>
            <button
              className="quiet danger"
              onClick={async () => {
                if (!confirm('删掉这一场？')) return;
                await crash.remove(m.id);
                nav('/crash');
              }}
            >
              删除
            </button>
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
            <span>{name(m.firstSide)}</span>
          </label>
          <label className="field">
            备注
            <span>{m.note || '—'}</span>
          </label>
        </div>

        <div className="card-body" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="muted small" style={{ marginBottom: 6 }}>
            角色池
          </div>
          <div className="chips">
            {m.pool.map((rid) => (
              <span key={rid} className="tag role-name" style={{ color: roleColor(rid) }}>
                {roleName(rid)}
              </span>
            ))}
          </div>
        </div>

        <table>
          <tbody>
            {ruleset.slots.map((slot, i) => {
              const no = slot.kind === 'ban' ? ++banNo : ++pickNo;
              const rid = m.draft[i];
              return (
                <tr key={i}>
                  <td className="muted small" style={{ width: 70 }}>
                    {no}
                    {slot.kind}
                  </td>
                  <td style={{ width: 170 }}>
                    {name(sideOf(slot, m.firstSide))}
                    {slot.side === 'first' && <span className="muted small"> BP先手</span>}
                  </td>
                  <td className="role-name" style={{ color: roleColor(rid ?? null) }}>
                    {rid === undefined ? '—' : roleName(rid)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title={`逐轮（${m.score[0]} : ${m.score[1]}）`}>
        {m.rounds.length === 0 && <span className="muted small">还没录</span>}
        {m.rounds.map((r) => {
          const decider = initiativeDecider(m.rounds, r.idx, m.firstSide);
          const before = scoreBefore(m.rounds, r.idx);
          const compensated = [hasBuff(m.rounds, r.idx, 0) ? m.playerA.name : null, hasBuff(m.rounds, r.idx, 1) ? m.playerB.name : null].filter(Boolean);
          return (
            <div key={r.idx} className="round-block">
              <div className="round-head">
                <b>第 {r.idx} 轮</b>
                <span className="tag done">
                  {resultLabel(r.result, m.playerA.name, m.playerB.name)}
                  {r.winKind ? ` · ${r.winKind}` : ''}
                </span>
              </div>
              <div className="kv">
                <span>决定先攻</span>
                <div>
                  {decider === null ? '—' : name(decider)}
                  {r.idx === 1 ? <span className="muted small">（BP 先手方）</span> : <span className="muted small">（上一轮败方）</span>}
                </div>
                <span>他的选择</span>
                <div>{r.initiativeSide === null ? '未定' : r.initiativeSide === decider ? '先攻' : '后攻'}</div>
                <span>先攻方</span>
                <div>{r.initiativeSide === null ? '—' : name(r.initiativeSide)}</div>
                <span>{m.playerA.name} 出战</span>
                <div className="role-name" style={{ color: roleColor(r.roleA) }}>
                  {roleName(r.roleA)}
                </div>
                <span>{m.playerB.name} 出战</span>
                <div className="role-name" style={{ color: roleColor(r.roleB) }}>
                  {roleName(r.roleB)}
                </div>
                <span>战败补偿</span>
                <div className="muted">{compensated.length === 0 ? '无' : compensated.join('、')}</div>
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

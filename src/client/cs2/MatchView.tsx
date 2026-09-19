import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Lists } from '../common/api.ts';
import { Card, Crumbs } from '../common/Card.tsx';
import { roundsOf } from '../../shared/types.ts';
import type { MatchDetail } from '../../shared/types.ts';

export default function MatchView() {
  const { id } = useParams();
  const nav = useNavigate();
  const [m, setM] = useState<MatchDetail | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.match(Number(id)), api.lists()])
      .then(([mm, ll]) => {
        setM(mm);
        setLists(ll);
      })
      .catch((e) => setErr(String(e.message ?? e)));
  }, [id]);

  if (err) return <div className="page"><p className="err">{err}</p></div>;
  if (!m || !lists) return <div className="page muted">加载中…</div>;

  const itemName = (iid: number) => lists.items.find((x) => x.id === iid)?.name ?? '?';
  const win = m.winner === 'A' ? m.playerA.name : m.winner === 'B' ? m.playerB.name : null;

  return (
    <div className="page">
      <Crumbs items={[{ label: '游戏', to: '/' }, { label: 'CS2 单挑', to: '/cs2' }, { label: '这一场' }]} />

      <Card
        title={
          <span className="big">
            {m.playerA.name} {m.scoreA} : {m.scoreB} {m.playerB.name}
          </span>
        }
        actions={
          <>
            <span className="muted small">{win ? `${win} 胜` : '平'}</span>
            <Link to={`/cs2/${m.id}/edit`}>
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
            单挑
            <span>{m.mode.name}</span>
          </label>
          <label className="field">
            局数
            <span>{m.rounds}</span>
          </label>
          <label className="field">
            备注
            <span>{m.note || '—'}</span>
          </label>
        </div>
        <table>
          <thead>
            <tr>
              <th className="plain">项目</th>
              <th className="plain num">{m.playerA.name} 得分</th>
              <th className="plain num">{m.playerB.name} 得分</th>
              <th className="plain num">局数</th>
            </tr>
          </thead>
          <tbody>
            {m.entries.map((e, i) => (
              <tr key={i}>
                <td>{itemName(e.itemId)}</td>
                <td className="num">{e.scoreA}</td>
                <td className="num">{e.scoreB}</td>
                <td className="num">{roundsOf(e.scoreA, e.scoreB)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>合计</td>
              <td className="num">{m.scoreA}</td>
              <td className="num">{m.scoreB}</td>
              <td className="num">{m.rounds}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <p>
        <button onClick={() => nav('/cs2')}>← 返回对局记录</button>
      </p>
    </div>
  );
}

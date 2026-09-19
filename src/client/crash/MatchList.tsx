import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { crash } from '../common/api.ts';
import { Card, TopBar } from '../common/Card.tsx';
import type { CrashSummary } from '../../shared/types.ts';

export default function MatchList() {
  const [rows, setRows] = useState<CrashSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    crash.matches().then(setRows).catch((e) => setErr(String(e.message ?? e)));
  }, []);

  return (
    <div className="page">
      <TopBar game="crash" name="Crash" current="list" />
      <Card
        title="对局记录"
        actions={
          <Link to="/crash/new">
            <button className="primary">+ 新的一场</button>
          </Link>
        }
        flush
      >
        {err && <p className="err card-body">{err}</p>}
        {!rows && !err && <p className="muted card-body">加载中…</p>}
        {rows && rows.length === 0 && <p className="muted card-body">还没有记录。</p>}
        {rows && rows.length > 0 && (
          <table>
            <thead>
              <tr>
                <th className="plain">日期</th>
                <th className="plain">对局方</th>
                <th className="plain">规则</th>
                <th className="plain">BP 先手</th>
                <th className="plain">比分</th>
                <th className="plain num">角色池 / BP</th>
                <th className="plain">备注</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link to={`/crash/${m.id}`}>{m.playedAt}</Link>
                  </td>
                  <td>
                    {m.playerA.name} <span className="muted">vs</span> {m.playerB.name}
                  </td>
                  <td>{m.ruleLabel}</td>
                  <td>{(m.firstSide === 0 ? m.playerA : m.playerB).name}</td>
                  <td>
                    <b>{m.score[0]}</b> : <b>{m.score[1]}</b>
                    {m.isDraw && <span className="muted small"> 平局</span>}
                    {m.inProgress && <span className="muted small"> 进行中</span>}
                  </td>
                  <td className="num muted small">
                    {m.poolCount} / {m.draftCount}
                  </td>
                  <td className="muted small">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

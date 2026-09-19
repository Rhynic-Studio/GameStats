import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Lists } from '../common/api.ts';
import type { MatchDetail } from '../../shared/types.ts';

export default function MatchEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const [lists, setLists] = useState<Lists | null>(null);
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10));
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [modeId, setModeId] = useState(0);
  const [rows, setRows] = useState<{ itemId: number; a: string; b: string }[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const l = await api.lists();
      setLists(l);
      if (id) {
        const m: MatchDetail = await api.match(Number(id));
        setPlayedAt(m.playedAt);
        setPlayerA(m.playerA.name);
        setPlayerB(m.playerB.name);
        setModeId(m.mode.id);
        setNote(m.note);
        setRows(m.entries.map((e) => ({ itemId: e.itemId, a: String(e.scoreA), b: String(e.scoreB) })));
      } else {
        setModeId(l.modes[0]?.id ?? 0);
      }
    })().catch((e) => setErr(String(e.message ?? e)));
  }, [id]);

  /* 换单挑时重排录入行：solo三项 三项都填，其余只填对应的那一项 */
  const pickMode = (mid: number) => {
    if (!lists) return;
    setModeId(mid);
    const mode = lists.modes.find((m) => m.id === mid);
    const isSolo = !!mode && mode.name.includes('solo');
    const chosen = isSolo
      ? lists.items
      : [lists.items.find((it) => mode?.name.startsWith(it.name)) ?? lists.items[0]].filter(Boolean);
    setRows(chosen.map((it) => ({ itemId: it!.id, a: '', b: '' })));
  };

  if (!lists) return <div className="page">{err ? <p className="err">{err}</p> : '加载中…'}</div>;

  const itemName = (iid: number) => lists.items.find((x) => x.id === iid)?.name ?? '?';
  const parsed = rows.map((r) => ({ itemId: r.itemId, scoreA: Number(r.a || 0), scoreB: Number(r.b || 0) }));
  const totalA = parsed.reduce((s, r) => s + r.scoreA, 0);
  const totalB = parsed.reduce((s, r) => s + r.scoreB, 0);
  const rounds = 2 * Math.max(totalA, totalB) - 1;

  const save = async () => {
    setErr(null);
    try {
      const body = {
        playedAt,
        playerA,
        playerB,
        modeId,
        note,
        entries: parsed,
      };
      if (id) await api.updateMatch(Number(id), body);
      else await api.createMatch(body);
      nav('/cs2');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <div className="crumbs">
        <Link to="/">游戏</Link> / <Link to="/cs2">CS2 单挑</Link> / {id ? '改这一场' : '新的一场'}
      </div>

      <div className="bar">
        <button onClick={() => nav('/cs2')}>← 返回</button>
        <h1>{id ? '改这一场' : '新的一场'}</h1>
        <span className="spacer" />
        <button onClick={save} disabled={!playerA.trim() || !playerB.trim() || !modeId}>
          保存
        </button>
        {id && (
          <button
            className="muted"
            onClick={async () => {
              if (!confirm('删掉这一场？')) return;
              await api.deleteMatch(Number(id));
              nav('/cs2');
            }}
          >
            删除
          </button>
        )}
      </div>
      {err && <p className="err">{err}</p>}

      <section>
        <div className="row">
          <label className="field">
            日期
            <input type="date" value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
          </label>
          <label className="field">
            玩家 A
            <input list="players" value={playerA} onChange={(e) => setPlayerA(e.target.value)} />
          </label>
          <label className="field">
            玩家 B
            <input list="players" value={playerB} onChange={(e) => setPlayerB(e.target.value)} />
          </label>
          <datalist id="players">
            {lists.players.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <label className="field">
            单挑
            <select value={modeId} onChange={(e) => pickMode(Number(e.target.value))}>
              {lists.modes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            备注
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      </section>

      <section>
        <h2>比分</h2>
        <table>
          <thead>
            <tr>
              <th className="plain">项目</th>
              <th className="plain num">
                {playerA || 'A'} 得分
              </th>
              <th className="plain num">
                {playerB || 'B'} 得分
              </th>
              <th className="plain num">局数</th>
              <th className="plain"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const a = Number(r.a || 0);
              const b = Number(r.b || 0);
              const upd = (patch: Partial<typeof r>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <tr key={i}>
                  <td>
                    <select value={r.itemId} onChange={(e) => upd({ itemId: Number(e.target.value) })}>
                      {lists.items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input type="number" min={0} value={r.a} onChange={(e) => upd({ a: e.target.value })} />
                  </td>
                  <td className="num">
                    <input type="number" min={0} value={r.b} onChange={(e) => upd({ b: e.target.value })} />
                  </td>
                  <td className="num">{a + b > 0 ? 2 * Math.max(a, b) - 1 : ''}</td>
                  <td>
                    {rows.length > 1 && (
                      <button onClick={() => setRows(rows.filter((_, j) => j !== i))}>删</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>合计</td>
              <td className="num">{totalA}</td>
              <td className="num">{totalB}</td>
              <td className="num">{totalA + totalB > 0 ? rounds : ''}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {rows.length < lists.items.length && (
          <p>
            <button
              onClick={() => {
                const used = new Set(rows.map((r) => r.itemId));
                const next = lists.items.find((it) => !used.has(it.id));
                if (next) setRows([...rows, { itemId: next.id, a: '', b: '' }]);
              }}
            >
              + 加一项
            </button>
          </p>
        )}

        <p className="muted small">
          {totalA + totalB > 0
            ? `${playerA || 'A'} ${totalA} : ${totalB} ${playerB || 'B'}　总局数 ${rounds}`
            : '填比分'}
        </p>
      </section>
    </div>
  );
}

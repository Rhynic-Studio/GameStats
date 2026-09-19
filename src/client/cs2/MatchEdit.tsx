import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cs2, type Cs2Lists } from '../common/api.ts';
import { Card, Crumbs } from '../common/Card.tsx';
import { roundsOf, type ListItem } from '../../shared/types.ts';

/** 换单挑时该填哪几项：solo三项 三项都填，其余只填名字对得上的那一项 */
function defaultRows(mode: ListItem | undefined, items: ListItem[]) {
  const chosen = mode?.name.includes('solo')
    ? items
    : [items.find((it) => mode?.name.startsWith(it.name)) ?? items[0]].filter(Boolean);
  return chosen.map((it) => ({ itemId: it!.id, a: '', b: '' }));
}

export default function MatchEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const [lists, setLists] = useState<Cs2Lists | null>(null);
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10));
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');
  const [modeId, setModeId] = useState(0);
  const [rows, setRows] = useState<{ itemId: number; a: string; b: string }[]>([]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const l = await cs2.lists();
      setLists(l);
      if (id) {
        const m = await cs2.match(Number(id));
        setPlayedAt(m.playedAt);
        setPlayerA(m.playerA.name);
        setPlayerB(m.playerB.name);
        setModeId(m.mode.id);
        setNote(m.note);
        setRows(m.entries.map((e) => ({ itemId: e.itemId, a: String(e.scoreA), b: String(e.scoreB) })));
      } else {
        const first = l.modes[0];
        setModeId(first?.id ?? 0);
        setRows(defaultRows(first, l.items));
      }
    })().catch((e) => setErr(String(e.message ?? e)));
  }, [id]);

  const pickMode = (mid: number) => {
    if (!lists) return;
    setModeId(mid);
    setRows(defaultRows(lists.modes.find((m) => m.id === mid), lists.items));
  };

  if (!lists) {
    return <div className="page">{err ? <p className="err">{err}</p> : <p className="muted">加载中…</p>}</div>;
  }

  const parsed = rows.map((r) => ({ itemId: r.itemId, scoreA: Number(r.a || 0), scoreB: Number(r.b || 0) }));
  const totalA = parsed.reduce((s, r) => s + r.scoreA, 0);
  const totalB = parsed.reduce((s, r) => s + r.scoreB, 0);
  const totalRounds = totalA + totalB > 0 ? roundsOf(totalA, totalB) : 0;
  const ok = playerA.trim() && playerB.trim() && modeId;

  const save = async (inProgress: boolean) => {
    setErr(null);
    try {
      const body = { playedAt, playerA, playerB, modeId, note, inProgress, entries: parsed };
      if (id) await cs2.update(Number(id), body);
      else await cs2.create(body);
      nav('/cs2');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="page">
      <Crumbs
        items={[
          { label: '游戏', to: '/' },
          { label: 'CS2 单挑', to: '/cs2' },
          ...(id ? [{ label: '这一场', to: `/cs2/${id}` }] : []),
          { label: id ? '修改' : '新的一场' },
        ]}
      />

      <Card
        title={id ? '修改这一场' : '新的一场'}
        actions={
          <>
            <button onClick={() => nav(id ? `/cs2/${id}` : '/cs2')}>取消</button>
            <button onClick={() => save(true)} disabled={!ok}>
              暂存
            </button>
            <button className="primary" onClick={() => save(false)} disabled={!ok}>
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
            <input style={{ width: 180 }} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
      </Card>

      <Card title="比分">
        <table>
          <thead>
            <tr>
              <th className="plain">项目</th>
              <th className="plain num">{playerA || '得分'}</th>
              <th className="plain num">{playerB || '得分'}</th>
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
                  <td className="num muted">{a + b > 0 ? roundsOf(a, b) : ''}</td>
                  <td>
                    {rows.length > 1 && (
                      <button className="quiet" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                        删
                      </button>
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
              <td className="num">{totalRounds || ''}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <div className="actions" style={{ marginTop: 12 }}>
          {rows.length < lists.items.length && (
            <button
              onClick={() => {
                const used = new Set(rows.map((r) => r.itemId));
                const next = lists.items.find((it) => !used.has(it.id));
                if (next) setRows([...rows, { itemId: next.id, a: '', b: '' }]);
              }}
            >
              + 加一项
            </button>
          )}
          <span className="muted small">{totalRounds > 0 ? `总局数 ${totalRounds}` : ''}</span>
        </div>
      </Card>

      {err && <p className="err">{err}</p>}
    </div>
  );
}

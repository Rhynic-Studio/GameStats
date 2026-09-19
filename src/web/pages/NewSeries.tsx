import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useGame } from '../GameLayout.tsx';
import { Btn, Card, Field, inputCls } from '../ui.tsx';
import { maxRoundsOf, slotsOf, winByOf } from '../../shared/types.ts';

/** 建局：只问最少的东西。进池 / BP / 逐轮都在下一个页面里分步录。 */
export default function NewSeries() {
  const { bundle } = useGame();
  const nav = useNavigate();
  const active = bundle.rulesets.filter((r) => !r.deprecated);

  const [player0, setPlayer0] = useState('');
  const [player1, setPlayer1] = useState('');
  const [bpFirstSide, setBpFirstSide] = useState<0 | 1>(0);
  const [rulesetKey, setRulesetKey] = useState(active[0]?.key ?? bundle.game.defaultRulesetKey);
  const [playedAt, setPlayedAt] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ruleset = bundle.rulesets.find((r) => r.key === rulesetKey);
  const slots = ruleset ? slotsOf(ruleset) : [];
  const hasDraft = slots.length > 0;
  const picksPerSide = slots.filter((s) => s.kind === 'pick').length / 2;
  const maxRounds = ruleset ? maxRoundsOf(ruleset) : 0;
  const winBy = ruleset ? winByOf(ruleset, bundle.game) : bundle.game.winBy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.createSeries(bundle.game.slug, {
        player0,
        player1,
        bpFirstSide,
        rulesetKey,
        playedAt,
        note,
      });
      nav(`../s/${id}`, { relative: 'path' });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <Card title="新建对局">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="玩家 1（side 0）">
            <input
              className={inputCls}
              list="known-players"
              value={player0}
              onChange={(e) => setPlayer0(e.target.value)}
              placeholder="输入名字，或用过的会出现在下拉里"
            />
          </Field>
          <Field label="玩家 2（side 1）">
            <input
              className={inputCls}
              list="known-players"
              value={player1}
              onChange={(e) => setPlayer1(e.target.value)}
              placeholder="输入名字"
            />
          </Field>
          <datalist id="known-players">
            {bundle.players.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>

          {hasDraft && (
            <Field label="BP 先手方" hint="只影响 ban/pick 的顺序，不是每轮的先攻">
              <select
                className={inputCls}
                value={bpFirstSide}
                onChange={(e) => setBpFirstSide(Number(e.target.value) as 0 | 1)}
              >
                <option value={0}>玩家 1 先手</option>
                <option value={1}>玩家 2 先手</option>
              </select>
            </Field>
          )}

          <Field label="BP 规则" hint={ruleset?.note}>
            <select className={inputCls} value={rulesetKey} onChange={(e) => setRulesetKey(e.target.value)}>
              {active.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="日期">
            <input type="date" className={inputCls} value={playedAt} onChange={(e) => setPlayedAt(e.target.value)} />
          </Field>

          <Field label="备注（可空）">
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>

        {ruleset && (
          <p className="mt-4 text-xs text-slate-400">
            {hasDraft ? (
              <>
                抽 {ruleset.poolSize} 个进池 · ban {slots.filter((s) => s.kind === 'ban').length} 个 · 每方 pick{' '}
                {picksPerSide} 个 · 最多 {maxRounds} 轮 · 先到 {winBy} 分
              </>
            ) : (
              <>
                无 ban/pick · 最多 {maxRounds} 轮 · 先到 {winBy} 分
              </>
            )}
          </p>
        )}

        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

        <div className="mt-4">
          <Btn variant="primary" onClick={submit} disabled={busy || !player0.trim() || !player1.trim()}>
            创建 → 去录进池名单
          </Btn>
        </div>
      </Card>
    </div>
  );
}

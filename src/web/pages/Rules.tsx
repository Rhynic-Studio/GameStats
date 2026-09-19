import { useEffect, useState } from 'react';
import { api, type GameConfig } from '../api.ts';
import { useGame } from '../GameLayout.tsx';
import { Btn, Card, Field, inputCls, Pill, cx } from '../ui.tsx';

/**
 * 规则编辑器。
 *
 * 全部改动直接落库，不需要碰任何源码文件。想改回文件里的初始状态就点「重置为文件内容」。
 */
export default function Rules() {
  const { bundle, reload } = useGame();
  const slug = bundle.game.slug;
  const [cfg, setCfg] = useState<GameConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    api.config(slug).then(setCfg).catch((e) => setMsg({ kind: 'err', text: String(e.message ?? e) }));
  }, [slug]);

  if (!cfg) return <p className="text-slate-400">{msg?.text ?? '加载中…'}</p>;

  const patch = (p: Partial<GameConfig>) => setCfg({ ...cfg, ...p });
  const patchRuleset = (i: number, p: Partial<GameConfig['rulesets'][number]>) =>
    setCfg({ ...cfg, rulesets: cfg.rulesets.map((r, j) => (j === i ? { ...r, ...p } : r)) });

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= cfg.rulesets.length) return;
    const next = [...cfg.rulesets];
    [next[i], next[j]] = [next[j], next[i]];
    patch({ rulesets: next });
  };

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.saveConfig(slug, cfg);
      await reload();
      setMsg({ kind: 'ok', text: '已保存' });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.game.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Btn variant="primary" onClick={save} disabled={busy}>
          保存
        </Btn>
        <Btn onClick={exportJson}>导出 JSON</Btn>
        <Btn
          onClick={async () => {
            if (!confirm('丢弃界面上的改动，重新读取 games/' + slug + '/game.json？')) return;
            await api.reloadConfigFromFile(slug);
            setCfg(await api.config(slug));
            await reload();
            setMsg({ kind: 'ok', text: '已从文件重置' });
          }}
        >
          重置为文件内容
        </Btn>
        {msg && (
          <span className={cx('text-xs', msg.kind === 'ok' ? 'text-emerald-400' : 'text-rose-300')}>{msg.text}</span>
        )}
      </div>

      <Card title="基本">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="游戏名">
            <input className={inputCls} value={cfg.name} onChange={(e) => patch({ name: e.target.value })} />
          </Field>
          <Field label="副标题">
            <input className={inputCls} value={cfg.tagline} onChange={(e) => patch({ tagline: e.target.value })} />
          </Field>
          <Field label="可选对象叫什么">
            <input
              className={inputCls}
              value={cfg.entityTypes[0]?.label ?? ''}
              onChange={(e) =>
                patch({ entityTypes: [{ ...cfg.entityTypes[0], key: cfg.entityTypes[0]?.key ?? 'default', label: e.target.value }] })
              }
            />
          </Field>
          <Field label="默认规则">
            <select
              className={inputCls}
              value={cfg.defaultRulesetKey}
              onChange={(e) => patch({ defaultRulesetKey: e.target.value })}
            >
              {cfg.rulesets.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="默认胜负线（先拿几分赢）">
            <input
              type="number"
              className={inputCls}
              value={cfg.winBy}
              onChange={(e) => patch({ winBy: Number(e.target.value) })}
            />
          </Field>
          <Field label="默认 bestOf">
            <input
              type="number"
              className={inputCls}
              value={cfg.bestOf}
              onChange={(e) => patch({ bestOf: Number(e.target.value) })}
            />
          </Field>
          <Field label="胜利条件（逗号分隔）">
            <input
              className={inputCls}
              value={cfg.winKinds.join(',')}
              onChange={(e) =>
                patch({
                  winKinds: e.target.value
                    .split(/[,，]/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card
        title={`规则（${cfg.rulesets.length}）`}
        right={
          <Btn
            onClick={() =>
              patch({
                rulesets: [
                  ...cfg.rulesets,
                  { key: `rule-${Date.now().toString(36)}`, label: '新规则', rounds: 3, winBy: 2, slots: [] },
                ],
              })
            }
          >
            + 新规则
          </Btn>
        }
      >
        <div className="grid gap-3">
          {cfg.rulesets.map((rs, i) => {
            const bans = (rs.slots ?? []).filter((s) => s.kind === 'ban').length;
            const picks = (rs.slots ?? []).filter((s) => s.kind === 'pick').length;
            const hasDraft = (rs.slots ?? []).length > 0;
            return (
              <div key={i} className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-3">
                <div className="mb-2 flex flex-wrap items-end gap-2">
                  <Field label="名字">
                    <input
                      className={cx(inputCls, 'w-44')}
                      value={rs.label}
                      onChange={(e) => patchRuleset(i, { label: e.target.value })}
                    />
                  </Field>
                  <Field label="key">
                    <input
                      className={cx(inputCls, 'w-36 font-mono')}
                      value={rs.key}
                      onChange={(e) => patchRuleset(i, { key: e.target.value })}
                    />
                  </Field>
                  <Field label="抽几个进池">
                    <input
                      type="number"
                      className={cx(inputCls, 'w-24')}
                      value={rs.poolSize ?? ''}
                      placeholder="无"
                      onChange={(e) =>
                        patchRuleset(i, { poolSize: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="最多打几轮">
                    <input
                      type="number"
                      className={cx(inputCls, 'w-24')}
                      value={rs.rounds ?? ''}
                      placeholder={hasDraft ? String(picks / 2) : '3'}
                      onChange={(e) =>
                        patchRuleset(i, { rounds: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="先拿几分赢">
                    <input
                      type="number"
                      className={cx(inputCls, 'w-24')}
                      value={rs.winBy ?? ''}
                      placeholder={String(cfg.winBy)}
                      onChange={(e) =>
                        patchRuleset(i, { winBy: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                    />
                  </Field>
                  <label className="flex items-center gap-1 pb-2 text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={!!rs.deprecated}
                      onChange={(e) => patchRuleset(i, { deprecated: e.target.checked })}
                    />
                    停用
                  </label>
                  <div className="ml-auto flex gap-1 pb-1">
                    <Btn variant="ghost" onClick={() => move(i, -1)} title="上移">
                      ↑
                    </Btn>
                    <Btn variant="ghost" onClick={() => move(i, 1)} title="下移">
                      ↓
                    </Btn>
                    <Btn
                      variant="ghost"
                      title="复制"
                      onClick={() => {
                        const next = [...cfg.rulesets];
                        next.splice(i + 1, 0, { ...rs, key: `${rs.key}-copy`, label: `${rs.label} 副本` });
                        patch({ rulesets: next });
                      }}
                    >
                      复制
                    </Btn>
                    <Btn
                      variant="ghost"
                      onClick={() => {
                        if (!confirm(`删掉规则「${rs.label}」？`)) return;
                        patch({ rulesets: cfg.rulesets.filter((_, j) => j !== i) });
                      }}
                    >
                      删
                    </Btn>
                  </div>
                </div>

                <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <Pill tone={hasDraft ? 'sky' : 'slate'}>{hasDraft ? `${bans} ban / ${picks} pick` : '无 BP'}</Pill>
                  <span>
                    {hasDraft
                      ? `每方 pick ${picks / 2} 个，最多打 ${rs.rounds ?? picks / 2} 轮`
                      : `没有 ban/pick，最多打 ${rs.rounds ?? 3} 轮`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {(rs.slots ?? []).map((s, si) => (
                    <span
                      key={si}
                      className={cx(
                        'flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]',
                        s.kind === 'ban'
                          ? 'border-rose-800 bg-rose-950/40 text-rose-200'
                          : 'border-slate-600 bg-slate-800/60 text-slate-200',
                      )}
                    >
                      <button
                        title="切换执行方"
                        onClick={() => {
                          const slots = [...(rs.slots ?? [])];
                          slots[si] = { ...s, who: s.who === 'first' ? 'second' : 'first' };
                          patchRuleset(i, { slots });
                        }}
                        className={s.who === 'first' ? 'text-sky-300' : 'text-violet-300'}
                      >
                        {s.who === 'first' ? '先手' : '后手'}
                      </button>
                      <button
                        title="切换 ban / pick"
                        onClick={() => {
                          const slots = [...(rs.slots ?? [])];
                          slots[si] = { ...s, kind: s.kind === 'ban' ? 'pick' : 'ban' };
                          patchRuleset(i, { slots });
                        }}
                      >
                        {s.kind}
                      </button>
                      <button
                        title="上移"
                        onClick={() => {
                          if (si === 0) return;
                          const slots = [...(rs.slots ?? [])];
                          [slots[si - 1], slots[si]] = [slots[si], slots[si - 1]];
                          patchRuleset(i, { slots });
                        }}
                        className="text-slate-500 hover:text-slate-200"
                      >
                        ‹
                      </button>
                      <button
                        title="下移"
                        onClick={() => {
                          const slots = [...(rs.slots ?? [])];
                          if (si === slots.length - 1) return;
                          [slots[si + 1], slots[si]] = [slots[si], slots[si + 1]];
                          patchRuleset(i, { slots });
                        }}
                        className="text-slate-500 hover:text-slate-200"
                      >
                        ›
                      </button>
                      <button
                        title="删除这个槽位"
                        onClick={() => patchRuleset(i, { slots: (rs.slots ?? []).filter((_, j) => j !== si) })}
                        className="text-slate-500 hover:text-rose-300"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <Btn onClick={() => patchRuleset(i, { slots: [...(rs.slots ?? []), { who: 'first', kind: 'pick' }] })}>
                    + pick
                  </Btn>
                  <Btn onClick={() => patchRuleset(i, { slots: [...(rs.slots ?? []), { who: 'first', kind: 'ban' }] })}>
                    + ban
                  </Btn>
                  {!hasDraft && <span className="text-[11px] text-slate-500">这套规则没有 ban/pick 阶段</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

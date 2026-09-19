import { useState } from 'react';
import { api, type Entity, type Player } from '../api.ts';
import { useGame } from '../GameLayout.tsx';
import { Btn, Card, inputCls } from '../ui.tsx';

export default function DataPage() {
  const { bundle, reload } = useGame();
  const slug = bundle.game.slug;
  const label = bundle.game.entityTypes[0]?.label ?? '实体';
  const [err, setErr] = useState<string | null>(null);
  const [newPlayer, setNewPlayer] = useState('');
  const [newEntity, setNewEntity] = useState('');

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {err && <p className="text-xs text-rose-300 lg:col-span-2">{err}</p>}

      <Card
        title={`玩家（${bundle.players.length}）`}

      >
        <div className="mb-3 flex gap-2">
          <input
            className={inputCls}
            placeholder="新玩家名"
            value={newPlayer}
            onChange={(e) => setNewPlayer(e.target.value)}
          />
          <Btn
            variant="primary"
            disabled={!newPlayer.trim()}
            onClick={() => guard(async () => {
              await api.addPlayer(slug, newPlayer.trim());
              setNewPlayer('');
            })}
          >
            添加
          </Btn>
        </div>
        <ul className="divide-y divide-slate-700/40">
          {bundle.players.map((p) => (
            <Row
              key={p.id}
              item={p}
              onSave={(body) => guard(() => api.patchPlayer(slug, p.id, body))}
            />
          ))}
          {bundle.players.length === 0 && <li className="py-4 text-center text-xs text-slate-500">还没有玩家</li>}
        </ul>
      </Card>

      <Card
        title={`${label}（${bundle.entities.length}）`}

      >
        <div className="mb-3 flex gap-2">
          <input
            className={inputCls}
            placeholder={`新${label}名`}
            value={newEntity}
            onChange={(e) => setNewEntity(e.target.value)}
          />
          <Btn
            variant="primary"
            disabled={!newEntity.trim()}
            onClick={() => guard(async () => {
              await api.addEntity(slug, newEntity.trim());
              setNewEntity('');
            })}
          >
            添加
          </Btn>
        </div>
        <ul className="divide-y divide-slate-700/40">
          {bundle.entities.map((e) => (
            <Row key={e.id} item={e} onSave={(body) => guard(() => api.patchEntity(slug, e.id, body))} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

function Row({
  item,
  onSave,
}: {
  item: Player | Entity;
  onSave: (body: { name: string; aliases: string[]; enabled: boolean }) => void;
}) {
  const [name, setName] = useState(item.name);
  const [aliases, setAliases] = useState(item.aliases.join(','));
  const dirty = name !== item.name || aliases !== item.aliases.join(',');

  return (
    <li className="flex items-center gap-2 py-2">
      <input className={`${inputCls} w-28`} value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className={`${inputCls} flex-1`}
        placeholder="别名（逗号分隔）"
        value={aliases}
        onChange={(e) => setAliases(e.target.value)}
      />
      <label className="flex items-center gap-1 text-[11px] text-slate-400">
        <input
          type="checkbox"
          checked={!!item.enabled}
          onChange={(e) => onSave({ name, aliases: split(aliases), enabled: e.target.checked })}
        />
        启用
      </label>
      <Btn
        disabled={!dirty}
        onClick={() => onSave({ name, aliases: split(aliases), enabled: !!item.enabled })}
      >
        保存
      </Btn>
    </li>
  );
}

const split = (s: string) =>
  s
    .split(/[,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

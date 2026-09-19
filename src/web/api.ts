/** 后端 API 客户端。所有写操作立即落库，前端不做乐观状态。 */

async function j<T>(r: Response): Promise<T> {
  const text = await r.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`服务端返回了非 JSON（${r.status}）：${text.slice(0, 200)}`);
  }
  if (!r.ok) throw new Error(data?.error ?? `${r.status} ${r.statusText}`);
  return data as T;
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j);
const put = (url: string, body: unknown) =>
  fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j);
const patch = (url: string, body: unknown) =>
  fetch(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(j);
const del = (url: string) => fetch(url, { method: 'DELETE' }).then(j);

export const api = {
  games: () => fetch('/api/games').then(j) as Promise<GameBrief[]>,
  game: (g: string) => fetch(`/api/g/${g}`).then(j) as Promise<GameBundle>,
  overview: (g: string) => fetch(`/api/g/${g}/overview`).then(j) as Promise<Overview>,
  seriesList: (g: string) => fetch(`/api/g/${g}/series`).then(j) as Promise<SeriesSummary[]>,
  series: (g: string, id: number) => fetch(`/api/g/${g}/series/${id}`).then(j) as Promise<SeriesDetail>,
  createSeries: (g: string, body: any) => post(`/api/g/${g}/series`, body) as Promise<{ id: number; detail: SeriesDetail }>,
  updateSeries: (g: string, id: number, body: any) => patch(`/api/g/${g}/series/${id}`, body) as Promise<{ detail: SeriesDetail }>,
  deleteSeries: (g: string, id: number) => del(`/api/g/${g}/series/${id}`),
  putPool: (g: string, id: number, entityIds: number[]) =>
    put(`/api/g/${g}/series/${id}/pool`, { entityIds }) as Promise<{ detail: SeriesDetail }>,
  putDraft: (g: string, id: number, actions: { slotIndex: number; entityId: number }[]) =>
    put(`/api/g/${g}/series/${id}/draft`, { actions }) as Promise<{ detail: SeriesDetail }>,
  putRounds: (g: string, id: number, rounds: any[]) =>
    put(`/api/g/${g}/series/${id}/rounds`, { rounds }) as Promise<{ detail: SeriesDetail }>,
  stats: (g: string, params: Record<string, string>) =>
    fetch(`/api/g/${g}/stats?${new URLSearchParams(params)}`).then(j) as Promise<{ tables: StatTable[] }>,
  addPlayer: (g: string, name: string) => post(`/api/g/${g}/players`, { name }) as Promise<{ players: Player[] }>,
  patchPlayer: (g: string, id: number, body: any) => patch(`/api/g/${g}/players/${id}`, body) as Promise<{ players: Player[] }>,
  addEntity: (g: string, name: string, aliases: string[] = []) =>
    post(`/api/g/${g}/entities`, { name, aliases }) as Promise<{ entities: Entity[] }>,
  patchEntity: (g: string, id: number, body: any) => patch(`/api/g/${g}/entities/${id}`, body) as Promise<{ entities: Entity[] }>,

  config: (g: string) => fetch(`/api/g/${g}/config`).then(j) as Promise<GameConfig>,
  saveConfig: (g: string, cfg: GameConfig) => put(`/api/g/${g}/config`, cfg) as Promise<{ config: GameConfig }>,
  reloadConfigFromFile: (g: string) => post(`/api/g/${g}/config/reload-from-file`, {}) as Promise<{ config: GameConfig }>,
};

/* ---------------- 类型（与后端 shared/types.ts 对应，这里只放界面用得到的部分） ---------------- */

export interface GameBrief {
  slug: string;
  name: string;
  tagline: string;
  entityLabel: string;
}

export interface DraftSlot {
  who: 'first' | 'second';
  kind: 'ban' | 'pick';
}

export interface Ruleset {
  key: string;
  label: string;
  /** 没有抽池/BP 环节的规则（如 cs2 单挑）这两个是空的 */
  poolSize?: number;
  slots?: DraftSlot[];
  /** 最多打几轮；省略时由 pick 槽位数推导 */
  rounds?: number;
  winBy?: number;
  bestOf?: number;
  deprecated?: boolean;
  note?: string;
}

export interface Entity {
  id: number;
  game: string;
  type: string;
  name: string;
  aliases: string[];
  enabled: number;
  sort: number;
}

export interface Player {
  id: number;
  name: string;
  aliases: string[];
  enabled: number;
}

export interface RoundResultDef {
  key: string;
  label: string;
  winner: 0 | 1 | null;
  played: boolean;
}

export interface GameDef {
  slug: string;
  name: string;
  tagline: string;
  entityTypes: { key: string; label: string }[];
  rulesets: Ruleset[];
  defaultRulesetKey: string;
  bestOf: number;
  winBy: number;
  roundResults: RoundResultDef[];
  winKinds: string[];
  entrySteps: string[];
  statPresets: string[];
}

/** 完整游戏定义（配置页读写的就是这个） */
export interface GameConfig extends GameDef {
  seedEntities: { name: string; aliases?: string }[];
}

export interface GameBundle {
  game: GameDef;
  rulesets: Ruleset[];
  entities: Entity[];
  players: Player[];
  presets: { key: string; title: string; note?: string; grain: string }[];
}

export interface SeriesSummary {
  id: number;
  game: string;
  rulesetKey: string;
  rulesetLabel: string;
  playedAt: string;
  note: string;
  sides: { playerId: number | null; playerName: string }[];
  bpFirstSide: 0 | 1;
  score: [number, number];
  winnerSide: 0 | 1 | null;
  isDraw: boolean;
  concluded: boolean;
  status: 'drafting' | 'ready' | 'playing' | 'done';
  /** 这套规则有没有 BP 阶段 */
  hasDraft: boolean;
  winBy: number;
  progress: {
    poolCount: number;
    poolSize: number;
    draftFilled: number;
    draftTotal: number;
    roundsDone: number;
    roundsTotal: number;
  };
}

export interface RoundRow {
  idx: number;
  initiativeSide: 0 | 1 | null;
  side0Entity: number | null;
  side1Entity: number | null;
  result: string;
  winKind: string;
  note: string;
}

export interface SeriesDetail extends SeriesSummary {
  ruleset: Ruleset;
  pool: { entityId: number; seq: number }[];
  draft: { slotIndex: number; entityId: number }[];
  rounds: RoundRow[];
  buffsBefore: Record<string, [number, number]>;
  maxBuffs: [number, number];
}

export interface Overview {
  seriesCount: number;
  concluded: number;
  inProgress: number;
  roundCount: number;
  playerCount: number;
  entityCount: number;
  entitiesNeverPlayed: string[];
  recent: SeriesSummary[];
}

export interface StatValue {
  value: number;
  num: number;
  den: number;
}

export interface StatTable {
  recipeKey: string;
  title: string;
  note?: string;
  columns: { key: string; label: string }[];
  metricCols: { key: string; label: string; ratio: boolean }[];
  rows: { keys: string[]; values: StatValue[] }[];
  rowCount: number;
}

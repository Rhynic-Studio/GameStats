import type {
  Player,
  ListItem,
  MatchDetail,
  MatchSummary,
  StatTable,
} from '../../shared/types.ts';
import { apiUrl } from './base.ts';

async function j<T>(r: Response): Promise<T> {
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(data?.error ?? `${r.status} ${r.statusText}`);
  return data as T;
}

const send = (method: string, url: string, body?: unknown) =>
  fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(j);

const at = (game: string) => apiUrl(`api/${game}`);

/* ---------------- cs2 ---------------- */

export interface Cs2Lists {
  items: ListItem[];
  modes: ListItem[];
  players: Player[];
}

export const cs2 = {
  lists: () => fetch(`${at('cs2')}/lists`).then(j) as Promise<Cs2Lists>,
  matches: () => fetch(`${at('cs2')}/matches`).then(j) as Promise<MatchSummary[]>,
  match: (id: number) => fetch(`${at('cs2')}/matches/${id}`).then(j) as Promise<MatchDetail>,
  create: (body: unknown) => send('POST', `${at('cs2')}/matches`, body) as Promise<{ id: number }>,
  update: (id: number, body: unknown) => send('PUT', `${at('cs2')}/matches/${id}`, body),
  remove: (id: number) => send('DELETE', `${at('cs2')}/matches/${id}`),
  addPlayer: (name: string) => send('POST', `${at('cs2')}/players`, { name }),
  stats: (player?: number, opponent?: number) => {
    const q = new URLSearchParams();
    if (player !== undefined) q.set('player', String(player));
    if (opponent !== undefined) q.set('opponent', String(opponent));
    return fetch(`${at('cs2')}/stats?${q}`).then(j) as Promise<StatTable[]>;
  },
};

/* ---------------- crash ---------------- */

export interface CrashLists {
  roles: (ListItem & { color: string })[];
  players: Player[];
  rules: { key: string; label: string; poolSize: number }[];
  roundResults: { key: string; label: string }[];
}

export const crash = {
  lists: () => fetch(`${at('crash')}/lists`).then(j) as Promise<CrashLists>,
  matches: () => fetch(`${at('crash')}/matches`).then(j) as Promise<import('../../shared/types.ts').CrashSummary[]>,
  match: (id: number) =>
    fetch(`${at('crash')}/matches/${id}`).then(j) as Promise<import('../../shared/types.ts').CrashMatchDetail>,
  create: (body: unknown) => send('POST', `${at('crash')}/matches`, body) as Promise<{ id: number }>,
  update: (id: number, body: unknown) => send('PUT', `${at('crash')}/matches/${id}`, body),
  remove: (id: number) => send('DELETE', `${at('crash')}/matches/${id}`),
  addPlayer: (name: string) => send('POST', `${at('crash')}/players`, { name }),
  stats: (player?: number, rule?: string) => {
    const q = new URLSearchParams();
    if (player !== undefined) q.set('player', String(player));
    if (rule) q.set('rule', rule);
    return fetch(`${at('crash')}/stats?${q}`).then(j) as Promise<StatTable[]>;
  },
};

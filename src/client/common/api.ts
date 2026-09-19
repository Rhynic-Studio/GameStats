import type { ListItem, MatchDetail, MatchSummary, Player, StatTable } from '../../shared/types.ts';

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

export interface Lists {
  items: ListItem[];
  modes: ListItem[];
  players: Player[];
}

export const api = {
  lists: () => fetch('/api/cs2/lists').then(j) as Promise<Lists>,
  matches: () => fetch('/api/cs2/matches').then(j) as Promise<MatchSummary[]>,
  match: (id: number) => fetch(`/api/cs2/matches/${id}`).then(j) as Promise<MatchDetail>,
  createMatch: (body: unknown) => send('POST', '/api/cs2/matches', body) as Promise<{ id: number }>,
  updateMatch: (id: number, body: unknown) => send('PUT', `/api/cs2/matches/${id}`, body) as Promise<{ ok: true }>,
  deleteMatch: (id: number) => send('DELETE', `/api/cs2/matches/${id}`) as Promise<{ ok: true }>,
  addPlayer: (name: string) => send('POST', '/api/cs2/players', { name }) as Promise<Lists>,
  stats: (player?: number, opponent?: number) => {
    const q = new URLSearchParams();
    if (player !== undefined) q.set('player', String(player));
    if (opponent !== undefined) q.set('opponent', String(opponent));
    return fetch(`/api/cs2/stats?${q}`).then(j) as Promise<StatTable[]>;
  },
};

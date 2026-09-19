import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameDef, StatRecipe } from '../shared/types.ts';
import { db, writeGameConfig } from './db.ts';

/**
 * 游戏发现与加载。
 *
 * **加一个游戏 = 建一个 `games/<slug>/` 目录，放一个 `game.json`。**
 * 不需要改这个文件，不需要改任何 .ts，不需要重新构建。
 *
 * 目录里可以有的东西：
 *   game.json     游戏定义（名字、实体类型、规则集、结果类型、初始名单）—— 必需
 *   presets.json  统计配方 —— 可选，纯声明式数据
 *   RoundBoard.tsx  这个游戏专属的轮次录入界面 —— 可选，真需要写代码的规则才放这
 *
 * 运行期权威是数据库：JSON 只在库里还没有这个游戏时导入一次。
 */

export const GAMES_DIR = fileURLToPath(new URL('../../games', import.meta.url));

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8'));

let _slugs: string[] | null = null;

/** 扫 games/ 目录。目录名即 URL 路径（/crash、/cs2）。 */
export function gameSlugs(): string[] {
  if (_slugs) return _slugs;
  if (!existsSync(GAMES_DIR)) return (_slugs = []);
  _slugs = readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(GAMES_DIR, e.name, 'game.json')))
    .map((e) => e.name)
    .sort();
  return _slugs;
}

export const gameConfigPath = (slug: string) => join(GAMES_DIR, slug, 'game.json');

/** 磁盘上的游戏定义（只在首次导入和"重置为文件内容"时用） */
export function readGameConfigFile(slug: string): GameDef {
  const p = gameConfigPath(slug);
  if (!existsSync(p)) throw new Error(`没有这个游戏: ${slug}（找不到 games/${slug}/game.json）`);
  return readJson<GameDef>(p);
}

/** 运行期使用：库里的定义（界面上改过的以库里为准） */
export function loadGame(slug: string): GameDef {
  const row = db().prepare(`SELECT config_json FROM games WHERE slug = ?`).get(slug) as
    | Record<string, any>
    | undefined;
  if (!row) throw new Error(`未知游戏: ${slug}`);
  return JSON.parse(row.config_json as string) as GameDef;
}

export function allGames(): GameDef[] {
  return gameSlugs().map(loadGame);
}

/** 把界面上的改动落库 */
export function saveGame(slug: string, config: GameDef): void {
  writeGameConfig(slug, config);
}

/* ------------------------------------------------------------------ */
/* 统计配方（声明式数据，来自 presets.json）                            */
/* ------------------------------------------------------------------ */

const _presets = new Map<string, StatRecipe[]>();

export function getPresets(slug: string): StatRecipe[] {
  const hit = _presets.get(slug);
  if (hit) return hit;
  const p = join(GAMES_DIR, slug, 'presets.json');
  const list = existsSync(p) ? readJson<StatRecipe[]>(p) : [];
  _presets.set(slug, list);
  return list;
}

export function getPreset(slug: string, key: string): StatRecipe {
  const r = getPresets(slug).find((x) => x.key === key);
  if (!r) throw new Error(`未知统计配方: ${slug}/${key}`);
  return r;
}

/* ------------------------------------------------------------------ */

/** 启动自检：首页要展示的配方必须真的存在，否则点到那张表就 500 */
export function assertPresetsConsistent(): void {
  for (const game of allGames()) {
    const known = new Set(getPresets(game.slug).map((p) => p.key));
    const missing = (game.statPresets ?? []).filter((k) => !known.has(k));
    if (missing.length) {
      throw new Error(`游戏 ${game.slug} 的 statPresets 引用了不存在的配方: ${missing.join(', ')}`);
    }
  }
}

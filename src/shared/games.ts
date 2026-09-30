/**
 * 做过的游戏。slug 既是它的路径段（/cs2、/crash），也是库里认的东西。
 *
 * 这里列的是**全部**游戏；实际服务哪些由 GAMES 环境变量挑（见 src/server/index.ts）。
 * 关掉一个游戏只是不注册它的接口、不在首页列出来 —— 库里的表和数据一律不动，
 * 重新启用就全回来了。
 */
export const ALL_GAMES = [
  { slug: 'cs2', name: 'CS2 单挑', tagline: '手枪 / 长枪 / 狙击 / solo三项' },
  { slug: 'crash', name: 'Crash', tagline: '1v1 · 抽池 · ban/pick · BO3' },
] as const;

export type Game = (typeof ALL_GAMES)[number];
export type GameSlug = Game['slug'];

/** 客户端拿到的是接口返回的子集，形状一样 */
export type GameInfo = { slug: string; name: string; tagline: string };

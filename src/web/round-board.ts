import type { ComponentType } from 'react';
import RoundBoardGeneric from './RoundBoardGeneric.tsx';

/**
 * 自动发现游戏专属的轮次录入界面。
 *
 * 放一个 `games/<slug>/RoundBoard.tsx` 就自动生效，不需要在任何地方注册。
 * 没放的游戏（cs2）直接用通用实现。
 */
const modules = import.meta.glob('../games/*/RoundBoard.tsx', { eager: true }) as Record<
  string,
  { default?: ComponentType<RoundBoardProps> }
>;

const CUSTOM: Record<string, ComponentType<RoundBoardProps>> = {};
for (const [path, mod] of Object.entries(modules)) {
  const slug = path.split('/')[2];
  if (slug && mod?.default) CUSTOM[slug] = mod.default;
}

export interface RoundBoardProps {
  detail: any;
  bundle: any;
  entityById: Map<number, any>;
  onSave: (rounds: any[]) => void;
  name: (i: 0 | 1) => string;
  stepNo?: string;
}

export const roundBoardFor = (slug: string): ComponentType<RoundBoardProps> =>
  CUSTOM[slug] ?? (RoundBoardGeneric as ComponentType<RoundBoardProps>);

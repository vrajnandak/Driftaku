import type * as d3 from 'd3-force';
import type * as PIXI from 'pixi.js';


export interface UserLink {
  sourceId: number;
  targetId: number;
}

export interface GameNode extends d3.SimulationNodeDatum {
  id: number;
  type: number;
  name: string;
  image?: string;
  connections: number[];
}

export interface GameLink extends d3.SimulationLinkDatum<GameNode> {
  source: GameNode;
  target: GameNode;
}

export interface LevelMetadata {
  level?: number;
  start_node: number;
  start_name: string;
  end_node: number;
  end_name: string;
  total_nodes: number;
}

export interface LevelData {
  metadata: LevelMetadata;
  nodes: GameNode[];
}

export interface NodeVisuals {
  container: PIXI.Container;
  bg: PIXI.Graphics;
  icon: PIXI.Graphics;
}

export const TYPE_MAP = {
  0: "Character",
  1: "Voice Actor",
  2: "Anime",
  3: "Studio"
};
export const NODE_COLORS: Record<number, number> = {
  2: 0x818cf8, // Anime (Indigo)
  0: 0xf43f5e, // Character (Rose)
  1: 0xfbbf24, // Voice Actor (Amber)
  3: 0x10b981, // Studio (Emerald)
};
export const SPECIAL_NODE_COLORS = {
  Start: 0xffffff,
  Target: 0x22d3ee,
  Hint: 0xf59e0b
};
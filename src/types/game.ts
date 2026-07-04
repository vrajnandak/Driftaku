import type * as d3 from 'd3-force';
import type * as PIXI from 'pixi.js';

export interface GameNode extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  name: string;
  image?: string;
  connections: string[];
}

export interface GameLink extends d3.SimulationLinkDatum<GameNode> {
  source: GameNode;
  target: GameNode;
}

export interface LevelMetadata {
  level: number;
  start_node: string;
  start_name: string;
  end_node: string;
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
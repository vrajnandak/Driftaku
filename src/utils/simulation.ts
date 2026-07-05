import * as d3 from 'd3-force';
import type { GameNode, GameLink } from '../types/game';

export const initSimulation = (nodes: GameNode[], links: GameLink[]) => {
    return d3.forceSimulation<GameNode>(nodes)
        .force("charge", d3.forceManyBody().strength(-800))
        .force("collide", d3.forceCollide().radius(80))
        .force("x", d3.forceX(1000).strength(0.05))
        .force("y", d3.forceY(1000).strength(0.05));
};
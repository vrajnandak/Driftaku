import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { NODE_COLORS, type GameNode, type GameLink, type LevelData, type NodeVisuals } from '../types/game';

interface Props {
  levelData: LevelData;
  onWin: (finalTime: number) => void;
}

const GameClient: React.FC<Props> = ({ levelData, onWin }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [uiPath, setUiPath] = useState<string[]>([levelData.metadata.start_node]);
  const [seconds, setSeconds] = useState(0);
  const [isWon, setIsWon] = useState(false);

  const stateRef = useRef({
    currentNodeId: levelData.metadata.start_node,
    pathTaken: [levelData.metadata.start_node],
    endNodeId: levelData.metadata.end_node,
    startTime: Date.now()
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const app = new PIXI.Application();
    let simulation: d3.Simulation<GameNode, undefined>;
    let timerInterval: number;

    const init = async () => {
      await app.init({
        resizeTo: containerRef.current!,
        backgroundColor: 0x020617,
        antialias: true,
      });
      containerRef.current?.appendChild(app.canvas);

      // Viewport setup
      const viewport = new Viewport({
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
        worldWidth: 2000,
        worldHeight: 2000,
        events: app.renderer.events,
      });
      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000).setZoom(0.7);

      // Data Prep
      const nodes: GameNode[] = levelData.nodes.map(n => ({ ...n, x: 1000, y: 1000 }));
      const links: GameLink[] = [];
      levelData.nodes.forEach(s => {
        s.connections.forEach(tId => {
          if (s.id < tId) {
            const source = nodes.find(n => n.id === s.id);
            const target = nodes.find(n => n.id === tId);
            if (source && target) links.push({ source, target });
          }
        });
      });

      const linkLayer = new PIXI.Graphics();
      const nodeLayer = new PIXI.Container();
      viewport.addChild(linkLayer, nodeLayer);

      const spriteMap: Record<string, NodeVisuals> = {};

      // Create Nodes
      nodes.forEach((node) => {
        const container = new PIXI.Container();
        const bg = new PIXI.Graphics();
        const icon = new PIXI.Graphics().circle(0, 0, 20).fill(0x1e293b);
        
        container.addChild(bg, icon);
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.on('pointerdown', () => handleNodeClick(node.id, nodes));

        nodeLayer.addChild(container);
        spriteMap[node.id] = { container, bg, icon };

        if (node.image) {
          PIXI.Assets.load(node.image).then((tex) => {
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5); s.width = s.height = 60;
            const m = new PIXI.Graphics().circle(0, 0, 30).fill(0xffffff);
            s.mask = m; container.addChild(m, s);
            icon.visible = false;
          });
        }
      });

      simulation = d3.forceSimulation<GameNode>(nodes)
        .force("link", d3.forceLink<GameNode, GameLink>(links).id(d => d.id).distance(150))
        .force("charge", d3.forceManyBody().strength(-700))
        .force("center", d3.forceCenter(1000, 1000))
        .force("collide", d3.forceCollide().radius(80));

      // Timer update
      timerInterval = window.setInterval(() => {
        if (!isWon) setSeconds((Date.now() - stateRef.current.startTime) / 1000);
      }, 100);

      // Main Render Ticker
      let elapsed = 0;
      app.ticker.add((ticker) => {
        elapsed += ticker.deltaTime;
        const pulse = Math.sin(elapsed * 0.1) * 5 + 5; // For Target node

        linkLayer.clear();
        links.forEach((link) => {
          const isPath = stateRef.current.pathTaken.includes(link.source.id) && stateRef.current.pathTaken.includes(link.target.id);
          linkLayer.moveTo(link.source.x!, link.source.y!).lineTo(link.target.x!, link.target.y!)
            .stroke({ width: isPath ? 6 : 2, color: isPath ? 0x6366f1 : 0x1e293b, alpha: isPath ? 1 : 0.4 });
        });

        nodes.forEach((node) => {
          const { container, bg } = spriteMap[node.id];
          container.x = node.x!; container.y = node.y!;
          
          const isCurrent = node.id === stateRef.current.currentNodeId;
          const isTarget = node.id === stateRef.current.endNodeId;
          const nodeColor = NODE_COLORS[node.type as keyof typeof NODE_COLORS] || 0xffffff;

          bg.clear()
            .circle(0, 0, isTarget ? 35 + pulse : 33)
            .fill(0x0f172a)
            .stroke({ 
              width: (isCurrent || isTarget) ? 5 : 2, 
              color: isCurrent ? 0xffffff : (isTarget ? NODE_COLORS.Target : nodeColor),
              alignment: 0 
            });
        });
      });
    };

    const handleNodeClick = (clickedId: string, allNodes: GameNode[]) => {
      const current = allNodes.find(n => n.id === stateRef.current.currentNodeId);
      if (current?.connections.includes(clickedId)) {
        stateRef.current.currentNodeId = clickedId;
        stateRef.current.pathTaken.push(clickedId);
        setUiPath([...stateRef.current.pathTaken]);
        if (clickedId === stateRef.current.endNodeId) {
          setIsWon(true);
          onWin((Date.now() - stateRef.current.startTime) / 1000);
        }
      }
    };

    init();
    return () => { 
      app.destroy(true, { children: true, texture: true });
      simulation?.stop();
      clearInterval(timerInterval);
    };
  }, [levelData]);

  return (
    <div className="relative w-full h-full bg-slate-950">
      <div ref={containerRef} className="w-full h-full absolute inset-0" />
      
      {/* Dynamic Timer Overlay */}
      <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 font-mono text-xl text-white pointer-events-none">
        {seconds.toFixed(1)}s
      </div>

      <div className="absolute bottom-6 left-6 right-6 pointer-events-none">
        <div className="flex gap-2 flex-wrap max-w-2xl mx-auto justify-center">
            {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-md border border-white/5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `#${color.toString(16)}` }}></div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">{type}</span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default GameClient;
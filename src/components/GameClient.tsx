import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import type { GameNode, GameLink, LevelData, NodeVisuals } from '../types/game';

interface Props {
  levelData: LevelData;
}

// --- CONSTANTS ---
const COLORS = {
  bg: 0x020617,
  nodeBg: 0x0f172a,
  nodeStroke: 0x334155,
  current: 0x818cf8,
  target: 0x10b981,
  linkDefault: 0x1e293b,
  linkActive: 0x6366f1,
};

// --- HELPERS ---
const drawNodeCircle = (g: PIXI.Graphics, id: string, isCurrent: boolean, endNodeId: string) => {
  g.clear();
  const isEnd = id === endNodeId;
  const strokeColor = isCurrent ? COLORS.current : (isEnd ? COLORS.target : COLORS.nodeStroke);
  const strokeWidth = isCurrent || isEnd ? 4 : 2;
  
  g.circle(0, 0, 33)
   .fill(COLORS.nodeBg)
   .stroke({ width: strokeWidth, color: strokeColor });
};

const GameClient: React.FC<Props> = ({ levelData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isWon, setIsWon] = useState(false);
  const [uiPath, setUiPath] = useState<string[]>([levelData.metadata.start_node]);

  // Game state refs for performance (ticker access)
  const stateRef = useRef({
    currentNodeId: levelData.metadata.start_node,
    pathTaken: [levelData.metadata.start_node],
    endNodeId: levelData.metadata.end_node,
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const app = new PIXI.Application();
    let simulation: d3.Simulation<GameNode, undefined>;

    const init = async () => {
      await app.init({
        resizeTo: containerRef.current!,
        backgroundColor: COLORS.bg,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
      });
      
      containerRef.current?.appendChild(app.canvas);

      const viewport = new Viewport({
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
        worldWidth: 2000,
        worldHeight: 2000,
        events: app.renderer.events,
      });

      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate();
      viewport.moveCenter(1000, 1000).setZoom(0.8);

      // Setup Data
      const nodes: GameNode[] = levelData.nodes.map(n => ({ 
        ...n, 
        x: 1000 + (Math.random() - 0.5) * 200, 
        y: 1000 + (Math.random() - 0.5) * 200 
      }));
      
      const links: GameLink[] = [];
      levelData.nodes.forEach(s => {
        s.connections.forEach(targetId => {
          if (s.id < targetId) {
            const source = nodes.find(n => n.id === s.id);
            const target = nodes.find(n => n.id === targetId);
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
        
        drawNodeCircle(bg, node.id, node.id === stateRef.current.currentNodeId, stateRef.current.endNodeId);
        
        container.addChild(bg, icon);
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.on('pointerdown', () => handleNodeClick(node.id, nodes));

        nodeLayer.addChild(container);
        spriteMap[node.id] = { container, bg, icon };

        if (node.image) {
          PIXI.Assets.load(node.image).then((texture: PIXI.Texture) => {
            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.width = sprite.height = 60;
            sprite.mask = new PIXI.Graphics().circle(0, 0, 30).fill(0xffffff);
            container.addChild(sprite.mask, sprite);
            icon.visible = false;
          });
        }
      });

      simulation = d3.forceSimulation<GameNode>(nodes)
        .force("link", d3.forceLink<GameNode, GameLink>(links).id(d => d.id).distance(140))
        .force("charge", d3.forceManyBody().strength(-600))
        .force("center", d3.forceCenter(1000, 1000))
        .force("collide", d3.forceCollide().radius(70));

      app.ticker.add(() => {
        linkLayer.clear();
        links.forEach((link) => {
          const isPath = stateRef.current.pathTaken.includes(link.source.id) && 
                         stateRef.current.pathTaken.includes(link.target.id);
          
          linkLayer.moveTo(link.source.x!, link.source.y!)
                   .lineTo(link.target.x!, link.target.y!)
                   .stroke({
                      width: isPath ? 5 : 2,
                      color: isPath ? COLORS.linkActive : COLORS.linkDefault,
                      alpha: isPath ? 1 : 0.5
                   });
        });

        nodes.forEach((node) => {
          const { container, bg } = spriteMap[node.id];
          container.x = node.x!;
          container.y = node.y!;
          drawNodeCircle(bg, node.id, node.id === stateRef.current.currentNodeId, stateRef.current.endNodeId);
        });
      });
    };

    const handleNodeClick = (clickedId: string, allNodes: GameNode[]) => {
      const current = allNodes.find(n => n.id === stateRef.current.currentNodeId);
      if (current?.connections.includes(clickedId)) {
        stateRef.current.currentNodeId = clickedId;
        stateRef.current.pathTaken.push(clickedId);
        setUiPath([...stateRef.current.pathTaken]);
        if (clickedId === stateRef.current.endNodeId) setIsWon(true);
      }
    };

    init();
    return () => {
      app.destroy(true, { children: true, texture: true });
      simulation?.stop();
    };
  }, [levelData]);

  return (
    <div className="relative w-full h-full min-h-[500px] bg-slate-950">
      <div ref={containerRef} className="w-full h-full absolute inset-0" />
      
      {isWon && <VictoryModal onNext={() => window.location.reload()} />}

      <TargetIndicator name={levelData.metadata.end_name} />
      <PathBreadcrumbs path={uiPath} nodes={levelData.nodes} />
    </div>
  );
};

// --- SUB-COMPONENTS ---

const VictoryModal = ({ onNext }: { onNext: () => void }) => (
  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[100] p-6">
    <div className="max-w-sm w-full bg-slate-900 border border-white/10 p-8 rounded-3xl text-center shadow-2xl">
      <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-3xl font-bold text-white mb-2">Web Cleared!</h2>
      <p className="text-slate-400 mb-8">You successfully drifted through the path.</p>
      <button onClick={onNext} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all active:scale-95">
        Next Challenge
      </button>
    </div>
  </div>
);

const TargetIndicator = ({ name }: { name: string }) => (
  <div className="absolute top-4 left-4 z-10 pointer-events-none">
    <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Target</p>
      <p className="text-sm font-bold text-emerald-400">{name}</p>
    </div>
  </div>
);

const PathBreadcrumbs = ({ path, nodes }: { path: string[], nodes: GameNode[] }) => (
  <div className="absolute bottom-6 left-6 right-6 z-10 pointer-events-none">
    <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl max-w-2xl mx-auto">
      <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Drift Path</p>
      <div className="flex gap-2 overflow-x-auto no-scrollbar whitespace-nowrap pb-1">
        {path.map((id, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">
              {nodes.find(n => n.id === id)?.name}
            </span>
            {i < path.length - 1 && <span className="text-slate-600">→</span>}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default GameClient;
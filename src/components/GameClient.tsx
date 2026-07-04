import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';

interface Props {
  levelData: any;
}

const GameClient: React.FC<Props> = ({ levelData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  
  // Use refs for game state to avoid closure staleness in the ticker
  const stateRef = useRef({
    currentNodeId: levelData.metadata.start_node,
    pathTaken: [levelData.metadata.start_node],
    endNodeId: levelData.metadata.end_node,
  });

  const [isWon, setIsWon] = useState(false);
  const [uiPath, setUiPath] = useState<string[]>([levelData.metadata.start_node]);

  useEffect(() => {
    if (!containerRef.current) return;

    const app = new PIXI.Application();
    let simulation: d3.Simulation<any, undefined>;

    const init = async () => {
      // 1. Initialize App
      await app.init({
        resizeTo: containerRef.current!,
        backgroundColor: 0x020617,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
      });
      
      containerRef.current?.appendChild(app.canvas);

      // 2. Setup Viewport
      const viewport = new Viewport({
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
        worldWidth: 2000,
        worldHeight: 2000,
        events: app.renderer.events,
      });

      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate();
      viewport.moveCenter(1000, 1000);
      viewport.setZoom(0.8);

      // 3. Prepare D3 Data
      const nodes = levelData.nodes.map((n: any) => ({ ...n, x: 1000 + (Math.random() - 0.5) * 200, y: 1000 + (Math.random() - 0.5) * 200 }));
      const links = [];
      levelData.nodes.forEach((s: any) => {
        s.connections.forEach((targetId: string) => {
          if (s.id < targetId) links.push({ source: s.id, target: targetId });
        });
      });

      // 4. Create Layers
      const linkLayer = new PIXI.Graphics();
      const nodeLayer = new PIXI.Container();
      viewport.addChild(linkLayer);
      viewport.addChild(nodeLayer);

      const spriteMap: Record<string, any> = {};

      // 5. Create Node Placeholders Immediately
      nodes.forEach((node: any) => {
        const container = new PIXI.Container();
        container.x = node.x;
        container.y = node.y;

        // Background Circle
        const bg = new PIXI.Graphics();
        drawNodeCircle(bg, node.id, false);
        
        // Placeholder Icon (until image loads)
        const icon = new PIXI.Graphics().circle(0, 0, 20).fill(0x1e293b);
        
        container.addChild(bg);
        container.addChild(icon);

        // Interaction
        container.eventMode = 'static';
        container.cursor = 'pointer';
        container.on('pointerdown', () => handleNodeClick(node.id, nodes));

        nodeLayer.addChild(container);
        spriteMap[node.id] = { container, bg, icon };

        // Background Image Loading
        if (node.image) {
          PIXI.Assets.load(node.image).then(texture => {
            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.width = 60;
            sprite.height = 60;
            const mask = new PIXI.Graphics().circle(0, 0, 30).fill(0xffffff);
            sprite.mask = mask;
            container.addChild(mask);
            container.addChild(sprite);
            icon.visible = false; // Hide placeholder
          }).catch(() => {
            // If image fails, keep placeholder
          });
        }
      });

      // 6. D3 Physics Simulation
      simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id((d: any) => d.id).distance(140))
        .force("charge", d3.forceManyBody().strength(-600))
        .force("center", d3.forceCenter(1000, 1000))
        .force("collide", d3.forceCollide().radius(70));

      // 7. Render Loop
      app.ticker.add(() => {
        linkLayer.clear();
        
        // Update Links
        links.forEach((link: any) => {
          const isPath = stateRef.current.pathTaken.includes(link.source.id) && 
                         stateRef.current.pathTaken.includes(link.target.id);
          
          linkLayer.moveTo(link.source.x, link.source.y)
                   .lineTo(link.target.x, link.target.y)
                   .stroke({
                      width: isPath ? 5 : 2,
                      color: isPath ? 0x6366f1 : 0x1e293b,
                      alpha: isPath ? 1 : 0.5
                   });
        });

        // Update Nodes
        nodes.forEach((node: any) => {
          const { container, bg } = spriteMap[node.id];
          container.x = node.x;
          container.y = node.y;
          drawNodeCircle(bg, node.id, node.id === stateRef.current.currentNodeId);
        });
      });
    };

    const drawNodeCircle = (g: PIXI.Graphics, id: string, isCurrent: boolean) => {
      g.clear();
      const isEnd = id === stateRef.current.endNodeId;
      const strokeColor = isCurrent ? 0x818cf8 : (isEnd ? 0x10b981 : 0x334155);
      const strokeWidth = isCurrent || isEnd ? 4 : 2;
      
      g.circle(0, 0, 33)
       .fill(0x0f172a)
       .stroke({ width: strokeWidth, color: strokeColor });
    };

    const handleNodeClick = (clickedId: string, allNodes: any[]) => {
      const current = allNodes.find(n => n.id === stateRef.current.currentNodeId);
      
      if (current?.connections.includes(clickedId)) {
        stateRef.current.currentNodeId = clickedId;
        stateRef.current.pathTaken.push(clickedId);
        
        // Update React UI
        setUiPath([...stateRef.current.pathTaken]);
        
        if (clickedId === stateRef.current.endNodeId) {
          setIsWon(true);
        }
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
      
      {isWon && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[100] p-6">
          <div className="max-w-sm w-full bg-slate-900 border border-white/10 p-8 rounded-3xl text-center shadow-2xl">
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">Web Cleared!</h2>
            <p className="text-slate-400 mb-8">You successfully drifted through the path.</p>
            <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all active:scale-95">
              Next Challenge
            </button>
          </div>
        </div>
      )}

      {/* Floating UI */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <div className="bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg">
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Target</p>
          <p className="text-sm font-bold text-emerald-400">{levelData.metadata.end_name}</p>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 right-6 z-10 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 shadow-2xl max-w-2xl mx-auto">
          <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Drift Path</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar whitespace-nowrap pb-1">
            {uiPath.map((id, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {levelData.nodes.find((n: any) => n.id === id)?.name}
                </span>
                {i < uiPath.length - 1 && <span className="text-slate-600">→</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameClient;
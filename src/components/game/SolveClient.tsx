import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { supabase, getLocalPlayerId } from '../../lib/supabase';
import { NODE_COLORS, type GameNode, type NodeVisuals } from '../../types/game';

interface Props {
  roomId: string;
  roomData: any;
  nodeLibrary: GameNode[];
}

const SolveClient: React.FC<Props> = ({ roomId, roomData, nodeLibrary }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { playerId } = getLocalPlayerId();
  
  // Identify which graph I am solving
  const isOwner = roomData.owner_id === playerId;
  const opponentGraph = isOwner ? roomData.graph_b : roomData.graph_a;
  
  // Build the workspace nodes by matching IDs to our rich library
  const workspaceNodes = opponentGraph.nodeIds.map((id: string) => 
    nodeLibrary.find(n => n.id === id)
  ).filter(Boolean);

  const startId = opponentGraph.metadata.start_node;
  const targetId = opponentGraph.metadata.end_node;

  // --- STATE ---
  const [currentNodeId, setCurrentNodeId] = useState<string>(startId);
  const [pathTaken, setPathTaken] = useState<string[]>([startId]);
  const [isWon, setIsWon] = useState(false);
  const [startTime] = useState(Date.now());
  const [seconds, setSeconds] = useState(0);
  const [opponentFinished, setOpponentFinished] = useState(false);

  // --- REFS ---
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const spriteMap = useRef<Record<string, NodeVisuals>>({});
  const stateRef = useRef({ currentNodeId: startId, pathTaken: [startId] });

  useEffect(() => {
    stateRef.current = { currentNodeId, pathTaken };
  }, [currentNodeId, pathTaken]);

  // 1. TIMER & REALTIME SYNC
  useEffect(() => {
    const timer = setInterval(() => {
      if (!isWon) setSeconds((Date.now() - startTime) / 1000);
    }, 100);

    const channel = supabase.channel(`room_${roomId}_solve`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
          const results = payload.new.results || {};
          const oppKey = isOwner ? 'guest_time' : 'owner_time';
          if (results[oppKey]) setOpponentFinished(true);
          
          // If both finished, redirect to results in 3 seconds
          if (results.owner_time && results.guest_time) {
              setTimeout(() => window.location.href = `/play/friends/${roomId}/results`, 3000);
          }
      })
      .subscribe();

    return () => { clearInterval(timer); supabase.removeChannel(channel); };
  }, [isWon]);

  // 2. PIXI INITIALIZATION
  useEffect(() => {
    if (!containerRef.current) return;
    const app = new PIXI.Application();
    
    const init = async () => {
      await app.init({ resizeTo: containerRef.current!, backgroundColor: 0x020617 });
      containerRef.current?.appendChild(app.canvas);
      appRef.current = app;

      const viewport = new Viewport({
        screenWidth: app.screen.width, screenHeight: app.screen.height,
        worldWidth: 2000, worldHeight: 2000, events: app.renderer.events
      });
      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000);
      viewportRef.current = viewport;

      const linkLayer = new PIXI.Graphics();
      const nodeLayer = new PIXI.Container();
      viewport.addChild(linkLayer, nodeLayer);

      // Pre-calculate ALL valid edges in this web
      const edges: any[] = [];
      for(let i=0; i<workspaceNodes.length; i++) {
          for(let j=i+1; j<workspaceNodes.length; j++) {
              if (workspaceNodes[i].connections.includes(workspaceNodes[j].id)) {
                  edges.push({ source: workspaceNodes[i].id, target: workspaceNodes[j].id });
              }
          }
      }

      const simulation = d3.forceSimulation<GameNode>(workspaceNodes)
        .force("charge", d3.forceManyBody().strength(-1000))
        .force("link", d3.forceLink(edges).id((d:any) => d.id).distance(180))
        .force("collide", d3.forceCollide().radius(80))
        .force("center", d3.forceCenter(1000, 1000));

      app.ticker.add(() => {
        linkLayer.clear();
        edges.forEach(e => {
            const s = workspaceNodes.find(n => n.id === e.source);
            const t = workspaceNodes.find(n => n.id === e.target);
            const isPath = stateRef.current.pathTaken.includes(s.id) && stateRef.current.pathTaken.includes(t.id);
            linkLayer.moveTo(s.x, s.y).lineTo(t.x, t.y).stroke({
                width: isPath ? 6 : 1,
                color: isPath ? 0x6366f1 : 0x1e293b,
                alpha: isPath ? 1 : 0.3
            });
        });

        workspaceNodes.forEach(node => {
          const vis = spriteMap.current[node.id];
          if (vis) {
            vis.container.x = node.x; vis.container.y = node.y;
            const isCurrent = stateRef.current.currentNodeId === node.id;
            const isTarget = node.id === targetId;
            vis.bg.clear().circle(0, 0, 33).fill(0x0f172a).stroke({
                width: isCurrent || isTarget ? 5 : 2,
                color: isCurrent ? 0xffffff : (isTarget ? NODE_COLORS.Target : (NODE_COLORS[node.type as keyof typeof NODE_COLORS] || 0xffffff))
            });
          }
        });
      });

      // Render Node Sprites
      workspaceNodes.forEach(node => {
        const visuals = createNodeSprite(node);
        nodeLayer.addChild(visuals.container);
        spriteMap.current[node.id] = visuals;
      });
    };

    init();
    return () => app.destroy(true);
  }, []);

  const createNodeSprite = (node: GameNode): NodeVisuals => {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const icon = new PIXI.Graphics().circle(0, 0, 20).fill(0x1e293b);
    container.addChild(bg, icon);
    container.eventMode = 'static';
    container.cursor = 'pointer';

    container.on('pointerdown', () => {
        const current = workspaceNodes.find(n => n.id === stateRef.current.currentNodeId);
        if (current?.connections.includes(node.id)) {
            setCurrentNodeId(node.id);
            setPathTaken(prev => [...prev, node.id]);
            if (node.id === targetId) handleWin();
        }
    });

    if (node.image) {
      PIXI.Assets.load(node.image).then(tex => {
        const s = new PIXI.Sprite(tex); s.anchor.set(0.5); s.width = s.height = 60;
        const m = new PIXI.Graphics().circle(0, 0, 30).fill(0xffffff);
        s.mask = m; container.addChild(m, s); icon.visible = false;
      });
    }
    return { container, bg, icon };
  };

  const handleWin = async () => {
    setIsWon(true);
    const finalTime = (Date.now() - startTime) / 1000;
    
    // Update Supabase results
    const { data: room } = await supabase.from('rooms').select('results').eq('id', roomId).single();
    const newResults = { ...room.results };
    if (isOwner) newResults.owner_time = finalTime;
    else newResults.guest_time = finalTime;

    await supabase.from('rooms').update({ results: newResults }).eq('id', roomId);
  };

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* TOP UI */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
        <div className="bg-slate-900/90 p-4 rounded-2xl border border-white/10 backdrop-blur-md shadow-2xl">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Target</p>
            <p className="text-white font-bold text-lg">{workspaceNodes.find(n => n.id === targetId)?.name}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
            <div className="bg-black/50 px-6 py-3 rounded-2xl border border-white/10 backdrop-blur-md font-mono text-3xl text-white">
                {seconds.toFixed(1)}s
            </div>
            {opponentFinished && (
                <div className="bg-emerald-500 text-slate-950 px-3 py-1 rounded-full text-[10px] font-black uppercase animate-pulse">
                    Opponent Finished!
                </div>
            )}
        </div>
      </div>

      {/* WIN OVERLAY */}
      {isWon && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[100]">
            <div className="text-center">
                <h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 italic">Web Cleared</h2>
                <p className="text-indigo-400 font-mono text-2xl mb-8">Final Time: {seconds.toFixed(2)}s</p>
                <p className="text-slate-500 animate-pulse uppercase tracking-widest text-xs font-bold">Waiting for match results...</p>
            </div>
        </div>
      )}
    </div>
  );
};

export default SolveClient;
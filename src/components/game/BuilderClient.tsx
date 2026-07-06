import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { supabase, getLocalPlayerId } from '../../lib/supabase';
import { NODE_COLORS, type GameNode, type NodeVisuals } from '../../types/game';
import { isGraphSolvable } from '../../utils/graphValidator';

interface Props {
  roomId: string;
  builderData: any;
}

const BuilderClient: React.FC<Props> = ({ roomId, builderData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { playerId } = getLocalPlayerId();
  
  // States
  const [warehouse, setWarehouse] = useState<GameNode[]>(builderData.nodes);
  const [workspace, setWorkspace] = useState<GameNode[]>([]);
  const [links, setLinks] = useState<{sourceId: string, targetId: string}[]>([]);
  const [tool, setTool] = useState<'move' | 'link'>('move');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(builderData.config.buildTime);
  const [isReady, setIsReady] = useState(false);
  const [isSolvable, setIsSolvable] = useState(false);

  // Refs for Pixi Sync
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const simulationRef = useRef<d3.Simulation<GameNode, undefined> | null>(null);
  const spriteMap = useRef<Record<string, NodeVisuals>>({});
  const nodeLayer = useRef<PIXI.Container | null>(null);
  const linkLayer = useRef<PIXI.Graphics | null>(null);

  const stateRef = useRef({
    workspace: [] as GameNode[],
    links: [] as {sourceId: string, targetId: string}[],
    tool: 'move' as 'move' | 'link',
    selectedId: null as string | null
  });

  // 1. Initialize Canvas
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

      linkLayer.current = new PIXI.Graphics();
      nodeLayer.current = new PIXI.Container();
      viewport.addChild(linkLayer.current, nodeLayer.current);

      simulationRef.current = d3.forceSimulation<GameNode>([])
        .force("charge", d3.forceManyBody().strength(-800))
        .force("collide", d3.forceCollide().radius(80))
        .force("x", d3.forceX(1000).strength(0.05))
        .force("y", d3.forceY(1000).strength(0.05));

      app.ticker.add(() => {
        if (!linkLayer.current) return;
        linkLayer.current.clear();
        stateRef.current.links.forEach(l => {
          const s = stateRef.current.workspace.find(n => n.id === l.sourceId);
          const t = stateRef.current.workspace.find(n => n.id === l.targetId);
          if (s && t) linkLayer.current!.moveTo(s.x!, s.y!).lineTo(t.x!, t.y!).stroke({ width: 4, color: 0x334155 });
        });

        stateRef.current.workspace.forEach(node => {
          const vis = spriteMap.current[node.id];
          if (vis) {
            vis.container.x = node.x!; vis.container.y = node.y!;
            const isActive = stateRef.current.selectedId === node.id;
            vis.bg.clear().circle(0, 0, 33).fill(0x0f172a)
                  .stroke({ width: isActive ? 4 : 2, color: isActive ? 0xffffff : (NODE_COLORS[node.type as keyof typeof NODE_COLORS] || 0xffffff) });
          }
        });
      });

      // Start by deploying Start and End nodes
      const start = builderData.nodes.find((n:any) => n.id === builderData.metadata.start_node);
      const end = builderData.nodes.find((n:any) => n.id === builderData.metadata.end_node);
      if (start && end) {
          deployNode(start);
          deployNode(end);
      }
    };
    init();
    return () => app.destroy(true);
  }, []);

  // 2. Sync Logic
  useEffect(() => {
    stateRef.current.workspace = workspace;
    stateRef.current.links = links;
    stateRef.current.tool = tool;
    stateRef.current.selectedId = selectedId;
    setIsSolvable(isGraphSolvable(builderData.metadata.start_node, builderData.metadata.end_node, links));
    
    if (simulationRef.current) {
        simulationRef.current.nodes(workspace).alpha(1).restart();
    }

    workspace.forEach(node => {
      if (!spriteMap.current[node.id]) {
        const vis = createNodeSprite(node);
        nodeLayer.current?.addChild(vis.container);
        spriteMap.current[node.id] = vis;
      }
    });
  }, [workspace, links, tool, selectedId]);

  // 3. Timer Logic
  useEffect(() => {
    const timer = setInterval(() => {
        setTimeLeft((prev: number) => {
            if (prev <= 1) {
                clearInterval(timer);
                handleSubmit();
                return 0;
            }
            return prev - 1;
        });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const createNodeSprite = (node: GameNode): NodeVisuals => {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const icon = new PIXI.Graphics().circle(0, 0, 20).fill(0x1e293b);
    container.addChild(bg, icon);
    container.eventMode = 'static';
    container.cursor = 'pointer';

    container.on('pointerdown', (e) => {
        if (stateRef.current.tool === 'link') {
            handleLink(node.id);
        } else {
            const onMove = (event: any) => {
                const pos = viewportRef.current!.toWorld(event.global);
                node.fx = pos.x; node.fy = pos.y;
                simulationRef.current?.alpha(0.3).restart();
            };
            const onUp = () => {
                node.fx = null; node.fy = null;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
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

  const handleLink = (targetId: string) => {
      if (!selectedId) {
          setSelectedId(targetId);
      } else {
          if (selectedId === targetId) { setSelectedId(null); return; }
          const nodeA = builderData.nodes.find((n:any) => n.id === selectedId);
          if (nodeA?.connections.includes(targetId)) {
              setLinks(prev => [...prev, { sourceId: selectedId, targetId }]);
          } else {
              alert("These nodes are not related in the database!");
          }
          setSelectedId(null);
      }
  };

  const deployNode = (node: GameNode) => {
      if (workspace.length >= builderData.config.maxNodes) return;
      setWorkspace(prev => [...prev, { ...node, x: 1000, y: 1000 }]);
      setWarehouse(prev => prev.filter(n => n.id !== node.id));
  };

  const handleSubmit = async () => {
    setIsReady(true);
    // Identify if I am Player A or B based on owner_id
    const { data: room } = await supabase.from('rooms').select('owner_id').eq('id', roomId).single();
    if (!room) {
        alert("Room not found!");
        window.location.href = '/play/friends';
        return;
    }
    const isOwner = room.owner_id === playerId;
    const column = isOwner ? 'graph_a' : 'graph_b';

    await supabase.from('rooms').update({ 
        [column]: { nodes: workspace, links: links, metadata: builderData.metadata } 
    }).eq('id', roomId);

    // Watch for opponent to finish
    checkOpponentReady();
  };

  const checkOpponentReady = async () => {
      const channel = supabase.channel(`room_${roomId}_sync`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
            if (payload.new.graph_a && payload.new.graph_b) {
                window.location.href = `/play/friends/${roomId}/solve`;
            }
        })
        .subscribe();
  };

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <div className="w-80 border-r border-white/10 bg-slate-900 flex flex-col z-20">
        <div className="p-6 border-b border-white/10">
          <h2 className="text-white font-black italic">WAREHOUSE</h2>
          <div className="flex justify-between items-center mt-2">
            <span className="text-[10px] text-slate-500 uppercase">Limit: {workspace.length}/{builderData.config.maxNodes}</span>
            <span className={`text-[10px] font-bold uppercase ${isSolvable ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isSolvable ? '● Solvable' : '○ Unconnected'}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {warehouse.map(node => (
            <button key={node.id} onClick={() => deployNode(node)} className="w-full flex items-center gap-3 bg-slate-800 p-2 rounded-xl hover:bg-indigo-600 transition-all text-left">
              <div className="w-10 h-10 bg-black rounded-lg overflow-hidden">
                {node.image && <img src={node.image} className="w-full h-full object-cover" />}
              </div>
              <div className="min-w-0">
                <p className="text-white text-[10px] font-bold truncate">{node.name}</p>
                <p className="text-[8px] text-slate-400 uppercase">{node.type}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Builder */}
      <div className="flex-1 relative">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl">
            <button onClick={() => setTool('move')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${tool === 'move' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Move</button>
            <button onClick={() => setTool('link')} className={`px-4 py-2 rounded-xl text-xs font-bold transition ${tool === 'link' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>Link</button>
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            <button 
                onClick={handleSubmit} 
                disabled={!isSolvable || isReady}
                className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition ${isSolvable ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
            >
                {isReady ? 'Waiting...' : 'Submit Web'}
            </button>
        </div>

        <div className="absolute top-6 right-6 z-30 bg-black/50 px-4 py-2 rounded-xl border border-white/10 font-mono text-xl text-white">
            {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
        </div>

        <div ref={containerRef} className="w-full h-full" />
      </div>

      {isReady && (
          <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex items-center justify-center">
              <div className="text-center">
                  <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <h2 className="text-2xl font-bold text-white">Web Submitted!</h2>
                  <p className="text-slate-400">Waiting for your opponent to finish their build...</p>
              </div>
          </div>
      )}
    </div>
  );
};

export default BuilderClient;
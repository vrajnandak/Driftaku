import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { supabase, getLocalPlayerId } from '../../lib/supabase';
import { NODE_COLORS, type GameNode, type NodeVisuals } from '../../types/game';

interface Props {
  roomId: string;
  builderData: {
    config: any;
    nodes: GameNode[];
  };
}

type ToolType = 'move' | 'set_start' | 'set_target' | 'toggle_edge';

interface GraphEdge {
  id: string;
  source: GameNode;
  target: GameNode;
}

const BuilderClient: React.FC<Props> = ({ roomId, builderData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  
  // --- STATE ---
  const [workspace, setWorkspace] = useState<GameNode[]>([]);
  const [tool, setTool] = useState<ToolType>('move');
  const [startNodeId, setStartNodeId] = useState<string | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null);
  
  // Edge States
  const [availableEdges, setAvailableEdges] = useState<GraphEdge[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [edgeSourceId, setEdgeSourceId] = useState<string | null>(null);
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [infoModalNode, setInfoModalNode] = useState<GameNode | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  
  // --- SUBMISSION STATES ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);
  const [isPreparingSolve, setIsPreparingSolve] = useState(false);

  // --- REFS ---
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const simulationRef = useRef<d3.Simulation<GameNode, undefined> | null>(null);
  const nodeLayerRef = useRef<PIXI.Container | null>(null);
  const linkLayerRef = useRef<PIXI.Graphics | null>(null);
  const spriteMap = useRef<Record<string, NodeVisuals>>({});
  const targetZoomRef = useRef<number | null>(null);

  const stateRef = useRef({
    tool: 'move' as ToolType,
    startNodeId: null as string | null,
    targetNodeId: null as string | null,
    edgeSourceId: null as string | null,
    workspace: [] as GameNode[],
    availableEdges: [] as GraphEdge[],
    selectedEdges: [] as string[]
  });

  useEffect(() => {
    stateRef.current = { tool, startNodeId, targetNodeId, edgeSourceId, workspace, availableEdges, selectedEdges };
  }, [tool, startNodeId, targetNodeId, edgeSourceId, workspace, availableEdges, selectedEdges]);

  // --- VALIDATION LOGIC ---
  const isSolvable = useMemo(() => {
    if (!startNodeId || !targetNodeId) return false;
    
    const adj = new Map<string, string[]>();
    selectedEdges.forEach(edgeId => {
        const [u, v] = edgeId.split('::');
        if (!adj.has(u)) adj.set(u, []);
        if (!adj.has(v)) adj.set(v, []);
        adj.get(u)!.push(v);
        adj.get(v)!.push(u);
    });

    const queue = [startNodeId];
    const visited = new Set([startNodeId]);

    while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr === targetNodeId) return true;
        
        (adj.get(curr) || []).forEach(neighbor => {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        });
    }
    return false;
  }, [startNodeId, targetNodeId, selectedEdges]);

  // --- SUBMISSION & SYNC LOGIC ---
  
  // Helper ref to avoid stale closures in the Realtime listener
  const prepareSolvePhaseRef = useRef<any>(null);
  prepareSolvePhaseRef.current = (roomData: any) => {
      // 1. Show the "Intercepting Web" Loader
      setIsWaitingForOpponent(false);
      setIsPreparingSolve(true);

      // Artificial delay to make the transition feel deliberate and allow UI to render
      setTimeout(() => {
          const { playerId } = getLocalPlayerId();
          const isOwner = roomData.owner_id === playerId;
          
          // 2. Extract the Opponent's lightweight graph
          const opponentGraph = isOwner ? roomData.graph_b : roomData.graph_a;

          if (opponentGraph) {
              // 3. Rehydrate the opponent's graph with FULL node details (including Base64 images)
              const fullOpponentNodes = builderData.nodes.filter(n => opponentGraph.nodeIds.includes(n.id));
              
              const readySolveData = {
                  metadata: opponentGraph.metadata,
                  nodes: fullOpponentNodes,
                  intendedPath: opponentGraph.intendedPath
              };

              // 4. Save to LocalStorage as our "JSON File Hand-off"
              localStorage.setItem(`driftaku_solve_${roomId}`, JSON.stringify(readySolveData));
              
              // 5. Room owner updates the global status so late-joiners know it's solving phase
              if (isOwner && roomData.status !== 'solving') {
                  supabase.from('rooms').update({ status: 'solving' }).eq('id', roomId);
              }

              // 6. Redirect instantly to the Solve page
              window.location.href = `/play/friends/${roomId}/solve`;
          }
      }, 2000); 
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const { playerId } = getLocalPlayerId();
    
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!room) {
        alert("Room error!");
        setIsSubmitting(false);
        return;
    }
    
    const isOwner = room.owner_id === playerId;
    const column = isOwner ? 'graph_a' : 'graph_b';

    const graphPayload = {
        metadata: { start_node: startNodeId, end_node: targetNodeId },
        nodeIds: workspace.map(n => n.id), 
        intendedPath: selectedEdges        
    };

    const { error } = await supabase.from('rooms').update({ [column]: graphPayload }).eq('id', roomId);
    
    if (error) {
        alert("Failed to submit graph.");
        setIsSubmitting(false);
        return;
    }

    // Check if the OTHER player is already done
    const { data: checkRoom } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    
    if (checkRoom?.graph_a && checkRoom?.graph_b) {
        prepareSolvePhaseRef.current(checkRoom);
    } else {
        setIsSubmitting(false);
        setIsWaitingForOpponent(true);
    }
  };

  useEffect(() => {
    // Listen for the opponent finishing
    const channel = supabase.channel(`room_${roomId}_build`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
          if (payload.new.graph_a && payload.new.graph_b) {
              prepareSolvePhaseRef.current(payload.new);
          }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);


  // --- FULLSCREEN & ZOOM ---
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mainContainerRef.current?.requestFullscreen().catch(err => console.error(err));
    } else document.exitFullscreen();
  };

  const handleZoomIn = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const target = Math.min((targetZoomRef.current || vp.scale.x) * 1.5, 3);
      targetZoomRef.current = target;
      vp.animate({ scale: target, time: 300, ease: 'easeOutQuart', removeOnInterrupt: true });
  };

  const handleZoomOut = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      const target = Math.max((targetZoomRef.current || vp.scale.x) * 0.6, 0.2);
      targetZoomRef.current = target;
      vp.animate({ scale: target, time: 300, ease: 'easeOutQuart', removeOnInterrupt: true });
  };

  // --- INITIALIZE CANVAS ---
  useEffect(() => {
    if (!containerRef.current || appRef.current) return;
    const app = new PIXI.Application();
    
    const init = async () => {
      await app.init({ resizeTo: containerRef.current!, backgroundColor: 0x020617, antialias: true });
      containerRef.current?.appendChild(app.canvas);
      appRef.current = app;

      const viewport = new Viewport({
        screenWidth: app.screen.width, screenHeight: app.screen.height,
        worldWidth: 2000, worldHeight: 2000, events: app.renderer.events
      });
      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000);
      viewport.on('zoomed', () => { targetZoomRef.current = null; });
      viewportRef.current = viewport;

      linkLayerRef.current = new PIXI.Graphics();
      nodeLayerRef.current = new PIXI.Container();
      viewport.addChild(linkLayerRef.current, nodeLayerRef.current);

      simulationRef.current = d3.forceSimulation<GameNode>([])
        .force("charge", d3.forceManyBody().strength(-800))
        .force("collide", d3.forceCollide().radius(80))
        .force("center", d3.forceCenter(1000, 1000))
        .force("x", d3.forceX(1000).strength(0.02))
        .force("y", d3.forceY(1000).strength(0.02));

      app.ticker.add(() => {
        // Draw Edges
        if (linkLayerRef.current) {
            linkLayerRef.current.clear();
            stateRef.current.availableEdges.forEach(edge => {
                if (edge.source.x == null || edge.source.y == null || edge.target.x == null || edge.target.y == null) return;
                
                const isSelected = stateRef.current.selectedEdges.includes(edge.id);
                linkLayerRef.current!.moveTo(edge.source.x, edge.source.y)
                                      .lineTo(edge.target.x, edge.target.y)
                                      .stroke({ 
                                          width: isSelected ? 5 : 2, 
                                          color: isSelected ? 0x6366f1 : 0x334155,
                                          alpha: isSelected ? 1 : 0.4 
                                      });
            });
        }

        // Draw Nodes
        stateRef.current.workspace.forEach(node => {
          const vis = spriteMap.current[node.id];
          if (vis && node.x != null && node.y != null) {
            vis.container.x = node.x; vis.container.y = node.y;

            const isStart = stateRef.current.startNodeId === node.id;
            const isTarget = stateRef.current.targetNodeId === node.id;
            const isEdgeSource = stateRef.current.edgeSourceId === node.id;
            
            let strokeColor = NODE_COLORS[node.type as keyof typeof NODE_COLORS] || 0x334155;
            let strokeWidth = 2;

            if (isEdgeSource) {
                strokeColor = 0xf59e0b; // Amber
                strokeWidth = 6;
            } else if (isStart) {
                strokeColor = NODE_COLORS.Start;
                strokeWidth = 5;
            } else if (isTarget) {
                strokeColor = NODE_COLORS.Target;
                strokeWidth = 5;
            }

            vis.bg.clear().circle(0, 0, 33).fill(0x0f172a).stroke({ width: strokeWidth, color: strokeColor });
          }
        });
      });
    };

    init();
    return () => app.destroy(true);
  }, []);

  // --- SYNC WORKSPACE & EDGES ---
  useEffect(() => {
    if (!simulationRef.current || !nodeLayerRef.current) return;

    const currentEdges: GraphEdge[] = [];
    for (let i = 0; i < workspace.length; i++) {
        for (let j = i + 1; j < workspace.length; j++) {
            if (workspace[i].connections.includes(workspace[j].id)) {
                const edgeId = [workspace[i].id, workspace[j].id].sort().join('::');
                currentEdges.push({ id: edgeId, source: workspace[i], target: workspace[j] });
            }
        }
    }
    setAvailableEdges(currentEdges);
    setSelectedEdges(prev => prev.filter(edgeId => currentEdges.some(e => e.id === edgeId)));

    const d3Links = currentEdges.map(e => ({ source: e.source.id, target: e.target.id }));
    simulationRef.current.nodes(workspace);
    simulationRef.current.force("link", d3.forceLink(d3Links).id((d: any) => d.id).distance(150));
    simulationRef.current.alpha(1).restart();

    workspace.forEach(node => {
      if (!spriteMap.current[node.id]) {
        const vis = createNodeSprite(node);
        vis.container.x = node.x || 1000; vis.container.y = node.y || 1000;
        nodeLayerRef.current!.addChild(vis.container);
        spriteMap.current[node.id] = vis;
      }
    });

    Object.keys(spriteMap.current).forEach(id => {
      if (!workspace.find(n => n.id === id)) {
        nodeLayerRef.current!.removeChild(spriteMap.current[id].container);
        delete spriteMap.current[id];
      }
    });
  }, [workspace]);

  // --- NODE SPRITE LOGIC ---
  const createNodeSprite = (node: GameNode): NodeVisuals => {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const icon = new PIXI.Graphics().circle(0, 0, 20).fill(0x1e293b);
    
    container.addChild(bg, icon);
    container.eventMode = 'static';
    container.cursor = 'pointer';

    container.on('pointerdown', (e) => {
      const currentTool = stateRef.current.tool;
      
      if (currentTool === 'set_start') {
          setStartNodeId(node.id);
          if (stateRef.current.targetNodeId === node.id) setTargetNodeId(null);
          setEdgeSourceId(null);
      } 
      else if (currentTool === 'set_target') {
          setTargetNodeId(node.id);
          if (stateRef.current.startNodeId === node.id) setStartNodeId(null);
          setEdgeSourceId(null);
      } 
      else if (currentTool === 'toggle_edge') {
          if (!stateRef.current.edgeSourceId) {
              setEdgeSourceId(node.id);
          } else {
              if (stateRef.current.edgeSourceId === node.id) {
                  setEdgeSourceId(null); return;
              }
              const edgeId = [stateRef.current.edgeSourceId, node.id].sort().join('::');
              const isValid = stateRef.current.availableEdges.some(e => e.id === edgeId);
              if (isValid) {
                  setSelectedEdges(prev => prev.includes(edgeId) ? prev.filter(id => id !== edgeId) : [...prev, edgeId]);
              }
              setEdgeSourceId(null);
          }
      }
      else if (currentTool === 'move') {
          const startX = e.global.x; const startY = e.global.y;
          let hasDragged = false;

          const onMove = (event: PIXI.FederatedPointerEvent) => {
              if (!viewportRef.current) return;
              if (Math.hypot(event.global.x - startX, event.global.y - startY) > 5) hasDragged = true;
              const pos = viewportRef.current.toWorld(event.global);
              node.fx = pos.x; node.fy = pos.y;
              simulationRef.current?.alpha(0.3).restart();
          };

          const onUp = () => {
              node.fx = null; node.fy = null;
              window.removeEventListener('pointerup', onUp);
              appRef.current?.canvas.removeEventListener('pointermove', onMove as any);
              if (!hasDragged) setInfoModalNode(node);
          };

          appRef.current?.canvas.addEventListener('pointermove', onMove as any);
          window.addEventListener('pointerup', onUp);
      }
    });

    if (node.image) {
      PIXI.Assets.load(node.image).then(tex => {
        const s = new PIXI.Sprite(tex);
        s.anchor.set(0.5); s.width = s.height = 60;
        const m = new PIXI.Graphics().circle(0, 0, 30).fill(0xffffff);
        s.mask = m; container.addChild(m, s); icon.visible = false;
      }).catch(e => console.error(e));
    }
    return { container, bg, icon };
  };

  // --- UI HANDLERS ---
  const deployNode = (node: GameNode) => {
      if (workspace.length >= builderData.config.maxNodes) return;
      const spawnX = 1000 + (Math.random() * 200 - 100);
      const spawnY = 1000 + (Math.random() * 200 - 100);
      setWorkspace(prev => [...prev, { ...node, x: spawnX, y: spawnY, vx: 0, vy: 0 }]);
  };

  const retractNode = (nodeId: string) => {
      setWorkspace(prev => prev.filter(n => n.id !== nodeId));
      if (startNodeId === nodeId) setStartNodeId(null);
      if (targetNodeId === nodeId) setTargetNodeId(null);
      if (edgeSourceId === nodeId) setEdgeSourceId(null);
  };

  const isDeployed = (nodeId: string) => workspace.some(n => n.id === nodeId);
  const filteredNodes = builderData.nodes.filter(n => 
    n.name.toLowerCase().includes(searchQuery.toLowerCase()) || n.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={mainContainerRef} className="flex h-full w-full font-sans bg-slate-950">
      
      {/* SIDEBAR */}
      <div className="w-80 h-full border-r border-white/10 flex flex-col bg-slate-900 shadow-2xl z-20 shrink-0">
        <div className="p-5 border-b border-white/10 bg-slate-900/50">
          <h2 className="text-white font-black uppercase tracking-tighter text-lg italic mb-4">Warehouse</h2>
          
          <div className="relative mb-4">
            <input 
              type="text" placeholder="Search anime, actors..." 
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <svg className="w-4 h-4 text-slate-500 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex justify-between items-end">
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Available Nodes</span>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{workspace.length} / {builderData.config.maxNodes}</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-900/30">
          {filteredNodes.length === 0 && <p className="text-slate-500 text-xs text-center mt-10">No nodes found.</p>}
          {filteredNodes.map(node => {
            const deployed = isDeployed(node.id);
            return (
              <div 
                key={node.id} 
                onClick={() => !deployed && deployNode(node)}
                className={`w-full flex items-center justify-between p-2 rounded-xl transition-all border 
                  ${deployed ? 'bg-slate-900 border-white/10' : 'bg-slate-800/50 border-white/5 hover:bg-indigo-600 hover:border-indigo-400 cursor-pointer active:scale-95'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 ${deployed ? 'grayscale opacity-50' : 'bg-black'}`}>
                    {node.image && <img src={node.image} className="w-full h-full object-cover" />}
                  </div>
                  <div className={`flex-1 min-w-0 ${deployed ? 'opacity-50' : ''}`}>
                    <p className="text-white text-[11px] font-bold truncate leading-tight">{node.name}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest" style={{color: `#${NODE_COLORS[node.type as keyof typeof NODE_COLORS]?.toString(16)}`}}>{node.type}</p>
                  </div>
                </div>
                {deployed && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); retractNode(node.id); }}
                    className="ml-2 px-2.5 py-1.5 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors"
                  >
                    Retract
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* CANVAS AREA */}
      <div className="flex-1 relative bg-slate-950 h-full overflow-hidden">
        
        {/* TOOLBAR */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl">
            <button 
                onClick={() => { setTool('move'); setEdgeSourceId(null); }}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'move' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                Move
            </button>
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            <button 
                onClick={() => { setTool('toggle_edge'); setEdgeSourceId(null); }}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'toggle_edge' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                Toggle Edge {edgeSourceId && "(Select 2nd)"}
            </button>
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            <button 
                onClick={() => { setTool('set_start'); setEdgeSourceId(null); }}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'set_start' ? 'bg-white text-slate-900 shadow-lg shadow-white/20' : 'text-slate-400 hover:text-white'}`}
            >
                Start
            </button>
            <button 
                onClick={() => { setTool('set_target'); setEdgeSourceId(null); }}
                className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'set_target' ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                Target
            </button>
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            <button 
                onClick={() => setShowLegend(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
            >
                Info
            </button>
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            
            <button 
                onClick={handleSubmit}
                disabled={!isSolvable || isSubmitting}
                className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all 
                  ${isSolvable ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
            >
                {isSubmitting ? 'Sending...' : 'Submit'}
            </button>
        </div>

        {/* INSTRUCTIONS & ZOOM CONTROLS */}
        <div className="absolute top-6 right-6 z-30 flex gap-4 items-center">
            <div className="hidden xl:block text-[10px] text-slate-400 uppercase tracking-widest font-bold text-right">
                {tool === 'move' && "Drag nodes or click for info"}
                {tool === 'toggle_edge' && (edgeSourceId ? "Click destination node" : "Click source node")}
                {tool === 'set_start' && "Mark starting point"}
                {tool === 'set_target' && "Mark destination"}
            </div>
            <div className="flex gap-2">
                <button onClick={handleZoomOut} title="Zoom Out" className="w-10 h-10 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all backdrop-blur-md shadow-lg">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" transform="rotate(45 12 12) scale(0.8) translate(3 -3)" /><line x1="9" y1="12" x2="15" y2="12" strokeWidth="2" /></svg>
                </button>
                <button onClick={handleZoomIn} title="Zoom In" className="w-10 h-10 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all backdrop-blur-md shadow-lg">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                </button>
                <button onClick={toggleFullscreen} title="Fullscreen" className={`w-10 h-10 ${isFullscreen ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/90 text-slate-400 border-white/10 hover:text-white hover:bg-slate-800'} border rounded-xl flex items-center justify-center transition-all backdrop-blur-md shadow-lg`}>
                    {isFullscreen ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m11 5l-5-5m0 0v4m0-4h4M9 15l-5 5m0 0v-4m0 4h4m11-5l-5 5m0 0v-4m0 4h4" /></svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    )}
                </button>
            </div>
        </div>

        {/* SUBMISSION INDICATOR (Not Solvable) */}
        {!isSolvable && !isWaitingForOpponent && !isPreparingSolve && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
             <div className="bg-slate-900/90 text-slate-400 border border-white/10 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-lg">
                Status: <span className="text-rose-400 ml-1">Path Disconnected</span>
             </div>
          </div>
        )}

        {/* WAITING / PREPARING OVERLAY */}
        { (isWaitingForOpponent || isPreparingSolve) && (
            <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
                <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">
                    {isPreparingSolve ? 'Intercepting Web...' : 'Web Submitted!'}
                </h2>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">
                    {isPreparingSolve ? "Downloading opponent's graph data" : "Waiting for opponent to finish..."}
                </p>
            </div>
        )}

        {/* PIXI CANVAS */}
        <div ref={containerRef} className="w-full h-full" />

        {/* RETRACTION LIST */}
        {workspace.length > 0 && (
          <div className="absolute bottom-6 left-6 right-6 z-30 flex gap-2 overflow-x-auto no-scrollbar pb-2">
              {workspace.map(node => (
                  <div key={node.id} className="bg-slate-900/90 border border-white/10 pl-3 pr-2 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg shrink-0">
                      <div className="flex flex-col">
                        <span className="text-[11px] text-white font-bold whitespace-nowrap leading-tight">{node.name}</span>
                        <span className="text-[8px] font-bold uppercase tracking-widest" style={{color: startNodeId === node.id ? '#ffffff' : (targetNodeId === node.id ? '#06b6d4' : '#64748b')}}>
                            {startNodeId === node.id ? 'Start Node' : (targetNodeId === node.id ? 'Target Node' : 'Node')}
                        </span>
                      </div>
                      <button 
                          onClick={() => retractNode(node.id)}
                          title="Remove from Web"
                          className="w-6 h-6 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-sm font-bold"
                      >
                          ×
                      </button>
                  </div>
              ))}
          </div>
        )}

        {/* INFO MODAL */}
        {infoModalNode && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative">
                  <button onClick={() => setInfoModalNode(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                  <div className="w-28 h-28 mx-auto rounded-2xl overflow-hidden bg-black mb-5 border-2 shadow-lg" style={{borderColor: `#${NODE_COLORS[infoModalNode.type as keyof typeof NODE_COLORS]?.toString(16)}`}}>
                      {infoModalNode.image && <img src={infoModalNode.image} className="w-full h-full object-cover" />}
                  </div>
                  <h3 className="text-2xl font-bold text-white text-center mb-1 leading-tight">{infoModalNode.name}</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-center mb-6" style={{color: `#${NODE_COLORS[infoModalNode.type as keyof typeof NODE_COLORS]?.toString(16)}`}}>
                      {infoModalNode.type}
                  </p>
                  
                  <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-white/5">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Workspace Links</span>
                        <span className="text-xs text-indigo-400 font-bold">{availableEdges.filter(e => e.id.includes(infoModalNode.id)).length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total Database Links</span>
                        <span className="text-xs text-emerald-400 font-bold">{infoModalNode.connections?.length || 0}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 mt-6">
                    <button 
                        onClick={() => { retractNode(infoModalNode.id); setInfoModalNode(null); }}
                        className="flex-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 font-bold py-3 rounded-xl transition-colors text-sm"
                    >
                        Retract
                    </button>
                    <button 
                        onClick={() => setInfoModalNode(null)}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                    >
                        Close
                    </button>
                  </div>
              </div>
          </div>
        )}

        {/* LEGEND MODAL */}
        {showLegend && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <button onClick={() => setShowLegend(false)} className="absolute top-6 right-6 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-colors">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                  
                  <h2 className="text-3xl font-black text-white mb-6 uppercase tracking-tighter">Builder Guide</h2>
                  
                  <div className="space-y-6">
                      <section>
                          <h3 className="text-xs text-indigo-400 font-bold uppercase tracking-widest mb-3 border-b border-white/10 pb-2">Tools</h3>
                          <ul className="space-y-3 text-sm text-slate-300">
                              <li><strong className="text-white">Move:</strong> Drag nodes to organize your web. Click a node without dragging to see its details.</li>
                              <li><strong className="text-white">Toggle Edge:</strong> Connect nodes. Click a source node (turns amber), then click a valid destination to select that path (turns bright purple).</li>
                              <li><strong className="text-white">Start / Target:</strong> Assign the puzzle's beginning (White) and end (Cyan).</li>
                          </ul>
                      </section>
                      
                      <section>
                          <h3 className="text-xs text-indigo-400 font-bold uppercase tracking-widest mb-3 border-b border-white/10 pb-2">Node Colors</h3>
                          <div className="grid grid-cols-2 gap-3">
                              {Object.entries(NODE_COLORS).map(([type, color]) => (
                                  <div key={type} className="flex items-center gap-3 bg-slate-950 p-2 rounded-lg border border-white/5">
                                      <div className="w-3 h-3 rounded-full shadow-md" style={{ backgroundColor: `#${color.toString(16)}` }}></div>
                                      <span className="text-xs font-bold text-slate-300">{type}</span>
                                  </div>
                              ))}
                          </div>
                      </section>
                  </div>

                  <button 
                      onClick={() => setShowLegend(false)}
                      className="w-full mt-8 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
                  >
                      Understood
                  </button>
              </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default BuilderClient;
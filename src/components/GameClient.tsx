import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { NODE_COLORS, SPECIAL_NODE_COLORS, TYPE_MAP, type GameNode, type LevelData, type NodeVisuals, type UserLink } from '../types/game';
import { LegendModal } from './game/modals/LegendModal';
import { VictoryModal } from './game/modals/VictoryModal';
import { toast, ToastContainer } from './ui/Toast';

interface Props {
  levelData: LevelData;
  intendedPath?: string[];
  timeLimit?: number; // NEW: Optional time limit in seconds
  onTimeout?: () => void; // NEW: Triggers when time runs out
  onWin: (time: number) => void;
}

const GameClient: React.FC<Props> = ({ levelData, intendedPath, timeLimit, onTimeout, onWin }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  
  // Pixi/D3 Refs
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const simulationRef = useRef<d3.Simulation<GameNode, undefined> | null>(null);
  const spriteMap = useRef<Record<number, NodeVisuals>>({});
  const nodeLayerRef = useRef<PIXI.Container | null>(null);
  const linkLayerRef = useRef<PIXI.Graphics | null>(null);
  const targetZoomRef = useRef<number | null>(null);

  // Timer state
  const [timerDisplay, setTimerDisplay] = useState("00:00.0");
  const [timeDanger, setTimeDanger] = useState(false); // NEW: Visual cue for low time
  const timerRef = useRef<number | null>(null);

  // React State
  const [workspaceNodes, setWorkspaceNodes] = useState<GameNode[]>([]);
  const [warehouseNodes, setWarehouseNodes] = useState<GameNode[]>([]);
  const [userLinks, setUserLinks] = useState<UserLink[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [tool, setTool] = useState<'select' | 'link'>('select');
  const [isWon, setIsWon] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [activeInfo, setActiveInfo] = useState<{name: string, type: number, x: number, y: number} | null>(null);
  const [uiPath, setUiPath] = useState<number[]>([levelData.metadata.start_node]);
  
  const [isFullscreen, setIsFullscreen] = useState(false);

  const stateRef = useRef({
    workspaceNodes: [] as GameNode[],
    userLinks: [] as UserLink[],
    tool: 'select' as 'select' | 'link',
    selectedNodeId: null as number | null,
    startTime: Date.now()
  });

  // Responsive default: close sidebar on mobile initial load
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  // --- FULLSCREEN HANDLER ---
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mainContainerRef.current?.requestFullscreen().catch((err) => {toast(err instanceof Error ? err.message : "Something went wrong", "error");});
    } else document.exitFullscreen();
  };

  // --- SMOOTH ZOOM & CENTER LOGIC ---
  const handleZoom = (direction: 'in' | 'out') => {
      const vp = viewportRef.current;
      if (!vp) return;
      const currentTarget = targetZoomRef.current || vp.scale.x;
      const target = direction === 'in' 
        ? Math.min(currentTarget * 1.5, 3) 
        : Math.max(currentTarget * 0.6, 0.2);
      
      targetZoomRef.current = target;
      vp.animate({ scale: target, time: 300, ease: 'easeOutQuart', removeOnInterrupt: true });
  };

  const handleCenterView = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      
      targetZoomRef.current = 1; 
      vp.animate({
          position: { x: 1000, y: 1000},
          scale: 1,
          time: 400,
          ease: 'easeOutQuart',
          removeOnInterrupt: true
      });
  };

  const handleLocateNode = (nodeId: number) => {
    const vp = viewportRef.current;
    const node = stateRef.current.workspaceNodes.find(n => n.id === nodeId);
    if(!vp || !node || typeof node.x !== 'number' || typeof node.y !== 'number') return;
    const targetScale = 1.3;
    targetZoomRef.current = targetScale;
    vp.animate({ 
        position: { x: node.x, y: node.y }, 
        scale: targetScale, 
        time: 500, 
        ease: 'easeInOutCubic', 
        removeOnInterrupt: true 
    });
  }

  // --- 1. INITIALIZATION & ROBUST RESIZE LOGIC ---
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new PIXI.Application();
    let resizeObserver: ResizeObserver | null = null;
    
    const setup = async () => {
      PIXI.Assets.setPreferences({ preferWorkers: false, crossOrigin: 'anonymous' });
      await app.init({ 
        resizeTo: containerRef.current!, 
        backgroundColor: 0x020617, 
        antialias: true 
      });
      containerRef.current?.appendChild(app.canvas);
      appRef.current = app;

      const imageUrls = levelData.nodes.map(n => n.image).filter(Boolean) as string[];
      if (imageUrls.length > 0) {
        try { await PIXI.Assets.load(imageUrls); } 
        catch (e) { toast("Some game assets couldn't be loaded. Some images may not display correctly.", "warning"); }
      }

      const viewport = new Viewport({
        screenWidth: containerRef.current!.clientWidth,
        screenHeight: containerRef.current!.clientHeight,
        worldWidth: 2000,
        worldHeight: 2000,
        events: app.renderer.events
      });
      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000);
      viewport.on('zoomed', () => { targetZoomRef.current = null; });
      viewport.on('drag-start', () => { targetZoomRef.current = null; });
      viewport.on('pinch-start', () => { targetZoomRef.current = null; });
      viewportRef.current = viewport;

      resizeObserver = new ResizeObserver(() => {
          if (appRef.current && viewportRef.current && containerRef.current) {
              appRef.current.resize();
              viewportRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
          }
      });
      resizeObserver.observe(containerRef.current!);

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
        if (!linkLayerRef.current) return;
        
        linkLayerRef.current.clear();
        stateRef.current.userLinks.forEach(link => {
          const s = stateRef.current.workspaceNodes.find(n => n.id === link.sourceId);
          const t = stateRef.current.workspaceNodes.find(n => n.id === link.targetId);
          if (s && t && s.x != null && s.y != null && t.x != null && t.y != null) {
            linkLayerRef.current!.moveTo(s.x, s.y).lineTo(t.x, t.y)
              .stroke({ width: 4, color: 0x6366f1, alpha: 1 });
          }
        });

        stateRef.current.workspaceNodes.forEach(node => {
          const vis = spriteMap.current[node.id];
          if(vis && node.x != null && node.y != null) {
            vis.container.x = node.x;
            vis.container.y = node.y;
            
            const isCurrent = stateRef.current.selectedNodeId === node.id;
            const isTarget = node.id === levelData.metadata.end_node;
            const isStart = node.id === levelData.metadata.start_node;

            let strokeColor = NODE_COLORS[node.type] || 0x334155;
            let strokeWidth = 2;

            if (isCurrent) {
                strokeColor = 0xf59e0b;
                strokeWidth = 6;
            } else if (isStart) {
                strokeColor = SPECIAL_NODE_COLORS.Start;
                strokeWidth = 5;
            } else if (isTarget) {
                strokeColor = SPECIAL_NODE_COLORS.Target;
                strokeWidth = 5;
            }

            vis.bg.clear().circle(0, 0, 33).fill(0x0f172a).stroke({ width: strokeWidth, color: strokeColor });
          }
        });
      });

      const startNode = levelData.nodes.find(n => n.id === levelData.metadata.start_node)!;
      const endNode = levelData.nodes.find(n => n.id === levelData.metadata.end_node)!;
      const others = levelData.nodes.filter(n => n.id !== startNode.id && n.id !== endNode.id);
      
      setWorkspaceNodes([startNode, endNode]);
      setWarehouseNodes(others);
    };

    setup();

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      app.destroy(true);
    };
  }, [levelData]);

  // --- 2. SYNC EFFECT ---
  useEffect(() => {
    if (!simulationRef.current || !nodeLayerRef.current) return;

    stateRef.current.workspaceNodes = workspaceNodes;
    
    const d3Links = userLinks.map(l => ({ source: l.sourceId, target: l.targetId }));
    simulationRef.current.nodes(workspaceNodes);
    simulationRef.current.force("link", d3.forceLink(d3Links).id((d: any) => d.id).distance(150));
    simulationRef.current.alpha(1).restart();

    workspaceNodes.forEach(node => {
      if (!spriteMap.current[node.id]) {
        const vis = createNodeSprite(node);
        vis.container.x = node.x || 1000 + (Math.random() * 200 - 100);
        vis.container.y = node.y || 1000 + (Math.random() * 200 - 100);
        
        nodeLayerRef.current!.addChild(vis.container);
        spriteMap.current[node.id] = vis;
      }
    });

    Object.keys(spriteMap.current).forEach(idStr => {
      const id = Number(idStr);
      if (!workspaceNodes.find(n => n.id === id)) {
        nodeLayerRef.current!.removeChild(spriteMap.current[id].container);
        delete spriteMap.current[id];
      }
    });
  }, [workspaceNodes, userLinks]);

  useEffect(() => {
    stateRef.current.userLinks = userLinks;
    stateRef.current.tool = tool;
    stateRef.current.selectedNodeId = selectedNodeId;
  }, [userLinks, tool, selectedNodeId]);

  // --- 3. DYNAMIC TIMER (COUNTUP OR COUNTDOWN) ---
  useEffect(() => {
    if (isWon) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    stateRef.current.startTime = Date.now();
    
    timerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - stateRef.current.startTime) / 1000;
      
      if (timeLimit && timeLimit > 0) {
          // COUNTDOWN MODE
          const remaining = Math.max(0, timeLimit - elapsed);
          const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
          const seconds = (remaining % 60).toFixed(1).padStart(4, '0');
          setTimerDisplay(`${minutes}:${seconds}`);
          
          setTimeDanger(remaining <= 10 && remaining > 0);

          if (remaining <= 0) {
              if (timerRef.current) clearInterval(timerRef.current);
              if (onTimeout) onTimeout();
          }
      } else {
          // COUNTUP MODE (Stopwatch)
          const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
          const seconds = (elapsed % 60).toFixed(1).padStart(4, '0');
          setTimerDisplay(`${minutes}:${seconds}`);
      }
    }, 100);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isWon, timeLimit, onTimeout]);

  // --- NODE SPRITE & DOM DRAG LOGIC ---
  const createNodeSprite = (node: GameNode): NodeVisuals => {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const icon = new PIXI.Graphics().circle(0, 0, 20).fill(0x1e293b);
    
    container.addChild(bg, icon);
    container.eventMode = 'static';
    container.cursor = 'pointer';

    container.on('pointerdown', (e) => {
      if (stateRef.current.tool === 'link') {
        handleLinkAttempt(node.id);
      } else {
        if (activeInfo !== null) return;
        
        const startX = e.nativeEvent.clientX; 
        const startY = e.nativeEvent.clientY;
        let hasDragged = false;

        const onMove = (event: PointerEvent) => {
          if(!viewportRef.current || !appRef.current) return;
          const rect = appRef.current.canvas.getBoundingClientRect();
          const localX = event.clientX - rect.left;
          const localY = event.clientY - rect.top;

          if (Math.hypot(localX - startX, localY - startY) > 5) hasDragged = true;
          
          const movePos = viewportRef.current.toWorld(localX, localY);
          node.fx = movePos.x;
          node.fy = movePos.y;
          simulationRef.current?.alpha(0.3).restart();
        };

        const onUp = () => {
          node.fx = null;
          node.fy = null;
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointermove', onMove);

          if (!hasDragged) showNodeInfo(node, container);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      }
    });

    if (node.image) {
      const tex = PIXI.Assets.get(node.image);
      if (tex) {
        const s = new PIXI.Sprite(tex);
        s.anchor.set(0.5); s.width = s.height = 60;
        const m = new PIXI.Graphics().circle(0, 0, 30).fill(0xffffff);
        s.mask = m; container.addChild(m, s); icon.visible = false;
      }
    }
    return { container, bg, icon };
  };

  // --- 4. HANDLERS ---
  const handleLinkAttempt = (targetId: number) => {
    const currentSelectedId = stateRef.current.selectedNodeId;

    if (!currentSelectedId) {
      stateRef.current.selectedNodeId = targetId;
      setSelectedNodeId(targetId);
    } else {
      if (currentSelectedId === targetId) {
        stateRef.current.selectedNodeId = null;
        setSelectedNodeId(null);
        return;
      }
      
      const nodeA = levelData.nodes.find((n: GameNode) => n.id === currentSelectedId);
      const nodeB = levelData.nodes.find((n: GameNode) => n.id === targetId);
      const isConnected = nodeA?.connections.includes(targetId) || nodeB?.connections.includes(currentSelectedId);

      if (isConnected) {
        const linkExists = stateRef.current.userLinks.some(
          l => (l.sourceId === currentSelectedId && l.targetId === targetId) || 
               (l.sourceId === targetId && l.targetId === currentSelectedId)
        );

        if (linkExists) {
          toast("This connection already exists!", "warning");
        } else {
          const newLink = { sourceId: currentSelectedId, targetId };
          const updatedLinks = [...stateRef.current.userLinks, newLink];
          setUserLinks(updatedLinks);
          checkWinCondition(updatedLinks);
        }
      } else {
        toast(`No direct connection found between ${nodeA?.name || currentSelectedId} and ${nodeB?.name || targetId}!`, "warning");
      }
      
      stateRef.current.selectedNodeId = null;
      setSelectedNodeId(null);
    }
  };

  const deployNode = (node: GameNode) => {
    setWorkspaceNodes(prev => [...prev, { ...node, x: 1000 + (Math.random() * 100), y: 1000 + (Math.random() * 100 - 50) }]);
  };

  const retractNode = (nodeId: number) => {
    if (nodeId === levelData.metadata.start_node || nodeId === levelData.metadata.end_node) return;
    setWorkspaceNodes(prev => prev.filter(n => n.id !== nodeId));
    setUserLinks(prev => prev.filter(l => l.sourceId !== nodeId && l.targetId !== nodeId));
  };

  const checkWinCondition = (links: UserLink[]) => {
    const adj = new Map<number, number[]>();
    links.forEach(l => {
      if (!adj.has(l.sourceId)) adj.set(l.sourceId, []);
      if (!adj.has(l.targetId)) adj.set(l.targetId, []);
      adj.get(l.sourceId)!.push(l.targetId);
      adj.get(l.targetId)!.push(l.sourceId);
    });

    const queue: [number, number[]][] = [[levelData.metadata.start_node, [levelData.metadata.start_node]]];
    const visited = new Set([levelData.metadata.start_node]);
    
    while (queue.length > 0) {
      const [curr, path] = queue.shift()!;
      
      if (curr === levelData.metadata.end_node) {
        const finalTime = ((Date.now() - stateRef.current.startTime) / 1000);
        if(timerRef.current) clearInterval(timerRef.current);
        setTimerDisplay(finalTime.toFixed(1));
        setUiPath(path);
        setIsWon(true);
        onWin(finalTime); // Keeps correctly returning elapsed time to parent
        return;
      }
      
      (adj.get(curr) || []).forEach(neighbor => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([neighbor, [...path, neighbor]]);
        }
      });
    }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const showNodeInfo = (node: GameNode, container: PIXI.Container) => {
    if (!viewportRef.current) return;
    viewportRef.current.pause = true; 
    const screenPos = viewportRef.current.toScreen(container.x, container.y);
    
    setActiveInfo({
      name: node.name,
      type: node.type,
      x: screenPos.x,
      y: screenPos.y
    });

    setTimeout(() => {
      setActiveInfo(null);
      viewportRef.current!.pause = false;
    }, 3000);
  };

  const isDeployed = (nodeId: number) => workspaceNodes.some(n => n.id === nodeId);

  // Helper method for rendering the core tools efficiently in Desktop/Mobile variants
  const renderToolbar = () => (
    <>
        <button 
            onClick={() => {setTool('select'); stateRef.current.tool='select';}}
            className={`flex-1 md:flex-none px-4 py-2.5 md:px-5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'select' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
        >
            Move
        </button>
        <div className="w-px h-6 bg-white/10 mx-1 md:mx-2 self-center" />
        <button 
            onClick={() => {setTool('link'); stateRef.current.tool='link';}}
            className={`flex-1 md:flex-none px-4 py-2.5 md:px-5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'link' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
        >
            Link {selectedNodeId && "(!)"}
        </button>
        <div className="w-px h-6 bg-white/10 mx-1 md:mx-2 self-center" />
        <button 
            onClick={() => setIsLegendOpen(true)}
            className="px-4 py-2.5 md:px-5 rounded-xl text-xs font-black bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all flex-none"
        >
            ⓘ
        </button>
    </>
  );

  return (
    <div ref={mainContainerRef} className="relative flex h-full w-full bg-slate-950 overflow-hidden font-sans">
      
      {/* MOBILE OVERLAY BACKDROP */}
      <div 
          className={`md:hidden absolute inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setIsSidebarOpen(false)}
      />

      {/* SIDEBAR */}
      <div className={`absolute left-0 top-0 h-full border-r border-white/10 bg-slate-900 shadow-2xl z-40 transition-transform duration-500 flex flex-col w-[85vw] max-w-[320px] md:w-72 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {isSidebarOpen && (
              <>
                  <div className="p-4 md:p-5 border-b border-white/10 bg-slate-900/50 flex justify-between items-center">
                      <div>
                          <h2 className="text-white font-black uppercase tracking-tighter text-lg italic">Warehouse</h2>
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Available Nodes {levelData.nodes.length}</p>
                      </div>
                      <button onClick={toggleSidebar} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                      </button>
                  </div>
                  <div className="p-3 bg-slate-900/50">
                    <div className="relative">
                      <input 
                        type="text"
                        placeholder="Search anime, actors..."
                        className="w-full bg-slate-950 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all shadow-inner"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      <svg className="w-4 h-4 text-slate-500 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-2 custom-scrollbar bg-slate-900/30">
                        {(() => {
                            const query = searchQuery.toLowerCase();
                            const filteredNodes = warehouseNodes.filter(node => {
                                const typeStr = TYPE_MAP[node.type as keyof typeof TYPE_MAP] || "";
                                return node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                typeStr.toLowerCase().includes(query);
                            });

                            if (filteredNodes.length === 0) return <p className="text-slate-500 text-xs text-center mt-10">No nodes found.</p>;

                            return filteredNodes.map(node => {
                                const deployed = isDeployed(node.id);
                                const typeStr = TYPE_MAP[node.type as keyof typeof TYPE_MAP] || "Unknown";
                                const colorStr = `#${(NODE_COLORS[node.type] || 0xffffff).toString(16).padStart(6, '0')}`;
                                return (
                                  <div 
                                    key={node.id} 
                                    onClick={() => { if (!deployed) deployNode(node); }}
                                    className={`w-full flex items-center justify-between p-2 rounded-xl transition-all border cursor-pointer active:scale-95
                                      ${deployed ? 'bg-slate-900 border-white/10 opacity-70 hover:opacity-100 hover:border-indigo-500/50' : 'bg-slate-800/50 border-white/5 hover:bg-indigo-600 hover:border-indigo-400'}`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 pr-2">
                                        <div className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 ${deployed ? 'grayscale opacity-70' : 'bg-black'}`}>
                                            {node.image && <img src={node.image} className="w-full h-full object-cover" />}
                                        </div>
                                        <div className={`flex-1 min-w-0 ${deployed ? 'opacity-70' : ''}`}>
                                            <p className="text-white text-[11px] font-bold truncate leading-tight">{node.name}</p>
                                            <p className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{color: colorStr}}>
                                                {typeStr}
                                            </p>
                                        </div>
                                    </div>
                                    {deployed && (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    handleLocateNode(node.id); 
                                                    if (window.innerWidth < 768) setIsSidebarOpen(false); 
                                                }}
                                                className="px-2.5 py-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors"
                                            >
                                                Locate
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); retractNode(node.id); }}
                                                className="px-2.5 py-1.5 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors"
                                            >
                                                Retract
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )});
                        })()}
                    </div>
                  </div>
              </>
          )}
      </div>

      {/* FIXED CANVAS WRAPPER */}
      <div className="flex-1 relative h-full w-full overflow-hidden transition-all duration-300">
        
        {/* PIXI CANVAS PINNED */}
        <div ref={containerRef} className="absolute inset-0 z-10 pointer-events-auto" />

        {/* TOGGLE SIDEBAR BUTTON */}
        {!isSidebarOpen && (
            <button 
                onClick={toggleSidebar}
                className="absolute top-4 left-4 md:top-6 md:left-6 z-30 bg-indigo-600 text-white p-3 rounded-xl shadow-2xl hover:bg-indigo-500 transition-all pointer-events-auto active:scale-95"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
            </button>
        )}

        {/* DESKTOP TOOLBAR (Hidden on Mobile) */}
        <div className="hidden md:flex absolute top-6 left-1/2 -translate-x-1/2 z-30 gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto">
            {renderToolbar()}
        </div>

        {/* TOP RIGHT CONTROLS */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6 z-30 flex flex-col items-end gap-3 pointer-events-none">
          
          <div className="bg-slate-900/90 border border-white/10 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-xl shadow-2xl flex flex-col items-end pointer-events-auto">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                {timeLimit && timeLimit > 0 ? 'Time Remaining' : 'Time Elapsed'}
            </p>
            <p className={`text-lg md:text-xl font-mono font-bold leading-none mt-0.5 ${timeDanger ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
                {timerDisplay}
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
            <button onClick={handleCenterView} title="Center View" className="w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            </button>
            <button onClick={() => handleZoom('out')} title="Zoom Out" className="w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" transform="rotate(45 12 12) scale(0.8) translate(3 -3)" /><line x1="9" y1="12" x2="15" y2="12" strokeWidth="2" /></svg>
            </button>
            <button onClick={() => handleZoom('in')} title="Zoom In" className="w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
            </button>
            <button onClick={toggleFullscreen} title="Fullscreen" className={`w-10 h-10 md:w-11 md:h-11 ${isFullscreen ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/90 text-slate-400 border-white/10 hover:text-white hover:bg-slate-800'} border rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-95`}>
                {isFullscreen ? (
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m11 5l-5-5m0 0v4m0-4h4M9 15l-5 5m0 0v-4m0 4h4m11-5l-5 5m0 0v-4m0 4h4" /></svg>
                ) : (
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                )}
            </button>
          </div>
        </div>

        {/* BOTTOM UI STACK */}
        <div className="absolute bottom-4 md:bottom-6 left-4 md:left-6 right-4 md:right-6 z-30 flex flex-col gap-3 pointer-events-none">
            
            {/* Retraction Bar */}
            <div className="flex gap-2 overflow-x-auto pb-1 pointer-events-auto w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {workspaceNodes.map(node => (
                    <div key={node.id} className="flex-shrink-0 bg-slate-900/90 border border-white/10 pl-2 pr-1.5 py-1.5 md:pl-3 md:pr-2 md:py-2 rounded-xl flex items-center gap-2 md:gap-3 backdrop-blur-md shadow-lg">
                        <div 
                          className="w-2 h-2 rounded-full flex-shrink-0" 
                          style={{backgroundColor: `#${(NODE_COLORS[node.type] || 0xffffff).toString(16).padStart(6, '0')}`}} 
                        />
                        <span className="text-[11px] md:text-[12px] text-white font-bold whitespace-nowrap">{node.name}</span>
                        {node.id !== levelData.metadata.start_node && node.id !== levelData.metadata.end_node && (
                            <button 
                                onClick={(e) => {e.stopPropagation(); retractNode(node.id);}}
                                className="w-5 h-5 md:w-6 md:h-6 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-xs md:text-sm md:ml-1"
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* MOBILE TOOLBAR (Hidden on Desktop) */}
            <div className="md:hidden flex gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto w-full max-w-sm mx-auto">
                {renderToolbar()}
            </div>
        </div>

        {/* MODALS */}
        {isWon && (
            <div className="absolute inset-0 z-50 pointer-events-auto">
              <VictoryModal 
                  onNext={() => window.location.href='/'} 
                  time={parseFloat(timerDisplay)} 
                  shortestPath={intendedPath?.map(String)} 
                  userPath={uiPath.map(String)}            
                  nodes={levelData.nodes}
              />
            </div>
        )}

        {isLegendOpen && (
            <div className="absolute inset-0 z-50 pointer-events-auto">
              <LegendModal onClose={() => setIsLegendOpen(false)} />
            </div>
        )}

        {/* FLOATING INFO LABEL */}
        {activeInfo && (
          <div 
            className="absolute z-50 bg-slate-800 border border-indigo-500/50 p-3 rounded-lg shadow-2xl pointer-events-none animate-in fade-in zoom-in duration-200 min-w-max"
            style={{ left: `${activeInfo.x}px`, top: `${activeInfo.y - 80}px`, transform: 'translateX(-50%)' }}
          >
            <p className="text-white font-bold text-xs">{activeInfo.name}</p>
            <p className="text-indigo-400 font-black text-[9px] uppercase tracking-widest">
                {TYPE_MAP[activeInfo.type as keyof typeof TYPE_MAP] || "Unknown"}
            </p>
          </div>
        )}
      </div>
      <ToastContainer />
    </div>
  );
};

export default GameClient;
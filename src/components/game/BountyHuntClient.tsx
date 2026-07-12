import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { NODE_COLORS, SPECIAL_NODE_COLORS, TYPE_MAP, type GameNode, type LevelData, type NodeVisuals } from '../../types/game';

interface Props {
  levelData: LevelData;
}

const BountyHuntClient: React.FC<Props> = ({ levelData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // --- GAME STATES ---
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [isWon, setIsWon] = useState(false);
  const [isLost, setIsLost] = useState(false);
  
  // Bot Tracking
  const [targetNodeId, setTargetNodeId] = useState<number>(levelData.metadata.end_node);
  const [jumpsLeft, setJumpsLeft] = useState(10);
  const [jumpTimer, setJumpTimer] = useState(10.0);

  const [workspace, setWorkspace] = useState<GameNode[]>([]);
  const [warehouse, setWarehouse] = useState<GameNode[]>([]);
  const [userLinks, setUserLinks] = useState<{sourceId: number, targetId: number}[]>([]);
  
  const [tool, setTool] = useState<'move' | 'link'>('move');
  const [edgeSourceId, setEdgeSourceId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeInfo, setActiveInfo] = useState<{name: string, type: number, x: number, y: number} | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // --- REFS ---
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const simulationRef = useRef<d3.Simulation<GameNode, undefined> | null>(null);
  const nodeLayerRef = useRef<PIXI.Container | null>(null);
  const linkLayerRef = useRef<PIXI.Graphics | null>(null);
  const spriteMap = useRef<Record<number, NodeVisuals>>({});
  const targetZoomRef = useRef<number | null>(null);

  const stateRef = useRef({
    tool: 'move' as 'move' | 'link',
    targetNodeId: levelData.metadata.end_node,
    edgeSourceId: null as number | null,
    workspace: [] as GameNode[],
    userLinks: [] as {sourceId: number, targetId: number}[]
  });

  const allNodesMap = useMemo(() => {
      const map: Record<number, GameNode> = {};
      levelData.nodes.forEach(n => map[n.id] = n);
      return map;
  }, [levelData]);

  // Sync state to ref for Pixi Ticker
  useEffect(() => {
    stateRef.current = { tool, targetNodeId, edgeSourceId, workspace, userLinks };
  }, [tool, targetNodeId, edgeSourceId, workspace, userLinks]);

  // Responsive default: close sidebar on mobile
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  // --- FULLSCREEN & ZOOM HANDLERS ---
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

  const handleZoom = (direction: 'in' | 'out') => {
      const vp = viewportRef.current;
      if (!vp) return;
      const currentTarget = targetZoomRef.current || vp.scale.x;
      const target = direction === 'in' ? Math.min(currentTarget * 1.5, 3) : Math.max(currentTarget * 0.6, 0.2);
      targetZoomRef.current = target;
      vp.animate({ scale: target, time: 300, ease: 'easeOutQuart', removeOnInterrupt: true });
  };

  const handleCenterView = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      targetZoomRef.current = 1; 
      vp.animate({ position: new PIXI.Point(1000, 1000), scale: 1, time: 400, ease: 'easeOutQuart', removeOnInterrupt: true });
  };

  const handleLocateNode = (nodeId: number) => {
    const vp = viewportRef.current;
    const node = stateRef.current.workspace.find(n => n.id === nodeId);
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

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // --- PRELOAD ASSETS ---
  useEffect(() => {
    let isMounted = true;
    const imageUrls = levelData.nodes.map(n => n.image).filter(Boolean) as string[];

    if (imageUrls.length === 0) {
      if (isMounted) setIsReady(true);
      return;
    }

    let loadedCount = 0;
    const loadImage = (url: string) => {
      return new Promise((resolve) => {
        const img = new Image();
        let isSettled = false;
        const finish = () => { if (!isSettled) { isSettled = true; resolve(true); } };
        img.onload = finish;
        img.onerror = finish;
        setTimeout(finish, 5000); 
        img.src = url;
      });
    };

    const promises = imageUrls.map(async (url) => {
      await loadImage(url);
      loadedCount++;
      if (isMounted) setProgress(Math.round((loadedCount / imageUrls.length) * 100));
    });

    Promise.all(promises).then(() => {
      if (isMounted) setIsReady(true);
    });

    return () => { isMounted = false; };
  }, [levelData]);

  // --- BOT LOGIC (THE CHASE) ---
  const botStateRef = useRef({ targetNodeId, jumpsLeft, workspace });
  useEffect(() => {
      botStateRef.current = { targetNodeId, jumpsLeft, workspace };
  }, [targetNodeId, jumpsLeft, workspace]);

  useEffect(() => {
      if (!hasStarted || isWon || isLost) return;

      const JUMP_TIME_MS = 10000; 
      let lastJumpTime = Date.now();

      const executeBotJump = () => {
          const { targetNodeId: currentTarget, jumpsLeft: currentJumps, workspace: currentWorkspace } = botStateRef.current;
          
          if (currentJumps <= 1) {
              setIsLost(true);
              return;
          }

          const currentNode = allNodesMap[currentTarget];
          const validNeighbors = currentNode.connections.filter(id => allNodesMap[id] && id !== levelData.metadata.start_node);
          
          if (validNeighbors.length === 0) {
              setToastMsg("The Bot is cornered! Catch it!");
              setTimeout(() => setToastMsg(null), 3000);
              return;
          }

          const nextNodeId = validNeighbors[Math.floor(Math.random() * validNeighbors.length)];
          setTargetNodeId(nextNodeId);
          setJumpsLeft(prev => prev - 1);
          
          const nextNode = allNodesMap[nextNodeId];
          setToastMsg(`Bot jumped to ${nextNode.name}!`);
          setTimeout(() => setToastMsg(null), 3000);

          const isAlreadyDeployed = currentWorkspace.some(n => n.id === nextNodeId);
          if (!isAlreadyDeployed) {
              const prevBotNode = currentWorkspace.find(n => n.id === currentTarget);
              const spawnX = prevBotNode && prevBotNode.x != null ? prevBotNode.x + (Math.random() * 60 - 30) : 1000;
              const spawnY = prevBotNode && prevBotNode.y != null ? prevBotNode.y + (Math.random() * 60 - 30) : 1000;

              setWorkspace(prev => [...prev, { ...nextNode, x: spawnX, y: spawnY, vx:0, vy:0 }]);
          }
      };

      const interval = setInterval(() => {
          const now = Date.now();
          const elapsed = now - lastJumpTime;
          const remaining = Math.max(0, JUMP_TIME_MS - elapsed);
          
          if (remaining <= 0) {
              executeBotJump();
              lastJumpTime = Date.now(); 
              setJumpTimer(10.0);
          } else {
              setJumpTimer(remaining / 1000);
          }
      }, 100);

      return () => clearInterval(interval);
  }, [hasStarted, isWon, isLost, allNodesMap, levelData.metadata.start_node]);

  // --- WIN VALIDATION ---
  useEffect(() => {
      if (!hasStarted || isWon || isLost) return;

      const adj = new Map<number, number[]>();
      userLinks.forEach(l => {
          if (!adj.has(l.sourceId)) adj.set(l.sourceId, []);
          if (!adj.has(l.targetId)) adj.set(l.targetId, []);
          adj.get(l.sourceId)!.push(l.targetId);
          adj.get(l.targetId)!.push(l.sourceId);
      });

      const queue = [levelData.metadata.start_node];
      const visited = new Set([levelData.metadata.start_node]);

      while (queue.length > 0) {
          const curr = queue.shift()!;
          if (curr === targetNodeId) {
              setIsWon(true);
              return;
          }
          (adj.get(curr) || []).forEach(neighbor => {
              if (!visited.has(neighbor)) {
                  visited.add(neighbor);
                  queue.push(neighbor);
              }
          });
      }
  }, [userLinks, targetNodeId, hasStarted]);

  // --- INITIALIZATION (CANVAS) ---
  useEffect(() => {
    if (!containerRef.current) return;
    const app = new PIXI.Application();
    let resizeObserver: ResizeObserver | null = null;
    
    const init = async () => {
      await app.init({ resizeTo: containerRef.current!, backgroundColor: 0x020617, antialias: true });
      containerRef.current?.appendChild(app.canvas);
      appRef.current = app;

      const imageUrls = levelData.nodes.map(n => n.image).filter(Boolean) as string[];
      if (imageUrls.length > 0) {
          try { await PIXI.Assets.load(imageUrls); } catch(e) { console.warn("Pixi GPU cache skip."); }
      }

      const viewport = new Viewport({
        screenWidth: containerRef.current!.clientWidth, 
        screenHeight: containerRef.current!.clientHeight,
        worldWidth: 2000, worldHeight: 2000, events: app.renderer.events
      });
      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000);
      viewport.on('zoomed', () => { targetZoomRef.current = null; });
      viewportRef.current = viewport;

      resizeObserver = new ResizeObserver(() => {
          if (viewportRef.current && containerRef.current) {
              viewportRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
          }
      });
      resizeObserver.observe(containerRef.current!);

      linkLayerRef.current = new PIXI.Graphics();
      nodeLayerRef.current = new PIXI.Container();
      viewport.addChild(linkLayerRef.current, nodeLayerRef.current);

      simulationRef.current = d3.forceSimulation<GameNode>([])
        .force("charge", d3.forceManyBody().strength(-250)) 
        .force("collide", d3.forceCollide().radius(60)) 
        .force("x", d3.forceX(1000).strength(0.04)) 
        .force("y", d3.forceY(1000).strength(0.04)) 
        .force("center", d3.forceCenter(1000, 1000));

      app.ticker.add(() => {
        if (!linkLayerRef.current) return;
        
        linkLayerRef.current.clear();
        stateRef.current.userLinks.forEach(edge => {
            const s = stateRef.current.workspace.find(n => n.id === edge.sourceId);
            const t = stateRef.current.workspace.find(n => n.id === edge.targetId);
            if (s && t && s.x != null && s.y != null && t.x != null && t.y != null) {
                linkLayerRef.current!.moveTo(s.x, s.y).lineTo(t.x, t.y).stroke({ width: 5, color: 0x8b5cf6, alpha: 1 }); 
            }
        });

        stateRef.current.workspace.forEach(node => {
          const vis = spriteMap.current[node.id];
          if (vis && Number.isFinite(node.x) && Number.isFinite(node.y)) {
            vis.container.x = node.x!; 
            vis.container.y = node.y!;

            const isStart = levelData.metadata.start_node === node.id;
            const isTarget = stateRef.current.targetNodeId === node.id;
            const isEdgeSource = stateRef.current.edgeSourceId === node.id;
            
            let strokeColor = NODE_COLORS[node.type] || 0x334155;
            let strokeWidth = 2;

            if (isEdgeSource) {
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

      const start = levelData.nodes.find(n => n.id === levelData.metadata.start_node)!;
      const end = levelData.nodes.find(n => n.id === levelData.metadata.end_node)!;
      const others = levelData.nodes.filter(n => n.id !== start.id && n.id !== end.id);
      
      setWorkspace([
        { ...start, x: 1000 - 100, y: 1000, vx:0, vy:0 }, 
        { ...end, x: 1000 + 100, y: 1000, vx:0, vy:0 }
      ]);
      setWarehouse(others);
    };

    init();
    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      app.destroy(true);
    };
  }, []);

  // --- SYNC WORKSPACE ---
  useEffect(() => {
    if (!simulationRef.current || !nodeLayerRef.current) return;

    const d3Links = userLinks.map(e => ({ source: e.sourceId, target: e.targetId }));
    simulationRef.current.nodes(workspace);
    simulationRef.current.force("link", d3.forceLink(d3Links).id((d: any) => d.id).distance(120)); 
    
    simulationRef.current.alpha(0.3).restart();

    workspace.forEach(node => {
      if (!spriteMap.current[node.id]) {
        const vis = createNodeSprite(node);
        vis.container.x = node.x || 1000; vis.container.y = node.y || 1000;
        nodeLayerRef.current!.addChild(vis.container);
        spriteMap.current[node.id] = vis;
      }
    });

    Object.keys(spriteMap.current).forEach(idStr => {
      const id = Number(idStr);
      if (!workspace.find(n => n.id === id)) {
        nodeLayerRef.current!.removeChild(spriteMap.current[id].container);
        delete spriteMap.current[id];
      }
    });
  }, [workspace, userLinks]);

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
      
      if (currentTool === 'link') {
          if (!stateRef.current.edgeSourceId) {
              setEdgeSourceId(node.id);
          } else {
              if (stateRef.current.edgeSourceId === node.id) {
                  setEdgeSourceId(null); return;
              }
              const sourceId = stateRef.current.edgeSourceId;
              const targetId = node.id;
              
              const nodeA = allNodesMap[sourceId];
              const nodeB = allNodesMap[targetId];
              const isConnectedInDb = nodeA.connections.includes(targetId) || nodeB.connections.includes(sourceId);

              if (isConnectedInDb) {
                  const linkExists = stateRef.current.userLinks.some(l => (l.sourceId === sourceId && l.targetId === targetId) || (l.sourceId === targetId && l.targetId === sourceId));
                  if (!linkExists) {
                      setUserLinks(prev => [...prev, { sourceId, targetId }]);
                  }
              } else {
                  setToastMsg("❌ Incorrect! No connection in the database.");
                  setTimeout(() => setToastMsg(null), 2000);
              }
              setEdgeSourceId(null);
          }
      }
      else if (currentTool === 'move') {
          const startX = e.global.x; 
          const startY = e.global.y;
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

              if (!hasDragged) {
                  const pos = viewportRef.current!.toScreen(container.x, container.y);
                  setActiveInfo({ name: node.name, type: node.type, x: pos.x, y: pos.y });
                  setTimeout(() => setActiveInfo(null), 2000);
              }
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

  const deployNode = (node: GameNode) => {
      let spawnX = 1000;
      let spawnY = 1000;
      if (viewportRef.current) {
          const center = viewportRef.current.center;
          spawnX = center.x + (Math.random() * 80 - 40);
          spawnY = center.y + (Math.random() * 80 - 40);
      }
      setWorkspace(prev => [...prev, { ...node, x: spawnX, y: spawnY, vx: 0, vy: 0 }]);
  };

  const retractNode = (nodeId: number) => {
      if (nodeId === levelData.metadata.start_node || nodeId === targetNodeId) {
          setToastMsg("⚠️ You cannot retract the Start Node or the Bot's current location!");
          setTimeout(() => setToastMsg(null), 2000);
          return;
      }
      setWorkspace(prev => prev.filter(n => n.id !== nodeId));
      setUserLinks(prev => prev.filter(l => l.sourceId !== nodeId && l.targetId !== nodeId));
      if (edgeSourceId === nodeId) setEdgeSourceId(null);
  };

  const isDeployed = (nodeId: number) => workspace.some(n => n.id === nodeId);

  const filteredNodes = warehouse.filter(n => 
    n.name.toLowerCase().includes(searchQuery.toLowerCase()) || (TYPE_MAP[n.type as keyof typeof TYPE_MAP] || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={mainContainerRef} className="flex h-full w-full font-sans bg-slate-950 relative overflow-hidden">
      
      {/* 1. START OVERLAY */}
      {!hasStarted && (
          <div className="absolute inset-0 z-[9999] bg-slate-950/90 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
              <div className="max-w-md w-full bg-slate-900 border border-indigo-500/30 p-8 rounded-3xl text-center shadow-2xl animate-in fade-in zoom-in duration-300">
                  <div className="text-5xl mb-4">🤖</div>
                  <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Bounty Hunt</h2>
                  <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                      The Rogue Node (Cyan) will jump to a new connection every <strong>10 seconds</strong>. Build a bridge from the Start Node (White) to the Rogue Node to catch it before it escapes!
                  </p>
                  
                  {!isReady ? (
                      <div className="w-full bg-slate-950 border border-white/10 p-4 rounded-2xl">
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                              <span>Downloading Assets</span>
                              <span className="text-indigo-400">{progress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-600 transition-all duration-200" style={{ width: `${progress}%` }}></div>
                          </div>
                      </div>
                  ) : (
                      <button 
                          onClick={() => setHasStarted(true)} 
                          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] uppercase tracking-widest transition-all active:scale-95"
                      >
                          Begin Hunt
                      </button>
                  )}
              </div>
          </div>
      )}

      {/* 2. WIN/LOSS OVERLAYS */}
      {isWon && (
          <div className="absolute inset-0 z-[9999] bg-emerald-950/90 backdrop-blur-xl flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-slate-900 border border-emerald-500/50 p-8 rounded-3xl text-center shadow-2xl animate-in zoom-in">
                  <div className="text-6xl mb-4">🎯</div>
                  <h2 className="text-4xl font-black text-emerald-400 uppercase tracking-tighter mb-2">Bounty Captured!</h2>
                  <p className="text-slate-300 mb-8">You successfully intercepted the Rogue Node.</p>
                  <a href="/" className="block w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl shadow-lg uppercase tracking-widest transition-all">
                      Return to HQ
                  </a>
              </div>
          </div>
      )}

      {isLost && (
          <div className="absolute inset-0 z-[9999] bg-rose-950/90 backdrop-blur-xl flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-slate-900 border border-rose-500/50 p-8 rounded-3xl text-center shadow-2xl animate-in zoom-in">
                  <div className="text-6xl mb-4">💨</div>
                  <h2 className="text-4xl font-black text-rose-400 uppercase tracking-tighter mb-2">Target Escaped</h2>
                  <p className="text-slate-300 mb-8">The Rogue Node made 10 jumps and vanished into the multiverse.</p>
                  <button onClick={() => window.location.reload()} className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-4 rounded-xl shadow-lg uppercase tracking-widest transition-all">
                      Try Again
                  </button>
              </div>
          </div>
      )}

      {/* MOBILE OVERLAY BACKDROP */}
      <div className={`md:hidden absolute inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsSidebarOpen(false)} />

      {/* SIDEBAR WAREHOUSE */}
      <div className={`absolute left-0 top-0 h-full border-r border-white/10 bg-slate-900 shadow-2xl z-40 transition-transform duration-500 flex flex-col w-[85vw] max-w-[320px] md:w-72 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4 md:p-5 border-b border-white/10 bg-slate-900/50 flex justify-between items-center">
            <div>
                <h2 className="text-white font-black uppercase tracking-tighter text-lg italic">Intel Database</h2>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Available Targets {warehouse.length}</p>
            </div>
            <button onClick={toggleSidebar} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
            </button>
        </div>
        <div className="p-3 bg-slate-900/50">
            <div className="relative">
                <input 
                  type="text" placeholder="Search anime, actors..." 
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                />
                <svg className="w-4 h-4 text-slate-500 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-2 custom-scrollbar bg-slate-900/30">
          {filteredNodes.length === 0 && <p className="text-slate-500 text-xs text-center mt-10">No records found.</p>}
          {filteredNodes.map(node => {
            const deployed = isDeployed(node.id);
            const colorCode = `#${(NODE_COLORS[node.type] || 0xffffff).toString(16).padStart(6, '0')}`;
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
                    <p className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{color: colorCode}}>
                        {TYPE_MAP[node.type as keyof typeof TYPE_MAP] || "Unknown"}
                    </p>
                  </div>
                </div>
                {deployed && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                            onClick={(e) => { e.stopPropagation(); handleLocateNode(node.id); if(window.innerWidth<768) setIsSidebarOpen(false); }}
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
            )
          })}
        </div>
      </div>

      {/* SHOW SIDEBAR BUTTON */}
      {!isSidebarOpen && (
          <button 
              onClick={toggleSidebar}
              className="absolute top-6 left-4 z-40 bg-indigo-600 text-white p-3 rounded-xl shadow-2xl hover:bg-indigo-500 transition-all"
          >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
          </button>
      )}

      {/* MAIN CANVAS */}
      <div className="flex-1 relative bg-slate-950 h-full w-full overflow-hidden">
        
        {/* TOP STATUS BAR: THE CHASE */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-800 z-30 overflow-hidden">
            <div className="h-full bg-cyan-400 transition-all duration-100 ease-linear" style={{ width: `${(jumpTimer / 10) * 100}%` }}></div>
        </div>

        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex gap-4 pointer-events-none w-full max-w-sm justify-between px-4 sm:px-0 sm:left-auto sm:-translate-x-0 sm:right-6 sm:w-auto sm:justify-end">
            <div className="bg-slate-900/90 border border-cyan-500/30 px-4 py-2 rounded-2xl backdrop-blur-md shadow-2xl flex flex-col items-center flex-1 sm:flex-none">
                <p className="text-[9px] uppercase font-bold tracking-widest text-cyan-400 mb-0.5">Bot Jumps</p>
                <p className="text-xl md:text-2xl font-black text-white font-mono">{jumpTimer.toFixed(1)}s</p>
            </div>
            <div className="bg-slate-900/90 border border-rose-500/30 px-4 py-2 rounded-2xl backdrop-blur-md shadow-2xl flex flex-col items-center flex-1 sm:flex-none">
                <p className="text-[9px] uppercase font-bold tracking-widest text-rose-400 mb-0.5">Jumps Left</p>
                <p className="text-xl md:text-2xl font-black text-white font-mono">{jumpsLeft}</p>
            </div>
        </div>

        {/* TOOLBAR */}
        <div className="absolute bottom-24 sm:bottom-auto sm:top-6 left-1/2 -translate-x-1/2 z-30 flex gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto">
            <button 
                onClick={() => { setTool('move'); setEdgeSourceId(null); }}
                className={`px-4 sm:px-6 py-2 sm:py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${tool === 'move' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                Move
            </button>
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            <button 
                onClick={() => { setTool('link'); setEdgeSourceId(null); }}
                className={`px-4 sm:px-6 py-2 sm:py-3 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all ${tool === 'link' ? 'bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                Link {edgeSourceId !== null && "(!)"}
            </button>
        </div>

        {/* ZOOM & CENTER CONTROLS */}
        <div className="absolute top-24 right-6 sm:top-28 z-30 flex flex-col gap-2 pointer-events-auto">
            <button onClick={handleCenterView} title="Center View" className="w-10 h-10 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            </button>
            <button onClick={() => handleZoom('in')} title="Zoom In" className="w-10 h-10 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
            </button>
            <button onClick={() => handleZoom('out')} title="Zoom Out" className="w-10 h-10 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-lg">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" transform="rotate(45 12 12) scale(0.8) translate(3 -3)" /><line x1="9" y1="12" x2="15" y2="12" strokeWidth="2" /></svg>
            </button>
            <button onClick={toggleFullscreen} title="Fullscreen" className={`w-10 h-10 ${isFullscreen ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/90 text-slate-400 border-white/10 hover:text-white hover:bg-slate-800'} border rounded-xl flex items-center justify-center transition-all shadow-lg`}>
                {isFullscreen ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m11 5l-5-5m0 0v4m0-4h4M9 15l-5 5m0 0v-4m0 4h4m11-5l-5 5m0 0v-4m0 4h4" /></svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                )}
            </button>
        </div>

        {/* NOTIFICATIONS */}
        {toastMsg && (
            <div className="absolute top-24 sm:top-28 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white px-6 py-3 rounded-full border border-white/20 shadow-2xl font-bold uppercase tracking-widest text-[10px] sm:text-xs animate-in slide-in-from-top-4 duration-300 pointer-events-none">
                {toastMsg}
            </div>
        )}

        {/* CANVAS - Locked until started */}
        <div ref={containerRef} className={`w-full h-full ${hasStarted ? 'pointer-events-auto' : 'pointer-events-none'}`} />

        {/* RETRACTION LIST */}
        <div className={`absolute bottom-6 right-6 z-30 flex gap-2 overflow-x-auto no-scrollbar pb-2 pointer-events-auto transition-all duration-500 ${isSidebarOpen ? 'left-6 md:left-[19.5rem]' : 'left-6'}`} style={{ scrollbarWidth: 'none' }}>
            {workspace.length > 0 && workspace.map(node => (
                <div key={node.id} className="bg-slate-900/90 border border-white/10 pl-3 pr-2 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg shrink-0 cursor-pointer hover:bg-slate-800 transition-colors" onClick={() => handleLocateNode(node.id)}>
                    <div className="flex flex-col pointer-events-none">
                      <span className="text-[11px] text-white font-bold whitespace-nowrap leading-tight">{node.name}</span>
                      <span className="text-[8px] font-bold uppercase tracking-widest" style={{color: levelData.metadata.start_node === node.id ? '#ffffff' : (targetNodeId === node.id ? '#22d3ee' : '#64748b')}}>
                          {levelData.metadata.start_node === node.id ? 'Start Node' : (targetNodeId === node.id ? 'Target (Bot)' : 'Node')}
                      </span>
                    </div>
                    <button 
                        onClick={(e) => { e.stopPropagation(); retractNode(node.id); }}
                        className="w-6 h-6 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-sm font-bold"
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>

        {/* FLOATING INFO LABEL */}
        {activeInfo && (
          <div className="absolute z-50 bg-slate-800 border border-indigo-500/50 p-3 rounded-lg shadow-2xl pointer-events-none animate-in fade-in zoom-in duration-200 min-w-max" style={{ left: `${activeInfo.x}px`, top: `${activeInfo.y - 80}px`, transform: 'translateX(-50%)' }}>
            <p className="text-white font-bold text-xs">{activeInfo.name}</p>
            <p className="text-indigo-400 font-black text-[9px] uppercase tracking-widest">{TYPE_MAP[activeInfo.type as keyof typeof TYPE_MAP] || "Unknown"}</p>
          </div>
        )}

      </div>
    </div>
  );
};

export default BountyHuntClient;
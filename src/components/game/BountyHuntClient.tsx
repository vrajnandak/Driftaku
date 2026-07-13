import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { NODE_COLORS, SPECIAL_NODE_COLORS, TYPE_MAP, type GameNode, type LevelData, type NodeVisuals } from '../../types/game';
import { useSidebar } from '../../hooks/useSidebar';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useViewportControls } from '../../hooks/useViewportControls';
import { SharedSidebar } from '../SharedSidebar';
import { SharedWorkspaceSlider } from '../SharedWorkspaceSlider';
import { SharedCanvasControls } from '../SharedCanvasControls';

interface Props {
  levelData: LevelData;
}

const BountyHuntClient: React.FC<Props> = ({ levelData }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);

  // Custom Hooks
  const { isSidebarOpen, toggleSidebar, closeSidebar } = useSidebar();
  const { isFullscreen, toggleFullscreen } = useFullscreen(mainContainerRef);

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
  const [activeInfo, setActiveInfo] = useState<{name: string, type: number, x: number, y: number} | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // --- REFS ---
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const simulationRef = useRef<d3.Simulation<GameNode, undefined> | null>(null);
  const nodeLayerRef = useRef<PIXI.Container | null>(null);
  const linkLayerRef = useRef<PIXI.Graphics | null>(null);
  const spriteMap = useRef<Record<number, NodeVisuals>>({}); // Restored spriteMap Ref

  // Viewport Controls Hook
  const { handleZoom, handleCenterView, handleLocateCoords, resetTargetZoom } = useViewportControls(viewportRef);

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

  // Wrapper for locate node using the custom hook
  const handleLocateNode = (nodeId: number) => {
    const node = stateRef.current.workspace.find(n => n.id === nodeId);
    if (node && typeof node.x === 'number' && typeof node.y === 'number') {
        handleLocateCoords(node.x, node.y);
    }
  };

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

    let isMounted = true;
    let isInitialized = false;

    const app = new PIXI.Application();
    let resizeObserver: ResizeObserver | null = null;
    
    const init = async () => {
      try {
        await app.init({ 
          resizeTo: containerRef.current!, 
          backgroundColor: 0x020617, 
          antialias: true,
          resolution: Math.max(1, window.devicePixelRatio || 1), // Crisp on mobile
          autoDensity: true // Syncs CSS pixels with canvas pixels
        });

        isInitialized = true;

        if (!isMounted || !containerRef.current) {
          app.destroy(true);
          return;
        }

        containerRef.current.appendChild(app.canvas);
        appRef.current = app;

        const imageUrls = levelData.nodes.map(n => n.image).filter(Boolean) as string[];
        if (imageUrls.length > 0) {
            try { await PIXI.Assets.load(imageUrls); } catch(e) { console.warn("Pixi GPU cache skip."); }
        }

        if (!isMounted || !containerRef.current) {
          app.destroy(true);
          return;
        }

        const viewport = new Viewport({
          screenWidth: containerRef.current.clientWidth, 
          screenHeight: containerRef.current.clientHeight,
          worldWidth: 2000, worldHeight: 2000, events: app.renderer.events
        });
        
        app.stage.addChild(viewport);
        viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000);
        
        viewport.on('zoomed', resetTargetZoom);
        viewport.on('drag-start', resetTargetZoom);
        viewport.on('pinch-start', resetTargetZoom);
        viewport.on('wheel', resetTargetZoom);

        viewportRef.current = viewport;

        resizeObserver = new ResizeObserver(() => {
            if (appRef.current && viewportRef.current && containerRef.current) {
                appRef.current.resize();
                viewportRef.current.resize(containerRef.current.clientWidth, containerRef.current.clientHeight);
            }
        });
        resizeObserver.observe(containerRef.current);

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
          if (!linkLayerRef.current || !isMounted) return;
          
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
      } catch (err) {
        console.error("PIXI Setup Error:", err);
      }
    };

    init();

    return () => {
      isMounted = false;
      if (resizeObserver) resizeObserver.disconnect();
      if (isInitialized) {
        app.destroy(true);
      }
    };
  }, [levelData, resetTargetZoom]);

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
      e.stopPropagation(); // Prevents dragging a node from dragging the entire canvas

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
          // Use e.global for cross-device (mouse/touch) compatibility
          const startX = e.global.x; 
          const startY = e.global.y;
          let hasDragged = false;

          const onMove = (event: PIXI.FederatedPointerEvent) => {
              if(!viewportRef.current) return;
              
              if (Math.hypot(event.global.x - startX, event.global.y - startY) > 5) {
                  hasDragged = true;
              }
              
              const movePos = viewportRef.current.toWorld(event.global.x, event.global.y);
              node.fx = movePos.x;
              node.fy = movePos.y;
              simulationRef.current?.alpha(0.3).restart();
          };

          const onUp = () => {
              node.fx = null;
              node.fy = null;
              
              // Clean up viewport-level listeners
              if (viewportRef.current) {
                  viewportRef.current.off('pointermove', onMove);
                  viewportRef.current.off('pointerup', onUp);
                  viewportRef.current.off('pointerupoutside', onUp);
              }

              if (!hasDragged) {
                  const pos = viewportRef.current!.toScreen(container.x, container.y);
                  setActiveInfo({ name: node.name, type: node.type, x: pos.x, y: pos.y });
                  setTimeout(() => setActiveInfo(null), 2000);
              }
          };

          // Attach listeners to viewport so cursor can leave the node sprite without breaking drag
          if (viewportRef.current) {
              viewportRef.current.on('pointermove', onMove);
              viewportRef.current.on('pointerup', onUp);
              viewportRef.current.on('pointerupoutside', onUp);
          }
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

      <SharedSidebar 
        isOpen={isSidebarOpen}
        onToggle={toggleSidebar}
        onClose={closeSidebar}
        title="Intel Database"
        subtitle={`Available Targets ${warehouse.length}`}
        nodes={warehouse}
        deployedNodeIds={workspace.map(n => n.id)}
        onDeploy={deployNode}
        onLocate={handleLocateNode}
        onRetract={retractNode}
      />

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
        <div className="absolute top-24 right-4 md:top-28 md:right-6 z-30 flex flex-col items-end gap-3 pointer-events-none">
            <SharedCanvasControls 
                onCenterView={handleCenterView}
                onZoomIn={() => handleZoom('in')}
                onZoomOut={() => handleZoom('out')}
                isFullscreen={isFullscreen}
                onToggleFullscreen={toggleFullscreen}
            />
        </div>

        {/* NOTIFICATIONS */}
        {toastMsg && (
            <div className="absolute top-24 sm:top-28 left-1/2 -translate-x-1/2 z-40 bg-slate-800 text-white px-6 py-3 rounded-full border border-white/20 shadow-2xl font-bold uppercase tracking-widest text-[10px] sm:text-xs animate-in slide-in-from-top-4 duration-300 pointer-events-none">
                {toastMsg}
            </div>
        )}

        {/* CANVAS - Note: touch-none added to prevent mobile scrolling while dragging */}
        <div ref={containerRef} className={`absolute inset-0 z-10 touch-none ${hasStarted ? 'pointer-events-auto' : 'pointer-events-none'}`} />

        {/* RETRACTION LIST */}
        <div className={`absolute bottom-6 right-6 z-30 flex gap-2 overflow-x-auto no-scrollbar pb-2 pointer-events-auto transition-all duration-500 ${isSidebarOpen ? 'left-6 md:left-[19.5rem]' : 'left-6'}`} style={{ scrollbarWidth: 'none' }}>
            <SharedWorkspaceSlider 
                nodes={workspace}
                startNodeId={levelData.metadata.start_node}
                targetNodeId={targetNodeId}
                onLocate={handleLocateNode}
                onRetract={retractNode}
                hideRetractForSpecialNodes={false}
                showSubtitles={true}
                targetLabel="Target (Bot)"
            />
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
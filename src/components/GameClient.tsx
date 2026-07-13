import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { NODE_COLORS, SPECIAL_NODE_COLORS, TYPE_MAP, type GameNode, type LevelData, type NodeVisuals, type UserLink } from '../types/game';
import { LegendModal } from './game/modals/LegendModal';
import { VictoryModal } from './game/modals/VictoryModal';
import { toast, ToastContainer } from './ui/Toast';
import { CenterViewIcon, ZoomOutIcon, ZoomInIcon, FullscreenEnterIcon, FullscreenExitIcon } from './ui/Icons';
import { useSidebar } from '../hooks/useSidebar';
import { SharedSidebar } from './SharedSidebar';
import { SharedWorkspaceSlider } from './SharedWorkspaceSlider';

interface Props {
  levelData: LevelData;
  intendedPath?: string[];
  timeLimit?: number; 
  onTimeout?: () => void; 
  onWin: (time: number) => void;
}

const GameClient: React.FC<Props> = ({ levelData, intendedPath, timeLimit, onTimeout, onWin }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  
  // Custom Sidebar Hook
  const { isSidebarOpen, toggleSidebar, closeSidebar } = useSidebar();

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
  const [timeDanger, setTimeDanger] = useState(false); 
  const timerRef = useRef<number | null>(null);

  // React State
  const [workspaceNodes, setWorkspaceNodes] = useState<GameNode[]>([]);
  const [warehouseNodes, setWarehouseNodes] = useState<GameNode[]>([]);
  const [userLinks, setUserLinks] = useState<UserLink[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [tool, setTool] = useState<'select' | 'link'>('select');
  const [isWon, setIsWon] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [activeInfo, setActiveInfo] = useState<{name: string, type: number, x: number, y: number} | null>(null);
  const [uiPath, setUiPath] = useState<number[]>([levelData.metadata.start_node]);
  
  const [isFullscreen, setIsFullscreen] = useState(false);

  // --- HINT STATES ---
  const [hintsLeft, setHintsLeft] = useState(3);
  const [hintedNodeId, setHintedNodeId] = useState<number | null>(null);
  const [hintedEdgeId, setHintedEdgeId] = useState<string | null>(null);

  const stateRef = useRef({
    workspaceNodes: [] as GameNode[],
    userLinks: [] as UserLink[],
    tool: 'select' as 'select' | 'link',
    selectedNodeId: null as number | null,
    startTime: Date.now(),
    hintedNodeId: null as number | null,
    hintedEdgeId: null as string | null
  });

  // Sync state ref
  useEffect(() => {
    stateRef.current.userLinks = userLinks;
    stateRef.current.tool = tool;
    stateRef.current.selectedNodeId = selectedNodeId;
    stateRef.current.workspaceNodes = workspaceNodes;
    stateRef.current.hintedNodeId = hintedNodeId;
    stateRef.current.hintedEdgeId = hintedEdgeId;
  }, [userLinks, tool, selectedNodeId, workspaceNodes, hintedNodeId, hintedEdgeId]);

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

      app.ticker.add((ticker) => {
        if (!linkLayerRef.current) return;
        
        linkLayerRef.current.clear();
        
        // Draw User Links
        stateRef.current.userLinks.forEach(link => {
          const s = stateRef.current.workspaceNodes.find(n => n.id === link.sourceId);
          const t = stateRef.current.workspaceNodes.find(n => n.id === link.targetId);
          if (s && t && s.x != null && s.y != null && t.x != null && t.y != null) {
            linkLayerRef.current!.moveTo(s.x, s.y).lineTo(t.x, t.y)
              .stroke({ width: 4, color: 0x6366f1, alpha: 1 });
          }
        });

        // Draw Hinted Edge Guide
        if (stateRef.current.hintedEdgeId) {
            const [uId, vId] = stateRef.current.hintedEdgeId.split('::').map(Number);
            const s = stateRef.current.workspaceNodes.find(n => n.id === uId);
            const t = stateRef.current.workspaceNodes.find(n => n.id === vId);
            if (s && t && s.x != null && s.y != null && t.x != null && t.y != null) {
                const pulse = Math.sin(ticker.lastTime * 0.01) * 0.3 + 0.7; 
                linkLayerRef.current!.moveTo(s.x, s.y).lineTo(t.x, t.y)
                  .stroke({ width: 6, color: 0xf59e0b, alpha: pulse }); 
            }
        }

        // Draw Nodes
        stateRef.current.workspaceNodes.forEach(node => {
          const vis = spriteMap.current[node.id];
          if(vis && node.x != null && node.y != null) {
            vis.container.x = node.x;
            vis.container.y = node.y;
            
            const isCurrent = stateRef.current.selectedNodeId === node.id;
            const isTarget = node.id === levelData.metadata.end_node;
            const isStart = node.id === levelData.metadata.start_node;
            const isHinted = stateRef.current.hintedNodeId === node.id;

            let strokeColor = NODE_COLORS[node.type] || 0x334155;
            let strokeWidth = 2;

            if (isCurrent) {
                strokeColor = 0xf59e0b;
                strokeWidth = 6;
            } else if (isHinted) {
                const pulse = Math.sin(ticker.lastTime * 0.01) * 2 + 5;
                strokeColor = 0xf59e0b; 
                strokeWidth = pulse;
            } else if (isStart) {
                strokeColor = SPECIAL_NODE_COLORS.Start || 0xffffff;
                strokeWidth = 5;
            } else if (isTarget) {
                strokeColor = SPECIAL_NODE_COLORS.Target || 0x22d3ee;
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
      setHintedNodeId(null);
      setHintedEdgeId(null);

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

  // --- 4. HINT ALGORITHM ---
  const handleRequestHint = () => {
    if (hintsLeft <= 0 || !intendedPath || intendedPath.length === 0) {
      toast("No hints available or path missing!", "warning");
      return;
    }

    const allIntendedNodes = Array.from(new Set(intendedPath.flatMap(e => e.split('::').map(Number))));
    allIntendedNodes.push(levelData.metadata.start_node, levelData.metadata.end_node);

    const missingNodeId = allIntendedNodes.find(id => 
        !workspaceNodes.some(n => n.id === id) &&
        intendedPath.some(e => {
            const [u, v] = e.split('::').map(Number);
            return (u === id && workspaceNodes.some(n => n.id === v)) || 
                   (v === id && workspaceNodes.some(n => n.id === u));
        })
    );

    if (missingNodeId !== undefined) {
        const nodeToDeploy = levelData.nodes.find(n => n.id === missingNodeId);
        if (nodeToDeploy) {
            deployNode(nodeToDeploy);
            setHintedNodeId(missingNodeId);
            setHintsLeft(prev => prev - 1);
            setTimeout(() => handleLocateNode(missingNodeId), 150);
            return;
        }
    }

    const unlinkedEdge = intendedPath.find(edgeId => {
        const [u, v] = edgeId.split('::').map(Number);
        const bothDeployed = workspaceNodes.some(n => n.id === u) && workspaceNodes.some(n => n.id === v);
        const isLinked = userLinks.some(l => 
            (l.sourceId === u && l.targetId === v) || 
            (l.sourceId === v && l.targetId === u)
        );
        return bothDeployed && !isLinked;
    });

    if (unlinkedEdge) {
        setHintedEdgeId(unlinkedEdge);
        setHintsLeft(prev => prev - 1);

        const [uId, vId] = unlinkedEdge.split('::').map(Number);
        const nodeA = workspaceNodes.find(n => n.id === uId);
        const nodeB = workspaceNodes.find(n => n.id === vId);
        
        if (nodeA && nodeB && nodeA.x != null && nodeA.y != null && nodeB.x != null && nodeB.y != null) {
            const centerX = (nodeA.x + nodeB.x) / 2;
            const centerY = (nodeA.y + nodeB.y) / 2;
            viewportRef.current?.animate({
                position: { x: centerX, y: centerY },
                scale: 1.2,
                time: 500,
                ease: 'easeInOutCubic',
                removeOnInterrupt: true
            });
        }
        return;
    }

    toast("You have deployed and linked all optimal nodes! Connect the final path to win.", "success");
  };

  // --- 5. HANDLERS ---
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
          setHintedEdgeId(null); 
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
        onWin(finalTime); 
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

  const renderToolbar = () => (
    <>
        <button 
            onClick={() => {setTool('select'); stateRef.current.tool='select';}}
            className={`flex-1 md:flex-none px-4 py-2.5 md:px-5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${tool === 'select' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
        >
            Move
        </button>
        <div className="w-px h-6 bg-white/10 mx-1 md:mx-2 self-center shrink-0" />
        <button 
            onClick={() => {setTool('link'); stateRef.current.tool='link';}}
            className={`flex-1 md:flex-none px-4 py-2.5 md:px-5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${tool === 'link' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
        >
            Link {selectedNodeId && "(!)"}
        </button>
        <div className="w-px h-6 bg-white/10 mx-1 md:mx-2 self-center shrink-0" />
        <button 
            onClick={() => setIsLegendOpen(true)}
            className="px-4 py-2.5 md:px-5 rounded-xl text-xs font-black bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all flex-none shrink-0"
        >
            ⓘ
        </button>
        
        {/* DYNAMIC HINT BUTTON */}
        {intendedPath && intendedPath.length > 0 && (
            <>
                <div className="w-px h-6 bg-white/10 mx-1 md:mx-2 self-center shrink-0" />
                <button 
                    onClick={handleRequestHint}
                    disabled={hintsLeft <= 0}
                    className={`flex-1 md:flex-none px-4 py-2.5 md:px-5 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0
                      ${hintsLeft > 0 ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-500' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                >
                    💡 ({hintsLeft})
                </button>
            </>
        )}
    </>
  );

  return (
    <div ref={mainContainerRef} className="relative flex h-full w-full bg-slate-950 overflow-hidden font-sans">
      
      {/* 
        This single component replaces:
        1. The Mobile Overlay Backdrop
        2. The Sidebar UI
        3. The Search Filter Logic
        4. The "Show Sidebar" floating button
      */}
      <SharedSidebar 
        isOpen={isSidebarOpen}
        onToggle={toggleSidebar}
        onClose={closeSidebar}
        title="Warehouse"
        subtitle={`Available Nodes ${levelData.nodes.length}`}
        nodes={warehouseNodes}
        deployedNodeIds={workspaceNodes.map(n => n.id)}
        onDeploy={deployNode}
        onLocate={handleLocateNode}
        onRetract={retractNode}
      />

      {/* FIXED CANVAS WRAPPER */}
      <div className="flex-1 relative h-full w-full overflow-hidden transition-all duration-300">
        
        {/* PIXI CANVAS PINNED */}
        <div ref={containerRef} className="absolute inset-0 z-10 pointer-events-auto" />

        {/* DESKTOP TOOLBAR */}
        <div className="hidden md:flex absolute top-6 left-1/2 -translate-x-1/2 z-30 gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto w-max">
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
                <CenterViewIcon />
            </button>
            <button onClick={() => handleZoom('out')} title="Zoom Out" className="w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                <ZoomOutIcon />
            </button>
            <button onClick={() => handleZoom('in')} title="Zoom In" className="w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                <ZoomInIcon />
            </button>
            <button onClick={toggleFullscreen} title="Fullscreen" className={`w-10 h-10 md:w-11 md:h-11 ${isFullscreen ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/90 text-slate-400 border-white/10 hover:text-white hover:bg-slate-800'} border rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-95`}>
                {isFullscreen ? (
                  <FullscreenExitIcon />
                ) : (
                  <FullscreenEnterIcon />
                )}
            </button>
          </div>
        </div>

        {/* BOTTOM UI STACK */}
        <div className={`absolute bottom-4 md:bottom-6 right-4 md:right-6 z-30 flex flex-col gap-3 pointer-events-none transition-all duration-500 ${isSidebarOpen ? 'left-4 md:left-[19.5rem]' : 'left-4 md:left-6'}`}>
            
            {/* Retraction Bar */}
            <SharedWorkspaceSlider 
                nodes={workspaceNodes}
                startNodeId={levelData.metadata.start_node}
                targetNodeId={levelData.metadata.end_node}
                onLocate={handleLocateNode}
                onRetract={retractNode}
                hideRetractForSpecialNodes={true}
                showSubtitles={false}
            />

            {/* MOBILE TOOLBAR (Hidden on Desktop) */}
            <div className="md:hidden flex gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto w-full max-w-sm mx-auto overflow-x-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
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
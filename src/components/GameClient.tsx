import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { createNodeSprite, updateNodeVisuals } from '../utils/pixiRenderer';
import { initSimulation } from '../utils/simulation';
import { NODE_COLORS, type GameNode, type LevelData, type NodeVisuals, type UserLink } from '../types/game';
import { LegendModal } from './game/modals/LegendModal';
import { VictoryModal } from './game/modals/VictoryModal';

interface Props {
  // levelData: LevelData;
  shortestPath: string[];
  enhancedLevelData: LevelData;
  onWin: (time: number) => void;
}

const GameClient: React.FC<Props> = ({ shortestPath, enhancedLevelData, onWin }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Pixi/D3 Refs - These persist across renders
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const simulationRef = useRef<d3.Simulation<GameNode, undefined> | null>(null);
  const spriteMap = useRef<Record<string, NodeVisuals>>({});
  const nodeLayerRef = useRef<PIXI.Container | null>(null);
  const linkLayerRef = useRef<PIXI.Graphics | null>(null);

  //Timer state.
  const [timerDisplay, setTimerDisplay] = useState("00:00.0");
  const timerRef = useRef<number | null>(null);

  // React State
  const [workspaceNodes, setWorkspaceNodes] = useState<GameNode[]>([]);
  const [warehouseNodes, setWarehouseNodes] = useState<GameNode[]>([]);
  const [userLinks, setUserLinks] = useState<UserLink[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'link'>('select');
  const [isWon, setIsWon] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [activeInfo, setActiveInfo] = useState<{name: string, type: string, x: number, y: number} | null>(null);
  // This is already in your component
  const [uiPath, setUiPath] = useState<string[]>([enhancedLevelData.metadata.start_node]);

  // State Ref for Ticker (to avoid stale closures)
  const stateRef = useRef({
    workspaceNodes: [] as GameNode[],
    userLinks: [] as UserLink[],
    tool: 'select' as 'select' | 'link',
    selectedNodeId: null as string | null,
    startTime: Date.now()
  });

  // 1. ONE-TIME INITIALIZATION
  useEffect(() => {
    if (!containerRef.current) return;

    const app = new PIXI.Application();
    
    const setup = async () => {
      PIXI.Assets.setPreferences({
        preferWorkers: false,
        crossOrigin: 'anonymous',
      })
      await app.init({ 
        resizeTo: containerRef.current!, 
        backgroundColor: 0x020617, 
        antialias: true 
      });
      containerRef.current?.appendChild(app.canvas);
      appRef.current = app;

      const viewport = new Viewport({
        screenWidth: app.screen.width,
        screenHeight: app.screen.height,
        worldWidth: 2000,
        worldHeight: 2000,
        events: app.renderer.events
      });
      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000);
      viewportRef.current = viewport;

      linkLayerRef.current = new PIXI.Graphics();
      nodeLayerRef.current = new PIXI.Container();
      viewport.addChild(linkLayerRef.current, nodeLayerRef.current);

      // Initialize Simulation
      simulationRef.current = initSimulation([], []);

      // Ticker Loop
      app.ticker.add(() => {
        if (!linkLayerRef.current) return;

        if(simulationRef.current) {
          simulationRef.current!.tick();
        }
        
        // Draw Links
        linkLayerRef.current.clear();

        console.log("Drawing links:", stateRef.current.userLinks.length);

        stateRef.current.userLinks.forEach(link => {
          const s = stateRef.current.workspaceNodes.find(n => n.id === link.sourceId);
          const t = stateRef.current.workspaceNodes.find(n => n.id === link.targetId);
          if (s && t) {
            linkLayerRef.current!.moveTo(s.x!, s.y!).lineTo(t.x!, t.y!)
              .stroke({ width: 4, color: 0x6366f1, alpha: 1 });
          }
        });

        // Update Node Positions
        stateRef.current.workspaceNodes.forEach(node => {
          if (node.fx!== null) {
            console.log('Debug node:', node.id, ' is currently FIXED/LOCKED at fx:', node.fx, 'fy:', node.fy);
          }
          const visuals = spriteMap.current[node.id];
          if(visuals) {
            visuals.container.x = node.x!;
            visuals.container.y = node.y!;
            updateNodeVisuals(visuals.bg, node, stateRef.current.selectedNodeId === node.id, enhancedLevelData.metadata.end_node);
          }
        });
      });

      // Load Initial Nodes
      const startNode = enhancedLevelData.nodes.find(n => n.id === enhancedLevelData.metadata.start_node)!;
      const endNode = enhancedLevelData.nodes.find(n => n.id === enhancedLevelData.metadata.end_node)!;
      const others = enhancedLevelData.nodes.filter(n => n.id !== startNode.id && n.id !== endNode.id);
      
      setWorkspaceNodes([startNode, endNode]);
      setWarehouseNodes(others);
    };

    setup();

    return () => {
      app.destroy(true);
    };
  }, [enhancedLevelData]);

  // 2. SYNC EFFECT: Runs whenever workspaceNodes changes
  useEffect(() => {
    if (!simulationRef.current || !nodeLayerRef.current) return;

    stateRef.current.workspaceNodes = workspaceNodes;
    simulationRef.current.nodes(workspaceNodes);
    simulationRef.current.alpha(1).restart();

    // Add missing sprites
    workspaceNodes.forEach(node => {
      if (!spriteMap.current[node.id]) {
        const handleInteraction = (node: GameNode, e: PIXI.FederatedPointerEvent) => {
          console.log("Current tool is: ", stateRef.current.tool, "Selected Node ID: ", stateRef.current.selectedNodeId, "Clicked Node ID: ", node.id);
          console.log("Pointer down on: ", node.name, "(", node.id, ")");
          if (stateRef.current.tool === 'link') {
            handleLinkAttempt(node.id);
          } else {
            if (activeInfo !== null) return;
            showNodeInfo(node, spriteMap.current[node.id].container);

            node.fx = node.x;
            node.fy = node.y;

            const onMove = (event: PIXI.FederatedPointerEvent) => {
              if(!viewportRef.current || !simulationRef.current || !event.global) return;
              const movePos = viewportRef.current!.toWorld(event.global.x, event.global.y);
              node.fx = movePos.x;
              node.fy = movePos.y;
              simulationRef.current?.alpha(0.3).restart();
            };

            const onUp = () => {
              node.fx = null;
              node.fy = null;

              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
              // console.log("Pointer up on: ", node.name, "(", node.id, ")");
              // appRef.current?.stage.off('pointermove', onMove);
              // appRef.current?.stage.off('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            // appRef.current?.stage.on('pointermove', onMove);
            // appRef.current?.stage.on('pointerup', onUp);
          }
        };
        const visuals = createNodeSprite(node, handleInteraction);
        nodeLayerRef.current!.addChild(visuals.container);
        spriteMap.current[node.id] = visuals;
      }
    });

    // Remove old sprites
    Object.keys(spriteMap.current).forEach(id => {
      if (!workspaceNodes.find(n => n.id === id)) {
        nodeLayerRef.current!.removeChild(spriteMap.current[id].container);
        delete spriteMap.current[id];
      }
    });
  }, [workspaceNodes]);

  // Sync other refs
  useEffect(() => {
    stateRef.current.userLinks = userLinks;
    console.log("Links updated. Total Links: ", userLinks.length);
    stateRef.current.tool = tool;
    stateRef.current.selectedNodeId = selectedNodeId;
  }, [userLinks, tool, selectedNodeId]);

  useEffect(() => {
    if (isWon) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    // Start Timer
    stateRef.current.startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = (Date.now() - stateRef.current.startTime) / 1000;
      const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
      const seconds = (elapsed % 60).toFixed(1).padStart(4, '0');
      setTimerDisplay(`${minutes}:${seconds}`);
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isWon]); // Only re-run if isWon changes

  // 4. HANDLERS
  const handleLinkAttempt = (targetId: string) => {
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

      const linkExists = stateRef.current.userLinks.some(
        l => (l.sourceId === currentSelectedId && l.targetId === targetId) || 
             (l.sourceId === targetId && l.targetId === currentSelectedId)
      );

      if (linkExists) {
        alert("This connection already exists!");
        stateRef.current.selectedNodeId = null;
        setSelectedNodeId(null);
        return;
      }
      
      const nodeA = enhancedLevelData.nodes.find(n => n.id === currentSelectedId);
      const nodeB = enhancedLevelData.nodes.find(n => n.id === targetId);
      const isConnected = nodeA?.connections.includes(targetId) || nodeB?.connections.includes(currentSelectedId);

      console.log("Attempting link:", { 
        selected: stateRef.current.selectedNodeId, 
        target: targetId,
        tool: stateRef.current.tool 
      });

      if (isConnected) {
        const newLink = { sourceId: currentSelectedId, targetId };
        const updatedLinks = [...stateRef.current.userLinks, newLink];

        stateRef.current.userLinks = updatedLinks;
        stateRef.current.selectedNodeId = null;
        setSelectedNodeId(null);
        setUserLinks(updatedLinks);
        checkWinCondition(updatedLinks);
      } else {
        alert(`No direct connection found between ${nodeA?.name || currentSelectedId} and ${nodeB?.name || targetId}!`);
        stateRef.current.selectedNodeId = null;
        setSelectedNodeId(null);
      }
    }
  };

  const deployNode = (node: GameNode) => {
    setWorkspaceNodes(prev => [...prev, { ...node, x: 1000 + (Math.random() * 100), y: 1000 + (Math.random() * 100) }]);
    setWarehouseNodes(prev => prev.filter(n => n.id !== node.id));
  };

  const retractNode = (nodeId: string) => {
    if (nodeId === enhancedLevelData.metadata.start_node || nodeId === enhancedLevelData.metadata.end_node) return;
    const node = workspaceNodes.find(n => n.id === nodeId)!;
    setWarehouseNodes(prev => [...prev, node]);
    setWorkspaceNodes(prev => prev.filter(n => n.id !== nodeId));
    setUserLinks(prev => {
      const filtered = prev.filter(l => l.sourceId !== nodeId && l.targetId !== nodeId);
      stateRef.current.userLinks = filtered;
      return filtered;
    });
  };

  const checkWinCondition = (links: {sourceId: string, targetId: string}[]) => {
    console.log("current active links:", links);
    const adj = new Map<string, string[]>();
    links.forEach(l => {
      if (!adj.has(l.sourceId)) adj.set(l.sourceId, []);
      if (!adj.has(l.targetId)) adj.set(l.targetId, []);
      adj.get(l.sourceId)!.push(l.targetId);
      adj.get(l.targetId)!.push(l.sourceId);
    });

    const queue: [string, string[]][] = [[enhancedLevelData.metadata.start_node, [enhancedLevelData.metadata.start_node]]];
    const visited = new Set([enhancedLevelData.metadata.start_node]);
    
    while (queue.length > 0) {
      // 2. Destructure the current node AND the path taken so far
      const [curr, path] = queue.shift()!;
      
      if (curr === enhancedLevelData.metadata.end_node) {
        // 3. Update the UI state with the final path
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
          // 4. Push the neighbor AND the new path (existing path + neighbor)
          queue.push([neighbor, [...path, neighbor]]);
        }
      });
    }
  };

  const toggleSidebar = () => {
    const newState = !isSidebarOpen;
    setIsSidebarOpen(newState);
  };

  const handleZoom = (direction: 'in' | 'out') => {
    if (!viewportRef.current) return;
    const factor = direction === 'in' ? 1.2 : 0.8;
    viewportRef.current.animate({
      scale: viewportRef.current.scale.x * factor,
      time: 200,
    });
  };

  const showNodeInfo = (node: GameNode, container: PIXI.Container) => {
    if (tool !== 'select') return; // Only in Move mode

    viewportRef.current!.pause = true; 
    
    // Calculate screen position for the UI
    const screenPos = viewportRef.current!.toScreen(container.x, container.y);
    
    setActiveInfo({
      name: node.name,
      type: node.type,
      x: screenPos.x,
      y: screenPos.y
    });

    // Auto-disappear after 3 seconds
    setTimeout(() => {
      setActiveInfo(null);
      viewportRef.current!.pause = false;
    }, 3000);
  };

  return (
    <div className="flex h-full w-full bg-slate-950 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <div className={`absolute left-0 top-0 h-full border-r border-white/10 bg-slate-900 shadow-2xl z-40 transition-all duration-500 flex flex-col ${isSidebarOpen ? 'w-72 translate-x-0' : '-translate-x-full w-72'}`}>
          {/* Only show content if open */}
          {isSidebarOpen && (
              <>
                  <div className="p-5 border-b border-white/10 bg-slate-900/50 flex justify-between items-center">
                      <div>
                          <h2 className="text-white font-black uppercase tracking-tighter text-lg italic">Warehouse</h2>
                          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Available Nodes</p>
                      </div>
                      {/* HIDE BUTTON */}
                      <button onClick={toggleSidebar} className="text-slate-400 hover:text-white">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                      </button>
                  </div>
                  <div className="p-3">
                    <input 
                      type="text"
                      placeholder="Search anime, actors..."
                      className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-all"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-2 custom-scrollbar bg-slate-900/30">
                        {(() => {
                            const filteredNodes = warehouseNodes.filter(node => 
                                node.name.toLowerCase().includes(searchQuery.toLowerCase())
                            );

                            return filteredNodes.map(node => (
                                <div 
                                    key={node.id} 
                                    onClick={() => deployNode(node)} 
                                    className="bg-slate-800/50 border border-white/5 p-2 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-indigo-600 transition-all active:scale-95"
                                >
                                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-black flex-shrink-0 border border-white/10">
                                        {node.image && <img src={node.image} className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-[11px] font-bold truncate leading-tight">{node.name}</p>
                                        <p className="text-[8px] font-black uppercase tracking-widest" style={{color: `#${NODE_COLORS[node.type as keyof typeof NODE_COLORS]?.toString(16).padStart(6, '0')}`}}>
                                            {node.type}
                                        </p>
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                  </div>
              </>
          )}
      </div>

      {/* SHOW BUTTON (Visible when sidebar is closed) */}
      {!isSidebarOpen && (
          <button 
              onClick={toggleSidebar}
              className="absolute top-6 left-4 z-40 bg-indigo-600 text-white p-3 rounded-xl shadow-2xl hover:bg-indigo-500 transition-all"
          >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
          </button>
      )}

      {/* CANVAS AREA */}
      <div className="flex-1 relative transition-all duration-300">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl">
            <button 
                onClick={() => {setTool('select'); stateRef.current.tool='select';}}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'select' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                Move
            </button>
            <button 
                onClick={() => {setTool('link'); stateRef.current.tool='link';}}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'link' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
            >
                Link {selectedNodeId && "(!)"}
            </button>
            {/* NEW INFO BUTTON */}
            <button 
                onClick={() => setIsLegendOpen(true)}
                className="px-4 py-2.5 rounded-xl text-xs font-black bg-slate-800 text-slate-400 hover:text-white transition-all"
            >
                ⓘ
            </button>
        </div>

        <div ref={containerRef} className="w-full h-full" />

        {/* Floating Timer Overlay */}
        <div className="absolute top-6 right-6 z-30 flex flex-col items-end gap-3">
          <div className="bg-slate-900/90 border border-white/10 backdrop-blur-md px-4 py-2 rounded-xl shadow-2xl">
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Time Elapsed</p>
            <p className="text-xl font-mono text-white font-bold">{timerDisplay}</p>
          </div>
          {/* <Legend /> */}
          <button 
            onClick={() => handleZoom('in')}
            className="bg-slate-900/90 border border-white/10 p-3 rounded-xl hover:bg-indigo-600 transition shadow-lg text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
          </button>
          <button 
            onClick={() => handleZoom('out')}
            className="bg-slate-900/90 border border-white/10 p-3 rounded-xl hover:bg-indigo-600 transition shadow-lg text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4"/></svg>
          </button>
        </div>

        {/* Workspace Quick-List */}
        <div className="absolute bottom-6 left-6 right-6 z-30">
            <div className="flex gap-2 overflow-x-auto pb-1 pr-2">
                {workspaceNodes.map(node => (
                    <div key={node.id} className="flex-shrink-0 bg-slate-900/90 border border-white/10 pl-3 pr-2 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg">
                        <span className="text-[11px] text-white font-bold whitespace-nowrap">{node.name}</span>
                        {node.id !== enhancedLevelData.metadata.start_node && node.id !== enhancedLevelData.metadata.end_node && (
                            <button 
                                onClick={() => retractNode(node.id)}
                                className="w-5 h-5 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-xs"
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>

        {isWon && (
            <VictoryModal 
                onNext={() => window.location.href='/'} 
                time={parseFloat(timerDisplay)} 
                shortestPath={shortestPath} 
                userPath={uiPath}
                nodes={enhancedLevelData.nodes}
            />
        )}

        {isLegendOpen && <LegendModal onClose={() => setIsLegendOpen(false)} />}
      </div>

      {/* 3-Second Node Info Modal */}
      {activeInfo && (
        <div 
          className="absolute z-50 bg-slate-800 border border-indigo-500/50 p-3 rounded-lg shadow-2xl pointer-events-none animate-in fade-in zoom-in duration-200"
          style={{ left: `${activeInfo.x}px`, top: `${activeInfo.y - 80}px`, transform: 'translateX(-50%)' }}
        >
          <p className="text-white font-bold text-xs">{activeInfo.name}</p>
          <p className="text-indigo-400 font-black text-[9px] uppercase tracking-widest">{activeInfo.type}</p>
        </div>
      )}
    </div>
  );
};

export default GameClient;
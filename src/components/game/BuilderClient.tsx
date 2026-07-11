import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import { supabase, getLocalPlayerId } from '../../lib/supabase';
import { NODE_COLORS, SPECIAL_NODE_COLORS, TYPE_MAP, type GameNode, type NodeVisuals } from '../../types/game';
import { toast, ToastContainer } from '../ui/Toast';

interface Props {
  roomId: string;
}

type ToolType = 'move' | 'set_start' | 'set_target' | 'toggle_edge';

interface GraphEdge {
  id: string;
  source: GameNode;
  target: GameNode;
}

const BuilderClient: React.FC<Props> = ({ roomId }) => {
  // --- LAZY LOAD HANDSHAKE DATA ---
  const [builderData, setBuilderData] = useState<any>(null);
  const [dataError, setDataError] = useState(false);

  useEffect(() => {
      const stored = localStorage.getItem(`driftaku_pool_${roomId}`);
      if (stored) {
          setBuilderData(JSON.parse(stored));
      } else {
          setDataError(true);
      }
  }, [roomId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const mainContainerRef = useRef<HTMLDivElement>(null);
  
  // --- STATE ---
  const [workspace, setWorkspace] = useState<GameNode[]>([]);
  const [tool, setTool] = useState<ToolType>('move');
  const [startNodeId, setStartNodeId] = useState<number | null>(null);
  const [targetNodeId, setTargetNodeId] = useState<number | null>(null);
  
  // Edge States
  const [availableEdges, setAvailableEdges] = useState<GraphEdge[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [edgeSourceId, setEdgeSourceId] = useState<number | null>(null);
  
  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [infoModalNode, setInfoModalNode] = useState<GameNode | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [isModalExpanded, setIsModalExpanded] = useState(false);
  
  // Auto-Build Modal States
  const [isAutoBuildModalOpen, setIsAutoBuildModalOpen] = useState(false);
  const [abTotalNodes, setAbTotalNodes] = useState<number>(50);
  const [abPathLength, setAbPathLength] = useState<number>(5);
  const [abIsolated, setAbIsolated] = useState<number>(0);
  
  // Submission & Timer States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWaitingForOpponent, setIsWaitingForOpponent] = useState(false);
  const [isPreparingSolve, setIsPreparingSolve] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false); 
  const [timeLeft, setTimeLeft] = useState<number>(0);

  // Responsive default: close sidebar on mobile initial load
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  useEffect(() => {
    if (builderData) {
        setAbTotalNodes(builderData.config.maxNodes);
        setAbPathLength(Math.min(5, builderData.config.maxNodes));
        setTimeLeft(builderData.config.buildTime);
    }
  }, [builderData]);

  // --- REFS ---
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const simulationRef = useRef<d3.Simulation<GameNode, undefined> | null>(null);
  const nodeLayerRef = useRef<PIXI.Container | null>(null);
  const linkLayerRef = useRef<PIXI.Graphics | null>(null);
  const spriteMap = useRef<Record<number, NodeVisuals>>({});
  const targetZoomRef = useRef<number | null>(null);

  const stateRef = useRef({
    tool: 'move' as ToolType,
    startNodeId: null as number | null,
    targetNodeId: null as number | null,
    edgeSourceId: null as number | null,
    workspace: [] as GameNode[],
    availableEdges: [] as GraphEdge[],
    selectedEdges: [] as string[],
    isSolvable: false
  });

  useEffect(() => {
    if (abPathLength > abTotalNodes) setAbPathLength(abTotalNodes);
    if (abIsolated > abTotalNodes - abPathLength) setAbIsolated(abTotalNodes - abPathLength);
  }, [abTotalNodes, abPathLength, abIsolated]);

  // --- VALIDATION LOGIC ---
  const isSolvable = useMemo(() => {
    if (!startNodeId || !targetNodeId) return false;
    
    const adj = new Map<number, number[]>();
    selectedEdges.forEach(edgeId => {
        const [uStr, vStr] = edgeId.split('::');
        const u = Number(uStr);
        const v = Number(vStr);
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

  useEffect(() => {
    stateRef.current = { tool, startNodeId, targetNodeId, edgeSourceId, workspace, availableEdges, selectedEdges, isSolvable };
  }, [tool, startNodeId, targetNodeId, edgeSourceId, workspace, availableEdges, selectedEdges, isSolvable]);

  useEffect(() => {
    setIsModalExpanded(false);
  }, [infoModalNode]);

  // --- QUICK DEPLOY NEIGHBOR LOGIC ---
  const handleQuickAddNeighbor = (neighbor: GameNode) => {
      if (!infoModalNode || !builderData) return;
      const edgeId = [infoModalNode.id, neighbor.id].sort((a, b) => a - b).join('::');
      
      const isDeployed = workspace.some(n => n.id === neighbor.id);
      if (!isDeployed) {
          if (workspace.length >= builderData.config.maxNodes) {
              toast("Maximum graph size reached", "error");
              return;
          }
          const spawnX = (infoModalNode.x || 1000) + (Math.random() * 100 - 50);
          const spawnY = (infoModalNode.y || 1000) + (Math.random() * 100 - 50);
          
          setWorkspace(prev => [...prev, { ...neighbor, x: spawnX, y: spawnY, vx: 0, vy: 0 }]);
      }
      setSelectedEdges(prev => prev.includes(edgeId) ? prev : [...prev, edgeId]);
  };

  const unlinkedNeighbors = useMemo(() => {
      if (!infoModalNode || !builderData) return [];
      return builderData.nodes.filter((n: GameNode) => {
          if (!infoModalNode.connections.includes(n.id)) return false;
          const edgeId = [infoModalNode.id, n.id].sort((a, b) => a - b).join('::');
          if (selectedEdges.includes(edgeId)) return false;
          return true;
      }).sort((a: GameNode, b: GameNode) => {
          const aDep = workspace.some(w => w.id === a.id);
          const bDep = workspace.some(w => w.id === b.id);
          return aDep === bDep ? 0 : aDep ? -1 : 1;
      });
  }, [infoModalNode, selectedEdges, builderData, workspace]);

  // --- AUTO-GENERATE ALGORITHM ---
  const generateValidGraphData = (totalNodes: number, reqPathLength: number, reqIsolated: number) => {
    if (!builderData) throw new Error("Data missing");
    const allNodes: GameNode[] = builderData.nodes;

    const adj = new Map<number, number[]>();
    allNodes.forEach(n => {
        const validConns = n.connections.filter(cId => allNodes.some(a => a.id === cId));
        adj.set(n.id, validConns.sort(() => Math.random() - 0.5));
    });

    let sId = stateRef.current.startNodeId;
    let tId = stateRef.current.targetNodeId;

    const getPath = (start: number, end: number) => {
        if (start === end) return [start];
        const q = [start];
        const p = new Map<number, number | null>();
        p.set(start, null);
        while(q.length > 0) {
            const curr = q.shift()!;
            if (curr === end) break;
            (adj.get(curr) || []).forEach(n => {
                if (!p.has(n)) { p.set(n, curr); q.push(n); }
            });
        }
        if (!p.has(end)) return null;
        const path = [];
        let c: number | null = end;
        while(c) { path.push(c); c = p.get(c) ?? null; }
        return path.reverse();
    };

    let finalPathNodes: number[] = [];

    if (sId && tId) {
        const existingPath = getPath(sId, tId);
        if (existingPath) {
            finalPathNodes = existingPath;
        } else {
            tId = null;
        }
    }

    if (!sId || !adj.get(sId)?.length) {
        const validStarts = allNodes.filter(n => (adj.get(n.id)?.length || 0) > 0);
        if (validStarts.length === 0) throw new Error("No connected nodes available.");
        sId = validStarts[Math.floor(Math.random() * validStarts.length)].id;
        tId = null;
    }

    if (!tId) {
        const targetDepth = Math.max(1, reqPathLength - 1);
        const q = [sId];
        const depthMap = new Map<number, number>();
        depthMap.set(sId, 0);
        
        const candidates: number[] = [];
        let maxDepth = 0;
        
        while(q.length > 0) {
            const curr = q.shift()!;
            const d = depthMap.get(curr)!;
            maxDepth = Math.max(maxDepth, d);
            
            if (d === targetDepth) {
                candidates.push(curr);
                continue; 
            }
            
            (adj.get(curr) || []).forEach(n => {
                if (!depthMap.has(n)) { depthMap.set(n, d + 1); q.push(n); }
            });
        }
        
        if (candidates.length > 0) {
            tId = candidates[Math.floor(Math.random() * candidates.length)];
        } else {
            const deepestNodes = Array.from(depthMap.entries()).filter(([_, d]) => d === maxDepth).map(([n]) => n);
            tId = deepestNodes[Math.floor(Math.random() * deepestNodes.length)];
        }
        finalPathNodes = getPath(sId, tId) || [sId];
    }

    const webNodes = new Set<number>(finalPathNodes);
    const selectedEdgeSet = new Set<string>();

    for(let i=0; i<finalPathNodes.length - 1; i++) {
        selectedEdgeSet.add([finalPathNodes[i], finalPathNodes[i+1]].sort((a, b) => a - b).join('::'));
    }

    const targetRedHerrings = Math.max(0, totalNodes - finalPathNodes.length - reqIsolated);
    let herringsAdded = 0;
    
    while(herringsAdded < targetRedHerrings) {
        const potential = new Set<number>();
        webNodes.forEach(node => {
            (adj.get(node) || []).forEach(neighbor => {
                if (!webNodes.has(neighbor)) potential.add(neighbor);
            });
        });
        
        if (potential.size === 0) break;
        
        const cands = Array.from(potential);
        const pick = cands[Math.floor(Math.random() * cands.length)];
        const possibleParents = (adj.get(pick) || []).filter(n => webNodes.has(n));
        const parent = possibleParents[Math.floor(Math.random() * possibleParents.length)];
        
        webNodes.add(pick);
        selectedEdgeSet.add([pick, parent].sort((a, b) => a - b).join('::'));
        herringsAdded++;
    }

    const forbidden = new Set<number>(webNodes);
    webNodes.forEach(node => { (adj.get(node) || []).forEach(n => forbidden.add(n)); });
    
    const allowedPool = allNodes.filter(n => !forbidden.has(n.id)).sort(()=>Math.random()-0.5);
    const isolatedNodes = new Set<number>();
    
    const actualIsolatedCount = Math.min(reqIsolated, totalNodes - webNodes.size);
    for(let i=0; i<actualIsolatedCount && i<allowedPool.length; i++) {
        isolatedNodes.add(allowedPool[i].id);
    }
    
    const isoArray = Array.from(isolatedNodes);
    for(let i=0; i<isoArray.length; i++) {
        for(let j=i+1; j<isoArray.length; j++) {
            if (adj.get(isoArray[i])?.includes(isoArray[j])) {
                selectedEdgeSet.add([isoArray[i], isoArray[j]].sort((a, b) => a - b).join('::'));
            }
        }
    }

    const finalSet = new Set([...webNodes, ...isolatedNodes]);
    const newWorkspace: GameNode[] = [];
    allNodes.forEach(n => {
        if (finalSet.has(n.id)) {
            newWorkspace.push({ 
                ...n, 
                x: 1000 + (Math.random() * 400 - 200), 
                y: 1000 + (Math.random() * 400 - 200), 
                vx: 0, vy: 0 
            });
        }
    });

    return { 
      startNodeId: sId, 
      targetNodeId: tId, 
      workspace: newWorkspace, 
      selectedEdges: Array.from(selectedEdgeSet) 
    };
  };

  const handleExecuteAutoBuild = () => {
    setIsAutoBuildModalOpen(false);
    setIsGenerating(true);
    setTimeout(() => {
        try {
            const generated = generateValidGraphData(abTotalNodes, abPathLength, abIsolated);
            setStartNodeId(generated.startNodeId);
            setTargetNodeId(generated.targetNodeId);
            setWorkspace(generated.workspace);
            setSelectedEdges(generated.selectedEdges);
            setEdgeSourceId(null);
            setTool('move');
            handleCenterView();
        } catch (err) {
            console.error("Failed to auto-generate graph:", err);
            toast("Could not generate a valid graph with the current parameters.","error");
        } finally {
            setIsGenerating(false);
        }
    }, 500);
  };

  // --- TIMER LOGIC ---
  useEffect(() => {
    if (!builderData || builderData.config.buildTime === 0) return;
    if (isSubmitting || isWaitingForOpponent || isPreparingSolve || isGenerating) return;

    const timer = setInterval(() => {
        setTimeLeft(prev => {
            if (prev <= 1) {
                clearInterval(timer);
                forceSubmitOnTimeout();
                return 0;
            }
            return prev - 1;
        });
    }, 1000);

    return () => clearInterval(timer);
  }, [isSubmitting, isWaitingForOpponent, isPreparingSolve, isGenerating, builderData]);

  const forceSubmitOnTimeout = async () => {
    if (!builderData) return;
    setIsSubmitting(true);
    const { playerId } = getLocalPlayerId();
    
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!room) return;
    
    const isOwner = room.owner_id === playerId;
    const column = isOwner ? 'graph_a' : 'graph_b';

    let finalStart = stateRef.current.startNodeId;
    let finalTarget = stateRef.current.targetNodeId;
    let finalNodeIds = stateRef.current.workspace.map(n => n.id);
    let finalPath = stateRef.current.selectedEdges;

    if (!stateRef.current.isSolvable) {
        try {
            const defTotal = builderData.config.maxNodes;
            const defPath = Math.min(5, defTotal);
            const generated = generateValidGraphData(defTotal, defPath, 0);
            
            finalStart = generated.startNodeId;
            finalTarget = generated.targetNodeId;
            finalNodeIds = generated.workspace.map(n => n.id);
            finalPath = generated.selectedEdges;
            
            setStartNodeId(finalStart);
            setTargetNodeId(finalTarget);
            setWorkspace(generated.workspace);
            setSelectedEdges(finalPath);
        } catch (err) {
            console.error("Timeout fallback generation failed.", err);
            toast("Unable to generate a valid graph. Please try again.", "error");
        }
    }

    const graphPayload = {
        metadata: { start_node: finalStart, end_node: finalTarget },
        nodeIds: finalNodeIds, 
        intendedPath: finalPath        
    };

    const { error } = await supabase.from('rooms').update({ [column]: graphPayload }).eq('id', roomId);
    if (error) {
        toast("Failed to auto-submit graph.", "error");
        setIsSubmitting(false);
        return;
    }

    const { data: checkRoom } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (checkRoom?.graph_a && checkRoom?.graph_b) {
        prepareSolvePhaseRef.current(checkRoom);
    } else {
        setIsSubmitting(false);
        setIsWaitingForOpponent(true);
    }
  };

  // --- MANUAL SUBMISSION ---
  const prepareSolvePhaseRef = useRef<any>(null);
  prepareSolvePhaseRef.current = (roomData: any) => {
      setIsWaitingForOpponent(false);
      setIsPreparingSolve(true);

      setTimeout(() => {
          const { playerId } = getLocalPlayerId();
          const isOwner = roomData.owner_id === playerId;
          const opponentGraph = isOwner ? roomData.graph_b : roomData.graph_a;

          if (opponentGraph && builderData) {
              const fullOpponentNodes = builderData.nodes.filter((n: GameNode) => opponentGraph.nodeIds.includes(n.id));
              const readySolveData = {
                  metadata: opponentGraph.metadata,
                  nodes: fullOpponentNodes,
                  intendedPath: opponentGraph.intendedPath
              };

                const solveStorageKey = `driftaku_solve_${roomId}`;
                const solveStorageValue = JSON.stringify(readySolveData);

                const keysToDelete: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith('driftaku_solve_') && key !== solveStorageKey) {
                        keysToDelete.push(key);
                    }
                }
                keysToDelete.forEach(key => localStorage.removeItem(key));
                localStorage.setItem(solveStorageKey, solveStorageValue);
              
              if (isOwner && roomData.status !== 'solving') {
                  supabase.from('rooms').update({ status: 'solving' }).eq('id', roomId);
              }

              window.location.href = `/play/friends/${roomId}/solve`;
          }
      }, 2000); 
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const { playerId } = getLocalPlayerId();
    
    const { data: room } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    if (!room) {
        toast("Room error!", "warning");
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
        toast("Failed to submit graph.", "error");
        setIsSubmitting(false);
        return;
    }

    const { data: checkRoom } = await supabase.from('rooms').select('*').eq('id', roomId).single();
    
    if (checkRoom?.graph_a && checkRoom?.graph_b) {
        prepareSolvePhaseRef.current(checkRoom);
    } else {
        setIsSubmitting(false);
        setIsWaitingForOpponent(true);
    }
  };

  useEffect(() => {
    const channel = supabase.channel(`room_${roomId}_build`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
          if (payload.new.status === 'solving' || (payload.new.graph_a && payload.new.graph_b)) {
              prepareSolvePhaseRef.current(payload.new);
          }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);


  // --- FULLSCREEN & ZOOM & CENTER & LOCATE ---
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      mainContainerRef.current?.requestFullscreen().catch(err => console.error("Failed to enter fullscreen: ", err));
    } else document.exitFullscreen().catch((err) => { console.error("Failed to exit fullscreen: ", err)});
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

  const handleCenterView = () => {
      const vp = viewportRef.current;
      if (!vp) return;
      targetZoomRef.current = 1; 
      vp.animate({ position: { x: 1000, y: 1000 }, scale: 1, time: 400, ease: 'easeOutQuart', removeOnInterrupt: true });
  };

  const handleLocateNode = (nodeId: number) => {
      const vp = viewportRef.current;
      const node = stateRef.current.workspace.find(n => n.id === nodeId);
      if (!vp || !node || typeof node.x !== 'number' || typeof node.y !== 'number') return;
      
      const targetScale = 1.3;
      targetZoomRef.current = targetScale;
      vp.animate({ 
          position: { x: node.x, y: node.y }, 
          scale: targetScale, 
          time: 500, 
          ease: 'easeInOutCubic', 
          removeOnInterrupt: true 
      });
  };

  // --- INITIALIZE CANVAS ---
  useEffect(() => {
    if (!builderData || !containerRef.current || appRef.current) return;
    const app = new PIXI.Application();
    
    const init = async () => {
      await app.init({ resizeTo: containerRef.current!, backgroundColor: 0x020617, antialias: true });
      containerRef.current?.appendChild(app.canvas);
      appRef.current = app;

      const imageUrls = builderData.nodes.map((n : GameNode) => n.image).filter(Boolean) as string[];
      if (imageUrls.length >0) {
        try {
            await PIXI.Assets.load(imageUrls);
        } catch (e) {
            console.error("Failed to load PIXI assets.", e);
            toast("Some game assets couldn't be loaded. Please refresh and try again.", "error");
        }
      }

      const viewport = new Viewport({
        screenWidth: app.screen.width, screenHeight: app.screen.height,
        worldWidth: 2000, worldHeight: 2000, events: app.renderer.events
      });
      app.stage.addChild(viewport);
      viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000);
      
      viewport.on('wheel', () => { targetZoomRef.current = null; });
      viewport.on('drag-start', () => { targetZoomRef.current = null; });
      viewport.on('pinch-start', () => { targetZoomRef.current = null; });
      
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

        stateRef.current.workspace.forEach(node => {
          const vis = spriteMap.current[node.id];
          if (vis && node.x != null && node.y != null) {
            vis.container.x = node.x; vis.container.y = node.y;

            const isStart = stateRef.current.startNodeId === node.id;
            const isTarget = stateRef.current.targetNodeId === node.id;
            const isEdgeSource = stateRef.current.edgeSourceId === node.id;
            
            let strokeColor = NODE_COLORS[node.type] || 0x334155;
            let strokeWidth = 2;

            if (isEdgeSource) {
                strokeColor = 0xf59e0b; // Amber
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
    };

    init();
    return () => app.destroy(true);
  }, [builderData]);

  // --- SYNC WORKSPACE & EDGES ---
  useEffect(() => {
    if (!simulationRef.current || !nodeLayerRef.current) return;

    const currentEdges: GraphEdge[] = [];
    for (let i = 0; i < workspace.length; i++) {
        for (let j = i + 1; j < workspace.length; j++) {
            if (workspace[i].connections.includes(workspace[j].id)) {
                const edgeId = [workspace[i].id, workspace[j].id].sort((a, b) => a - b).join('::');
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

    Object.keys(spriteMap.current).forEach(idStr => {
      const id = Number(idStr);
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
          if (stateRef.current.startNodeId === node.id) {
              setStartNodeId(null);
          } else {
              setStartNodeId(node.id);
              if (stateRef.current.targetNodeId === node.id) setTargetNodeId(null);
          }
          setEdgeSourceId(null);
      } 
      else if (currentTool === 'set_target') {
          if (stateRef.current.targetNodeId === node.id) {
              setTargetNodeId(null);
          } else {
              setTargetNodeId(node.id);
              if (stateRef.current.startNodeId === node.id) setStartNodeId(null);
          }
          setEdgeSourceId(null);
      } 
      else if (currentTool === 'toggle_edge') {
          if (!stateRef.current.edgeSourceId) {
              setEdgeSourceId(node.id);
          } else {
              if (stateRef.current.edgeSourceId === node.id) {
                  setEdgeSourceId(null); return;
              }
              const edgeId = [stateRef.current.edgeSourceId, node.id].sort((a, b) => a - b).join('::');
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
      if (!builderData || workspace.length >= builderData.config.maxNodes) return;
      const spawnX = 1000 + (Math.random() * 200 - 100);
      const spawnY = 1000 + (Math.random() * 200 - 100);
      setWorkspace(prev => [...prev, { ...node, x: spawnX, y: spawnY, vx: 0, vy: 0 }]);
  };

  const retractNode = (nodeId: number) => {
      setWorkspace(prev => prev.filter(n => n.id !== nodeId));
      if (startNodeId === nodeId) setStartNodeId(null);
      if (targetNodeId === nodeId) setTargetNodeId(null);
      if (edgeSourceId === nodeId) setEdgeSourceId(null);
  };

  const isDeployed = (nodeId: number) => workspace.some(n => n.id === nodeId);
  
  const filteredNodes = useMemo(() => {
    if (!builderData) return [];
    return builderData.nodes.filter((n: GameNode) => {
        const typeStr = TYPE_MAP[n.type as keyof typeof TYPE_MAP] || "";
        return n.name.toLowerCase().includes(searchQuery.toLowerCase()) || typeStr.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [builderData, searchQuery]);

  // Helper method for rendering the core tools efficiently in Desktop/Mobile variants
  const renderToolbar = () => (
    <>
        <button 
            onClick={() => { setTool('move'); setEdgeSourceId(null); }}
            className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all ${tool === 'move' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
        >
            Move
        </button>
        <div className="w-px h-6 bg-white/10 mx-0.5 md:mx-1 self-center flex-shrink-0" />
        <button 
            onClick={() => { setTool('toggle_edge'); setEdgeSourceId(null); }}
            className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all ${tool === 'toggle_edge' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
        >
            Link {edgeSourceId !== null && "(!)"}
        </button>
        <div className="w-px h-6 bg-white/10 mx-0.5 md:mx-1 self-center flex-shrink-0" />
        <button 
            onClick={() => { setTool('set_start'); setEdgeSourceId(null); }}
            className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all ${tool === 'set_start' ? 'bg-white text-slate-900 shadow-lg shadow-white/20' : 'text-slate-400 hover:text-white'}`}
        >
            Start
        </button>
        <button 
            onClick={() => { setTool('set_target'); setEdgeSourceId(null); }}
            className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all ${tool === 'set_target' ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white'}`}
        >
            Target
        </button>
        <div className="w-px h-6 bg-white/10 mx-0.5 md:mx-1 self-center flex-shrink-0" />
        
        <button 
            onClick={() => setIsAutoBuildModalOpen(true)}
            disabled={isSubmitting || isGenerating}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-lg shadow-fuchsia-500/20 disabled:opacity-50"
        >
            Auto Build
        </button>

        <div className="w-px h-6 bg-white/10 mx-0.5 md:mx-1 self-center flex-shrink-0" />
        <button 
            onClick={() => setShowLegend(true)}
            className="flex-shrink-0 px-3 md:px-4 py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700"
        >
            ⓘ
        </button>
        <div className="w-px h-6 bg-white/10 mx-0.5 md:mx-1 self-center flex-shrink-0" />
        
        <button 
            onClick={handleSubmit}
            disabled={!isSolvable || isSubmitting || isGenerating}
            className={`flex-shrink-0 px-5 md:px-6 py-2.5 rounded-xl text-[11px] md:text-xs font-black uppercase tracking-widest transition-all 
              ${isSolvable ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-900 shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
        >
            {isSubmitting ? 'Wait...' : 'Submit'}
        </button>
    </>
  );

  if (dataError) return <div className="text-white text-center py-20 font-mono tracking-widest text-sm bg-slate-950 h-screen w-full flex items-center justify-center">Database handshake failed. Return to lobby.</div>;
  if (!builderData) return <div className="text-indigo-400 text-center py-20 animate-pulse uppercase tracking-widest font-bold text-xs bg-slate-950 h-screen w-full flex items-center justify-center">Unpacking drafting map...</div>;

  return (
    <div ref={mainContainerRef} className="relative flex h-full w-full font-sans bg-slate-950 overflow-hidden">
      
      {/* MOBILE OVERLAY BACKDROP */}
      <div 
          className={`md:hidden absolute inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setIsSidebarOpen(false)}
      />

      {/* SIDEBAR */}
      <div className={`absolute left-0 top-0 h-full border-r border-white/10 bg-slate-900 shadow-2xl z-40 transition-transform duration-500 flex flex-col w-[85vw] max-w-[320px] md:w-80 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {isSidebarOpen && (
          <>
            <div className="p-4 md:p-5 border-b border-white/10 bg-slate-900/50">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-white font-black uppercase tracking-tighter text-lg italic">Warehouse</h2>
                <button onClick={toggleSidebar} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                </button>
              </div>
              
              <div className="relative mb-4">
                <input 
                  type="text" placeholder="Search anime, actors..." 
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500 transition-colors shadow-inner"
                />
                <svg className="w-4 h-4 text-slate-500 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div className="flex justify-between items-end">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Available Nodes</span>
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">{workspace.length} / {builderData.nodes.length}</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar bg-slate-900/30">
              {filteredNodes.length === 0 && <p className="text-slate-500 text-xs text-center mt-10">No nodes found.</p>}
              {filteredNodes.map((node: GameNode) => {
                const deployed = isDeployed(node.id);
                const typeString = TYPE_MAP[node.type as keyof typeof TYPE_MAP] || "Unknown";
                const colorCode = `#${(NODE_COLORS[node.type] || 0xffffff).toString(16)}`;

                return (
                  <div 
                    key={node.id} 
                    className={`w-full flex items-center justify-between p-2 rounded-xl transition-all border
                      ${deployed ? 'bg-slate-900 border-white/10 opacity-70 hover:opacity-100 hover:border-indigo-500/50' : 'bg-slate-800/50 border-white/5 hover:bg-indigo-600 hover:border-indigo-400 cursor-pointer active:scale-95'}`}
                    onClick={() => { if (!deployed) deployNode(node); }}
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <div className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 ${deployed ? 'grayscale opacity-70' : 'bg-black'}`}>
                        {node.image && <img src={node.image} className="w-full h-full object-cover" />}
                      </div>
                      <div className={`flex-1 min-w-0 ${deployed ? 'opacity-70' : ''}`}>
                        <p className="text-white text-[11px] font-bold truncate leading-tight">{node.name}</p>
                        <p className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{color: colorCode}}>
                            {typeString}
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
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* CANVAS AREA */}
      <div className="flex-1 relative bg-slate-950 h-full w-full overflow-hidden transition-all duration-300">
        
        {/* PIXI CANVAS PINNED */}
        <div ref={containerRef} className="absolute inset-0 z-10 pointer-events-auto" />

        {/* SHOW MENU BUTTON (Visible when sidebar is closed) */}
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

        {/* INSTRUCTIONS & ZOOM CONTROLS */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6 z-30 flex flex-col items-end gap-3 pointer-events-none">
            
            {builderData.config.buildTime > 0 && (
              <div className="bg-slate-900/90 border border-white/10 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-xl shadow-2xl flex flex-col items-end pointer-events-auto">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Time Remaining</p>
                <p className={`text-lg md:text-xl font-mono font-bold leading-none mt-0.5 ${timeLeft <= 30 ? 'text-rose-400 animate-pulse' : 'text-white'}`}>
                    {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
                </p>
              </div>
            )}
            
            <div className="flex flex-col md:flex-row gap-2 pointer-events-auto">
                <button onClick={handleCenterView} title="Center View" className="w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all backdrop-blur-md shadow-lg active:scale-95">
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                </button>
                <button onClick={handleZoomOut} title="Zoom Out" className="w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all backdrop-blur-md shadow-lg active:scale-95">
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" transform="rotate(45 12 12) scale(0.8) translate(3 -3)" /><line x1="9" y1="12" x2="15" y2="12" strokeWidth="2" /></svg>
                </button>
                <button onClick={handleZoomIn} title="Zoom In" className="w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all backdrop-blur-md shadow-lg active:scale-95">
                    <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                </button>
                <button onClick={toggleFullscreen} title="Fullscreen" className={`w-10 h-10 md:w-11 md:h-11 ${isFullscreen ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-900/90 text-slate-400 border-white/10 hover:text-white hover:bg-slate-800'} border rounded-xl flex items-center justify-center transition-all backdrop-blur-md shadow-lg active:scale-95`}>
                    {isFullscreen ? (
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v4m0-4h4m11 5l-5-5m0 0v4m0-4h4M9 15l-5 5m0 0v-4m0 4h4m11-5l-5 5m0 0v-4m0 4h4" /></svg>
                    ) : (
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                    )}
                </button>
            </div>
        </div>

        {/* SUBMISSION INDICATOR (Not Solvable) */}
        {!isSolvable && !isWaitingForOpponent && !isPreparingSolve && !isGenerating && (
          <div className="absolute top-20 md:bottom-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none md:top-auto">
             <div className="bg-slate-900/90 text-slate-400 border border-white/10 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur-sm shadow-lg">
                Status: <span className="text-rose-400 ml-1">Path Disconnected</span>
             </div>
          </div>
        )}

        {/* BOTTOM UI STACK */}
        <div className="absolute bottom-4 md:bottom-6 left-4 md:left-6 right-4 md:right-6 z-30 flex flex-col gap-3 pointer-events-none">
            
            {/* RETRACTION LIST */}
            {workspace.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 pointer-events-auto w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                  {workspace.map(node => (
                      <div key={node.id} className="bg-slate-900/90 border border-white/10 pl-2 pr-1.5 py-1.5 md:pl-3 md:pr-2 md:py-2 rounded-xl flex items-center gap-2 md:gap-3 backdrop-blur-md shadow-lg shrink-0 cursor-pointer hover:bg-slate-800/90 transition-colors" onClick={() => handleLocateNode(node.id)}>
                            <div 
                                className="w-2 h-2 rounded-full flex-shrink-0" 
                                style={{backgroundColor: `#${(NODE_COLORS[node.type] || 0xffffff).toString(16).padStart(6, '0')}`}} 
                            />
                          <div className="flex flex-col pointer-events-none">
                            <span className="text-[11px] md:text-[12px] text-white font-bold whitespace-nowrap leading-tight">{node.name}</span>
                            <span className="text-[8px] font-bold uppercase tracking-widest mt-0.5" style={{color: startNodeId === node.id ? '#ffffff' : (targetNodeId === node.id ? '#06b6d4' : '#64748b')}}>
                                {startNodeId === node.id ? 'Start Node' : (targetNodeId === node.id ? 'Target Node' : 'Node')}
                            </span>
                          </div>
                          <button 
                              onClick={(e) => { e.stopPropagation(); retractNode(node.id); }}
                              title="Remove from Web"
                              className="w-5 h-5 md:w-6 md:h-6 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-xs md:text-sm font-bold ml-1"
                          >
                              ×
                          </button>
                      </div>
                  ))}
              </div>
            )}

            {/* MOBILE TOOLBAR (Hidden on Desktop) */}
            <div className="md:hidden flex gap-1 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl pointer-events-auto overflow-x-auto w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                {renderToolbar()}
            </div>
        </div>

        {/* LOADING OVERLAYS */}
        { (isWaitingForOpponent || isPreparingSolve || isGenerating || isSubmitting) && (
            <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
                <div className={`w-12 h-12 md:w-16 md:h-16 border-4 border-t-transparent rounded-full animate-spin mb-4 md:mb-6 ${isGenerating ? 'border-fuchsia-500' : 'border-indigo-500'}`}></div>
                <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter mb-2 text-center">
                    {isGenerating ? 'Generating Web...' : isPreparingSolve ? 'Intercepting Web...' : isSubmitting ? 'Submitting...' : 'Web Submitted!'}
                </h2>
                <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] md:text-sm text-center max-w-sm">
                    {isGenerating ? 'Finding optimal paths and red herrings' : isPreparingSolve ? "Downloading opponent's graph data" : isSubmitting ? 'Finalizing your creation' : "Waiting for opponent to finish..."}
                </p>
            </div>
        )}

        {/* AUTO-BUILD MODAL */}
        {isAutoBuildModalOpen && (
            <div className="absolute inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
                <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                    <button onClick={() => setIsAutoBuildModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                    
                    <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter mb-6">Auto-Build Setup</h2>

                    <div className="space-y-6">
                        <div>
                            <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                <span>Total Nodes</span>
                                <span className="text-white">{abTotalNodes} / {builderData.config.maxNodes}</span>
                            </div>
                            <input 
                                type="range" min={2} max={builderData.config.maxNodes} value={abTotalNodes}
                                onChange={(e) => setAbTotalNodes(Number(e.target.value))}
                                className="w-full accent-fuchsia-500"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                                <span>Target Path Length</span>
                                <span className="text-white">{abPathLength}</span>
                            </div>
                            <p className="text-[9px] text-slate-500 mb-2 leading-tight">*Ignored if Start & Target are already connected.</p>
                            <input 
                                type="range" min={2} max={abTotalNodes} value={abPathLength}
                                onChange={(e) => setAbPathLength(Number(e.target.value))}
                                className="w-full accent-indigo-500"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                <span>Isolated Clusters</span>
                                <span className="text-white">{abIsolated}</span>
                            </div>
                            <input 
                                type="range" min={0} max={Math.max(0, abTotalNodes - abPathLength)} value={abIsolated}
                                onChange={(e) => setAbIsolated(Number(e.target.value))}
                                className="w-full accent-emerald-500"
                            />
                        </div>

                        <div className="bg-slate-950 p-4 rounded-xl border border-white/5 flex justify-between items-center">
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Red Herrings</span>
                            <span className="text-lg font-black text-rose-400">{Math.max(0, abTotalNodes - abPathLength - abIsolated)}</span>
                        </div>
                    </div>

                    <button 
                        onClick={handleExecuteAutoBuild}
                        className="w-full mt-8 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black uppercase tracking-widest py-3.5 md:py-4 rounded-xl transition-colors shadow-lg shadow-fuchsia-500/20 active:scale-95"
                    >
                        Generate Web
                    </button>
                </div>
            </div>
        )}

        {/* INFO MODAL */}
        {infoModalNode && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
              <div className={`bg-slate-900 border border-white/10 rounded-3xl p-5 md:p-6 ${isModalExpanded ? 'max-w-md' : 'max-w-sm'} w-full shadow-2xl relative transition-all duration-300 flex flex-col max-h-[90vh]`}>
                  <button onClick={() => setInfoModalNode(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-colors shrink-0 z-10">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                  
                  {!isModalExpanded ? (
                      <div className="overflow-y-auto custom-scrollbar pr-1 pb-1">
                          <div className="w-24 h-24 md:w-28 md:h-28 mx-auto rounded-2xl overflow-hidden bg-black mb-4 md:mb-5 border-2 shadow-lg shrink-0 mt-4 md:mt-0" style={{borderColor: `#${(NODE_COLORS[infoModalNode.type] || 0xffffff).toString(16)}`}}>
                              {infoModalNode.image && <img src={infoModalNode.image} className="w-full h-full object-cover" />}
                          </div>
                          <h3 className="text-xl md:text-2xl font-bold text-white text-center mb-1 leading-tight">{infoModalNode.name}</h3>
                          <p className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-center mb-5 shrink-0" style={{color: `#${(NODE_COLORS[infoModalNode.type] || 0xffffff).toString(16)}`}}>
                              {TYPE_MAP[infoModalNode.type as keyof typeof TYPE_MAP] || "Unknown"}
                          </p>
                          
                          <div className="space-y-3 bg-slate-950 p-3 md:p-4 rounded-xl border border-white/5 shrink-0">
                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Workspace Links</span>
                                <span className="text-xs text-indigo-400 font-bold">{availableEdges.filter(e => e.id.includes(infoModalNode.id.toString())).length}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total Database Links</span>
                                <span className="text-xs text-emerald-400 font-bold">{infoModalNode.connections?.length || 0}</span>
                            </div>
                          </div>

                          <button 
                              onClick={() => setIsModalExpanded(true)}
                              className="w-full mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl transition-colors text-sm shrink-0 active:scale-95"
                          >
                              Suggest Connections
                          </button>
                          
                          <div className="flex gap-2 md:gap-3 mt-3 shrink-0">
                            <button 
                                onClick={() => { retractNode(infoModalNode.id); setInfoModalNode(null); }}
                                className="flex-1 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 font-bold py-3 rounded-xl transition-colors text-sm active:scale-95"
                            >
                                Retract
                            </button>
                            <button 
                                onClick={() => setInfoModalNode(null)}
                                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-xl transition-colors text-sm active:scale-95"
                            >
                                Close
                            </button>
                          </div>
                      </div>
                  ) : (
                      <div className="flex flex-col h-full overflow-hidden">
                          <div className="flex items-center gap-2 mb-4 shrink-0">
                              <button onClick={() => setIsModalExpanded(false)} className="text-slate-400 hover:text-white flex items-center gap-1 text-sm font-bold p-1 rounded-lg hover:bg-slate-800 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                  Back
                              </button>
                              <h3 className="text-base md:text-lg font-bold text-white ml-1">Add Connections</h3>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2 min-h-[300px]">
                              {unlinkedNeighbors.length === 0 && <p className="text-slate-500 text-center text-xs py-10 font-bold uppercase tracking-widest">No available connections</p>}
                              {unlinkedNeighbors.map((neighbor: GameNode) => {
                                  const isDep = workspace.some(n => n.id === neighbor.id);
                                  return (
                                      <div key={neighbor.id} className="flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                          <div className="flex items-center gap-3 min-w-0">
                                              <div className="w-10 h-10 rounded-lg bg-black overflow-hidden shrink-0 border border-white/10">
                                                 {neighbor.image && <img src={neighbor.image} className="w-full h-full object-cover" />}
                                              </div>
                                              <div className="min-w-0">
                                                  <p className="text-white text-[11px] font-bold truncate leading-tight">{neighbor.name}</p>
                                                  <p className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{color: `#${(NODE_COLORS[neighbor.type] || 0xffffff).toString(16)}`}}>
                                                      {TYPE_MAP[neighbor.type as keyof typeof TYPE_MAP] || "Unknown"} {isDep && <span className="text-slate-500 ml-1">• In Web</span>}
                                                  </p>
                                              </div>
                                          </div>
                                          <button 
                                             onClick={() => handleQuickAddNeighbor(neighbor)}
                                             className="ml-2 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all shrink-0 active:scale-95"
                                          >
                                             {isDep ? 'Link' : 'Deploy'}
                                          </button>
                                      </div>
                                  )
                              })}
                          </div>
                      </div>
                  )}
              </div>
          </div>
        )}

        {/* LEGEND MODAL */}
        {showLegend && (
          <div className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 pointer-events-auto">
              <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar">
                  <button onClick={() => setShowLegend(false)} className="absolute top-4 right-4 md:top-6 md:right-6 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-colors shrink-0">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                  
                  <h2 className="text-2xl md:text-3xl font-black text-white mb-6 uppercase tracking-tighter pr-8">Builder Guide</h2>
                  
                  <div className="space-y-5 md:space-y-6">
                      <section>
                          <h3 className="text-[10px] md:text-xs text-indigo-400 font-bold uppercase tracking-widest mb-3 border-b border-white/10 pb-2">Tools</h3>
                          <ul className="space-y-2 md:space-y-3 text-xs md:text-sm text-slate-300">
                              <li><strong className="text-white">Move:</strong> Drag nodes to organize your web. Click a node without dragging to see its details.</li>
                              <li><strong className="text-white">Link:</strong> Connect nodes. Click a source node (turns amber), then click a valid destination to select that path (turns bright purple).</li>
                              <li><strong className="text-white">Start / Target:</strong> Assign the puzzle's beginning (White) and end (Cyan).</li>
                          </ul>
                      </section>
                      
                      <section>
                          <h3 className="text-[10px] md:text-xs text-indigo-400 font-bold uppercase tracking-widest mb-3 border-b border-white/10 pb-2">Node Colors</h3>
                          <div className="grid grid-cols-2 gap-2 md:gap-3">
                              {Object.entries(TYPE_MAP).map(([typeKey, name]) => {
                                  const typeNum = Number(typeKey);
                                  const color = NODE_COLORS[typeNum] || 0xffffff;
                                  return (
                                      <div key={typeKey} className="flex items-center gap-2 md:gap-3 bg-slate-950 p-2 rounded-lg border border-white/5">
                                          <div className="w-2.5 h-2.5 md:w-3 md:h-3 rounded-full shadow-md shrink-0" style={{ backgroundColor: `#${color.toString(16)}` }}></div>
                                          <span className="text-[10px] md:text-xs font-bold text-slate-300 truncate">{name}</span>
                                      </div>
                                  );
                              })}
                          </div>
                      </section>
                  </div>

                  <button 
                      onClick={() => setShowLegend(false)}
                      className="w-full mt-6 md:mt-8 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-3.5 md:py-4 rounded-xl transition-colors shadow-lg shadow-indigo-500/20 active:scale-95"
                  >
                      Understood
                  </button>
              </div>
          </div>
        )}

      </div>

      <ToastContainer />
    </div>
  );
};

export default BuilderClient;
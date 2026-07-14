import { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import * as d3 from 'd3-force';
import type { GameNode, NodeVisuals } from '../types/game';

export interface UsePixiGraphOptions {
    containerNode: HTMLDivElement | null;
    viewportRef: React.MutableRefObject<Viewport | null>;
    imageUrls: string[];
    resetTargetZoom: () => void;
    
    // Physics Config
    chargeStrength?: number;
    collideRadius?: number;
    forceXStrength?: number;
    forceYStrength?: number;
    linkDistance?: number;
    simulationAlpha?: number;

    // Callbacks
    onDraw: (ticker: PIXI.Ticker, linkLayer: PIXI.Graphics, spriteMap: Record<number, NodeVisuals>) => void;
    onNodePointerDown: (node: GameNode, e: PIXI.FederatedPointerEvent) => void;

    // Graph State
    workspaceNodes: GameNode[];
    links: { source: number | string; target: number | string }[];
}

export function usePixiGraph({
    containerNode,
    viewportRef,
    imageUrls,
    resetTargetZoom,
    chargeStrength = -800,
    collideRadius = 80,
    forceXStrength = 0.02,
    forceYStrength = 0.02,
    linkDistance = 150,
    simulationAlpha = 1,
    onDraw,
    onNodePointerDown,
    workspaceNodes,
    links
}: UsePixiGraphOptions) {
    const appRef = useRef<PIXI.Application | null>(null);
    const simulationRef = useRef<d3.Simulation<GameNode, undefined> | null>(null);
    const nodeLayerRef = useRef<PIXI.Container | null>(null);
    const linkLayerRef = useRef<PIXI.Graphics | null>(null);
    const spriteMap = useRef<Record<number, NodeVisuals>>({});
    
    const [isEngineReady, setIsEngineReady] = useState(false);

    // Keep closures fresh to avoid restarting the ticker unecessarily
    const drawRef = useRef(onDraw);
    const ptrDownRef = useRef(onNodePointerDown);

    useEffect(() => { drawRef.current = onDraw; }, [onDraw]);
    useEffect(() => { ptrDownRef.current = onNodePointerDown; }, [onNodePointerDown]);

    // --- 1. CORE ENGINE & VIEWPORT INITIALIZATION ---
    useEffect(() => {
        if (!containerNode) return;
        
        let isMounted = true;
        let isInitialized = false;
        
        const app = new PIXI.Application();
        let resizeObserver: ResizeObserver | null = null;
        
        const setup = async () => {
            try {
                PIXI.Assets.setPreferences({ preferWorkers: false, crossOrigin: 'anonymous' });
                
                await app.init({ 
                    resizeTo: containerNode, 
                    backgroundColor: 0x020617, 
                    antialias: true,
                    resolution: Math.max(1, window.devicePixelRatio || 1),
                    autoDensity: true
                });

                isInitialized = true;

                if (!isMounted) { app.destroy(true); return; }

                containerNode.appendChild(app.canvas);
                appRef.current = app;

                if (imageUrls.length > 0) {
                    try { await PIXI.Assets.load(imageUrls); } 
                    catch (e) { console.warn("Some game assets couldn't be loaded."); }
                }

                if (!isMounted) { app.destroy(true); return; }

                const viewport = new Viewport({
                    screenWidth: containerNode.clientWidth,
                    screenHeight: containerNode.clientHeight,
                    worldWidth: 2000,
                    worldHeight: 2000,
                    events: app.renderer.events
                });
                
                app.stage.addChild(viewport);
                viewport.drag().pinch().wheel().decelerate().moveCenter(1000, 1000);
                
                viewport.on('zoomed', resetTargetZoom);
                viewport.on('drag-start', resetTargetZoom);
                viewport.on('pinch-start', resetTargetZoom);
                viewport.on('wheel', resetTargetZoom);
                
                viewportRef.current = viewport;

                resizeObserver = new ResizeObserver(() => {
                    if (appRef.current && viewportRef.current) {
                        appRef.current.resize();
                        viewportRef.current.resize(containerNode.clientWidth, containerNode.clientHeight);
                    }
                });
                resizeObserver.observe(containerNode);

                const linkLayer = new PIXI.Graphics();
                const nodeLayer = new PIXI.Container();
                linkLayerRef.current = linkLayer;
                nodeLayerRef.current = nodeLayer;
                viewport.addChild(linkLayer, nodeLayer);

                simulationRef.current = d3.forceSimulation<GameNode>([])
                    .force("charge", d3.forceManyBody().strength(chargeStrength))
                    .force("collide", d3.forceCollide().radius(collideRadius))
                    .force("center", d3.forceCenter(1000, 1000))
                    .force("x", d3.forceX(1000).strength(forceXStrength))
                    .force("y", d3.forceY(1000).strength(forceYStrength));

                app.ticker.add((ticker) => {
                    if (!linkLayerRef.current || !isMounted) return;
                    drawRef.current(ticker, linkLayerRef.current, spriteMap.current);
                });

                setIsEngineReady(true);
            } catch (err) {
                console.error("PIXI Setup Error: ", err);
            }
        };

        setup();

        return () => {
            isMounted = false;
            if (resizeObserver) resizeObserver.disconnect();
            if (isInitialized) app.destroy(true);
        };
    }, [containerNode, resetTargetZoom, chargeStrength, collideRadius, forceXStrength, forceYStrength, viewportRef]);

    // --- 2. DATA GRAPH SYNC ---
    useEffect(() => {
        if (!simulationRef.current || !nodeLayerRef.current || !isEngineReady) return;

        // DEFENSIVE FILTER: Prevent D3 crashes by ensuring all links have valid source/target nodes
        const nodeSet = new Set(workspaceNodes.map(n => n.id));
        const validLinks = links.filter(l => 
            nodeSet.has(Number(l.source)) && nodeSet.has(Number(l.target))
        );
        
        // Clone references safely for d3 mutation
        const d3Links = validLinks.map(l => ({ source: l.source, target: l.target }));
        
        simulationRef.current.nodes(workspaceNodes);
        simulationRef.current.force("link", d3.forceLink(d3Links).id((d: any) => d.id).distance(linkDistance));
        simulationRef.current.alpha(simulationAlpha).restart();

        workspaceNodes.forEach(node => {
            if (!spriteMap.current[node.id]) {
                const vis = createNodeSprite(node, (n, e) => ptrDownRef.current(n, e));
                vis.container.x = node.x || 1000 + (Math.random() * 200 - 100);
                vis.container.y = node.y || 1000 + (Math.random() * 200 - 100);
                
                nodeLayerRef.current!.addChild(vis.container);
                spriteMap.current[node.id] = vis;
            }
        });

        // Cleanup retracted nodes from the scene
        Object.keys(spriteMap.current).forEach(idStr => {
            const id = Number(idStr);
            if (!workspaceNodes.find(n => n.id === id)) {
                nodeLayerRef.current!.removeChild(spriteMap.current[id].container);
                delete spriteMap.current[id];
            }
        });
    }, [workspaceNodes, links, isEngineReady, linkDistance, simulationAlpha]);

    return { appRef, viewportRef, simulationRef, spriteMap, isEngineReady };
}

// Internal Helper for setting up PIXI components
function createNodeSprite(node: GameNode, onPointerDown: (node: GameNode, e: PIXI.FederatedPointerEvent) => void): NodeVisuals {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const icon = new PIXI.Graphics().circle(0, 0, 20).fill(0x1e293b);
    
    container.addChild(bg, icon);
    container.eventMode = 'static';
    container.cursor = 'pointer';

    container.on('pointerdown', (e) => {
        e.stopPropagation(); // Required for mobile so canvas dragging doesn't interfere
        onPointerDown(node, e);
    });

    if (node.image) {
        const tex = PIXI.Assets.get(node.image);
        if (tex) {
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5); 
            s.width = s.height = 60;
            const m = new PIXI.Graphics().circle(0, 0, 30).fill(0xffffff);
            s.mask = m; 
            container.addChild(m, s); 
            icon.visible = false;
        }
    }
    return { container, bg, icon };
}

// Extracted utility exposing the shared dragging loop to consumers
export function setupNodeDrag(
    node: GameNode, 
    e: PIXI.FederatedPointerEvent, 
    viewport: Viewport | null, 
    simulation: d3.Simulation<GameNode, undefined> | null,
    onDragEnd?: (hasDragged: boolean) => void
) {
    const startX = e.global.x; 
    const startY = e.global.y;
    let hasDragged = false;

    const onMove = (event: PIXI.FederatedPointerEvent) => {
        if(!viewport) return;
        if (Math.hypot(event.global.x - startX, event.global.y - startY) > 5) {
            hasDragged = true;
        }
        const movePos = viewport.toWorld(event.global.x, event.global.y);
        node.fx = movePos.x;
        node.fy = movePos.y;
        simulation?.alpha(0.3).restart();
    };

    const onUp = () => {
        node.fx = null;
        node.fy = null;
        if (viewport) {
            viewport.off('pointermove', onMove);
            viewport.off('pointerup', onUp);
            viewport.off('pointerupoutside', onUp);
        }
        if (onDragEnd) onDragEnd(hasDragged);
    };

    if (viewport) {
        viewport.on('pointermove', onMove);
        viewport.on('pointerup', onUp);
        viewport.on('pointerupoutside', onUp);
    }
}
import React, { useState, useMemo } from 'react';
import type { GameNode } from '../../../types/game';

interface Props {
    onNext: () => void;
    time: number;
    shortestPath?: (string | number)[];
    userPath: (string | number)[];
    nodes: GameNode[];
}

export const VictoryModal: React.FC<Props> = ({ onNext, time, shortestPath, userPath, nodes }) => {
    const [copied, setCopied] = useState(false);

    // 1. Resolve User Path Nodes
    const resolvedUserPath = userPath
        .map(id => nodes.find(n => n.id === Number(id)))
        .filter(Boolean) as GameNode[];

    // 2. Safely Resolve Optimal Path Nodes (Fixing the Edge vs Node bug)
    const resolvedOptimalPath = useMemo(() => {
        if (!shortestPath || shortestPath.length === 0) return [];
        
        // If it's an array of edges (e.g., "123::456")
        if (String(shortestPath[0]).includes('::')) {
            const startId = Number(userPath[0]);
            const endId = Number(userPath[userPath.length - 1]);
            
            const adj = new Map<number, number[]>();
            shortestPath.forEach(edge => {
                const [u, v] = String(edge).split('::').map(Number);
                if (!adj.has(u)) adj.set(u, []);
                if (!adj.has(v)) adj.set(v, []);
                adj.get(u)!.push(v);
                adj.get(v)!.push(u);
            });

            // BFS to reconstruct the sequential node path from the edges
            const queue: number[][] = [[startId]];
            const visited = new Set([startId]);
            
            while(queue.length > 0) {
                const path = queue.shift()!;
                const curr = path[path.length - 1];
                
                if (curr === endId) {
                    return path.map(id => nodes.find(n => n.id === id)).filter(Boolean) as GameNode[];
                }
                
                (adj.get(curr) || []).forEach(n => {
                    if (!visited.has(n)) {
                        visited.add(n);
                        queue.push([...path, n]);
                    }
                });
            }
            return [];
        } else {
            // Fallback if it was already an array of Node IDs
            return shortestPath.map(id => nodes.find(n => n.id === Number(id))).filter(Boolean) as GameNode[];
        }
    }, [shortestPath, userPath, nodes]);

    // 3. Logic Calculations
    const hasShortestPath = resolvedOptimalPath.length > 0;
    const isOptimal = hasShortestPath ? resolvedUserPath.length <= resolvedOptimalPath.length : true;
    const extraSteps = hasShortestPath ? Math.max(0, resolvedUserPath.length - resolvedOptimalPath.length) : 0;

    // Share functionality
    const handleShare = () => {
        const text = `I cleared today's Driftaku web in ${time.toFixed(1)}s using ${resolvedUserPath.length} nodes! 🕸️\nCan you beat my time? Play at driftaku.com`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // --- REUSABLE PATH RENDERER ---
    const renderPathVisualizer = (pathNodes: GameNode[], title: string, isOptimalTheme: boolean = false) => (
        <div className="mb-6 relative z-10">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${isOptimalTheme ? 'text-amber-400' : 'text-slate-500'}`}>
                {title}
            </p>
            <div className="bg-slate-950 border border-white/5 rounded-2xl p-3 flex gap-2 overflow-x-auto no-scrollbar items-center shadow-inner">
                {pathNodes.map((node, idx) => (
                    <React.Fragment key={idx}>
                        <div className="flex flex-col items-center shrink-0 w-14">
                            <div className={`w-10 h-10 rounded-full overflow-hidden border-2 bg-black mb-1 ${idx === 0 ? 'border-white' : idx === pathNodes.length - 1 ? 'border-cyan-400' : (isOptimalTheme ? 'border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'border-indigo-500/50')}`}>
                                {node.image ? <img src={node.image} className="w-full h-full object-cover" alt={node.name} /> : <div className="w-full h-full bg-slate-800" />}
                            </div>
                            <span className="text-[8px] text-slate-400 font-bold w-full text-center truncate px-1">
                                {node.name}
                            </span>
                        </div>
                        {idx < pathNodes.length - 1 && (
                            <svg className={`w-4 h-4 shrink-0 ${isOptimalTheme ? 'text-amber-600/50' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        )}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[100] p-4 sm:p-6">
            
            {/* Added max-h-[95vh] and overflow-y-auto to handle dual-path scrolling on mobile */}
            <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 p-6 sm:p-8 rounded-[2rem] shadow-2xl overflow-y-auto max-h-[95vh] custom-scrollbar animate-in fade-in zoom-in duration-300">
                
                <div className={`absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 blur-[80px] rounded-full pointer-events-none ${isOptimal ? 'bg-emerald-500/20' : 'bg-indigo-500/20'}`}></div>

                {/* Header */}
                <div className="text-center mb-8 relative z-10">
                    <div className="w-16 h-16 bg-slate-950 border border-white/10 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tighter uppercase">Web Cleared!</h2>
                    <p className="font-mono text-4xl font-black text-emerald-400 mt-3 drop-shadow-md">
                        {time.toFixed(2)}s
                    </p>
                </div>

                {/* User Path Visualizer */}
                {renderPathVisualizer(resolvedUserPath, "Your Drift Path")}

                {/* Stats & Feedback */}
                <div className="space-y-4 mb-8 relative z-10">
                    {hasShortestPath && (
                        <div className="flex justify-between items-end border-b border-white/5 pb-2 px-1">
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Efficiency</span>
                            <span className="text-xs font-mono text-slate-300">
                                <strong className="text-white">{resolvedUserPath.length}</strong> / {resolvedOptimalPath.length} Nodes
                            </span>
                        </div>
                    )}
                    
                    {hasShortestPath && (
                        <div className={`p-4 rounded-xl border flex gap-4 items-center ${isOptimal ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isOptimal ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                {isOptimal ? (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-white mb-0.5">
                                    {isOptimal ? "Perfect Drift" : "Scenic Route"}
                                </p>
                                <p className="text-xs text-slate-400 leading-snug">
                                    {isOptimal
                                        ? "You found the absolute most efficient path through the web. Legendary."
                                        : `You took ${extraSteps} extra step${extraSteps > 1 ? 's' : ''}. But hey, an anime fan loves filler arcs!`}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Optimal Path Visualizer (Revealed ONLY if user took extra steps) */}
                {hasShortestPath && !isOptimal && (
                    renderPathVisualizer(resolvedOptimalPath, "The Optimal Path", true)
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 relative z-10 mt-4">
                    <button 
                        onClick={handleShare} 
                        className={`flex-1 font-black uppercase tracking-widest py-3.5 rounded-xl transition-all text-xs border ${copied ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-slate-800 hover:bg-slate-700 text-white border-white/5'}`}
                    >
                        {copied ? 'Copied to Clipboard!' : 'Share Result'}
                    </button>
                    <button 
                        onClick={onNext} 
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-xs"
                    >
                        Return Home
                    </button>
                </div>
            </div>
        </div>
    );
};
import React, { useState } from 'react';
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

    // Map the raw IDs back to actual Node objects so we can display their images/names
    const resolvedPath = userPath
        .map(id => nodes.find(n => n.id === Number(id)))
        .filter(Boolean) as GameNode[];

    // Safely check for optimality only if shortestPath exists
    const hasShortestPath = shortestPath && shortestPath.length > 0;
    const isOptimal = hasShortestPath ? userPath.length <= shortestPath!.length : true;
    const extraSteps = hasShortestPath ? Math.max(0, userPath.length - shortestPath!.length) : 0;

    // Share functionality for organic growth
    const handleShare = () => {
        const text = `I cleared today's Driftaku web in ${time.toFixed(1)}s using ${userPath.length} nodes! 🕸️\nCan you beat my time? Play at driftaku.com`;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        // Use 'fixed' instead of 'absolute' to ensure it covers the whole screen even if scrolling occurs
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[100] p-4 sm:p-6">
            
            <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 p-6 sm:p-8 rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                
                {/* Decorative Background Glow */}
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

                {/* Path Visualizer */}
                <div className="mb-8 relative z-10">
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Your Drift Path</p>
                    <div className="bg-slate-950 border border-white/5 rounded-2xl p-3 flex gap-2 overflow-x-auto no-scrollbar items-center shadow-inner">
                        {resolvedPath.map((node, idx) => (
                            <React.Fragment key={idx}>
                                <div className="flex flex-col items-center shrink-0 w-14">
                                    <div className={`w-10 h-10 rounded-full overflow-hidden border-2 bg-black mb-1 ${idx === 0 ? 'border-white' : idx === resolvedPath.length - 1 ? 'border-cyan-400' : 'border-indigo-500/50'}`}>
                                        {node.image ? <img src={node.image} className="w-full h-full object-cover" alt={node.name} /> : <div className="w-full h-full bg-slate-800" />}
                                    </div>
                                    <span className="text-[8px] text-slate-400 font-bold w-full text-center truncate px-1">
                                        {node.name}
                                    </span>
                                </div>
                                {idx < resolvedPath.length - 1 && (
                                    <svg className="w-4 h-4 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                )}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                {/* Stats & Feedback */}
                <div className="space-y-4 mb-8 relative z-10">
                    {hasShortestPath && (
                        <div className="flex justify-between items-end border-b border-white/5 pb-2 px-1">
                            <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Efficiency</span>
                            <span className="text-xs font-mono text-slate-300">
                                <strong className="text-white">{userPath.length}</strong> / {shortestPath!.length} Nodes
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
                                        : `You took ${extraSteps} extra steps. But hey, an anime fan loves filler arcs!`}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 relative z-10">
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
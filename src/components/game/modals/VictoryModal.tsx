import React from 'react';
import type { GameNode } from '../../../types/game';

interface Props {
    onNext: () => void;
    time: number;
    shortestPath?: string[];
    userPath: string[];
    nodes: GameNode[];
}

export const VictoryModal: React.FC<Props> = ({ onNext, time, shortestPath, userPath }) => {
    const isOptimal = shortestPath ? userPath.length === shortestPath.length : false;
    const extraSteps = shortestPath ? userPath.length - shortestPath.length : 0;

    return (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-[100] p-6">
            <div className="max-w-md w-full bg-slate-900 border border-white/10 p-8 rounded-3xl shadow-2xl">
                <div className="text-center mb-6">
                    <h2 className="text-3xl font-black text-white tracking-tighter italic uppercase">Connection Established</h2>
                    <p className="text-indigo-400 font-bold text-lg mt-2">{time.toFixed(1)} seconds</p>
                </div>

                <div className="space-y-4 mb-8">
                    <div className="flex justify-between text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        <span>Your Drift: {userPath.length} nodes</span>
                        <span>Shortest: {shortestPath?.length || 0} nodes</span>
                    </div>
                    
                    <div className={`p-4 rounded-xl border ${isOptimal ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                            {isOptimal ? "Perfect Path" : "You took a detour"}
                        </p>
                        <p className="text-[11px] text-slate-300 font-medium">
                            {isOptimal
                                ? "You found the most efficient path through the web. Legendary status achieved."
                                : `You took ${extraSteps} extra steps. Try again for a cleaner drift!`}
                        </p>
                    </div>
                </div>

                <button onClick={onNext} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-2xl transition-all shadow-lg shadow-indigo-500/20">
                    Return Home
                </button>
            </div>
        </div>
    );
};
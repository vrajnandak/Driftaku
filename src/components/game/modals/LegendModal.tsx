import React from 'react';
import { NODE_COLORS, TYPE_MAP } from '../../../types/game';

interface Props {
    onClose: () => void;
}

export const LegendModal: React.FC<Props> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-slate-900 border border-white/10 p-8 rounded-[2.5rem] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar relative animate-in fade-in zoom-in duration-300"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-8 sticky top-0 bg-slate-900 pb-4 border-b border-white/5">
                    <h3 className="text-white font-black uppercase tracking-tighter text-xl italic">Field Guide</h3>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors bg-slate-800 p-2 rounded-full">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
                
                {/* How to Play Section */}
                <div className="space-y-6">
                    <div>
                        <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Core Mechanics</h4>
                        <div className="grid gap-4">
                            <div className="flex gap-4">
                                <div className="text-lg">🔗</div>
                                <div>
                                    <p className="text-white text-xs font-bold mb-1">Linking Entities</p>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">Select two nodes to form a bridge. Only connections verified by the anime database are permitted.</p>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-lg">🔎</div>
                                <div>
                                    <p className="text-white text-xs font-bold mb-1">Drift Discovery</p>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">Click a node to view its data. Use the Suggestion tool to expand your workspace.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Pro Tips Section */}
                    <div className="bg-slate-950 p-5 rounded-2xl border border-white/5">
                        <h4 className="text-white font-bold text-[10px] uppercase tracking-widest mb-3">Pro Drifter Tips</h4>
                        <ul className="space-y-2 text-[11px] text-slate-400 list-disc list-inside">
                            <li>Studios are great "hubs" for connecting popular franchises.</li>
                            <li>Voice Actors often bridge the gap between main characters.</li>
                            <li>Use the Search bar in the Warehouse to find specific VAs.</li>
                            <li>Don't forget to Retract nodes that lead to dead ends!</li>
                        </ul>
                    </div>

                    {/* Node Legend */}
                    <div>
                        <h4 className="text-white font-black uppercase tracking-widest text-[10px] mb-4">Node Classifications</h4>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(TYPE_MAP).map(([key, name]) => {
                                const typeNum = Number(key);
                                const color = NODE_COLORS[typeNum] || 0xffffff;
                                return (
                                    <div key={key} className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-white/5">
                                        <div className="w-3 h-3 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.2)]" style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}></div>
                                        <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">{name}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <button 
                    onClick={onClose} 
                    className="w-full mt-10 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                >
                    Back to Drift
                </button>
            </div>
        </div>
    );
};
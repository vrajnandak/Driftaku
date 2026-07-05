import React from 'react';
import { NODE_COLORS } from '../../../types/game';

interface Props {
    onClose: () => void;
}

export const LegendModal: React.FC<Props> = ({ onClose }) => (
    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100]" onClick={onClose}>
        <div className="bg-slate-900 border border-white/10 p-6 rounded-3xl shadow-2xl w-80 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-black uppercase tracking-widest text-xs">How to Play</h3>
                <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
            </div>
            
            <div className="space-y-4 mb-6 text-[11px] text-slate-400">
                <p>• <strong>Linking:</strong> Use the Link tool to connect related entities. Connections must exist in the database.</p>
                <p>• <strong>Discovery:</strong> Clicking a node reveals its name but triggers a <strong>3-second movement lock</strong>. During this window, you can click other nodes to reveal them without penalty.</p>
                <p>• <strong>Objective:</strong> Create a valid path of links from Start to Target.</p>
            </div>

            <div className="space-y-2 border-t border-white/10 pt-4">
                <h4 className="text-white font-black uppercase tracking-widest text-[10px] mb-2">Node Legend</h4>
                {Object.entries(NODE_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}></div>
                        <span className="text-[10px] text-slate-300 font-medium">{type}</span>
                    </div>
                ))}
            </div>
        </div>
    </div>
);
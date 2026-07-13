import React from 'react';
import { NODE_COLORS, type GameNode } from '../types/game';

interface SharedWorkspaceSliderProps {
    nodes: GameNode[];
    startNodeId?: number | null;
    targetNodeId?: number | null;
    onLocate: (nodeId: number) => void;
    onRetract: (nodeId: number) => void;
    
    // Configuration to handle the slight differences between the 3 views
    showSubtitles?: boolean;
    targetLabel?: string; 
    hideRetractForSpecialNodes?: boolean;
}

export const SharedWorkspaceSlider: React.FC<SharedWorkspaceSliderProps> = ({
    nodes,
    startNodeId,
    targetNodeId,
    onLocate,
    onRetract,
    showSubtitles = false,
    targetLabel = 'Target Node',
    hideRetractForSpecialNodes = false
}) => {
    if (!nodes || nodes.length === 0) return null;

    return (
        <div className="flex gap-2 overflow-x-auto pb-1 pointer-events-auto w-full" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {nodes.map(node => {
                const isStart = node.id === startNodeId;
                const isTarget = node.id === targetNodeId;
                const showRetract = hideRetractForSpecialNodes ? (!isStart && !isTarget) : true;

                return (
                    <div 
                        key={node.id} 
                        className="bg-slate-900/90 border border-white/10 pl-2 pr-1.5 py-1.5 md:pl-3 md:pr-2 md:py-2 rounded-xl flex items-center gap-2 md:gap-3 backdrop-blur-md shadow-lg shrink-0 cursor-pointer hover:bg-slate-800/90 transition-colors" 
                        onClick={() => onLocate(node.id)}
                    >
                        {/* Node Color Indicator (Unifies UI across all 3 files) */}
                        <div 
                            className="w-2 h-2 rounded-full flex-shrink-0" 
                            style={{backgroundColor: `#${(NODE_COLORS[node.type] || 0xffffff).toString(16).padStart(6, '0')}`}} 
                        />
                        
                        {/* Node Names & Dynamic Subtitles */}
                        <div className="flex flex-col pointer-events-none">
                            <span className="text-[11px] md:text-[12px] text-white font-bold whitespace-nowrap leading-tight">
                                {node.name}
                            </span>
                            
                            {showSubtitles && (
                                <span 
                                    className="text-[8px] font-bold uppercase tracking-widest mt-0.5" 
                                    style={{color: isStart ? '#ffffff' : (isTarget ? '#06b6d4' : '#64748b')}}
                                >
                                    {isStart ? 'Start Node' : (isTarget ? targetLabel : 'Node')}
                                </span>
                            )}
                        </div>

                        {/* Retract/Close Button */}
                        {showRetract && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); onRetract(node.id); }}
                                title="Remove from Web"
                                className="w-5 h-5 md:w-6 md:h-6 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all text-xs md:text-sm font-bold ml-1"
                            >
                                ×
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
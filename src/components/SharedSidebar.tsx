// src/components/SharedSidebar.tsx
import React, { useState } from 'react';
import { NODE_COLORS, TYPE_MAP, type GameNode } from '../types/game';

interface SharedSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  title: string;
  subtitle: React.ReactNode;
  nodes: GameNode[];
  deployedNodeIds: number[];
  onDeploy: (node: GameNode) => void;
  onLocate: (nodeId: number) => void;
  onRetract: (nodeId: number) => void;
}

export const SharedSidebar: React.FC<SharedSidebarProps> = ({
  isOpen,
  onToggle,
  onClose,
  title,
  subtitle,
  nodes,
  deployedNodeIds,
  onDeploy,
  onLocate,
  onRetract
}) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredNodes = nodes.filter(node => {
    const typeStr = TYPE_MAP[node.type as keyof typeof TYPE_MAP] || "";
    return node.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           typeStr.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <>
      {/* MOBILE OVERLAY BACKDROP */}
      <div 
          className={`md:hidden absolute inset-0 bg-black/60 backdrop-blur-sm z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={onClose}
      />

      {/* SIDEBAR */}
      <div className={`absolute left-0 top-0 h-full border-r border-white/10 bg-slate-900 shadow-2xl z-40 transition-transform duration-500 flex flex-col w-[85vw] max-w-[320px] md:w-72 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-4 md:p-5 border-b border-white/10 bg-slate-900/50 flex justify-between items-center">
              <div>
                  <h2 className="text-white font-black uppercase tracking-tighter text-lg italic">{title}</h2>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">{subtitle}</p>
              </div>
              <button onClick={onToggle} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
              </button>
          </div>
          <div className="p-3 bg-slate-900/50">
            <div className="relative">
              <input 
                type="text"
                placeholder="Search anime, actors..."
                className="w-full bg-slate-950 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all shadow-inner"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg className="w-4 h-4 text-slate-500 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          </div>
          
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex-1 overflow-y-auto p-3 pt-0 space-y-2 custom-scrollbar bg-slate-900/30">
                {filteredNodes.length === 0 && <p className="text-slate-500 text-xs text-center mt-10">No records found.</p>}
                
                {filteredNodes.map(node => {
                    const deployed = deployedNodeIds.includes(node.id);
                    const typeStr = TYPE_MAP[node.type as keyof typeof TYPE_MAP] || "Unknown";
                    const colorStr = `#${(NODE_COLORS[node.type] || 0xffffff).toString(16).padStart(6, '0')}`;
                    
                    return (
                        <div 
                        key={node.id} 
                        onClick={() => { if (!deployed) onDeploy(node); }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl transition-all border cursor-pointer active:scale-95
                            ${deployed ? 'bg-slate-900 border-white/10 opacity-70 hover:opacity-100 hover:border-indigo-500/50' : 'bg-slate-800/50 border-white/5 hover:bg-indigo-600 hover:border-indigo-400'}`}
                    >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                            <div className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 ${deployed ? 'grayscale opacity-70' : 'bg-black'}`}>
                                {node.image && <img src={node.image} alt={node.name} className="w-full h-full object-cover" />}
                            </div>
                            <div className={`flex-1 min-w-0 ${deployed ? 'opacity-70' : ''}`}>
                                <p className="text-white text-[11px] font-bold truncate leading-tight">{node.name}</p>
                                <p className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{color: colorStr}}>
                                    {typeStr}
                                </p>
                            </div>
                        </div>
                        {deployed && (
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onLocate(node.id); 
                                        if (window.innerWidth < 768) onClose(); 
                                    }}
                                    className="px-2.5 py-1.5 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors"
                                >
                                    Locate
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onRetract(node.id); }}
                                    className="px-2.5 py-1.5 bg-red-500/20 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors"
                                >
                                    Retract
                                </button>
                            </div>
                        )}
                    </div>
                )})}
            </div>
          </div>
      </div>

      {/* SHOW BUTTON (Visible when sidebar is closed) */}
      {!isOpen && (
          <button 
              onClick={onToggle}
              className="absolute top-4 left-4 md:top-6 md:left-6 z-40 bg-indigo-600 text-white p-3 rounded-xl shadow-2xl hover:bg-indigo-500 transition-all pointer-events-auto active:scale-95"
          >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
          </button>
      )}
    </>
  );
};
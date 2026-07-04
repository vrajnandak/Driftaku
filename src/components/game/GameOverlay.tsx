// import React from 'react';
// import { NODE_COLORS } from '../../types/game';

// interface OverlayProps {
//     seconds: number;
//     tool: 'select' | 'link';
//     setTool: (t: 'select' | 'link') => void;
//     selectedNodeId: string | null;
//     uiPath: string[];
// }

// export const GameOverlay: React.FC<OverlayProps> = ({ seconds, tool, setTool, selectedNodeId, uiPath }) => (
//     <>
//         {/* Timer */}
//         <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 font-mono text-xl text-white z-30">
//             {seconds.toFixed(1)}s
//         </div>

//         {/* Tool Selector */}
//         <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl">
//             <button onClick={() => setTool('select')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
//                 Move
//             </button>
//             <button onClick={() => setTool('link')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'link' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
//                 Link {selectedNodeId && "(!)"}
//             </button>
//         </div>

//         {/* Legend */}
//         <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 flex gap-2 flex-wrap justify-center pointer-events-none">
//             {Object.entries(NODE_COLORS).map(([type, color]) => (
//                 <div key={type} className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-md border border-white/5">
//                     <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}></div>
//                     <span className="text-[10px] text-slate-400 uppercase font-bold">{type}</span>
//                 </div>
//             ))}
//         </div>
//     </>
// );


import React from 'react';
import { NODE_COLORS } from '../../types/game';

interface OverlayProps {
    seconds: number;
    tool: 'select' | 'link';
    setTool: (t: 'select' | 'link') => void;
    selectedNodeId: string | null;
    uiPath: string[];
    levelData: any;
}

export const GameOverlay: React.FC<OverlayProps> = ({ seconds, tool, setTool, selectedNodeId, uiPath, levelData }) => (
    <>
        {/* Timer */}
        <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 font-mono text-xl text-white z-30">
            {seconds.toFixed(1)}s
        </div>

        {/* Tool Selector */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl">
            <button onClick={() => setTool('select')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'select' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                Move
            </button>
            <button onClick={() => setTool('link')} className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${tool === 'link' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                Link {selectedNodeId && "(!)"}
            </button>
        </div>

        {/* Legend */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-30 flex gap-2 flex-wrap justify-center pointer-events-none">
            {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-md border border-white/5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: `#${color.toString(16).padStart(6, '0')}` }}></div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">{type}</span>
                </div>
            ))}
        </div>

        {/* Workspace Path Breadcrumbs */}
        {/* <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2 overflow-x-auto max-w-[80%] no-scrollbar px-4">
             {uiPath.map((id, i) => (
                <div key={i} className="bg-slate-900/90 border border-white/10 px-3 py-2 rounded-xl flex items-center gap-3 backdrop-blur-md shadow-lg whitespace-nowrap">
                    <span className="text-[11px] text-white font-bold">{levelData.nodes.find((n:any) => n.id === id)?.name}</span>
                </div>
            ))}
        </div> */}
    </>
);
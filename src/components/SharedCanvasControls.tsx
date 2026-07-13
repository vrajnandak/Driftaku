import React from 'react';
import { CenterViewIcon, ZoomInIcon, ZoomOutIcon, FullscreenEnterIcon, FullscreenExitIcon } from './ui/Icons';

interface SharedCanvasControlsProps {
    onCenterView: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    
    // Allows overriding the flex direction if you ever want them stacked vertically
    className?: string; 
}

export const SharedCanvasControls: React.FC<SharedCanvasControlsProps> = ({
    onCenterView,
    onZoomIn,
    onZoomOut,
    isFullscreen,
    onToggleFullscreen,
    className = "flex flex-col md:flex-row gap-2 pointer-events-auto"
}) => {
    // Shared button styling (gives all your modes the hover/active states & blur effects)
    const btnClass = "w-10 h-10 md:w-11 md:h-11 bg-slate-900/90 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all backdrop-blur-md shadow-lg active:scale-95 shrink-0";

    return (
        <div className={className}>
            <button onClick={onCenterView} title="Center View" className={btnClass}>
                <CenterViewIcon />
            </button>
            <button onClick={onZoomOut} title="Zoom Out" className={btnClass}>
                <ZoomOutIcon />
            </button>
            <button onClick={onZoomIn} title="Zoom In" className={btnClass}>
                <ZoomInIcon />
            </button>
            <button 
                onClick={onToggleFullscreen} 
                title="Fullscreen" 
                className={`${btnClass} ${isFullscreen ? '!bg-indigo-600 !text-white !border-indigo-500' : ''}`}
            >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenEnterIcon />}
            </button>
        </div>
    );
};
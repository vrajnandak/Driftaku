import { useRef, useCallback, type RefObject } from 'react';
import type { Viewport } from 'pixi-viewport';

export function useViewportControls(viewportRef: RefObject<Viewport | null>) {
    const targetZoomRef = useRef<number | null>(null);

    const handleZoom = useCallback((direction: 'in' | 'out') => {
        const vp = viewportRef.current;
        if (!vp) return;
        const currentTarget = targetZoomRef.current || vp.scale.x;
        const target = direction === 'in' 
            ? Math.min(currentTarget * 1.5, 3) 
            : Math.max(currentTarget * 0.6, 0.2);
        
        targetZoomRef.current = target;
        vp.animate({ scale: target, time: 300, ease: 'easeOutQuart', removeOnInterrupt: true });
    }, [viewportRef]);

    const handleCenterView = useCallback(() => {
        const vp = viewportRef.current;
        if (!vp) return;
        
        targetZoomRef.current = 1; 
        vp.animate({
            position: { x: 1000, y: 1000 },
            scale: 1,
            time: 400,
            ease: 'easeOutQuart',
            removeOnInterrupt: true
        });
    }, [viewportRef]);

    const handleLocateCoords = useCallback((x: number, y: number) => {
        const vp = viewportRef.current;
        if (!vp) return;
        const targetScale = 1.3;
        targetZoomRef.current = targetScale;
        vp.animate({ 
            position: { x, y }, 
            scale: targetScale, 
            time: 500, 
            ease: 'easeInOutCubic', 
            removeOnInterrupt: true 
        });
    }, [viewportRef]);

    const resetTargetZoom = useCallback(() => {
        targetZoomRef.current = null;
    }, []);

    return { handleZoom, handleCenterView, handleLocateCoords, resetTargetZoom };
}
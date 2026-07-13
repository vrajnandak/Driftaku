import { useState, useEffect, type RefObject } from 'react';

export function useFullscreen(elementRef: RefObject<HTMLElement | null>) {
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            elementRef.current?.requestFullscreen().catch((err) => {
                console.error(err instanceof Error ? err.message : "Fullscreen failed");
            });
        } else {
            document.exitFullscreen().catch(err => console.error(err));
        }
    };

    return { isFullscreen, toggleFullscreen };
}
import React, { useState, useEffect } from 'react';
import GameClient from './../GameClient'; // Adjust path if needed
import type { LevelData } from '../../types/game'; // Adjust path if needed

interface Props {
  levelData: LevelData;
  intendedPath: string[];
  dbLoadTime: string;
  playDate: string | undefined;
}

const ArchiveGameWrapper: React.FC<Props> = ({ levelData, intendedPath, dbLoadTime, playDate }) => {
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [assetLoadTime, setAssetLoadTime] = useState<string>("0.00");

  useEffect(() => {
    let isMounted = true;
    
    const preloadAssets = async () => {
      const t0 = performance.now();
      
      // Extract all valid image URLs
      const imageUrls = levelData.nodes
        .map(n => n.image)
        .filter(Boolean) as string[];

      if (imageUrls.length === 0) {
        if (isMounted) setIsReady(true);
        return;
      }

      let loadedCount = 0;

      // Robust image loader with a fallback timeout so it never gets stuck
      const loadImage = (url: string) => {
        return new Promise((resolve) => {
          const img = new Image();
          let settled = false;
          const finish = () => {
              if (!settled) { settled = true; resolve(true); }
          };
          img.onload = finish;
          img.onerror = finish;
          setTimeout(finish, 5000); // 5s timeout fallback
          img.src = url;
        });
      };

      // Load all images concurrently
      const promises = imageUrls.map(async (url) => {
        await loadImage(url);
        loadedCount++;
        if (isMounted) {
          setProgress(Math.round((loadedCount / imageUrls.length) * 100));
        }
      });

      await Promise.all(promises);

      const t1 = performance.now();
      if (isMounted) {
        setAssetLoadTime((t1 - t0).toFixed(2));
        
        // Add a tiny 600ms delay so the user can visually register 100% before it switches
        setTimeout(() => {
          if (isMounted) setIsReady(true);
        }, 600);
      }
    };

    preloadAssets();

    return () => { isMounted = false; };
  }, [levelData]);

  const handleWin = (time: number) => {
    // You can handle saving archive scores locally or to DB here later if you want
    console.log(`Archive solved in ${time} seconds!`);
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-950">
      
      {!isReady ? (
        /* LOADING SCREEN OVERLAY */
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center bg-slate-950/80 backdrop-blur-md">
          <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in duration-500">
             
             {/* Spinning Loading Icon */}
             <div className="w-20 h-20 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-500/30 shadow-[0_0_50px_rgba(79,70,229,0.2)]">
                 <svg className="h-8 w-8 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
             </div>
             
             <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter mb-2">
                {progress === 100 ? 'Web Ready!' : 'Initializing Web...'}
             </h2>
             <p className="text-slate-400 text-xs uppercase tracking-widest font-bold mb-8">
                 Archive Date: {playDate}
             </p>

             {/* PROGRESS BAR */}
             <div className="w-full bg-slate-900 border border-white/10 p-5 md:p-6 rounded-2xl shadow-xl">
                 <div className="flex justify-between text-[10px] md:text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                     <span>Caching Assets</span>
                     <span className="text-indigo-400">{progress}%</span>
                 </div>
                 <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                     <div className="h-full bg-indigo-600 transition-all duration-200 ease-out" style={{ width: `${progress}%` }}></div>
                 </div>
             </div>

             {/* PERFORMANCE METRICS */}
             {progress === 100 && (
                 <div className="mt-6 flex justify-center gap-6 text-[9px] md:text-[10px] uppercase font-bold tracking-widest text-slate-500 animate-in fade-in duration-300">
                     <span title="Server Database Fetch Time">📡 DB: {dbLoadTime}ms</span>
                     <span title="Client Images Cache Time">🖼️ Assets: {assetLoadTime}ms</span>
                 </div>
             )}

          </div>
        </div>
      ) : (
        /* START GAME INSTANTLY ONCE LOADED */
        <GameClient 
          levelData={levelData} 
          intendedPath={intendedPath} 
          onWin={handleWin} 
        />
      )}
    </div>
  );
};

export default ArchiveGameWrapper;
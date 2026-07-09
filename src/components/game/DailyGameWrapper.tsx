import React, { useState, useEffect } from 'react';
import GameClient from '../GameClient';
import type { LevelData } from '../../types/game';
import { supabase } from '@/lib/supabase';

interface Props {
  levelData: LevelData;
  intendedPath: string[]; // Edge IDs
  dbLoadTime: string;     // Passed from Astro server
}

const DailyGameWrapper: React.FC<Props> = ({ levelData, intendedPath, dbLoadTime }) => {
  const [hasStarted, setHasStarted] = useState(false);
  
  // Loading States
  const [isReady, setIsReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [assetLoadTime, setAssetLoadTime] = useState<string>("0.00");

  const [leaderboard, setLeaderboard] = useState<any[]>([]);


  useEffect(() => {
    let isMounted = true;
    
    const preloadAssets = async () => {
      const t0 = performance.now();
      
      // Extract all valid image URLs from the nodes
      const imageUrls = levelData.nodes
        .map(n => n.image)
        .filter(url => url !== null && url !== undefined) as string[];

      if (imageUrls.length === 0) {
        if (isMounted) setIsReady(true);
        return;
      }

      let loadedCount = 0;

      // Standard browser image preloading ensures HTTP caching
      const loadImage = (url: string) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = url;
          img.onload = resolve;
          img.onerror = resolve; // Resolve anyway to avoid blocking the game for 1 failed image
        });
      };

      // Load all images concurrently and update progress
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
        setIsReady(true);
      }
    };

    preloadAssets();

    return () => { isMounted = false; };
  }, [levelData]);

  const handleWin = async (time: number) => {
    // PB Logic
    const key = `driftaku_pb_daily_${levelData.metadata.level || new Date().toISOString().split('T')[0]}`;
    const previousBest = localStorage.getItem(key);
    if (!previousBest || time < parseFloat(previousBest)) {
      localStorage.setItem(key, time.toString());
    }
    const playerName = localStorage.getItem('driftaku_player_name') || 'Guest';
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

    const { error } = await supabase.rpc('add_daily_score', { 
        p_date: today, 
        p_name: playerName, 
        p_time: time 
    });
    console.log("playerName:", playerName, " today:", today);
    if (error) console.error("Leaderboard update failed", error);

    // 3. Fetch Top 10
    const { data: updatedChallenge } = await supabase
        .from('daily_challenges')
        .select('results')
        .eq('play_date', today)
        .single();
    
    if (updatedChallenge) setLeaderboard(updatedChallenge.results);

    window.dispatchEvent(new CustomEvent('game-won', { detail: { time } }));
  };

  return (
    <div className="w-full h-full relative overflow-hidden group">
      {!hasStarted ? (
        /* START SCREEN OVERLAY */
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center">
          {/* Background Blur Effect */}
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md z-0"></div>
          
          <div className="relative z-10 w-full max-w-md animate-in fade-in zoom-in duration-500">
             
             {/* Icon */}
             <div className="w-24 h-24 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-500/30 shadow-[0_0_50px_rgba(79,70,229,0.2)]">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                 </svg>
             </div>
             
             <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Ready to Drift?</h2>
             <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed mb-8">
                 Connect the nodes in the shortest path. Your timer starts as soon as you click.
             </p>

             {/* LOADING OR START BUTTON */}
             {!isReady ? (
                 <div className="w-full bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-xl">
                     <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                         <span>Caching Assets</span>
                         <span className="text-indigo-400">{progress}%</span>
                     </div>
                     <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
                         <div className="h-full bg-indigo-600 transition-all duration-200" style={{ width: `${progress}%` }}></div>
                     </div>
                 </div>
             ) : (
                 <button 
                    onClick={() => setHasStarted(true)}
                    className="w-full group relative px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl shadow-indigo-500/20 active:scale-95 flex items-center justify-center gap-2"
                 >
                    Initialize Web
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                 </button>
             )}

             {/* PERFORMANCE METRICS LOG */}
             {isReady && (
                 <div className="mt-8 flex justify-center gap-6 text-[10px] uppercase font-bold tracking-widest text-slate-500">
                     <span title="Server Database Fetch Time">📡 DB: {dbLoadTime}ms</span>
                     <span title="Client Images Cache Time">🖼️ Assets: {assetLoadTime}ms</span>
                 </div>
             )}

          </div>
        </div>
      ) : (
        /* ACTIVE GAME */
        <GameClient 
          levelData={levelData} 
          intendedPath={intendedPath} 
          onWin={handleWin} 
        />
      )}
    </div>
  );
};

export default DailyGameWrapper;
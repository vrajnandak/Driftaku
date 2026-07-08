import React, { useState } from 'react';
import GameClient from '../GameClient';
import type { LevelData } from '../../types/game';

interface Props {
  levelData: LevelData;
  intendedPath: string[]; // Edge IDs
}

const DailyGameWrapper: React.FC<Props> = ({ levelData, intendedPath }) => {
  const [hasStarted, setHasStarted] = useState(false);

  const handleWin = (time: number) => {
    // PB Logic
    const key = `driftaku_pb_daily_${levelData.metadata.level}`;
    const previousBest = localStorage.getItem(key);
    if (!previousBest || time < parseFloat(previousBest)) {
      localStorage.setItem(key, time.toString());
    }
    window.dispatchEvent(new CustomEvent('game-won', { detail: { time } }));
  };

  return (
    <div className="w-full h-full relative overflow-hidden group">
      {!hasStarted ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-md z-0"></div>
          <div className="relative z-10 animate-in fade-in zoom-in duration-500">
             <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Ready to Drift?</h2>
             <p className="text-slate-400 text-sm max-w-xs mx-auto mb-10">Connect the anime web. Your timer starts on click.</p>
             <button 
                onClick={() => setHasStarted(true)}
                className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl active:scale-95"
             >
                Initialize Web
             </button>
          </div>
        </div>
      ) : (
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
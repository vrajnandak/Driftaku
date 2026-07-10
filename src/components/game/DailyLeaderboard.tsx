import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Score {
  name: string;
  time: number;
}

interface Props {
  initialResults: Score[];
  playDate: string;
}

const DailyLeaderboard: React.FC<Props> = ({ initialResults, playDate }) => {
  const [leaderboard, setLeaderboard] = useState<Score[]>(initialResults || []);

  useEffect(() => {
    // Listen for real-time updates to today's leaderboard
    const channel = supabase.channel('daily_leaderboard')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'daily_challenges', filter: `play_date=eq.${playDate}` },
        (payload) => {
          if (payload.new.results) {
            setLeaderboard(payload.new.results);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playDate]);

  return (
    <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl h-full flex flex-col">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
        <h2 className="text-lg font-black text-white uppercase tracking-tighter">Top Drifters</h2>
        <span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-2 py-1 rounded font-bold uppercase tracking-widest">Today</span>
      </div>

      {leaderboard.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 py-10">
          <svg className="w-12 h-12 text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No times yet.</p>
          <p className="text-[10px] text-slate-500 mt-1">Be the first to solve!</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
          {leaderboard.map((entry, idx) => (
            <div 
              key={idx} 
              className={`flex justify-between items-center p-3 rounded-xl border ${idx === 0 ? 'bg-amber-500/10 border-amber-500/30' : idx === 1 ? 'bg-slate-400/10 border-slate-400/30' : idx === 2 ? 'bg-amber-700/10 border-amber-700/30' : 'bg-slate-950 border-white/5'}`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`text-xs font-black ${idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-300' : idx === 2 ? 'text-amber-600' : 'text-slate-500'}`}>
                  #{idx + 1}
                </span>
                <span className="text-xs font-bold text-white truncate flex-1 min-w-0">{entry.name}</span>
              </div>
              <span className={`font-mono text-sm font-black shrink-0 ${idx === 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {entry.time.toFixed(2)}s
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyLeaderboard;
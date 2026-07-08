import React, { useEffect, useState } from 'react';
import { supabase, getLocalPlayerId } from '../../lib/supabase';
import GameClient from './../GameClient';

interface Props {
  roomId: string;
}

const FriendsSolveManager: React.FC<Props> = ({ roomId }) => {
  const [levelData, setLevelData] = useState<any>(null);
  const [intendedPath, setIntendedPath] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [myTime, setMyTime] = useState<number | null>(null);
  const [opponentTime, setOpponentTime] = useState<number | null>(null);
  const [matchResults, setMatchResults] = useState<any>(null);

  const { playerId } = getLocalPlayerId();

  // 1. INITIALIZE & LOAD GRAPH
  useEffect(() => {
    const loadGraph = () => {
      const storedData = localStorage.getItem(`driftaku_solve_${roomId}`);
      
      if (!storedData) {
        setError("Graph data lost. Please return to the lobby.");
        return;
      }

      try {
        const parsed = JSON.parse(storedData);
        
        // Inject names for the GameClient Header
        const startNode = parsed.nodes.find((n: any) => n.id === parsed.metadata.start_node);
        const endNode = parsed.nodes.find((n: any) => n.id === parsed.metadata.end_node);
        
        parsed.metadata.start_name = startNode?.name || 'Start';
        parsed.metadata.end_name = endNode?.name || 'Target';
        
        setLevelData(parsed);
        // Extract intendedPath so the GameClient knows the exact edges required to win
        setIntendedPath(parsed.intendedPath || []); 
      } catch (err) {
        setError("Failed to parse opponent's graph.");
      }
    };

    loadGraph();
  }, [roomId]);

  // 2. REAL-TIME SUBSCRIPTION FOR RESULTS
  useEffect(() => {
    const channel = supabase.channel(`room_${roomId}_solve`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
          
          const results = payload.new.results;
          if (!results) return;

          // Check if both players have finished
          if (results.owner !== undefined && results.guest !== undefined) {
              setMatchResults({
                  ownerTime: results.owner,
                  guestTime: results.guest,
                  ownerId: payload.new.owner_id
              });
          }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId]);

  // 3. HANDLE WIN (Called by GameClient)
  const handleWin = async (finalTime: number) => {
      setMyTime(finalTime);

      // Identify if we are owner or guest
      const { data: room } = await supabase.from('rooms').select('owner_id, results').eq('id', roomId).single();
      if (!room) return;

      const isOwner = room.owner_id === playerId;
      const role = isOwner ? 'owner' : 'guest';
      
      // Update results JSON in Supabase
      const currentResults = room.results || {};
      const updatedResults = { ...currentResults, [role]: finalTime };

      await supabase.from('rooms').update({ results: updatedResults }).eq('id', roomId);

      // If opponent already finished, we can set results immediately
      if (updatedResults.owner !== undefined && updatedResults.guest !== undefined) {
          setMatchResults({
              ownerTime: updatedResults.owner,
              guestTime: updatedResults.guest,
              ownerId: room.owner_id
          });
      }
  };

  // Helper to clear stale game data when leaving
  const handleClearCacheAndLeave = () => {
      localStorage.removeItem(`driftaku_solve_${roomId}`);
      window.location.href = '/play/friends';
  };

  // --- RENDER STATES ---

  if (error) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 bg-slate-950 font-sans">
              <h2 className="text-2xl font-bold text-rose-500 mb-4 uppercase tracking-widest">Error Intercepting Graph</h2>
              <p className="text-slate-400 mb-8">{error}</p>
              <button onClick={handleClearCacheAndLeave} className="bg-slate-800 text-white px-6 py-3 rounded-xl hover:bg-slate-700 font-bold uppercase tracking-widest text-xs transition-colors">
                  Back to Lobby
              </button>
          </div>
      );
  }

  if (!levelData) {
      return <div className="flex items-center justify-center h-full bg-slate-950 text-indigo-400 font-bold uppercase tracking-widest text-xs animate-pulse">Initializing Web...</div>;
  }

  // --- SHOW MATCH RESULTS IF BOTH FINISHED ---
  if (matchResults) {
      const isOwner = matchResults.ownerId === playerId;
      const myFinalTime = isOwner ? matchResults.ownerTime : matchResults.guestTime;
      const opponentFinalTime = isOwner ? matchResults.guestTime : matchResults.ownerTime;
      
      const isWinner = myFinalTime < opponentFinalTime;
      const isTie = myFinalTime === opponentFinalTime;

      return (
          <div className="flex items-center justify-center h-full bg-slate-950 p-6 font-sans">
              <div className="max-w-md w-full bg-slate-900 border border-white/10 p-8 rounded-3xl text-center shadow-2xl relative overflow-hidden">
                  
                  {/* Decorative background glow based on win/loss */}
                  <div className={`absolute -top-20 -left-20 w-40 h-40 blur-3xl rounded-full opacity-30 ${isWinner ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>

                  <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-2 relative z-10">
                      {isTie ? 'Draw!' : isWinner ? 'Victory!' : 'Defeated!'}
                  </h1>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mb-8 relative z-10">
                      {isWinner ? 'You solved the web faster.' : 'Your opponent out-drifted you.'}
                  </p>

                  <div className="space-y-4 mb-8 relative z-10">
                      {/* My Time */}
                      <div className={`flex justify-between items-center p-4 rounded-xl border ${isWinner ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-950 border-white/5'}`}>
                          <span className="font-bold text-white uppercase tracking-widest text-xs">You</span>
                          <span className={`font-mono text-xl ${isWinner ? 'text-emerald-400 font-black' : 'text-slate-300'}`}>
                              {myFinalTime.toFixed(2)}s
                          </span>
                      </div>

                      {/* Opponent Time */}
                      <div className={`flex justify-between items-center p-4 rounded-xl border ${!isWinner && !isTie ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-950 border-white/5'}`}>
                          <span className="font-bold text-slate-300 uppercase tracking-widest text-xs">Opponent</span>
                          <span className={`font-mono text-xl ${!isWinner && !isTie ? 'text-emerald-400 font-black' : 'text-slate-400'}`}>
                              {opponentFinalTime.toFixed(2)}s
                          </span>
                      </div>
                  </div>

                  <button 
                      onClick={handleClearCacheAndLeave} 
                      className="block w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-all relative z-10 shadow-lg shadow-indigo-500/20 text-sm"
                  >
                      Return to Lobby
                  </button>
              </div>
          </div>
      );
  }

  // --- SHOW WAITING SCREEN IF I WON BUT OPPONENT IS STILL PLAYING ---
  if (myTime) {
      return (
          <div className="flex items-center justify-center h-full bg-slate-950 p-6 font-sans">
              <div className="text-center">
                  <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Web Solved!</h2>
                  <p className="text-3xl font-mono text-emerald-400 mb-8 font-bold">{myTime.toFixed(2)}s</p>
                  
                  <div className="inline-flex items-center gap-3 bg-slate-900 border border-white/10 px-6 py-4 rounded-full shadow-xl">
                      <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Waiting for opponent...</span>
                  </div>
              </div>
          </div>
      );
  }

  // --- SHOW THE ACTUAL GAME ---
  return (
      <div className="h-full w-full relative">
          <GameClient 
              levelData={levelData} 
              intendedPath={intendedPath} 
              onWin={handleWin} 
          />
      </div>
  );
};

export default FriendsSolveManager;
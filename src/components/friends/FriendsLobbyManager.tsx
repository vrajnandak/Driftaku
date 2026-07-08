import React, { useEffect, useState, useRef } from 'react';
import { supabase, getLocalPlayerId } from '../../lib/supabase';

interface Props {
  roomId: string;
}

const FriendsLobbyManager: React.FC<Props> = ({ roomId }) => {
  const [room, setRoom] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [isPoolReady, setIsPoolReady] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);

  const { playerId } = getLocalPlayerId();
  const poolFetchedRef = useRef(false);

  useEffect(() => {
    const fetchAndJoinRoom = async () => {

      // 1. Fetch room from database
      let { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      
      if (error || !data) {
        alert("Room not found or expired!");
        window.location.href = '/play/friends';
        return;
      }

      // 2. Check if this browser is the owner
      const isRoomOwner = data.owner_id === playerId;
      setIsOwner(isRoomOwner);

      // 3. If I am not in the room yet, join it!
      const playerExists = data.players.find((p: any) => p.id === playerId);
      
      if (!playerExists) {
        if (data.players.length >= 2) {
          alert("Room is full! Cannot join.");
          window.location.href = '/play/friends';
          return;
        }

        const savedName = localStorage.getItem('driftaku_player_name') || 'Guest Player';
        const newPlayer = { id: playerId, name: savedName.trim(), isOwner: false, isReady: true };
        const updatedPlayers = [...data.players, newPlayer];
        
        // Update the database
        const {error: updateError} = await supabase.from('rooms').update({ players: updatedPlayers }).eq('id', roomId);
        if (updateError) {
          console.error("Failed to join room:", updateError);
          alert("Failed to join room. Please try again.");
          window.location.href = '/play/friends';
          return;
        }
        data.players = updatedPlayers; // Update local copy
      }

      setRoom(data);
      setLoading(false);
    };

    fetchAndJoinRoom();

    // 4. SUBSCRIBE TO REAL-TIME CHANGES
    const channel = supabase
      .channel(`room_${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          console.log('Room updated from another player!', payload.new);
          setRoom(payload.new); // Instantly updates UI when Player B joins!
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, playerId]);

  useEffect(() => {
    if (!room || !room.pool_id || poolFetchedRef.current) return;
    poolFetchedRef.current = true; // Avoid duplicate fires
    setIsPoolLoading(true);

    const prefetchPool = async () => {
        // Fetch the raw 400-node drafting pool
        const { data, error } = await supabase.from('draft_pools').select('nodes_data').eq('id', room.pool_id).single();
        
        if (error || !data) {
            setPoolError("Failed to cache nodes.");
            setIsPoolLoading(false);
            return;
        }

        // Apply lobby allowed node filters LOCALLY in the background
        const filteredNodes = data.nodes_data.filter((node: any) => {
            if (node.type === 0 && !room.config.allowedNodes.character) return false;
            if (node.type === 1 && !room.config.allowedNodes.voiceActor) return false;
            if (node.type === 2 && !room.config.allowedNodes.anime) return false;
            if (node.type === 3 && !room.config.allowedNodes.studio) return false;
            return true;
        });

        const preppedData = {
            config: room.config,
            nodes: filteredNodes
        };

        // Save prepped JSON data in local storage
        localStorage.setItem(`driftaku_pool_${roomId}`, JSON.stringify(preppedData));
        setIsPoolLoading(false);
        setIsPoolReady(true);
    };

    prefetchPool();
  }, [room]);

  const handleStartMatch = async () => {
    // Owner clicks start -> update database status
    await supabase.from('rooms').update({ status: 'building' }).eq('id', roomId);
  };

  // 5. Watch for status change to redirect BOTH players at the exact same time
  useEffect(() => {
    if (room?.status === 'building' && isPoolReady) {
      window.location.href = `/play/friends/${roomId}/build`;
    }
  }, [room?.status, isPoolReady]);

  if (loading) return <div className="text-white text-center py-20">Loading Room...</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-5 space-y-6">
        
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <h1 className="text-4xl font-mono font-black text-white tracking-[0.2em] mb-6">{roomId}</h1>
          
          {/* Show loader on owner's page if opponent is ready but pool isn't cached yet */}
          {room.status === 'building' && !isPoolReady ? (
              <div className="w-full py-4 text-center bg-slate-800 text-slate-400 font-bold uppercase tracking-widest rounded-xl animate-pulse text-xs">
                   Preparing sandbox nodes...
              </div>
          ) : (
              <button 
                onClick={handleStartMatch}
                disabled={!isOwner || room.players.length < 2 || isPoolLoading}
                className={`w-full py-4 rounded-xl font-black uppercase transition-all 
                  ${!isOwner ? 'bg-slate-800 text-slate-500' : 
                    room.players.length < 2 || isPoolLoading ? 'bg-indigo-600/50 text-indigo-200' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
              >
                {isPoolLoading ? 'Buffering Network Map...' : !isOwner ? 'Waiting for Owner...' : 'Start Match'}
              </button>
          )}

          {/* Background caching stats indicator */}
          <div className="mt-4 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-slate-500 px-2">
              <span>Client Cache</span>
              <span className={isPoolReady ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}>
                  {isPoolReady ? '● Ready (400 Nodes)' : poolError ? '❌ Error' : '○ Downloading...'}
              </span>
          </div>
        </div>

        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <h2 className="text-sm font-black text-slate-300 mb-4">Players ({room.players.length}/2)</h2>
          <div className="space-y-3">
            {room.players.map((player: any) => (
              <div key={player.id} className="flex justify-between bg-slate-950 p-4 rounded-2xl border border-white/5">
                <span className="font-bold text-white">
                  {player.name} {player.id === playerId ? '(You)' : ''}
                </span>
                {player.isOwner && <span className="text-indigo-400 text-xs uppercase">Owner</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-7">
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <h2 className="text-sm font-black text-slate-300 mb-6">Match Settings</h2>
          <div className="grid grid-cols-2 gap-6 text-white font-mono text-xs">
            <div>Build Time: {room.config.buildTime / 60} min</div>
            <div>Solve Time: {room.config.solveTime / 60} min</div>
            <div>Max Nodes: {room.config.maxNodes}</div>
            <div>Release Era: {room.config.yearRange.min} - {room.config.yearRange.max}</div>
            <div>Popularity: {room.config.popularity}</div>
          </div>
        </div>
      </div>
    </div>
  );
  // return (
  //   <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
  //     <div className="lg:col-span-5 space-y-6">
        
  //       <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
  //         <h1 className="text-4xl font-mono font-black text-white tracking-[0.2em] mb-6">{roomId}</h1>
  //         <button 
  //           onClick={handleStartMatch}
  //           disabled={!isOwner || room.players.length < 2}
  //           className={`w-full py-4 rounded-xl font-black uppercase transition-all 
  //             ${!isOwner ? 'bg-slate-800 text-slate-500' : 
  //               room.players.length < 2 ? 'bg-indigo-600/50 text-indigo-200' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
  //         >
  //           {!isOwner ? 'Waiting for Owner to Start...' : room.players.length < 2 ? 'Waiting for Opponent...' : 'Start Match'}
  //         </button>
  //       </div>

  //       {/* Dynamic Players List */}
  //       <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
  //         <h2 className="text-sm font-black text-slate-300 mb-4">Players ({room.players.length}/2)</h2>
  //         <div className="space-y-3">
  //           {room.players.map((player: any) => (
  //             <div key={player.id} className="flex justify-between bg-slate-950 p-4 rounded-2xl border border-white/5">
  //               <span className="font-bold text-white">
  //                 {player.name} {player.id === playerId ? '(You)' : ''}
  //               </span>
  //               {player.isOwner && <span className="text-indigo-400 text-xs uppercase">Owner</span>}
  //             </div>
  //           ))}
  //         </div>
  //       </div>
  //     </div>

  //     {/* Settings Display (Read from Database) */}
  //     <div className="lg:col-span-7">
  //       <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
  //         <h2 className="text-sm font-black text-slate-300 mb-6">Match Settings</h2>
  //         <div className="grid grid-cols-2 gap-6 text-white font-mono">
  //           <div>Build Time: {room.config.buildTime / 60} min</div>
  //           <div>Solve Time: {room.config.solveTime / 60} min</div>
  //           <div>Max Nodes: {room.config.maxNodes}</div>
  //         </div>
  //       </div>
  //     </div>
  //   </div>
  // );
};

export default FriendsLobbyManager;
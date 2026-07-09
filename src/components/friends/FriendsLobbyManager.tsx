import React, { useEffect, useState, useRef } from 'react';
import { supabase, getLocalPlayerId, clearStalePools } from '../../lib/supabase';
import { toast, ToastContainer } from '../ui/Toast';

interface Props {
  roomId: string;
}

const FriendsLobbyManager: React.FC<Props> = ({ roomId }) => {
  const [room, setRoom] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  // Background Loading States
  const [isPoolLoading, setIsPoolLoading] = useState(false);
  const [isPoolReady, setIsPoolReady] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  
  // Performance & Asset States
  const [progress, setProgress] = useState(0);
  const [poolSize, setPoolSize] = useState(0);
  const [loadMetrics, setLoadMetrics] = useState<{db: string, assets: string} | null>(null);

  const { playerId } = getLocalPlayerId();
  const poolFetchedRef = useRef(false);

  // --- 1. JOIN ROOM & REALTIME SYNC ---
  useEffect(() => {
    const fetchAndJoinRoom = async () => {
      clearStalePools(roomId);
      let { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      
      if (error || !data) {
        toast("Room not found or expired!", "warning");
        window.location.href = '/play/friends';
        return;
      }

      const isRoomOwner = data.owner_id === playerId;
      setIsOwner(isRoomOwner);

      const playerExists = data.players.find((p: any) => p.id === playerId);
      
      if (!playerExists) {
        if (data.players.length >= 2) {
          toast("Room is full! Cannot join.", 'info');
          window.location.href = '/play/friends';
          return;
        }

        const savedName = localStorage.getItem('driftaku_player_name') || 'Guest Player';
        // NEW: Ensure all players (including guest) start with isCached: false
        const newPlayer = { id: playerId, name: savedName.trim(), isOwner: false, isCached: false };
        const updatedPlayers = [...data.players, newPlayer];
        
        const {error: updateError} = await supabase.from('rooms').update({ players: updatedPlayers }).eq('id', roomId);
        if (updateError) {
          console.error("Failed to join room:", updateError);
          toast("Failed to join room. Please try again.", "error");
          window.location.href = '/play/friends';
          return;
        }
        data.players = updatedPlayers; // Update local copy
      }

      setRoom(data);
      setLoading(false);
    };

    fetchAndJoinRoom();

    const channel = supabase
      .channel(`room_${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setRoom(payload.new); // Instantly updates UI
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, playerId]);

  // --- 2. BACKGROUND PRE-FETCH & ROBUST IMAGE CACHING ---
  useEffect(() => {
    // We bind this effect to room?.pool_id so it safely triggers once the pool is known
    if (!room?.pool_id || poolFetchedRef.current) return;
    
    let isMounted = true;
    poolFetchedRef.current = true; // Avoid duplicate fires
    setIsPoolLoading(true);

    const prefetchPool = async () => {
        const t0 = performance.now();
        const { data, error } = await supabase.from('draft_pools').select('nodes_data').eq('id', room.pool_id).single();
        const t1 = performance.now();
        const dbTime = (t1 - t0).toFixed(2);
        
        if (error || !data) {
            if (isMounted) setPoolError("Failed to fetch nodes from database.");
            if (isMounted) setIsPoolLoading(false);
            return;
        }

        const filteredNodes = data.nodes_data.filter((node: any) => {
            if (node.type === 0 && !room.config.allowedNodes.character) return false;
            if (node.type === 1 && !room.config.allowedNodes.voiceActor) return false;
            if (node.type === 2 && !room.config.allowedNodes.anime) return false;
            if (node.type === 3 && !room.config.allowedNodes.studio) return false;
            return true;
        });

        if (isMounted) setPoolSize(filteredNodes.length);

        const imageUrls = filteredNodes.map((n: any) => n.image).filter(Boolean);
        let loadedCount = 0;

        // FIXED: Robust Image Loader that cannot hang
        const loadImage = (url: string) => {
            return new Promise((resolve) => {
                const img = new Image();
                let isSettled = false;
                
                const finish = () => {
                    if (!isSettled) {
                        isSettled = true;
                        resolve(true);
                    }
                };

                img.onload = finish;
                img.onerror = finish;
                
                // Fallback: If browser stalls the network request, force resolve after 5s
                setTimeout(finish, 5000); 
                
                // Assign src LAST to prevent cache race conditions
                img.src = url; 
            });
        };

        // Load images
        const promises = imageUrls.map(async (url: string) => {
            await loadImage(url);
            loadedCount++;
            if (isMounted) {
                setProgress(Math.round((loadedCount / imageUrls.length) * 100));
            }
        });

        await Promise.all(promises);
        const t2 = performance.now();
        const assetTime = (t2 - t1).toFixed(2);

        if (isMounted) {
            const preppedData = { config: room.config, nodes: filteredNodes };
            localStorage.setItem(`driftaku_pool_${roomId}`, JSON.stringify(preppedData));
            
            setLoadMetrics({ db: dbTime, assets: assetTime });
            setIsPoolLoading(false);
            setIsPoolReady(true);
        }
    };

    prefetchPool();
    
    return () => { isMounted = false; };
  }, [room?.pool_id]);

  // --- 3. SYNC READINESS TO SUPABASE ---
  // When this client finishes caching, tell Supabase so the opponent knows!
  useEffect(() => {
      if (isPoolReady && room) {
          const markAsCached = async () => {
              // Fetch latest to prevent race condition overwrites
              const { data } = await supabase.from('rooms').select('players').eq('id', roomId).single();
              if (data) {
                  const updatedPlayers = data.players.map((p: any) => 
                      p.id === playerId ? { ...p, isCached: true } : p
                  );
                  await supabase.from('rooms').update({ players: updatedPlayers }).eq('id', roomId);
              }
          };
          markAsCached();
      }
  }, [isPoolReady]);

  // --- 4. HANDLE START MATCH ---
  const handleStartMatch = async () => {
    await supabase.from('rooms').update({ status: 'building' }).eq('id', roomId);
  };
  
  // --- COPY TO CLIPBOARD HANDLER ---
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast("Room code copied to clipboard!", "success"); // Show success toast
    } catch (err) {
      toast("Failed to copy room code.", "error");
    }
  };

  // --- 5. REDIRECT SYNC ---
  // Ensure we strictly redirect ONLY when status is building AND our local cache is ready
  useEffect(() => {
    if (room?.status === 'building' && isPoolReady) {
      window.location.href = `/play/friends/${roomId}/build`;
    }
  }, [room?.status, isPoolReady]);

  if (loading || !room) return <div className="text-white text-center py-20 font-mono tracking-widest text-xs animate-pulse">Loading Room...</div>;

  // STRICT START CONDITION: Exactly 2 players, and BOTH have isCached === true
  const allPlayersCached = room.players.length === 2 && room.players.every((p: any) => p.isCached === true);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-5 space-y-6">
        
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-mono font-black text-white tracking-[0.2em]">{roomId}</h1>
            <button 
              onClick={handleCopyCode}
              title="Copy Room Code"
              className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all active:scale-95 shadow-lg border border-white/5"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          
          {/* Action Button / Status */}
          {room.status === 'building' && !isPoolReady ? (
              <div className="w-full py-4 text-center bg-slate-800 text-slate-400 font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 text-xs">
                   <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
                   Buffering Assets ({progress}%)...
              </div>
          ) : (
              <button 
                onClick={handleStartMatch}
                disabled={!isOwner || !allPlayersCached || isPoolLoading}
                className={`w-full py-4 rounded-xl font-black uppercase transition-all 
                  ${!isOwner ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 
                    !allPlayersCached || isPoolLoading ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95'}`}
              >
                {isPoolLoading ? `Caching Images (${progress}%)` : 
                 !isOwner ? 'Waiting for Owner...' : 
                 room.players.length < 2 ? 'Waiting for Opponent...' : 
                 !allPlayersCached ? 'Waiting for Opponent to Load...' : 
                 'Start Match'}
              </button>
          )}

          {/* Background Caching Stats Indicator */}
          <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">
                  <span>Your Client Cache</span>
                  <span className={isPoolReady ? 'text-emerald-400' : poolError ? 'text-rose-400' : 'text-amber-400 animate-pulse'}>
                      {isPoolReady ? `● Ready (${poolSize} Nodes)` : poolError ? '❌ Error' : '○ Downloading...'}
                  </span>
              </div>
              
              {!isPoolReady && !poolError && (
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${progress}%` }}></div>
                  </div>
              )}

              {loadMetrics && (
                  <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-2">
                      <span title="Server Database Fetch Time">DB: {loadMetrics.db}ms</span>
                      <span title="Client Image Download Time">Img: {loadMetrics.assets}ms</span>
                  </div>
              )}
          </div>
        </div>

        {/* Dynamic Players List */}
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <h2 className="text-sm font-black text-slate-300 mb-4">Players ({room.players.length}/2)</h2>
          <div className="space-y-3">
            {room.players.map((player: any) => (
              <div key={player.id} className="flex justify-between items-center bg-slate-950 p-4 rounded-2xl border border-white/5">
                <div>
                    <span className="font-bold text-white">
                      {player.name} {player.id === playerId ? '(You)' : ''}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                        {player.isOwner && <span className="text-indigo-400 text-[9px] font-bold uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded">Owner</span>}
                        
                        {/* Status Indicator for each player */}
                        <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${player.isCached ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`}>
                            {player.isCached ? (
                                <><span>●</span> Ready</>
                            ) : (
                                <><span>○</span> Loading...</>
                            )}
                        </span>
                    </div>
                </div>
              </div>
            ))}
            {room.players.length < 2 && (
              <div className="flex items-center gap-3 border-2 border-dashed border-white/10 p-4 rounded-2xl opacity-50">
                <div className="w-8 h-8 rounded-full border-2 border-white/20 flex items-center justify-center">
                  <span className="animate-ping w-2 h-2 rounded-full bg-slate-400"></span>
                </div>
                <p className="text-sm font-bold text-slate-400">Waiting for player...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-7">
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <h2 className="text-sm font-black text-slate-300 mb-6">Match Settings</h2>
          <div className="grid grid-cols-2 gap-6 text-white font-mono text-xs">
            <div>Build Time: {room.config.buildTime > 0 ? `${room.config.buildTime / 60} min` : 'Unlimited'}</div>
            <div>Solve Time: {room.config.solveTime > 0 ? `${room.config.solveTime / 60} min` : 'Unlimited'}</div>
            <div>Max Nodes: {room.config.maxNodes}</div>
            <div>Release Era: {room.config.yearRange.min} - {room.config.yearRange.max}</div>
            <div>Popularity: {room.config.popularity}</div>
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
};

export default FriendsLobbyManager;
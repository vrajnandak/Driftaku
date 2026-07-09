// import React, { useEffect, useState, useRef } from 'react';
// import { supabase, getLocalPlayerId } from '../../lib/supabase';

// interface Props {
//   roomId: string;
// }

// const FriendsLobbyManager: React.FC<Props> = ({ roomId }) => {
//   const [room, setRoom] = useState<any>(null);
//   const [isOwner, setIsOwner] = useState(false);
//   const [loading, setLoading] = useState(true);

//   const [isPoolLoading, setIsPoolLoading] = useState(false);
//   const [isPoolReady, setIsPoolReady] = useState(false);
//   const [poolError, setPoolError] = useState<string | null>(null);

//   const { playerId } = getLocalPlayerId();
//   const poolFetchedRef = useRef(false);

//   useEffect(() => {
//     const fetchAndJoinRoom = async () => {

//       // 1. Fetch room from database
//       let { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      
//       if (error || !data) {
//         alert("Room not found or expired!");
//         window.location.href = '/play/friends';
//         return;
//       }

//       // 2. Check if this browser is the owner
//       const isRoomOwner = data.owner_id === playerId;
//       setIsOwner(isRoomOwner);

//       // 3. If I am not in the room yet, join it!
//       const playerExists = data.players.find((p: any) => p.id === playerId);
      
//       if (!playerExists) {
//         if (data.players.length >= 2) {
//           alert("Room is full! Cannot join.");
//           window.location.href = '/play/friends';
//           return;
//         }

//         const savedName = localStorage.getItem('driftaku_player_name') || 'Guest Player';
//         const newPlayer = { id: playerId, name: savedName.trim(), isOwner: false, isReady: true };
//         const updatedPlayers = [...data.players, newPlayer];
        
//         // Update the database
//         const {error: updateError} = await supabase.from('rooms').update({ players: updatedPlayers }).eq('id', roomId);
//         if (updateError) {
//           console.error("Failed to join room:", updateError);
//           alert("Failed to join room. Please try again.");
//           window.location.href = '/play/friends';
//           return;
//         }
//         data.players = updatedPlayers; // Update local copy
//       }

//       setRoom(data);
//       setLoading(false);
//     };

//     fetchAndJoinRoom();

//     // 4. SUBSCRIBE TO REAL-TIME CHANGES
//     const channel = supabase
//       .channel(`room_${roomId}`)
//       .on(
//         'postgres_changes',
//         { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
//         (payload) => {
//           console.log('Room updated from another player!', payload.new);
//           setRoom(payload.new); // Instantly updates UI when Player B joins!
//         }
//       )
//       .subscribe();

//     return () => {
//       supabase.removeChannel(channel);
//     };
//   }, [roomId, playerId]);

//   useEffect(() => {
//     if (!room || !room.pool_id || poolFetchedRef.current) return;
//     poolFetchedRef.current = true; // Avoid duplicate fires
//     setIsPoolLoading(true);

//     const prefetchPool = async () => {
//         // Fetch the raw 400-node drafting pool
//         const { data, error } = await supabase.from('draft_pools').select('nodes_data').eq('id', room.pool_id).single();
        
//         if (error || !data) {
//             setPoolError("Failed to cache nodes.");
//             setIsPoolLoading(false);
//             return;
//         }

//         // Apply lobby allowed node filters LOCALLY in the background
//         const filteredNodes = data.nodes_data.filter((node: any) => {
//             if (node.type === 0 && !room.config.allowedNodes.character) return false;
//             if (node.type === 1 && !room.config.allowedNodes.voiceActor) return false;
//             if (node.type === 2 && !room.config.allowedNodes.anime) return false;
//             if (node.type === 3 && !room.config.allowedNodes.studio) return false;
//             return true;
//         });

//         const preppedData = {
//             config: room.config,
//             nodes: filteredNodes
//         };

//         // Save prepped JSON data in local storage
//         localStorage.setItem(`driftaku_pool_${roomId}`, JSON.stringify(preppedData));
//         setIsPoolLoading(false);
//         setIsPoolReady(true);
//     };

//     prefetchPool();
//   }, [room]);

//   const handleStartMatch = async () => {
//     // Owner clicks start -> update database status
//     await supabase.from('rooms').update({ status: 'building' }).eq('id', roomId);
//   };

//   // 5. Watch for status change to redirect BOTH players at the exact same time
//   useEffect(() => {
//     if (room?.status === 'building' && isPoolReady) {
//       window.location.href = `/play/friends/${roomId}/build`;
//     }
//   }, [room?.status, isPoolReady]);

//   if (loading) return <div className="text-white text-center py-20">Loading Room...</div>;
//   return (
//     <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
//       <div className="lg:col-span-5 space-y-6">
        
//         <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
//           <h1 className="text-4xl font-mono font-black text-white tracking-[0.2em] mb-6">{roomId}</h1>
          
//           {/* Show loader on owner's page if opponent is ready but pool isn't cached yet */}
//           {room.status === 'building' && !isPoolReady ? (
//               <div className="w-full py-4 text-center bg-slate-800 text-slate-400 font-bold uppercase tracking-widest rounded-xl animate-pulse text-xs">
//                    Preparing sandbox nodes...
//               </div>
//           ) : (
//               <button 
//                 onClick={handleStartMatch}
//                 disabled={!isOwner || room.players.length < 2 || isPoolLoading}
//                 className={`w-full py-4 rounded-xl font-black uppercase transition-all 
//                   ${!isOwner ? 'bg-slate-800 text-slate-500' : 
//                     room.players.length < 2 || isPoolLoading ? 'bg-indigo-600/50 text-indigo-200' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
//               >
//                 {isPoolLoading ? 'Buffering Network Map...' : !isOwner ? 'Waiting for Owner...' : 'Start Match'}
//               </button>
//           )}

//           {/* Background caching stats indicator */}
//           <div className="mt-4 flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-slate-500 px-2">
//               <span>Client Cache</span>
//               <span className={isPoolReady ? 'text-emerald-400' : 'text-amber-400 animate-pulse'}>
//                   {isPoolReady ? '● Ready {Display maxNodes here}' : poolError ? '❌ Error' : '○ Downloading...'}
//               </span>
//           </div>
//         </div>

//         <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
//           <h2 className="text-sm font-black text-slate-300 mb-4">Players ({room.players.length}/2)</h2>
//           <div className="space-y-3">
//             {room.players.map((player: any) => (
//               <div key={player.id} className="flex justify-between bg-slate-950 p-4 rounded-2xl border border-white/5">
//                 <span className="font-bold text-white">
//                   {player.name} {player.id === playerId ? '(You)' : ''}
//                 </span>
//                 {player.isOwner && <span className="text-indigo-400 text-xs uppercase">Owner</span>}
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>

//       <div className="lg:col-span-7">
//         <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
//           <h2 className="text-sm font-black text-slate-300 mb-6">Match Settings</h2>
//           <div className="grid grid-cols-2 gap-6 text-white font-mono text-xs">
//             <div>Build Time: {room.config.buildTime / 60} min</div>
//             <div>Solve Time: {room.config.solveTime / 60} min</div>
//             <div>Max Nodes: {room.config.maxNodes}</div>
//             <div>Release Era: {room.config.yearRange.min} - {room.config.yearRange.max}</div>
//             <div>Popularity: {room.config.popularity}</div>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default FriendsLobbyManager;

import React, { useEffect, useState, useRef } from 'react';
import { supabase, getLocalPlayerId } from '../../lib/supabase';

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
      let { data, error } = await supabase.from('rooms').select('*').eq('id', roomId).single();
      
      if (error || !data) {
        alert("Room not found or expired!");
        window.location.href = '/play/friends';
        return;
      }

      const isRoomOwner = data.owner_id === playerId;
      setIsOwner(isRoomOwner);

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

  // --- 2. BACKGROUND PRE-FETCH & IMAGE CACHING ---
  useEffect(() => {
    if (!room || !room.pool_id || poolFetchedRef.current) return;
    
    let isMounted = true;
    poolFetchedRef.current = true; // Avoid duplicate fires
    setIsPoolLoading(true);

    const prefetchPool = async () => {
        // 1. Measure DB Fetch
        const t0 = performance.now();
        const { data, error } = await supabase.from('draft_pools').select('nodes_data').eq('id', room.pool_id).single();
        const t1 = performance.now();
        const dbTime = (t1 - t0).toFixed(2);
        
        if (error || !data) {
            if (isMounted) setPoolError("Failed to fetch nodes from database.");
            if (isMounted) setIsPoolLoading(false);
            return;
        }

        // 2. Filter nodes locally based on Room Config
        const filteredNodes = data.nodes_data.filter((node: any) => {
            if (node.type === 0 && !room.config.allowedNodes.character) return false;
            if (node.type === 1 && !room.config.allowedNodes.voiceActor) return false;
            if (node.type === 2 && !room.config.allowedNodes.anime) return false;
            if (node.type === 3 && !room.config.allowedNodes.studio) return false;
            return true;
        });

        if (isMounted) setPoolSize(filteredNodes.length);

        // 3. Preload all WebP Images
        const imageUrls = filteredNodes.map((n: any) => n.image).filter(Boolean);
        let loadedCount = 0;

        const promises = imageUrls.map((url: string) => new Promise((resolve) => {
            const img = new Image();
            img.src = url;
            img.onload = resolve;
            img.onerror = resolve; // Resolve anyway to avoid hanging
        }).then(() => {
            loadedCount++;
            if (isMounted) setProgress(Math.round((loadedCount / imageUrls.length) * 100));
        }));

        // Wait for all images to cache into the browser
        await Promise.all(promises);
        const t2 = performance.now();
        const assetTime = (t2 - t1).toFixed(2);

        // 4. Save to Local Storage & Finish
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
  }, [room]);

  // --- 3. HANDLE START MATCH ---
  const handleStartMatch = async () => {
    await supabase.from('rooms').update({ status: 'building' }).eq('id', roomId);
  };

  // --- 4. REDIRECT SYNC ---
  // Transition ONLY happens when the DB says 'building' AND the client has finished caching
  useEffect(() => {
    if (room?.status === 'building' && isPoolReady) {
      window.location.href = `/play/friends/${roomId}/build`;
    }
  }, [room?.status, isPoolReady]);

  if (loading) return <div className="text-white text-center py-20 font-mono tracking-widest text-xs animate-pulse">Loading Room...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-5 space-y-6">
        
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <h1 className="text-4xl font-mono font-black text-white tracking-[0.2em] mb-6">{roomId}</h1>
          
          {/* Action Button / Status */}
          {room.status === 'building' && !isPoolReady ? (
              <div className="w-full py-4 text-center bg-slate-800 text-slate-400 font-bold uppercase tracking-widest rounded-xl flex items-center justify-center gap-3 text-xs">
                   <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin"></div>
                   Buffering Assets ({progress}%)...
              </div>
          ) : (
              <button 
                onClick={handleStartMatch}
                disabled={!isOwner || room.players.length < 2 || isPoolLoading}
                className={`w-full py-4 rounded-xl font-black uppercase transition-all 
                  ${!isOwner ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 
                    room.players.length < 2 || isPoolLoading ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95'}`}
              >
                {isPoolLoading ? `Caching Images (${progress}%)` : !isOwner ? 'Waiting for Owner...' : room.players.length < 2 ? 'Waiting for Opponent...' : 'Start Match'}
              </button>
          )}

          {/* Background Caching Stats Indicator */}
          <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">
                  <span>Client Cache</span>
                  <span className={isPoolReady ? 'text-emerald-400' : poolError ? 'text-rose-400' : 'text-amber-400 animate-pulse'}>
                      {isPoolReady ? `● Ready (${poolSize} Nodes)` : poolError ? '❌ Error' : '○ Downloading...'}
                  </span>
              </div>
              
              {/* Progress Bar */}
              {!isPoolReady && !poolError && (
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${progress}%` }}></div>
                  </div>
              )}

              {/* Performance Metrics */}
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
              <div key={player.id} className="flex justify-between bg-slate-950 p-4 rounded-2xl border border-white/5">
                <span className="font-bold text-white">
                  {player.name} {player.id === playerId ? '(You)' : ''}
                </span>
                {player.isOwner && <span className="text-indigo-400 text-xs uppercase">Owner</span>}
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
    </div>
  );
};

export default FriendsLobbyManager;
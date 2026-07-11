import React, { useEffect, useState, useRef } from 'react';
import { supabase, getLocalPlayerId, clearStalePools } from '../../lib/supabase';
import { toast, ToastContainer } from '../ui/Toast';

interface Props {
  roomId: string;
}

// --- TRIVIA DATABASE ---
type Trivia = 
  | { type: 'fact'; text: string; }
  | { type: 'mcq'; question: string; options: string[]; answer: string; };

const TRIVIA_DB: Trivia[] = [
  { type: 'fact', text: "Attack on Titan creator Hajime Isayama based the Titans' erratic behavior on drunk customers he encountered while working at an internet cafe." },
  { type: 'fact', text: "The name 'Studio Ghibli' comes from the Arabic word for 'Mediterranean Wind'." },
  { type: 'fact', text: "Masashi Kishimoto originally planned for Naruto to be about a boy cooking ramen, but shifted to ninjas after his editor intervened." },
  { type: 'fact', text: "Bleach was initially rejected by Shonen Jump because the executives thought it was too similar to Yu Yu Hakusho." },
  { type: 'mcq', question: "What is the highest-grossing anime film of all time worldwide?", options: ['Your Name', 'Demon Slayer: Mugen Train', 'Spirited Away', 'Suzume'], answer: 'Demon Slayer: Mugen Train' },
  { type: 'mcq', question: "Which anime holds the Guinness World Record for the most episodes?", options: ['One Piece', 'Sazae-san', 'Detective Conan', 'Doraemon'], answer: 'Sazae-san' },
  { type: 'mcq', question: "Which of these anime was NOT animated by Studio MAPPA?", options: ['Jujutsu Kaisen', 'Chainsaw Man', 'Gurren Lagann', 'Attack on Titan S4'], answer: 'Gurren Lagann' },
  { type: 'mcq', question: "Who is the legendary voice actor for Levi Ackerman in Attack on Titan?", options: ['Yuki Kaji', 'Hiroshi Kamiya', 'Mamoru Miyano', 'Natsuki Hanae'], answer: 'Hiroshi Kamiya' },
  { type: 'mcq', question: "In 'Death Note', what is L's real name?", options: ['L Lawliet', 'Lain', 'Light', 'Lelouch'], answer: 'L Lawliet' },
  { type: 'mcq', question: "Which studio animated the first season of One Punch Man?", options: ['Bones', 'Madhouse', 'Trigger', 'Ufotable'], answer: 'Madhouse' }
];

const FriendsLobbyManager: React.FC<Props> = ({ roomId }) => {
  const [room, setRoom] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  // Match Settings State
  const [buildTimeInput, setBuildTimeInput] = useState<number>(0);
  const [solveTimeInput, setSolveTimeInput] = useState<number>(0);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  // Trivia State
  const [currentTrivia, setCurrentTrivia] = useState<Trivia>(TRIVIA_DB[0]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);

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

  // --- INITIALIZE TRIVIA ---
  useEffect(() => {
      loadNextTrivia();
  }, []);

  const loadNextTrivia = () => {
      const next = TRIVIA_DB[Math.floor(Math.random() * TRIVIA_DB.length)];
      setCurrentTrivia(next);
      setSelectedAnswer(null);
  };

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
        const newPlayer = { id: playerId, name: savedName.trim(), isOwner: false, isCached: false };
        const updatedPlayers = [...data.players, newPlayer];
        
        const {error: updateError} = await supabase.from('rooms').update({ players: updatedPlayers }).eq('id', roomId);
        if (updateError) {
          console.error("Failed to join room:", updateError);
          toast("Failed to join room. Please try again.", "error");
          window.location.href = '/play/friends';
          return;
        }
        data.players = updatedPlayers; 
      }

      setRoom(data);
      setBuildTimeInput(data.config.buildTime);
      setSolveTimeInput(data.config.solveTime);
      setLoading(false);
    };

    fetchAndJoinRoom();

    const channel = supabase
      .channel(`room_${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          setRoom(payload.new); 
          // Sync settings for guests automatically
          if (payload.new.owner_id !== playerId) {
              setBuildTimeInput(payload.new.config.buildTime);
              setSolveTimeInput(payload.new.config.solveTime);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, playerId]);

  // --- 2. BACKGROUND PRE-FETCH & CACHING ---
  useEffect(() => {
    if (!room?.pool_id || poolFetchedRef.current) return;
    
    let isMounted = true;
    poolFetchedRef.current = true; 
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

        const loadImage = (url: string) => {
            return new Promise((resolve) => {
                const img = new Image();
                let isSettled = false;
                const finish = () => { if (!isSettled) { isSettled = true; resolve(true); } };
                img.onload = finish; img.onerror = finish;
                setTimeout(finish, 5000); 
                img.src = url; 
            });
        };

        const promises = imageUrls.map(async (url: string) => {
            await loadImage(url);
            loadedCount++;
            if (isMounted) setProgress(Math.round((loadedCount / imageUrls.length) * 100));
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

  // --- 2.5 DYNAMIC CONFIG UPDATE ---
  // If the owner changes the time settings AFTER the assets are cached, we must overwrite the local storage 
  // so the GameClient and BuilderClient read the updated timers!
  useEffect(() => {
    if (isPoolReady && room?.config) {
        const stored = localStorage.getItem(`driftaku_pool_${roomId}`);
        if (stored) {
            const parsed = JSON.parse(stored);
            parsed.config = room.config;
            localStorage.setItem(`driftaku_pool_${roomId}`, JSON.stringify(parsed));
        }
    }
  }, [room?.config, isPoolReady, roomId]);

  // --- 3. SYNC READINESS ---
  useEffect(() => {
      if (isPoolReady && room) {
          const markAsCached = async () => {
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

  // --- 4. ACTION HANDLERS ---
  const handleStartMatch = async () => {
    await supabase.from('rooms').update({ status: 'building' }).eq('id', roomId);
  };
  
  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast("Room code copied to clipboard!", "success"); 
    } catch (err) {
      toast("Failed to copy room code.", "error");
    }
  };

  const handleApplySettings = async () => {
      if (!isOwner) return;
      setIsUpdatingSettings(true);
      try {
          const updatedConfig = {
              ...room.config,
              buildTime: Number(buildTimeInput),
              solveTime: Number(solveTimeInput)
          };
          const { error } = await supabase.from('rooms').update({ config: updatedConfig }).eq('id', roomId);
          if (error) throw error;
          toast("Match settings updated!", "success");
      } catch (err) {
          toast("Failed to apply settings.", "error");
      } finally {
          setIsUpdatingSettings(false);
      }
  };

  // --- 5. REDIRECT SYNC ---
  useEffect(() => {
    if (room?.status === 'building' && isPoolReady) {
      window.location.href = `/play/friends/${roomId}/build`;
    }
  }, [room?.status, isPoolReady]);


  if (loading || !room) return <div className="text-white text-center py-20 font-mono tracking-widest text-xs animate-pulse">Loading Room...</div>;

  const allPlayersCached = room.players.length === 2 && room.players.every((p: any) => p.isCached === true);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      
      {/* LEFT COLUMN: LOBBY STATUS */}
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-mono font-black text-white tracking-[0.2em]">{roomId}</h1>
            <button onClick={handleCopyCode} title="Copy Room Code" className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all active:scale-95 shadow-lg border border-white/5">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </button>
          </div>
          
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
                    !allPlayersCached || isPoolLoading ? 'bg-indigo-600/50 text-indigo-200 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 shadow-lg shadow-indigo-500/20'}`}
              >
                {isPoolLoading ? `Caching Images (${progress}%)` : 
                 !isOwner ? 'Waiting for Owner...' : 
                 room.players.length < 2 ? 'Waiting for Opponent...' : 
                 !allPlayersCached ? 'Waiting for Opponent to Load...' : 
                 'Start Match'}
              </button>
          )}

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
                        <span className={`text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 ${player.isCached ? 'text-emerald-500' : 'text-amber-500 animate-pulse'}`}>
                            {player.isCached ? <><span>●</span> Ready</> : <><span>○</span> Loading...</>}
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

      {/* RIGHT COLUMN: SETTINGS & TRIVIA */}
      <div className="lg:col-span-7 space-y-6">
        
        {/* SETTINGS BLOCK */}
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-sm font-black text-slate-300 uppercase tracking-widest">Match Settings</h2>
            {!isOwner && <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-800 px-2 py-1 rounded">Read Only</span>}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-white text-sm">
            
            {/* EDITABLE FIELDS (Timers) */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Build Time Limit</label>
                <select 
                    value={buildTimeInput}
                    onChange={(e) => setBuildTimeInput(Number(e.target.value))}
                    disabled={!isOwner}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors appearance-none disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    <option value="0">Unlimited</option>
                    <option value="60">1 Minute</option>
                    <option value="180">3 Minutes</option>
                    <option value="300">5 Minutes</option>
                    <option value="600">10 Minutes</option>
                </select>
            </div>

            <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Solve Time Limit</label>
                <select 
                    value={solveTimeInput}
                    onChange={(e) => setSolveTimeInput(Number(e.target.value))}
                    disabled={!isOwner}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors appearance-none disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    <option value="0">Unlimited</option>
                    <option value="60">1 Minute</option>
                    <option value="180">3 Minutes</option>
                    <option value="300">5 Minutes</option>
                    <option value="600">10 Minutes</option>
                </select>
            </div>

            {/* READ-ONLY FIELDS (Core Data) */}
            <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Max Nodes Limit</label>
                <div className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-slate-400 cursor-not-allowed font-mono">
                    {room.config.maxNodes} Nodes
                </div>
            </div>

            <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Release Era & Filter</label>
                <div className="w-full bg-slate-950/50 border border-white/5 rounded-xl px-4 py-3 text-slate-400 cursor-not-allowed font-mono flex items-center justify-between">
                    <span>{room.config.yearRange.min} - {room.config.yearRange.max}</span>
                    <span className="bg-slate-800 text-slate-300 text-[9px] px-2 py-0.5 rounded">{room.config.popularity.toUpperCase()}</span>
                </div>
            </div>
          </div>

          {/* APPLY BUTTON (Owner Only) */}
          {isOwner && (
              <div className="mt-6 pt-6 border-t border-white/10 flex justify-end">
                  <button 
                      onClick={handleApplySettings}
                      disabled={isUpdatingSettings || (buildTimeInput === room.config.buildTime && solveTimeInput === room.config.solveTime)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  >
                      {isUpdatingSettings ? 'Applying...' : 'Apply Changes'}
                  </button>
              </div>
          )}
        </div>

        {/* TRIVIA TERMINAL (Engagement Box) */}
        <div className="bg-slate-900 rounded-3xl p-6 border border-fuchsia-500/20 shadow-[0_0_30px_rgba(217,70,239,0.05)] relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-fuchsia-600/10 blur-3xl rounded-full pointer-events-none"></div>
            
            <div className="flex justify-between items-center mb-6 relative z-10">
               <h2 className="text-sm font-black text-fuchsia-400 uppercase tracking-widest flex items-center gap-2">
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                   Trivia Terminal
               </h2>
               <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest bg-slate-950 px-2 py-1 rounded-md border border-white/5">
                   {currentTrivia.type === 'fact' ? 'Did you know?' : 'Pop Quiz!'}
               </span>
            </div>

            <div className="relative z-10 min-h-[120px] flex flex-col justify-center">
                {currentTrivia.type === 'fact' ? (
                    <p className="text-white text-base md:text-lg font-medium leading-relaxed">"{currentTrivia.text}"</p>
                ) : (
                    <div>
                        <p className="text-white text-base md:text-lg font-bold mb-4">{currentTrivia.question}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {currentTrivia.options.map((opt, idx) => {
                                const isSelected = selectedAnswer === opt;
                                const isCorrect = opt === currentTrivia.answer;
                                const isRevealed = selectedAnswer !== null;

                                let btnClass = "bg-slate-950 border border-white/10 hover:border-fuchsia-500/50 text-slate-300 transition-all";
                                if (isRevealed) {
                                    if (isCorrect) btnClass = "bg-emerald-500/20 border border-emerald-500 text-emerald-400 font-bold";
                                    else if (isSelected) btnClass = "bg-rose-500/20 border border-rose-500 text-rose-400 font-bold";
                                    else btnClass = "bg-slate-950 border border-white/5 opacity-40 text-slate-500 cursor-not-allowed";
                                }

                                return (
                                    <button 
                                        key={idx}
                                        onClick={() => !isRevealed && setSelectedAnswer(opt)}
                                        disabled={isRevealed}
                                        className={`px-4 py-3 rounded-xl text-sm text-left ${btnClass}`}
                                    >
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-6 flex justify-end relative z-10">
                <button 
                    onClick={loadNextTrivia}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-widest text-[10px] px-4 py-2.5 rounded-xl transition-all border border-white/5 active:scale-95"
                >
                    Next Trivia ➔
                </button>
            </div>
        </div>

      </div>
      <ToastContainer />
    </div>
  );
};

export default FriendsLobbyManager;
import React, { useEffect, useState } from 'react';
import { supabase, getLocalPlayerId, setLocalPlayerName } from '../../lib/supabase';
import { toast, ToastContainer } from '../ui/Toast';

const FriendsLobbyForm: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');

  // Create State (Configurations)
  const [buildTime, setBuildTime] = useState(300); 
  const [solveTime, setSolveTime] = useState(300); 
  const [maxNodes, setMaxNodes] = useState(50);
  const [allowedNodes, setAllowedNodes] = useState({
    anime: true,
    character: true,
    voiceActor: true,
    studio: true,
  });
  const [yearRange, setYearRange] = useState({ min: 1990, max: 2026 });
  const [popularity, setPopularity] = useState('All Anime'); 
  const [isCreating, setIsCreating] = useState(false);

  // Logic: Hierarchical node dependencies
  useEffect(() => {
    if (!allowedNodes.character) {
        setAllowedNodes(prev => ({ ...prev, voiceActor: false }));
    }
  }, [allowedNodes.character]);

  useEffect(() => {
    if (!allowedNodes.anime) {
        setAllowedNodes(prev => ({ ...prev, studio: false }));
    }
  }, [allowedNodes.anime]);

  useEffect(() => {
      const savedName = localStorage.getItem('driftaku_player_name') || '';
      setPlayerName(savedName);
  }, []);

  const handleNameChange = (val: string) => {
      setPlayerName(val);
      setLocalPlayerName(val);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
        // alert("Please enter a display name first.");
        toast("Please enter a display name first.", "warning");
        return;
    }
    if (roomCode.trim().length > 0) {
      window.location.href = `/play/friends/${roomCode.trim().toUpperCase()}`;
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
        // alert("Please enter a display name first.");
        toast("Please enter a display name first.", "warning");
        return;
    }
    
    // Basic validation
    if (yearRange.min > yearRange.max) {
        // alert("Release Era: Start year cannot be greater than end year.");
        toast("Release Era: Start year cannot be greater than end year.", "warning");
        return;
    }

    setIsCreating(true);
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { playerId } = getLocalPlayerId();

    const { data: allPools, error: allPoolsError } = await supabase.from('draft_pools').select('id, popularity_tier, era_min, era_max').limit(5);
    
    // 1. Query the supabase to Find a matching draft pool.
    let poolQuery = supabase.from('draft_pools').select('id');
    if(popularity !== 'All Anime') {
      poolQuery = poolQuery.eq('popularity_tier', popularity);
    }
    poolQuery = poolQuery.lte('era_min', yearRange.max).gte('era_max', yearRange.min);
    
    const { data: matchingPools, error: poolError} = await poolQuery;
    
    let selectedPoolId = null;
    if (poolError || !matchingPools || matchingPools.length === 0) {
      const { data: fallbackPools} = await supabase.from('draft_pools').select('id').limit(10);
      if (fallbackPools && fallbackPools.length > 0) {
        selectedPoolId = fallbackPools[Math.floor(Math.random() * fallbackPools.length)].id;
      } else {
        // alert("No draft pools found in database. Run your python generator first!");
        toast("No draft pools found in database. Run your python generator first!", "warning");
        setIsCreating(false);
        return;
      }
    } else {
      selectedPoolId = matchingPools[Math.floor(Math.random() * matchingPools.length)].id;
    }
    
    const { error } = await supabase.from('rooms').insert({
      id: newRoomCode,
      owner_id: playerId,
      pool_id: selectedPoolId,
      config: { buildTime, solveTime, maxNodes, allowedNodes, yearRange, popularity },
      players: [{ id: playerId, name: playerName.trim(), isOwner: true, isReady: true }],
      status: 'lobby'
    });

    if (error) {
      toast("Failed to create room. Please try again.", "error");
      console.error("Error creating room:", error);
      setIsCreating(false);
      return;
    }
    
    window.location.href = `/play/friends/${newRoomCode}`;
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden font-sans">
      
      {/* Floating Pill Tabs */}
      <div className="p-3 bg-slate-950/50">
        <div className="flex bg-slate-900 rounded-2xl p-1.5 border border-white/5">
            <button 
                onClick={() => setActiveTab('join')}
                className={`flex-1 py-3.5 text-sm font-black uppercase tracking-widest rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'join' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                Join
            </button>
            <button 
                onClick={() => setActiveTab('create')}
                className={`flex-1 py-3.5 text-sm font-black uppercase tracking-widest rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${activeTab === 'create' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                Create
            </button>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        
        {/* Shared Name Input */}
        <div className="mb-8 pb-8 border-b border-white/5">
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Your Display Name</label>
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-indigo-400 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                </div>
                <input 
                    type="text" 
                    value={playerName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Enter your name..." 
                    maxLength={15}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white text-sm font-bold placeholder-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all shadow-inner"
                    required
                />
            </div>
        </div>

        {activeTab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-300">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 text-center">Room Code</label>
              <input 
                type="text" 
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="DRIFT7" 
                maxLength={8}
                className="w-full bg-slate-950 border border-white/10 rounded-2xl px-4 py-6 text-white text-3xl font-black font-mono text-center focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all tracking-[0.3em] uppercase shadow-inner"
                required
              />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-3">
              Enter Lobby
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            
            {/* Timers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Build Limit
                </label>
                <select value={buildTime} onChange={(e) => setBuildTime(Number(e.target.value))} className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-bold focus:outline-none focus:border-emerald-500 cursor-pointer appearance-none">
                  <option value={120}>2 Minutes</option>
                  <option value={300}>5 Minutes</option>
                  <option value={600}>10 Minutes</option>
                  <option value={0}>Unlimited</option>
                </select>
              </div>
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                  <svg className="w-3.5 h-3.5 text-rose-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  Solve Limit
                </label>
                <select value={solveTime} onChange={(e) => setSolveTime(Number(e.target.value))} className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2.5 text-white text-xs font-bold focus:outline-none focus:border-rose-500 cursor-pointer appearance-none">
                  <option value={120}>2 Minutes</option>
                  <option value={300}>5 Minutes</option>
                  <option value={600}>10 Minutes</option>
                </select>
              </div>
            </div>

            {/* Graph Size */}
            <div className="bg-slate-950/50 p-5 rounded-2xl border border-white/5">
              <div className="flex justify-between items-end mb-4">
                <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>
                  Graph Size
                </label>
                <span className="bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-lg font-mono text-xs font-bold border border-emerald-500/20">{maxNodes} Nodes</span>
              </div>
              <input 
                type="range" min={20} max={100} step={10} value={maxNodes} 
                onChange={(e) => setMaxNodes(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>

            {/* Node Types as Clickable Cards */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Node Types Allowed</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(allowedNodes).map(([key, value]) => {
                  const isDisabled = (key === 'voiceActor' && !allowedNodes.character) || (key === 'studio' && !allowedNodes.anime);
                  const label = key.replace(/([A-Z])/g, ' $1').trim();
                  
                  return (
                    <label key={key} className={`
                        relative flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200 select-none
                        ${isDisabled ? 'opacity-30 cursor-not-allowed bg-slate-950 border-white/5' : 'cursor-pointer hover:border-white/20'}
                        ${value && !isDisabled ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-slate-950 border-white/5'}
                    `}>
                        <input 
                          type="checkbox" 
                          disabled={isDisabled} 
                          checked={value} 
                          onChange={() => setAllowedNodes(prev => ({...prev, [key]: !prev[key as keyof typeof allowedNodes]}))}
                          className="sr-only" 
                        />
                        <span className={`text-[10px] font-black uppercase tracking-widest mt-1 ${value && !isDisabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {label}
                        </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Database Filters */}
            <div className="pt-6 border-t border-white/5 space-y-4">
              <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                  Pool Filters
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Release Era</span>
                  <div className="flex items-center gap-2">
                    <input type="number" value={yearRange.min} onChange={(e) => setYearRange(p => ({...p, min: Number(e.target.value)}))} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-white text-xs font-bold text-center focus:border-emerald-500 focus:outline-none transition-colors" />
                    <span className="text-slate-600 font-bold">-</span>
                    <input type="number" value={yearRange.max} onChange={(e) => setYearRange(p => ({...p, max: Number(e.target.value)}))} className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-2 text-white text-xs font-bold text-center focus:border-emerald-500 focus:outline-none transition-colors" />
                  </div>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Popularity Tier</span>
                  <select value={popularity} onChange={(e) => setPopularity(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-xs font-bold focus:border-emerald-500 focus:outline-none cursor-pointer appearance-none">
                    <option value="Mainstream">Mainstream Only</option>
                    <option value="All Anime">All Anime</option>
                    <option value="Niche">Obscure/Niche</option>
                  </select>
                </div>
              </div>
            </div>

            <button 
                type="submit" 
                disabled={isCreating}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-lg
                    ${isCreating ? 'bg-emerald-600/50 text-emerald-200 cursor-wait' : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 shadow-emerald-500/25'}`}
            >
              {isCreating ? (
                  <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Generating Lobby...
                  </>
              ) : (
                  <>
                      Generate Lobby
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  </>
              )}
            </button>
          </form>
        )}
      </div>
      <ToastContainer />
    </div>
  );
};

export default FriendsLobbyForm;
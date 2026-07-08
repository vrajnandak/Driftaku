import React, { useEffect, useState } from 'react';
import { supabase, getLocalPlayerId, setLocalPlayerName } from '../../lib/supabase';

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
  
  // MODIFIED: Match these strings to your Python script's output
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
        alert("Please enter a display name first.");
        return;
    }
    if (roomCode.trim().length > 0) {
      window.location.href = `/play/friends/${roomCode.trim().toUpperCase()}`;
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
        alert("Please enter a display name first.");
        return;
    }
    
    // Basic validation
    if (yearRange.min > yearRange.max) {
        alert("Release Era: Start year cannot be greater than end year.");
        return;
    }

    setIsCreating(true);
    const newRoomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { playerId } = getLocalPlayerId();

    const { data: allPools, error: allPoolsError } = await supabase.from('draft_pools').select('id, popularity_tier, era_min, era_max').limit(5);
    
    console.log("Database contents (first 5 pools):", allPools);

    //1. Query the superbase to Find a matching draft pool.
    let poolQuery = supabase.from('draft_pools').select('id');
    if(popularity!=='All Anime') {
      poolQuery = poolQuery.eq('popularity_tier', popularity);
    }
    // poolQuery = poolQuery.gte('era_min', yearRange.min).lte('era_max', yearRange.max);
    poolQuery = poolQuery.lte('era_min', yearRange.max).gte('era_max', yearRange.min);
    const { data: matchingPools, error: poolError} = await poolQuery;
    console.log("Supabase Query Result:", { matchingPools, error: poolError, filters: { popularity, yearRange } });
    let selectedPoolId = null;
    if (poolError || !matchingPools || matchingPools.length===0) {
      const { data: fallbackPools} = await supabase.from('draft_pools').select('id').limit(10);
      if (fallbackPools && fallbackPools.length > 0) {
        selectedPoolId = fallbackPools[Math.floor(Math.random() * fallbackPools.length)].id;
      } else {
        alert("No draft pools found in database. Run your python generator first!");
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
      alert("Error creating room. Check console.");
      console.error(error);
      setIsCreating(false);
      return;
    }
    
    window.location.href = `/play/friends/${newRoomCode}`;
  };

  return (
    <div className="bg-slate-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button 
          onClick={() => setActiveTab('join')}
          className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'join' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          Join Room
        </button>
        <button 
          onClick={() => setActiveTab('create')}
          className={`flex-1 py-4 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'create' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          Create Room
        </button>
      </div>

      <div className="p-6 md:p-8">
        <div className="mb-8 pb-8 border-b border-white/5">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Your Display Name</label>
            <input 
                type="text" 
                value={playerName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter your name..." 
                maxLength={15}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-4 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                required
            />
        </div>

        {activeTab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Room Code</label>
              <input 
                type="text" 
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="e.g. DRIFT7" 
                maxLength={8}
                className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-4 text-white text-xl font-mono text-center focus:outline-none focus:border-indigo-500 transition-colors tracking-[0.5em]"
                required
              />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-transform active:scale-95 shadow-lg shadow-indigo-500/20">
              Enter Lobby
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-8">
            {/* Timers */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Build Phase Limit</label>
                <select value={buildTime} onChange={(e) => setBuildTime(Number(e.target.value))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500">
                  <option value={120}>2 Minutes</option>
                  <option value={300}>5 Minutes</option>
                  <option value={600}>10 Minutes</option>
                  <option value={0}>Unlimited</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Solve Phase Limit</label>
                <select value={solveTime} onChange={(e) => setSolveTime(Number(e.target.value))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500">
                  <option value={120}>2 Minutes</option>
                  <option value={300}>5 Minutes</option>
                  <option value={600}>10 Minutes</option>
                </select>
              </div>
            </div>

            {/* Graph Size */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Max Graph Size</label>
                <span className="text-emerald-400 font-mono text-sm">{maxNodes} Nodes</span>
              </div>
              <input 
                type="range" min={20} max={100} step={10} value={maxNodes} 
                onChange={(e) => setMaxNodes(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            {/* Node Types */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Allowed Node Types</label>
              <div className="grid grid-cols-2 gap-3">
                
                {/* Anime Toggle */}
                <label className="flex items-center gap-3 bg-slate-950 border border-white/5 p-3 rounded-lg cursor-pointer hover:border-white/20 transition-colors">
                    <input type="checkbox" checked={allowedNodes.anime} onChange={() => setAllowedNodes(p => ({...p, anime: !p.anime}))} className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-white/10" />
                    <span className="text-xs text-white font-medium">Anime</span>
                </label>

                {/* Character Toggle */}
                <label className="flex items-center gap-3 bg-slate-950 border border-white/5 p-3 rounded-lg cursor-pointer hover:border-white/20 transition-colors">
                    <input type="checkbox" checked={allowedNodes.character} onChange={() => setAllowedNodes(p => ({...p, character: !p.character}))} className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-white/10" />
                    <span className="text-xs text-white font-medium">Characters</span>
                </label>

                {/* VA Toggle (Dependent on Character) */}
                <label className={`flex items-center gap-3 bg-slate-950 border border-white/5 p-3 rounded-lg transition-colors ${!allowedNodes.character ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:border-white/20'}`}>
                    <input type="checkbox" disabled={!allowedNodes.character} checked={allowedNodes.voiceActor} onChange={() => setAllowedNodes(p => ({...p, voiceActor: !p.voiceActor}))} className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-white/10 disabled:opacity-0" />
                    <span className="text-xs text-white font-medium">Voice Actors</span>
                </label>

                {/* Studio Toggle (Dependent on Anime) */}
                <label className={`flex items-center gap-3 bg-slate-950 border border-white/5 p-3 rounded-lg transition-colors ${!allowedNodes.anime ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:border-white/20'}`}>
                    <input type="checkbox" disabled={!allowedNodes.anime} checked={allowedNodes.studio} onChange={() => setAllowedNodes(p => ({...p, studio: !p.studio}))} className="w-4 h-4 rounded text-emerald-500 bg-slate-800 border-white/10 disabled:opacity-0" />
                    <span className="text-xs text-white font-medium">Studios</span>
                </label>

              </div>
            </div>

            {/* Anime Filters */}
            <div className="pt-4 border-t border-white/5 space-y-4">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Database Filters</label>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] text-slate-500 block mb-1">Release Era</span>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={yearRange.min} onChange={(e) => setYearRange(p => ({...p, min: Number(e.target.value)}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs text-center" />
                    <span className="text-slate-500">-</span>
                    <input type="number" value={yearRange.max} onChange={(e) => setYearRange(p => ({...p, max: Number(e.target.value)}))} className="w-full bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs text-center" />
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block mb-1">Popularity</span>
                  <select value={popularity} onChange={(e) => setPopularity(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs">
                    {/* MODIFIED: Matching database strings */}
                    <option value="Mainstream">Mainstream Only</option>
                    <option value="All Anime">All Anime</option>
                    <option value="Niche">Obscure/Niche</option>
                  </select>
                </div>
              </div>
            </div>

            <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest py-4 rounded-xl transition-transform active:scale-95 shadow-lg shadow-emerald-500/20 mt-4" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Generate Lobby'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default FriendsLobbyForm;
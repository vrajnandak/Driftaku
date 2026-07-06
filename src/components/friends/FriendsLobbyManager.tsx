import React, { useEffect, useState } from 'react';
import { supabase, getLocalPlayerId } from '../../lib/supabase';

interface Props {
  roomId: string;
}

const FriendsLobbyManager: React.FC<Props> = ({ roomId }) => {
  const [room, setRoom] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const { playerId } = getLocalPlayerId();

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

  const handleStartMatch = async () => {
    // Owner clicks start -> update database status
    await supabase.from('rooms').update({ status: 'building' }).eq('id', roomId);
  };

  // 5. Watch for status change to redirect BOTH players at the exact same time
  useEffect(() => {
    if (room?.status === 'building') {
      window.location.href = `/play/friends/${roomId}/build`;
    }
  }, [room?.status]);

  if (loading) return <div className="text-white text-center py-20">Loading Room...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <div className="lg:col-span-5 space-y-6">
        
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <h1 className="text-4xl font-mono font-black text-white tracking-[0.2em] mb-6">{roomId}</h1>
          <button 
            onClick={handleStartMatch}
            disabled={!isOwner || room.players.length < 2}
            className={`w-full py-4 rounded-xl font-black uppercase transition-all 
              ${!isOwner ? 'bg-slate-800 text-slate-500' : 
                room.players.length < 2 ? 'bg-indigo-600/50 text-indigo-200' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
          >
            {!isOwner ? 'Waiting for Owner to Start...' : room.players.length < 2 ? 'Waiting for Opponent...' : 'Start Match'}
          </button>
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
          </div>
        </div>
      </div>

      {/* Settings Display (Read from Database) */}
      <div className="lg:col-span-7">
        <div className="bg-slate-900 rounded-3xl p-6 border border-white/10 shadow-xl">
          <h2 className="text-sm font-black text-slate-300 mb-6">Match Settings</h2>
          <div className="grid grid-cols-2 gap-6 text-white font-mono">
            <div>Build Time: {room.config.buildTime / 60} min</div>
            <div>Solve Time: {room.config.solveTime / 60} min</div>
            <div>Max Nodes: {room.config.maxNodes}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FriendsLobbyManager;
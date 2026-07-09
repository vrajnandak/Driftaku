// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Replace these with your actual Supabase project URL and Anon Key
const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper to get or create a unique ID for the current browser
export const getLocalPlayerId = () => {
  let playerId = localStorage.getItem('driftaku_player_id');
  let name = localStorage.getItem('driftaku_player_name');
  if (!playerId) {
    playerId = crypto.randomUUID();
    localStorage.setItem('driftaku_player_id', playerId);
  }
  return {playerId, name: name || 'Guest Player'};
};

export const setLocalPlayerName = (name: string) => {
  localStorage.setItem('driftaku_player_name', name);
};

// src/lib/supabase.ts
export const clearStalePools = (currentRoomId?: string) => {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Delete all pools except the one for the current room
        if (key && key.startsWith('driftaku_pool_') && key !== `driftaku_pool_${currentRoomId}`) {
            keysToDelete.push(key);
        }
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));
};
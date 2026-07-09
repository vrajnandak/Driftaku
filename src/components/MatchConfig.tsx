import React, { useState } from 'react';
import type { LevelData } from '../types/game';
import { toast, ToastContainer } from './ui/Toast';

const PATH_LENGTHS: Record<string, number> = {
  'Easy': 2,
  'Medium': 4,
  'Hard': 6
};

interface Props {
  onGraphGenerated: (data: LevelData) => void;
  setLoading: (loading: boolean) => void;
}

const NODE_TYPES = ['Anime', 'Character', 'Voice Actor', 'Studio'];

export default function MatchConfig({onGraphGenerated, setLoading}: Props) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['Anime', 'Character', 'Voice Actor', 'Studio']);
  const [maxNodes, setMaxNodes] = useState(50);
  const [difficulty, setDifficulty] = useState('Medium');

  const toggleType = (type: string) => {
    setSelectedTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const startMatch = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/generate-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeTypes: selectedTypes,
          maxNodes: maxNodes,
          pathLength: PATH_LENGTHS[difficulty]
        })
      });

      console.log("Graph generation response:", response);

      const levelData: LevelData = await response.json();
      onGraphGenerated(levelData);
    } catch (error) {
      console.error("Failed to generate graph:", error);
      // alert("Failed to generate a puzzle. Try different settings!");
      toast("Failed to generate a puzzle. Try different settings!", "info");
    } finally {
      setLoading(false);
    }
  };

//   const startMatch = () => {
//     const config = { selectedTypes, maxNodes, difficulty };
//     console.log("Starting Match with:", config);
//     // Here you will eventually trigger your graph generation API
//   };

  return (
    <div className="bg-slate-900 border border-white/10 rounded-3xl p-6">
      <h2 className="text-white font-black text-xl mb-6">Match Config</h2>
      
      <div className="space-y-4">
        {/* Node Types */}
        <label className="block text-xs font-bold text-slate-400 uppercase">Node Types</label>
        <div className="grid grid-cols-2 gap-2">
          {NODE_TYPES.map(type => (
            <button 
              key={type}
              onClick={() => toggleType(type)}
              className={`p-2 rounded-lg text-[10px] text-white border transition ${
                selectedTypes.includes(type) 
                ? 'bg-indigo-600 border-indigo-400' 
                : 'bg-slate-800 border-white/5 hover:border-indigo-500'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Max Nodes Slider */}
        <label className="block text-xs font-bold text-slate-400 uppercase mt-4">
          Max Nodes: <span className="text-white">{maxNodes}</span>
        </label>
        <input 
          type="range" min="10" max="100" value={maxNodes}
          onChange={(e) => setMaxNodes(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" 
        />

        {/* Difficulty Select */}
        <label className="block text-xs font-bold text-slate-400 uppercase mt-4">Optimal Path Difficulty</label>
        <select 
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          className="w-full bg-slate-800 text-white text-xs p-3 rounded-xl border border-white/5 focus:outline-none focus:border-indigo-500"
        >
          <option>Easy (Short Paths)</option>
          <option>Medium</option>
          <option>Hard (Deep Web)</option>
        </select>
      </div>

      <button 
        onClick={startMatch}
        className="w-full mt-8 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 rounded-xl transition active:scale-95"
      >
        START MATCH
      </button>
      <ToastContainer />
    </div>
  );
}
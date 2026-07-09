// import React, { useState } from 'react';
// import GameClient from './GameClient';
// import MatchConfig from './MatchConfig';
// import type { LevelData } from '../types/game';

// export default function BotGameWrapper() {
//   const [levelData, setLevelData] = useState<LevelData | null>(null);
//   const [loading, setLoading] = useState(false);

//   return (
//     <>
//       {loading && <div className="absolute inset-0 z-50 flex items-center justify-center text-white">Generating Web...</div>}
      
//       {!levelData ? (
//         <MatchConfig onGraphGenerated={setLevelData} setLoading={setLoading} />
//       ) : (
//         <GameClient key={levelData.metadata.start_node} levelData={levelData} onWin={() => alert("You won!")} />
//       )}
//     </>
//   );
// }
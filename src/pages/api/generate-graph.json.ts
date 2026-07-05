// // src/pages/api/generate-graph.json.ts
// import type { APIRoute } from 'astro';
// import db from '../../../../game_database.json'; // Your static DB

// export const POST: APIRoute = async ({ request }) => {
//   const data = await request.json();
//   const { nodeTypes, maxNodes, pathLength } = data;

//   // Logic: Filter nodes by types, pick random Start/End
//   const filteredNodes = db.filter(n => nodeTypes.includes(n.type));
//   // ... apply BFS/Bubble logic here from your python script
//   // For now, return a dummy object that matches your LevelData structure
//   return new Response(JSON.stringify({}), { status: 200 });
// };

import type { APIRoute } from "astro";
import db from "../../../../game_database.json";

import type {
    GameNode,
    LevelData
} from "../../types/game.ts"; // <-- adjust path if needed

const nodes = db as GameNode[];

export const NODE_MAP = new Map<string, GameNode>();
for (const node of nodes) {
    NODE_MAP.set(node.id, node);
}

const randomChoice = <T>(arr: T[]): T =>
    arr[Math.floor(Math.random() * arr.length)];

function bfsDistances(startId: string): Map<string, number> {
    const distances = new Map<string, number>();
    const queue: string[] = [startId];

    distances.set(startId, 0);

    while (queue.length) {
        const current = queue.shift()!;
        const currentNode = NODE_MAP.get(current)!;
        const d = distances.get(current)!;

        for (const neighbor of currentNode.connections) {
            if (!distances.has(neighbor)) {
                distances.set(neighbor, d + 1);
                queue.push(neighbor);
            }
        }
    }

    return distances;
}

function shuffle<T>(array: T[]): T[] {
    const copy = [...array];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

function generateBubble(
    nodeTypes: string[],
    maxNodes: number,
    pathLength: number
): LevelData | null {

    const possibleStarts = nodes.filter(n => nodeTypes.includes(n.type));

    if (possibleStarts.length === 0) return null;

    for (let attempt = 0; attempt < 1000; attempt++) {

        const start = randomChoice(possibleStarts);

        const distStart = bfsDistances(start.id);

        const validEnds = [...distStart.entries()]
            .filter(([id, d]) =>
                d === pathLength &&
                nodeTypes.includes(NODE_MAP.get(id)!.type)
            )
            .map(([id]) => id);

        if (!validEnds.length) continue;

        const endId = randomChoice(validEnds);
        const end = NODE_MAP.get(endId)!;

        const distEnd = bfsDistances(endId);

        const core = new Set<string>();

        for (const node of nodes) {

            const ds = distStart.get(node.id);
            const de = distEnd.get(node.id);

            if (ds !== undefined &&
                de !== undefined &&
                ds + de <= pathLength + 1) {

                core.add(node.id);
            }
        }

        if (core.size < 3 || core.size > maxNodes) {
            continue;
        }

        const bubble = new Set(core);

        while (bubble.size < maxNodes) {

            const boundary = new Set<string>();

            for (const id of bubble) {
                const node = NODE_MAP.get(id)!;

                for (const neighbor of node.connections) {
                    if (!bubble.has(neighbor)) {
                        boundary.add(neighbor);
                    }
                }
            }

            if (!boundary.size) break;

            const sortedBoundary = [...boundary].sort(
                (a, b) =>
                    NODE_MAP.get(b)!.connections.length -
                    NODE_MAP.get(a)!.connections.length
            );

            for (const id of sortedBoundary) {

                bubble.add(id);

                if (bubble.size >= maxNodes) {
                    break;
                }
            }
        }

        if (bubble.size !== maxNodes) {
            continue;
        }

        const bubbleIds = [...bubble];

        const levelNodes: GameNode[] = bubbleIds.map(id => {

            const node = NODE_MAP.get(id)!;

            return {
                ...structuredClone(node),
                connections: node.connections.filter(c => bubble.has(c))
            };
        });

        return {
            metadata: {
                start_node: start.id,
                start_name: start.name,
                end_node: end.id,
                end_name: end.name,
                total_nodes: levelNodes.length
            },
            nodes: shuffle(levelNodes)
        };
    }

    return null;
}

export const POST: APIRoute = async ({ request }) => {

    const {
        nodeTypes = ["Anime", "Studio"],
        maxNodes = 50,
        pathLength = 4
    } = await request.json();

    const level = generateBubble(
        nodeTypes,
        maxNodes,
        pathLength
    );

    if (!level) {
        return new Response(
            JSON.stringify({
                error: "Could not generate puzzle."
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    }

    return new Response(JSON.stringify(level), {
        status: 200,
        headers: {
            "Content-Type": "application/json"
        }
    });
};
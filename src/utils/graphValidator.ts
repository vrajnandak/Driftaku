export const isGraphSolvable = (startId: string, endId: string, links: {sourceId: string, targetId: string}[]) => {
    const adj = new Map<string, string[]>();
    links.forEach(l => {
        if (!adj.has(l.sourceId)) adj.set(l.sourceId, []);
        if (!adj.has(l.targetId)) adj.set(l.targetId, []);
        adj.get(l.sourceId)!.push(l.targetId);
        adj.get(l.targetId)!.push(l.sourceId);
    });

    const queue = [startId];
    const visited = new Set([startId]);

    while (queue.length > 0) {
        const curr = queue.shift()!;
        if (curr === endId) return true;
        (adj.get(curr) || []).forEach(neighbor => {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
            }
        });
    }
    return false;
};
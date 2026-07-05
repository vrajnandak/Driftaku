import * as PIXI from 'pixi.js';
import { NODE_COLORS, type GameNode, type NodeVisuals} from '../types/game';

export const createNodeSprite = (node: GameNode, onPointerDown: (node: GameNode, e: PIXI.FederatedPointerEvent) => void): NodeVisuals => {
    const container = new PIXI.Container();
    const bg = new PIXI.Graphics();
    const icon = new PIXI.Graphics().circle(0, 0, 20).fill(0x1e293b);
    
    container.addChild(bg, icon);
    container.eventMode = 'static';
    container.cursor = 'pointer';

    container.on('pointerdown', (e: PIXI.FederatedPointerEvent) => onPointerDown(node, e));
    
    if (node.image) {
      // node.image is now a Base64 string from Astro
        PIXI.Assets.load(node.image).then(tex => {
            const s = new PIXI.Sprite(tex);
            s.anchor.set(0.5); 
            s.width = s.height = 60;

            const m = new PIXI.Graphics().circle(0, 0, 30).fill(0xffffff);
            s.mask = m; 
            container.addChild(m, s);
            icon.visible = false;
        });
        //   .catch(err => {
        //     console.error("Base64 image failed to render:", err);
        //   });
    }
    return { container, bg, icon };
};

export const updateNodeVisuals = (bg: PIXI.Graphics, node: GameNode, isSelected: boolean, endNodeId: string) => {
    bg.clear()
    .circle(0, 0, 33)
    .fill(0x0f172a)
    .stroke({ 
      width: isSelected ? 4 : 2, 
      color: isSelected ? 0xffffff : (NODE_COLORS[node.type as keyof typeof NODE_COLORS] || 0xffffff) 
    });
}
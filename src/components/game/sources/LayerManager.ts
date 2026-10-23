import { Container } from 'pixi.js';
import layersConfig from '../../../data/layers.json';

type LayerNode = {
  name: string;
  children?: LayerNode[];
};

/**
 * Builds a named Pixi container tree from layers.json (Space Fortune pattern).
 * Presentation components mount into LayerManager.get('reelset') etc.
 */
export class LayerManager {
  static layers = new Map<string, Container>();
  readonly root = new Container();

  buildStage(config: LayerNode = layersConfig as LayerNode): Container {
    LayerManager.layers.clear();
    this.root.removeChildren();
    this.walk(config, this.root);
    return this.root;
  }

  private walk(node: LayerNode, parent: Container): Container {
    const c = node.name === 'root' ? parent : new Container();
    if (node.name !== 'root') {
      c.name = node.name;
      parent.addChild(c);
      LayerManager.layers.set(node.name, c);
    } else {
      LayerManager.layers.set('root', parent);
    }
    for (const child of node.children ?? []) {
      this.walk(child, c);
    }
    return c;
  }

  static get(name: string): Container | undefined {
    return LayerManager.layers.get(name);
  }

  get(name: string): Container | undefined {
    return LayerManager.get(name);
  }
}

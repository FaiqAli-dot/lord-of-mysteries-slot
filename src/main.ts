import './styles/main.css';
import { createSession } from './api/session';
import { PixiGame } from './ui-plugin';
import { bus } from './ui-plugin/EventBus';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app missing');

root.innerHTML = `
  <div class="demo-banner">DEMO CREDITS — NOT REAL MONEY</div>
  <div class="pixi-shell">
    <canvas id="game-canvas"></canvas>
  </div>
  <p class="hud-hint">Space/Enter spin · ↑↓ bet · Esc close · M mute · R reset</p>
`;

const canvas = root.querySelector<HTMLCanvasElement>('#game-canvas');
if (!canvas) throw new Error('#game-canvas missing');

const session = createSession();
const game = new PixiGame(canvas, session);

void game.init().catch((err) => {
  console.error(err);
  root.insertAdjacentHTML(
    'beforeend',
    `<p class="boot-error">${err instanceof Error ? err.message : String(err)}</p>`,
  );
});

const w = window as unknown as { __pathwaysApp?: PixiGame; __pathwaysBus?: typeof bus };
w.__pathwaysApp = game;
w.__pathwaysBus = bus;

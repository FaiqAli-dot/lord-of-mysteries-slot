import './styles/main.css';
import { GameApp } from './ui/app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app missing');
const app = new GameApp(root);
// Dev/test hook for screenshots & manual QA (not used by math RNG).
(window as unknown as { __pathwaysApp?: GameApp }).__pathwaysApp = app;

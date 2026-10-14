import './styles/main.css';
import { GameApp } from './ui/app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app missing');

const app = new GameApp(root);
(window as unknown as { __pathwaysApp?: GameApp }).__pathwaysApp = app;

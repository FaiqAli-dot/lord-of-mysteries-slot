import type { GameSession } from '../../../api/session';
import type { SoftAudio } from '../../../ui/audio';
import type { PixiStage } from '../../reelset/sources/Reelset';
import type { BonusOverlay } from '../../bonus/sources/BonusOverlay';
import type { CheatsPanel } from '../../cheats/sources/CheatsPanel';
import type { LayerManager } from './LayerManager';

/** Shared runtime passed into every FSM state. */
export interface GameContext {
  session: GameSession;
  stage: PixiStage;
  audio: SoftAudio;
  overlay: BonusOverlay;
  cheats: CheatsPanel | null;
  layers: LayerManager;
  getTurbo: () => 0 | 1 | 2;
  getSkip: () => boolean;
  clearSkip: () => void;
  isBusy: () => boolean;
  setBusy: (v: boolean) => void;
  getAutoLeft: () => number;
  setAutoLeft: (n: number) => void;
  pushStateToPlugin: () => void;
  pushStateToPixi: () => void;
  afterResult: () => void;
  continueAutoplay: () => void;
  onResize: () => void;
  setStatus: (msg: string) => void;
}

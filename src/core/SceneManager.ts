import { LevelConfig } from '../levels/LevelConfig';
import { Level1 } from '../levels/Level1';
import { Level2 } from '../levels/Level2';
import { BossArena } from '../levels/BossArena';

export type SceneState = 'loading' | 'playing' | 'paused' | 'transitioning' | 'gameover' | 'victory';

export interface SceneTransition {
  type: 'fade' | 'slide' | 'none';
  duration: number;
}

export class SceneManager {
  private currentLevelIndex = 0;
  private readonly levels: LevelConfig[] = [Level1, Level2, BossArena];
  private state: SceneState = 'loading';

  // Transition
  private transitionOverlay: HTMLElement | null = null;
  private isTransitioning = false;

  // Callbacks
  public onLevelLoad?: (level: LevelConfig) => void;
  public onLevelComplete?: (levelId: string) => void;
  public onGameComplete?: () => void;

  constructor() {
    this.createTransitionOverlay();
  }

  private createTransitionOverlay(): void {
    this.transitionOverlay = document.createElement('div');
    this.transitionOverlay.id = 'scene-transition';
    this.transitionOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #1a1a2e;
      opacity: 0;
      pointer-events: none;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: opacity 0.5s ease;
    `;

    const levelText = document.createElement('div');
    levelText.id = 'level-text';
    levelText.style.cssText = `
      color: #4a90e2;
      font-size: 32px;
      font-weight: bold;
      text-shadow: 0 0 20px rgba(74, 144, 226, 0.5);
      margin-bottom: 10px;
    `;
    this.transitionOverlay.appendChild(levelText);

    const descText = document.createElement('div');
    descText.id = 'level-desc';
    descText.style.cssText = `
      color: #87ceeb;
      font-size: 18px;
    `;
    this.transitionOverlay.appendChild(descText);

    document.body.appendChild(this.transitionOverlay);
  }

  getCurrentLevel(): LevelConfig {
    return this.levels[this.currentLevelIndex];
  }

  getCurrentLevelIndex(): number {
    return this.currentLevelIndex;
  }

  getTotalLevels(): number {
    return this.levels.length;
  }

  getState(): SceneState {
    return this.state;
  }

  setState(state: SceneState): void {
    this.state = state;
  }

  async loadLevel(index: number): Promise<LevelConfig> {
    if (index < 0 || index >= this.levels.length) {
      throw new Error(`Invalid level index: ${index}`);
    }

    this.currentLevelIndex = index;
    const level = this.levels[index];

    if (this.onLevelLoad) {
      this.onLevelLoad(level);
    }

    return level;
  }

  async nextLevel(): Promise<LevelConfig | null> {
    if (this.currentLevelIndex >= this.levels.length - 1) {
      // Game complete!
      if (this.onGameComplete) {
        this.onGameComplete();
      }
      return null;
    }

    return this.transitionToLevel(this.currentLevelIndex + 1);
  }

  async restartLevel(): Promise<LevelConfig> {
    return this.transitionToLevel(this.currentLevelIndex);
  }

  async transitionToLevel(index: number): Promise<LevelConfig> {
    if (this.isTransitioning) {
      return this.levels[index];
    }

    this.isTransitioning = true;
    this.state = 'transitioning';

    const targetLevel = this.levels[index];

    // Show level name during transition
    await this.fadeIn(targetLevel.name, targetLevel.description);

    // Load level
    await this.loadLevel(index);

    // Hold for a moment
    await this.delay(1500);

    // Fade out
    await this.fadeOut();

    this.isTransitioning = false;
    this.state = 'playing';

    return targetLevel;
  }

  private async fadeIn(title: string, description: string): Promise<void> {
    if (!this.transitionOverlay) return;

    const levelText = this.transitionOverlay.querySelector('#level-text') as HTMLElement;
    const descText = this.transitionOverlay.querySelector('#level-desc') as HTMLElement;

    if (levelText) levelText.textContent = title;
    if (descText) descText.textContent = description;

    this.transitionOverlay.style.pointerEvents = 'all';
    this.transitionOverlay.style.opacity = '1';

    await this.delay(500);
  }

  private async fadeOut(): Promise<void> {
    if (!this.transitionOverlay) return;

    this.transitionOverlay.style.opacity = '0';
    await this.delay(500);
    this.transitionOverlay.style.pointerEvents = 'none';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  completeLevel(): void {
    const level = this.getCurrentLevel();

    if (this.onLevelComplete) {
      this.onLevelComplete(level.id);
    }
  }

  isLastLevel(): boolean {
    return this.currentLevelIndex >= this.levels.length - 1;
  }

  dispose(): void {
    if (this.transitionOverlay) {
      this.transitionOverlay.remove();
    }
  }
}

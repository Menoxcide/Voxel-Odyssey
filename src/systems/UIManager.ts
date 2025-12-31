export class UIManager {
  private readonly container: HTMLElement;
  private readonly healthBar: HTMLElement;
  private readonly bossHealthContainer: HTMLElement;
  private readonly bossHealthBar: HTMLElement;
  private readonly bossPhaseText: HTMLElement;
  private readonly gameOverOverlay: HTMLElement;
  private readonly victoryOverlay: HTMLElement;
  private readonly fpsCounter: HTMLElement;

  private hearts: HTMLElement[] = [];
  private showFps = false;

  constructor() {
    this.container = document.getElementById('ui')!;
    this.healthBar = document.getElementById('health-bar')!;

    // Create boss health bar
    this.bossHealthContainer = this.createBossHealthBar();

    // Create game over overlay
    this.gameOverOverlay = this.createGameOverOverlay();

    // Create victory overlay
    this.victoryOverlay = this.createVictoryOverlay();

    // Create FPS counter
    this.fpsCounter = this.createFpsCounter();

    // Create reticle
    this.createReticle();

    // Initialize hearts
    this.updateHearts(3, 3);

    // Get reference to boss health bar fill
    this.bossHealthBar = this.bossHealthContainer.querySelector('.boss-health-fill') as HTMLElement;
    this.bossPhaseText = this.bossHealthContainer.querySelector('.boss-phase') as HTMLElement;
  }

  private createBossHealthBar(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'boss-health-container';
    container.innerHTML = `
      <div class="boss-name">VOXEL GUARDIAN</div>
      <div class="boss-health-bar">
        <div class="boss-health-fill"></div>
      </div>
      <div class="boss-phase">Phase 1: Summon</div>
    `;
    container.style.cssText = `
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      text-align: center;
      display: none;
      z-index: 20;
    `;

    const style = document.createElement('style');
    style.textContent = `
      .boss-name {
        color: #a855f7;
        font-size: 18px;
        font-weight: bold;
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        margin-bottom: 5px;
      }
      .boss-health-bar {
        width: 300px;
        height: 20px;
        background: rgba(0,0,0,0.5);
        border: 2px solid #a855f7;
        border-radius: 10px;
        overflow: hidden;
      }
      .boss-health-fill {
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, #7c3aed, #a855f7);
        transition: width 0.3s ease;
      }
      .boss-phase {
        color: #c084fc;
        font-size: 14px;
        margin-top: 5px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.5);
      }
    `;
    document.head.appendChild(style);
    this.container.appendChild(container);

    return container;
  }

  private createGameOverOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'menu-overlay';
    overlay.id = 'game-over';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <h1>GAME OVER</h1>
      <button id="retry-btn">RETRY</button>
    `;
    this.container.appendChild(overlay);
    return overlay;
  }

  private createVictoryOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'menu-overlay';
    overlay.id = 'victory';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <h1 style="color: #4ade80;">VICTORY!</h1>
      <p style="color: #fff; margin-bottom: 20px;">The Voxel Guardian has been defeated!</p>
      <button id="continue-btn">CONTINUE</button>
    `;
    this.container.appendChild(overlay);
    return overlay;
  }

  private createFpsCounter(): HTMLElement {
    const counter = document.createElement('div');
    counter.id = 'fps-counter';
    counter.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      color: #4ade80;
      font-size: 14px;
      font-family: monospace;
      background: rgba(0,0,0,0.5);
      padding: 5px 10px;
      border-radius: 4px;
      display: none;
      z-index: 20;
    `;
    this.container.appendChild(counter);
    return counter;
  }

  private createReticle(): void {
    const reticle = document.createElement('div');
    reticle.className = 'reticle';
    this.container.appendChild(reticle);
  }

  updateHearts(current: number, max: number): void {
    // Clear existing hearts
    this.hearts.forEach((heart) => heart.remove());
    this.hearts = [];

    for (let i = 0; i < max; i++) {
      const heart = document.createElement('div');
      heart.className = 'heart';
      heart.innerHTML = this.createHeartSVG(i < current);
      this.healthBar.appendChild(heart);
      this.hearts.push(heart);
    }
  }

  private createHeartSVG(filled: boolean): string {
    const color = filled ? '#ef4444' : '#374151';
    return `
      <svg width="30" height="30" viewBox="0 0 24 24" fill="${color}">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    `;
  }

  damageHeart(index: number): void {
    if (index < 0 || index >= this.hearts.length) return;

    const heart = this.hearts[index];
    heart.classList.add('damaged');
    heart.innerHTML = this.createHeartSVG(false);

    setTimeout(() => {
      heart.classList.remove('damaged');
    }, 500);
  }

  showBossHealth(show: boolean): void {
    this.bossHealthContainer.style.display = show ? 'block' : 'none';
  }

  updateBossHealth(percent: number): void {
    this.bossHealthBar.style.width = `${Math.max(0, percent * 100)}%`;
  }

  updateBossPhase(phase: string): void {
    const phaseNames: Record<string, string> = {
      SUMMON: 'Phase 1: Summon',
      BEAM: 'Phase 2: Beam',
      RAGE: 'Phase 3: Rage'
    };
    this.bossPhaseText.textContent = phaseNames[phase] || phase;
  }

  showGameOver(onRetry: () => void): void {
    this.gameOverOverlay.style.display = 'flex';
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.onclick = () => {
        this.gameOverOverlay.style.display = 'none';
        onRetry();
      };
    }
  }

  hideGameOver(): void {
    this.gameOverOverlay.style.display = 'none';
  }

  showVictory(onContinue: () => void): void {
    this.victoryOverlay.style.display = 'flex';
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
      continueBtn.onclick = () => {
        this.victoryOverlay.style.display = 'none';
        onContinue();
      };
    }
  }

  hideVictory(): void {
    this.victoryOverlay.style.display = 'none';
  }

  setFpsVisible(visible: boolean): void {
    this.showFps = visible;
    this.fpsCounter.style.display = visible ? 'block' : 'none';
  }

  updateFps(fps: number): void {
    if (this.showFps) {
      this.fpsCounter.textContent = `${fps} FPS`;
    }
  }

  showDamageFlash(): void {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(239, 68, 68, 0.3);
      pointer-events: none;
      z-index: 100;
      animation: damageFlash 0.2s ease-out forwards;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes damageFlash {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(flash);
    setTimeout(() => {
      flash.remove();
      style.remove();
    }, 200);
  }

  dispose(): void {
    this.hearts.forEach((heart) => heart.remove());
    this.bossHealthContainer.remove();
    this.gameOverOverlay.remove();
    this.victoryOverlay.remove();
    this.fpsCounter.remove();
  }
}

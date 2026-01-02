import { PlayerClass } from '../game/classes/ClassConfig';
import { ALL_CLASSES } from '../game/classes/ClassDefinitions';
import { ComboState, ComboTier, ComboTierConfig, COMBO_TIERS } from '../game/ComboSystem';

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  price: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  owned: boolean;
  type: 'consumable' | 'permanent' | 'skin';
}

export class UIManager {
  private readonly container: HTMLElement;
  private readonly healthBar: HTMLElement;
  private bossHealthContainer: HTMLElement | null = null;
  private bossHealthBar: HTMLElement | null = null;
  private bossPhaseText: HTMLElement | null = null;
  private gameOverOverlay: HTMLElement | null = null;
  private victoryOverlay: HTMLElement | null = null;
  private fpsCounter: HTMLElement | null = null;
  private objectiveDisplay: HTMLElement | null = null;
  private classSelectOverlay: HTMLElement | null = null;
  private settingsOverlay: HTMLElement | null = null;
  private abilityHud: HTMLElement | null = null;
  private abilityButton: HTMLElement | null = null;
  private unlockNotification: HTMLElement | null = null;
  private comboDisplay: HTMLElement | null = null;
  private comboTierAnnouncement: HTMLElement | null = null;
  private killStreakAnnouncement: HTMLElement | null = null;
  private minimapContainer: HTMLElement | null = null;
  private proximityContainer: HTMLElement | null = null;
  private proximityIndicators: Map<string, HTMLElement> = new Map();

  private hearts: HTMLElement[] = [];
  private showFps = false;

  // Danger warning state
  private dangerLevel = 0;
  private dangerWarningActive = false;

  constructor() {
    // Validate required DOM elements exist
    const container = document.getElementById('ui');
    const healthBar = document.getElementById('health-bar');

    if (!container) {
      throw new Error('UI container element not found. Ensure #ui exists in HTML.');
    }
    if (!healthBar) {
      throw new Error('Health bar element not found. Ensure #health-bar exists in HTML.');
    }

    this.container = container;
    this.healthBar = healthBar;

    // Create core UI elements
    this.createBossHealthBar();
    this.createGameOverOverlay();
    this.createVictoryOverlay();
    this.createFpsCounter();
    this.createObjectiveDisplay();
    this.createReticle();
    this.createAbilityButton();
    this.createAbilityHud();
    this.createComboDisplay();
    this.createMinimapContainer();
    this.createProximityContainer();

    // Initialize hearts
    this.updateHearts(3, 3);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE UI ELEMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  private createBossHealthBar(): void {
    const container = document.createElement('div');
    container.className = 'boss-health-container';
    container.style.display = 'none';
    container.innerHTML = `
      <div class="boss-name">VOXEL GUARDIAN</div>
      <div class="boss-health-bar">
        <div class="boss-health-fill"></div>
      </div>
      <div class="boss-phase">Phase 1: Summon</div>
    `;

    this.container.appendChild(container);
    this.bossHealthContainer = container;
    this.bossHealthBar = container.querySelector('.boss-health-fill');
    this.bossPhaseText = container.querySelector('.boss-phase');
  }

  private createGameOverOverlay(): void {
    const overlay = document.createElement('div');
    overlay.className = 'menu-overlay game-over';
    overlay.id = 'game-over';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <h1>GAME OVER</h1>
      <button id="retry-btn">RETRY</button>
    `;
    this.container.appendChild(overlay);
    this.gameOverOverlay = overlay;
  }

  private createVictoryOverlay(): void {
    const overlay = document.createElement('div');
    overlay.className = 'menu-overlay victory';
    overlay.id = 'victory';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <h1>VICTORY!</h1>
      <p>The Voxel Guardian has been defeated!</p>
      <button id="continue-btn">CONTINUE</button>
    `;
    this.container.appendChild(overlay);
    this.victoryOverlay = overlay;
  }

  private createFpsCounter(): void {
    const counter = document.createElement('div');
    counter.id = 'fps-counter';
    counter.style.display = 'none';
    this.container.appendChild(counter);
    this.fpsCounter = counter;
  }

  private createObjectiveDisplay(): void {
    const display = document.createElement('div');
    display.id = 'objective-display';
    display.style.display = 'none';
    this.container.appendChild(display);
    this.objectiveDisplay = display;
  }

  private createReticle(): void {
    const reticle = document.createElement('div');
    reticle.className = 'reticle';
    this.container.appendChild(reticle);
  }

  private createAbilityButton(): void {
    const btn = document.createElement('button');
    btn.id = 'ability-btn';
    btn.innerHTML = '&#10040;'; // Star burst symbol
    this.container.appendChild(btn);
    this.abilityButton = btn;
  }

  private createAbilityHud(): void {
    const hud = document.createElement('div');
    hud.className = 'ability-hud';
    hud.innerHTML = `
      <div class="ability-cooldown ready" data-ability="secondary">
        <span>E</span>
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45"></circle>
        </svg>
        <span class="ability-key">E</span>
      </div>
    `;
    this.container.appendChild(hud);
    this.abilityHud = hud;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════

  updateHearts(current: number, max: number): void {
    // Clear existing hearts
    this.hearts.forEach((heart) => heart.remove());
    this.hearts = [];

    for (let i = 0; i < max; i++) {
      const heart = document.createElement('div');
      const isFull = i < current;
      heart.className = `heart ${isFull ? 'full' : 'empty'}`;
      heart.innerHTML = this.createHeartSVG(isFull);
      this.healthBar.appendChild(heart);
      this.hearts.push(heart);
    }
  }

  private createHeartSVG(_filled: boolean): string {
    // Note: filled parameter used by CSS classes on parent element
    return `
      <svg viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    `;
  }

  damageHeart(index: number): void {
    if (index < 0 || index >= this.hearts.length) return;

    const heart = this.hearts[index];
    heart.classList.add('damaged');

    setTimeout(() => {
      heart.classList.remove('damaged');
    }, 500);
  }

  /**
   * Update danger warning level for hearts.
   * Level 0 = safe, 1 = moderate danger, 2 = high danger, 3 = critical
   * Hearts will pulse faster and redder at higher danger levels.
   */
  updateDangerLevel(level: number, playerHealth: number): void {
    this.dangerLevel = Math.max(0, Math.min(3, level));

    // Calculate effective danger: higher when low health
    const healthFactor = playerHealth <= 1 ? 1.5 : 1;
    const effectiveDanger = Math.min(3, this.dangerLevel * healthFactor);

    // Apply danger class to health bar container
    this.healthBar.classList.remove('danger-0', 'danger-1', 'danger-2', 'danger-3');

    if (effectiveDanger >= 2.5) {
      this.healthBar.classList.add('danger-3');
      if (!this.dangerWarningActive && playerHealth <= 1) {
        this.dangerWarningActive = true;
      }
    } else if (effectiveDanger >= 1.5) {
      this.healthBar.classList.add('danger-2');
      this.dangerWarningActive = false;
    } else if (effectiveDanger >= 0.5) {
      this.healthBar.classList.add('danger-1');
      this.dangerWarningActive = false;
    } else {
      this.healthBar.classList.add('danger-0');
      this.dangerWarningActive = false;
    }
  }

  /**
   * Check if critical danger warning is active (for sound trigger)
   */
  isDangerWarningActive(): boolean {
    return this.dangerWarningActive;
  }

  /**
   * Reset danger warning (call when danger passes)
   */
  resetDangerWarning(): void {
    this.dangerWarningActive = false;
    this.healthBar.classList.remove('danger-1', 'danger-2', 'danger-3');
    this.healthBar.classList.add('danger-0');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BOSS HEALTH
  // ═══════════════════════════════════════════════════════════════════════════

  showBossHealth(show: boolean): void {
    if (this.bossHealthContainer) {
      this.bossHealthContainer.style.display = show ? 'block' : 'none';
    }
  }

  updateBossHealth(percent: number): void {
    if (this.bossHealthBar) {
      this.bossHealthBar.style.width = `${Math.max(0, percent * 100)}%`;
    }
  }

  updateBossPhase(phase: string): void {
    if (!this.bossPhaseText) return;

    const phaseNames: Record<string, string> = {
      SUMMON: 'Phase 1: Summon',
      BEAM: 'Phase 2: Beam',
      RAGE: 'Phase 3: Rage'
    };
    this.bossPhaseText.textContent = phaseNames[phase] || phase;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GAME STATE OVERLAYS
  // ═══════════════════════════════════════════════════════════════════════════

  showGameOver(onRetry: () => void): void {
    if (!this.gameOverOverlay) return;

    this.gameOverOverlay.style.display = 'flex';
    const retryBtn = document.getElementById('retry-btn');
    if (retryBtn) {
      retryBtn.onclick = () => {
        if (this.gameOverOverlay) {
          this.gameOverOverlay.style.display = 'none';
        }
        onRetry();
      };
    }
  }

  hideGameOver(): void {
    if (this.gameOverOverlay) {
      this.gameOverOverlay.style.display = 'none';
    }
  }

  showVictory(onContinue: () => void): void {
    if (!this.victoryOverlay) return;

    this.victoryOverlay.style.display = 'flex';
    const continueBtn = document.getElementById('continue-btn');
    if (continueBtn) {
      continueBtn.onclick = () => {
        if (this.victoryOverlay) {
          this.victoryOverlay.style.display = 'none';
        }
        onContinue();
      };
    }
  }

  hideVictory(): void {
    if (this.victoryOverlay) {
      this.victoryOverlay.style.display = 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FPS & OBJECTIVES
  // ═══════════════════════════════════════════════════════════════════════════

  setFpsVisible(visible: boolean): void {
    this.showFps = visible;
    if (this.fpsCounter) {
      this.fpsCounter.style.display = visible ? 'block' : 'none';
    }
  }

  updateFps(fps: number): void {
    if (this.showFps && this.fpsCounter) {
      this.fpsCounter.textContent = `${fps} FPS`;
    }
  }

  setObjective(text: string, visible: boolean = true): void {
    if (this.objectiveDisplay) {
      this.objectiveDisplay.textContent = text;
      this.objectiveDisplay.style.display = visible ? 'block' : 'none';
    }
  }

  hideObjective(): void {
    if (this.objectiveDisplay) {
      this.objectiveDisplay.style.display = 'none';
    }
  }

  updateWaveCounter(current: number, total: number): void {
    this.setObjective(`Wave ${current} / ${total}`, true);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAMAGE FLASH & DIRECTION INDICATORS
  // ═══════════════════════════════════════════════════════════════════════════

  private damageIndicators: HTMLElement[] = [];

  showDamageFlash(): void {
    const flash = document.createElement('div');
    flash.className = 'damage-flash';
    document.body.appendChild(flash);

    setTimeout(() => {
      flash.remove();
    }, 200);
  }

  /**
   * Show directional damage indicator pointing toward damage source
   * @param direction Normalized vector from player to damage source (in screen space: x = right, y = up)
   * @param severity Damage amount (1-3 typically) - affects intensity
   */
  showDamageIndicator(direction: { x: number; z: number }, severity: number = 1): void {
    // Calculate angle from direction (0 = right, PI/2 = up, etc.)
    const angle = Math.atan2(-direction.z, direction.x);

    // Determine which edge(s) to show based on angle
    // Convert to degrees for easier reasoning
    const degrees = ((angle * 180 / Math.PI) + 360) % 360;

    // Create indicator element
    const indicator = document.createElement('div');
    indicator.className = 'damage-indicator';

    // Position based on angle (0=right, 90=top, 180=left, 270=bottom)
    let position: string;
    let rotation: number;

    if (degrees >= 315 || degrees < 45) {
      // Right
      position = 'right: 0; top: 50%; transform: translateY(-50%)';
      rotation = 0;
    } else if (degrees >= 45 && degrees < 135) {
      // Top
      position = 'top: 0; left: 50%; transform: translateX(-50%)';
      rotation = 90;
    } else if (degrees >= 135 && degrees < 225) {
      // Left
      position = 'left: 0; top: 50%; transform: translateY(-50%)';
      rotation = 180;
    } else {
      // Bottom
      position = 'bottom: 0; left: 50%; transform: translateX(-50%)';
      rotation = 270;
    }

    // Intensity based on severity (1-3 damage maps to 0.5-1.0 opacity)
    const intensity = Math.min(1, 0.4 + severity * 0.2);

    indicator.style.cssText = `
      position: fixed;
      ${position};
      width: 100px;
      height: 60px;
      pointer-events: none;
      z-index: 90;
      opacity: ${intensity};
      background: linear-gradient(${rotation}deg,
        rgba(255, 50, 50, 0.9) 0%,
        rgba(255, 50, 50, 0.4) 40%,
        transparent 100%);
      animation: damageIndicatorPulse 0.4s ease-out forwards;
    `;

    // Add arrow shape using pseudo-element via class
    indicator.innerHTML = `
      <div style="
        position: absolute;
        ${rotation === 0 ? 'right: 10px' : rotation === 180 ? 'left: 10px' : 'left: 50%'};
        ${rotation === 90 ? 'top: 10px' : rotation === 270 ? 'bottom: 10px' : 'top: 50%'};
        transform: translate(${rotation === 0 || rotation === 180 ? '0' : '-50%'}, ${rotation === 90 || rotation === 270 ? '0' : '-50%'}) rotate(${rotation}deg);
        width: 0;
        height: 0;
        border-top: 10px solid transparent;
        border-bottom: 10px solid transparent;
        border-left: 15px solid rgba(255, 100, 100, 0.9);
      "></div>
    `;

    document.body.appendChild(indicator);
    this.damageIndicators.push(indicator);

    // Remove after animation
    setTimeout(() => {
      indicator.remove();
      const idx = this.damageIndicators.indexOf(indicator);
      if (idx >= 0) this.damageIndicators.splice(idx, 1);
    }, 400);
  }

  /**
   * Clear all damage indicators (e.g., on level transition)
   */
  clearDamageIndicators(): void {
    for (const indicator of this.damageIndicators) {
      indicator.remove();
    }
    this.damageIndicators = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PROXIMITY INDICATORS (Off-screen enemy/pickup warnings)
  // ═══════════════════════════════════════════════════════════════════════════

  private createProximityContainer(): void {
    this.proximityContainer = document.createElement('div');
    this.proximityContainer.className = 'proximity-container';
    this.proximityContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
    `;
    document.body.appendChild(this.proximityContainer);
  }

  /**
   * Update proximity indicators for off-screen threats
   * @param threats Array of threat positions with type info
   * @param cameraForward Camera forward direction for screen-space calculation
   * @param cameraRight Camera right direction
   */
  updateProximityIndicators(
    threats: Array<{ id: string; x: number; z: number; type: 'enemy' | 'boss' | 'pickup' }>,
    playerX: number,
    playerZ: number,
    cameraYaw: number
  ): void {
    if (!this.proximityContainer) return;

    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;
    const edgePadding = 40;
    const maxDistance = 30; // Only show threats within this range

    // Track which indicators are still active
    const activeIds = new Set<string>();

    for (const threat of threats) {
      // Calculate relative position
      const dx = threat.x - playerX;
      const dz = threat.z - playerZ;
      const distance = Math.sqrt(dx * dx + dz * dz);

      // Skip if too far or too close (on-screen)
      if (distance > maxDistance || distance < 8) continue;

      activeIds.add(threat.id);

      // Calculate angle relative to camera
      const worldAngle = Math.atan2(dx, dz);
      const relativeAngle = worldAngle - cameraYaw;

      // Calculate screen position on edge
      const screenAngle = relativeAngle + Math.PI; // Offset to point toward threat
      let indicatorX = screenCenterX + Math.sin(screenAngle) * (screenCenterX - edgePadding);
      let indicatorY = screenCenterY - Math.cos(screenAngle) * (screenCenterY - edgePadding);

      // Clamp to screen edges
      indicatorX = Math.max(edgePadding, Math.min(window.innerWidth - edgePadding, indicatorX));
      indicatorY = Math.max(edgePadding, Math.min(window.innerHeight - edgePadding, indicatorY));

      // Get or create indicator
      let indicator = this.proximityIndicators.get(threat.id);
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'proximity-indicator';
        indicator.style.cssText = `
          position: absolute;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          transition: opacity 0.2s;
          box-shadow: 0 0 8px currentColor;
        `;
        this.proximityContainer.appendChild(indicator);
        this.proximityIndicators.set(threat.id, indicator);
      }

      // Color based on type
      let color: string;
      switch (threat.type) {
        case 'boss':
          color = '#a855f7'; // Purple
          break;
        case 'pickup':
          color = '#fbbf24'; // Gold
          break;
        default:
          color = '#ef4444'; // Red for enemies
      }

      // Opacity based on distance (closer = more visible)
      const opacity = 0.4 + (1 - distance / maxDistance) * 0.6;

      indicator.style.left = `${indicatorX}px`;
      indicator.style.top = `${indicatorY}px`;
      indicator.style.backgroundColor = color;
      indicator.style.color = color;
      indicator.style.opacity = `${opacity}`;
    }

    // Remove indicators for threats that are gone or on-screen
    for (const [id, indicator] of this.proximityIndicators) {
      if (!activeIds.has(id)) {
        indicator.remove();
        this.proximityIndicators.delete(id);
      }
    }
  }

  /**
   * Clear all proximity indicators
   */
  clearProximityIndicators(): void {
    for (const indicator of this.proximityIndicators.values()) {
      indicator.remove();
    }
    this.proximityIndicators.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASS SELECTION SCREEN
  // ═══════════════════════════════════════════════════════════════════════════

  showClassSelection(
    unlockedClassIds: string[],
    selectedClassId: string,
    onSelect: (classId: string) => void,
    unlockProgress?: { classId: string; requirement: string; current: number; target: number; percent: number }[],
    coins?: number,
    onOpenShop?: () => void,
    onOpenSettings?: () => void
  ): void {
    // Remove existing if any
    this.hideClassSelection();

    const overlay = document.createElement('div');
    overlay.className = 'class-select-overlay';

    // Top bar with coins, shop and settings buttons
    const topBar = document.createElement('div');
    topBar.className = 'class-select-top-bar';
    topBar.innerHTML = `
      <div class="coins-display">
        <span class="coin-icon">🪙</span>
        <span class="coin-amount">${coins ?? 0}</span>
      </div>
      <div class="top-bar-buttons">
        <button class="icon-button shop-btn" title="Shop">🛒</button>
        <button class="icon-button settings-btn" title="Settings">⚙️</button>
      </div>
    `;
    overlay.appendChild(topBar);

    // Add button handlers
    const shopBtn = topBar.querySelector('.shop-btn');
    const settingsBtn = topBar.querySelector('.settings-btn');
    if (shopBtn && onOpenShop) {
      shopBtn.addEventListener('click', onOpenShop);
    }
    if (settingsBtn && onOpenSettings) {
      settingsBtn.addEventListener('click', onOpenSettings);
    }

    const title = document.createElement('h1');
    title.textContent = 'SELECT YOUR CLASS';
    overlay.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'class-grid stagger-children';

    for (const playerClass of ALL_CLASSES) {
      const isUnlocked = unlockedClassIds.includes(playerClass.id);
      const isSelected = playerClass.id === selectedClassId;
      const progress = unlockProgress?.find(p => p.classId === playerClass.id);

      const card = this.createClassCard(playerClass, isUnlocked, isSelected, onSelect, progress);
      grid.appendChild(card);
    }

    overlay.appendChild(grid);

    const startBtn = document.createElement('button');
    startBtn.className = 'glass-button-primary';
    startBtn.textContent = 'START GAME';
    startBtn.style.marginTop = '24px';
    startBtn.style.padding = '16px 48px';
    startBtn.style.fontSize = '18px';
    startBtn.onclick = () => this.hideClassSelection();
    overlay.appendChild(startBtn);

    this.container.appendChild(overlay);
    this.classSelectOverlay = overlay;
  }

  private createClassCard(
    playerClass: PlayerClass,
    isUnlocked: boolean,
    isSelected: boolean,
    onSelect: (classId: string) => void,
    unlockProgress?: { classId: string; requirement: string; current: number; target: number; percent: number }
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = `class-card glass-card--${playerClass.id}`;

    if (isSelected) card.classList.add('selected');
    if (!isUnlocked) card.classList.add('locked');

    // Icon with class color
    const icon = document.createElement('div');
    icon.className = 'class-icon';
    icon.style.backgroundColor = `#${playerClass.colors.primary.toString(16).padStart(6, '0')}`;
    icon.textContent = this.getClassIcon(playerClass.id);
    card.appendChild(icon);

    // Content wrapper
    const content = document.createElement('div');
    content.className = 'class-card-content';

    const name = document.createElement('div');
    name.className = 'class-name';
    name.textContent = playerClass.name;
    name.style.color = `#${playerClass.colors.primary.toString(16).padStart(6, '0')}`;
    content.appendChild(name);

    const desc = document.createElement('div');
    desc.className = 'class-description';
    desc.textContent = playerClass.description;
    content.appendChild(desc);

    // Stats
    const stats = document.createElement('div');
    stats.className = 'class-stats';
    stats.innerHTML = `
      <span title="Health">&#10084; ${playerClass.stats.health}</span>
      <span title="Speed">&#9889; ${playerClass.stats.speed}</span>
      <span title="Damage">&#9876; ${playerClass.stats.baseDamage}</span>
    `;
    content.appendChild(stats);

    card.appendChild(content);

    // Lock overlay for locked classes with progress bar
    if (!isUnlocked) {
      const lockOverlay = document.createElement('div');
      lockOverlay.className = 'lock-overlay';

      if (unlockProgress) {
        lockOverlay.innerHTML = `
          <div class="lock-icon">&#128274;</div>
          <span class="lock-requirement">${unlockProgress.requirement}</span>
          <div class="unlock-progress-bar">
            <div class="unlock-progress-fill" style="width: ${unlockProgress.percent}%"></div>
          </div>
          <span class="unlock-progress-text">${unlockProgress.current} / ${unlockProgress.target}</span>
        `;
      } else {
        lockOverlay.innerHTML = `
          <div class="lock-icon">&#128274;</div>
          <span class="lock-requirement">${playerClass.unlockRequirement.description}</span>
        `;
      }
      card.appendChild(lockOverlay);
    }

    // Click handler
    if (isUnlocked) {
      card.onclick = () => {
        // Update selection visually
        document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        onSelect(playerClass.id);
      };
    }

    return card;
  }

  private getClassIcon(classId: string): string {
    const icons: Record<string, string> = {
      mage: '✨',      // Sparkles
      warrior: '⚔️',   // Crossed swords
      ranger: '🏹',    // Bow and arrow
      healer: '💚'     // Green heart
    };
    return icons[classId] || '?';
  }

  hideClassSelection(): void {
    if (this.classSelectOverlay) {
      this.classSelectOverlay.remove();
      this.classSelectOverlay = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SETTINGS MENU
  // ═══════════════════════════════════════════════════════════════════════════

  showSettings(
    settings: {
      musicVolume: number;
      sfxVolume: number;
      vibration: boolean;
      showFps: boolean;
      lowPowerMode: boolean;
    },
    onSave: (settings: {
      musicVolume: number;
      sfxVolume: number;
      vibration: boolean;
      showFps: boolean;
      lowPowerMode: boolean;
    }) => void,
    onClose: () => void
  ): void {
    this.hideSettings();

    const overlay = document.createElement('div');
    overlay.className = 'settings-overlay';

    const panel = document.createElement('div');
    panel.className = 'settings-panel animate-scaleIn';

    panel.innerHTML = `
      <h2>Settings</h2>

      <div class="settings-row">
        <label>Music Volume</label>
        <input type="range" class="settings-slider" id="music-vol" min="0" max="100" value="${settings.musicVolume * 100}">
      </div>

      <div class="settings-row">
        <label>SFX Volume</label>
        <input type="range" class="settings-slider" id="sfx-vol" min="0" max="100" value="${settings.sfxVolume * 100}">
      </div>

      <div class="settings-row">
        <label>Vibration</label>
        <div class="settings-toggle ${settings.vibration ? 'active' : ''}" id="vibration-toggle"></div>
      </div>

      <div class="settings-row">
        <label>Show FPS</label>
        <div class="settings-toggle ${settings.showFps ? 'active' : ''}" id="fps-toggle"></div>
      </div>

      <div class="settings-row">
        <label>Low Power Mode</label>
        <div class="settings-toggle ${settings.lowPowerMode ? 'active' : ''}" id="lowpower-toggle"></div>
      </div>

      <div class="settings-buttons">
        <button id="settings-cancel">Cancel</button>
        <button id="settings-save" class="primary">Save</button>
      </div>
    `;

    overlay.appendChild(panel);

    // Toggle handlers
    const toggles = panel.querySelectorAll('.settings-toggle');
    toggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
      });
    });

    // Button handlers
    const cancelBtn = panel.querySelector('#settings-cancel') as HTMLButtonElement;
    const saveBtn = panel.querySelector('#settings-save') as HTMLButtonElement;

    cancelBtn.onclick = () => {
      this.hideSettings();
      onClose();
    };

    saveBtn.onclick = () => {
      const musicVol = (panel.querySelector('#music-vol') as HTMLInputElement).value;
      const sfxVol = (panel.querySelector('#sfx-vol') as HTMLInputElement).value;
      const vibration = panel.querySelector('#vibration-toggle')?.classList.contains('active') ?? settings.vibration;
      const showFpsVal = panel.querySelector('#fps-toggle')?.classList.contains('active') ?? settings.showFps;
      const lowPower = panel.querySelector('#lowpower-toggle')?.classList.contains('active') ?? settings.lowPowerMode;

      onSave({
        musicVolume: parseInt(musicVol) / 100,
        sfxVolume: parseInt(sfxVol) / 100,
        vibration,
        showFps: showFpsVal,
        lowPowerMode: lowPower
      });

      this.hideSettings();
      onClose();
    };

    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.hideSettings();
        onClose();
      }
    };

    this.container.appendChild(overlay);
    this.settingsOverlay = overlay;
  }

  hideSettings(): void {
    if (this.settingsOverlay) {
      this.settingsOverlay.remove();
      this.settingsOverlay = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ITEM SHOP
  // ═══════════════════════════════════════════════════════════════════════════

  private shopOverlay: HTMLElement | null = null;

  showShop(
    coins: number,
    items: ShopItem[],
    onPurchase: (itemId: string) => boolean,
    onClose: () => void
  ): void {
    this.hideShop();

    const overlay = document.createElement('div');
    overlay.className = 'shop-overlay';

    const panel = document.createElement('div');
    panel.className = 'shop-panel animate-scaleIn';

    const header = document.createElement('div');
    header.className = 'shop-header';
    header.innerHTML = `
      <h2>🛒 Item Shop</h2>
      <div class="shop-coins">
        <span class="coin-icon">🪙</span>
        <span class="coin-amount">${coins}</span>
      </div>
    `;
    panel.appendChild(header);

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'shop-items-grid';

    for (const item of items) {
      const itemCard = this.createShopItemCard(item, coins, (itemId) => {
        const success = onPurchase(itemId);
        if (success) {
          // Update coins display and item states
          const coinsEl = panel.querySelector('.coin-amount');
          const newCoins = coins - item.price;
          if (coinsEl) coinsEl.textContent = newCoins.toString();
          coins = newCoins;

          // Update all item cards to reflect new coin balance
          const cards = itemsGrid.querySelectorAll('.shop-item-card');
          cards.forEach((card) => {
            const priceEl = card.querySelector('.item-price');
            const price = parseInt(priceEl?.getAttribute('data-price') || '0');
            const btn = card.querySelector('.buy-btn') as HTMLButtonElement;
            if (btn && price > coins) {
              btn.disabled = true;
              btn.textContent = 'Not Enough';
            }
          });

          // Mark purchased item
          const purchasedCard = itemsGrid.querySelector(`[data-item-id="${itemId}"]`);
          if (purchasedCard) {
            purchasedCard.classList.add('purchased');
            const btn = purchasedCard.querySelector('.buy-btn') as HTMLButtonElement;
            if (btn) {
              btn.disabled = true;
              btn.textContent = 'Purchased!';
            }
          }
        }
      });
      itemsGrid.appendChild(itemCard);
    }

    panel.appendChild(itemsGrid);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'shop-close-btn';
    closeBtn.textContent = 'Close';
    closeBtn.onclick = () => {
      this.hideShop();
      onClose();
    };
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);

    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.hideShop();
        onClose();
      }
    };

    this.container.appendChild(overlay);
    this.shopOverlay = overlay;
  }

  private createShopItemCard(
    item: ShopItem,
    currentCoins: number,
    onBuy: (itemId: string) => void
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = `shop-item-card ${item.owned ? 'purchased' : ''} ${item.rarity}`;
    card.setAttribute('data-item-id', item.id);

    const canAfford = currentCoins >= item.price && !item.owned;

    card.innerHTML = `
      <div class="item-icon">${item.icon}</div>
      <div class="item-name">${item.name}</div>
      <div class="item-description">${item.description}</div>
      <div class="item-price" data-price="${item.price}">
        <span class="coin-icon">🪙</span>
        <span>${item.price}</span>
      </div>
      <button class="buy-btn ${item.owned ? 'purchased' : ''}" ${!canAfford ? 'disabled' : ''}>
        ${item.owned ? 'Owned' : canAfford ? 'Buy' : 'Not Enough'}
      </button>
    `;

    const buyBtn = card.querySelector('.buy-btn') as HTMLButtonElement;
    if (buyBtn && canAfford) {
      buyBtn.onclick = (e) => {
        e.stopPropagation();
        onBuy(item.id);
      };
    }

    return card;
  }

  hideShop(): void {
    if (this.shopOverlay) {
      this.shopOverlay.remove();
      this.shopOverlay = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IN-GAME HUD (COINS, SHOP, SETTINGS BUTTONS)
  // ═══════════════════════════════════════════════════════════════════════════

  private inGameHud: HTMLElement | null = null;

  createInGameHud(
    coins: number,
    onOpenShop: () => void,
    onOpenSettings: () => void,
    onPause: () => void
  ): void {
    this.destroyInGameHud();

    const hud = document.createElement('div');
    hud.className = 'in-game-hud';
    hud.innerHTML = `
      <div class="hud-coins">
        <span class="coin-icon">🪙</span>
        <span class="coin-amount">${coins}</span>
      </div>
      <div class="hud-buttons">
        <button class="hud-btn shop-btn" title="Shop">🛒</button>
        <button class="hud-btn settings-btn" title="Settings">⚙️</button>
        <button class="hud-btn pause-btn" title="Pause">⏸️</button>
      </div>
    `;

    const shopBtn = hud.querySelector('.shop-btn');
    const settingsBtn = hud.querySelector('.settings-btn');
    const pauseBtn = hud.querySelector('.pause-btn');

    shopBtn?.addEventListener('click', onOpenShop);
    settingsBtn?.addEventListener('click', onOpenSettings);
    pauseBtn?.addEventListener('click', onPause);

    this.container.appendChild(hud);
    this.inGameHud = hud;
  }

  updateInGameCoins(coins: number): void {
    if (this.inGameHud) {
      const coinsEl = this.inGameHud.querySelector('.coin-amount');
      if (coinsEl) coinsEl.textContent = coins.toString();
    }
  }

  destroyInGameHud(): void {
    if (this.inGameHud) {
      this.inGameHud.remove();
      this.inGameHud = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAUSE MENU
  // ═══════════════════════════════════════════════════════════════════════════

  private pauseOverlay: HTMLElement | null = null;

  showPauseMenu(
    onResume: () => void,
    onOpenShop: () => void,
    onOpenSettings: () => void,
    onQuit: () => void
  ): void {
    this.hidePauseMenu();

    const overlay = document.createElement('div');
    overlay.className = 'pause-overlay';

    const panel = document.createElement('div');
    panel.className = 'pause-panel animate-scaleIn';
    panel.innerHTML = `
      <h2>PAUSED</h2>
      <button class="pause-menu-btn resume-btn">Resume</button>
      <button class="pause-menu-btn shop-btn">🛒 Shop</button>
      <button class="pause-menu-btn settings-btn">⚙️ Settings</button>
      <button class="pause-menu-btn quit-btn">Quit to Menu</button>
    `;

    const resumeBtn = panel.querySelector('.resume-btn');
    const shopBtn = panel.querySelector('.shop-btn');
    const settingsBtn = panel.querySelector('.settings-btn');
    const quitBtn = panel.querySelector('.quit-btn');

    resumeBtn?.addEventListener('click', () => {
      this.hidePauseMenu();
      onResume();
    });
    shopBtn?.addEventListener('click', onOpenShop);
    settingsBtn?.addEventListener('click', onOpenSettings);
    quitBtn?.addEventListener('click', () => {
      this.hidePauseMenu();
      onQuit();
    });

    overlay.appendChild(panel);
    this.container.appendChild(overlay);
    this.pauseOverlay = overlay;
  }

  hidePauseMenu(): void {
    if (this.pauseOverlay) {
      this.pauseOverlay.remove();
      this.pauseOverlay = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABILITY HUD
  // ═══════════════════════════════════════════════════════════════════════════

  updateAbilityCooldown(cooldownPercent: number): void {
    if (!this.abilityHud) return;

    const cooldownEl = this.abilityHud.querySelector('.ability-cooldown');
    const circle = this.abilityHud.querySelector('circle');

    if (!cooldownEl || !circle) return;

    // Update circle stroke-dashoffset (0 = full, 283 = empty)
    const offset = cooldownPercent * 283;
    circle.setAttribute('stroke-dashoffset', offset.toString());

    // Update class
    if (cooldownPercent <= 0) {
      cooldownEl.classList.add('ready');
      cooldownEl.classList.remove('on-cooldown');
    } else {
      cooldownEl.classList.remove('ready');
      cooldownEl.classList.add('on-cooldown');
    }

    // Update ability button state
    if (this.abilityButton) {
      if (cooldownPercent <= 0) {
        this.abilityButton.classList.remove('on-cooldown');
      } else {
        this.abilityButton.classList.add('on-cooldown');
      }
    }
  }

  setAbilityButtonCallback(callback: () => void): void {
    if (this.abilityButton) {
      this.abilityButton.onclick = callback;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMBO DISPLAY
  // ═══════════════════════════════════════════════════════════════════════════

  private createComboDisplay(): void {
    // Main combo counter display
    const display = document.createElement('div');
    display.id = 'combo-display';
    display.className = 'combo-display';
    display.style.cssText = `
      position: absolute;
      top: 50%;
      right: 24px;
      transform: translateY(-50%);
      text-align: right;
      pointer-events: none;
      z-index: 10;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;
    display.innerHTML = `
      <div class="combo-count" style="
        font-size: 48px;
        font-weight: bold;
        text-shadow: 0 2px 10px rgba(0,0,0,0.5);
        line-height: 1;
      ">0</div>
      <div class="combo-label" style="
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 2px;
        opacity: 0.8;
      ">COMBO</div>
      <div class="combo-timer" style="
        width: 80px;
        height: 4px;
        background: rgba(255,255,255,0.2);
        border-radius: 2px;
        margin-top: 8px;
        margin-left: auto;
        overflow: hidden;
      ">
        <div class="combo-timer-fill" style="
          width: 100%;
          height: 100%;
          background: #4ade80;
          border-radius: 2px;
          transition: width 0.1s linear;
        "></div>
      </div>
      <div class="combo-multiplier" style="
        font-size: 16px;
        margin-top: 4px;
        opacity: 0.9;
      ">x1.0</div>
    `;
    this.container.appendChild(display);
    this.comboDisplay = display;

    // Tier announcement (center screen)
    const announcement = document.createElement('div');
    announcement.id = 'combo-tier-announcement';
    announcement.style.cssText = `
      position: absolute;
      top: 35%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0);
      text-align: center;
      pointer-events: none;
      z-index: 50;
      font-size: 48px;
      font-weight: bold;
      text-shadow: 0 0 20px currentColor, 0 4px 10px rgba(0,0,0,0.5);
      opacity: 0;
    `;
    this.container.appendChild(announcement);
    this.comboTierAnnouncement = announcement;

    // Kill streak announcement (below combo tier)
    const killStreak = document.createElement('div');
    killStreak.id = 'kill-streak-announcement';
    killStreak.style.cssText = `
      position: absolute;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0);
      text-align: center;
      pointer-events: none;
      z-index: 49;
      font-size: 36px;
      font-weight: bold;
      text-shadow: 0 0 15px currentColor, 0 3px 8px rgba(0,0,0,0.5);
      opacity: 0;
      transition: transform 0.15s ease-out, opacity 0.15s ease-out;
    `;
    this.container.appendChild(killStreak);
    this.killStreakAnnouncement = killStreak;
  }

  updateCombo(state: ComboState): void {
    if (!this.comboDisplay) return;

    const countEl = this.comboDisplay.querySelector('.combo-count') as HTMLElement;
    const timerFill = this.comboDisplay.querySelector('.combo-timer-fill') as HTMLElement;
    const multiplierEl = this.comboDisplay.querySelector('.combo-multiplier') as HTMLElement;

    if (state.isActive) {
      this.comboDisplay.style.opacity = '1';

      // Update count with pulse animation
      if (countEl) {
        const prevCount = parseInt(countEl.textContent || '0');
        if (state.count !== prevCount) {
          countEl.textContent = state.count.toString();
          countEl.style.transform = 'scale(1.3)';
          setTimeout(() => {
            countEl.style.transform = 'scale(1)';
          }, 100);
        }
      }

      // Update timer bar
      if (timerFill) {
        const percent = (state.timeRemaining / 3) * 100; // 3s is max
        timerFill.style.width = `${percent}%`;

        // Color based on time remaining
        const tierConfig = COMBO_TIERS[state.tier];
        timerFill.style.background = `#${tierConfig.color.toString(16).padStart(6, '0')}`;
      }

      // Update multiplier
      if (multiplierEl) {
        multiplierEl.textContent = `x${state.multiplier.toFixed(1)}`;
        const tierConfig = COMBO_TIERS[state.tier];
        multiplierEl.style.color = `#${tierConfig.color.toString(16).padStart(6, '0')}`;
      }

      // Update overall color based on tier
      const tierConfig = COMBO_TIERS[state.tier];
      if (countEl) {
        countEl.style.color = `#${tierConfig.color.toString(16).padStart(6, '0')}`;
      }
    } else {
      this.comboDisplay.style.opacity = '0';
    }
  }

  showComboTierUp(tier: ComboTier, config: ComboTierConfig): void {
    if (!this.comboTierAnnouncement || tier === 'none') return;

    const colorHex = `#${config.color.toString(16).padStart(6, '0')}`;

    this.comboTierAnnouncement.textContent = config.name;
    this.comboTierAnnouncement.style.color = colorHex;

    // Animate in
    this.comboTierAnnouncement.style.opacity = '1';
    this.comboTierAnnouncement.style.transform = 'translate(-50%, -50%) scale(1)';

    // Animate out after delay
    setTimeout(() => {
      if (this.comboTierAnnouncement) {
        this.comboTierAnnouncement.style.opacity = '0';
        this.comboTierAnnouncement.style.transform = 'translate(-50%, -50%) scale(1.5)';
      }
    }, 800);

    // Reset transform after animation
    setTimeout(() => {
      if (this.comboTierAnnouncement) {
        this.comboTierAnnouncement.style.transform = 'translate(-50%, -50%) scale(0)';
      }
    }, 1100);
  }

  /**
   * Show kill streak announcement (e.g., "DOUBLE KILL!", "TRIPLE KILL!")
   */
  showKillStreak(name: string, color: number): void {
    if (!this.killStreakAnnouncement) return;

    const colorHex = `#${color.toString(16).padStart(6, '0')}`;

    this.killStreakAnnouncement.textContent = name;
    this.killStreakAnnouncement.style.color = colorHex;

    // Animate in with punch effect
    this.killStreakAnnouncement.style.opacity = '1';
    this.killStreakAnnouncement.style.transform = 'translate(-50%, -50%) scale(1.2)';

    // Settle to normal size
    setTimeout(() => {
      if (this.killStreakAnnouncement) {
        this.killStreakAnnouncement.style.transform = 'translate(-50%, -50%) scale(1)';
      }
    }, 100);

    // Animate out after delay
    setTimeout(() => {
      if (this.killStreakAnnouncement) {
        this.killStreakAnnouncement.style.opacity = '0';
        this.killStreakAnnouncement.style.transform = 'translate(-50%, -50%) scale(1.3)';
      }
    }, 1200);

    // Reset transform after animation
    setTimeout(() => {
      if (this.killStreakAnnouncement) {
        this.killStreakAnnouncement.style.transform = 'translate(-50%, -50%) scale(0)';
      }
    }, 1500);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASS UNLOCK NOTIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  showUnlockNotification(playerClass: PlayerClass, onDismiss: () => void): void {
    this.hideUnlockNotification();

    const notification = document.createElement('div');
    notification.className = 'unlock-notification';

    notification.innerHTML = `
      <h2>NEW CLASS UNLOCKED!</h2>
      <div class="unlock-class-icon" style="background-color: #${playerClass.colors.primary.toString(16).padStart(6, '0')}">
        ${this.getClassIcon(playerClass.id)}
      </div>
      <p><strong>${playerClass.name}</strong></p>
      <p>${playerClass.description}</p>
      <button>AWESOME!</button>
    `;

    const btn = notification.querySelector('button');
    if (btn) {
      btn.onclick = () => {
        this.hideUnlockNotification();
        onDismiss();
      };
    }

    this.container.appendChild(notification);
    this.unlockNotification = notification;
  }

  hideUnlockNotification(): void {
    if (this.unlockNotification) {
      this.unlockNotification.remove();
      this.unlockNotification = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOW POWER MODE
  // ═══════════════════════════════════════════════════════════════════════════

  setLowPowerMode(enabled: boolean): void {
    document.documentElement.setAttribute('data-low-power', enabled.toString());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MINIMAP CONTAINER
  // ═══════════════════════════════════════════════════════════════════════════

  private createMinimapContainer(): void {
    const container = document.createElement('div');
    container.id = 'minimap-container';
    container.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      width: 120px;
      height: 120px;
      z-index: 10;
      pointer-events: none;
      border-radius: 50%;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4), 0 0 20px rgba(74, 144, 226, 0.2);
    `;
    this.container.appendChild(container);
    this.minimapContainer = container;
  }

  getMinimapContainer(): HTMLElement | null {
    return this.minimapContainer;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  dispose(): void {
    this.hearts.forEach((heart) => heart.remove());
    this.bossHealthContainer?.remove();
    this.gameOverOverlay?.remove();
    this.victoryOverlay?.remove();
    this.fpsCounter?.remove();
    this.objectiveDisplay?.remove();
    this.classSelectOverlay?.remove();
    this.settingsOverlay?.remove();
    this.shopOverlay?.remove();
    this.inGameHud?.remove();
    this.pauseOverlay?.remove();
    this.abilityHud?.remove();
    this.abilityButton?.remove();
    this.unlockNotification?.remove();
    this.comboDisplay?.remove();
    this.comboTierAnnouncement?.remove();
    this.minimapContainer?.remove();
    this.clearDamageIndicators();
  }
}

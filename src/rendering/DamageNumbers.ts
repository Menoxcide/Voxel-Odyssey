import * as THREE from 'three';

/**
 * Damage type for color coding
 */
export type DamageType = 'normal' | 'critical' | 'heal';

/**
 * Text type for status messages (non-damage floating text)
 */
export type StatusTextType =
  | 'buff'      // Green - buff applied
  | 'debuff'    // Red - debuff applied
  | 'dodge'     // White - dodged attack
  | 'block'     // Blue - blocked damage
  | 'combo'     // Gold - combo message
  | 'streak'    // Rainbow - kill streak
  | 'pickup'    // Cyan - item pickup
  | 'warning';  // Orange - warning message

/**
 * Internal structure for a pooled damage number element
 */
interface DamageNumberElement {
  container: HTMLElement;
  textElement: HTMLElement;
  active: boolean;
  worldPosition: THREE.Vector3;
  startTime: number;
  duration: number;
  startY: number;
}

/**
 * Configuration for the damage numbers system
 */
interface DamageNumbersConfig {
  maxElements: number;
  duration: number;
  floatHeight: number;
  fontSize: number;
}

const DEFAULT_CONFIG: DamageNumbersConfig = {
  maxElements: 20,
  duration: 1.0,
  floatHeight: 50,
  fontSize: 24
};

/**
 * Damage colors for different types
 */
const DAMAGE_COLORS: Record<DamageType, string> = {
  normal: '#ffffff',
  critical: '#fbbf24', // Gold
  heal: '#4ade80' // Green
};

/**
 * Status text colors
 */
const STATUS_COLORS: Record<StatusTextType, string> = {
  buff: '#4ade80',     // Green
  debuff: '#ef4444',   // Red
  dodge: '#ffffff',    // White
  block: '#60a5fa',    // Blue
  combo: '#fbbf24',    // Gold
  streak: '#a855f7',   // Purple
  pickup: '#22d3ee',   // Cyan
  warning: '#f97316'   // Orange
};

/**
 * DamageNumbers - Floating damage text system using DOM elements
 *
 * Features:
 * - DOM-based for performance (no 3D text)
 * - Object pooling (max 20 active elements)
 * - World-to-screen projection
 * - Color coding for normal/critical/heal
 * - Float up and fade out animation
 */
export class DamageNumbers {
  private readonly pool: DamageNumberElement[];
  private readonly container: HTMLElement;
  private readonly config: DamageNumbersConfig;
  private readonly tempVector: THREE.Vector3;

  // Cached viewport dimensions to avoid recalculating every frame
  private cachedHalfWidth: number;
  private cachedHalfHeight: number;

  // Track active count for early exit optimization
  private activeCount = 0;

  // Bound handler for cleanup
  private readonly resizeHandler: () => void;

  constructor(config: Partial<DamageNumbersConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pool = [];
    this.tempVector = new THREE.Vector3();

    // Cache initial viewport dimensions
    this.cachedHalfWidth = window.innerWidth / 2;
    this.cachedHalfHeight = window.innerHeight / 2;

    // Update cache on resize
    this.resizeHandler = () => {
      this.cachedHalfWidth = window.innerWidth / 2;
      this.cachedHalfHeight = window.innerHeight / 2;
    };
    window.addEventListener('resize', this.resizeHandler);

    // Create container for damage numbers
    this.container = document.createElement('div');
    this.container.id = 'damage-numbers-container';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
      overflow: hidden;
    `;
    document.body.appendChild(this.container);

    // Pre-create pooled elements
    for (let i = 0; i < this.config.maxElements; i++) {
      this.pool.push(this.createDamageElement());
    }
  }

  /**
   * Create a new damage number DOM element for the pool
   */
  private createDamageElement(): DamageNumberElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      transform: translate(-50%, -50%);
      pointer-events: none;
      opacity: 0;
      transition: none;
      will-change: transform, opacity;
    `;

    const textElement = document.createElement('span');
    textElement.style.cssText = `
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: ${this.config.fontSize}px;
      font-weight: bold;
      text-shadow:
        -1px -1px 0 #000,
        1px -1px 0 #000,
        -1px 1px 0 #000,
        1px 1px 0 #000,
        0 2px 4px rgba(0,0,0,0.5);
      white-space: nowrap;
    `;

    container.appendChild(textElement);
    this.container.appendChild(container);

    return {
      container,
      textElement,
      active: false,
      worldPosition: new THREE.Vector3(),
      startTime: 0,
      duration: this.config.duration,
      startY: 0
    };
  }

  /**
   * Get an inactive element from the pool, or recycle the oldest one
   */
  private getAvailableElement(): DamageNumberElement {
    // Find inactive element
    for (const element of this.pool) {
      if (!element.active) {
        return element;
      }
    }

    // All elements active - recycle the oldest (first in pool order that's still active)
    let oldest = this.pool[0];
    for (const element of this.pool) {
      if (element.startTime < oldest.startTime) {
        oldest = element;
      }
    }

    oldest.active = false;
    return oldest;
  }

  /**
   * Show a floating damage number at a world position
   *
   * @param worldPosition - 3D world position where damage occurred
   * @param amount - Damage/heal amount to display
   * @param type - Type of damage for color coding
   * @param isCombo - Whether this is combo damage (shows larger + gold for normal damage)
   */
  show(
    worldPosition: THREE.Vector3,
    amount: number,
    type: DamageType = 'normal',
    isCombo: boolean = false
  ): void {
    const element = this.getAvailableElement();

    // Track active count (only increment if element wasn't already active)
    if (!element.active) {
      this.activeCount++;
    }
    element.active = true;
    element.worldPosition.copy(worldPosition);
    element.startTime = performance.now();
    element.duration = this.config.duration;

    // Format the damage text
    const sign = type === 'heal' ? '+' : '';
    const displayAmount = Math.round(amount);
    element.textElement.textContent = `${sign}${displayAmount}`;

    // Determine color
    let color = DAMAGE_COLORS[type];
    let fontSize = this.config.fontSize;

    // Combo damage gets gold color and larger size for normal hits
    if (isCombo && type === 'normal') {
      color = DAMAGE_COLORS.critical;
      fontSize = this.config.fontSize * 1.3;
    }

    // Critical hits are even larger
    if (type === 'critical') {
      fontSize = this.config.fontSize * 1.5;
    }

    element.textElement.style.color = color;
    element.textElement.style.fontSize = `${fontSize}px`;

    // Reset element state
    element.container.style.opacity = '1';
    element.startY = 0;
  }

  /**
   * Show a floating status text at a world position
   *
   * @param worldPosition - 3D world position
   * @param text - Text to display
   * @param type - Type of status for color coding
   * @param duration - Optional custom duration (default 0.8s)
   */
  showText(
    worldPosition: THREE.Vector3,
    text: string,
    type: StatusTextType = 'buff',
    duration: number = 0.8
  ): void {
    const element = this.getAvailableElement();

    if (!element.active) {
      this.activeCount++;
    }
    element.active = true;
    // Add small random offset to prevent stacking
    element.worldPosition.set(
      worldPosition.x + (Math.random() - 0.5) * 0.5,
      worldPosition.y + 1.5 + Math.random() * 0.5,
      worldPosition.z + (Math.random() - 0.5) * 0.5
    );
    element.startTime = performance.now();
    element.duration = duration;

    element.textElement.textContent = text;
    element.textElement.style.color = STATUS_COLORS[type];

    // Status text is slightly smaller than damage numbers
    const fontSize = type === 'streak' || type === 'combo'
      ? this.config.fontSize * 1.4  // Kill streaks and combos are big
      : this.config.fontSize * 0.9;

    element.textElement.style.fontSize = `${fontSize}px`;
    element.container.style.opacity = '1';
    element.startY = 0;
  }

  /**
   * Show text at screen position (for UI-anchored messages)
   *
   * @param screenX - Screen X position (pixels)
   * @param screenY - Screen Y position (pixels)
   * @param text - Text to display
   * @param type - Type of status for color coding
   * @param duration - Optional custom duration (default 1.0s)
   */
  showTextAtScreen(
    screenX: number,
    screenY: number,
    text: string,
    type: StatusTextType = 'combo',
    duration: number = 1.0
  ): void {
    const element = this.getAvailableElement();

    if (!element.active) {
      this.activeCount++;
    }
    element.active = true;
    // Use screen position directly by setting z to -999 (won't be projected)
    element.worldPosition.set(screenX, screenY, -999);
    element.startTime = performance.now();
    element.duration = duration;

    element.textElement.textContent = text;
    element.textElement.style.color = STATUS_COLORS[type];

    // Center screen text is large
    const fontSize = this.config.fontSize * 1.8;
    element.textElement.style.fontSize = `${fontSize}px`;
    element.container.style.opacity = '1';
    element.startY = screenY;

    // Set initial position immediately to avoid flash at (0,0)
    element.container.style.left = `${screenX}px`;
    element.container.style.top = `${screenY}px`;
    element.container.style.transform = 'translate(-50%, -50%) scale(1.2)';
  }

  /**
   * Update all active damage numbers
   * Projects world positions to screen and animates float/fade
   *
   * @param camera - The camera for world-to-screen projection
   */
  update(camera: THREE.Camera): void {
    // Early exit if no active damage numbers - saves ~500μs per frame on mobile
    if (this.activeCount === 0) return;

    const now = performance.now();

    for (const element of this.pool) {
      if (!element.active) continue;

      const elapsed = (now - element.startTime) / 1000;
      const progress = Math.min(elapsed / element.duration, 1);

      if (progress >= 1) {
        // Animation complete
        element.active = false;
        element.container.style.opacity = '0';
        this.activeCount--;
        continue;
      }

      // Check if this is a screen-positioned element (z = -999)
      const isScreenPositioned = element.worldPosition.z === -999;

      let screenX: number;
      let screenY: number;

      if (isScreenPositioned) {
        // Screen-positioned elements use world position x/y as screen coords directly
        screenX = element.worldPosition.x;
        screenY = element.startY;
      } else {
        // Project world position to screen
        this.tempVector.copy(element.worldPosition);
        this.tempVector.project(camera);

        // Check if behind camera
        if (this.tempVector.z > 1) {
          element.container.style.opacity = '0';
          continue;
        }

        // Convert to screen coordinates using cached viewport dimensions
        screenX = (this.tempVector.x * this.cachedHalfWidth) + this.cachedHalfWidth;
        screenY = -(this.tempVector.y * this.cachedHalfHeight) + this.cachedHalfHeight;
      }

      // Calculate float offset (ease out)
      const floatProgress = 1 - Math.pow(1 - progress, 2);
      const floatY = floatProgress * this.config.floatHeight;

      // Calculate fade (starts fading at 50% through animation)
      const fadeProgress = Math.max(0, (progress - 0.5) * 2);
      const opacity = 1 - fadeProgress;

      // Apply transforms
      element.container.style.left = `${screenX}px`;
      element.container.style.top = `${screenY - floatY}px`;
      element.container.style.opacity = `${opacity}`;

      // Add slight scale animation
      const scale = 1 + (1 - floatProgress) * 0.2;
      element.container.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }
  }

  /**
   * Get count of currently active damage numbers
   */
  getActiveCount(): number {
    return this.pool.filter(e => e.active).length;
  }

  /**
   * Clear all active damage numbers
   */
  clear(): void {
    for (const element of this.pool) {
      element.active = false;
      element.container.style.opacity = '0';
    }
    this.activeCount = 0;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clear();

    // Remove resize listener
    window.removeEventListener('resize', this.resizeHandler);

    // Remove all DOM elements
    for (const element of this.pool) {
      element.container.remove();
    }
    this.pool.length = 0;

    // Remove container
    this.container.remove();
  }
}

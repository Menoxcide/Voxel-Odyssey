import * as THREE from 'three';

/**
 * Health bar entry tracking state for a single enemy
 */
interface HealthBarEntry {
  enemyId: number;
  sprite: THREE.Sprite;
  currentHealth: number;
  maxHealth: number;
  visible: boolean;
  fadeTimer: number;
  lastDamageTime: number;
}

/**
 * Pooled sprite pool entry
 */
interface PooledSprite {
  sprite: THREE.Sprite;
  inUse: boolean;
}

/**
 * EnemyHealthBars - Displays floating health bars above enemies
 *
 * Features:
 * - Billboarded sprites that always face camera
 * - Color gradient from green (full) to red (low)
 * - Appears for 3 seconds after damage, then fades
 * - Only shows for damaged enemies (not full health)
 * - Object pooling for performance
 * - Position updates to follow enemies
 */
export class EnemyHealthBars {
  private readonly scene: THREE.Scene;
  private readonly pool: PooledSprite[] = [];
  private readonly activeEntries: Map<number, HealthBarEntry> = new Map();
  private readonly poolSize: number;

  // Health bar dimensions (in world units)
  private readonly barWidth = 1.2;
  private readonly barHeight = 0.15;
  private readonly yOffset = 1.8; // Height above enemy mesh

  // Timing
  private readonly showDuration = 3.0; // Seconds to show after damage
  private readonly fadeDuration = 0.5; // Seconds to fade out

  // Canvas for rendering health bar texture
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvasWidth = 64;
  private readonly canvasHeight = 8;

  // Unique ID counter for enemies
  private nextEnemyId = 0;

  constructor(scene: THREE.Scene, poolSize: number = 30) {
    this.scene = scene;
    this.poolSize = poolSize;

    // Create offscreen canvas for health bar rendering
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.ctx = ctx;

    // Pre-allocate sprite pool
    this.initializePool();
  }

  /**
   * Initialize the sprite pool with reusable health bar sprites
   */
  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const sprite = this.createHealthBarSprite();
      sprite.visible = false;
      this.scene.add(sprite);

      this.pool.push({
        sprite,
        inUse: false
      });
    }
  }

  /**
   * Create a single health bar sprite with its own texture
   */
  private createHealthBarSprite(): THREE.Sprite {
    // Create a unique canvas and texture for each sprite
    const canvas = document.createElement('canvas');
    canvas.width = this.canvasWidth;
    canvas.height = this.canvasHeight;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(this.barWidth, this.barHeight, 1);

    // Store canvas reference for updates
    sprite.userData.canvas = canvas;
    sprite.userData.ctx = canvas.getContext('2d');
    sprite.userData.texture = texture;

    return sprite;
  }

  /**
   * Get a sprite from the pool
   */
  private acquireSprite(): THREE.Sprite | null {
    for (const pooled of this.pool) {
      if (!pooled.inUse) {
        pooled.inUse = true;
        pooled.sprite.visible = true;
        return pooled.sprite;
      }
    }
    return null; // Pool exhausted
  }

  /**
   * Return a sprite to the pool
   */
  private releaseSprite(sprite: THREE.Sprite): void {
    for (const pooled of this.pool) {
      if (pooled.sprite === sprite) {
        pooled.inUse = false;
        pooled.sprite.visible = false;
        return;
      }
    }
  }

  /**
   * Register an enemy for health bar tracking
   * Returns the unique ID for this enemy
   */
  registerEnemy(maxHealth: number): number {
    const id = this.nextEnemyId++;
    // Entry will be created on first damage
    return id;
  }

  /**
   * Update health for an enemy - shows health bar when damaged
   */
  updateHealth(enemyId: number, currentHealth: number, maxHealth: number): void {
    // Don't show health bar if at full health
    if (currentHealth >= maxHealth) {
      // If there's an existing entry, let it fade out naturally
      const entry = this.activeEntries.get(enemyId);
      if (entry) {
        entry.currentHealth = currentHealth;
        entry.maxHealth = maxHealth;
      }
      return;
    }

    let entry = this.activeEntries.get(enemyId);

    if (!entry) {
      // First time showing health bar for this enemy
      const sprite = this.acquireSprite();
      if (!sprite) {
        // Pool exhausted, skip this enemy
        return;
      }

      entry = {
        enemyId,
        sprite,
        currentHealth,
        maxHealth,
        visible: true,
        fadeTimer: 0,
        lastDamageTime: 0
      };

      this.activeEntries.set(enemyId, entry);
    }

    // Update health values
    entry.currentHealth = currentHealth;
    entry.maxHealth = maxHealth;
    entry.visible = true;
    entry.fadeTimer = this.showDuration; // Reset timer on damage
    entry.lastDamageTime = performance.now();

    // Immediately render the updated health bar
    this.renderHealthBarTexture(entry);
  }

  /**
   * Update the position of an enemy's health bar
   */
  updatePosition(enemyId: number, position: THREE.Vector3): void {
    const entry = this.activeEntries.get(enemyId);
    if (entry && entry.visible) {
      entry.sprite.position.set(
        position.x,
        position.y + this.yOffset,
        position.z
      );
    }
  }

  /**
   * Remove an enemy's health bar (when enemy dies)
   */
  removeEnemy(enemyId: number): void {
    const entry = this.activeEntries.get(enemyId);
    if (entry) {
      this.releaseSprite(entry.sprite);
      this.activeEntries.delete(enemyId);
    }
  }

  /**
   * Main update loop - handles fading and cleanup
   */
  update(delta: number): void {
    const toRemove: number[] = [];

    for (const [enemyId, entry] of this.activeEntries) {
      if (!entry.visible) {
        continue;
      }

      // Decrease fade timer
      entry.fadeTimer -= delta;

      if (entry.fadeTimer <= 0) {
        // Start fading
        const fadeProgress = Math.min(1, -entry.fadeTimer / this.fadeDuration);

        if (fadeProgress >= 1) {
          // Fully faded, hide sprite
          entry.visible = false;
          entry.sprite.visible = false;

          // If at full health, remove entry entirely
          if (entry.currentHealth >= entry.maxHealth) {
            toRemove.push(enemyId);
          }
        } else {
          // Apply fade
          const material = entry.sprite.material as THREE.SpriteMaterial;
          material.opacity = 1 - fadeProgress;
        }
      } else {
        // Ensure full opacity while timer is active
        const material = entry.sprite.material as THREE.SpriteMaterial;
        material.opacity = 1;
      }
    }

    // Clean up fully faded entries that are at full health
    for (const id of toRemove) {
      const entry = this.activeEntries.get(id);
      if (entry) {
        this.releaseSprite(entry.sprite);
        this.activeEntries.delete(id);
      }
    }
  }

  /**
   * Render the health bar texture for an entry
   */
  private renderHealthBarTexture(entry: HealthBarEntry): void {
    const canvas = entry.sprite.userData.canvas as HTMLCanvasElement;
    const ctx = entry.sprite.userData.ctx as CanvasRenderingContext2D;
    const texture = entry.sprite.userData.texture as THREE.CanvasTexture;

    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Background (dark gray with transparency)
    ctx.fillStyle = 'rgba(30, 30, 30, 0.8)';
    ctx.fillRect(0, 0, width, height);

    // Health percentage
    const healthPercent = Math.max(0, Math.min(1, entry.currentHealth / entry.maxHealth));
    const barWidth = (width - 2) * healthPercent;

    // Color gradient: green -> yellow -> red based on health
    const color = this.getHealthColor(healthPercent);
    ctx.fillStyle = color;
    ctx.fillRect(1, 1, barWidth, height - 2);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // Update texture
    texture.needsUpdate = true;
  }

  /**
   * Get color for health bar based on health percentage
   * Green (100%) -> Yellow (50%) -> Red (0%)
   */
  private getHealthColor(percent: number): string {
    if (percent > 0.5) {
      // Green to Yellow (100% -> 50%)
      const t = (percent - 0.5) * 2; // 1 at 100%, 0 at 50%
      const r = Math.round(255 * (1 - t));
      const g = 255;
      return `rgb(${r}, ${g}, 0)`;
    } else {
      // Yellow to Red (50% -> 0%)
      const t = percent * 2; // 1 at 50%, 0 at 0%
      const r = 255;
      const g = Math.round(255 * t);
      return `rgb(${r}, ${g}, 0)`;
    }
  }

  /**
   * Check if an enemy currently has an active health bar
   */
  hasActiveHealthBar(enemyId: number): boolean {
    const entry = this.activeEntries.get(enemyId);
    return entry !== undefined && entry.visible;
  }

  /**
   * Get the number of active health bars
   */
  getActiveCount(): number {
    let count = 0;
    for (const entry of this.activeEntries.values()) {
      if (entry.visible) {
        count++;
      }
    }
    return count;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    // Clear all active entries
    this.activeEntries.clear();

    // Dispose all pooled sprites
    for (const pooled of this.pool) {
      const sprite = pooled.sprite;

      // Dispose texture
      const texture = sprite.userData.texture as THREE.CanvasTexture;
      if (texture) {
        texture.dispose();
      }

      // Dispose material
      const material = sprite.material as THREE.SpriteMaterial;
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();

      // Remove from scene
      this.scene.remove(sprite);
    }

    this.pool.length = 0;
  }
}

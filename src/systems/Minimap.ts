/**
 * Minimap/Radar System for Voxel Odyssey
 *
 * Renders a circular radar in the top-right corner showing:
 * - Player (centered triangle indicating look direction)
 * - Enemies (red dots)
 * - Boss (larger purple dot)
 *
 * Uses Canvas 2D for rendering (not WebGL) and updates at 10fps for performance.
 */

export interface MinimapConfig {
  /** Radius of the minimap in pixels */
  size: number;
  /** Detection range in world units */
  range: number;
  /** Background opacity (0-1) */
  backgroundOpacity: number;
  /** Border width in pixels */
  borderWidth: number;
}

export interface EntityPosition {
  x: number;
  z: number;
}

const DEFAULT_CONFIG: MinimapConfig = {
  size: 120,
  range: 30,
  backgroundOpacity: 0.6,
  borderWidth: 2
};

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly config: MinimapConfig;

  // Update throttling (10fps = 100ms interval)
  private readonly updateInterval = 100; // ms
  private lastUpdateTime = 0;

  // Cached data for rendering
  private playerPosition: EntityPosition = { x: 0, z: 0 };
  private playerRotation = 0;
  private enemyPositions: EntityPosition[] = [];
  private bossPosition: EntityPosition | null = null;

  // Visibility state
  private isVisible = true;

  // Colors
  private readonly colors = {
    background: 'rgba(10, 10, 20, 0.6)',
    border: 'rgba(74, 144, 226, 0.8)',
    grid: 'rgba(255, 255, 255, 0.1)',
    player: '#4a90e2',
    enemy: '#ef4444',
    boss: '#a855f7',
    rangeRing: 'rgba(255, 255, 255, 0.15)'
  };

  constructor(container: HTMLElement, config: Partial<MinimapConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create canvas
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap-canvas';
    this.canvas.width = this.config.size * 2; // 2x for retina
    this.canvas.height = this.config.size * 2;
    this.canvas.style.width = `${this.config.size}px`;
    this.canvas.style.height = `${this.config.size}px`;

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D context for minimap canvas');
    }
    this.ctx = context;

    // Scale for retina display
    this.ctx.scale(2, 2);

    container.appendChild(this.canvas);

    // Initial render
    this.render();
  }

  /**
   * Update minimap data - should be called every frame
   * Actual rendering is throttled to 10fps
   */
  update(
    playerPos: EntityPosition,
    playerRot: number,
    enemies: EntityPosition[],
    bossPos: EntityPosition | null = null
  ): void {
    if (!this.isVisible) return;

    const now = performance.now();
    if (now - this.lastUpdateTime < this.updateInterval) {
      return;
    }
    this.lastUpdateTime = now;

    // Update cached data
    this.playerPosition = playerPos;
    this.playerRotation = playerRot;
    this.enemyPositions = enemies;
    this.bossPosition = bossPos;

    // Render
    this.render();
  }

  /**
   * Render the minimap
   */
  private render(): void {
    const size = this.config.size;
    const center = size / 2;
    const radius = center - this.config.borderWidth;

    // Clear canvas
    this.ctx.clearRect(0, 0, size, size);

    // Clip to circle
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(center, center, radius, 0, Math.PI * 2);
    this.ctx.clip();

    // Background
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, size, size);

    // Range rings (at 33% and 66% of range)
    this.drawRangeRings(center, radius);

    // Grid lines
    this.drawGrid(center, radius);

    // Draw entities (relative to player position)
    this.drawEnemies(center, radius);
    if (this.bossPosition) {
      this.drawBoss(center, radius);
    }

    // Player indicator (always at center)
    this.drawPlayer(center);

    this.ctx.restore();

    // Border
    this.drawBorder(center, radius);
  }

  /**
   * Draw range indicator rings
   */
  private drawRangeRings(center: number, radius: number): void {
    this.ctx.strokeStyle = this.colors.rangeRing;
    this.ctx.lineWidth = 1;

    // 33% ring
    this.ctx.beginPath();
    this.ctx.arc(center, center, radius * 0.33, 0, Math.PI * 2);
    this.ctx.stroke();

    // 66% ring
    this.ctx.beginPath();
    this.ctx.arc(center, center, radius * 0.66, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  /**
   * Draw subtle grid lines
   */
  private drawGrid(center: number, radius: number): void {
    this.ctx.strokeStyle = this.colors.grid;
    this.ctx.lineWidth = 0.5;

    // Horizontal line
    this.ctx.beginPath();
    this.ctx.moveTo(center - radius, center);
    this.ctx.lineTo(center + radius, center);
    this.ctx.stroke();

    // Vertical line
    this.ctx.beginPath();
    this.ctx.moveTo(center, center - radius);
    this.ctx.lineTo(center, center + radius);
    this.ctx.stroke();
  }

  /**
   * Draw player triangle indicator at center
   */
  private drawPlayer(center: number): void {
    const size = 8;

    this.ctx.save();
    this.ctx.translate(center, center);
    this.ctx.rotate(-this.playerRotation); // Negative because canvas Y is inverted

    // Triangle pointing up (forward direction)
    this.ctx.fillStyle = this.colors.player;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -size);          // Top point
    this.ctx.lineTo(-size * 0.6, size * 0.6);  // Bottom left
    this.ctx.lineTo(size * 0.6, size * 0.6);   // Bottom right
    this.ctx.closePath();
    this.ctx.fill();

    // Glow effect
    this.ctx.shadowColor = this.colors.player;
    this.ctx.shadowBlur = 8;
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    this.ctx.restore();
  }

  /**
   * Draw enemies as red dots
   */
  private drawEnemies(center: number, radius: number): void {
    const scale = radius / this.config.range;

    for (const enemy of this.enemyPositions) {
      // Calculate relative position
      const relX = enemy.x - this.playerPosition.x;
      const relZ = enemy.z - this.playerPosition.z;

      // Check if within range
      const dist = Math.sqrt(relX * relX + relZ * relZ);
      if (dist > this.config.range) continue;

      // Convert to screen coordinates
      // Note: Z in world = Y on minimap (north), X stays X
      const screenX = center + relX * scale;
      const screenY = center - relZ * scale; // Inverted for proper north orientation

      // Draw dot
      this.ctx.fillStyle = this.colors.enemy;
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, 4, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  /**
   * Draw boss as larger purple dot
   */
  private drawBoss(center: number, radius: number): void {
    if (!this.bossPosition) return;

    const scale = radius / this.config.range;

    // Calculate relative position
    const relX = this.bossPosition.x - this.playerPosition.x;
    const relZ = this.bossPosition.z - this.playerPosition.z;

    // Check if within range
    const dist = Math.sqrt(relX * relX + relZ * relZ);
    if (dist > this.config.range) return;

    // Convert to screen coordinates
    const screenX = center + relX * scale;
    const screenY = center - relZ * scale;

    // Draw larger dot with glow
    this.ctx.save();
    this.ctx.shadowColor = this.colors.boss;
    this.ctx.shadowBlur = 10;
    this.ctx.fillStyle = this.colors.boss;
    this.ctx.beginPath();
    this.ctx.arc(screenX, screenY, 7, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Inner highlight
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    this.ctx.beginPath();
    this.ctx.arc(screenX - 2, screenY - 2, 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * Draw circular border
   */
  private drawBorder(center: number, radius: number): void {
    this.ctx.strokeStyle = this.colors.border;
    this.ctx.lineWidth = this.config.borderWidth;
    this.ctx.beginPath();
    this.ctx.arc(center, center, radius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Outer glow
    this.ctx.strokeStyle = 'rgba(74, 144, 226, 0.3)';
    this.ctx.lineWidth = 4;
    this.ctx.stroke();
  }

  /**
   * Set minimap visibility
   */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.canvas.style.display = visible ? 'block' : 'none';

    if (visible) {
      this.render();
    }
  }

  /**
   * Toggle minimap visibility
   */
  toggle(): void {
    this.setVisible(!this.isVisible);
  }

  /**
   * Check if minimap is visible
   */
  getVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Update minimap range
   */
  setRange(range: number): void {
    this.config.range = range;
  }

  /**
   * Get current range
   */
  getRange(): number {
    return this.config.range;
  }

  /**
   * Dispose of minimap resources
   */
  dispose(): void {
    this.canvas.remove();
  }
}

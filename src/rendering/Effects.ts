import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Particle importance levels for budget management
export enum ParticlePriority {
  LOW = 0,      // Trails, ambient effects
  MEDIUM = 1,   // Hit sparks, standard effects
  HIGH = 2      // Explosions, critical feedback
}

// Particle pool for efficiency
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
  priority: ParticlePriority;
}

export class ParticleSystem {
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly points: THREE.Points;
  private readonly particles: Particle[];
  private readonly maxParticles: number;

  // Buffer attributes
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;

  // Camera reference for LOD calculations
  private camera: THREE.Camera | null = null;

  // LOD distance thresholds
  private readonly LOD_NEAR = 20;     // 100% particles within this distance
  private readonly LOD_MID = 40;      // 50% particles at this distance
  private readonly LOD_FAR = 60;      // 25% particles beyond this distance

  // Budget management
  private readonly particleBudget: number;
  private activeParticleCount = 0;

  constructor(maxParticles: number = 1000) {
    this.maxParticles = maxParticles;
    this.particleBudget = maxParticles;
    this.particles = [];

    // Initialize particle pool
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(),
        life: 0,
        maxLife: 1,
        size: 1,
        active: false,
        priority: ParticlePriority.MEDIUM
      });
    }

    // Create buffer geometry
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Create material
    this.material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /**
   * Set the camera reference for distance-based LOD calculations
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Calculate the LOD scale factor based on distance from camera
   * Returns a multiplier for particle count (1.0 = full, 0.5 = half, 0.25 = quarter)
   */
  private calculateLODScale(position: THREE.Vector3): number {
    if (!this.camera) return 1.0;

    const distance = this.camera.position.distanceTo(position);

    if (distance <= this.LOD_NEAR) {
      return 1.0;  // 100% particles
    } else if (distance <= this.LOD_MID) {
      // Linear interpolation from 100% to 50%
      const t = (distance - this.LOD_NEAR) / (this.LOD_MID - this.LOD_NEAR);
      return 1.0 - t * 0.5;
    } else if (distance <= this.LOD_FAR) {
      // Linear interpolation from 50% to 25%
      const t = (distance - this.LOD_MID) / (this.LOD_FAR - this.LOD_MID);
      return 0.5 - t * 0.25;
    } else {
      return 0.25;  // 25% particles beyond far distance
    }
  }

  /**
   * Calculate lifetime multiplier based on distance (distant particles fade faster)
   */
  private calculateLifetimeScale(position: THREE.Vector3): number {
    if (!this.camera) return 1.0;

    const distance = this.camera.position.distanceTo(position);

    if (distance <= this.LOD_NEAR) {
      return 1.0;  // Full lifetime
    } else if (distance <= this.LOD_FAR) {
      // Linear interpolation from 100% to 50% lifetime
      const t = (distance - this.LOD_NEAR) / (this.LOD_FAR - this.LOD_NEAR);
      return 1.0 - t * 0.5;
    } else {
      return 0.5;  // 50% lifetime beyond far distance
    }
  }

  /**
   * Check if we should skip low-priority particles due to budget constraints
   */
  private shouldSkipForBudget(priority: ParticlePriority): boolean {
    // Calculate remaining budget
    const usedRatio = this.activeParticleCount / this.particleBudget;

    // When near budget limit (>80%), skip low priority particles
    if (usedRatio > 0.8 && priority === ParticlePriority.LOW) {
      return true;
    }

    // When very near limit (>90%), also skip medium priority
    if (usedRatio > 0.9 && priority === ParticlePriority.MEDIUM) {
      return true;
    }

    return false;
  }

  /**
   * Emit particles with distance-based LOD and priority support
   */
  emit(
    position: THREE.Vector3,
    count: number,
    color: number,
    spread: number = 1,
    speed: number = 2,
    lifetime: number = 1,
    priority: ParticlePriority = ParticlePriority.MEDIUM
  ): void {
    // Check budget constraints for low-priority particles
    if (this.shouldSkipForBudget(priority)) {
      return;
    }

    // Apply distance-based LOD scaling
    const lodScale = this.calculateLODScale(position);
    const adjustedCount = Math.max(1, Math.floor(count * lodScale));

    // Apply distance-based lifetime scaling
    const lifetimeScale = this.calculateLifetimeScale(position);
    const adjustedLifetime = lifetime * lifetimeScale;

    let emitted = 0;

    for (let i = 0; i < this.maxParticles && emitted < adjustedCount; i++) {
      const particle = this.particles[i];

      if (!particle.active) {
        particle.position.copy(position);
        particle.velocity.set(
          (Math.random() - 0.5) * spread,
          Math.random() * spread,
          (Math.random() - 0.5) * spread
        ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.5));

        particle.color.setHex(color);
        particle.life = adjustedLifetime;
        particle.maxLife = adjustedLifetime;
        particle.size = 0.2 + Math.random() * 0.3;
        particle.active = true;
        particle.priority = priority;

        emitted++;
      }
    }
  }

  /**
   * Emit magic trail effect (low priority - can be skipped when near budget)
   */
  emitTrail(position: THREE.Vector3, color: number): void {
    this.emit(position, 3, color, 0.2, 0.5, 0.5, ParticlePriority.LOW);
  }

  /**
   * Emit hit sparks (medium priority)
   */
  emitHitSparks(position: THREE.Vector3, color: number = 0xffffff): void {
    this.emit(position, 15, color, 2, 5, 0.3, ParticlePriority.MEDIUM);
  }

  /**
   * Emit explosion (high priority - always rendered, never skipped)
   */
  emitExplosion(position: THREE.Vector3, color: number): void {
    this.emit(position, 50, color, 3, 8, 0.8, ParticlePriority.HIGH);
  }

  /**
   * Emit critical hit burst (high priority - more impactful than regular hit)
   * Creates a large golden/white burst with extra particles
   */
  emitCriticalBurst(position: THREE.Vector3): void {
    // Core golden burst
    this.emit(position, 30, 0xffd700, 4, 8, 0.5, ParticlePriority.HIGH);
    // White sparkle overlay
    this.emit(position, 15, 0xffffff, 3, 6, 0.3, ParticlePriority.HIGH);
  }

  update(delta: number): void {
    let activeCount = 0;
    let writeIndex = 0;

    // Compact active particles to front of pool for efficient iteration
    // This reduces iteration from maxParticles to activeCount in subsequent frames
    for (let i = 0; i < this.maxParticles; i++) {
      const particle = this.particles[i];

      if (particle.active) {
        particle.life -= delta;

        if (particle.life <= 0) {
          particle.active = false;
          continue;
        }

        // Update physics
        particle.velocity.y -= 5 * delta; // Gravity
        particle.position.addScaledVector(particle.velocity, delta);

        // Compact: move active particle to front if needed
        if (i !== writeIndex) {
          // Swap particle data (swap references, not copy)
          const temp = this.particles[writeIndex];
          this.particles[writeIndex] = particle;
          this.particles[i] = temp;
        }

        // Update buffers at compacted index
        const i3 = writeIndex * 3;
        this.positions[i3] = particle.position.x;
        this.positions[i3 + 1] = particle.position.y;
        this.positions[i3 + 2] = particle.position.z;

        // Fade color based on life
        const lifeRatio = particle.life / particle.maxLife;
        this.colors[i3] = particle.color.r * lifeRatio;
        this.colors[i3 + 1] = particle.color.g * lifeRatio;
        this.colors[i3 + 2] = particle.color.b * lifeRatio;

        this.sizes[writeIndex] = particle.size * lifeRatio;

        writeIndex++;
        activeCount++;
      }
    }

    // Track active particle count for budget management
    this.activeParticleCount = activeCount;

    // Only update GPU buffers if we have active particles
    // This prevents unnecessary GPU uploads when no particles are active
    if (activeCount > 0 || this.geometry.drawRange.count > 0) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.color.needsUpdate = true;
      this.geometry.attributes.size.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, activeCount);
  }

  /**
   * Get the current active particle count for debugging/monitoring
   */
  getActiveCount(): number {
    return this.activeParticleCount;
  }

  getPoints(): THREE.Points {
    return this.points;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// Post-processing effects manager
export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private enabled = true;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.composer = new EffectComposer(renderer);

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Bloom pass (subtle glow)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3,  // Strength
      0.4,  // Radius
      0.85  // Threshold
    );
    this.composer.addPass(this.bloomPass);
  }

  render(): void {
    if (this.enabled) {
      this.composer.render();
    }
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setBloomStrength(strength: number): void {
    this.bloomPass.strength = strength;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.composer.dispose();
  }
}

// Screen shake effect
export class ScreenShake {
  private intensity = 0;
  private readonly decay = 5;
  private readonly originalPosition = new THREE.Vector3();

  shake(amount: number): void {
    this.intensity = Math.max(this.intensity, amount);
  }

  update(delta: number, camera: THREE.Camera): void {
    if (this.intensity > 0.01) {
      // Store original if not shaking
      if (this.intensity === this.intensity) {
        this.originalPosition.copy(camera.position);
      }

      // Apply shake
      camera.position.x += (Math.random() - 0.5) * this.intensity;
      camera.position.y += (Math.random() - 0.5) * this.intensity;

      // Decay
      this.intensity *= Math.pow(0.1, delta * this.decay);

      if (this.intensity < 0.01) {
        this.intensity = 0;
      }
    }
  }

  getIntensity(): number {
    return this.intensity;
  }
}

// Hit stop effect (brief freeze on impact)
export class HitStop {
  private freezeTime = 0;
  private timeScale = 1;

  trigger(duration: number = 0.05): void {
    this.freezeTime = duration;
    this.timeScale = 0.1;
  }

  update(delta: number): number {
    if (this.freezeTime > 0) {
      this.freezeTime -= delta;

      if (this.freezeTime <= 0) {
        this.timeScale = 1;
      }

      return delta * this.timeScale;
    }

    return delta;
  }

  isActive(): boolean {
    return this.freezeTime > 0;
  }
}

// Low health vignette overlay (CSS-based for mobile performance)
export class HealthVignette {
  private readonly overlay: HTMLDivElement;
  private currentIntensity = 0;
  private targetIntensity = 0;
  private readonly transitionSpeed = 5; // Units per second
  private pulsePhase = 0;
  private isPulsing = false;
  private animationFrameId: number | null = null;

  constructor() {
    // Create overlay element
    this.overlay = document.createElement('div');
    this.overlay.id = 'health-vignette';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
      opacity: 0;
      background: radial-gradient(
        ellipse at center,
        transparent 40%,
        rgba(180, 0, 0, 0.3) 70%,
        rgba(120, 0, 0, 0.6) 100%
      );
    `;
    document.body.appendChild(this.overlay);

    // Start animation loop
    this.animate();
  }

  /**
   * Update vignette based on health values
   * @param currentHealth Current player health
   * @param maxHealth Maximum player health
   */
  update(currentHealth: number, maxHealth: number): void {
    // Calculate health ratio
    const healthRatio = Math.max(0, Math.min(1, currentHealth / maxHealth));

    // Intensity scales inversely with health
    // 0% at full health, 50% at 1 heart (assuming 3 hearts max, 1 heart = 33%)
    if (healthRatio >= 1) {
      this.targetIntensity = 0;
      this.isPulsing = false;
    } else if (healthRatio <= 0.34) {
      // Critical health (1 heart or less) - pulse at 50% base intensity
      this.targetIntensity = 0.5;
      this.isPulsing = true;
    } else if (healthRatio <= 0.67) {
      // Low health (2 hearts) - 25% intensity, no pulse
      this.targetIntensity = 0.25;
      this.isPulsing = false;
    } else {
      // Slightly damaged - minor vignette
      this.targetIntensity = 0.1;
      this.isPulsing = false;
    }
  }

  private animate(): void {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    const delta = 1 / 60; // Approximate frame time

    // Smooth transition to target intensity
    if (this.currentIntensity !== this.targetIntensity) {
      const diff = this.targetIntensity - this.currentIntensity;
      const step = this.transitionSpeed * delta;

      if (Math.abs(diff) <= step) {
        this.currentIntensity = this.targetIntensity;
      } else {
        this.currentIntensity += Math.sign(diff) * step;
      }
    }

    // Calculate final opacity with pulse effect
    let finalOpacity = this.currentIntensity;

    if (this.isPulsing && this.currentIntensity > 0) {
      this.pulsePhase += delta * 4; // Pulse frequency
      // Pulse between 70% and 100% of target intensity
      const pulseMultiplier = 0.85 + 0.15 * Math.sin(this.pulsePhase);
      finalOpacity = this.currentIntensity * pulseMultiplier;
    }

    // Apply opacity to overlay
    this.overlay.style.opacity = String(finalOpacity);

    // Adjust gradient intensity based on severity
    if (finalOpacity > 0) {
      const innerTransparent = 40 - finalOpacity * 20; // Inner circle shrinks at low health
      const midOpacity = 0.3 + finalOpacity * 0.3;
      const outerOpacity = 0.6 + finalOpacity * 0.3;

      this.overlay.style.background = `radial-gradient(
        ellipse at center,
        transparent ${innerTransparent}%,
        rgba(180, 0, 0, ${midOpacity}) 70%,
        rgba(120, 0, 0, ${outerOpacity}) 100%
      )`;
    }
  }

  /**
   * Force immediate intensity update (for sudden health changes)
   * @param intensity Value from 0 to 1
   */
  setImmediateIntensity(intensity: number): void {
    this.currentIntensity = Math.max(0, Math.min(1, intensity));
    this.targetIntensity = this.currentIntensity;
  }

  /**
   * Trigger a brief flash effect (e.g., when taking damage)
   */
  flash(): void {
    // Briefly increase intensity, then return to target
    const previousTarget = this.targetIntensity;
    this.currentIntensity = Math.min(1, this.currentIntensity + 0.3);

    // Let animate() smooth it back to target
    setTimeout(() => {
      this.targetIntensity = previousTarget;
    }, 100);
  }

  dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
  }
}

// Impact vortex effect - expanding ring on projectile hits
interface VortexInstance {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  active: boolean;
}

export class ImpactVortex {
  private readonly scene: THREE.Scene;
  private readonly pool: VortexInstance[] = [];
  private readonly poolSize = 10;

  // Shared geometry and materials for efficiency
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly normalMaterial: THREE.MeshBasicMaterial;
  private readonly criticalMaterial: THREE.MeshBasicMaterial;

  // Cached vector for position updates
  private readonly tempPosition = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Create shared geometry (thin ring)
    this.ringGeometry = new THREE.RingGeometry(0.8, 1.0, 16);

    // Normal hit material (blue/cyan)
    this.normalMaterial = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Critical hit material (gold/orange)
    this.criticalMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    // Pre-allocate pool
    for (let i = 0; i < this.poolSize; i++) {
      const mesh = new THREE.Mesh(this.ringGeometry, this.normalMaterial);
      mesh.visible = false;
      mesh.rotation.x = -Math.PI / 2; // Lay flat
      scene.add(mesh);

      this.pool.push({
        mesh,
        life: 0,
        maxLife: 0.3,
        startScale: 0.5,
        endScale: 2.5,
        active: false
      });
    }
  }

  /**
   * Spawn an impact vortex at the given position.
   * @param position World position for the vortex
   * @param isCritical Use gold/orange color for critical hits
   * @param color Optional custom color (hex)
   */
  spawn(position: THREE.Vector3, isCritical: boolean = false, color?: number): void {
    // Find inactive vortex in pool
    const vortex = this.pool.find(v => !v.active);
    if (!vortex) return; // Pool exhausted

    // Position the mesh
    vortex.mesh.position.copy(position);
    vortex.mesh.position.y += 0.1; // Slight offset above ground

    // Set material based on type
    if (color !== undefined) {
      // Custom color - create temporary material
      (vortex.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    } else {
      vortex.mesh.material = isCritical ? this.criticalMaterial : this.normalMaterial;
    }

    // Reset state
    vortex.life = vortex.maxLife;
    vortex.mesh.scale.setScalar(vortex.startScale);
    vortex.mesh.visible = true;
    vortex.active = true;

    // Random rotation for variety
    vortex.mesh.rotation.z = Math.random() * Math.PI * 2;
  }

  /**
   * Update all active vortices - call each frame.
   */
  update(delta: number): void {
    for (const vortex of this.pool) {
      if (!vortex.active) continue;

      vortex.life -= delta;

      if (vortex.life <= 0) {
        vortex.active = false;
        vortex.mesh.visible = false;
        continue;
      }

      // Calculate progress (0 = just spawned, 1 = about to disappear)
      const progress = 1 - (vortex.life / vortex.maxLife);

      // Expand scale
      const scale = vortex.startScale + (vortex.endScale - vortex.startScale) * progress;
      vortex.mesh.scale.setScalar(scale);

      // Fade out opacity
      const material = vortex.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = (1 - progress) * 0.8;

      // Rotate for visual interest
      vortex.mesh.rotation.z += delta * 3;
    }
  }

  /**
   * Get active vortex count for debugging.
   */
  getActiveCount(): number {
    return this.pool.filter(v => v.active).length;
  }

  dispose(): void {
    for (const vortex of this.pool) {
      this.scene.remove(vortex.mesh);
    }
    this.ringGeometry.dispose();
    this.normalMaterial.dispose();
    this.criticalMaterial.dispose();
  }
}

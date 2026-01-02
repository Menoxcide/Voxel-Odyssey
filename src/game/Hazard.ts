import * as THREE from 'three';

export enum HazardType {
  LAVA = 'lava',
  ICE = 'ice',
  SPIKES = 'spikes'
}

export interface HazardConfig {
  type: HazardType;
  position: { x: number; y: number; z: number };
  radius: number;
  damage?: number;        // For lava/spikes
  damageRate?: number;    // Damage per second (lava)
  slowFactor?: number;    // For ice (0.5 = 50% speed)
  cooldown?: number;      // Spike cooldown between triggers
}

interface HazardCallbacks {
  onDamage: (amount: number, position: THREE.Vector3) => void;
  onSlowApply: (factor: number) => void;
  onSlowRemove: () => void;
  onParticleEmit: (position: THREE.Vector3, count: number, color: number) => void;
}

abstract class BaseHazard {
  protected readonly mesh: THREE.Group;
  protected readonly position: THREE.Vector3;
  protected readonly radius: number;
  protected isPlayerInside = false;

  constructor(config: HazardConfig) {
    this.position = new THREE.Vector3(config.position.x, config.position.y, config.position.z);
    this.radius = config.radius;
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);
  }

  abstract update(delta: number, playerPos: THREE.Vector3, callbacks: HazardCallbacks): void;

  getMesh(): THREE.Group {
    return this.mesh;
  }

  getPosition(): THREE.Vector3 {
    return this.position;
  }

  checkPlayerInside(playerPos: THREE.Vector3): boolean {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    return (dx * dx + dz * dz) < (this.radius * this.radius);
  }

  dispose(): void {
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });
  }
}

/**
 * Lava Pool - Deals continuous damage while player is inside
 */
export class LavaPool extends BaseHazard {
  private readonly damage: number;
  private readonly damageRate: number;
  private damageTimer = 0;
  private animTime = 0;

  constructor(config: HazardConfig) {
    super(config);
    this.damage = config.damage ?? 1;
    this.damageRate = config.damageRate ?? 0.5; // Damage every 0.5s

    this.createVisual();
  }

  private createVisual(): void {
    // Base lava pool (flat cylinder)
    const poolGeo = new THREE.CylinderGeometry(this.radius, this.radius, 0.15, 24);
    const poolMat = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: 0xff2200,
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.1
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.y = 0.08;
    pool.receiveShadow = true;
    this.mesh.add(pool);

    // Glowing rim
    const rimGeo = new THREE.TorusGeometry(this.radius, 0.1, 8, 24);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff4400,
      emissiveIntensity: 1.0
    });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.15;
    this.mesh.add(rim);
  }

  update(delta: number, playerPos: THREE.Vector3, callbacks: HazardCallbacks): void {
    this.animTime += delta;

    // Animate lava glow
    const glowIntensity = 0.6 + Math.sin(this.animTime * 3) * 0.2;
    const pool = this.mesh.children[0] as THREE.Mesh;
    if (pool.material instanceof THREE.MeshStandardMaterial) {
      pool.material.emissiveIntensity = glowIntensity;
    }

    // Check player collision
    const wasInside = this.isPlayerInside;
    this.isPlayerInside = this.checkPlayerInside(playerPos);

    if (this.isPlayerInside) {
      this.damageTimer += delta;

      // Deal damage at rate
      if (this.damageTimer >= this.damageRate) {
        this.damageTimer = 0;
        callbacks.onDamage(this.damage, this.position);
        callbacks.onParticleEmit(playerPos.clone().setY(playerPos.y + 0.5), 10, 0xff4400);
      }

      // Emit particles while inside
      if (Math.random() < 0.3) {
        const particlePos = this.position.clone();
        particlePos.x += (Math.random() - 0.5) * this.radius;
        particlePos.z += (Math.random() - 0.5) * this.radius;
        particlePos.y += 0.2;
        callbacks.onParticleEmit(particlePos, 2, 0xff6600);
      }
    } else {
      this.damageTimer = 0;
    }
  }
}

/**
 * Ice Patch - Slows player movement while inside
 */
export class IcePatch extends BaseHazard {
  private readonly slowFactor: number;
  private animTime = 0;

  constructor(config: HazardConfig) {
    super(config);
    this.slowFactor = config.slowFactor ?? 0.5;

    this.createVisual();
  }

  private createVisual(): void {
    // Ice surface
    const iceGeo = new THREE.CylinderGeometry(this.radius, this.radius, 0.08, 24);
    const iceMat = new THREE.MeshStandardMaterial({
      color: 0x88ddff,
      emissive: 0x44aaff,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.7,
      roughness: 0.1,
      metalness: 0.3
    });
    const ice = new THREE.Mesh(iceGeo, iceMat);
    ice.position.y = 0.04;
    ice.receiveShadow = true;
    this.mesh.add(ice);

    // Frost crystals around edge
    const crystalGeo = new THREE.OctahedronGeometry(0.15, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0xccffff,
      emissive: 0x88ddff,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.8
    });

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.position.set(
        Math.cos(angle) * this.radius * 0.9,
        0.12,
        Math.sin(angle) * this.radius * 0.9
      );
      crystal.rotation.y = angle;
      this.mesh.add(crystal);
    }
  }

  update(delta: number, playerPos: THREE.Vector3, callbacks: HazardCallbacks): void {
    this.animTime += delta;

    // Animate crystal shimmer
    const shimmer = 0.4 + Math.sin(this.animTime * 2) * 0.1;
    for (let i = 1; i < this.mesh.children.length; i++) {
      const crystal = this.mesh.children[i] as THREE.Mesh;
      if (crystal.material instanceof THREE.MeshStandardMaterial) {
        crystal.material.emissiveIntensity = shimmer;
      }
      crystal.rotation.y += delta * 0.5;
    }

    // Check player collision
    const wasInsideIce = this.isPlayerInside;
    this.isPlayerInside = this.checkPlayerInside(playerPos);

    if (this.isPlayerInside && !wasInsideIce) {
      // Player entered - apply slow
      callbacks.onSlowApply(this.slowFactor);
      callbacks.onParticleEmit(playerPos, 8, 0x88ddff);
    } else if (!this.isPlayerInside && wasInsideIce) {
      // Player left - remove slow
      callbacks.onSlowRemove();
    }
  }
}

/**
 * Spike Trap - Deals instant damage on contact with cooldown
 */
export class SpikeTrap extends BaseHazard {
  private readonly damage: number;
  private readonly cooldown: number;
  private cooldownTimer = 0;
  private isActive = true;
  private animTime = 0;

  constructor(config: HazardConfig) {
    super(config);
    this.damage = config.damage ?? 2;
    this.cooldown = config.cooldown ?? 2;

    this.createVisual();
  }

  private createVisual(): void {
    // Base plate
    const baseGeo = new THREE.CylinderGeometry(this.radius, this.radius, 0.1, 16);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.8,
      metalness: 0.2
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.05;
    base.receiveShadow = true;
    this.mesh.add(base);

    // Spikes
    const spikeGeo = new THREE.ConeGeometry(0.08, 0.4, 4);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      emissive: 0x331111,
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.7
    });

    const spikeCount = Math.floor(this.radius * 4);
    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 0.3 + Math.random() * (this.radius - 0.4);
      const spike = new THREE.Mesh(spikeGeo, spikeMat.clone());
      spike.position.set(
        Math.cos(angle) * dist,
        0.25,
        Math.sin(angle) * dist
      );
      spike.castShadow = true;
      this.mesh.add(spike);
    }
  }

  update(delta: number, playerPos: THREE.Vector3, callbacks: HazardCallbacks): void {
    this.animTime += delta;

    // Handle cooldown
    if (!this.isActive) {
      this.cooldownTimer -= delta;
      if (this.cooldownTimer <= 0) {
        this.isActive = true;
        // Raise spikes back up
        for (let i = 1; i < this.mesh.children.length; i++) {
          const spike = this.mesh.children[i] as THREE.Mesh;
          spike.position.y = 0.25;
          if (spike.material instanceof THREE.MeshStandardMaterial) {
            spike.material.emissive.setHex(0x331111);
          }
        }
      } else {
        // Spikes down during cooldown
        const progress = this.cooldownTimer / this.cooldown;
        for (let i = 1; i < this.mesh.children.length; i++) {
          const spike = this.mesh.children[i] as THREE.Mesh;
          spike.position.y = 0.05 + progress * 0.2;
        }
        return;
      }
    }

    // Check player collision
    this.isPlayerInside = this.checkPlayerInside(playerPos);

    if (this.isPlayerInside && this.isActive) {
      // Trigger trap
      this.isActive = false;
      this.cooldownTimer = this.cooldown;

      callbacks.onDamage(this.damage, this.position);
      callbacks.onParticleEmit(playerPos.clone().setY(playerPos.y + 0.5), 15, 0xff3333);

      // Visual feedback - spikes flash red
      for (let i = 1; i < this.mesh.children.length; i++) {
        const spike = this.mesh.children[i] as THREE.Mesh;
        if (spike.material instanceof THREE.MeshStandardMaterial) {
          spike.material.emissive.setHex(0xff0000);
        }
      }
    }
  }
}

/**
 * HazardSystem - Manages all environmental hazards in a level
 */
export class HazardSystem {
  private readonly scene: THREE.Scene;
  private readonly hazards: BaseHazard[] = [];
  private callbacks: HazardCallbacks | null = null;

  // Player slow state
  private currentSlowFactor = 1;
  private slowSourceCount = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setCallbacks(callbacks: HazardCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Spawn hazards from level configuration
   */
  spawnFromConfig(configs: HazardConfig[], terrainHeightGetter?: (x: number, z: number) => number): void {
    for (const config of configs) {
      // Adjust Y position to terrain if getter provided
      if (terrainHeightGetter) {
        config.position.y = terrainHeightGetter(config.position.x, config.position.z) + 0.01;
      }

      let hazard: BaseHazard;

      switch (config.type) {
        case HazardType.LAVA:
          hazard = new LavaPool(config);
          break;
        case HazardType.ICE:
          hazard = new IcePatch(config);
          break;
        case HazardType.SPIKES:
          hazard = new SpikeTrap(config);
          break;
        default:
          continue;
      }

      this.scene.add(hazard.getMesh());
      this.hazards.push(hazard);
    }
  }

  /**
   * Update all hazards
   */
  update(delta: number, playerPos: THREE.Vector3): void {
    if (!this.callbacks) return;

    // Create wrapper callbacks that track slow state
    const wrappedCallbacks: HazardCallbacks = {
      onDamage: this.callbacks.onDamage,
      onParticleEmit: this.callbacks.onParticleEmit,
      onSlowApply: (factor: number) => {
        this.slowSourceCount++;
        if (factor < this.currentSlowFactor) {
          this.currentSlowFactor = factor;
          this.callbacks!.onSlowApply(factor);
        }
      },
      onSlowRemove: () => {
        this.slowSourceCount--;
        if (this.slowSourceCount <= 0) {
          this.slowSourceCount = 0;
          this.currentSlowFactor = 1;
          this.callbacks!.onSlowRemove();
        }
      }
    };

    for (const hazard of this.hazards) {
      hazard.update(delta, playerPos, wrappedCallbacks);
    }
  }

  /**
   * Get current slow factor (1 = normal, 0.5 = half speed)
   */
  getSlowFactor(): number {
    return this.currentSlowFactor;
  }

  /**
   * Clear all hazards
   */
  clear(): void {
    for (const hazard of this.hazards) {
      this.scene.remove(hazard.getMesh());
      hazard.dispose();
    }
    this.hazards.length = 0;
    this.currentSlowFactor = 1;
    this.slowSourceCount = 0;
  }

  dispose(): void {
    this.clear();
  }
}

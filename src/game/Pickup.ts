import * as THREE from 'three';

export enum PickupType {
  HEALTH = 'HEALTH',
  SPEED_BOOST = 'SPEED_BOOST',
  DAMAGE_BOOST = 'DAMAGE_BOOST',
  SHIELD = 'SHIELD',
  COIN = 'COIN'
}

export interface PickupConfig {
  type: PickupType;
  value: number;
  duration: number; // For buffs (0 = instant like health)
  color: number;
  emissiveColor: number;
}

const PICKUP_CONFIGS: Record<PickupType, PickupConfig> = {
  [PickupType.HEALTH]: {
    type: PickupType.HEALTH,
    value: 1,
    duration: 0,
    color: 0xef4444,
    emissiveColor: 0xff6666
  },
  [PickupType.SPEED_BOOST]: {
    type: PickupType.SPEED_BOOST,
    value: 1.5, // 50% speed increase
    duration: 5,
    color: 0xfbbf24,
    emissiveColor: 0xffdd44
  },
  [PickupType.DAMAGE_BOOST]: {
    type: PickupType.DAMAGE_BOOST,
    value: 2, // 2x damage
    duration: 5,
    color: 0xa855f7,
    emissiveColor: 0xcc77ff
  },
  [PickupType.SHIELD]: {
    type: PickupType.SHIELD,
    value: 1, // Blocks 1 hit
    duration: 10,
    color: 0x3b82f6,
    emissiveColor: 0x66aaff
  },
  [PickupType.COIN]: {
    type: PickupType.COIN,
    value: 1, // Base coin value (can be multiplied for bigger coins)
    duration: 0,
    color: 0xfbbf24,
    emissiveColor: 0xffd700
  }
};

// Drop rates (must sum to <= 1.0, remainder = no drop)
const DROP_RATES: { type: PickupType; chance: number }[] = [
  { type: PickupType.HEALTH, chance: 0.25 },      // 25% chance
  { type: PickupType.SPEED_BOOST, chance: 0.08 }, // 8% chance
  { type: PickupType.DAMAGE_BOOST, chance: 0.05 },// 5% chance
  { type: PickupType.SHIELD, chance: 0.07 }       // 7% chance
  // 55% = no drop
];

export class Pickup {
  readonly mesh: THREE.Group;
  readonly type: PickupType;
  readonly config: PickupConfig;

  private animationTime = 0;
  private lifetime = 15; // Despawn after 15 seconds
  private collected = false;
  private readonly startY: number;
  private readonly cachedPosition = new THREE.Vector3();

  constructor(position: THREE.Vector3, type: PickupType) {
    this.type = type;
    this.config = PICKUP_CONFIGS[type];
    this.mesh = new THREE.Group();
    this.startY = position.y + 0.5;

    // Create pickup visual based on type
    this.createVisual();

    this.mesh.position.copy(position);
    this.mesh.position.y = this.startY;
  }

  private createVisual(): void {
    // Outer glow sphere
    const glowGeometry = new THREE.SphereGeometry(0.4, 12, 12);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: this.config.emissiveColor,
      transparent: true,
      opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.mesh.add(glow);

    // Inner core based on type
    let coreGeometry: THREE.BufferGeometry;

    switch (this.type) {
      case PickupType.HEALTH:
        // Heart-like shape (octahedron)
        coreGeometry = new THREE.OctahedronGeometry(0.25, 0);
        break;
      case PickupType.SPEED_BOOST:
        // Lightning bolt (cone)
        coreGeometry = new THREE.ConeGeometry(0.15, 0.4, 4);
        break;
      case PickupType.DAMAGE_BOOST:
        // Star (icosahedron)
        coreGeometry = new THREE.IcosahedronGeometry(0.2, 0);
        break;
      case PickupType.SHIELD:
        // Diamond (octahedron stretched)
        coreGeometry = new THREE.OctahedronGeometry(0.22, 0);
        break;
      case PickupType.COIN:
        // Coin shape (cylinder)
        coreGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16);
        break;
      default:
        coreGeometry = new THREE.SphereGeometry(0.2, 8, 8);
    }

    const coreMaterial = new THREE.MeshStandardMaterial({
      color: this.config.color,
      emissive: this.config.emissiveColor,
      emissiveIntensity: 0.8,
      flatShading: true
    });

    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    this.mesh.add(core);
  }

  update(delta: number): void {
    if (this.collected) return;

    this.animationTime += delta;
    this.lifetime -= delta;

    // Floating animation
    this.mesh.position.y = this.startY + Math.sin(this.animationTime * 3) * 0.15;

    // Rotation
    this.mesh.rotation.y += delta * 2;

    // Pulse scale when about to despawn
    if (this.lifetime < 3) {
      const pulse = 1 + Math.sin(this.animationTime * 10) * 0.2;
      this.mesh.scale.setScalar(pulse);
    }
  }

  collect(): void {
    this.collected = true;
  }

  isCollected(): boolean {
    return this.collected;
  }

  isExpired(): boolean {
    return this.lifetime <= 0;
  }

  getPosition(): THREE.Vector3 {
    // Reuse cached position to avoid per-frame allocations
    return this.cachedPosition.copy(this.mesh.position);
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
 * PickupSystem - Manages spawning and collection of pickups
 */
export class PickupSystem {
  private readonly scene: THREE.Scene;
  private readonly pickups: Pickup[] = [];
  private readonly maxPickups = 20;

  // Callbacks
  public onPickupCollected?: (type: PickupType, config: PickupConfig) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Attempt to spawn a pickup at the given position.
   * Uses drop rate table to determine if/what spawns.
   */
  trySpawnFromEnemy(position: THREE.Vector3): Pickup | null {
    if (this.pickups.length >= this.maxPickups) return null;

    const roll = Math.random();
    let cumulative = 0;

    for (const dropInfo of DROP_RATES) {
      cumulative += dropInfo.chance;
      if (roll < cumulative) {
        return this.spawn(position, dropInfo.type);
      }
    }

    return null; // No drop
  }

  /**
   * Spawn coins from an enemy death.
   * Always drops coins, amount varies by enemy type.
   * @param position Enemy death position
   * @param coinAmount Number of coins to drop (default 1-3)
   */
  spawnCoins(position: THREE.Vector3, coinAmount: number = 1): Pickup[] {
    const coins: Pickup[] = [];
    const spreadRadius = 0.5;

    for (let i = 0; i < coinAmount; i++) {
      if (this.pickups.length >= this.maxPickups) break;

      // Spread coins slightly around the death position
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * spreadRadius,
        0,
        (Math.random() - 0.5) * spreadRadius
      );
      const coinPos = position.clone().add(offset);
      const coin = this.spawn(coinPos, PickupType.COIN);
      coins.push(coin);
    }

    return coins;
  }

  /**
   * Spawn both coins and potential power-up from enemy death
   */
  spawnFromEnemyDeath(position: THREE.Vector3, coinAmount: number = 1): void {
    // Always spawn coins
    this.spawnCoins(position, coinAmount);

    // Also try to spawn a power-up
    this.trySpawnFromEnemy(position);
  }

  /**
   * Force spawn a specific pickup type
   */
  spawn(position: THREE.Vector3, type: PickupType): Pickup {
    const pickup = new Pickup(position.clone(), type);
    this.scene.add(pickup.mesh);
    this.pickups.push(pickup);
    return pickup;
  }

  /**
   * Update all pickups and check for collection
   */
  update(delta: number, playerPosition: THREE.Vector3, collectionRadius: number = 1.5): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];

      pickup.update(delta);

      // Check collection
      if (!pickup.isCollected()) {
        const distance = pickup.getPosition().distanceTo(playerPosition);
        if (distance < collectionRadius) {
          pickup.collect();

          if (this.onPickupCollected) {
            this.onPickupCollected(pickup.type, pickup.config);
          }
        }
      }

      // Remove if collected or expired
      if (pickup.isCollected() || pickup.isExpired()) {
        this.scene.remove(pickup.mesh);
        pickup.dispose();
        this.pickups.splice(i, 1);
      }
    }
  }

  /**
   * Get active pickup count
   */
  getCount(): number {
    return this.pickups.length;
  }

  /**
   * Clear all pickups
   */
  clear(): void {
    for (const pickup of this.pickups) {
      this.scene.remove(pickup.mesh);
      pickup.dispose();
    }
    this.pickups.length = 0;
  }

  dispose(): void {
    this.clear();
  }
}

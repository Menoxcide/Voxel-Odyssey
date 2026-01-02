import * as THREE from 'three';

/**
 * EnemyAbilityVisuals - Handles visual feedback for enemy special abilities
 * Provides warning indicators, aura effects, and ability previews
 */

// Reusable geometries to avoid per-effect allocations
const RING_GEOMETRY = new THREE.RingGeometry(0.8, 1.0, 32);
const CIRCLE_GEOMETRY = new THREE.CircleGeometry(1, 32);

export interface AbilityVisualConfig {
  position: THREE.Vector3;
  radius: number;
  color: number;
  duration: number;
}

interface ActiveVisual {
  mesh: THREE.Mesh | THREE.Group;
  startTime: number;
  duration: number;
  type: 'warning' | 'pulse' | 'aura';
  update: (elapsed: number, progress: number) => void;
}

export class EnemyAbilityVisuals {
  private readonly scene: THREE.Scene;
  private readonly activeVisuals: ActiveVisual[] = [];
  private time = 0;

  // Object pools for visual meshes
  private readonly warningRingPool: THREE.Mesh[] = [];
  private readonly auraCirclePool: THREE.Mesh[] = [];
  private readonly poolSize = 10;

  // Reusable vector to avoid allocations
  private static readonly tempVec = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializePools();
  }

  private initializePools(): void {
    // Pre-create warning ring meshes
    for (let i = 0; i < this.poolSize; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xff4444,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(RING_GEOMETRY, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.warningRingPool.push(mesh);
    }

    // Pre-create aura circle meshes
    for (let i = 0; i < this.poolSize; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x44ff44,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(CIRCLE_GEOMETRY, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.auraCirclePool.push(mesh);
    }
  }

  private getWarningRing(): THREE.Mesh | null {
    for (const mesh of this.warningRingPool) {
      if (!mesh.visible) {
        mesh.visible = true;
        if (!mesh.parent) this.scene.add(mesh);
        return mesh;
      }
    }
    return null;
  }

  private getAuraCircle(): THREE.Mesh | null {
    for (const mesh of this.auraCirclePool) {
      if (!mesh.visible) {
        mesh.visible = true;
        if (!mesh.parent) this.scene.add(mesh);
        return mesh;
      }
    }
    return null;
  }

  private returnToPool(mesh: THREE.Mesh): void {
    mesh.visible = false;
    mesh.scale.set(1, 1, 1);
    (mesh.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  /**
   * Show explosion warning ring (for SuicideBomber)
   * Displays a pulsing red ring at the enemy position before explosion
   */
  showExplosionWarning(position: THREE.Vector3, radius: number, duration: number = 0.5): void {
    const ring = this.getWarningRing();
    if (!ring) return;

    ring.position.copy(position);
    ring.position.y = 0.1; // Slightly above ground
    ring.scale.set(radius, radius, 1);

    const material = ring.material as THREE.MeshBasicMaterial;
    material.color.setHex(0xff4444);

    const startTime = this.time;

    this.activeVisuals.push({
      mesh: ring,
      startTime,
      duration,
      type: 'warning',
      update: (elapsed, progress) => {
        // Pulsing opacity
        const pulse = Math.sin(elapsed * 15) * 0.3 + 0.5;
        material.opacity = pulse * (1 - progress);

        // Growing ring
        const scale = radius * (1 + progress * 0.5);
        ring.scale.set(scale, scale, 1);
      }
    });
  }

  /**
   * Show healing aura pulse (for Healer)
   * Displays expanding green rings when healing nearby enemies
   */
  showHealingPulse(position: THREE.Vector3, radius: number, duration: number = 1.0): void {
    const circle = this.getAuraCircle();
    if (!circle) return;

    circle.position.copy(position);
    circle.position.y = 0.1;

    const material = circle.material as THREE.MeshBasicMaterial;
    material.color.setHex(0x4ade80);

    const startTime = this.time;

    this.activeVisuals.push({
      mesh: circle,
      startTime,
      duration,
      type: 'aura',
      update: (_elapsed, progress) => {
        // Expand outward
        const scale = radius * progress;
        circle.scale.set(scale, scale, 1);

        // Fade out as it expands
        material.opacity = 0.4 * (1 - progress);
      }
    });
  }

  /**
   * Show shield absorb pulse (for Shielder)
   * Displays a blue flash when shield absorbs damage
   */
  showShieldAbsorb(position: THREE.Vector3, _radius: number = 1.0): void {
    const ring = this.getWarningRing();
    if (!ring) return;

    ring.position.copy(position);
    ring.position.y = 0.5;

    const material = ring.material as THREE.MeshBasicMaterial;
    material.color.setHex(0x60a5fa);

    const startTime = this.time;
    const duration = 0.3;

    this.activeVisuals.push({
      mesh: ring,
      startTime,
      duration,
      type: 'pulse',
      update: (_elapsed, progress) => {
        // Quick flash and fade
        const scale = 1 + progress * 0.5;
        ring.scale.set(scale, scale, 1);
        material.opacity = 0.8 * (1 - progress);
      }
    });
  }

  /**
   * Show charge warning line (for Tank)
   * Displays a danger line showing charge path
   */
  showChargeWarning(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    duration: number = 0.5
  ): void {
    // Create a simple line indicator
    const direction = EnemyAbilityVisuals.tempVec.subVectors(endPos, startPos);
    const length = direction.length();
    direction.normalize();

    const geometry = new THREE.PlaneGeometry(0.3, length);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide
    });

    const plane = new THREE.Mesh(geometry, material);

    // Position at midpoint
    plane.position.copy(startPos).add(endPos).multiplyScalar(0.5);
    plane.position.y = 0.1;

    // Rotate to face direction
    const angle = Math.atan2(direction.x, direction.z);
    plane.rotation.x = -Math.PI / 2;
    plane.rotation.z = -angle;

    this.scene.add(plane);

    const startTime = this.time;

    this.activeVisuals.push({
      mesh: plane,
      startTime,
      duration,
      type: 'warning',
      update: (elapsed, progress) => {
        // Pulsing opacity
        const pulse = Math.sin(elapsed * 10) * 0.2 + 0.4;
        material.opacity = pulse * (1 - progress * 0.5);
      }
    });
  }

  /**
   * Show shooter aiming indicator
   * Displays a laser sight line when enemy is aiming
   */
  showAimingLaser(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxLength: number = 15
  ): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(0.02, 0.02, maxLength, 4);
    geometry.translate(0, maxLength / 2, 0);
    geometry.rotateX(Math.PI / 2);

    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.4
    });

    const laser = new THREE.Mesh(geometry, material);
    laser.position.copy(origin);

    // Orient laser toward direction
    const target = origin.clone().add(direction.clone().multiplyScalar(maxLength));
    laser.lookAt(target);

    this.scene.add(laser);

    return laser;
  }

  /**
   * Update all active visuals
   */
  update(delta: number): void {
    this.time += delta;

    for (let i = this.activeVisuals.length - 1; i >= 0; i--) {
      const visual = this.activeVisuals[i];
      const elapsed = this.time - visual.startTime;
      const progress = Math.min(1, elapsed / visual.duration);

      visual.update(elapsed, progress);

      // Remove completed visuals
      if (progress >= 1) {
        if (visual.mesh instanceof THREE.Mesh) {
          // Check if it's a pooled mesh
          if (this.warningRingPool.includes(visual.mesh) ||
              this.auraCirclePool.includes(visual.mesh)) {
            this.returnToPool(visual.mesh);
          } else {
            // Non-pooled mesh - dispose properly
            this.scene.remove(visual.mesh);
            visual.mesh.geometry.dispose();
            (visual.mesh.material as THREE.Material).dispose();
          }
        } else {
          this.scene.remove(visual.mesh);
        }
        this.activeVisuals.splice(i, 1);
      }
    }
  }

  /**
   * Clear all active visuals
   */
  clear(): void {
    for (const visual of this.activeVisuals) {
      if (visual.mesh instanceof THREE.Mesh) {
        if (this.warningRingPool.includes(visual.mesh) ||
            this.auraCirclePool.includes(visual.mesh)) {
          this.returnToPool(visual.mesh);
        } else {
          this.scene.remove(visual.mesh);
          visual.mesh.geometry.dispose();
          (visual.mesh.material as THREE.Material).dispose();
        }
      } else {
        this.scene.remove(visual.mesh);
      }
    }
    this.activeVisuals.length = 0;
  }

  dispose(): void {
    this.clear();

    // Dispose pools
    for (const mesh of this.warningRingPool) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.warningRingPool.length = 0;

    for (const mesh of this.auraCirclePool) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.auraCirclePool.length = 0;
  }
}

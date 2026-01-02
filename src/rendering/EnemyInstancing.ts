import * as THREE from 'three';

/**
 * Instance data for a single enemy in the instanced mesh
 */
export interface EnemyInstanceData {
  id: string;
  active: boolean;
  position: THREE.Vector3;
  rotation: number;
  scale: number;
  color: THREE.Color;
  damageFlashTime: number;
}

/**
 * EnemyInstancing - Manages instanced rendering for basic enemy meshes
 *
 * Uses THREE.InstancedMesh to render multiple enemies with a single draw call.
 * Supports per-instance position, rotation, scale, and color (for damage flash).
 *
 * Performance benefits:
 * - Reduces draw calls from N enemies to 1
 * - Supports up to maxInstances enemies efficiently
 * - Per-instance colors for damage flash effects
 */
export class EnemyInstancing {
  private readonly instancedMesh: THREE.InstancedMesh;
  private readonly maxInstances: number;
  private readonly instances: Map<string, number> = new Map(); // id -> instance index
  private readonly instanceData: EnemyInstanceData[] = [];

  // Reusable objects to avoid GC pressure
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempColor = new THREE.Color();

  // Base color for basic enemies
  private readonly baseColor: THREE.Color;
  private readonly damageFlashColor = new THREE.Color(0xff0000);

  private activeCount = 0;
  private needsMatrixUpdate = false;
  private needsColorUpdate = false;

  constructor(scene: THREE.Scene, maxInstances: number = 30, baseColor: number = 0xa855f7) {
    this.maxInstances = maxInstances;
    this.baseColor = new THREE.Color(baseColor);

    // Create geometry for basic enemy (sphere)
    const geometry = new THREE.SphereGeometry(0.5, 12, 12);

    // Create material with vertex colors enabled for per-instance coloring
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, // White base, color comes from instanceColor
      emissive: baseColor,
      emissiveIntensity: 0.3,
      flatShading: true
    });

    // Create instanced mesh
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, maxInstances);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Enable per-instance colors
    this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(maxInstances * 3),
      3
    );
    this.instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    // Enable shadows
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = false;

    // Enable frustum culling
    this.instancedMesh.frustumCulled = true;

    // Initialize all instances as hidden (scale 0)
    this.tempScale.set(0, 0, 0);
    this.tempPosition.set(0, -1000, 0); // Move off-screen
    this.tempQuaternion.identity();

    for (let i = 0; i < maxInstances; i++) {
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
      this.instancedMesh.setMatrixAt(i, this.tempMatrix);
      this.instancedMesh.setColorAt(i, this.baseColor);

      this.instanceData.push({
        id: '',
        active: false,
        position: new THREE.Vector3(),
        rotation: 0,
        scale: 0,
        color: this.baseColor.clone(),
        damageFlashTime: 0
      });
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    // Set count to 0 initially (nothing to render)
    this.instancedMesh.count = 0;

    scene.add(this.instancedMesh);
  }

  /**
   * Register a new enemy with the instancing system
   * @returns Instance index, or -1 if no slots available
   */
  registerEnemy(id: string, position: THREE.Vector3, scale: number = 0.6): number {
    // Check if already registered
    if (this.instances.has(id)) {
      return this.instances.get(id)!;
    }

    // Find first available slot
    let instanceIndex = -1;
    for (let i = 0; i < this.maxInstances; i++) {
      if (!this.instanceData[i].active) {
        instanceIndex = i;
        break;
      }
    }

    if (instanceIndex === -1) {
      console.warn('EnemyInstancing: No available slots for new enemy');
      return -1;
    }

    // Initialize instance data
    const data = this.instanceData[instanceIndex];
    data.id = id;
    data.active = true;
    data.position.copy(position);
    data.rotation = 0;
    data.scale = scale;
    data.color.copy(this.baseColor);
    data.damageFlashTime = 0;

    this.instances.set(id, instanceIndex);
    this.activeCount++;
    this.needsMatrixUpdate = true;
    this.needsColorUpdate = true;

    // Update instance count for rendering
    this.updateInstanceCount();

    return instanceIndex;
  }

  /**
   * Unregister an enemy from the instancing system
   */
  unregisterEnemy(id: string): void {
    const instanceIndex = this.instances.get(id);
    if (instanceIndex === undefined) return;

    // Mark slot as inactive
    const data = this.instanceData[instanceIndex];
    data.active = false;
    data.id = '';
    data.scale = 0;
    data.position.set(0, -1000, 0); // Move off-screen

    this.instances.delete(id);
    this.activeCount--;
    this.needsMatrixUpdate = true;

    // Update instance count
    this.updateInstanceCount();
  }

  /**
   * Update the instance count to only render active instances
   * Compacts active instances to the front for efficient rendering
   */
  private updateInstanceCount(): void {
    // Compact active instances to the front
    let writeIndex = 0;

    for (let i = 0; i < this.maxInstances; i++) {
      if (this.instanceData[i].active) {
        if (i !== writeIndex) {
          // Swap data
          const temp = this.instanceData[writeIndex];
          this.instanceData[writeIndex] = this.instanceData[i];
          this.instanceData[i] = temp;

          // Update mapping
          const id = this.instanceData[writeIndex].id;
          this.instances.set(id, writeIndex);
        }
        writeIndex++;
      }
    }

    this.instancedMesh.count = this.activeCount;
  }

  /**
   * Update instance transform
   */
  updateInstanceTransform(id: string, position: THREE.Vector3, rotation: number = 0): void {
    const instanceIndex = this.instances.get(id);
    if (instanceIndex === undefined) return;

    const data = this.instanceData[instanceIndex];
    data.position.copy(position);
    data.rotation = rotation;
    this.needsMatrixUpdate = true;
  }

  /**
   * Set instance color (for damage flash effect)
   */
  setInstanceColor(id: string, color: THREE.Color): void {
    const instanceIndex = this.instances.get(id);
    if (instanceIndex === undefined) return;

    const data = this.instanceData[instanceIndex];
    data.color.copy(color);
    this.needsColorUpdate = true;
  }

  /**
   * Trigger damage flash for an instance
   */
  triggerDamageFlash(id: string, duration: number = 0.3): void {
    const instanceIndex = this.instances.get(id);
    if (instanceIndex === undefined) return;

    const data = this.instanceData[instanceIndex];
    data.damageFlashTime = duration;
    this.needsColorUpdate = true;
  }

  /**
   * Get the base color for instances
   */
  getBaseColor(): THREE.Color {
    return this.baseColor;
  }

  /**
   * Get current active enemy count
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  /**
   * Check if an enemy is registered
   */
  hasEnemy(id: string): boolean {
    return this.instances.has(id);
  }

  /**
   * Update all instance matrices and colors (call once per frame)
   */
  update(delta: number): void {
    // Update damage flash timers and colors
    for (let i = 0; i < this.activeCount; i++) {
      const data = this.instanceData[i];
      if (!data.active) continue;

      if (data.damageFlashTime > 0) {
        data.damageFlashTime -= delta;

        // Flash effect: alternate between red and base color
        const flash = Math.sin(data.damageFlashTime * 30) > 0;
        data.color.copy(flash ? this.damageFlashColor : this.baseColor);
        this.needsColorUpdate = true;

        if (data.damageFlashTime <= 0) {
          data.damageFlashTime = 0;
          data.color.copy(this.baseColor);
        }
      }
    }

    // Update matrices if needed
    if (this.needsMatrixUpdate) {
      for (let i = 0; i < this.activeCount; i++) {
        const data = this.instanceData[i];
        if (!data.active) continue;

        // Build transformation matrix
        this.tempPosition.copy(data.position);
        this.tempQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), data.rotation);
        this.tempScale.set(data.scale, data.scale, data.scale);

        this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
        this.instancedMesh.setMatrixAt(i, this.tempMatrix);
      }

      this.instancedMesh.instanceMatrix.needsUpdate = true;
      this.needsMatrixUpdate = false;
    }

    // Update colors if needed
    if (this.needsColorUpdate && this.instancedMesh.instanceColor) {
      for (let i = 0; i < this.activeCount; i++) {
        const data = this.instanceData[i];
        if (!data.active) continue;

        this.instancedMesh.setColorAt(i, data.color);
      }

      this.instancedMesh.instanceColor.needsUpdate = true;
      this.needsColorUpdate = false;
    }

    // Update bounding sphere for frustum culling
    if (this.activeCount > 0) {
      this.instancedMesh.computeBoundingSphere();
    }
  }

  /**
   * Force an update of all matrices (useful after bulk registration)
   */
  forceUpdate(): void {
    this.needsMatrixUpdate = true;
    this.needsColorUpdate = true;
    this.update(0);
  }

  /**
   * Get the instanced mesh (for debugging or manual manipulation)
   */
  getMesh(): THREE.InstancedMesh {
    return this.instancedMesh;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.instancedMesh.geometry.dispose();
    (this.instancedMesh.material as THREE.Material).dispose();
    this.instancedMesh.parent?.remove(this.instancedMesh);
    this.instances.clear();
    this.instanceData.length = 0;
    this.activeCount = 0;
  }
}

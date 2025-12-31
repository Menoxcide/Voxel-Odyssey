import * as THREE from 'three';

export interface VoxelData {
  x: number;
  y: number;
  z: number;
  color: number;
}

export class VoxelMesh {
  private readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.BoxGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly maxInstances: number;
  private instanceCount = 0;

  // Reusable objects to avoid GC
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly color = new THREE.Color();

  constructor(maxInstances: number = 10000) {
    this.maxInstances = maxInstances;

    // Create shared geometry (1x1x1 cube)
    this.geometry = new THREE.BoxGeometry(1, 1, 1);

    // Create material with vertex colors and flat shading
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: false,
      flatShading: true,
      metalness: 0,
      roughness: 0.8
    });

    // Create instanced mesh
    this.mesh = new THREE.InstancedMesh(
      this.geometry,
      this.material,
      this.maxInstances
    );

    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = true;

    // Initialize all instances as invisible
    this.mesh.count = 0;
  }

  addVoxel(x: number, y: number, z: number, colorHex: number): number {
    if (this.instanceCount >= this.maxInstances) {
      console.warn('VoxelMesh: Max instances reached');
      return -1;
    }

    const index = this.instanceCount;

    // Set position
    this.position.set(x, y, z);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(index, this.matrix);

    // Set color
    this.color.setHex(colorHex);
    this.mesh.setColorAt(index, this.color);

    this.instanceCount++;
    this.mesh.count = this.instanceCount;

    return index;
  }

  addVoxels(voxels: VoxelData[]): void {
    for (const voxel of voxels) {
      this.addVoxel(voxel.x, voxel.y, voxel.z, voxel.color);
    }
    this.updateMatrices();
  }

  updateVoxelPosition(index: number, x: number, y: number, z: number): void {
    if (index < 0 || index >= this.instanceCount) return;

    this.position.set(x, y, z);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(index, this.matrix);
  }

  updateVoxelColor(index: number, colorHex: number): void {
    if (index < 0 || index >= this.instanceCount) return;

    this.color.setHex(colorHex);
    this.mesh.setColorAt(index, this.color);
  }

  updateMatrices(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  clear(): void {
    this.instanceCount = 0;
    this.mesh.count = 0;
  }

  getMesh(): THREE.InstancedMesh {
    return this.mesh;
  }

  getInstanceCount(): number {
    return this.instanceCount;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// Terrain chunk for LOD and culling
export class TerrainChunk {
  private readonly voxelMesh: VoxelMesh;
  private readonly chunkSize: number;
  private readonly chunkX: number;
  private readonly chunkZ: number;
  private readonly group: THREE.Group;
  private lodLevel = 0;

  constructor(
    chunkX: number,
    chunkZ: number,
    chunkSize: number = 16,
    maxVoxels: number = 4096
  ) {
    this.chunkX = chunkX;
    this.chunkZ = chunkZ;
    this.chunkSize = chunkSize;

    this.voxelMesh = new VoxelMesh(maxVoxels);
    this.group = new THREE.Group();
    this.group.add(this.voxelMesh.getMesh());

    // Position chunk in world space
    this.group.position.set(
      chunkX * chunkSize,
      0,
      chunkZ * chunkSize
    );
  }

  addVoxel(localX: number, y: number, localZ: number, color: number): void {
    this.voxelMesh.addVoxel(localX, y, localZ, color);
  }

  finalize(): void {
    this.voxelMesh.updateMatrices();
  }

  setLOD(level: number): void {
    if (level === this.lodLevel) return;
    this.lodLevel = level;

    // Adjust visibility based on LOD
    // Level 0: Full detail
    // Level 1: Reduced (skip every other voxel visually)
    // Level 2: Very low (wireframe or hidden)
    const material = this.voxelMesh.getMesh().material as THREE.MeshStandardMaterial;

    if (level === 0) {
      material.wireframe = false;
      material.opacity = 1;
      material.transparent = false;
    } else if (level === 1) {
      material.wireframe = false;
      material.opacity = 0.8;
      material.transparent = true;
    } else {
      material.wireframe = true;
      material.opacity = 0.5;
      material.transparent = true;
    }
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  getWorldPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.chunkX * this.chunkSize + this.chunkSize / 2,
      0,
      this.chunkZ * this.chunkSize + this.chunkSize / 2
    );
  }

  dispose(): void {
    this.voxelMesh.dispose();
  }
}

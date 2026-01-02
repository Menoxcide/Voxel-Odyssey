import * as THREE from 'three';
import { SimplexNoise } from '../utils/SimplexNoise';
import { TerrainChunk } from '../rendering/VoxelMesh';

// Color palette
const COLORS = {
  GRASS_LIGHT: 0x4ade80,
  GRASS_DARK: 0x22c55e,
  DIRT: 0x92400e,
  STONE: 0x6b7280,
  WATER: 0x3b82f6,
  SAND: 0xfbbf24,
  TREE_TRUNK: 0x78350f,
  TREE_LEAVES: 0x15803d,
  TREE_LEAVES_LIGHT: 0x22c55e
};

export interface WorldConfig {
  size: number;           // World size in voxels
  chunkSize: number;      // Chunk size for LOD
  seed: number;           // Random seed
  heightScale: number;    // Terrain height multiplier
  waterLevel: number;     // Y level for water
  treeChance: number;     // Probability of tree spawn
}

const DEFAULT_CONFIG: WorldConfig = {
  size: 64,
  chunkSize: 16,
  seed: 12345,
  heightScale: 8,
  waterLevel: 0,
  treeChance: 0.02
};

export class WorldGenerator {
  private readonly config: WorldConfig;
  private readonly noise: SimplexNoise;
  private readonly chunks: Map<string, TerrainChunk> = new Map();
  private readonly group: THREE.Group;

  // Water plane
  private waterMesh: THREE.Mesh | null = null;

  // Arena bounds (invisible walls)
  private readonly bounds: THREE.Box3;

  constructor(config: Partial<WorldConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.noise = new SimplexNoise(this.config.seed);
    this.group = new THREE.Group();

    // Calculate world bounds
    const halfSize = this.config.size / 2;
    this.bounds = new THREE.Box3(
      new THREE.Vector3(-halfSize, -10, -halfSize),
      new THREE.Vector3(halfSize, 50, halfSize)
    );
  }

  generate(): THREE.Group {
    this.generateTerrain();
    this.generateWater();
    this.generateTrees();

    return this.group;
  }

  private generateTerrain(): void {
    const { size, chunkSize, heightScale, waterLevel } = this.config;
    const halfSize = size / 2;
    const chunksPerSide = Math.ceil(size / chunkSize);

    for (let cx = 0; cx < chunksPerSide; cx++) {
      for (let cz = 0; cz < chunksPerSide; cz++) {
        const chunk = new TerrainChunk(
          cx - chunksPerSide / 2,
          cz - chunksPerSide / 2,
          chunkSize,
          chunkSize * chunkSize * 16
        );

        const worldOffsetX = (cx - chunksPerSide / 2) * chunkSize;
        const worldOffsetZ = (cz - chunksPerSide / 2) * chunkSize;

        for (let x = 0; x < chunkSize; x++) {
          for (let z = 0; z < chunkSize; z++) {
            const worldX = worldOffsetX + x;
            const worldZ = worldOffsetZ + z;

            // Skip if outside world bounds
            if (Math.abs(worldX) > halfSize || Math.abs(worldZ) > halfSize) {
              continue;
            }

            // Generate height using FBM noise
            const height = Math.floor(
              this.noise.fbm(worldX * 0.05, worldZ * 0.05, 4) * heightScale
            );

            // Generate column of voxels
            const minY = Math.min(height, waterLevel - 1);

            for (let y = minY; y <= height; y++) {
              const color = this.getVoxelColor(y, height, worldX, worldZ);
              chunk.addVoxel(x, y, z, color);
            }
          }
        }

        chunk.finalize();
        this.chunks.set(`${cx},${cz}`, chunk);
        this.group.add(chunk.getGroup());
      }
    }
  }

  private getVoxelColor(y: number, surfaceHeight: number, worldX: number, worldZ: number): number {
    const { waterLevel } = this.config;

    // Underwater = sand
    if (surfaceHeight <= waterLevel) {
      return COLORS.SAND;
    }

    // Surface layer
    if (y === surfaceHeight) {
      // Add slight variation to grass
      const variation = this.noise.noise2D(worldX * 0.3, worldZ * 0.3);
      return variation > 0 ? COLORS.GRASS_LIGHT : COLORS.GRASS_DARK;
    }

    // Below surface
    if (y >= surfaceHeight - 2) {
      return COLORS.DIRT;
    }

    return COLORS.STONE;
  }

  private generateWater(): void {
    const { size, waterLevel } = this.config;

    const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: COLORS.WATER,
      transparent: true,
      opacity: 0.7,
      metalness: 0.1,
      roughness: 0.2,
      flatShading: true
    });

    this.waterMesh = new THREE.Mesh(geometry, material);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = waterLevel - 0.3;
    this.waterMesh.receiveShadow = true;

    this.group.add(this.waterMesh);
  }

  private generateTrees(): void {
    const { size, treeChance } = this.config;
    const halfSize = size / 2;
    const treePositions: Array<{ x: number; z: number; height: number }> = [];

    // Find suitable tree positions
    for (let x = -halfSize + 2; x < halfSize - 2; x += 3) {
      for (let z = -halfSize + 2; z < halfSize - 2; z += 3) {
        const height = Math.floor(
          this.noise.fbm(x * 0.05, z * 0.05, 4) * this.config.heightScale
        );

        // Only place trees above water on grass
        if (height > this.config.waterLevel + 1) {
          const chance = this.noise.noise2D(x * 0.5, z * 0.5);
          if (chance > 1 - treeChance * 100) {
            treePositions.push({ x, z, height });
          }
        }
      }
    }

    // Create trees using instanced meshes
    const treeMesh = this.createTreeInstances(treePositions);
    this.group.add(treeMesh);
  }

  private createTreeInstances(positions: Array<{ x: number; z: number; height: number }>): THREE.Group {
    const treeGroup = new THREE.Group();

    if (positions.length === 0) return treeGroup;

    // Trunk instances
    const trunkGeometry = new THREE.BoxGeometry(1, 3, 1);
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.TREE_TRUNK,
      flatShading: true
    });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, positions.length);
    trunks.castShadow = true;

    // Leaves instances (use box for voxel style)
    const leavesGeometry = new THREE.BoxGeometry(3, 3, 3);
    const leavesMaterial = new THREE.MeshStandardMaterial({
      color: COLORS.TREE_LEAVES,
      flatShading: true
    });
    const leaves = new THREE.InstancedMesh(leavesGeometry, leavesMaterial, positions.length);
    leaves.castShadow = true;
    leaves.receiveShadow = true;

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();

    positions.forEach((pos, i) => {
      // Trunk position (raised to avoid Z-fighting with terrain voxels)
      // Trunk is 3 units tall, centered, so bottom is at y - 1.5
      // Placing at pos.height + 2.0 means bottom is at pos.height + 0.5 (above grass)
      matrix.setPosition(pos.x, pos.height + 2.0, pos.z);
      trunks.setMatrixAt(i, matrix);

      // Leaves position (on top of trunk)
      matrix.setPosition(pos.x, pos.height + 4.5, pos.z);
      leaves.setMatrixAt(i, matrix);

      // Slight color variation for leaves
      const variation = this.noise.noise2D(pos.x, pos.z);
      color.setHex(variation > 0 ? COLORS.TREE_LEAVES : COLORS.TREE_LEAVES_LIGHT);
      leaves.setColorAt(i, color);
    });

    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) {
      leaves.instanceColor.needsUpdate = true;
    }

    treeGroup.add(trunks);
    treeGroup.add(leaves);

    return treeGroup;
  }

  updateLOD(cameraPosition: THREE.Vector3): void {
    const LOD_DISTANCES = [30, 60, 100];

    this.chunks.forEach((chunk) => {
      const chunkCenter = chunk.getWorldPosition();
      const distance = cameraPosition.distanceTo(chunkCenter);

      if (distance < LOD_DISTANCES[0]) {
        chunk.setLOD(0);
      } else if (distance < LOD_DISTANCES[1]) {
        chunk.setLOD(1);
      } else {
        chunk.setLOD(2);
      }
    });
  }

  getHeightAt(x: number, z: number): number {
    return Math.floor(
      this.noise.fbm(x * 0.05, z * 0.05, 4) * this.config.heightScale
    );
  }

  getBounds(): THREE.Box3 {
    return this.bounds;
  }

  isInBounds(position: THREE.Vector3): boolean {
    return this.bounds.containsPoint(position);
  }

  clampToBounds(position: THREE.Vector3): THREE.Vector3 {
    return position.clamp(this.bounds.min, this.bounds.max);
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  dispose(): void {
    this.chunks.forEach((chunk) => chunk.dispose());
    this.chunks.clear();

    if (this.waterMesh) {
      this.waterMesh.geometry.dispose();
      (this.waterMesh.material as THREE.Material).dispose();
    }

    // Dispose tree meshes
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }
}

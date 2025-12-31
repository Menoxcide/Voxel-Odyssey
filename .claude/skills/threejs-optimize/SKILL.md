---
description: Three.js rendering optimization techniques for mobile voxel games
---

# Three.js Optimization Skill

Specialized optimization patterns for Three.js mobile game rendering.

## Renderer Configuration

```typescript
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('canvas') as HTMLCanvasElement,
  antialias: false,        // Critical for mobile performance
  powerPreference: 'high-performance',
  stencil: false,          // Disable if not using stencil buffer
  depth: true
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
```

## Instanced Mesh for Voxels

```typescript
// GOOD: Single draw call for entire terrain
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true
});

const instancedMesh = new THREE.InstancedMesh(geometry, material, count);

const matrix = new THREE.Matrix4();
const color = new THREE.Color();

for (let i = 0; i < count; i++) {
  matrix.setPosition(x, y, z);
  instancedMesh.setMatrixAt(i, matrix);
  instancedMesh.setColorAt(i, color.setHex(colorHex));
}

instancedMesh.instanceMatrix.needsUpdate = true;
instancedMesh.instanceColor!.needsUpdate = true;
```

## Geometry Merging for Static Objects

```typescript
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';

// Merge static decorations into single geometry
const geometries: THREE.BufferGeometry[] = [];
trees.forEach(tree => {
  const geo = tree.geometry.clone();
  geo.applyMatrix4(tree.matrixWorld);
  geometries.push(geo);
});

const mergedGeometry = mergeGeometries(geometries);
const mergedMesh = new THREE.Mesh(mergedGeometry, sharedMaterial);
```

## Level of Detail (LOD)

```typescript
const lod = new THREE.LOD();

// High detail (close)
const highDetail = createDetailedMesh();
lod.addLevel(highDetail, 0);

// Medium detail (mid-range)
const mediumDetail = createSimplifiedMesh();
lod.addLevel(mediumDetail, 50);

// Low detail (far) - use billboard or wireframe
const lowDetail = createBillboard();
lod.addLevel(lowDetail, 100);

scene.add(lod);
```

## Object Pooling for Projectiles

```typescript
class ProjectilePool {
  private pool: Projectile[] = [];
  private active: Set<Projectile> = new Set();
  private readonly maxSize = 100;

  acquire(): Projectile | null {
    let projectile = this.pool.pop();

    if (!projectile && this.active.size < this.maxSize) {
      projectile = new Projectile();
    }

    if (projectile) {
      projectile.reset();
      this.active.add(projectile);
      return projectile;
    }

    return null; // Pool exhausted
  }

  release(projectile: Projectile): void {
    projectile.deactivate();
    this.active.delete(projectile);
    this.pool.push(projectile);
  }
}
```

## GPU Particles with THREE.Points

```typescript
const particleCount = 1000;
const positions = new Float32Array(particleCount * 3);
const colors = new Float32Array(particleCount * 3);

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

const material = new THREE.PointsMaterial({
  size: 0.5,
  vertexColors: true,
  transparent: true,
  opacity: 0.8,
  sizeAttenuation: true
});

const particles = new THREE.Points(geometry, material);
```

## Frustum Culling (Automatic)

Three.js does frustum culling by default. Ensure it's not disabled:
```typescript
mesh.frustumCulled = true; // Default, don't change
```

## Shadow Optimization

```typescript
// Limit shadow map resolution on mobile
const light = new THREE.DirectionalLight(0xffffff, 1);
light.castShadow = true;
light.shadow.mapSize.width = 512;  // Lower for mobile
light.shadow.mapSize.height = 512;
light.shadow.camera.near = 0.5;
light.shadow.camera.far = 50;

// Tight shadow camera bounds
light.shadow.camera.left = -20;
light.shadow.camera.right = 20;
light.shadow.camera.top = 20;
light.shadow.camera.bottom = -20;
```

## Material Optimization

```typescript
// Share materials between meshes
const sharedMaterial = new THREE.MeshStandardMaterial({
  color: 0x4ade80,
  flatShading: true,  // Cheaper than smooth shading
  metalness: 0,       // Non-PBR for performance
  roughness: 1
});

// Reuse for all grass blocks
grassBlocks.forEach(block => {
  block.material = sharedMaterial;
});
```

## Dispose Pattern

```typescript
class GameEntity {
  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private material: THREE.Material;

  dispose(): void {
    // Remove from scene first
    this.mesh.parent?.remove(this.mesh);

    // Dispose geometry
    this.geometry.dispose();

    // Dispose material(s)
    if (Array.isArray(this.material)) {
      this.material.forEach(m => m.dispose());
    } else {
      this.material.dispose();
    }

    // Dispose textures if any (we don't use them, but for reference)
    // this.material.map?.dispose();
  }
}
```

## Performance Monitoring

```typescript
// Log renderer info periodically
setInterval(() => {
  const info = renderer.info;
  console.log({
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures
  });
}, 5000);
```

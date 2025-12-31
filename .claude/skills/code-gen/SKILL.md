---
description: Generate TypeScript code for Voxel Odyssey following project standards and architecture
---

# Voxel Odyssey Code Generation Skill

Generate production-ready TypeScript code for the Voxel Odyssey game project.

## Code Requirements

### TypeScript Standards
- **Strict mode**: No `any` types - use proper typing throughout
- **Complete files**: Always output full, runnable TypeScript files
- **Imports**: Use tree-shakeable imports for Three.js
- **Classes**: Use private/public modifiers, readonly where appropriate

### Mobile-First Patterns
- Throttle all touch/input handlers to 60Hz max
- Use object pooling for frequently created/destroyed objects (projectiles, particles)
- Implement dispose() methods for all Three.js resources
- Avoid garbage collection spikes - reuse objects

### Three.js Patterns
```typescript
// Standard material setup
new THREE.MeshStandardMaterial({
  color: 0x4a90e2,
  flatShading: true,  // Required for voxel aesthetic
  // NO textures - vertex colors only
});

// Always dispose resources
dispose(): void {
  this.mesh.geometry.dispose();
  (this.mesh.material as THREE.Material).dispose();
  this.scene.remove(this.mesh);
}
```

### File Structure
Follow `architecture.md` for placement:
- `src/core/` - GameLoop, SceneManager
- `src/systems/` - InputManager, AudioManager, UIManager, StorageManager
- `src/game/` - Player, Boss, Enemy, WorldGenerator, CombatSystem
- `src/rendering/` - VoxelMesh, CharacterModel, Effects
- `src/levels/` - Level configs

### Code Template
```typescript
import * as THREE from 'three';

interface ComponentConfig {
  // Typed configuration
}

export class Component {
  private mesh: THREE.Mesh;
  private readonly config: ComponentConfig;

  constructor(scene: THREE.Scene, config: ComponentConfig) {
    this.config = config;
    this.mesh = this.createMesh();
    scene.add(this.mesh);
  }

  private createMesh(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a90e2,
      flatShading: true
    });
    return new THREE.Mesh(geometry, material);
  }

  update(delta: number): void {
    // Update logic - called every frame
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
```

## When Generating Code

1. Check `tasks.md` for current phase requirements
2. Reference `architecture.md` for file placement
3. Follow existing patterns in codebase
4. Include inline comments only for complex logic
5. Ensure TypeScript strict checks will pass

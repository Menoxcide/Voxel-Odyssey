# CLAUDE.MD - AI Development Guide for Voxel Odyssey

## Project Identity
**Game Name**: **VOXEL ODYSSEY** (Working title - to be finalized)
**Genre**: Mobile-First 3D Voxel Boss Battle Adventure
**Tech Stack**: TypeScript + Three.js + Vite + Cannon-es + Howler.js + NippleJS
**Target**: 60FPS on mobile (iOS/Android browsers), <5MB download, PWA-enabled
**Inspiration**: Enhanced recreation of DreamCore.gg's Voxel Journey with deeper gameplay

---

## Critical Context for AI Assistants

### Project Goals
1. **Mobile-First Performance**: Absolute priority - 60FPS on low-end devices (iPhone SE, Android A10)
2. **Incremental Development**: Build and test after each phase - no big-bang approach
3. **TypeScript Strict Mode**: Type safety throughout, no `any` types
4. **Code Economy**: AAA feel in <500 LOC core (excluding libs)
5. **Viral Potential**: Polished, shareable, instantly playable (PWA)

### Architecture Philosophy
- **Modular Systems**: Reusable managers (Input, Audio, UI, Storage) independent of game logic
- **ECS-Lite**: Entities (Player, Boss, Projectiles) with component-like structure but simple classes
- **Procedural Assets**: No external 3D models - all geometry generated via Three.js primitives
- **Optimized Rendering**: Instanced meshes, LOD, frustum culling, lazy chunk generation

---

## Development Workflow for AI

### Phase Execution Rules
1. **Follow tasks.md Order Strictly**: Each numbered step builds on previous (1→25)
2. **Output Complete Files**: Never partial code - always full, runnable TypeScript files
3. **Test Checkpoints**: After Steps 5, 12, 18, 25 - verify via `yarn dev` + mobile preview
4. **Commit Strategy**: Git commit after each major phase (5 commits total)
5. **Self-Review Before Output**:
   - No `console.error` in production code
   - Mobile touch handlers throttled to 60Hz
   - All Three.js resources disposed on cleanup
   - TypeScript strict checks pass

### Code Style Standards
```typescript
// ✅ GOOD: Mobile-optimized, typed, cleanup
class Player {
  private mesh: THREE.Mesh;
  private velocity = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a90e2, flatShading: true })
    );
    scene.add(this.mesh);
  }

  update(delta: number, input: InputState): void {
    // Throttled logic here
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ❌ BAD: No types, memory leak, over-engineered
class Player {
  constructor(scene) {
    this.mesh = createComplexMesh(); // Where's the type? Memory leak on dispose!
    this.stateMachine = new AdvancedFSM(); // Overkill for simple game
  }
}
```

### File Creation Priority
**Implement in this exact order** (maps to tasks.md phases):

#### Phase 1: Foundation (Steps 1-5)
1. `vite.config.ts` - Build config with PWA plugin
2. `tsconfig.json` - Strict mode enabled
3. `src/styles/global.scss` - Mobile viewport, canvas fullscreen
4. `src/systems/InputManager.ts` - Keyboard + Touch + Gyro (throttled)
5. `src/core/GameLoop.ts` - RAF with fixed physics step
6. `src/main.ts` - Initialize Three.js renderer, camera, lights

**Deliverable**: Spinning cube on mobile browser

#### Phase 2: Rendering (Steps 6-12)
7. `src/rendering/VoxelMesh.ts` - InstancedMesh for terrain chunks
8. `src/game/WorldGenerator.ts` - Simplex noise heightmap + trees
9. `src/rendering/CharacterModel.ts` - Procedural player/boss geometry
10. `src/rendering/Effects.ts` - ParticleSystem + BloomPass
11. `src/game/CombatSystem.ts` - Physics setup (Cannon-es)

**Deliverable**: Voxel world with player model, shadows

#### Phase 3: Gameplay (Steps 13-18)
12. `src/game/Player.ts` - Third-person controls, shooting
13. `src/game/Enemy.ts` - Minion AI (patrol, chase, attack)
14. `src/game/Boss.ts` - Multi-phase FSM
15. `src/systems/UIManager.ts` - DOM hearts, reticle, menus
16. `src/systems/AudioManager.ts` - Howler integration

**Deliverable**: Playable boss fight with UI/audio

#### Phase 4: Progression (Steps 19-25)
17. `src/levels/Level1.ts`, `Level2.ts`, `BossArena.ts` - Level configs
18. `src/core/SceneManager.ts` - Transitions, save system
19. `src/systems/StorageManager.ts` - localStorage highscores
20. Mobile optimizations (low-power mode, particle culling)
21. PWA manifest + service worker

**Deliverable**: Full game loop with saves, deployable build

---

## Mobile Optimization Checklist

### Performance Targets
- **Geometry**: Max 50k triangles on screen, use InstancedMesh for terrain
- **Draw Calls**: <100 per frame (batch voxels, merge static geo)
- **Textures**: None! Use vertex colors + flat shading only
- **Physics**: Fixed 60Hz tick, broadphase spatial hash
- **Particles**: GPU-based (THREE.Points), max 1000 active

### Touch Controls Implementation
```typescript
// InputManager.ts - Example structure
class InputManager {
  private joystick: nipplejs.JoystickManager;
  private shootButton: HTMLElement;

  constructor() {
    // Left joystick for movement
    this.joystick = nipplejs.create({
      zone: document.getElementById('joystick-zone')!,
      mode: 'static',
      position: { left: '80px', bottom: '80px' },
      color: 'cyan'
    });

    // Right button for shooting (with throttle)
    this.shootButton = document.getElementById('shoot-btn')!;
    this.shootButton.addEventListener('touchstart',
      this.throttle(() => this.onShoot(), 100) // Max 10 shots/sec
    );
  }

  private throttle(fn: Function, delay: number) {
    let last = 0;
    return (...args: any[]) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn(...args);
      }
    };
  }
}
```

---

## Game Design Specifications

### Player Character
- **Model**: Dodecahedron head (IcosahedronGeometry subdivided), cone body, cylinder staff with glowing sphere tip
- **Colors**: Blue gradient (#4a90e2 to #2c5aa0)
- **Controls**:
  - Mobile: Left joystick (move), right button (shoot), gyro (aim assist)
  - Desktop: WASD (move), Mouse (aim), Space (jump), Click (shoot)
- **Mechanics**: 3 hearts, i-frame flashing on hit, basic jump physics

### Boss Character
- **Model**: Similar to player + box ears + tube tail
- **Colors**: Purple (#a855f7 to #7c3aed)
- **Phases**:
  1. **Summon Phase** (100-66% HP): Spawns purple orb minions in waves
  2. **Beam Phase** (66-33% HP): Sweeping laser attack across arena
  3. **Rage Phase** (33-0% HP): Dash attacks + melee swipes
- **AI**: A* pathfinding, state machine (IDLE → SUMMON → ATTACK → RETREAT)

### World Generation
```typescript
// WorldGenerator.ts - Core algorithm
generateTerrain(size: number, seed: number): InstancedMesh {
  const noise = new SimplexNoise(seed);
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshStandardMaterial({
    vertexColors: true,
    flatShading: true
  });

  const matrix = new Matrix4();
  const color = new Color();
  const colors: number[] = [];

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      const height = noise.noise2D(x * 0.1, z * 0.1) * 5; // Heightmap
      matrix.setPosition(x, height, z);
      mesh.setMatrixAt(index, matrix);

      // Vertex coloring: green grass, blue water, brown dirt
      const c = height > 0 ? 0x4ade80 : 0x3b82f6;
      color.setHex(c);
      colors.push(color.r, color.g, color.b);
    }
  }

  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return new InstancedMesh(geometry, material, size * size);
}
```

---

## Common Pitfalls & Solutions

### Issue: Low FPS on Mobile
**Causes**: Too many draw calls, no LOD, garbage collection spikes
**Fixes**:
1. Use InstancedMesh for all repeated geometry (terrain, trees)
2. Implement LOD: distant chunks switch to wireframe or billboards
3. Object pooling for projectiles/particles (reuse, don't create/destroy)
4. Disable antialiasing: `new WebGLRenderer({ antialias: false })`

### Issue: Touch Controls Not Responding
**Causes**: Event listeners not throttled, CSS `touch-action` not disabled
**Fixes**:
```css
/* global.scss */
#canvas {
  touch-action: none; /* Prevent browser gestures */
  width: 100vw;
  height: 100vh;
}
```

### Issue: Physics Jitter/Tunneling
**Causes**: Variable timestep, too-fast projectiles
**Fixes**:
```typescript
// GameLoop.ts - Fixed timestep physics
private fixedUpdate(delta: number): void {
  const step = 1 / 60;
  this.accumulator += Math.min(delta, 0.1); // Cap to prevent spiral of death

  while (this.accumulator >= step) {
    this.physicsWorld.step(step);
    this.accumulator -= step;
  }
}
```

---

## Testing & Validation

### Per-Phase Tests
| Phase | Test Cases |
|-------|-----------|
| 1 | Canvas renders, input logs to console, RAF runs at 60Hz |
| 2 | Voxel terrain generates, player model visible, shadows render |
| 3 | Touch joystick moves player, shoot button fires projectiles, boss takes damage |
| 4 | Level transitions work, progress saves to localStorage, PWA installs on iOS |

### Mobile Device Testing (Required)
- **iOS**: Safari on iPhone SE (2020) - Test gyro permissions
- **Android**: Chrome on Pixel 4a / Samsung A10 - Test WebGL2 fallback
- **Tools**: Chrome DevTools Device Mode → Throttle CPU 4x, Network Slow 3G

### Performance Benchmarks
```bash
# Run Lighthouse audit (target scores)
Performance: >90
Accessibility: >95
Best Practices: >90
PWA: 100 (installable)
```

---

## Prompt Templates for AI Assistants

### When Starting a New Phase
```
Implement Phase [N] from tasks.md (Steps [X-Y]).
Follow architecture.md file structure exactly.
Output complete TypeScript files with:
- Strict typing (no 'any')
- Mobile optimizations (throttling, pooling)
- Dispose methods for Three.js cleanup
- Inline comments for complex logic only

Test plan: [specific verification steps]
```

### When Debugging
```
Fix [issue] in [file].
Current behavior: [description]
Expected: [description]
Constraints: Maintain 60FPS mobile, no new dependencies
Show before/after code diffs.
```

### When Optimizing
```
Optimize [system] for mobile performance.
Current FPS: [X], Target: 60
Profile shows: [bottleneck]
Apply: [instancing/LOD/culling/pooling]
Verify with stats.js overlay.
```

---

## Dependency Reference

### NPM Packages (package.json)
```json
{
  "dependencies": {
    "three": "^0.165.0",
    "cannon-es": "^0.20.0",
    "howler": "^2.2.4",
    "nipplejs": "^0.10.2"
  },
  "devDependencies": {
    "vite": "^5.2.0",
    "typescript": "^5.4.0",
    "@types/three": "^0.165.0",
    "sass": "^1.75.0",
    "vite-plugin-pwa": "^0.20.0"
  }
}
```

### Import Patterns
```typescript
// Three.js (tree-shakeable)
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Physics
import * as CANNON from 'cannon-es';

// Audio (ESM version)
import { Howl } from 'howler';

// Touch controls (UMD)
import nipplejs from 'nipplejs';
```

---

## Deployment Pipeline

### Build Commands
```bash
# Development (HMR on localhost:5173)
yarn dev

# Production build (outputs to dist/)
yarn build

# Preview production build locally
yarn preview

# Type check only
yarn tsc --noEmit
```

### Deployment Targets
1. **Netlify**: Drag `dist/` folder or connect GitHub repo
   - Build command: `yarn build`
   - Publish directory: `dist`
   - Add `_redirects`: `/* /index.html 200` for SPA routing

2. **GitHub Pages**:
   ```bash
   yarn build
   cd dist
   git init && git add . && git commit -m "Deploy"
   git push -f git@github.com:username/voxel-odyssey.git main:gh-pages
   ```

3. **Itch.io**: Zip `dist/`, upload as HTML5 game
   - Check "Embed in page"
   - Viewport: 1920x1080 (scales down)

---

## Custom Skills for AI Development

This project includes custom Claude Code skills in `.claude/skills/` tailored specifically for Voxel Odyssey development.

### Available Skills

1. **code-gen** - TypeScript/Three.js Code Generation
   - Location: `.claude/skills/code-gen/SKILL.md`
   - Use for: Scaffolding TypeScript classes (Player.ts, Boss.ts)
   - Ensures: Strict typing, mobile optimizations, dispose patterns
   - Example: "Generate Player.ts with third-person controls"

2. **web-testing** - Performance Testing & Optimization
   - Location: `.claude/skills/web-testing/SKILL.md`
   - Use for: Performance profiling, mobile debugging, FPS optimization
   - Includes: Testing checklists, Lighthouse targets, common issue fixes
   - Example: "Test and optimize GameLoop.ts for 60FPS"

3. **threejs-optimize** - Three.js Rendering Optimization
   - Location: `.claude/skills/threejs-optimize/SKILL.md`
   - Use for: InstancedMesh, LOD, object pooling, GPU particles
   - Includes: Renderer config, dispose patterns, shadow optimization
   - Example: "Optimize terrain rendering with instancing"

4. **game-mechanics** - Gameplay Implementation
   - Location: `.claude/skills/game-mechanics/SKILL.md`
   - Use for: Player controls, boss AI, combat systems, juice effects
   - Includes: State machines, attack patterns, hit detection
   - Example: "Implement boss phase 2 beam attack"

### Usage

Skills are automatically loaded from `.claude/skills/`. Reference them in prompts:
```
Use the code-gen skill to scaffold the Enemy.ts class
Use the web-testing skill to check performance after implementing the particle system
```

---

## Success Criteria

### Minimum Viable Product (MVP)
- [ ] Loads on mobile browser in <3 seconds
- [ ] 60FPS gameplay on iPhone SE / Android A10
- [ ] Complete boss fight (all 3 phases functional)
- [ ] Touch controls responsive (joystick + shoot button)
- [ ] Audio plays (background music + SFX)
- [ ] Game Over → Retry loop works
- [ ] PWA installable (Add to Home Screen)

### Polish Phase (Post-MVP)
- [ ] 3 explorable levels before boss
- [ ] Particle effects on all actions
- [ ] Screen shake, hit-stop, slowmo juice
- [ ] Unlockable skins (localStorage)
- [ ] Leaderboard integration (mock API)
- [ ] Tutorial popups on first play
- [ ] Colorblind mode toggle

---

## Final Notes for AI Assistants

1. **Incremental Is King**: Never jump ahead in phases - each step validates the previous
2. **Mobile Testing Is Mandatory**: DevTools simulation is not enough - test on real devices
3. **Performance Over Features**: 60FPS is non-negotiable - cut features if needed
4. **No External Assets**: Everything procedural - keeps download tiny, no copyright issues
5. **Commit Messages**: Use conventional commits (e.g., `feat: add player shooting mechanics`)

**When in doubt**: Consult tasks.md for granular steps, architecture.md for file structure, this document for implementation patterns.

---

**Let's build the first viral game of 2026! 🚀**

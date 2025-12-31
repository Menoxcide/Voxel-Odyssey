---
description: Game mechanics implementation patterns for Voxel Odyssey boss battles
---

# Game Mechanics Skill

Implementation patterns for player controls, boss AI, combat systems, and game logic.

## Player Character

### Model Specification
```typescript
// Procedural player geometry
class PlayerModel {
  // Head: Dodecahedron (subdivided icosahedron)
  head = new THREE.IcosahedronGeometry(0.5, 1);

  // Body: Cone
  body = new THREE.ConeGeometry(0.4, 1, 8);

  // Staff: Cylinder with glowing sphere
  staff = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8);
  orbGeometry = new THREE.SphereGeometry(0.15, 8, 8);

  // Colors: Blue gradient
  primaryColor = 0x4a90e2;
  secondaryColor = 0x2c5aa0;
}
```

### Third-Person Controls
```typescript
interface InputState {
  moveX: number;      // -1 to 1 (joystick/WASD)
  moveZ: number;      // -1 to 1
  aimX: number;       // Mouse/gyro aim
  aimY: number;
  shooting: boolean;
  jumping: boolean;
}

update(delta: number, input: InputState): void {
  // Movement relative to camera
  const moveDir = new THREE.Vector3(input.moveX, 0, input.moveZ);
  moveDir.applyQuaternion(this.camera.quaternion);
  moveDir.y = 0;
  moveDir.normalize();

  this.velocity.add(moveDir.multiplyScalar(this.speed * delta));
  this.velocity.multiplyScalar(0.9); // Friction

  this.mesh.position.add(this.velocity);
}
```

### Damage System
```typescript
class HealthSystem {
  private health: number;
  private maxHealth: number;
  private invincible = false;
  private invincibilityDuration = 1000; // ms

  takeDamage(amount: number): boolean {
    if (this.invincible) return false;

    this.health -= amount;
    this.invincible = true;

    // I-frame flashing effect
    this.startFlashing();

    setTimeout(() => {
      this.invincible = false;
      this.stopFlashing();
    }, this.invincibilityDuration);

    return this.health <= 0; // Returns true if dead
  }
}
```

## Boss Character

### Model Specification
```typescript
// Boss: Similar to player + ears + tail
class BossModel extends PlayerModel {
  // Additional features
  ears = new THREE.BoxGeometry(0.3, 0.5, 0.1); // Two box ears
  tail = new THREE.CylinderGeometry(0.1, 0.05, 1, 8); // Tube tail

  // Colors: Purple gradient
  primaryColor = 0xa855f7;
  secondaryColor = 0x7c3aed;
}
```

### Phase State Machine
```typescript
enum BossPhase {
  SUMMON = 'SUMMON',   // 100-66% HP
  BEAM = 'BEAM',       // 66-33% HP
  RAGE = 'RAGE'        // 33-0% HP
}

enum BossState {
  IDLE = 'IDLE',
  SUMMONING = 'SUMMONING',
  ATTACKING = 'ATTACKING',
  RETREATING = 'RETREATING'
}

class BossAI {
  private phase: BossPhase = BossPhase.SUMMON;
  private state: BossState = BossState.IDLE;

  update(delta: number): void {
    this.updatePhase();

    switch (this.state) {
      case BossState.IDLE:
        this.decideNextAction();
        break;
      case BossState.SUMMONING:
        this.updateSummon(delta);
        break;
      case BossState.ATTACKING:
        this.updateAttack(delta);
        break;
      case BossState.RETREATING:
        this.updateRetreat(delta);
        break;
    }
  }

  private updatePhase(): void {
    const hpPercent = this.health / this.maxHealth;

    if (hpPercent <= 0.33) {
      this.phase = BossPhase.RAGE;
    } else if (hpPercent <= 0.66) {
      this.phase = BossPhase.BEAM;
    }
  }
}
```

### Attack Patterns

#### Phase 1: Summon
```typescript
spawnMinions(count: number): void {
  const angleStep = (Math.PI * 2) / count;

  for (let i = 0; i < count; i++) {
    const angle = angleStep * i;
    const x = this.position.x + Math.cos(angle) * 5;
    const z = this.position.z + Math.sin(angle) * 5;

    const minion = this.minionPool.acquire();
    if (minion) {
      minion.spawn(x, 0, z);
    }
  }
}
```

#### Phase 2: Beam
```typescript
class BeamAttack {
  private angle = 0;
  private sweepSpeed = Math.PI / 2; // 90 degrees per second

  update(delta: number): void {
    this.angle += this.sweepSpeed * delta;

    // Raycast to check player hit
    const direction = new THREE.Vector3(
      Math.cos(this.angle),
      0,
      Math.sin(this.angle)
    );

    this.raycaster.set(this.origin, direction);
    const hits = this.raycaster.intersectObject(player.mesh);

    if (hits.length > 0) {
      player.takeDamage(1);
    }
  }
}
```

#### Phase 3: Rage
```typescript
dashAttack(targetPosition: THREE.Vector3): void {
  const direction = targetPosition.clone()
    .sub(this.position)
    .normalize();

  this.velocity.copy(direction.multiplyScalar(this.dashSpeed));
  this.state = BossState.ATTACKING;

  // End dash after duration
  setTimeout(() => {
    this.velocity.set(0, 0, 0);
    this.state = BossState.RETREATING;
  }, 500);
}
```

## Enemy Minions

### Simple AI Behaviors
```typescript
enum MinionState {
  PATROL,
  CHASE,
  ATTACK
}

class MinionAI {
  private detectionRange = 10;
  private attackRange = 2;

  update(delta: number, playerPos: THREE.Vector3): void {
    const distance = this.position.distanceTo(playerPos);

    if (distance < this.attackRange) {
      this.state = MinionState.ATTACK;
      this.attack();
    } else if (distance < this.detectionRange) {
      this.state = MinionState.CHASE;
      this.moveToward(playerPos, delta);
    } else {
      this.state = MinionState.PATROL;
      this.patrol(delta);
    }
  }
}
```

## Combat System

### Projectile Physics
```typescript
class Projectile {
  private body: CANNON.Body;
  private mesh: THREE.Mesh;
  private damage = 1;
  private speed = 20;

  fire(origin: THREE.Vector3, direction: THREE.Vector3): void {
    this.body.position.copy(origin as any);
    this.body.velocity.copy(
      direction.multiplyScalar(this.speed) as any
    );

    this.body.addEventListener('collide', this.onCollide.bind(this));
  }

  private onCollide(event: { body: CANNON.Body }): void {
    const target = this.getEntityFromBody(event.body);
    if (target?.takeDamage) {
      target.takeDamage(this.damage);
    }
    this.deactivate();
  }
}
```

### Hit Detection with Cannon-es
```typescript
// Physics world setup
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);
world.broadphase = new CANNON.SAPBroadphase(world);

// Collision groups
const PLAYER = 1;
const ENEMY = 2;
const PROJECTILE = 4;
const GROUND = 8;

// Player body
playerBody.collisionFilterGroup = PLAYER;
playerBody.collisionFilterMask = ENEMY | GROUND;

// Enemy projectile
enemyProjectile.collisionFilterGroup = PROJECTILE;
enemyProjectile.collisionFilterMask = PLAYER | GROUND;
```

## Game State Management

```typescript
enum GameState {
  MENU,
  PLAYING,
  PAUSED,
  GAME_OVER,
  VICTORY
}

class GameManager {
  private state: GameState = GameState.MENU;

  setState(newState: GameState): void {
    const prevState = this.state;
    this.state = newState;

    this.onStateChange(prevState, newState);
  }

  private onStateChange(from: GameState, to: GameState): void {
    switch (to) {
      case GameState.PLAYING:
        this.audioManager.playMusic('battle');
        this.uiManager.hideMenu();
        break;
      case GameState.GAME_OVER:
        this.audioManager.playSound('defeat');
        this.uiManager.showGameOver();
        break;
      case GameState.VICTORY:
        this.audioManager.playSound('victory');
        this.saveProgress();
        this.uiManager.showVictory();
        break;
    }
  }
}
```

## Juice Effects

### Screen Shake
```typescript
class CameraShake {
  private intensity = 0;
  private decay = 5;

  shake(amount: number): void {
    this.intensity = Math.max(this.intensity, amount);
  }

  update(delta: number, camera: THREE.Camera): void {
    if (this.intensity > 0.01) {
      camera.position.x += (Math.random() - 0.5) * this.intensity;
      camera.position.y += (Math.random() - 0.5) * this.intensity;
      this.intensity *= Math.pow(0.1, delta * this.decay);
    }
  }
}
```

### Hit Stop (Frame Freeze)
```typescript
class HitStop {
  private freezeTime = 0;

  trigger(duration: number): void {
    this.freezeTime = duration;
  }

  shouldUpdate(): boolean {
    if (this.freezeTime > 0) {
      this.freezeTime -= 16; // Approximate frame time
      return false;
    }
    return true;
  }
}
```

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { HealthSystem, COLLISION_GROUPS } from './CombatSystem';

export enum EnemyState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  CHASE = 'CHASE',
  ATTACK = 'ATTACK',
  DEAD = 'DEAD'
}

export interface EnemyConfig {
  health: number;
  speed: number;
  damage: number;
  detectionRange: number;
  attackRange: number;
  attackCooldown: number;
  color: number;
  scale: number;
}

const DEFAULT_MINION_CONFIG: EnemyConfig = {
  health: 1,
  speed: 5,
  damage: 1,
  detectionRange: 15,
  attackRange: 2,
  attackCooldown: 1,
  color: 0xa855f7,
  scale: 0.6
};

export class Enemy {
  protected readonly mesh: THREE.Mesh;
  protected readonly body: CANNON.Body;
  protected readonly healthSystem: HealthSystem;
  protected readonly config: EnemyConfig;

  protected state: EnemyState = EnemyState.IDLE;
  protected attackCooldown = 0;
  protected animationTime = 0;

  // Patrol
  protected patrolTarget: THREE.Vector3 | null = null;
  protected patrolCenter: THREE.Vector3;
  protected readonly patrolRadius = 8;

  // Materials for damage flash
  protected readonly material: THREE.MeshStandardMaterial;
  protected damageFlashTime = 0;

  // Callback for death
  public onDeath?: (enemy: Enemy) => void;
  public onAttack?: (enemy: Enemy, targetPosition: THREE.Vector3) => void;

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3,
    config: Partial<EnemyConfig> = {}
  ) {
    this.config = { ...DEFAULT_MINION_CONFIG, ...config };
    this.patrolCenter = spawnPosition.clone();

    // Create mesh (purple orb)
    const geometry = new THREE.SphereGeometry(0.5 * this.config.scale, 12, 12);
    this.material = new THREE.MeshStandardMaterial({
      color: this.config.color,
      emissive: this.config.color,
      emissiveIntensity: 0.3,
      flatShading: true
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.copy(spawnPosition);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // Create physics body
    const shape = new CANNON.Sphere(0.5 * this.config.scale);
    this.body = new CANNON.Body({
      mass: 0.5,
      shape,
      position: new CANNON.Vec3(spawnPosition.x, spawnPosition.y, spawnPosition.z),
      linearDamping: 0.5,
      fixedRotation: true,
      collisionFilterGroup: COLLISION_GROUPS.ENEMY,
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.PLAYER_PROJECTILE
    });

    physicsWorld.addBody(this.body);

    // Initialize health
    this.healthSystem = new HealthSystem(this.config.health, 0.5);
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    if (this.state === EnemyState.DEAD) return;

    this.animationTime += delta;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.healthSystem.update(delta);

    // Floating animation
    const floatOffset = Math.sin(this.animationTime * 3) * 0.2;
    this.mesh.position.y = this.body.position.y + floatOffset;

    // Update damage flash
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= delta;
      const flash = Math.sin(this.damageFlashTime * 30) > 0;
      this.material.emissiveIntensity = flash ? 1 : 0.3;

      if (this.damageFlashTime <= 0) {
        this.material.emissiveIntensity = 0.3;
      }
    }

    // AI state machine
    const distanceToPlayer = this.getPosition().distanceTo(playerPosition);

    switch (this.state) {
      case EnemyState.IDLE:
        this.updateIdle(distanceToPlayer);
        break;
      case EnemyState.PATROL:
        this.updatePatrol(delta, distanceToPlayer);
        break;
      case EnemyState.CHASE:
        this.updateChase(delta, playerPosition, distanceToPlayer);
        break;
      case EnemyState.ATTACK:
        this.updateAttack(playerPosition, distanceToPlayer);
        break;
    }

    // Sync mesh with physics (except Y which has float offset)
    this.mesh.position.x = this.body.position.x;
    this.mesh.position.z = this.body.position.z;
  }

  protected updateIdle(distanceToPlayer: number): void {
    if (distanceToPlayer < this.config.detectionRange) {
      this.state = EnemyState.CHASE;
    } else if (Math.random() < 0.01) {
      this.state = EnemyState.PATROL;
      this.pickNewPatrolTarget();
    }
  }

  protected updatePatrol(_delta: number, distanceToPlayer: number): void {
    if (distanceToPlayer < this.config.detectionRange) {
      this.state = EnemyState.CHASE;
      return;
    }

    if (!this.patrolTarget) {
      this.pickNewPatrolTarget();
      return;
    }

    const toTarget = new THREE.Vector3()
      .subVectors(this.patrolTarget, this.getPosition());
    toTarget.y = 0;

    if (toTarget.length() < 1) {
      this.state = EnemyState.IDLE;
      this.patrolTarget = null;
      return;
    }

    toTarget.normalize();
    this.body.velocity.x = toTarget.x * this.config.speed * 0.5;
    this.body.velocity.z = toTarget.z * this.config.speed * 0.5;
  }

  protected updateChase(_delta: number, playerPosition: THREE.Vector3, distanceToPlayer: number): void {
    if (distanceToPlayer > this.config.detectionRange * 1.5) {
      this.state = EnemyState.PATROL;
      return;
    }

    if (distanceToPlayer < this.config.attackRange) {
      this.state = EnemyState.ATTACK;
      return;
    }

    // Move toward player
    const toPlayer = new THREE.Vector3()
      .subVectors(playerPosition, this.getPosition());
    toPlayer.y = 0;
    toPlayer.normalize();

    this.body.velocity.x = toPlayer.x * this.config.speed;
    this.body.velocity.z = toPlayer.z * this.config.speed;
  }

  protected updateAttack(playerPosition: THREE.Vector3, distanceToPlayer: number): void {
    if (distanceToPlayer > this.config.attackRange * 1.5) {
      this.state = EnemyState.CHASE;
      return;
    }

    // Stop moving during attack
    this.body.velocity.x = 0;
    this.body.velocity.z = 0;

    // Attack when cooldown ready
    if (this.attackCooldown <= 0) {
      this.performAttack(playerPosition);
      this.attackCooldown = this.config.attackCooldown;
    }
  }

  protected performAttack(targetPosition: THREE.Vector3): void {
    if (this.onAttack) {
      this.onAttack(this, targetPosition);
    }
  }

  protected pickNewPatrolTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * this.patrolRadius;

    this.patrolTarget = new THREE.Vector3(
      this.patrolCenter.x + Math.cos(angle) * distance,
      this.patrolCenter.y,
      this.patrolCenter.z + Math.sin(angle) * distance
    );
  }

  takeDamage(amount: number = 1): boolean {
    if (this.state === EnemyState.DEAD) return false;

    const damaged = this.healthSystem.takeDamage(amount);

    if (damaged) {
      this.damageFlashTime = 0.3;

      if (this.healthSystem.isDead()) {
        this.die();
      }
    }

    return damaged;
  }

  protected die(): void {
    this.state = EnemyState.DEAD;
    this.body.velocity.set(0, 0, 0);

    if (this.onDeath) {
      this.onDeath(this);
    }
  }

  getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }

  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  getBody(): CANNON.Body {
    return this.body;
  }

  getState(): EnemyState {
    return this.state;
  }

  isDead(): boolean {
    return this.state === EnemyState.DEAD;
  }

  getDamage(): number {
    return this.config.damage;
  }

  heal(amount: number): void {
    this.healthSystem.heal(amount);
  }

  dispose(scene: THREE.Scene, physicsWorld: CANNON.World): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    physicsWorld.removeBody(this.body);
  }
}

// Suicide bomber minion - explodes on contact
export class SuicideBomber extends Enemy {
  private readonly explosionRadius = 3;
  public onExplode?: (position: THREE.Vector3, radius: number, damage: number) => void;

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3
  ) {
    super(scene, physicsWorld, spawnPosition, {
      health: 1,
      speed: 7,
      damage: 2,
      detectionRange: 20,
      attackRange: 1.5,
      attackCooldown: 0,
      color: 0xef4444,
      scale: 0.5
    });
  }

  protected override performAttack(_targetPosition: THREE.Vector3): void {
    // Explode instead of regular attack
    if (this.onExplode) {
      this.onExplode(this.getPosition(), this.explosionRadius, this.config.damage);
    }
    this.die();
  }
}

// Shooter enemy - fires projectiles at player from range
export class Shooter extends Enemy {
  public onShoot?: (origin: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number) => void;
  private readonly projectileSpeed = 15;

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3
  ) {
    super(scene, physicsWorld, spawnPosition, {
      health: 2,
      speed: 3,
      damage: 1,
      detectionRange: 25,
      attackRange: 15,
      attackCooldown: 2,
      color: 0xf59e0b, // Orange
      scale: 0.7
    });

    // Add spikes to shooter mesh to differentiate
    this.addSpikes(scene);
  }

  private addSpikes(_scene: THREE.Scene): void {
    const spikeGeometry = new THREE.ConeGeometry(0.15, 0.4, 4);
    const spikeMaterial = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.5
    });

    // Add 4 spikes around the sphere
    for (let i = 0; i < 4; i++) {
      const spike = new THREE.Mesh(spikeGeometry, spikeMaterial);
      const angle = (i / 4) * Math.PI * 2;
      spike.position.set(
        Math.cos(angle) * 0.4,
        0,
        Math.sin(angle) * 0.4
      );
      spike.rotation.z = -Math.PI / 2;
      spike.rotation.y = angle;
      this.mesh.add(spike);
    }
  }

  protected override updateChase(_delta: number, playerPosition: THREE.Vector3, distanceToPlayer: number): void {
    // Shooter tries to maintain distance - backs up if too close
    if (distanceToPlayer < this.config.attackRange * 0.5) {
      const awayFromPlayer = new THREE.Vector3()
        .subVectors(this.getPosition(), playerPosition);
      awayFromPlayer.y = 0;
      awayFromPlayer.normalize();

      this.body.velocity.x = awayFromPlayer.x * this.config.speed;
      this.body.velocity.z = awayFromPlayer.z * this.config.speed;
      return;
    }

    if (distanceToPlayer > this.config.detectionRange * 1.5) {
      this.state = EnemyState.PATROL;
      return;
    }

    if (distanceToPlayer < this.config.attackRange) {
      this.state = EnemyState.ATTACK;
      return;
    }

    // Move toward player but slowly
    const toPlayer = new THREE.Vector3()
      .subVectors(playerPosition, this.getPosition());
    toPlayer.y = 0;
    toPlayer.normalize();

    this.body.velocity.x = toPlayer.x * this.config.speed;
    this.body.velocity.z = toPlayer.z * this.config.speed;
  }

  protected override performAttack(targetPosition: THREE.Vector3): void {
    if (this.onShoot) {
      const direction = new THREE.Vector3()
        .subVectors(targetPosition, this.getPosition())
        .normalize();
      // Add slight inaccuracy
      direction.x += (Math.random() - 0.5) * 0.1;
      direction.z += (Math.random() - 0.5) * 0.1;
      direction.normalize();

      this.onShoot(this.getPosition(), direction, this.projectileSpeed, this.config.damage);
    }
  }
}

// Tank enemy - slow but high HP, knocks back player
export class Tank extends Enemy {
  private chargeTimer = 0;
  private isCharging = false;
  private chargeDirection = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3
  ) {
    super(scene, physicsWorld, spawnPosition, {
      health: 5,
      speed: 2.5,
      damage: 2,
      detectionRange: 12,
      attackRange: 2.5,
      attackCooldown: 3,
      color: 0x6366f1, // Indigo
      scale: 1.2
    });

    // Make tank mesh more cube-like
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.BoxGeometry(
      1 * this.config.scale,
      0.8 * this.config.scale,
      1 * this.config.scale
    );
  }

  override update(delta: number, playerPosition: THREE.Vector3): void {
    if (this.isCharging) {
      this.chargeTimer -= delta;

      // Charge movement
      this.body.velocity.x = this.chargeDirection.x * this.config.speed * 4;
      this.body.velocity.z = this.chargeDirection.z * this.config.speed * 4;

      if (this.chargeTimer <= 0) {
        this.isCharging = false;
        this.state = EnemyState.CHASE;
      }

      // Still sync mesh position
      this.mesh.position.x = this.body.position.x;
      this.mesh.position.y = this.body.position.y;
      this.mesh.position.z = this.body.position.z;
      return;
    }

    super.update(delta, playerPosition);
  }

  protected override performAttack(targetPosition: THREE.Vector3): void {
    // Start a charge attack
    this.chargeDirection.subVectors(targetPosition, this.getPosition());
    this.chargeDirection.y = 0;
    this.chargeDirection.normalize();

    this.isCharging = true;
    this.chargeTimer = 0.5; // Charge for 0.5 seconds

    super.performAttack(targetPosition);
  }
}

// Speeder enemy - very fast, hit-and-run tactics
export class Speeder extends Enemy {
  private retreatTimer = 0;
  private isRetreating = false;

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3
  ) {
    super(scene, physicsWorld, spawnPosition, {
      health: 1,
      speed: 12,
      damage: 1,
      detectionRange: 30,
      attackRange: 1.5,
      attackCooldown: 0.5,
      color: 0x22d3ee, // Cyan
      scale: 0.4
    });

    // Elongate the mesh for speed appearance
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.CapsuleGeometry(0.2, 0.5, 4, 8);
  }

  override update(delta: number, playerPosition: THREE.Vector3): void {
    if (this.isRetreating) {
      this.retreatTimer -= delta;

      // Retreat away from player
      const awayFromPlayer = new THREE.Vector3()
        .subVectors(this.getPosition(), playerPosition);
      awayFromPlayer.y = 0;
      awayFromPlayer.normalize();

      this.body.velocity.x = awayFromPlayer.x * this.config.speed;
      this.body.velocity.z = awayFromPlayer.z * this.config.speed;

      if (this.retreatTimer <= 0) {
        this.isRetreating = false;
      }

      // Sync mesh
      this.mesh.position.x = this.body.position.x;
      this.mesh.position.y = this.body.position.y + Math.sin(this.animationTime * 5) * 0.3;
      this.mesh.position.z = this.body.position.z;

      // Face movement direction
      this.mesh.rotation.y = Math.atan2(awayFromPlayer.x, awayFromPlayer.z);
      return;
    }

    super.update(delta, playerPosition);

    // Face player when chasing
    if (this.state === EnemyState.CHASE) {
      const toPlayer = new THREE.Vector3().subVectors(playerPosition, this.getPosition());
      this.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    }
  }

  protected override performAttack(targetPosition: THREE.Vector3): void {
    super.performAttack(targetPosition);

    // After attacking, retreat
    this.isRetreating = true;
    this.retreatTimer = 1.5;
  }
}

// Healer enemy - heals nearby allies, weak in combat
export class Healer extends Enemy {
  private healRadius = 8;
  private healAmount = 1;
  public onHeal?: (position: THREE.Vector3, radius: number) => void;

  // Store reference to find other enemies
  private readonly allEnemies: () => Enemy[];

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3,
    enemiesGetter: () => Enemy[]
  ) {
    super(scene, physicsWorld, spawnPosition, {
      health: 2,
      speed: 4,
      damage: 0,
      detectionRange: 20,
      attackRange: 10,
      attackCooldown: 3,
      color: 0x4ade80, // Green
      scale: 0.6
    });

    this.allEnemies = enemiesGetter;

    // Add healing ring visual
    this.addHealingRing(scene);
  }

  private addHealingRing(_scene: THREE.Scene): void {
    const ringGeometry = new THREE.TorusGeometry(0.5, 0.05, 8, 16);
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      emissive: 0x4ade80,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.6
    });

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    this.mesh.add(ring);
  }

  protected override updateChase(_delta: number, playerPosition: THREE.Vector3, distanceToPlayer: number): void {
    // Healer tries to stay away from player
    if (distanceToPlayer < 8) {
      const awayFromPlayer = new THREE.Vector3()
        .subVectors(this.getPosition(), playerPosition);
      awayFromPlayer.y = 0;
      awayFromPlayer.normalize();

      this.body.velocity.x = awayFromPlayer.x * this.config.speed;
      this.body.velocity.z = awayFromPlayer.z * this.config.speed;
    } else {
      // Stay near other enemies
      this.body.velocity.x *= 0.9;
      this.body.velocity.z *= 0.9;
    }

    // Always try to heal when in range
    if (this.attackCooldown <= 0) {
      this.state = EnemyState.ATTACK;
    }
  }

  protected override performAttack(_targetPosition: THREE.Vector3): void {
    // Heal nearby enemies
    const myPos = this.getPosition();
    const enemies = this.allEnemies();

    for (const enemy of enemies) {
      if (enemy === this) continue;
      if (enemy.isDead()) continue;

      const dist = enemy.getPosition().distanceTo(myPos);
      if (dist <= this.healRadius) {
        // Heal the enemy (we need to access healthSystem)
        enemy.heal(this.healAmount);
      }
    }

    if (this.onHeal) {
      this.onHeal(myPos, this.healRadius);
    }
  }
}

// Shielder enemy - has a regenerating shield
export class Shielder extends Enemy {
  private shield: number;
  private readonly maxShield = 3;
  private shieldRegenTimer = 0;
  private readonly shieldRegenDelay = 5;
  private shieldMesh: THREE.Mesh;

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3
  ) {
    super(scene, physicsWorld, spawnPosition, {
      health: 2,
      speed: 3.5,
      damage: 1,
      detectionRange: 15,
      attackRange: 2,
      attackCooldown: 1.5,
      color: 0x8b5cf6, // Purple
      scale: 0.7
    });

    this.shield = this.maxShield;

    // Create shield visual
    const shieldGeometry = new THREE.IcosahedronGeometry(0.6, 1);
    const shieldMaterial = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x60a5fa,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.4,
      wireframe: true
    });

    this.shieldMesh = new THREE.Mesh(shieldGeometry, shieldMaterial);
    this.mesh.add(this.shieldMesh);
  }

  override update(delta: number, playerPosition: THREE.Vector3): void {
    super.update(delta, playerPosition);

    // Regenerate shield over time
    if (this.shield < this.maxShield) {
      this.shieldRegenTimer += delta;
      if (this.shieldRegenTimer >= this.shieldRegenDelay) {
        this.shield = Math.min(this.shield + 1, this.maxShield);
        this.shieldRegenTimer = 0;
      }
    }

    // Update shield visual
    this.shieldMesh.visible = this.shield > 0;
    this.shieldMesh.scale.setScalar(0.8 + (this.shield / this.maxShield) * 0.4);
    this.shieldMesh.rotation.y += delta * 2;
    this.shieldMesh.rotation.x += delta * 1.5;
  }

  override takeDamage(amount: number = 1): boolean {
    if (this.state === EnemyState.DEAD) return false;

    // Shield absorbs damage first
    if (this.shield > 0) {
      this.shield -= amount;
      this.shieldRegenTimer = 0; // Reset regen timer on hit
      this.damageFlashTime = 0.2;

      if (this.shield < 0) {
        // Overflow damage goes to health
        const overflow = -this.shield;
        this.shield = 0;
        return super.takeDamage(overflow);
      }
      return true;
    }

    return super.takeDamage(amount);
  }

  // Override dispose to clean up shield mesh
  override dispose(scene: THREE.Scene, physicsWorld: CANNON.World): void {
    this.shieldMesh.geometry.dispose();
    (this.shieldMesh.material as THREE.Material).dispose();
    super.dispose(scene, physicsWorld);
  }
}

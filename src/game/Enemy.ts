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

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

/**
 * Interface for instancing callbacks
 * Used to communicate with the EnemyInstancing system
 */
export interface EnemyInstancingCallbacks {
  onRegister: (id: string, position: THREE.Vector3, scale: number) => void;
  onUnregister: (id: string) => void;
  onTransformUpdate: (id: string, position: THREE.Vector3, rotation: number) => void;
  onDamageFlash: (id: string, duration: number) => void;
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

// Global unique ID counter for enemy instances
let enemyIdCounter = 0;

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

  // Knockback visual feedback callback
  public onKnockback?: (position: THREE.Vector3, direction: THREE.Vector3, force: number) => void;

  // Terrain following
  protected getTerrainHeight: ((x: number, z: number) => number) | null = null;

  // Distance-based update throttling for performance optimization
  private updateCounter = 0;

  // Distance thresholds for update frequency (in units)
  private static readonly NEAR_DISTANCE = 15;    // Full updates every frame
  private static readonly MID_DISTANCE = 30;     // Updates every 2 frames
  private static readonly FAR_DISTANCE = 50;     // Updates every 4 frames

  // Frustum culling optimization
  private isVisible = true;
  private visibilityCheckFrame = 0;
  private static readonly VISIBILITY_CHECK_INTERVAL = 3; // Check every 3 frames
  private static frameCounter = 0; // Shared frame counter across all enemies

  // Physics body sleeping state for distant/idle enemies
  private isSleeping = false;
  private static readonly SLEEP_DISTANCE = 40;   // Put body to sleep beyond this distance

  // Instancing support
  private readonly instanceId: string;
  private useInstancing = false;
  private instancingCallbacks: EnemyInstancingCallbacks | null = null;
  private readonly sceneRef: THREE.Scene;

  // Cached vectors to avoid per-frame allocations
  private readonly cachedPosition = new THREE.Vector3();
  protected readonly tempDirection = new THREE.Vector3();

  // Cached objects for optimization (avoid per-frame allocations)
  private readonly cachedBoundingSphere = new THREE.Sphere();
  private readonly cachedInstancePosition = new THREE.Vector3();
  private readonly cachedInstanceColor = new THREE.Color();
  private readonly cachedKnockbackDir = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3,
    config: Partial<EnemyConfig> = {}
  ) {
    this.config = { ...DEFAULT_MINION_CONFIG, ...config };
    this.patrolCenter = spawnPosition.clone();
    this.sceneRef = scene;

    // Generate unique instance ID
    this.instanceId = `enemy_${enemyIdCounter++}`;

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

    // Create physics body - ensure minimum collision radius of 0.4 for reliable hit detection
    const collisionRadius = Math.max(0.4, 0.5 * this.config.scale);
    const shape = new CANNON.Sphere(collisionRadius);
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
    this.updateCounter++;

    // Calculate distance to player for update frequency
    const distanceToPlayer = this.getPosition().distanceTo(playerPosition);

    // Determine update frequency based on distance
    const updateInterval = this.getUpdateInterval(distanceToPlayer);

    // Always do minimal updates (visual sync, timers)
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.healthSystem.update(delta);

    // Floating animation (always runs for visual consistency)
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

    // Full AI update only on appropriate frames (throttled for distant enemies)
    if (this.updateCounter % updateInterval === 0) {
      // AI state machine
      switch (this.state) {
        case EnemyState.IDLE:
          this.updateIdle(distanceToPlayer);
          break;
        case EnemyState.PATROL:
          this.updatePatrol(delta * updateInterval, distanceToPlayer);
          break;
        case EnemyState.CHASE:
          this.updateChase(delta * updateInterval, playerPosition, distanceToPlayer);
          break;
        case EnemyState.ATTACK:
          this.updateAttack(playerPosition, distanceToPlayer);
          break;
      }

      // Follow terrain height
      if (this.getTerrainHeight) {
        const terrainY = this.getTerrainHeight(this.body.position.x, this.body.position.z) + 1;
        if (this.body.position.y < terrainY) {
          this.body.position.y = terrainY;
          if (this.body.velocity.y < 0) {
            this.body.velocity.y = 0;
          }
        }
      }
    }

    // Always sync mesh with physics (except Y which has float offset)
    this.mesh.position.x = this.body.position.x;
    this.mesh.position.z = this.body.position.z;

    // Update instancing system if enabled
    if (this.useInstancing && this.instancingCallbacks) {
      const pos = new THREE.Vector3(
        this.body.position.x,
        this.body.position.y + floatOffset,
        this.body.position.z
      );
      this.instancingCallbacks.onTransformUpdate(this.instanceId, pos, 0);
    }
  }

  /**
   * Get update interval based on distance to player
   * Closer enemies update every frame, distant ones less often
   */
  private getUpdateInterval(distance: number): number {
    if (distance < Enemy.NEAR_DISTANCE) return 1;  // Every frame
    if (distance < Enemy.MID_DISTANCE) return 2;   // Every 2 frames
    if (distance < Enemy.FAR_DISTANCE) return 4;   // Every 4 frames
    return 6; // Very far: every 6 frames
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

    // Reuse tempDirection to avoid per-frame allocation
    this.tempDirection.subVectors(this.patrolTarget, this.getPosition());
    this.tempDirection.y = 0;

    if (this.tempDirection.length() < 1) {
      this.state = EnemyState.IDLE;
      this.patrolTarget = null;
      return;
    }

    this.tempDirection.normalize();
    this.body.velocity.x = this.tempDirection.x * this.config.speed * 0.5;
    this.body.velocity.z = this.tempDirection.z * this.config.speed * 0.5;
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

    // Move toward player - reuse tempDirection
    this.tempDirection.subVectors(playerPosition, this.getPosition());
    this.tempDirection.y = 0;
    this.tempDirection.normalize();

    this.body.velocity.x = this.tempDirection.x * this.config.speed;
    this.body.velocity.z = this.tempDirection.z * this.config.speed;
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

  /**
   * Apply damage with optional knockback effect.
   * @param amount Damage amount
   * @param knockbackSource Optional position to knock back from (e.g., projectile origin)
   * @param knockbackForce Optional force multiplier (default 5)
   */
  takeDamage(amount: number = 1, knockbackSource?: THREE.Vector3, knockbackForce: number = 5): boolean {
    if (this.state === EnemyState.DEAD) return false;

    // Wake up the physics body when taking damage (ensures physics response)
    this.wakeUp();

    const damaged = this.healthSystem.takeDamage(amount);

    if (damaged) {
      this.damageFlashTime = 0.3;

      // Apply knockback if source provided
      if (knockbackSource) {
        this.applyKnockback(knockbackSource, knockbackForce);
      }

      // Notify instancing system of damage flash
      if (this.useInstancing && this.instancingCallbacks) {
        this.instancingCallbacks.onDamageFlash(this.instanceId, 0.3);
      }

      if (this.healthSystem.isDead()) {
        this.die();
      }
    }

    return damaged;
  }

  /**
   * Apply knockback impulse away from a source position.
   * Triggers onKnockback callback for visual feedback (particles, screen shake).
   */
  private applyKnockback(source: THREE.Vector3, force: number): void {
    // Calculate knockback direction (away from source)
    this.cachedKnockbackDir.subVectors(this.getPosition(), source);
    this.cachedKnockbackDir.y = 0.3; // Slight upward arc
    this.cachedKnockbackDir.normalize();

    // Apply impulse to physics body
    this.body.velocity.x += this.cachedKnockbackDir.x * force;
    this.body.velocity.y += this.cachedKnockbackDir.y * force * 0.5;
    this.body.velocity.z += this.cachedKnockbackDir.z * force;

    // Trigger callback for visual effects
    if (this.onKnockback) {
      this.onKnockback(this.getPosition(), this.cachedKnockbackDir, force);
    }
  }

  protected die(): void {
    this.state = EnemyState.DEAD;
    this.body.velocity.set(0, 0, 0);

    if (this.onDeath) {
      this.onDeath(this);
    }
  }

  getPosition(): THREE.Vector3 {
    // Reuse cached position to avoid per-frame allocations
    this.cachedPosition.set(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
    return this.cachedPosition;
  }

  setTerrainHeightGetter(getter: (x: number, z: number) => number): void {
    this.getTerrainHeight = getter;
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

  /**
   * Update visibility based on camera frustum.
   * Uses cached result to avoid recalculating every frame.
   * @param frustum - Pre-computed camera frustum from Game.ts
   */
  updateVisibility(frustum: THREE.Frustum): void {
    // Only recalculate visibility every N frames for performance
    if (Enemy.frameCounter !== this.visibilityCheckFrame) {
      this.visibilityCheckFrame = Enemy.frameCounter;

      // Reuse cached bounding sphere to avoid per-frame allocations
      this.cachedBoundingSphere.center.copy(this.mesh.position);
      this.cachedBoundingSphere.radius = 1.5 * this.config.scale;
      this.isVisible = frustum.intersectsSphere(this.cachedBoundingSphere);
    }

    // Apply visibility to mesh (skip rendering when outside frustum)
    this.mesh.visible = this.isVisible;
  }

  /**
   * Increment the shared frame counter for visibility checks.
   * Call this once per frame from Game.ts before updating enemies.
   */
  static incrementFrameCounter(): void {
    Enemy.frameCounter = (Enemy.frameCounter + 1) % Enemy.VISIBILITY_CHECK_INTERVAL;
  }

  /**
   * Get current visibility state (for debugging or conditional logic)
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Put the enemy's physics body to sleep for performance.
   * Sleeping bodies skip physics simulation but still render.
   * Should be called when enemy is far from player or idle.
   */
  sleep(): void {
    if (!this.isSleeping && this.state !== EnemyState.DEAD) {
      this.body.sleep();
      this.isSleeping = true;
    }
  }

  /**
   * Wake up the enemy's physics body to resume physics simulation.
   * Should be called when enemy enters detection range or takes damage.
   */
  wakeUp(): void {
    if (this.isSleeping) {
      this.body.wakeUp();
      this.isSleeping = false;
    }
  }

  /**
   * Check if the enemy's physics body is currently sleeping
   */
  getIsSleeping(): boolean {
    return this.isSleeping;
  }

  /**
   * Get the distance threshold for putting bodies to sleep
   */
  static getSleepDistance(): number {
    return Enemy.SLEEP_DISTANCE;
  }

  /**
   * Update sleep state based on distance to player.
   * Called by Game.ts to manage physics body sleeping.
   * @param distanceToPlayer Distance from enemy to player
   */
  updateSleepState(distanceToPlayer: number): void {
    // Don't manage sleep for dead enemies
    if (this.state === EnemyState.DEAD) return;

    // Wake up if within detection range (needs to be able to respond)
    if (distanceToPlayer < this.config.detectionRange) {
      this.wakeUp();
      return;
    }

    // Put to sleep if far from player and not actively chasing/attacking
    if (distanceToPlayer > Enemy.SLEEP_DISTANCE) {
      if (this.state === EnemyState.IDLE || this.state === EnemyState.PATROL) {
        this.sleep();
      }
    }
  }

  getDamage(): number {
    return this.config.damage;
  }

  getHealth(): number {
    return this.healthSystem.getHealth();
  }

  getMaxHealth(): number {
    return this.healthSystem.getMaxHealth();
  }

  heal(amount: number): void {
    this.healthSystem.heal(amount);
  }

  /**
   * Get the unique instance ID for this enemy
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Check if this enemy type supports instanced rendering.
   * Override in subclasses that don't support instancing (e.g., specialized geometry).
   */
  supportsInstancing(): boolean {
    return true; // Base Enemy class supports instancing
  }

  /**
   * Enable or disable instanced rendering for this enemy.
   * When enabled, the individual mesh is hidden and the instancing system
   * handles rendering via InstancedMesh.
   */
  setUseInstancing(enabled: boolean, callbacks?: EnemyInstancingCallbacks): void {
    if (!this.supportsInstancing() && enabled) {
      console.warn(`Enemy ${this.instanceId} does not support instancing`);
      return;
    }

    const wasInstancing = this.useInstancing;
    this.useInstancing = enabled;
    this.instancingCallbacks = callbacks ?? null;

    if (enabled && !wasInstancing && callbacks) {
      // Register with instancing system
      callbacks.onRegister(this.instanceId, this.getPosition(), this.config.scale);
      // Hide individual mesh
      this.mesh.visible = false;
      this.sceneRef.remove(this.mesh);
    } else if (!enabled && wasInstancing && this.instancingCallbacks) {
      // Unregister from instancing system
      this.instancingCallbacks.onUnregister(this.instanceId);
      // Show individual mesh
      this.mesh.visible = true;
      this.sceneRef.add(this.mesh);
    }
  }

  /**
   * Check if instanced rendering is currently enabled
   */
  isUsingInstancing(): boolean {
    return this.useInstancing;
  }

  /**
   * Get the current transform data for instancing.
   * Returns position and rotation for the instancing system.
   * Uses cached Vector3 to avoid per-frame allocations.
   */
  getInstanceMatrix(): { position: THREE.Vector3; rotation: number; scale: number } {
    const floatOffset = Math.sin(this.animationTime * 3) * 0.2;
    this.cachedInstancePosition.set(
      this.body.position.x,
      this.body.position.y + floatOffset,
      this.body.position.z
    );
    return {
      position: this.cachedInstancePosition,
      rotation: 0, // Basic enemies don't rotate
      scale: this.config.scale
    };
  }

  /**
   * Get the current color for instancing (for damage flash).
   * Returns the color based on damage flash state.
   * Uses cached Color to avoid per-frame allocations.
   */
  getInstanceColor(): THREE.Color {
    if (this.damageFlashTime > 0) {
      const flash = Math.sin(this.damageFlashTime * 30) > 0;
      this.cachedInstanceColor.setHex(flash ? 0xff0000 : this.config.color);
    } else {
      this.cachedInstanceColor.setHex(this.config.color);
    }
    return this.cachedInstanceColor;
  }

  /**
   * Get the enemy's configuration scale
   */
  getScale(): number {
    return this.config.scale;
  }

  dispose(scene: THREE.Scene, physicsWorld: CANNON.World): void {
    // Unregister from instancing system if enabled
    if (this.useInstancing && this.instancingCallbacks) {
      this.instancingCallbacks.onUnregister(this.instanceId);
    }

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

  // Cached direction vector to avoid per-attack allocations
  private readonly cachedShootDir = new THREE.Vector3();

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

  // Shooter has unique geometry (spikes), so it doesn't support instancing
  override supportsInstancing(): boolean {
    return false;
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
      // Reuse inherited tempDirection
      this.tempDirection.subVectors(this.getPosition(), playerPosition);
      this.tempDirection.y = 0;
      this.tempDirection.normalize();

      this.body.velocity.x = this.tempDirection.x * this.config.speed;
      this.body.velocity.z = this.tempDirection.z * this.config.speed;
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

    // Move toward player - reuse inherited tempDirection
    this.tempDirection.subVectors(playerPosition, this.getPosition());
    this.tempDirection.y = 0;
    this.tempDirection.normalize();

    this.body.velocity.x = this.tempDirection.x * this.config.speed;
    this.body.velocity.z = this.tempDirection.z * this.config.speed;
  }

  protected override performAttack(targetPosition: THREE.Vector3): void {
    if (this.onShoot) {
      // Reuse cached direction vector to avoid per-attack allocations
      this.cachedShootDir
        .subVectors(targetPosition, this.getPosition())
        .normalize();

      // Add slight inaccuracy
      this.cachedShootDir.x += (Math.random() - 0.5) * 0.1;
      this.cachedShootDir.z += (Math.random() - 0.5) * 0.1;
      this.cachedShootDir.normalize();

      this.onShoot(this.getPosition(), this.cachedShootDir, this.projectileSpeed, this.config.damage);
    }
  }
}

// Tank enemy - slow but high HP, knocks back player
export class Tank extends Enemy {
  private chargeTimer = 0;
  private isCharging = false;
  private chargeDirection = new THREE.Vector3();

  // Callback for visual feedback when charge starts
  public onChargeStart?: (startPos: THREE.Vector3, endPos: THREE.Vector3) => void;

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

  // Tank has unique geometry (box), so it doesn't support instancing
  override supportsInstancing(): boolean {
    return false;
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
    const startPos = this.getPosition();
    this.chargeDirection.subVectors(targetPosition, startPos);
    this.chargeDirection.y = 0;
    this.chargeDirection.normalize();

    this.isCharging = true;
    this.chargeTimer = 0.5; // Charge for 0.5 seconds

    // Notify visual system of charge
    if (this.onChargeStart) {
      const endPos = startPos.clone().add(
        this.chargeDirection.clone().multiplyScalar(this.config.speed * 4 * 0.5)
      );
      this.onChargeStart(startPos, endPos);
    }

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

  // Speeder has unique geometry (capsule), so it doesn't support instancing
  override supportsInstancing(): boolean {
    return false;
  }

  override update(delta: number, playerPosition: THREE.Vector3): void {
    if (this.isRetreating) {
      this.retreatTimer -= delta;

      // Retreat away from player - reuse inherited tempDirection
      this.tempDirection.subVectors(this.getPosition(), playerPosition);
      this.tempDirection.y = 0;
      this.tempDirection.normalize();

      this.body.velocity.x = this.tempDirection.x * this.config.speed;
      this.body.velocity.z = this.tempDirection.z * this.config.speed;

      if (this.retreatTimer <= 0) {
        this.isRetreating = false;
      }

      // Sync mesh
      this.mesh.position.x = this.body.position.x;
      this.mesh.position.y = this.body.position.y + Math.sin(this.animationTime * 5) * 0.3;
      this.mesh.position.z = this.body.position.z;

      // Face movement direction
      this.mesh.rotation.y = Math.atan2(this.tempDirection.x, this.tempDirection.z);
      return;
    }

    super.update(delta, playerPosition);

    // Face player when chasing - reuse inherited tempDirection
    if (this.state === EnemyState.CHASE) {
      this.tempDirection.subVectors(playerPosition, this.getPosition());
      this.mesh.rotation.y = Math.atan2(this.tempDirection.x, this.tempDirection.z);
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

  // Cached vector to avoid per-frame allocations
  private readonly cachedAwayDir = new THREE.Vector3();

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

  // Healer has unique visuals (healing ring), so it doesn't support instancing
  override supportsInstancing(): boolean {
    return false;
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
      // Reuse cached vector to avoid per-frame allocations
      this.cachedAwayDir.subVectors(this.getPosition(), playerPosition);
      this.cachedAwayDir.y = 0;
      this.cachedAwayDir.normalize();

      this.body.velocity.x = this.cachedAwayDir.x * this.config.speed;
      this.body.velocity.z = this.cachedAwayDir.z * this.config.speed;
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

  // Callback for visual feedback when shield absorbs damage
  public onShieldAbsorb?: (position: THREE.Vector3) => void;

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

  // Shielder has unique visuals (shield mesh), so it doesn't support instancing
  override supportsInstancing(): boolean {
    return false;
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

      // Notify visual system of shield absorb
      if (this.onShieldAbsorb) {
        this.onShieldAbsorb(this.getPosition());
      }

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

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CharacterModel } from '../rendering/CharacterModel';
import { InputState } from '../systems/InputManager';
import { HealthSystem, COLLISION_GROUPS } from './CombatSystem';
import { PlayerClass, ActiveBuff, TrapData } from './classes/ClassConfig';
import { AbilitySystem, AbilityExecutionContext } from './classes/AbilitySystem';
import { getDefaultClass } from './classes/ClassDefinitions';

export class Player {
  private model: CharacterModel;
  private readonly body: CANNON.Body;
  private healthSystem: HealthSystem;

  // Class system
  private playerClass: PlayerClass;
  private readonly abilitySystem: AbilitySystem;

  // Movement (read from class stats)
  private moveSpeed: number;
  private externalSpeedMultiplier = 1; // Applied from Game.ts (pickups, hazards)
  private readonly jumpForce = 12;
  private readonly velocity = new THREE.Vector3();
  private isGrounded = false;
  private canJump = true;

  // Dashing state
  private isDashing = false;
  private dashDirection = new THREE.Vector3();
  private dashDistance = 0;
  private dashSpeed = 0;
  private dashTraveled = 0;
  private dashDamage = 0;
  private dashInvincible = false;

  // Terrain following
  private getTerrainHeight: ((x: number, z: number) => number) | null = null;

  // World boundaries (half-size from center)
  private worldBoundary = 30;

  // Combat
  private shootCooldown = 0;
  private shootRate: number;

  // Camera
  private readonly cameraOffset = new THREE.Vector3(0, 6, 10);
  private readonly cameraTarget = new THREE.Vector3();
  private aimYaw = 0;
  private aimPitch = 0;

  // State
  private isDead = false;

  // Target override for auto-aim
  private targetDirection: THREE.Vector3 | null = null;

  // Reusable vectors to avoid per-frame allocations
  private readonly tempForward = new THREE.Vector3();
  private readonly tempRight = new THREE.Vector3();
  private readonly tempMoveDir = new THREE.Vector3();
  private readonly tempOffset = new THREE.Vector3();
  private readonly tempShootDir = new THREE.Vector3();
  private readonly cachedPosition = new THREE.Vector3();
  private static readonly UP_AXIS = new THREE.Vector3(0, 1, 0);

  // Callbacks for ability execution
  private onProjectileFire?: (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    damage: number,
    color: number,
    count: number
  ) => void;
  private onAOEExecute?: (
    center: THREE.Vector3,
    radius: number,
    damage: number,
    color: number
  ) => void;
  private onMeleeExecute?: (
    position: THREE.Vector3,
    range: number,
    damage: number
  ) => void;
  private onTrapPlace?: (trap: TrapData) => void;
  private onBuffApply?: (buff: ActiveBuff) => void;

  // Dash visual feedback callback
  private onDashTrail?: (position: THREE.Vector3, color: number) => void;

  constructor(
    private scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3,
    playerClass?: PlayerClass
  ) {
    // Set class (default to Mage)
    this.playerClass = playerClass ?? getDefaultClass();

    // Initialize ability system
    this.abilitySystem = new AbilitySystem();

    // Apply class stats
    this.moveSpeed = this.playerClass.stats.speed;
    this.shootRate = this.playerClass.stats.shootRate;

    // Create visual model with class colors
    this.model = new CharacterModel(this.playerClass.colors);
    this.model.setPosition(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    scene.add(this.model.getGroup());

    // Create physics body (capsule approximated with sphere)
    const shape = new CANNON.Sphere(0.5);
    this.body = new CANNON.Body({
      mass: 1,
      shape,
      position: new CANNON.Vec3(spawnPosition.x, spawnPosition.y, spawnPosition.z),
      linearDamping: 0.4,
      angularDamping: 0.99,
      fixedRotation: true,
      allowSleep: false, // Prevent physics sleep - fixes movement stopping after idle
      collisionFilterGroup: COLLISION_GROUPS.PLAYER,
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.ENEMY | COLLISION_GROUPS.ENEMY_PROJECTILE
    });

    physicsWorld.addBody(this.body);

    // Setup collision detection for ground check
    this.body.addEventListener('collide', (event: { contact: CANNON.ContactEquation }) => {
      const contact = event.contact;
      const normal = contact.ni;

      // Check if collision normal points upward (ground)
      if (normal.y > 0.5) {
        this.isGrounded = true;
        this.canJump = true;
      }
    });

    // Initialize health from class stats
    this.healthSystem = new HealthSystem(this.playerClass.stats.health, 1.5);
  }

  setAbilityCallbacks(callbacks: {
    onProjectileFire?: (
      origin: THREE.Vector3,
      direction: THREE.Vector3,
      speed: number,
      damage: number,
      color: number,
      count: number
    ) => void;
    onAOEExecute?: (
      center: THREE.Vector3,
      radius: number,
      damage: number,
      color: number
    ) => void;
    onMeleeExecute?: (
      position: THREE.Vector3,
      range: number,
      damage: number
    ) => void;
    onTrapPlace?: (trap: TrapData) => void;
    onBuffApply?: (buff: ActiveBuff) => void;
    onDashTrail?: (position: THREE.Vector3, color: number) => void;
  }): void {
    this.onProjectileFire = callbacks.onProjectileFire;
    this.onAOEExecute = callbacks.onAOEExecute;
    this.onMeleeExecute = callbacks.onMeleeExecute;
    this.onTrapPlace = callbacks.onTrapPlace;
    this.onBuffApply = callbacks.onBuffApply;
    this.onDashTrail = callbacks.onDashTrail;
  }

  setClass(newClass: PlayerClass): void {
    // Dispose old model
    this.scene.remove(this.model.getGroup());
    this.model.dispose();

    // Update class
    this.playerClass = newClass;

    // Apply new class stats
    this.moveSpeed = newClass.stats.speed;
    this.shootRate = newClass.stats.shootRate;

    // Create new model with new colors
    const pos = this.getPosition();
    this.model = new CharacterModel(newClass.colors);
    this.model.setPosition(pos.x, pos.y, pos.z);
    this.scene.add(this.model.getGroup());

    // Update health system
    this.healthSystem = new HealthSystem(newClass.stats.health, 1.5);

    // Reset ability system
    this.abilitySystem.reset();
  }

  getClass(): PlayerClass {
    return this.playerClass;
  }

  getAbilitySystem(): AbilitySystem {
    return this.abilitySystem;
  }

  update(delta: number, input: InputState, camera: THREE.PerspectiveCamera): void {
    if (this.isDead) return;

    // Update ability system (cooldowns, buffs)
    this.abilitySystem.update(delta);

    // Handle dashing
    if (this.isDashing) {
      this.updateDash(delta);
      this.model.update(delta, this.velocity);
      this.updateCamera(camera, delta);
      return; // Skip normal movement during dash
    }

    // Update aim from input (input values are now absolute rotations, not deltas)
    this.aimYaw = input.aimX;
    this.aimPitch = input.aimY;

    // Calculate movement direction relative to camera (reuse cached vectors)
    this.tempForward.set(0, 0, -1);
    this.tempRight.set(1, 0, 0);

    this.tempForward.applyAxisAngle(Player.UP_AXIS, this.aimYaw);
    this.tempRight.applyAxisAngle(Player.UP_AXIS, this.aimYaw);

    // Apply input to velocity with speed modifiers from buffs and external sources
    const speedMod = this.abilitySystem.getSpeedModifier();
    const effectiveSpeed = this.moveSpeed * speedMod * this.externalSpeedMultiplier;

    // Apply passive speed bonus for Ranger
    const passiveSpeedBonus = this.playerClass.id === 'ranger' ? 1.15 : 1;

    // Reuse cached moveDir vector
    this.tempMoveDir.set(0, 0, 0);
    this.tempMoveDir.addScaledVector(this.tempForward, -input.moveZ);
    this.tempMoveDir.addScaledVector(this.tempRight, input.moveX);
    const moveDir = this.tempMoveDir;

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      this.body.velocity.x = moveDir.x * effectiveSpeed * passiveSpeedBonus;
      this.body.velocity.z = moveDir.z * effectiveSpeed * passiveSpeedBonus;

      // Rotate model to face movement direction
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      this.model.setRotation(targetAngle);
    } else {
      // Stop horizontal movement when no input
      this.body.velocity.x = 0;
      this.body.velocity.z = 0;
    }

    // Jumping (with Ranger passive for higher jump)
    const jumpMod = this.playerClass.id === 'ranger' ? 1.2 : 1;
    if (input.jumping && this.canJump && this.isGrounded) {
      this.body.velocity.y = this.jumpForce * jumpMod;
      this.isGrounded = false;
      this.canJump = false;
    }

    // Reset jump when button released
    if (!input.jumping) {
      this.canJump = true;
    }

    // Follow terrain height with slope-corrected movement
    if (this.getTerrainHeight) {
      const currentX = this.body.position.x;
      const currentZ = this.body.position.z;
      const terrainY = this.getTerrainHeight(currentX, currentZ) + 1;

      // Only push up if below terrain, allow jumping above
      if (this.body.position.y < terrainY) {
        this.body.position.y = terrainY;
        if (this.body.velocity.y < 0) {
          this.body.velocity.y = 0;
        }
        this.isGrounded = true;
        this.canJump = true;
      }
    }

    // Clamp to world boundaries
    const boundary = this.worldBoundary - 1; // Small buffer from edge
    if (this.body.position.x < -boundary) {
      this.body.position.x = -boundary;
      this.body.velocity.x = 0;
    } else if (this.body.position.x > boundary) {
      this.body.position.x = boundary;
      this.body.velocity.x = 0;
    }
    if (this.body.position.z < -boundary) {
      this.body.position.z = -boundary;
      this.body.velocity.z = 0;
    } else if (this.body.position.z > boundary) {
      this.body.position.z = boundary;
      this.body.velocity.z = 0;
    }

    // Sync model with physics
    this.model.setPosition(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );

    // Update animation
    this.velocity.set(
      this.body.velocity.x,
      this.body.velocity.y,
      this.body.velocity.z
    );
    this.model.update(delta, this.velocity);

    // Update shooting cooldown
    this.shootCooldown = Math.max(0, this.shootCooldown - delta);

    // Update health (i-frames)
    this.healthSystem.update(delta);

    // Update camera
    this.updateCamera(camera, delta);

    // Reset grounded flag (will be set by collision)
    this.isGrounded = false;
  }

  private updateDash(delta: number): void {
    // Move in dash direction
    const movement = this.dashSpeed * delta;
    this.dashTraveled += movement;

    this.body.position.x += this.dashDirection.x * movement;
    this.body.position.z += this.dashDirection.z * movement;

    // Emit trail particles during dash
    if (this.onDashTrail) {
      this.cachedPosition.set(
        this.body.position.x,
        this.body.position.y,
        this.body.position.z
      );
      this.onDashTrail(this.cachedPosition, this.playerClass.colors.orb);
    }

    // Sync model
    this.model.setPosition(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );

    // Check if dash completed
    if (this.dashTraveled >= this.dashDistance) {
      this.isDashing = false;
      this.dashInvincible = false;
    }
  }

  private updateCamera(camera: THREE.PerspectiveCamera, delta: number): void {
    const position = this.getPosition();

    // Calculate camera offset based on aim (reuse cached vector)
    this.tempOffset.copy(this.cameraOffset);
    this.tempOffset.applyAxisAngle(Player.UP_AXIS, this.aimYaw);

    // Target position
    this.cameraTarget.copy(position).add(this.tempOffset);

    // Smooth follow
    camera.position.lerp(this.cameraTarget, delta * 8);

    // Look at player (reuse position vector, modify in place temporarily)
    position.y += 1.5;
    camera.lookAt(position);
    position.y -= 1.5; // Restore in case position is used elsewhere
  }

  canShoot(): boolean {
    return this.shootCooldown <= 0 && !this.isDead && !this.isDashing;
  }

  shoot(): void {
    if (!this.canShoot()) return;

    this.shootCooldown = this.shootRate;

    // Rotate model to face target direction before shooting
    const shootDir = this.getShootDirection();
    const targetAngle = Math.atan2(shootDir.x, shootDir.z);
    this.model.setRotation(targetAngle);

    this.model.attack();

    // Execute primary ability
    const context = this.createAbilityContext();
    this.abilitySystem.useAbility(
      this.playerClass.primaryAbility,
      context,
      { orb: this.playerClass.colors.orb, orbEmissive: this.playerClass.colors.orbEmissive }
    );
  }

  useSecondaryAbility(): boolean {
    if (this.isDead || this.isDashing) return false;

    const context = this.createAbilityContext();

    // Special handling for dash abilities
    if (this.playerClass.secondaryAbility.type === 'dash') {
      const ability = this.playerClass.secondaryAbility;
      if (!this.abilitySystem.canUseAbility(ability)) return false;

      // Start dash
      this.isDashing = true;
      this.dashDirection = this.getShootDirection();
      this.dashDirection.y = 0;
      this.dashDirection.normalize();
      this.dashDistance = ability.dashDistance ?? 8;
      this.dashSpeed = ability.dashSpeed ?? 30;
      this.dashTraveled = 0;
      this.dashDamage = ability.damage;
      this.dashInvincible = true;

      // Still use ability system for cooldown tracking
      return this.abilitySystem.useAbility(
        ability,
        context,
        { orb: this.playerClass.colors.orb, orbEmissive: this.playerClass.colors.orbEmissive }
      );
    }

    return this.abilitySystem.useAbility(
      this.playerClass.secondaryAbility,
      context,
      { orb: this.playerClass.colors.orb, orbEmissive: this.playerClass.colors.orbEmissive }
    );
  }

  private createAbilityContext(): AbilityExecutionContext {
    return {
      playerPosition: this.getPosition(),
      orbPosition: this.getOrbPosition(),
      aimDirection: this.getShootDirection(),
      onProjectileFire: this.onProjectileFire,
      onAOEExecute: this.onAOEExecute,
      onDashExecute: (_dir, _dist, _speed, _dmg) => {
        // Dash is handled internally in Player
      },
      onMeleeExecute: this.onMeleeExecute,
      onTrapPlace: this.onTrapPlace,
      onBuffApply: this.onBuffApply
    };
  }

  getShootDirection(): THREE.Vector3 {
    // Use target direction if auto-aiming at enemy
    if (this.targetDirection) {
      return this.targetDirection.clone();
    }

    // Otherwise use camera look direction (reuse cached vector, clone for caller)
    this.tempShootDir.set(0, 0, -1);
    this.tempShootDir.applyAxisAngle(Player.UP_AXIS, this.aimYaw);
    this.tempShootDir.y = Math.sin(this.aimPitch);
    this.tempShootDir.normalize();
    return this.tempShootDir.clone();
  }

  /**
   * Set target direction for auto-aim (called from Game.ts)
   */
  setTargetDirection(direction: THREE.Vector3 | null): void {
    this.targetDirection = direction;
  }

  getOrbPosition(): THREE.Vector3 {
    return this.model.getOrbWorldPosition();
  }

  takeDamage(amount: number = 1): boolean {
    if (this.isDead) return false;
    if (this.dashInvincible) return false; // I-frames during dash

    // Apply damage reduction from buffs
    const reduction = this.abilitySystem.getDamageReduction();
    const effectiveAmount = amount * (1 - reduction);

    // Apply Warrior passive (20% damage reduction)
    const passiveReduction = this.playerClass.id === 'warrior' ? 0.8 : 1;
    const finalAmount = Math.ceil(effectiveAmount * passiveReduction);

    const damaged = this.healthSystem.takeDamage(finalAmount);

    if (damaged) {
      this.model.takeDamage();

      if (this.healthSystem.isDead()) {
        this.die();
      }
    }

    return damaged;
  }

  private die(): void {
    this.isDead = true;
    // Death animation/effects could be added here
  }

  heal(amount: number = 1): void {
    this.healthSystem.heal(amount);
  }

  /**
   * Set external speed multiplier (from pickups, hazards, etc.)
   */
  setExternalSpeedMultiplier(multiplier: number): void {
    this.externalSpeedMultiplier = multiplier;
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

  setPosition(x: number, y: number, z: number): void {
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, 0, 0);
    this.model.setPosition(x, y, z);
  }

  getHealth(): number {
    return this.healthSystem.getHealth();
  }

  getMaxHealth(): number {
    return this.healthSystem.getMaxHealth();
  }

  isInvincible(): boolean {
    return this.healthSystem.isInvincible() || this.dashInvincible;
  }

  getIsDead(): boolean {
    return this.isDead;
  }

  getIsDashing(): boolean {
    return this.isDashing;
  }

  getDashDamage(): number {
    return this.dashDamage;
  }

  getAimYaw(): number {
    return this.aimYaw;
  }

  reset(spawnPosition: THREE.Vector3): void {
    this.setPosition(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this.healthSystem.reset();
    this.abilitySystem.reset();
    this.isDead = false;
    this.isDashing = false;
    this.dashInvincible = false;
    this.aimYaw = 0;
    this.aimPitch = 0;
  }

  getBody(): CANNON.Body {
    return this.body;
  }

  setTerrainHeightGetter(getter: (x: number, z: number) => number): void {
    this.getTerrainHeight = getter;
  }

  setWorldBoundary(halfSize: number): void {
    this.worldBoundary = halfSize;
  }

  // Get cooldown info for UI
  getPrimaryCooldownPercent(): number {
    return this.abilitySystem.getCooldownPercent(this.playerClass.primaryAbility);
  }

  getSecondaryCooldownPercent(): number {
    return this.abilitySystem.getCooldownPercent(this.playerClass.secondaryAbility);
  }

  canUseSecondaryAbility(): boolean {
    return this.abilitySystem.canUseAbility(this.playerClass.secondaryAbility);
  }

  dispose(): void {
    this.model.dispose();
    this.abilitySystem.dispose();
  }
}

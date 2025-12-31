import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BossModel } from '../rendering/CharacterModel';
import { HealthSystem, COLLISION_GROUPS } from './CombatSystem';

export enum BossPhase {
  SUMMON = 'SUMMON',   // 100-66% HP - Spawns minions
  BEAM = 'BEAM',       // 66-33% HP - Sweeping laser
  RAGE = 'RAGE'        // 33-0% HP - Dash attacks
}

export enum BossState {
  IDLE = 'IDLE',
  SUMMONING = 'SUMMONING',
  BEAM_ATTACK = 'BEAM_ATTACK',
  DASH_ATTACK = 'DASH_ATTACK',
  MELEE_ATTACK = 'MELEE_ATTACK',
  RETREATING = 'RETREATING',
  DEAD = 'DEAD'
}

export class Boss {
  private readonly model: BossModel;
  private readonly body: CANNON.Body;
  private readonly healthSystem: HealthSystem;

  // State
  private phase: BossPhase = BossPhase.SUMMON;
  private state: BossState = BossState.IDLE;
  private stateTimer = 0;
  private attackCooldown = 0;

  // Movement
  private readonly baseSpeed = 4;
  private readonly dashSpeed = 20;
  private readonly arenaCenter: THREE.Vector3;

  // Beam attack
  private beamAngle = 0;
  private readonly beamSweepSpeed = Math.PI / 2; // 90 degrees per second
  private readonly beamLength = 30;

  // Dash attack
  private dashDirection = new THREE.Vector3();
  private isDashing = false;

  // Animation
  private animationTime = 0;

  // Callbacks
  public onSummonMinions?: (count: number, position: THREE.Vector3) => void;
  public onBeamUpdate?: (origin: THREE.Vector3, angle: number, length: number) => void;
  public onBeamEnd?: () => void;
  public onDashHit?: (position: THREE.Vector3) => void;
  public onDeath?: () => void;
  public onPhaseChange?: (phase: BossPhase) => void;

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3
  ) {
    this.arenaCenter = spawnPosition.clone();

    // Create visual model
    this.model = new BossModel();
    this.model.setPosition(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    scene.add(this.model.getGroup());

    // Create physics body
    const shape = new CANNON.Sphere(1);
    this.body = new CANNON.Body({
      mass: 5,
      shape,
      position: new CANNON.Vec3(spawnPosition.x, spawnPosition.y, spawnPosition.z),
      linearDamping: 0.3,
      fixedRotation: true,
      collisionFilterGroup: COLLISION_GROUPS.ENEMY,
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.PLAYER_PROJECTILE
    });

    physicsWorld.addBody(this.body);

    // Initialize health (10 HP for boss)
    this.healthSystem = new HealthSystem(10, 0.3);
  }

  update(delta: number, playerPosition: THREE.Vector3): void {
    if (this.state === BossState.DEAD) return;

    this.animationTime += delta;
    this.stateTimer -= delta;
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.healthSystem.update(delta);

    // Update phase based on health
    this.updatePhase();

    // State machine
    switch (this.state) {
      case BossState.IDLE:
        this.updateIdle(playerPosition);
        break;
      case BossState.SUMMONING:
        this.updateSummoning();
        break;
      case BossState.BEAM_ATTACK:
        this.updateBeamAttack(delta);
        break;
      case BossState.DASH_ATTACK:
        this.updateDashAttack(delta, playerPosition);
        break;
      case BossState.MELEE_ATTACK:
        this.updateMeleeAttack(playerPosition);
        break;
      case BossState.RETREATING:
        this.updateRetreating(delta);
        break;
    }

    // Sync model with physics
    this.model.setPosition(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );

    // Face player
    const toPlayer = new THREE.Vector3()
      .subVectors(playerPosition, this.getPosition());
    toPlayer.y = 0;

    if (toPlayer.lengthSq() > 0.1) {
      const angle = Math.atan2(toPlayer.x, toPlayer.z);
      this.model.setRotation(angle);
    }

    // Update animation
    const velocity = new THREE.Vector3(
      this.body.velocity.x,
      this.body.velocity.y,
      this.body.velocity.z
    );
    this.model.update(delta, velocity);
  }

  private updatePhase(): void {
    const healthPercent = this.healthSystem.getHealthPercent();
    let newPhase = this.phase;

    if (healthPercent <= 0.33) {
      newPhase = BossPhase.RAGE;
    } else if (healthPercent <= 0.66) {
      newPhase = BossPhase.BEAM;
    } else {
      newPhase = BossPhase.SUMMON;
    }

    if (newPhase !== this.phase) {
      this.phase = newPhase;
      this.state = BossState.IDLE;
      this.attackCooldown = 1; // Brief pause on phase change

      if (this.onPhaseChange) {
        this.onPhaseChange(this.phase);
      }
    }
  }

  private updateIdle(playerPosition: THREE.Vector3): void {
    if (this.attackCooldown > 0) return;

    const distanceToPlayer = this.getPosition().distanceTo(playerPosition);

    switch (this.phase) {
      case BossPhase.SUMMON:
        // Summon minions periodically
        this.state = BossState.SUMMONING;
        this.stateTimer = 2;
        break;

      case BossPhase.BEAM:
        // Start beam sweep
        this.state = BossState.BEAM_ATTACK;
        this.stateTimer = 3;
        this.beamAngle = Math.atan2(
          playerPosition.x - this.body.position.x,
          playerPosition.z - this.body.position.z
        ) - Math.PI / 4;
        break;

      case BossPhase.RAGE:
        // Dash at player
        if (distanceToPlayer > 5) {
          this.state = BossState.DASH_ATTACK;
          this.dashDirection.subVectors(playerPosition, this.getPosition()).normalize();
          this.dashDirection.y = 0;
          this.isDashing = true;
          this.stateTimer = 0.5;
        } else {
          this.state = BossState.MELEE_ATTACK;
          this.stateTimer = 0.5;
        }
        break;
    }
  }

  private updateSummoning(): void {
    if (this.stateTimer <= 0) {
      // Spawn minions
      if (this.onSummonMinions) {
        const count = 3 + Math.floor(Math.random() * 3);
        this.onSummonMinions(count, this.getPosition());
      }

      this.state = BossState.RETREATING;
      this.stateTimer = 2;
      this.attackCooldown = 3;
    }
  }

  private updateBeamAttack(delta: number): void {
    // Sweep beam across arena
    this.beamAngle += this.beamSweepSpeed * delta;

    if (this.onBeamUpdate) {
      this.onBeamUpdate(this.getPosition(), this.beamAngle, this.beamLength);
    }

    if (this.stateTimer <= 0) {
      if (this.onBeamEnd) {
        this.onBeamEnd();
      }
      this.state = BossState.RETREATING;
      this.stateTimer = 1;
      this.attackCooldown = 2;
    }
  }

  private updateDashAttack(_delta: number, _playerPosition: THREE.Vector3): void {
    if (this.isDashing) {
      this.body.velocity.x = this.dashDirection.x * this.dashSpeed;
      this.body.velocity.z = this.dashDirection.z * this.dashSpeed;

      if (this.stateTimer <= 0) {
        this.isDashing = false;
        this.body.velocity.set(0, this.body.velocity.y, 0);
        this.state = BossState.IDLE;
        this.attackCooldown = 0.5;
      }
    }
  }

  private updateMeleeAttack(_playerPosition: THREE.Vector3): void {
    // Quick melee swipe
    this.model.attack();

    if (this.stateTimer <= 0) {
      this.state = BossState.IDLE;
      this.attackCooldown = 0.3;
    }
  }

  private updateRetreating(_delta: number): void {
    // Move toward arena center
    const toCenter = new THREE.Vector3()
      .subVectors(this.arenaCenter, this.getPosition());
    toCenter.y = 0;

    if (toCenter.length() > 3) {
      toCenter.normalize();
      this.body.velocity.x = toCenter.x * this.baseSpeed;
      this.body.velocity.z = toCenter.z * this.baseSpeed;
    } else {
      this.body.velocity.x = 0;
      this.body.velocity.z = 0;
    }

    if (this.stateTimer <= 0) {
      this.state = BossState.IDLE;
    }
  }

  takeDamage(amount: number = 1): boolean {
    if (this.state === BossState.DEAD) return false;

    const damaged = this.healthSystem.takeDamage(amount);

    if (damaged) {
      this.model.takeDamage();

      if (this.healthSystem.isDead()) {
        this.die();
      }
    }

    return damaged;
  }

  private die(): void {
    this.state = BossState.DEAD;
    this.body.velocity.set(0, 0, 0);

    if (this.onDeath) {
      this.onDeath();
    }
  }

  getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
  }

  getHealth(): number {
    return this.healthSystem.getHealth();
  }

  getMaxHealth(): number {
    return this.healthSystem.getMaxHealth();
  }

  getHealthPercent(): number {
    return this.healthSystem.getHealthPercent();
  }

  getPhase(): BossPhase {
    return this.phase;
  }

  getState(): BossState {
    return this.state;
  }

  isDead(): boolean {
    return this.state === BossState.DEAD;
  }

  getBody(): CANNON.Body {
    return this.body;
  }

  // Check if beam hits a position
  isBeamHitting(position: THREE.Vector3): boolean {
    if (this.state !== BossState.BEAM_ATTACK) return false;

    const bossPos = this.getPosition();
    const beamDir = new THREE.Vector3(
      Math.sin(this.beamAngle),
      0,
      Math.cos(this.beamAngle)
    );

    // Check if position is within beam
    const toPosition = new THREE.Vector3().subVectors(position, bossPos);
    toPosition.y = 0;

    const distance = toPosition.length();
    if (distance > this.beamLength) return false;

    toPosition.normalize();
    const dot = toPosition.dot(beamDir);

    // Within ~20 degree cone
    return dot > 0.94;
  }

  // Check if dash hits a position
  isDashHitting(position: THREE.Vector3, radius: number = 1.5): boolean {
    if (!this.isDashing) return false;

    const distance = this.getPosition().distanceTo(position);
    return distance < radius + 1; // Boss radius + target radius
  }

  dispose(): void {
    this.model.dispose();
  }
}

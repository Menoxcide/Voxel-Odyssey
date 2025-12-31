import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CharacterModel } from '../rendering/CharacterModel';
import { InputState } from '../systems/InputManager';
import { HealthSystem, COLLISION_GROUPS } from './CombatSystem';

export class Player {
  private readonly model: CharacterModel;
  private readonly body: CANNON.Body;
  private readonly healthSystem: HealthSystem;

  // Movement
  private readonly moveSpeed = 10;
  private readonly jumpForce = 12;
  private readonly velocity = new THREE.Vector3();
  private isGrounded = false;
  private canJump = true;

  // Combat
  private shootCooldown = 0;
  private readonly shootRate = 0.15; // ~6.6 shots per second

  // Camera
  private readonly cameraOffset = new THREE.Vector3(0, 6, 10);
  private readonly cameraTarget = new THREE.Vector3();
  private aimYaw = 0;
  private aimPitch = 0;

  // State
  private isDead = false;

  constructor(
    scene: THREE.Scene,
    physicsWorld: CANNON.World,
    spawnPosition: THREE.Vector3
  ) {
    // Create visual model
    this.model = new CharacterModel();
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

    // Initialize health
    this.healthSystem = new HealthSystem(3, 1.5);
  }

  update(delta: number, input: InputState, camera: THREE.PerspectiveCamera): void {
    if (this.isDead) return;

    // Update aim from input
    this.aimYaw += input.aimX;
    this.aimPitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.aimPitch + input.aimY));

    // Calculate movement direction relative to camera
    const forward = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(1, 0, 0);

    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.aimYaw);
    right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.aimYaw);

    // Apply input to velocity
    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(forward, -input.moveZ);
    moveDir.addScaledVector(right, input.moveX);

    if (moveDir.lengthSq() > 0) {
      moveDir.normalize();
      this.body.velocity.x = moveDir.x * this.moveSpeed;
      this.body.velocity.z = moveDir.z * this.moveSpeed;

      // Rotate model to face movement direction
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      this.model.setRotation(targetAngle);
    }

    // Jumping
    if (input.jumping && this.canJump && this.isGrounded) {
      this.body.velocity.y = this.jumpForce;
      this.isGrounded = false;
      this.canJump = false;
    }

    // Reset jump when button released
    if (!input.jumping) {
      this.canJump = true;
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

  private updateCamera(camera: THREE.PerspectiveCamera, delta: number): void {
    const position = this.getPosition();

    // Calculate camera offset based on aim
    const offset = this.cameraOffset.clone();
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.aimYaw);

    // Target position
    this.cameraTarget.copy(position).add(offset);

    // Smooth follow
    camera.position.lerp(this.cameraTarget, delta * 8);

    // Look at player
    const lookTarget = position.clone();
    lookTarget.y += 1.5;
    camera.lookAt(lookTarget);
  }

  canShoot(): boolean {
    return this.shootCooldown <= 0 && !this.isDead;
  }

  shoot(): void {
    if (!this.canShoot()) return;

    this.shootCooldown = this.shootRate;
    this.model.attack();
  }

  getShootDirection(): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.aimYaw);
    direction.y = Math.sin(this.aimPitch);
    direction.normalize();
    return direction;
  }

  getOrbPosition(): THREE.Vector3 {
    return this.model.getOrbWorldPosition();
  }

  takeDamage(amount: number = 1): boolean {
    if (this.isDead) return false;

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
    this.isDead = true;
    // Death animation/effects could be added here
  }

  heal(amount: number = 1): void {
    this.healthSystem.heal(amount);
  }

  getPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.body.position.x,
      this.body.position.y,
      this.body.position.z
    );
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
    return this.healthSystem.isInvincible();
  }

  getIsDead(): boolean {
    return this.isDead;
  }

  reset(spawnPosition: THREE.Vector3): void {
    this.setPosition(spawnPosition.x, spawnPosition.y, spawnPosition.z);
    this.healthSystem.reset();
    this.isDead = false;
    this.aimYaw = 0;
    this.aimPitch = 0;
  }

  getBody(): CANNON.Body {
    return this.body;
  }

  dispose(): void {
    this.model.dispose();
  }
}

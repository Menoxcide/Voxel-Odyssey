import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Collision groups
export const COLLISION_GROUPS = {
  GROUND: 1,
  PLAYER: 2,
  ENEMY: 4,
  PLAYER_PROJECTILE: 8,
  ENEMY_PROJECTILE: 16
};

export interface PhysicsBody {
  body: CANNON.Body;
  mesh: THREE.Object3D;
}

export class PhysicsWorld {
  private readonly world: CANNON.World;
  private readonly bodies: Map<number, PhysicsBody> = new Map();
  private nextBodyId = 0;

  // Ground body
  private groundBody: CANNON.Body | null = null;

  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, -20, 0);

    // Use SAPBroadphase for better performance
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    // Default contact material
    const defaultMaterial = new CANNON.Material('default');
    const defaultContact = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
      friction: 0.3,
      restitution: 0.1
    });
    this.world.addContactMaterial(defaultContact);
    this.world.defaultContactMaterial = defaultContact;
  }

  createGround(_size: number = 100): CANNON.Body {
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0,
      shape: groundShape,
      collisionFilterGroup: COLLISION_GROUPS.GROUND,
      collisionFilterMask: COLLISION_GROUPS.PLAYER | COLLISION_GROUPS.ENEMY |
        COLLISION_GROUPS.PLAYER_PROJECTILE | COLLISION_GROUPS.ENEMY_PROJECTILE
    });

    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);

    return this.groundBody;
  }

  createPlayerBody(position: THREE.Vector3): number {
    // Capsule collider approximated with sphere
    const shape = new CANNON.Sphere(0.5);
    const body = new CANNON.Body({
      mass: 1,
      shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.5,
      angularDamping: 0.99,
      fixedRotation: true,
      collisionFilterGroup: COLLISION_GROUPS.PLAYER,
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.ENEMY |
        COLLISION_GROUPS.ENEMY_PROJECTILE
    });

    this.world.addBody(body);

    const id = this.nextBodyId++;
    return id;
  }

  createEnemyBody(position: THREE.Vector3, radius: number = 0.5): CANNON.Body {
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass: 1,
      shape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.5,
      fixedRotation: true,
      collisionFilterGroup: COLLISION_GROUPS.ENEMY,
      collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PLAYER |
        COLLISION_GROUPS.PLAYER_PROJECTILE
    });

    this.world.addBody(body);
    return body;
  }

  step(delta: number): void {
    this.world.step(1 / 60, delta, 3);
  }

  getWorld(): CANNON.World {
    return this.world;
  }

  removeBody(body: CANNON.Body): void {
    this.world.removeBody(body);
  }

  dispose(): void {
    this.bodies.clear();

    // Remove all bodies
    while (this.world.bodies.length > 0) {
      this.world.removeBody(this.world.bodies[0]);
    }
  }
}

// Projectile system with object pooling
export interface Projectile {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  active: boolean;
  damage: number;
  lifetime: number;
  isPlayerProjectile: boolean;
  onHit?: (target: CANNON.Body) => void;
}

export class ProjectileSystem {
  private readonly scene: THREE.Scene;
  private readonly physicsWorld: PhysicsWorld;
  private readonly pool: Projectile[] = [];
  private readonly maxProjectiles = 50;

  // Shared geometry and materials
  private readonly geometry: THREE.SphereGeometry;
  private readonly playerMaterial: THREE.MeshStandardMaterial;
  private readonly enemyMaterial: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, physicsWorld: PhysicsWorld) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;

    // Create shared resources
    this.geometry = new THREE.SphereGeometry(0.15, 8, 8);

    this.playerMaterial = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.5,
      flatShading: true
    });

    this.enemyMaterial = new THREE.MeshStandardMaterial({
      color: 0xc084fc,
      emissive: 0xa855f7,
      emissiveIntensity: 0.5,
      flatShading: true
    });

    // Pre-populate pool
    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < this.maxProjectiles; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.playerMaterial);
      mesh.castShadow = true;
      mesh.visible = false;

      const shape = new CANNON.Sphere(0.15);
      const body = new CANNON.Body({
        mass: 0.1,
        shape,
        collisionFilterGroup: COLLISION_GROUPS.PLAYER_PROJECTILE,
        collisionFilterMask: COLLISION_GROUPS.GROUND | COLLISION_GROUPS.ENEMY
      });
      body.collisionResponse = false; // Trigger only, no physics response

      const projectile: Projectile = {
        mesh,
        body,
        active: false,
        damage: 1,
        lifetime: 0,
        isPlayerProjectile: true
      };

      // Set up collision handler ONCE during initialization
      body.addEventListener('collide', (event: { body: CANNON.Body }) => {
        if (projectile.active && projectile.onHit) {
          projectile.onHit(event.body);
        }
        // Schedule deactivation for next frame to avoid mid-step removal
        setTimeout(() => this.deactivate(projectile), 0);
      });

      this.pool.push(projectile);
      this.scene.add(mesh);
    }
  }

  fire(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number = 20,
    isPlayer: boolean = true,
    damage: number = 1,
    onHit?: (target: CANNON.Body) => void
  ): Projectile | null {
    // Find inactive projectile
    const projectile = this.pool.find((p) => !p.active);
    if (!projectile) return null;

    // Configure projectile
    projectile.active = true;
    projectile.damage = damage;
    projectile.lifetime = 3;
    projectile.isPlayerProjectile = isPlayer;
    projectile.onHit = onHit;

    // Set material
    projectile.mesh.material = isPlayer ? this.playerMaterial : this.enemyMaterial;
    projectile.mesh.visible = true;

    // Set position
    projectile.mesh.position.copy(origin);
    projectile.body.position.set(origin.x, origin.y, origin.z);

    // Set velocity
    const velocity = direction.clone().normalize().multiplyScalar(speed);
    projectile.body.velocity.set(velocity.x, velocity.y, velocity.z);

    // Update collision group
    projectile.body.collisionFilterGroup = isPlayer
      ? COLLISION_GROUPS.PLAYER_PROJECTILE
      : COLLISION_GROUPS.ENEMY_PROJECTILE;

    projectile.body.collisionFilterMask = isPlayer
      ? COLLISION_GROUPS.GROUND | COLLISION_GROUPS.ENEMY
      : COLLISION_GROUPS.GROUND | COLLISION_GROUPS.PLAYER;

    // Add to physics world if not already added
    if (!this.physicsWorld.getWorld().bodies.includes(projectile.body)) {
      this.physicsWorld.getWorld().addBody(projectile.body);
    }

    return projectile;
  }

  update(delta: number): void {
    for (const projectile of this.pool) {
      if (projectile.active) {
        // Update lifetime
        projectile.lifetime -= delta;
        if (projectile.lifetime <= 0) {
          this.deactivate(projectile);
          continue;
        }

        // Sync mesh with physics body
        projectile.mesh.position.set(
          projectile.body.position.x,
          projectile.body.position.y,
          projectile.body.position.z
        );
      }
    }
  }

  private deactivate(projectile: Projectile): void {
    if (!projectile.active) return;

    projectile.active = false;
    projectile.mesh.visible = false;
    projectile.body.velocity.set(0, 0, 0);
    projectile.onHit = undefined; // Clear hit callback

    // Remove from physics world if present
    const world = this.physicsWorld.getWorld();
    if (world.bodies.includes(projectile.body)) {
      world.removeBody(projectile.body);
    }
  }

  getActiveCount(): number {
    return this.pool.filter((p) => p.active).length;
  }

  dispose(): void {
    this.geometry.dispose();
    this.playerMaterial.dispose();
    this.enemyMaterial.dispose();

    for (const projectile of this.pool) {
      this.scene.remove(projectile.mesh);
      if (projectile.active) {
        this.physicsWorld.getWorld().removeBody(projectile.body);
      }
    }

    this.pool.length = 0;
  }
}

// Health system
export class HealthSystem {
  private health: number;
  private readonly maxHealth: number;
  private invincible = false;
  private invincibilityTime = 0;
  private readonly invincibilityDuration: number;

  constructor(maxHealth: number = 3, invincibilityDuration: number = 1) {
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.invincibilityDuration = invincibilityDuration;
  }

  takeDamage(amount: number = 1): boolean {
    if (this.invincible || this.health <= 0) {
      return false;
    }

    this.health = Math.max(0, this.health - amount);
    this.invincible = true;
    this.invincibilityTime = this.invincibilityDuration;

    return true; // Damage was applied
  }

  heal(amount: number = 1): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  update(delta: number): void {
    if (this.invincible) {
      this.invincibilityTime -= delta;

      if (this.invincibilityTime <= 0) {
        this.invincible = false;
      }
    }
  }

  getHealth(): number {
    return this.health;
  }

  getMaxHealth(): number {
    return this.maxHealth;
  }

  getHealthPercent(): number {
    return this.health / this.maxHealth;
  }

  isInvincible(): boolean {
    return this.invincible;
  }

  isDead(): boolean {
    return this.health <= 0;
  }

  reset(): void {
    this.health = this.maxHealth;
    this.invincible = false;
    this.invincibilityTime = 0;
  }
}

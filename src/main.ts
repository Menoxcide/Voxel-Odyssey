import * as THREE from 'three';
import './styles/global.scss';
import { GameLoop } from './core/GameLoop';
import { InputManager } from './systems/InputManager';
import { WorldGenerator } from './game/WorldGenerator';
import { CharacterModel, BossModel } from './rendering/CharacterModel';
import { ParticleSystem, PostProcessing, ScreenShake, HitStop } from './rendering/Effects';
import { PhysicsWorld, ProjectileSystem, HealthSystem } from './game/CombatSystem';

class VoxelOdyssey {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly gameLoop: GameLoop;
  private readonly inputManager: InputManager;

  // World
  private readonly worldGenerator: WorldGenerator;

  // Characters
  private readonly playerModel: CharacterModel;
  private readonly bossModel: BossModel;
  private readonly playerVelocity = new THREE.Vector3();

  // Effects
  private readonly particleSystem: ParticleSystem;
  private readonly postProcessing: PostProcessing;
  private readonly screenShake: ScreenShake;
  private readonly hitStop: HitStop;

  // Physics & Combat
  private readonly physicsWorld: PhysicsWorld;
  private readonly projectileSystem: ProjectileSystem;
  private readonly playerHealth: HealthSystem;

  // Camera follow
  private readonly cameraOffset = new THREE.Vector3(0, 8, 12);
  private readonly cameraTarget = new THREE.Vector3();

  // Shooting cooldown
  private shootCooldown = 0;
  private readonly shootRate = 0.2; // 5 shots per second

  constructor() {
    // Get canvas element
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element not found');
    }

    // Initialize renderer with mobile optimizations
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x87ceeb); // Sky blue

    // Initialize scene
    this.scene = new THREE.Scene();

    // Create gradient skybox
    this.createSkybox();

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );
    this.camera.position.set(0, 15, 20);

    // Add lighting
    this.setupLighting();

    // Initialize physics
    this.physicsWorld = new PhysicsWorld();

    // Generate world
    this.worldGenerator = new WorldGenerator({
      size: 64,
      chunkSize: 16,
      seed: 42,
      heightScale: 6,
      waterLevel: -1,
      treeChance: 0.03
    });
    this.scene.add(this.worldGenerator.generate());

    // Create physics ground
    this.physicsWorld.createGround();

    // Create player
    this.playerModel = new CharacterModel();
    const spawnHeight = this.worldGenerator.getHeightAt(0, 0) + 1;
    this.playerModel.setPosition(0, spawnHeight, 0);
    this.scene.add(this.playerModel.getGroup());

    // Create boss (positioned away from player)
    this.bossModel = new BossModel();
    const bossSpawnHeight = this.worldGenerator.getHeightAt(20, 20) + 2;
    this.bossModel.setPosition(20, bossSpawnHeight, 20);
    this.scene.add(this.bossModel.getGroup());

    // Initialize effects
    this.particleSystem = new ParticleSystem(1000);
    this.scene.add(this.particleSystem.getPoints());

    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
    this.screenShake = new ScreenShake();
    this.hitStop = new HitStop();

    // Initialize combat
    this.projectileSystem = new ProjectileSystem(this.scene, this.physicsWorld);
    this.playerHealth = new HealthSystem(3);

    // Initialize input
    this.inputManager = new InputManager(canvas);

    // Initialize game loop
    this.gameLoop = new GameLoop();
    this.gameLoop.onUpdate(this.update.bind(this));
    this.gameLoop.onFixedUpdate(this.fixedUpdate.bind(this));
    this.gameLoop.onRender(this.render.bind(this));

    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));

    // Hide loading screen
    this.hideLoading();

    // Start the game loop
    this.gameLoop.start();

    console.log('Voxel Odyssey - Phase 2 initialized!');
    console.log('Controls: WASD to move, Click to shoot, Mouse to look');
  }

  private createSkybox(): void {
    const skyGeometry = new THREE.SphereGeometry(400, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4a90e2) },
        bottomColor: { value: new THREE.Color(0x87ceeb) },
        offset: { value: 20 },
        exponent: { value: 0.4 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);
  }

  private setupLighting(): void {
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x6688cc, 0.4);
    this.scene.add(ambientLight);

    // Hemisphere light for sky/ground color
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4ade80, 0.3);
    this.scene.add(hemiLight);

    // Directional light (sun)
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(30, 50, 30);
    sunLight.castShadow = true;

    // Shadow settings
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 100;
    sunLight.shadow.camera.left = -40;
    sunLight.shadow.camera.right = 40;
    sunLight.shadow.camera.top = 40;
    sunLight.shadow.camera.bottom = -40;
    sunLight.shadow.bias = -0.001;

    this.scene.add(sunLight);

    // Add fog for depth
    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 200);
  }

  private update(delta: number): void {
    // Apply hit stop
    const adjustedDelta = this.hitStop.update(delta);

    // Update input
    this.inputManager.update();
    const input = this.inputManager.getState();

    // Player movement
    const moveSpeed = 8;
    this.playerVelocity.x = input.moveX * moveSpeed;
    this.playerVelocity.z = input.moveZ * moveSpeed;

    // Apply movement
    const playerPos = this.playerModel.getPosition();
    playerPos.x += this.playerVelocity.x * adjustedDelta;
    playerPos.z += this.playerVelocity.z * adjustedDelta;

    // Keep player on terrain
    const terrainHeight = this.worldGenerator.getHeightAt(playerPos.x, playerPos.z);
    playerPos.y = terrainHeight + 1;

    // Clamp to world bounds
    this.worldGenerator.clampToBounds(playerPos);
    this.playerModel.setPosition(playerPos.x, playerPos.y, playerPos.z);

    // Update player animation
    this.playerModel.update(adjustedDelta, this.playerVelocity);

    // Shooting
    this.shootCooldown -= delta;
    if (input.shooting && this.shootCooldown <= 0) {
      this.shoot();
      this.shootCooldown = this.shootRate;
    }

    // Update boss
    const bossPos = this.bossModel.getPosition();
    const bossTerrainHeight = this.worldGenerator.getHeightAt(bossPos.x, bossPos.z);
    bossPos.y = bossTerrainHeight + 1.5;
    this.bossModel.setPosition(bossPos.x, bossPos.y, bossPos.z);

    // Update boss animation
    this.bossModel.update(adjustedDelta, new THREE.Vector3());

    // Update camera (third-person follow)
    this.updateCamera(adjustedDelta);

    // Update LOD based on camera position
    this.worldGenerator.updateLOD(this.camera.position);

    // Update effects
    this.particleSystem.update(adjustedDelta);
    this.projectileSystem.update(adjustedDelta);
    this.screenShake.update(adjustedDelta, this.camera);

    // Update health
    this.playerHealth.update(adjustedDelta);

    // Emit player magic trail when moving
    if (this.playerVelocity.lengthSq() > 0.1) {
      this.particleSystem.emitTrail(
        this.playerModel.getOrbWorldPosition(),
        0x60a5fa
      );
    }
  }

  private fixedUpdate(fixedDelta: number): void {
    // Update physics world
    this.physicsWorld.step(fixedDelta);
  }

  private shoot(): void {
    const orbPos = this.playerModel.getOrbWorldPosition();

    // Get direction (forward based on camera)
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyQuaternion(this.camera.quaternion);
    direction.y = 0;
    direction.normalize();

    // Fire projectile
    this.projectileSystem.fire(
      orbPos,
      direction,
      25,
      true,
      1,
      () => {
        // On hit effect
        this.particleSystem.emitHitSparks(orbPos, 0x60a5fa);
        this.screenShake.shake(0.2);
      }
    );

    // Attack animation
    this.playerModel.attack();

    // Muzzle flash particles
    this.particleSystem.emit(orbPos, 5, 0x60a5fa, 0.3, 3, 0.2);
  }

  private updateCamera(delta: number): void {
    const playerPos = this.playerModel.getPosition();

    // Calculate target camera position
    this.cameraTarget.copy(playerPos).add(this.cameraOffset);

    // Smooth camera follow
    this.camera.position.lerp(this.cameraTarget, delta * 5);

    // Look at player
    const lookTarget = playerPos.clone();
    lookTarget.y += 1;
    this.camera.lookAt(lookTarget);
  }

  private render(_alpha: number): void {
    // Use post-processing if enabled
    if (this.postProcessing.isEnabled()) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.postProcessing.setSize(width, height);
  }

  private hideLoading(): void {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('hidden');
      setTimeout(() => loading.remove(), 300);
    }
  }

  dispose(): void {
    this.gameLoop.dispose();
    this.inputManager.dispose();
    this.worldGenerator.dispose();
    this.playerModel.dispose();
    this.bossModel.dispose();
    this.particleSystem.dispose();
    this.postProcessing.dispose();
    this.projectileSystem.dispose();
    this.physicsWorld.dispose();

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });

    this.renderer.dispose();
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new VoxelOdyssey();
});

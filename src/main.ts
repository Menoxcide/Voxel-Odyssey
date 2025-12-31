import * as THREE from 'three';
import './styles/global.scss';
import { GameLoop } from './core/GameLoop';
import { InputManager } from './systems/InputManager';
import { UIManager } from './systems/UIManager';
import { AudioManager } from './systems/AudioManager';
import { WorldGenerator } from './game/WorldGenerator';
import { Player } from './game/Player';
import { Enemy, SuicideBomber } from './game/Enemy';
import { Boss } from './game/Boss';
import { ParticleSystem, ScreenShake, HitStop } from './rendering/Effects';
import { PhysicsWorld, ProjectileSystem } from './game/CombatSystem';

enum GameState {
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

class VoxelOdyssey {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly gameLoop: GameLoop;
  private readonly inputManager: InputManager;
  private readonly uiManager: UIManager;
  private readonly audioManager: AudioManager;

  // World
  private readonly worldGenerator: WorldGenerator;

  // Physics
  private readonly physicsWorld: PhysicsWorld;

  // Characters
  private player!: Player;
  private boss!: Boss;
  private readonly enemies: Enemy[] = [];
  private readonly maxEnemies = 20;

  // Combat
  private readonly projectileSystem: ProjectileSystem;
  private readonly particleSystem: ParticleSystem;
  private readonly screenShake: ScreenShake;
  private readonly hitStop: HitStop;

  // Beam visual
  private beamMesh: THREE.Mesh | null = null;

  // Game state
  private gameState: GameState = GameState.PLAYING;
  private readonly spawnPosition = new THREE.Vector3(0, 5, 0);

  constructor() {
    // Get canvas
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) throw new Error('Canvas not found');

    // Renderer
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
    this.renderer.setClearColor(0x87ceeb);

    // Scene
    this.scene = new THREE.Scene();
    this.createSkybox();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    // Lighting
    this.setupLighting();

    // Physics
    this.physicsWorld = new PhysicsWorld();
    this.physicsWorld.createGround();

    // World
    this.worldGenerator = new WorldGenerator({
      size: 64,
      chunkSize: 16,
      seed: 42,
      heightScale: 6,
      waterLevel: -1,
      treeChance: 0.03
    });
    this.scene.add(this.worldGenerator.generate());

    // Effects
    this.particleSystem = new ParticleSystem(1000);
    this.scene.add(this.particleSystem.getPoints());
    this.screenShake = new ScreenShake();
    this.hitStop = new HitStop();

    // Combat
    this.projectileSystem = new ProjectileSystem(this.scene, this.physicsWorld);

    // Systems
    this.inputManager = new InputManager(canvas);
    this.uiManager = new UIManager();
    this.audioManager = new AudioManager();

    // Initialize game entities
    this.initializeGame();

    // Game loop
    this.gameLoop = new GameLoop();
    this.gameLoop.onUpdate(this.update.bind(this));
    this.gameLoop.onFixedUpdate(this.fixedUpdate.bind(this));
    this.gameLoop.onRender(this.render.bind(this));

    // Events
    window.addEventListener('resize', this.onResize.bind(this));

    // Hide loading
    this.hideLoading();

    // Start
    this.gameLoop.start();

    console.log('Voxel Odyssey - Phase 3 initialized!');
    console.log('Controls: WASD move, Space jump, Click shoot');
  }

  private initializeGame(): void {
    // Clear existing enemies
    this.enemies.forEach((enemy) => enemy.dispose(this.scene, this.physicsWorld.getWorld()));
    this.enemies.length = 0;

    // Spawn position
    const spawnY = this.worldGenerator.getHeightAt(0, 0) + 2;
    this.spawnPosition.set(0, spawnY, 0);

    // Create player
    this.player = new Player(
      this.scene,
      this.physicsWorld.getWorld(),
      this.spawnPosition
    );

    // Create boss
    const bossSpawnY = this.worldGenerator.getHeightAt(25, 25) + 3;
    this.boss = new Boss(
      this.scene,
      this.physicsWorld.getWorld(),
      new THREE.Vector3(25, bossSpawnY, 25)
    );

    // Boss callbacks
    this.boss.onSummonMinions = (count, position) => {
      this.spawnMinions(count, position);
      this.audioManager.play('bossRoar');
    };

    this.boss.onBeamUpdate = (origin, angle, length) => {
      this.updateBeamVisual(origin, angle, length);
    };

    this.boss.onBeamEnd = () => {
      this.hideBeamVisual();
    };

    this.boss.onPhaseChange = (phase) => {
      this.uiManager.updateBossPhase(phase);
      this.audioManager.play('bossPhase');
      this.screenShake.shake(0.5);
    };

    this.boss.onDeath = () => {
      this.onBossDefeated();
    };

    // UI
    this.uiManager.updateHearts(this.player.getMaxHealth(), this.player.getMaxHealth());
    this.uiManager.showBossHealth(true);
    this.uiManager.updateBossHealth(1);
    this.uiManager.updateBossPhase('SUMMON');

    // Reset state
    this.gameState = GameState.PLAYING;
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
    this.scene.add(new THREE.Mesh(skyGeometry, skyMaterial));
  }

  private setupLighting(): void {
    this.scene.add(new THREE.AmbientLight(0x6688cc, 0.4));
    this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x4ade80, 0.3));

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(30, 50, 30);
    sunLight.castShadow = true;
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

    this.scene.fog = new THREE.Fog(0x87ceeb, 50, 200);
  }

  private update(delta: number): void {
    if (this.gameState !== GameState.PLAYING) return;

    const adjustedDelta = this.hitStop.update(delta);

    // Input
    this.inputManager.update();
    const input = this.inputManager.getState();

    // Player
    this.player.update(adjustedDelta, input, this.camera);

    // Shooting
    if (input.shooting && this.player.canShoot()) {
      this.shoot();
    }

    // Boss
    this.boss.update(adjustedDelta, this.player.getPosition());
    this.uiManager.updateBossHealth(this.boss.getHealthPercent());

    // Check boss beam/dash hits
    this.checkBossAttacks();

    // Enemies
    this.updateEnemies(adjustedDelta);

    // Projectiles
    this.projectileSystem.update(adjustedDelta);

    // Particles
    this.particleSystem.update(adjustedDelta);

    // Screen shake
    this.screenShake.update(adjustedDelta, this.camera);

    // LOD
    this.worldGenerator.updateLOD(this.camera.position);

    // FPS
    this.uiManager.updateFps(this.gameLoop.getFps());

    // Magic trail
    if (input.moveX !== 0 || input.moveZ !== 0) {
      this.particleSystem.emitTrail(this.player.getOrbPosition(), 0x60a5fa);
    }
  }

  private fixedUpdate(fixedDelta: number): void {
    if (this.gameState !== GameState.PLAYING) return;
    this.physicsWorld.step(fixedDelta);
  }

  private shoot(): void {
    this.player.shoot();

    const orbPos = this.player.getOrbPosition();
    const direction = this.player.getShootDirection();

    this.projectileSystem.fire(
      orbPos,
      direction,
      25,
      true,
      1,
      (hitBody) => {
        this.onProjectileHit(hitBody, orbPos);
      }
    );

    this.particleSystem.emit(orbPos, 5, 0x60a5fa, 0.3, 3, 0.2);
    this.audioManager.play('shoot');
  }

  private onProjectileHit(hitBody: unknown, hitPos: THREE.Vector3): void {
    // Check if hit boss
    if (hitBody === this.boss.getBody()) {
      if (this.boss.takeDamage(1)) {
        this.particleSystem.emitHitSparks(hitPos, 0xa855f7);
        this.screenShake.shake(0.15);
        this.audioManager.play('hit');
      }
      return;
    }

    // Check if hit enemy
    for (const enemy of this.enemies) {
      if (hitBody === enemy.getBody()) {
        if (enemy.takeDamage(1)) {
          this.particleSystem.emitHitSparks(enemy.getPosition(), 0xa855f7);
          this.audioManager.play('hit');
        }
        return;
      }
    }
  }

  private checkBossAttacks(): void {
    const playerPos = this.player.getPosition();

    // Beam check
    if (this.boss.isBeamHitting(playerPos)) {
      this.damagePlayer(1);
    }

    // Dash check
    if (this.boss.isDashHitting(playerPos)) {
      this.damagePlayer(2);
    }
  }

  private updateEnemies(delta: number): void {
    const playerPos = this.player.getPosition();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      if (enemy.isDead()) {
        this.particleSystem.emitExplosion(enemy.getPosition(), 0xa855f7);
        this.audioManager.play('enemyDeath');
        enemy.dispose(this.scene, this.physicsWorld.getWorld());
        this.enemies.splice(i, 1);
        continue;
      }

      enemy.update(delta, playerPos);

      // Check collision with player
      const distToPlayer = enemy.getPosition().distanceTo(playerPos);
      if (distToPlayer < 1.5) {
        this.damagePlayer(enemy.getDamage());

        // Suicide bomber explodes
        if (enemy instanceof SuicideBomber) {
          enemy.takeDamage(10);
        }
      }
    }
  }

  private spawnMinions(count: number, position: THREE.Vector3): void {
    for (let i = 0; i < count && this.enemies.length < this.maxEnemies; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = 3 + Math.random() * 2;

      const spawnPos = new THREE.Vector3(
        position.x + Math.cos(angle) * distance,
        position.y + 1,
        position.z + Math.sin(angle) * distance
      );

      // Spawn either regular minion or suicide bomber
      const enemy = Math.random() < 0.3
        ? new SuicideBomber(this.scene, this.physicsWorld.getWorld(), spawnPos)
        : new Enemy(this.scene, this.physicsWorld.getWorld(), spawnPos);

      enemy.onDeath = () => { };
      enemy.onAttack = () => {
        // Minion attack
      };

      this.enemies.push(enemy);
    }
  }

  private damagePlayer(amount: number): void {
    if (this.player.takeDamage(amount)) {
      this.uiManager.updateHearts(this.player.getHealth(), this.player.getMaxHealth());
      this.uiManager.showDamageFlash();
      this.screenShake.shake(0.3);
      this.audioManager.playWithVibration('playerHurt', [50, 30, 50]);
      this.hitStop.trigger(0.1);

      if (this.player.getIsDead()) {
        this.onPlayerDeath();
      }
    }
  }

  private onPlayerDeath(): void {
    this.gameState = GameState.GAME_OVER;
    this.audioManager.play('gameOver');

    this.uiManager.showGameOver(() => {
      this.restartGame();
    });
  }

  private onBossDefeated(): void {
    this.gameState = GameState.VICTORY;

    // Clear remaining enemies
    this.enemies.forEach((enemy) => {
      this.particleSystem.emitExplosion(enemy.getPosition(), 0xa855f7);
      enemy.dispose(this.scene, this.physicsWorld.getWorld());
    });
    this.enemies.length = 0;

    this.particleSystem.emitExplosion(this.boss.getPosition(), 0xa855f7);
    this.screenShake.shake(1);
    this.audioManager.play('victory');

    setTimeout(() => {
      this.uiManager.showVictory(() => {
        this.restartGame();
      });
    }, 2000);
  }

  private restartGame(): void {
    // Dispose old entities
    this.player.dispose();
    this.boss.dispose();
    this.enemies.forEach((e) => e.dispose(this.scene, this.physicsWorld.getWorld()));
    this.enemies.length = 0;

    this.hideBeamVisual();

    // Reinitialize
    this.initializeGame();

    this.uiManager.hideGameOver();
    this.uiManager.hideVictory();
  }

  private updateBeamVisual(origin: THREE.Vector3, angle: number, length: number): void {
    if (!this.beamMesh) {
      const geometry = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
      geometry.rotateZ(Math.PI / 2);
      const material = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.8
      });
      this.beamMesh = new THREE.Mesh(geometry, material);
      this.scene.add(this.beamMesh);
    }

    this.beamMesh.visible = true;
    this.beamMesh.scale.x = length;
    this.beamMesh.position.copy(origin);
    this.beamMesh.position.y += 1;
    this.beamMesh.position.x += Math.sin(angle) * length / 2;
    this.beamMesh.position.z += Math.cos(angle) * length / 2;
    this.beamMesh.rotation.y = -angle;
  }

  private hideBeamVisual(): void {
    if (this.beamMesh) {
      this.beamMesh.visible = false;
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
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
    this.uiManager.dispose();
    this.audioManager.dispose();
    this.worldGenerator.dispose();
    this.player.dispose();
    this.boss.dispose();
    this.enemies.forEach((e) => e.dispose(this.scene, this.physicsWorld.getWorld()));
    this.particleSystem.dispose();
    this.projectileSystem.dispose();
    this.physicsWorld.dispose();
    this.renderer.dispose();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VoxelOdyssey();
});

import * as THREE from 'three';
import { GameLoop } from '../core/GameLoop';
import { SceneManager } from '../core/SceneManager';
import { InputManager } from '../systems/InputManager';
import { UIManager } from '../systems/UIManager';
import { AudioManager } from '../systems/AudioManager';
import { StorageManager } from '../systems/StorageManager';
import { WorldGenerator } from './WorldGenerator';
import { Player } from './Player';
import { Enemy, SuicideBomber } from './Enemy';
import { Boss } from './Boss';
import { ParticleSystem, ScreenShake, HitStop } from '../rendering/Effects';
import { PhysicsWorld, ProjectileSystem } from './CombatSystem';
import { LevelConfig, EnemySpawn } from '../levels/LevelConfig';

export enum GameState {
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY',
  LEVEL_COMPLETE = 'LEVEL_COMPLETE'
}

export class Game {
  // Core
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly gameLoop: GameLoop;

  // Managers
  private readonly sceneManager: SceneManager;
  private readonly inputManager: InputManager;
  private readonly uiManager: UIManager;
  private readonly audioManager: AudioManager;
  private readonly storageManager: StorageManager;

  // World
  private worldGenerator: WorldGenerator | null = null;

  // Physics
  private readonly physicsWorld: PhysicsWorld;

  // Entities
  private player: Player | null = null;
  private boss: Boss | null = null;
  private readonly enemies: Enemy[] = [];
  private readonly maxEnemies = 30;

  // Combat/Effects
  private readonly projectileSystem: ProjectileSystem;
  private readonly particleSystem: ParticleSystem;
  private readonly screenShake: ScreenShake;
  private readonly hitStop: HitStop;

  // Beam visual
  private beamMesh: THREE.Mesh | null = null;

  // State
  private gameState: GameState = GameState.LOADING;
  private currentLevel: LevelConfig | null = null;

  // Wave system
  private currentWaveIndex = 0;
  private waveTimer = 0;
  private pendingSpawns: Array<{ spawn: EnemySpawn; timer: number }> = [];

  // Mobile optimizations
  private lowPowerMode = false;
  private readonly particleBudget = { normal: 1000, lowPower: 300 };

  constructor(canvas: HTMLCanvasElement) {
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

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      500
    );

    // Physics
    this.physicsWorld = new PhysicsWorld();

    // Effects
    this.particleSystem = new ParticleSystem(this.particleBudget.normal);
    this.scene.add(this.particleSystem.getPoints());
    this.screenShake = new ScreenShake();
    this.hitStop = new HitStop();

    // Combat
    this.projectileSystem = new ProjectileSystem(this.scene, this.physicsWorld);

    // Managers
    this.sceneManager = new SceneManager();
    this.inputManager = new InputManager(canvas);
    this.uiManager = new UIManager();
    this.audioManager = new AudioManager();
    this.storageManager = new StorageManager();

    // Apply saved settings
    this.applySettings();

    // Scene manager callbacks
    this.sceneManager.onLevelLoad = (level) => this.onLevelLoad(level);
    this.sceneManager.onGameComplete = () => this.onGameComplete();

    // Game loop
    this.gameLoop = new GameLoop();
    this.gameLoop.onUpdate(this.update.bind(this));
    this.gameLoop.onFixedUpdate(this.fixedUpdate.bind(this));
    this.gameLoop.onRender(this.render.bind(this));

    // Events
    window.addEventListener('resize', this.onResize.bind(this));
    document.addEventListener('visibilitychange', this.onVisibilityChange.bind(this));

    // Start from saved level or beginning
    this.startGame();
  }

  private applySettings(): void {
    const settings = this.storageManager.getSettings();
    this.audioManager.setMusicVolume(settings.musicVolume);
    this.audioManager.setSfxVolume(settings.sfxVolume);
    this.lowPowerMode = settings.lowPowerMode;
    this.uiManager.setFpsVisible(settings.showFps);
  }

  async startGame(): Promise<void> {
    this.storageManager.recordGameStart();

    const savedLevel = this.storageManager.getCurrentLevel();
    await this.sceneManager.transitionToLevel(savedLevel);

    this.gameLoop.start();
  }

  private onLevelLoad(level: LevelConfig): void {
    this.currentLevel = level;
    this.clearLevel();
    this.buildLevel(level);
    this.gameState = GameState.PLAYING;
  }

  private clearLevel(): void {
    // Clear world
    if (this.worldGenerator) {
      this.scene.remove(this.worldGenerator.getGroup());
      this.worldGenerator.dispose();
      this.worldGenerator = null;
    }

    // Clear entities
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }

    if (this.boss) {
      this.boss.dispose();
      this.boss = null;
    }

    this.enemies.forEach((e) => e.dispose(this.scene, this.physicsWorld.getWorld()));
    this.enemies.length = 0;

    // Clear beam
    this.hideBeamVisual();

    // Reset wave system
    this.currentWaveIndex = 0;
    this.waveTimer = 0;
    this.pendingSpawns = [];

    // Clear scene objects (except camera, lights, particles)
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.userData.levelObject) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => this.scene.remove(obj));
  }

  private buildLevel(level: LevelConfig): void {
    // Setup environment
    this.renderer.setClearColor(level.fogColor);
    this.scene.fog = new THREE.Fog(level.fogColor, level.fogNear, level.fogFar);

    // Skybox
    this.createSkybox(level.skyTopColor, level.skyBottomColor);

    // Lighting
    this.setupLighting(level.ambientIntensity, level.sunIntensity);

    // World
    this.worldGenerator = new WorldGenerator({
      size: level.worldSize,
      chunkSize: 16,
      seed: level.worldSeed,
      heightScale: level.heightScale,
      waterLevel: level.waterLevel,
      treeChance: level.treeChance
    });
    this.scene.add(this.worldGenerator.generate());

    // Physics ground
    this.physicsWorld.createGround();

    // Player
    const spawnY = this.worldGenerator.getHeightAt(level.playerSpawn.x, level.playerSpawn.z) + 2;
    const playerSpawn = new THREE.Vector3(level.playerSpawn.x, spawnY, level.playerSpawn.z);

    this.player = new Player(this.scene, this.physicsWorld.getWorld(), playerSpawn);

    // Boss (if enabled)
    if (level.bossEnabled && level.bossSpawn) {
      const bossY = this.worldGenerator.getHeightAt(level.bossSpawn.x, level.bossSpawn.z) + 3;
      this.boss = new Boss(
        this.scene,
        this.physicsWorld.getWorld(),
        new THREE.Vector3(level.bossSpawn.x, bossY, level.bossSpawn.z)
      );
      this.setupBossCallbacks();
      this.uiManager.showBossHealth(true);
      this.uiManager.updateBossHealth(1);
    } else {
      this.uiManager.showBossHealth(false);
    }

    // UI
    this.uiManager.updateHearts(this.player.getMaxHealth(), this.player.getMaxHealth());

    // Start first wave
    if (level.enemyWaves.length > 0) {
      this.startWave(0);
    }
  }

  private createSkybox(topColor: number, bottomColor: number): void {
    const skyGeometry = new THREE.SphereGeometry(400, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(topColor) },
        bottomColor: { value: new THREE.Color(bottomColor) },
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
    sky.userData.levelObject = true;
    this.scene.add(sky);
  }

  private setupLighting(ambientIntensity: number, sunIntensity: number): void {
    const ambient = new THREE.AmbientLight(0x6688cc, ambientIntensity);
    ambient.userData.levelObject = true;
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4ade80, 0.3);
    hemi.userData.levelObject = true;
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
    sun.position.set(30, 50, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.width = this.lowPowerMode ? 512 : 1024;
    sun.shadow.mapSize.height = this.lowPowerMode ? 512 : 1024;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 100;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.bias = -0.001;
    sun.userData.levelObject = true;
    this.scene.add(sun);
  }

  private setupBossCallbacks(): void {
    if (!this.boss) return;

    this.boss.onSummonMinions = (count, position) => {
      this.spawnMinionsAroundPosition(count, position);
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
  }

  private startWave(index: number): void {
    if (!this.currentLevel || index >= this.currentLevel.enemyWaves.length) return;

    this.currentWaveIndex = index;
    const wave = this.currentLevel.enemyWaves[index];

    // Schedule spawns
    this.pendingSpawns = wave.map((spawn) => ({
      spawn,
      timer: spawn.delay
    }));
  }

  private update(delta: number): void {
    if (this.gameState !== GameState.PLAYING) return;
    if (!this.player || !this.currentLevel) return;

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
    if (this.boss && !this.boss.isDead()) {
      this.boss.update(adjustedDelta, this.player.getPosition());
      this.uiManager.updateBossHealth(this.boss.getHealthPercent());
      this.checkBossAttacks();
    }

    // Wave spawning
    this.updateWaveSpawns(delta);

    // Enemies
    this.updateEnemies(adjustedDelta);

    // Check level completion
    this.checkLevelCompletion();

    // Effects
    this.projectileSystem.update(adjustedDelta);
    this.particleSystem.update(adjustedDelta);
    this.screenShake.update(adjustedDelta, this.camera);

    // LOD
    if (this.worldGenerator) {
      this.worldGenerator.updateLOD(this.camera.position);
    }

    // UI
    this.uiManager.updateFps(this.gameLoop.getFps());

    // Particle trail
    if (!this.lowPowerMode && (input.moveX !== 0 || input.moveZ !== 0)) {
      this.particleSystem.emitTrail(this.player.getOrbPosition(), 0x60a5fa);
    }
  }

  private updateWaveSpawns(delta: number): void {
    if (!this.currentLevel || !this.worldGenerator) return;

    // Process pending spawns
    for (let i = this.pendingSpawns.length - 1; i >= 0; i--) {
      this.pendingSpawns[i].timer -= delta;

      if (this.pendingSpawns[i].timer <= 0) {
        const { spawn } = this.pendingSpawns[i];
        this.spawnEnemy(spawn);
        this.pendingSpawns.splice(i, 1);
      }
    }

    // Check for next wave
    if (this.pendingSpawns.length === 0 && this.enemies.length === 0) {
      this.waveTimer += delta;

      if (this.waveTimer >= this.currentLevel.waveCooldown) {
        this.waveTimer = 0;
        const nextWave = this.currentWaveIndex + 1;

        if (nextWave < this.currentLevel.enemyWaves.length) {
          this.startWave(nextWave);
        }
      }
    }
  }

  private spawnEnemy(spawn: EnemySpawn): void {
    if (!this.worldGenerator || this.enemies.length >= this.maxEnemies) return;

    const y = this.worldGenerator.getHeightAt(spawn.position.x, spawn.position.z) + 2;
    const position = new THREE.Vector3(spawn.position.x, y, spawn.position.z);

    const enemy = spawn.type === 'bomber'
      ? new SuicideBomber(this.scene, this.physicsWorld.getWorld(), position)
      : new Enemy(this.scene, this.physicsWorld.getWorld(), position);

    this.enemies.push(enemy);
  }

  private spawnMinionsAroundPosition(count: number, position: THREE.Vector3): void {
    for (let i = 0; i < count && this.enemies.length < this.maxEnemies; i++) {
      const angle = (i / count) * Math.PI * 2;
      const distance = 3 + Math.random() * 2;

      const spawn: EnemySpawn = {
        type: Math.random() < 0.3 ? 'bomber' : 'minion',
        position: new THREE.Vector3(
          position.x + Math.cos(angle) * distance,
          position.y,
          position.z + Math.sin(angle) * distance
        ),
        delay: 0
      };

      this.spawnEnemy(spawn);
    }
  }

  private shoot(): void {
    if (!this.player) return;

    this.player.shoot();
    this.storageManager.recordShot(false); // Will update on hit

    const orbPos = this.player.getOrbPosition();
    const direction = this.player.getShootDirection();

    this.projectileSystem.fire(
      orbPos,
      direction,
      25,
      true,
      1,
      (hitBody) => this.onProjectileHit(hitBody, orbPos)
    );

    if (!this.lowPowerMode) {
      this.particleSystem.emit(orbPos, 5, 0x60a5fa, 0.3, 3, 0.2);
    }
    this.audioManager.play('shoot');
  }

  private onProjectileHit(hitBody: unknown, hitPos: THREE.Vector3): void {
    // Boss hit
    if (this.boss && hitBody === this.boss.getBody()) {
      if (this.boss.takeDamage(1)) {
        this.storageManager.incrementStat('shotsHit');
        this.particleSystem.emitHitSparks(hitPos, 0xa855f7);
        this.screenShake.shake(0.15);
        this.audioManager.play('hit');
      }
      return;
    }

    // Enemy hit
    for (const enemy of this.enemies) {
      if (hitBody === enemy.getBody()) {
        if (enemy.takeDamage(1)) {
          this.storageManager.incrementStat('shotsHit');
          this.particleSystem.emitHitSparks(enemy.getPosition(), 0xa855f7);
          this.audioManager.play('hit');
        }
        return;
      }
    }
  }

  private checkBossAttacks(): void {
    if (!this.player || !this.boss) return;

    const playerPos = this.player.getPosition();

    if (this.boss.isBeamHitting(playerPos)) {
      this.damagePlayer(1);
    }

    if (this.boss.isDashHitting(playerPos)) {
      this.damagePlayer(2);
    }
  }

  private updateEnemies(delta: number): void {
    if (!this.player) return;

    const playerPos = this.player.getPosition();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      if (enemy.isDead()) {
        this.particleSystem.emitExplosion(enemy.getPosition(), 0xa855f7);
        this.audioManager.play('enemyDeath');
        this.storageManager.recordKill();
        enemy.dispose(this.scene, this.physicsWorld.getWorld());
        this.enemies.splice(i, 1);
        continue;
      }

      enemy.update(delta, playerPos);

      // Collision with player
      const dist = enemy.getPosition().distanceTo(playerPos);
      if (dist < 1.5) {
        this.damagePlayer(enemy.getDamage());
        if (enemy instanceof SuicideBomber) {
          enemy.takeDamage(10);
        }
      }
    }
  }

  private checkLevelCompletion(): void {
    if (!this.currentLevel) return;

    let complete = false;

    switch (this.currentLevel.winCondition) {
      case 'defeat_boss':
        complete = this.boss !== null && this.boss.isDead();
        break;

      case 'survive_waves':
        complete = this.currentWaveIndex >= this.currentLevel.enemyWaves.length - 1 &&
          this.pendingSpawns.length === 0 &&
          this.enemies.length === 0;
        break;
    }

    if (complete) {
      this.onLevelComplete();
    }
  }

  private damagePlayer(amount: number): void {
    if (!this.player) return;

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
    this.storageManager.recordDeath();
    this.storageManager.save();
    this.audioManager.play('gameOver');

    this.uiManager.showGameOver(() => {
      this.sceneManager.restartLevel();
    });
  }

  private onLevelComplete(): void {
    this.gameState = GameState.LEVEL_COMPLETE;
    this.sceneManager.completeLevel();
    this.storageManager.setCurrentLevel(this.sceneManager.getCurrentLevelIndex() + 1);

    if (this.sceneManager.isLastLevel()) {
      this.onBossDefeated();
    } else {
      setTimeout(() => {
        this.sceneManager.nextLevel();
      }, 1500);
    }
  }

  private onBossDefeated(): void {
    this.gameState = GameState.VICTORY;
    this.storageManager.recordBossDefeat();
    this.storageManager.save();

    // Clear enemies
    this.enemies.forEach((e) => {
      this.particleSystem.emitExplosion(e.getPosition(), 0xa855f7);
      e.dispose(this.scene, this.physicsWorld.getWorld());
    });
    this.enemies.length = 0;

    if (this.boss) {
      this.particleSystem.emitExplosion(this.boss.getPosition(), 0xa855f7);
    }

    this.screenShake.shake(1);
    this.audioManager.play('victory');

    setTimeout(() => {
      this.uiManager.showVictory(() => {
        if (this.sceneManager.isLastLevel()) {
          // Game complete - restart from beginning
          this.storageManager.setCurrentLevel(0);
          this.sceneManager.transitionToLevel(0);
        } else {
          this.sceneManager.nextLevel();
        }
      });
    }, 2000);
  }

  private onGameComplete(): void {
    // Unlock special skin for completing game
    this.storageManager.unlockSkin('golden');
    this.storageManager.save();
  }

  private updateBeamVisual(origin: THREE.Vector3, angle: number, length: number): void {
    if (!this.beamMesh) {
      const geo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
      geo.rotateZ(Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xa855f7,
        transparent: true,
        opacity: 0.8
      });
      this.beamMesh = new THREE.Mesh(geo, mat);
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

  private fixedUpdate(fixedDelta: number): void {
    if (this.gameState !== GameState.PLAYING) return;
    this.physicsWorld.step(fixedDelta);
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

  private onVisibilityChange(): void {
    if (document.hidden) {
      this.audioManager.pauseMusic();
      this.storageManager.save();
    } else {
      this.audioManager.resumeMusic();
    }
  }

  setLowPowerMode(enabled: boolean): void {
    this.lowPowerMode = enabled;
    this.storageManager.updateSettings({ lowPowerMode: enabled });
  }

  dispose(): void {
    this.storageManager.save();
    this.gameLoop.dispose();
    this.sceneManager.dispose();
    this.inputManager.dispose();
    this.uiManager.dispose();
    this.audioManager.dispose();
    this.clearLevel();
    this.particleSystem.dispose();
    this.projectileSystem.dispose();
    this.physicsWorld.dispose();
    this.renderer.dispose();
  }
}

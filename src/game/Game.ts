import * as THREE from 'three';
import { GameLoop } from '../core/GameLoop';
import { SceneManager } from '../core/SceneManager';
import { InputManager, InputState } from '../systems/InputManager';
import { UIManager } from '../systems/UIManager';
import { AudioManager } from '../systems/AudioManager';
import { StorageManager } from '../systems/StorageManager';
import { Minimap, EntityPosition } from '../systems/Minimap';
import { WorldGenerator } from './WorldGenerator';
import { Player } from './Player';
import { Enemy, SuicideBomber, Shooter, Tank, Speeder, Healer, Shielder } from './Enemy';
import { Boss } from './Boss';
import { ParticleSystem, ScreenShake, HitStop, HealthVignette, ImpactVortex } from '../rendering/Effects';
import { DamageNumbers } from '../rendering/DamageNumbers';
import { EnemyHealthBars } from '../rendering/EnemyHealthBars';
import { PhysicsWorld, ProjectileSystem } from './CombatSystem';
import { LevelConfig, EnemySpawn } from '../levels/LevelConfig';
import { getClassById, getDefaultClass } from './classes/ClassDefinitions';
import { TrapData, ActiveBuff } from './classes/ClassConfig';
import { ComboSystem } from './ComboSystem';
import { PickupSystem, PickupType, PickupConfig } from './Pickup';
import { EnemyInstancing } from '../rendering/EnemyInstancing';
import { EnemyAbilityVisuals } from '../rendering/EnemyAbilityVisuals';
import { HazardSystem } from './Hazard';

export enum GameState {
  LOADING = 'LOADING',
  MAIN_MENU = 'MAIN_MENU',
  CLASS_SELECT = 'CLASS_SELECT',
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
  private readonly comboSystem: ComboSystem;
  private readonly damageNumbers: DamageNumbers;
  private readonly healthVignette: HealthVignette;
  private readonly impactVortex: ImpactVortex;
  private readonly enemyHealthBars: EnemyHealthBars;

  // Enemy health bar tracking (maps Enemy instance to health bar ID)
  private readonly enemyHealthBarIds: Map<Enemy, number> = new Map();

  // Pickup system
  private readonly pickupSystem: PickupSystem;

  // Enemy instancing for basic enemies (massive draw call reduction)
  private readonly enemyInstancing: EnemyInstancing;

  // Environmental hazards
  private readonly hazardSystem: HazardSystem;

  // Enemy ability visual feedback
  private readonly enemyAbilityVisuals: EnemyAbilityVisuals;

  // Hazard slow state
  private hazardSlowFactor = 1;

  // Beam visual
  private beamMesh: THREE.Mesh | null = null;

  // State
  private gameState: GameState = GameState.LOADING;
  private currentLevel: LevelConfig | null = null;

  // Targeting system
  private targetedEnemy: Enemy | null = null;
  private targetIndicator: THREE.Mesh | null = null;

  // Wave system
  private currentWaveIndex = 0;
  private waveTimer = 0;
  private pendingSpawns: Array<{ spawn: EnemySpawn; timer: number }> = [];

  // Class system
  private activeTraps: TrapData[] = [];
  private trapMeshes: Map<string, THREE.Mesh> = new Map();
  private activeBuffs: ActiveBuff[] = [];
  private secondaryAbilityCooldown = false;

  // Pickup-based buffs
  private pickupBuffs: { type: PickupType; remaining: number; value: number }[] = [];
  private hasShieldBuff = false;

  // Targeting
  private targetCyclePressed = false;

  // Mobile optimizations
  private lowPowerMode = false;
  private readonly particleBudget = { normal: 1000, lowPower: 300 };

  // Skybox time for animated effects
  private skyTime = 0;

  // Frustum culling optimization - reuse objects to avoid GC
  private readonly frustum = new THREE.Frustum();
  private readonly frustumMatrix = new THREE.Matrix4();

  // Cached raycaster for mobile targeting (avoid per-tap allocations)
  private readonly targetRaycaster = new THREE.Raycaster();
  private readonly targetMouse = new THREE.Vector2();

  // Reusable Vector3 temporaries to avoid per-frame allocations
  private readonly tempDirection = new THREE.Vector3();
  private readonly tempTrapPos = new THREE.Vector3();
  private readonly tempSpreadDir = new THREE.Vector3();
  private readonly tempOrigin = new THREE.Vector3();
  private static readonly UP_AXIS = new THREE.Vector3(0, 1, 0);

  // Danger warning state
  private lastDangerLevel = 0;
  private dangerWarningCooldown = 0;

  // Minimap
  private minimap: Minimap | null = null;

  constructor(canvas: HTMLCanvasElement) {
    // Renderer - optimized for mobile performance
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // Disable for mobile performance
      powerPreference: 'high-performance',
      stencil: false, // Not needed for this game
      depth: true,
      alpha: false, // Opaque background
      premultipliedAlpha: false,
      preserveDrawingBuffer: false // Save memory
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Additional rendering optimizations
    this.renderer.sortObjects = false; // Disable automatic sorting (we control render order)
    this.renderer.info.autoReset = false; // Manual reset for performance tracking

    // Scene
    this.scene = new THREE.Scene();

    // Camera - optimized near/far planes for better depth precision
    this.camera = new THREE.PerspectiveCamera(
      60, // FOV
      window.innerWidth / window.innerHeight,
      0.5, // Near plane - increased from 0.1 to improve depth buffer precision
      300 // Far plane - reduced from 500 to cull distant objects
    );

    // Enable frustum culling (enabled by default, but explicit for clarity)
    this.camera.matrixWorldNeedsUpdate = true;

    // Physics
    this.physicsWorld = new PhysicsWorld();

    // Effects
    this.particleSystem = new ParticleSystem(this.particleBudget.normal);
    this.scene.add(this.particleSystem.getPoints());
    this.particleSystem.setCamera(this.camera); // Set camera for distance-based LOD
    this.screenShake = new ScreenShake();
    this.hitStop = new HitStop();

    // Combat
    this.projectileSystem = new ProjectileSystem(this.scene, this.physicsWorld);
    this.comboSystem = new ComboSystem();
    this.damageNumbers = new DamageNumbers();
    this.healthVignette = new HealthVignette();
    this.impactVortex = new ImpactVortex(this.scene);
    this.enemyHealthBars = new EnemyHealthBars(this.scene, this.maxEnemies);

    // Pickup system
    this.pickupSystem = new PickupSystem(this.scene);
    this.setupPickupCallbacks();

    // Enemy instancing (reduces 30 basic enemies from 30 draw calls to 1)
    this.enemyInstancing = new EnemyInstancing(this.scene, this.maxEnemies);

    // Environmental hazards
    this.hazardSystem = new HazardSystem(this.scene);
    this.setupHazardCallbacks();

    // Enemy ability visual feedback
    this.enemyAbilityVisuals = new EnemyAbilityVisuals(this.scene);

    // Create target indicator
    this.createTargetIndicator();

    // Managers
    this.sceneManager = new SceneManager();
    this.inputManager = new InputManager(canvas);
    this.uiManager = new UIManager();
    this.audioManager = new AudioManager();
    this.storageManager = new StorageManager();

    // Initialize minimap
    const minimapContainer = this.uiManager.getMinimapContainer();
    if (minimapContainer) {
      this.minimap = new Minimap(minimapContainer, {
        size: 120,
        range: 30,
        backgroundOpacity: 0.6,
        borderWidth: 2
      });
    }

    // Apply saved settings
    this.applySettings();

    // Setup combo system callbacks
    this.setupComboCallbacks();

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
    this.lowPowerMode = settings.lowPowerMode || this.detectLowEndDevice();
    this.uiManager.setFpsVisible(settings.showFps);

    // Apply low-power mode optimizations
    if (this.lowPowerMode) {
      this.applyLowPowerOptimizations();
    }
  }

  private detectLowEndDevice(): boolean {
    // Auto-detect low-end devices based on hardware capabilities
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');

    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      // Detect low-end GPUs (Mali, PowerVR, Adreno 5xx or lower)
      if (renderer.includes('Mali') ||
          renderer.includes('PowerVR') ||
          /Adreno \d{3}/.test(renderer)) {
        console.log('Low-end GPU detected, enabling optimizations');
        return true;
      }
    }

    // Check for low memory (< 4GB RAM indicator)
    if ('deviceMemory' in navigator && (navigator as any).deviceMemory < 4) {
      console.log('Low memory device detected, enabling optimizations');
      return true;
    }

    // Check for reduced motion preference (often correlates with performance concerns)
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      console.log('Reduced motion preference detected');
      return true;
    }

    return false;
  }

  private applyLowPowerOptimizations(): void {
    // Reduce shadow map size
    const lights = this.scene.children.filter((obj) => obj instanceof THREE.DirectionalLight);
    lights.forEach((light) => {
      if (light instanceof THREE.DirectionalLight && light.shadow) {
        light.shadow.mapSize.width = 512;
        light.shadow.mapSize.height = 512;
      }
    });

    // Lower pixel ratio on very low-end devices
    if (window.devicePixelRatio > 1) {
      this.renderer.setPixelRatio(1);
    }

    // Disable shadows entirely on very low-end devices
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      if (renderer.includes('PowerVR') || /Adreno [345]\d{2}/.test(renderer)) {
        this.renderer.shadowMap.enabled = false;
        console.log('Shadows disabled for ultra low-end GPU');
      }
    }

    console.log('Low-power mode optimizations applied');
  }

  async startGame(): Promise<void> {
    this.storageManager.recordGameStart();

    // Check for unlocks on startup
    this.storageManager.checkClassUnlocks();

    // Show class selection screen
    this.showClassSelection();
  }

  private showClassSelection(): void {
    this.gameState = GameState.CLASS_SELECT;

    const unlockedClasses = this.storageManager.getUnlockedClasses();
    const selectedClassId = this.storageManager.getSelectedClass();
    const unlockProgress = this.storageManager.getClassUnlockProgress();
    const coins = this.storageManager.getCoins();

    this.uiManager.showClassSelection(
      unlockedClasses,
      selectedClassId,
      (classId: string) => {
        // On class selected
        this.storageManager.setSelectedClass(classId);
        this.beginGameWithClass(classId);
      },
      unlockProgress,
      coins,
      () => this.openShop(),
      () => this.openSettings()
    );
  }

  private openShop(): void {
    const coins = this.storageManager.getCoins();
    const shopItems = this.getShopItems();

    this.uiManager.showShop(
      coins,
      shopItems,
      (itemId: string) => this.purchaseItem(itemId),
      () => {
        // On shop close - refresh class selection if visible
        if (this.gameState === GameState.CLASS_SELECT) {
          this.showClassSelection();
        }
      }
    );
  }

  private getShopItems(): import('../systems/UIManager').ShopItem[] {
    // Define shop items
    const items: import('../systems/UIManager').ShopItem[] = [
      {
        id: 'health_potion',
        name: 'Health Potion',
        description: 'Restore 1 heart at level start',
        icon: '❤️',
        price: 25,
        rarity: 'common',
        owned: false,
        type: 'consumable'
      },
      {
        id: 'speed_boots',
        name: 'Speed Boots',
        description: '+20% movement speed permanently',
        icon: '👟',
        price: 100,
        rarity: 'rare',
        owned: this.storageManager.isSkinUnlocked('speed_boots'),
        type: 'permanent'
      },
      {
        id: 'power_crystal',
        name: 'Power Crystal',
        description: '+10% damage permanently',
        icon: '💎',
        price: 150,
        rarity: 'epic',
        owned: this.storageManager.isSkinUnlocked('power_crystal'),
        type: 'permanent'
      },
      {
        id: 'golden_armor',
        name: 'Golden Armor',
        description: '+1 max health permanently',
        icon: '🛡️',
        price: 250,
        rarity: 'legendary',
        owned: this.storageManager.isSkinUnlocked('golden_armor'),
        type: 'permanent'
      },
      {
        id: 'coin_magnet',
        name: 'Coin Magnet',
        description: '+50% coin pickup range',
        icon: '🧲',
        price: 75,
        rarity: 'rare',
        owned: this.storageManager.isSkinUnlocked('coin_magnet'),
        type: 'permanent'
      },
      {
        id: 'lucky_charm',
        name: 'Lucky Charm',
        description: 'Better drop rates',
        icon: '🍀',
        price: 200,
        rarity: 'epic',
        owned: this.storageManager.isSkinUnlocked('lucky_charm'),
        type: 'permanent'
      }
    ];

    return items;
  }

  private purchaseItem(itemId: string): boolean {
    const items = this.getShopItems();
    const item = items.find(i => i.id === itemId);

    if (!item || item.owned) return false;

    if (this.storageManager.spendCoins(item.price)) {
      // Mark item as purchased (using skins storage for now)
      if (item.type === 'permanent') {
        this.storageManager.unlockSkin(item.id);
      }
      // Consumables would be handled differently (stored as count)
      return true;
    }

    return false;
  }

  private openSettings(): void {
    const settings = this.storageManager.getSettings();

    this.uiManager.showSettings(
      settings,
      (newSettings) => {
        this.storageManager.updateSettings(newSettings);
        this.applyNewSettings(newSettings);
      },
      () => {
        // On settings close - refresh class selection if visible
        if (this.gameState === GameState.CLASS_SELECT) {
          this.showClassSelection();
        }
      }
    );
  }

  private applyNewSettings(settings: {
    musicVolume: number;
    sfxVolume: number;
    vibration: boolean;
    showFps: boolean;
    lowPowerMode: boolean;
  }): void {
    this.audioManager.setMusicVolume(settings.musicVolume);
    this.audioManager.setSfxVolume(settings.sfxVolume);
    this.uiManager.setFpsVisible(settings.showFps);
    this.setLowPowerMode(settings.lowPowerMode);
  }

  private async beginGameWithClass(_classId: string): Promise<void> {
    // Note: classId is already saved to storage, it gets read in buildLevel
    const savedLevel = this.storageManager.getCurrentLevel();
    await this.sceneManager.transitionToLevel(savedLevel);

    this.gameLoop.start();
  }

  private onLevelLoad(level: LevelConfig): void {
    this.currentLevel = level;
    this.clearLevel();
    this.buildLevel(level);
    this.gameState = GameState.PLAYING;

    // Create in-game HUD with coins, shop, settings, and pause buttons
    this.uiManager.createInGameHud(
      this.storageManager.getCoins(),
      () => this.openInGameShop(),
      () => this.openInGameSettings(),
      () => this.togglePause()
    );
  }

  private openInGameShop(): void {
    this.togglePause(); // Pause while in shop
    this.openShop();
  }

  private openInGameSettings(): void {
    this.togglePause(); // Pause while in settings
    this.openSettings();
  }

  private togglePause(): void {
    if (this.gameState === GameState.PLAYING) {
      this.gameState = GameState.PAUSED;
      this.uiManager.showPauseMenu(
        () => {
          this.gameState = GameState.PLAYING;
        },
        () => this.openShop(),
        () => this.openSettings(),
        () => {
          // Quit to menu
          this.uiManager.destroyInGameHud();
          this.uiManager.hidePauseMenu();
          this.showClassSelection();
        }
      );
    } else if (this.gameState === GameState.PAUSED) {
      this.gameState = GameState.PLAYING;
      this.uiManager.hidePauseMenu();
    }
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

    this.enemies.forEach((e) => {
      // Remove health bar for each enemy
      const healthBarId = this.enemyHealthBarIds.get(e);
      if (healthBarId !== undefined) {
        this.enemyHealthBars.removeEnemy(healthBarId);
      }
      e.dispose(this.scene, this.physicsWorld.getWorld());
    });
    this.enemies.length = 0;
    this.enemyHealthBarIds.clear();

    // Clear beam
    this.hideBeamVisual();

    // Clear targeting
    this.targetedEnemy = null;
    if (this.targetIndicator) {
      this.targetIndicator.visible = false;
    }

    // Reset wave system
    this.currentWaveIndex = 0;
    this.waveTimer = 0;
    this.pendingSpawns = [];

    // Clear traps
    for (const trap of this.activeTraps) {
      this.removeTrap(trap);
    }
    this.activeTraps = [];
    this.activeBuffs = [];

    // Clear pickups and buffs
    this.pickupSystem.clear();
    this.pickupBuffs = [];
    this.hasShieldBuff = false;

    // Clear hazards
    this.hazardSystem.clear();
    this.hazardSlowFactor = 1;
    this.uiManager.clearDamageIndicators();

    // Clear enemy ability visuals
    this.enemyAbilityVisuals.clear();

    // Reset combo
    this.comboSystem.reset();

    // Clear scene objects (except camera, lights, particles)
    const toRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => {
      if (obj.userData.levelObject) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => {
      // Properly dispose of geometries and materials
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      }
      this.scene.remove(obj);
    });
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

    // Player with selected class
    const spawnY = this.worldGenerator.getHeightAt(level.playerSpawn.x, level.playerSpawn.z) + 2;
    const playerSpawn = new THREE.Vector3(level.playerSpawn.x, spawnY, level.playerSpawn.z);

    // Get selected class or default
    const selectedClassId = this.storageManager.getSelectedClass();
    const playerClass = getClassById(selectedClassId) ?? getDefaultClass();

    this.player = new Player(this.scene, this.physicsWorld.getWorld(), playerSpawn, playerClass);

    // Set terrain height getter for proper terrain following
    this.player.setTerrainHeightGetter((x, z) => this.worldGenerator!.getHeightAt(x, z));

    // Set world boundary based on level size
    this.player.setWorldBoundary(level.worldSize / 2);

    // Set up ability callbacks
    this.setupPlayerAbilityCallbacks();

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

    // Environmental hazards
    if (level.hazards && level.hazards.length > 0) {
      this.hazardSystem.spawnFromConfig(
        level.hazards,
        (x, z) => this.worldGenerator!.getHeightAt(x, z)
      );
    }

    // UI
    this.uiManager.updateHearts(this.player.getMaxHealth(), this.player.getMaxHealth());

    // Show level objective
    if (level.bossEnabled) {
      this.uiManager.setObjective(`${level.name}: Defeat the Boss!`, true);
    } else if (level.enemyWaves.length > 0) {
      this.uiManager.setObjective(`${level.name}: Survive all waves!`, true);
    } else {
      this.uiManager.setObjective(`${level.name}: ${level.description}`, true);
    }

    // Auto-hide objective after 5 seconds
    setTimeout(() => {
      this.uiManager.hideObjective();
    }, 5000);

    // Start first wave
    if (level.enemyWaves.length > 0) {
      this.startWave(0);
    }
  }

  private createSkybox(topColor: number, bottomColor: number): void {
    // Calculate luminance to determine if this is a day or night scene
    const topC = new THREE.Color(topColor);
    const botC = new THREE.Color(bottomColor);
    const luminance = (topC.r + topC.g + topC.b) / 3;
    const isDark = luminance < 0.25;
    const isForest = topC.g > topC.r && topC.g > topC.b; // Green-dominant = forest

    const skyGeometry = new THREE.SphereGeometry(400, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: topC },
        bottomColor: { value: botC },
        sunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
        isDark: { value: isDark ? 1.0 : 0.0 },
        isForest: { value: isForest ? 1.0 : 0.0 },
        time: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;
        uniform float isDark;
        uniform float isForest;
        uniform float time;
        varying vec3 vWorldPosition;
        varying vec2 vUv;

        // Simple hash for stars
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 worldDir = normalize(vWorldPosition);
          float h = worldDir.y * 0.5 + 0.5;

          // Base gradient with smoother transition
          vec3 skyColor = mix(bottomColor, topColor, pow(h, 0.6));

          // Horizon glow
          float horizonFactor = 1.0 - abs(worldDir.y);
          horizonFactor = pow(horizonFactor, 3.0);
          vec3 horizonColor = mix(bottomColor, vec3(1.0, 0.9, 0.8), 0.3);
          skyColor = mix(skyColor, horizonColor, horizonFactor * 0.4 * (1.0 - isDark));

          // Sun disc for daytime scenes
          if (isDark < 0.5) {
            float sunDot = dot(worldDir, sunDirection);
            float sunDisc = smoothstep(0.995, 0.999, sunDot);
            float sunGlow = smoothstep(0.9, 0.999, sunDot) * 0.5;
            vec3 sunColor = vec3(1.0, 0.95, 0.8);
            skyColor = mix(skyColor, sunColor, sunGlow);
            skyColor = mix(skyColor, vec3(1.0, 1.0, 0.95), sunDisc);
          }

          // Stars for dark scenes
          if (isDark > 0.5 && worldDir.y > 0.0) {
            vec2 starCoord = worldDir.xz / (worldDir.y + 0.001) * 50.0;
            float star = hash(floor(starCoord));
            star = step(0.98, star) * star;
            float twinkle = sin(time * 3.0 + star * 100.0) * 0.5 + 0.5;
            skyColor += vec3(star * twinkle * 0.8);
          }

          // Forest mist effect
          if (isForest > 0.5) {
            float mist = smoothstep(0.3, 0.0, worldDir.y);
            vec3 mistColor = bottomColor * 1.2;
            skyColor = mix(skyColor, mistColor, mist * 0.5);
          }

          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.userData.levelObject = true;
    sky.userData.skyMaterial = skyMaterial; // Store reference for time updates
    this.scene.add(sky);
  }

  private updateSkyboxTime(): void {
    // Find sky mesh and update time uniform
    this.scene.traverse((obj) => {
      if (obj.userData.skyMaterial) {
        const material = obj.userData.skyMaterial as THREE.ShaderMaterial;
        if (material.uniforms.time) {
          material.uniforms.time.value = this.skyTime;
        }
      }
    });
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

  private setupComboCallbacks(): void {
    this.comboSystem.setCallbacks({
      onComboChange: (state) => {
        this.uiManager.updateCombo(state);
      },
      onTierUp: (tier, config) => {
        this.uiManager.showComboTierUp(tier, config);
        this.screenShake.shake(0.15);
        // Play tier-up sound if available
        if (config.sound) {
          this.audioManager.play(config.sound);
        }
      },
      onComboEnd: (finalCount, _bonusDamage) => {
        if (finalCount >= 5) {
          // Store highest combo in stats
          this.storageManager.incrementStat('highestCombo', finalCount);
        }
      },
      onKillStreak: (streakConfig) => {
        // Show kill streak announcement (Double Kill!, Triple Kill!, etc.)
        this.uiManager.showKillStreak(streakConfig.name, streakConfig.color);
        this.screenShake.shake(0.2);
        this.audioManager.play('killStreak');
        // Add vibration for extra impact on mobile
        this.audioManager.vibrate([50, 30, 50]);
        // Floating text at center screen
        this.damageNumbers.showTextAtScreen(
          window.innerWidth / 2,
          window.innerHeight * 0.35,
          streakConfig.name,
          'streak',
          0.8
        );
      }
    });
  }

  private setupPickupCallbacks(): void {
    this.pickupSystem.onPickupCollected = (type: PickupType, config: PickupConfig) => {
      if (!this.player) return;

      switch (type) {
        case PickupType.HEALTH:
          // Instant heal
          this.player.heal(config.value);
          this.uiManager.updateHearts(this.player.getHealth(), this.player.getMaxHealth());
          this.healthVignette.update(this.player.getHealth(), this.player.getMaxHealth());
          this.particleSystem.emit(this.player.getPosition(), 15, 0xef4444, 0.5, 4, 0.4);
          this.damageNumbers.show(this.player.getPosition(), config.value, 'heal');
          break;

        case PickupType.SPEED_BOOST:
          // Timed buff
          this.pickupBuffs.push({
            type,
            remaining: config.duration,
            value: config.value
          });
          this.particleSystem.emit(this.player.getPosition(), 15, config.color, 0.5, 4, 0.4);
          this.damageNumbers.showText(this.player.getPosition(), 'SPEED UP!', 'buff');
          break;

        case PickupType.DAMAGE_BOOST:
          // Timed buff
          this.pickupBuffs.push({
            type,
            remaining: config.duration,
            value: config.value
          });
          this.particleSystem.emit(this.player.getPosition(), 15, config.color, 0.5, 4, 0.4);
          this.damageNumbers.showText(this.player.getPosition(), 'DAMAGE UP!', 'buff');
          break;

        case PickupType.SHIELD:
          // Shield buff (absorbs next hit)
          this.hasShieldBuff = true;
          this.pickupBuffs.push({
            type,
            remaining: config.duration,
            value: config.value
          });
          this.particleSystem.emit(this.player.getPosition(), 20, 0x3b82f6, 0.8, 5, 0.5);
          this.damageNumbers.showText(this.player.getPosition(), 'SHIELD!', 'block');
          break;

        case PickupType.COIN:
          // Add coins to storage
          this.storageManager.addCoins(config.value);
          this.uiManager.updateInGameCoins(this.storageManager.getCoins());
          this.particleSystem.emit(this.player.getPosition(), 8, 0xffd700, 0.3, 2, 0.2);
          this.damageNumbers.showText(this.player.getPosition(), `+${config.value} GOLD`, 'pickup');
          break;
      }

      this.audioManager.play('pickup');
      this.screenShake.shake(0.1);
    };
  }

  /**
   * Get instancing callbacks for basic enemies
   */
  private getInstancingCallbacks() {
    return {
      onRegister: (id: string, position: THREE.Vector3, scale: number) => {
        this.enemyInstancing.registerEnemy(id, position, scale);
      },
      onUnregister: (id: string) => {
        this.enemyInstancing.unregisterEnemy(id);
      },
      onTransformUpdate: (id: string, position: THREE.Vector3, rotation: number) => {
        this.enemyInstancing.updateInstanceTransform(id, position, rotation);
      },
      onDamageFlash: (id: string, duration: number) => {
        this.enemyInstancing.triggerDamageFlash(id, duration);
      }
    };
  }

  private setupHazardCallbacks(): void {
    this.hazardSystem.setCallbacks({
      onDamage: (amount: number, hazardPos: THREE.Vector3) => {
        this.damagePlayerFromSource(amount, hazardPos);
      },
      onSlowApply: (factor: number) => {
        this.hazardSlowFactor = factor;
      },
      onSlowRemove: () => {
        this.hazardSlowFactor = 1;
      },
      onParticleEmit: (position: THREE.Vector3, count: number, color: number) => {
        if (!this.lowPowerMode) {
          this.particleSystem.emit(position, count, color, 0.5, 3, 0.4);
        }
      }
    });
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

    // Attack telegraph callbacks - warn player before attacks
    this.boss.onBeamTelegraph = (origin, startAngle, _sweepAngle) => {
      // Show warning particles at beam start position
      const warningPos = origin.clone();
      warningPos.x += Math.sin(startAngle) * 3;
      warningPos.z += Math.cos(startAngle) * 3;
      this.particleSystem.emit(warningPos, 20, 0xff0000, 1, 5, 0.5);
      this.audioManager.play('bossRoar');
    };

    this.boss.onDashTelegraph = (origin, targetPos) => {
      // Show warning line from boss to target
      this.enemyAbilityVisuals.showChargeWarning(origin, targetPos, 0.5);
      this.particleSystem.emit(origin, 15, 0xff4444, 1, 4, 0.3);
    };

    this.boss.onMeleeTelegraph = (origin, radius) => {
      // Show warning circle around boss
      this.enemyAbilityVisuals.showExplosionWarning(origin, radius, 0.5);
      this.particleSystem.emit(origin, 10, 0xff6600, 0.8, 3, 0.3);
    };
  }

  private setupPlayerAbilityCallbacks(): void {
    if (!this.player) return;

    this.player.setAbilityCallbacks({
      onProjectileFire: (origin, direction, speed, damage, color, count) => {
        // Fire projectiles (supports multi-shot)
        const spreadAngle = 0.1; // Radians spread for multi-shot

        for (let i = 0; i < count; i++) {
          // Reuse cached vectors to avoid per-projectile allocations
          this.tempSpreadDir.copy(direction);

          if (count > 1) {
            // Spread projectiles evenly
            const offsetAngle = (i - (count - 1) / 2) * spreadAngle;
            this.tempSpreadDir.applyAxisAngle(Game.UP_AXIS, offsetAngle);
          }

          // Copy origin for each projectile (projectile system may modify it)
          this.tempOrigin.copy(origin);

          this.projectileSystem.fire(
            this.tempOrigin,
            this.tempSpreadDir,
            speed,
            true,
            damage,
            (hitBody) => this.onProjectileHit(hitBody, origin)
          );
        }

        // Effects
        if (!this.lowPowerMode) {
          this.particleSystem.emit(origin, 5, color, 0.3, 3, 0.2);
        }
        this.audioManager.play('shoot');
      },

      onAOEExecute: (center, radius, damage, color) => {
        // Damage all enemies in radius with knockback from center
        // Cache position once per enemy to avoid redundant allocations
        for (const enemy of this.enemies) {
          const enemyPos = enemy.getPosition();
          const dist = enemyPos.distanceTo(center);
          if (dist <= radius && enemy.takeDamage(damage, center, 8)) {
            this.particleSystem.emitHitSparks(enemyPos, color);
            this.audioManager.play('hit');
          }
        }

        // Damage boss if in radius
        if (this.boss && !this.boss.isDead()) {
          const bossPos = this.boss.getPosition();
          const dist = bossPos.distanceTo(center);
          if (dist <= radius && this.boss.takeDamage(damage)) {
            this.particleSystem.emitHitSparks(bossPos, color);
            this.audioManager.play('hit');
          }
        }

        // AOE visual effect
        this.createAOEEffect(center, radius, color);
        this.screenShake.shake(0.2);
        this.audioManager.play('aoe');
      },

      onMeleeExecute: (position, range, damage) => {
        // Damage all enemies in melee range with knockback
        // Cache position once per enemy to avoid redundant allocations
        for (const enemy of this.enemies) {
          const enemyPos = enemy.getPosition();
          const dist = enemyPos.distanceTo(position);
          if (dist <= range && enemy.takeDamage(damage, position, 10)) {
            this.particleSystem.emitHitSparks(enemyPos, 0xff6600);
            this.audioManager.play('hit');
          }
        }

        // Damage boss if in range
        if (this.boss && !this.boss.isDead()) {
          const bossPos = this.boss.getPosition();
          const dist = bossPos.distanceTo(position);
          if (dist <= range && this.boss.takeDamage(damage)) {
            this.particleSystem.emitHitSparks(bossPos, 0xff6600);
            this.audioManager.play('hit');
          }
        }

        // Melee swing effect
        this.createMeleeEffect(position, range);
        this.screenShake.shake(0.25);
        this.audioManager.play('melee');
      },

      onTrapPlace: (trap) => {
        this.activeTraps.push(trap);
        this.createTrapVisual(trap);
        this.audioManager.play('trapPlace');
      },

      onBuffApply: (buff) => {
        this.activeBuffs.push(buff);
        this.createBuffEffect(buff);
        this.audioManager.play('buff');
      },

      onDashTrail: (position, color) => {
        // Emit trail particles during dash
        if (!this.lowPowerMode) {
          this.particleSystem.emit(position, 3, color, 0.2, 4, 0.15);
        }
      }
    });
  }

  private createAOEEffect(center: THREE.Vector3, radius: number, color: number): void {
    // Create expanding ring effect
    const geometry = new THREE.RingGeometry(0.1, radius, 32);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });

    const ring = new THREE.Mesh(geometry, material);
    ring.position.copy(center);
    ring.position.y += 0.1;
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);

    // Animate and remove
    let scale = 0;
    const animate = () => {
      scale += 0.15;
      ring.scale.setScalar(scale);
      material.opacity = Math.max(0, 0.8 - scale * 0.4);

      if (scale < 2) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(ring);
        geometry.dispose();
        material.dispose();
      }
    };
    animate();

    // Emit particles
    this.particleSystem.emit(center, 20, color, 1, 5, 0.5);
  }

  private createMeleeEffect(position: THREE.Vector3, range: number): void {
    // Create arc slash effect
    const geometry = new THREE.TorusGeometry(range * 0.7, 0.1, 4, 16, Math.PI);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.8
    });

    const arc = new THREE.Mesh(geometry, material);
    arc.position.copy(position);
    arc.position.y += 1;

    // Face player's direction
    if (this.player) {
      const dir = this.player.getShootDirection();
      arc.rotation.y = Math.atan2(dir.x, dir.z);
    }

    this.scene.add(arc);

    // Fade out and remove
    let opacity = 0.8;
    const fadeOut = () => {
      opacity -= 0.08;
      material.opacity = opacity;

      if (opacity > 0) {
        requestAnimationFrame(fadeOut);
      } else {
        this.scene.remove(arc);
        geometry.dispose();
        material.dispose();
      }
    };
    fadeOut();

    // Emit orange particles
    this.particleSystem.emit(position, 10, 0xff6600, 0.5, 4, 0.3);
  }

  private createTrapVisual(trap: TrapData): void {
    // Create glowing ground marker
    const geometry = new THREE.CylinderGeometry(trap.radius * 0.3, trap.radius * 0.4, 0.2, 16);
    const material = new THREE.MeshBasicMaterial({
      color: trap.color,
      transparent: true,
      opacity: 0.7
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(trap.position.x, trap.position.y + 0.1, trap.position.z);
    this.scene.add(mesh);

    this.trapMeshes.set(trap.id, mesh);
  }

  private createBuffEffect(buff: ActiveBuff): void {
    if (!this.player) return;

    // Create brief aura effect around player
    const pos = this.player.getPosition();
    let color = 0x4ade80; // Green for heals

    switch (buff.type) {
      case 'damage_reduction':
        color = 0x60a5fa; // Blue shield
        break;
      case 'speed_boost':
        color = 0xfbbf24; // Yellow speed
        break;
      case 'damage_boost':
        color = 0xef4444; // Red power
        break;
    }

    // Emit swirling particles
    this.particleSystem.emit(pos, 15, color, 0.5, 3, 0.4);
  }

  private updateTraps(delta: number): void {
    for (let i = this.activeTraps.length - 1; i >= 0; i--) {
      const trap = this.activeTraps[i];

      // Decrease remaining time
      trap.remainingTime -= delta;

      // Check if expired
      if (trap.remainingTime <= 0 || trap.triggered) {
        this.removeTrap(trap);
        this.activeTraps.splice(i, 1);
        continue;
      }

      // Check for enemy collision (reuse cached vector)
      this.tempTrapPos.set(trap.position.x, trap.position.y, trap.position.z);

      for (const enemy of this.enemies) {
        const dist = enemy.getPosition().distanceTo(this.tempTrapPos);
        if (dist <= trap.radius) {
          // Trigger trap!
          trap.triggered = true;
          this.triggerTrapExplosion(trap);
          break;
        }
      }

      // Also check boss
      if (!trap.triggered && this.boss && !this.boss.isDead()) {
        const dist = this.boss.getPosition().distanceTo(this.tempTrapPos);
        if (dist <= trap.radius) {
          trap.triggered = true;
          this.triggerTrapExplosion(trap);
        }
      }
    }
  }

  private triggerTrapExplosion(trap: TrapData): void {
    // Reuse cached vector for trap position
    this.tempTrapPos.set(trap.position.x, trap.position.y, trap.position.z);

    // Damage all enemies in radius with explosive knockback
    for (const enemy of this.enemies) {
      const dist = enemy.getPosition().distanceTo(this.tempTrapPos);
      if (dist <= trap.radius && enemy.takeDamage(trap.damage, this.tempTrapPos, 10)) {
        this.particleSystem.emitHitSparks(enemy.getPosition(), trap.color);
        this.audioManager.play('hit');
      }
    }

    // Damage boss if in radius
    if (this.boss && !this.boss.isDead()) {
      const dist = this.boss.getPosition().distanceTo(this.tempTrapPos);
      if (dist <= trap.radius && this.boss.takeDamage(trap.damage)) {
        this.particleSystem.emitHitSparks(this.boss.getPosition(), trap.color);
        this.audioManager.play('hit');
      }
    }

    // Explosion effect
    this.createAOEEffect(this.tempTrapPos.clone(), trap.radius, trap.color);
    this.screenShake.shake(0.3);
    this.audioManager.play('explosion');
  }

  private removeTrap(trap: TrapData): void {
    const mesh = this.trapMeshes.get(trap.id);
    if (mesh) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.trapMeshes.delete(trap.id);
    }
  }

  private startWave(index: number): void {
    if (!this.currentLevel || index >= this.currentLevel.enemyWaves.length) return;

    this.currentWaveIndex = index;
    const wave = this.currentLevel.enemyWaves[index];

    // Update UI with wave progress
    const totalWaves = this.currentLevel.enemyWaves.length;
    this.uiManager.updateWaveCounter(index + 1, totalWaves);

    // Show wave announcement as floating text
    this.damageNumbers.showTextAtScreen(
      window.innerWidth / 2,
      window.innerHeight * 0.25,
      `WAVE ${index + 1}`,
      'warning',
      1.0
    );

    // Schedule spawns
    this.pendingSpawns = wave.map((spawn) => ({
      spawn,
      timer: spawn.delay
    }));
  }

  private update(delta: number): void {
    // Always update input for pause handling
    this.inputManager.update();
    const input = this.inputManager.getState();

    // Check for pause toggle (Escape key)
    if (input.pause && (this.gameState === GameState.PLAYING || this.gameState === GameState.PAUSED)) {
      this.togglePause();
      return;
    }

    if (this.gameState !== GameState.PLAYING) return;
    if (!this.player || !this.currentLevel) return;

    const adjustedDelta = this.hitStop.update(delta);

    // Targeting (mobile tap detection)
    this.updateTargeting(input);
    this.updateTargetIndicator();

    // Apply speed multiplier from pickups and hazards
    this.player.setExternalSpeedMultiplier(this.getSpeedMultiplier());

    // Player
    this.player.update(adjustedDelta, input, this.camera);

    // Shooting
    if (input.shooting && this.player.canShoot()) {
      this.shoot();
    }

    // Secondary ability
    if (input.secondaryAbility && !this.secondaryAbilityCooldown) {
      if (this.player.useSecondaryAbility()) {
        this.secondaryAbilityCooldown = true;
        // Reset cooldown flag after brief delay to prevent spam
        setTimeout(() => { this.secondaryAbilityCooldown = false; }, 100);
      }
    }

    // Update traps
    this.updateTraps(adjustedDelta);

    // Update combo system
    this.comboSystem.update(adjustedDelta);

    // Update ability HUD (secondary ability cooldown)
    this.uiManager.updateAbilityCooldown(
      this.player.getSecondaryCooldownPercent()
    );

    // Boss
    if (this.boss && !this.boss.isDead()) {
      this.boss.update(adjustedDelta, this.player.getPosition());
      this.uiManager.updateBossHealth(this.boss.getHealthPercent());
      this.checkBossAttacks();

      // Player dash hit detection for boss
      const bossDist = this.boss.getPosition().distanceTo(this.player.getPosition());
      if (this.player.getIsDashing() && bossDist < 2.5) {
        const dashDamage = this.player.getDashDamage();
        if (dashDamage > 0 && this.boss.takeDamage(dashDamage)) {
          const bossPos = this.boss.getPosition();
          this.particleSystem.emit(bossPos, 20, 0xff6600, 1.5, 8, 0.4);
          this.particleSystem.emit(bossPos, 10, 0xffffff, 0.8, 5, 0.3);
          this.screenShake.shake(0.25);
          this.audioManager.play('hit');
          this.damageNumbers.show(bossPos, dashDamage, 'critical');
        }
      }
    }

    // Wave spawning
    this.updateWaveSpawns(delta);

    // Enemies
    this.updateEnemies(adjustedDelta);

    // Enemy instancing update (handles matrix/color buffer updates)
    this.enemyInstancing.update(adjustedDelta);

    // Pickups
    this.pickupSystem.update(adjustedDelta, this.player.getPosition());

    // Update pickup buffs (decrement timers)
    this.updatePickupBuffs(adjustedDelta);

    // Environmental hazards
    this.hazardSystem.update(adjustedDelta, this.player.getPosition());

    // Enemy ability visuals
    this.enemyAbilityVisuals.update(adjustedDelta);

    // Check level completion
    this.checkLevelCompletion();

    // Effects
    this.projectileSystem.update(adjustedDelta);
    this.particleSystem.update(adjustedDelta);
    this.impactVortex.update(adjustedDelta);
    this.screenShake.update(adjustedDelta, this.camera);

    // Update skybox time for animated effects (stars twinkling)
    this.skyTime += adjustedDelta;
    this.updateSkyboxTime();

    // LOD
    if (this.worldGenerator) {
      this.worldGenerator.updateLOD(this.camera.position);
    }

    // UI
    this.uiManager.updateFps(this.gameLoop.getFps());

    // Proximity indicators for off-screen threats
    this.updateProximityIndicators();

    // Danger warning (pulsing hearts when threats nearby)
    this.updateDangerWarning(delta);

    // Update minimap with current positions
    this.updateMinimap();

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
      // Show wave clear message when timer starts (only once)
      if (this.waveTimer === 0 && this.currentWaveIndex < this.currentLevel.enemyWaves.length - 1) {
        this.damageNumbers.showTextAtScreen(
          window.innerWidth / 2,
          window.innerHeight * 0.3,
          'WAVE CLEAR!',
          'combo',
          0.8
        );
      }

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

    let enemy: Enemy;

    switch (spawn.type) {
      case 'bomber':
        const bomber = new SuicideBomber(this.scene, this.physicsWorld.getWorld(), position);
        bomber.onExplode = (pos, radius, _damage) => {
          // Show explosion warning ring before the actual explosion
          this.enemyAbilityVisuals.showExplosionWarning(pos, radius, 0.3);
        };
        enemy = bomber;
        break;
      case 'shooter':
        const shooter = new Shooter(this.scene, this.physicsWorld.getWorld(), position);
        shooter.onShoot = (origin, direction, speed, damage) => {
          this.projectileSystem.fire(origin, direction, speed, false, damage, (hitBody) => {
            if (this.player && hitBody === this.player.getBody()) {
              this.damagePlayer(damage);
            }
          });
          this.particleSystem.emit(origin, 3, 0xf59e0b, 0.2, 2, 0.15);
          this.audioManager.play('shoot');
        };
        enemy = shooter;
        break;
      case 'tank':
        const tank = new Tank(this.scene, this.physicsWorld.getWorld(), position);
        tank.onChargeStart = (startPos, endPos) => {
          // Show charge warning line
          this.enemyAbilityVisuals.showChargeWarning(startPos, endPos, 0.4);
        };
        enemy = tank;
        break;
      case 'speeder':
        enemy = new Speeder(this.scene, this.physicsWorld.getWorld(), position);
        break;
      case 'healer':
        const healer = new Healer(this.scene, this.physicsWorld.getWorld(), position, () => this.enemies);
        healer.onHeal = (pos, radius) => {
          // Show healing pulse aura
          this.enemyAbilityVisuals.showHealingPulse(pos, radius, 0.8);
          this.particleSystem.emit(pos, 10, 0x4ade80, 0.5, 4, 0.3);
        };
        enemy = healer;
        break;
      case 'shielder':
        const shielder = new Shielder(this.scene, this.physicsWorld.getWorld(), position);
        shielder.onShieldAbsorb = (pos) => {
          // Show shield absorb flash
          this.enemyAbilityVisuals.showShieldAbsorb(pos);
        };
        enemy = shielder;
        break;
      case 'minion':
      default:
        enemy = new Enemy(this.scene, this.physicsWorld.getWorld(), position);
        break;
    }

    // Set terrain height getter for proper terrain following
    if (this.worldGenerator) {
      enemy.setTerrainHeightGetter((x, z) => this.worldGenerator!.getHeightAt(x, z));
    }

    // Enable instancing for basic enemies (reduces draw calls significantly)
    if (enemy.supportsInstancing()) {
      enemy.setUseInstancing(true, this.getInstancingCallbacks());
    }

    // Wire up knockback callback for visual feedback
    enemy.onKnockback = (pos, _dir, force) => {
      // Emit impact particles at hit position
      if (!this.lowPowerMode) {
        const particleCount = Math.min(Math.ceil(force), 10);
        this.particleSystem.emit(pos, particleCount, 0xffffff, 0.3, force * 0.5, 0.2);
      }
    };

    // Register enemy for health bar tracking
    const healthBarId = this.enemyHealthBars.registerEnemy(enemy.getMaxHealth());
    this.enemyHealthBarIds.set(enemy, healthBarId);

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

    // Store target direction for ability callback to use
    this.updateShootDirectionForTarget();

    // Fire via ability system (handled by onProjectileFire callback)
    this.player.shoot();
    this.storageManager.recordShot(false);
  }

  /**
   * Updates the player's shoot direction to aim at targeted enemy
   */
  private updateShootDirectionForTarget(): void {
    if (!this.player) return;

    // If we have a target, override the shoot direction
    if (this.targetedEnemy && !this.targetedEnemy.isDead()) {
      const orbPos = this.player.getOrbPosition();
      const targetPos = this.targetedEnemy.getPosition();
      // Reuse tempDirection to avoid per-frame allocation
      this.tempDirection.subVectors(targetPos, orbPos).normalize();
      this.player.setTargetDirection(this.tempDirection);
    } else {
      this.player.setTargetDirection(null);
    }
  }

  private createTargetIndicator(): void {
    const geometry = new THREE.RingGeometry(0.8, 1.2, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    this.targetIndicator = new THREE.Mesh(geometry, material);
    this.targetIndicator.rotation.x = -Math.PI / 2; // Lay flat
    this.targetIndicator.visible = false;
    this.scene.add(this.targetIndicator);
  }

  private updateTargeting(input: InputState): void {
    if (!this.camera || !this.player) return;

    // Clear target on Escape
    if (input.clearTarget) {
      this.targetedEnemy = null;
      return;
    }

    // Cycle target on Tab (desktop) - only trigger once per press
    if (input.cycleTarget && !this.targetCyclePressed) {
      this.targetCyclePressed = true;
      this.cycleToNextTarget();
      return;
    } else if (!input.cycleTarget) {
      this.targetCyclePressed = false;
    }

    // Mobile tap targeting
    if (input.targetScreenX && input.targetScreenY) {
      // Convert screen coordinates to normalized device coordinates (-1 to +1)
      // Reuse cached objects to avoid per-tap allocations
      this.targetMouse.x = (input.targetScreenX / window.innerWidth) * 2 - 1;
      this.targetMouse.y = -(input.targetScreenY / window.innerHeight) * 2 + 1;

      this.targetRaycaster.setFromCamera(this.targetMouse, this.camera);

      // Check for intersections with enemies
      let closestEnemy: Enemy | null = null;
      let closestDistance = Infinity;

      for (const enemy of this.enemies) {
        if (enemy.isDead()) continue;
        const enemyPos = enemy.getPosition();
        const distance = this.targetRaycaster.ray.distanceToPoint(enemyPos);

        // If ray is close enough to enemy (within 2 units)
        if (distance < 2 && distance < closestDistance) {
          closestDistance = distance;
          closestEnemy = enemy;
        }
      }

      // Update targeted enemy
      if (closestEnemy) {
        this.targetedEnemy = closestEnemy;
      }
    }
  }

  private cycleToNextTarget(): void {
    if (!this.player) return;

    const playerPos = this.player.getPosition();

    // Get all living enemies sorted by distance
    const livingEnemies = this.enemies
      .filter(e => !e.isDead())
      .sort((a, b) => {
        const distA = a.getPosition().distanceTo(playerPos);
        const distB = b.getPosition().distanceTo(playerPos);
        return distA - distB;
      });

    // Also consider boss
    if (this.boss && !this.boss.isDead()) {
      // Add boss to potential targets if close enough
      const bossPos = this.boss.getPosition();
      const bossDist = bossPos.distanceTo(playerPos);
      if (bossDist < 50) {
        // Insert boss into sorted position
        // For simplicity, just check if boss should be targeted
      }
    }

    if (livingEnemies.length === 0) {
      // No enemies, target boss if exists
      if (this.boss && !this.boss.isDead()) {
        this.targetedEnemy = null; // Boss targeting handled separately
      }
      return;
    }

    // Find current target's index
    const currentIndex = this.targetedEnemy
      ? livingEnemies.indexOf(this.targetedEnemy)
      : -1;

    // Cycle to next target
    const nextIndex = (currentIndex + 1) % livingEnemies.length;
    this.targetedEnemy = livingEnemies[nextIndex];
  }

  private updateTargetIndicator(): void {
    if (!this.targetIndicator) return;

    if (this.targetedEnemy && !this.targetedEnemy.isDead()) {
      const pos = this.targetedEnemy.getPosition();
      this.targetIndicator.position.set(pos.x, pos.y + 0.1, pos.z);
      this.targetIndicator.visible = true;

      // Pulse effect
      const time = Date.now() * 0.003;
      this.targetIndicator.scale.setScalar(1 + Math.sin(time) * 0.2);
    } else {
      this.targetIndicator.visible = false;
      this.targetedEnemy = null;
    }
  }

  private onProjectileHit(hitBody: unknown, hitPos: THREE.Vector3): void {
    // Get combo multiplier for damage display
    const comboState = this.comboSystem.getState();
    const isComboActive = comboState.isActive && comboState.multiplier >= 1.5;

    // Get pickup damage buff multiplier
    const pickupDamageMultiplier = this.getDamageMultiplier();
    const baseDamage = Math.ceil(1 * pickupDamageMultiplier);
    const hasDamageBuff = pickupDamageMultiplier > 1;

    // Determine if this is a critical hit (combo active or damage buff)
    const isCritical = isComboActive || hasDamageBuff;

    // Boss hit
    if (this.boss && hitBody === this.boss.getBody()) {
      if (this.boss.takeDamage(baseDamage)) {
        this.storageManager.incrementStat('shotsHit');

        // Impact vortex for satisfying hit feedback
        if (!this.lowPowerMode) {
          this.impactVortex.spawn(hitPos, isCritical);
        }

        // Enhanced feedback for critical hits
        if (isCritical) {
          this.particleSystem.emitCriticalBurst(hitPos);
          this.screenShake.shake(0.35);
          this.hitStop.trigger(0.08);
          this.audioManager.play('criticalHit');
        } else {
          this.particleSystem.emitHitSparks(hitPos, 0xa855f7);
          this.screenShake.shake(0.15);
          this.audioManager.play('hit');
        }

        // Show damage number (combo + pickup buff display)
        const displayDamage = isComboActive ? comboState.multiplier * baseDamage : baseDamage;
        this.damageNumbers.show(
          this.boss.getPosition(),
          displayDamage,
          isCritical ? 'critical' : 'normal',
          isCritical
        );
      }
      return;
    }

    // Enemy hit
    for (const enemy of this.enemies) {
      if (hitBody === enemy.getBody()) {
        // Pass hit position as knockback source for visual feedback
        if (enemy.takeDamage(baseDamage, hitPos, 6)) {
          this.storageManager.incrementStat('shotsHit');

          // Impact vortex for satisfying hit feedback
          if (!this.lowPowerMode) {
            this.impactVortex.spawn(hitPos, isCritical);
          }

          // Enhanced feedback for critical hits
          if (isCritical) {
            this.particleSystem.emitCriticalBurst(enemy.getPosition());
            this.screenShake.shake(0.25);
            this.hitStop.trigger(0.06);
            this.audioManager.play('criticalHit');
          } else {
            this.particleSystem.emitHitSparks(enemy.getPosition(), 0xa855f7);
            this.audioManager.play('hit');
          }

          // Show damage number
          const displayDamage = isComboActive ? comboState.multiplier * baseDamage : baseDamage;
          this.damageNumbers.show(
            enemy.getPosition(),
            displayDamage,
            isCritical ? 'critical' : 'normal',
            isCritical
          );
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

    // Update frustum once per frame for culling (reuse matrix to avoid GC)
    this.camera.updateMatrixWorld();
    this.frustumMatrix.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    // Increment shared frame counter for visibility checks
    Enemy.incrementFrameCounter();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      if (enemy.isDead()) {
        // Register kill with combo system
        const comboMultiplier = this.comboSystem.registerKill();

        // Determine coin amount based on enemy type
        const deathPos = enemy.getPosition();
        let coinAmount = 1;
        if (enemy instanceof Tank) coinAmount = 3;
        else if (enemy instanceof Shooter) coinAmount = 2;
        else if (enemy instanceof Healer) coinAmount = 3;
        else if (enemy instanceof Shielder) coinAmount = 2;

        // Bonus coins for combo kills
        coinAmount = Math.floor(coinAmount * comboMultiplier);

        // Spawn coins and potential power-up
        this.pickupSystem.spawnFromEnemyDeath(deathPos, coinAmount);

        // More particles for combo kills
        this.particleSystem.emitExplosion(deathPos, 0xa855f7);
        if (comboMultiplier >= 2) {
          // Extra gold particles for high combos
          this.particleSystem.emit(deathPos, 20, 0xfbbf24, 2, 6, 0.6);
        }

        // Remove health bar for this enemy
        const healthBarId = this.enemyHealthBarIds.get(enemy);
        if (healthBarId !== undefined) {
          this.enemyHealthBars.removeEnemy(healthBarId);
          this.enemyHealthBarIds.delete(enemy);
        }

        this.audioManager.play('enemyDeath');
        this.storageManager.recordKill();
        enemy.dispose(this.scene, this.physicsWorld.getWorld());
        this.enemies.splice(i, 1);
        continue;
      }

      // Update frustum visibility (cached, only recalculates every 3 frames)
      enemy.updateVisibility(this.frustum);

      enemy.update(delta, playerPos);

      // Collision with player
      const dist = enemy.getPosition().distanceTo(playerPos);
      if (dist < 1.5) {
        this.damagePlayer(enemy.getDamage());
        if (enemy instanceof SuicideBomber) {
          enemy.takeDamage(10);
        }
      }

      // Player dash hit detection - damage enemies player passes through while dashing
      if (this.player.getIsDashing() && dist < 1.8) {
        const dashDamage = this.player.getDashDamage();
        // Knockback from player position with strong force (dash impact)
        if (dashDamage > 0 && enemy.takeDamage(dashDamage, playerPos, 12)) {
          // Visual feedback for dash hit
          const enemyPos = enemy.getPosition();
          this.particleSystem.emit(enemyPos, 15, 0xff6600, 1, 6, 0.3);
          this.particleSystem.emit(enemyPos, 8, 0xffffff, 0.5, 4, 0.2);
          this.screenShake.shake(0.15);
          this.audioManager.play('hit');
          this.damageNumbers.show(enemyPos, dashDamage, 'critical');
        }
      }
    }
  }

  private updateProximityIndicators(): void {
    if (!this.player) return;

    const playerPos = this.player.getPosition();
    const cameraYaw = this.player.getAimYaw();

    // Collect threats for proximity display
    const threats: Array<{ id: string; x: number; z: number; type: 'enemy' | 'boss' | 'pickup' }> = [];

    // Add enemies
    for (const enemy of this.enemies) {
      if (enemy.isDead()) continue;
      const pos = enemy.getPosition();
      threats.push({
        id: enemy.getInstanceId(),
        x: pos.x,
        z: pos.z,
        type: 'enemy'
      });
    }

    // Add boss
    if (this.boss && !this.boss.isDead()) {
      const bossPos = this.boss.getPosition();
      threats.push({
        id: 'boss',
        x: bossPos.x,
        z: bossPos.z,
        type: 'boss'
      });
    }

    // Update UI
    this.uiManager.updateProximityIndicators(
      threats,
      playerPos.x,
      playerPos.z,
      cameraYaw
    );
  }

  /**
   * Calculate danger level based on nearby threats and update UI warning.
   * Level 0 = safe, 1 = moderate, 2 = high, 3 = critical
   */
  private updateDangerWarning(delta: number): void {
    if (!this.player) return;

    this.dangerWarningCooldown = Math.max(0, this.dangerWarningCooldown - delta);

    const playerPos = this.player.getPosition();
    const playerHealth = this.player.getHealth();
    let dangerLevel = 0;

    // Check nearby enemies
    let nearbyThreats = 0;
    let closestThreatDist = Infinity;

    for (const enemy of this.enemies) {
      if (enemy.isDead()) continue;
      const dist = enemy.getPosition().distanceTo(playerPos);

      if (dist < 15) {
        nearbyThreats++;
        closestThreatDist = Math.min(closestThreatDist, dist);
      }
    }

    // Check boss proximity
    if (this.boss && !this.boss.isDead()) {
      const bossDist = this.boss.getPosition().distanceTo(playerPos);
      if (bossDist < 20) {
        nearbyThreats += 2; // Boss counts as 2 threats
        closestThreatDist = Math.min(closestThreatDist, bossDist);
      }
    }

    // Check hazard proximity (ice, lava, spikes)
    const inHazard = this.hazardSlowFactor < 1; // Slowed = in hazard
    if (inHazard) {
      dangerLevel += 1;
    }

    // Calculate danger based on threat count and distance
    if (nearbyThreats >= 5 || closestThreatDist < 3) {
      dangerLevel += 3;
    } else if (nearbyThreats >= 3 || closestThreatDist < 6) {
      dangerLevel += 2;
    } else if (nearbyThreats >= 1 || closestThreatDist < 10) {
      dangerLevel += 1;
    }

    // Cap at 3
    dangerLevel = Math.min(3, dangerLevel);

    // Update UI
    this.uiManager.updateDangerLevel(dangerLevel, playerHealth);

    // Play warning sound when danger spikes and player is low health
    if (dangerLevel >= 2 && this.lastDangerLevel < 2 &&
        playerHealth <= 1 && this.dangerWarningCooldown <= 0) {
      this.audioManager.play('playerHurt'); // Reuse hurt sound as warning
      this.dangerWarningCooldown = 3; // Don't spam the sound
    }

    this.lastDangerLevel = dangerLevel;
  }

  private updateMinimap(): void {
    if (!this.minimap || !this.player) return;

    const playerPos = this.player.getPosition();
    const playerRot = this.player.getAimYaw();

    // Collect enemy positions
    const enemyPositions: Array<{ x: number; z: number }> = [];
    for (const enemy of this.enemies) {
      if (enemy.isDead()) continue;
      const pos = enemy.getPosition();
      enemyPositions.push({ x: pos.x, z: pos.z });
    }

    // Get boss position if exists
    let bossPos: { x: number; z: number } | null = null;
    if (this.boss && !this.boss.isDead()) {
      const pos = this.boss.getPosition();
      bossPos = { x: pos.x, z: pos.z };
    }

    // Update minimap (internally throttled to 10fps)
    this.minimap.update(
      { x: playerPos.x, z: playerPos.z },
      playerRot,
      enemyPositions,
      bossPos
    );
  }

  private updatePickupBuffs(delta: number): void {
    for (let i = this.pickupBuffs.length - 1; i >= 0; i--) {
      this.pickupBuffs[i].remaining -= delta;

      if (this.pickupBuffs[i].remaining <= 0) {
        // Shield buff expired
        if (this.pickupBuffs[i].type === PickupType.SHIELD) {
          this.hasShieldBuff = false;
        }
        this.pickupBuffs.splice(i, 1);
      }
    }
  }

  /**
   * Get current damage multiplier from pickup buffs
   */
  private getDamageMultiplier(): number {
    let multiplier = 1;
    for (const buff of this.pickupBuffs) {
      if (buff.type === PickupType.DAMAGE_BOOST) {
        multiplier *= buff.value;
      }
    }
    return multiplier;
  }

  /**
   * Get current speed multiplier from pickup buffs and hazard effects
   */
  getSpeedMultiplier(): number {
    let multiplier = 1;
    for (const buff of this.pickupBuffs) {
      if (buff.type === PickupType.SPEED_BOOST) {
        multiplier *= buff.value;
      }
    }
    // Apply hazard slow (e.g., ice patches)
    multiplier *= this.hazardSlowFactor;
    return multiplier;
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

    // Shield buff absorbs the hit completely
    if (this.hasShieldBuff) {
      this.hasShieldBuff = false;
      // Remove shield buff from active buffs
      const shieldIdx = this.pickupBuffs.findIndex(b => b.type === PickupType.SHIELD);
      if (shieldIdx >= 0) {
        this.pickupBuffs.splice(shieldIdx, 1);
      }
      // Shield break effect
      this.particleSystem.emit(this.player.getPosition(), 25, 0x3b82f6, 1, 6, 0.5);
      this.audioManager.play('shieldBreak');
      this.screenShake.shake(0.2);
      this.damageNumbers.showText(this.player.getPosition(), 'BLOCKED!', 'block');
      return;
    }

    if (this.player.takeDamage(amount)) {
      this.uiManager.updateHearts(this.player.getHealth(), this.player.getMaxHealth());
      this.uiManager.showDamageFlash();
      this.screenShake.shake(0.3);
      this.audioManager.playWithVibration('playerHurt', [50, 30, 50]);
      this.hitStop.trigger(0.1);
      this.damageNumbers.show(this.player.getPosition(), amount, 'critical');

      // Update health vignette effect
      this.healthVignette.update(this.player.getHealth(), this.player.getMaxHealth());
      this.healthVignette.flash();

      if (this.player.getIsDead()) {
        this.onPlayerDeath();
      }
    }
  }

  /**
   * Damage player from a specific source position (shows directional indicator)
   */
  private damagePlayerFromSource(amount: number, sourcePos: THREE.Vector3): void {
    if (!this.player) return;

    const playerPos = this.player.getPosition();

    // Calculate direction from player to damage source
    const direction = {
      x: sourcePos.x - playerPos.x,
      z: sourcePos.z - playerPos.z
    };

    // Normalize
    const len = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
    if (len > 0) {
      direction.x /= len;
      direction.z /= len;
    }

    // Show directional indicator
    this.uiManager.showDamageIndicator(direction, amount);

    // Apply damage
    this.damagePlayer(amount);
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

    // Check for class unlocks
    const newlyUnlocked = this.storageManager.checkClassUnlocks();
    for (const classId of newlyUnlocked) {
      const unlockedClass = getClassById(classId);
      if (unlockedClass) {
        this.uiManager.showUnlockNotification(unlockedClass, () => {
          // Notification dismissed
        });
      }
    }

    // Show completion message
    this.uiManager.setObjective('Level Complete! Loading next level...', true);

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

    // Check for class unlocks after boss defeat
    const newlyUnlocked = this.storageManager.checkClassUnlocks();
    for (const classId of newlyUnlocked) {
      const unlockedClass = getClassById(classId);
      if (unlockedClass) {
        this.uiManager.showUnlockNotification(unlockedClass, () => {
          // Notification dismissed
        });
      }
    }

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

    // Reset render info for next frame (manual reset for performance tracking)
    if (this.renderer.info.autoReset === false) {
      this.renderer.info.reset();
    }
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
    this.healthVignette.dispose();
    this.impactVortex.dispose();
    this.pickupSystem.dispose();
    this.enemyInstancing.dispose();
    this.hazardSystem.dispose();
    this.enemyAbilityVisuals.dispose();
    this.renderer.dispose();
  }
}

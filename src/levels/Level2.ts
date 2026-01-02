import * as THREE from 'three';
import { LevelConfig, DEFAULT_LEVEL_CONFIG, HazardType } from './LevelConfig';

// Level 2: Forest Expedition
// Larger exploration area with gem collection
export const Level2: LevelConfig = {
  ...DEFAULT_LEVEL_CONFIG as LevelConfig,

  id: 'level2',
  name: 'Mystic Forest',
  description: 'Explore and collect magical gems',

  // Larger exploration world
  worldSize: 80,
  worldSeed: 202,
  heightScale: 8,
  waterLevel: 0,
  treeChance: 0.05,

  // Player starts at edge
  playerSpawn: new THREE.Vector3(-30, 5, -30),

  // No boss yet
  bossSpawn: null,
  bossEnabled: false,

  // Varied enemy waves - 6 waves with ~50 total enemies for full combo/kill streak testing
  enemyWaves: [
    // Wave 1: Warm-up (8 enemies)
    [
      { type: 'minion', position: new THREE.Vector3(0, 3, 15), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(10, 3, 10), delay: 0.3 },
      { type: 'minion', position: new THREE.Vector3(-10, 3, 10), delay: 0.6 },
      { type: 'speeder', position: new THREE.Vector3(15, 3, 0), delay: 0.9 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, 5), delay: 1.2 },
      { type: 'minion', position: new THREE.Vector3(5, 3, 20), delay: 1.5 },
      { type: 'speeder', position: new THREE.Vector3(-5, 3, 20), delay: 1.8 },
      { type: 'minion', position: new THREE.Vector3(0, 3, 25), delay: 2.1 }
    ],
    // Wave 2: Shooter introduction (9 enemies)
    [
      { type: 'shooter', position: new THREE.Vector3(25, 3, 0), delay: 0 },
      { type: 'shooter', position: new THREE.Vector3(-25, 3, 0), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(0, 3, 20), delay: 0.3 },
      { type: 'minion', position: new THREE.Vector3(10, 3, 15), delay: 0.6 },
      { type: 'minion', position: new THREE.Vector3(-10, 3, 15), delay: 0.9 },
      { type: 'speeder', position: new THREE.Vector3(0, 3, -20), delay: 1.2 },
      { type: 'speeder', position: new THREE.Vector3(15, 3, -10), delay: 1.5 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, -10), delay: 1.8 },
      { type: 'shooter', position: new THREE.Vector3(0, 3, 30), delay: 2.1 }
    ],
    // Wave 3: Tank with healer support (8 enemies)
    [
      { type: 'tank', position: new THREE.Vector3(0, 3, 25), delay: 0 },
      { type: 'healer', position: new THREE.Vector3(5, 3, 20), delay: 0.5 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, 15), delay: 0.8 },
      { type: 'minion', position: new THREE.Vector3(15, 3, 15), delay: 1.1 },
      { type: 'minion', position: new THREE.Vector3(-20, 3, 10), delay: 1.4 },
      { type: 'minion', position: new THREE.Vector3(20, 3, 10), delay: 1.7 },
      { type: 'speeder', position: new THREE.Vector3(0, 3, -15), delay: 2.0 },
      { type: 'bomber', position: new THREE.Vector3(10, 3, -20), delay: 2.3 }
    ],
    // Wave 4: Shielder defense (10 enemies - enables "MONSTER KILL!")
    [
      { type: 'shielder', position: new THREE.Vector3(15, 3, 0), delay: 0 },
      { type: 'shielder', position: new THREE.Vector3(-15, 3, 0), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(10, 3, 10), delay: 0.3 },
      { type: 'minion', position: new THREE.Vector3(-10, 3, 10), delay: 0.5 },
      { type: 'bomber', position: new THREE.Vector3(0, 3, 15), delay: 0.7 },
      { type: 'bomber', position: new THREE.Vector3(5, 3, -15), delay: 0.9 },
      { type: 'speeder', position: new THREE.Vector3(20, 3, 20), delay: 1.1 },
      { type: 'speeder', position: new THREE.Vector3(-20, 3, 20), delay: 1.3 },
      { type: 'minion', position: new THREE.Vector3(0, 3, 25), delay: 1.5 },
      { type: 'minion', position: new THREE.Vector3(0, 3, -25), delay: 1.7 }
    ],
    // Wave 5: Mixed assault (10 enemies)
    [
      { type: 'tank', position: new THREE.Vector3(0, 3, 0), delay: 0 },
      { type: 'shooter', position: new THREE.Vector3(20, 3, 10), delay: 0.3 },
      { type: 'shooter', position: new THREE.Vector3(-20, 3, 10), delay: 0.5 },
      { type: 'healer', position: new THREE.Vector3(0, 3, -15), delay: 0.7 },
      { type: 'speeder', position: new THREE.Vector3(25, 3, -10), delay: 0.9 },
      { type: 'speeder', position: new THREE.Vector3(-25, 3, -10), delay: 1.1 },
      { type: 'minion', position: new THREE.Vector3(15, 3, 20), delay: 1.3 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, 20), delay: 1.5 },
      { type: 'bomber', position: new THREE.Vector3(10, 3, 25), delay: 1.7 },
      { type: 'bomber', position: new THREE.Vector3(-10, 3, 25), delay: 1.9 }
    ],
    // Wave 6: Final chaos (12 enemies - "LEGENDARY!" possible if fast enough)
    [
      { type: 'tank', position: new THREE.Vector3(15, 3, 15), delay: 0 },
      { type: 'tank', position: new THREE.Vector3(-15, 3, 15), delay: 0 },
      { type: 'shielder', position: new THREE.Vector3(0, 3, 20), delay: 0.2 },
      { type: 'healer', position: new THREE.Vector3(5, 3, 25), delay: 0.4 },
      { type: 'shooter', position: new THREE.Vector3(25, 3, 0), delay: 0.6 },
      { type: 'shooter', position: new THREE.Vector3(-25, 3, 0), delay: 0.8 },
      { type: 'speeder', position: new THREE.Vector3(20, 3, -15), delay: 1.0 },
      { type: 'speeder', position: new THREE.Vector3(-20, 3, -15), delay: 1.2 },
      { type: 'speeder', position: new THREE.Vector3(0, 3, -20), delay: 1.4 },
      { type: 'bomber', position: new THREE.Vector3(10, 3, -10), delay: 1.6 },
      { type: 'bomber', position: new THREE.Vector3(-10, 3, -10), delay: 1.8 },
      { type: 'minion', position: new THREE.Vector3(0, 3, 30), delay: 2.0 }
    ]
  ],
  waveCooldown: 5, // Faster waves to maintain combo

  // Power-ups scattered around
  powerUps: [
    { type: 'health', position: new THREE.Vector3(20, 2, 20) },
    { type: 'speed', position: new THREE.Vector3(-20, 2, 20) },
    { type: 'damage', position: new THREE.Vector3(20, 2, -20) },
    { type: 'health', position: new THREE.Vector3(-20, 2, -20) }
  ],

  // Environmental hazards
  hazards: [
    // Ice patches in the forest - slow player movement
    { type: HazardType.ICE, position: { x: 10, y: 0, z: 10 }, radius: 3, slowFactor: 0.5 },
    { type: HazardType.ICE, position: { x: -15, y: 0, z: 5 }, radius: 2.5, slowFactor: 0.5 },

    // Lava pools near the center - deal damage over time
    { type: HazardType.LAVA, position: { x: 5, y: 0, z: -10 }, radius: 2, damage: 1, damageRate: 0.8 },
    { type: HazardType.LAVA, position: { x: -8, y: 0, z: -8 }, radius: 1.5, damage: 1, damageRate: 0.8 },

    // Spike traps guarding paths
    { type: HazardType.SPIKES, position: { x: 15, y: 0, z: 0 }, radius: 1.5, damage: 2, cooldown: 3 },
    { type: HazardType.SPIKES, position: { x: -10, y: 0, z: 15 }, radius: 1.5, damage: 2, cooldown: 3 }
  ],

  // Mystical forest atmosphere
  fogNear: 30,
  fogFar: 120,
  fogColor: 0x5a8f5a,
  skyTopColor: 0x2d5a27,
  skyBottomColor: 0x87ab87,
  ambientIntensity: 0.3,
  sunIntensity: 0.8,

  // Win by surviving all waves
  winCondition: 'survive_waves',
  timeLimit: 0
};

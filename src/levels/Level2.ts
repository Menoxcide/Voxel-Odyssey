import * as THREE from 'three';
import { LevelConfig, DEFAULT_LEVEL_CONFIG } from './LevelConfig';

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

  // Varied enemy waves with new types
  enemyWaves: [
    // Wave 1: Basic introduction
    [
      { type: 'minion', position: new THREE.Vector3(0, 3, 0), delay: 2 },
      { type: 'minion', position: new THREE.Vector3(10, 3, 10), delay: 3 },
      { type: 'speeder', position: new THREE.Vector3(-10, 3, 10), delay: 4 }
    ],
    // Wave 2: Add shooters
    [
      { type: 'shooter', position: new THREE.Vector3(25, 3, 0), delay: 0 },
      { type: 'shooter', position: new THREE.Vector3(-25, 3, 0), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(0, 3, 20), delay: 2 },
      { type: 'speeder', position: new THREE.Vector3(0, 3, -20), delay: 2 }
    ],
    // Wave 3: Tank introduction with healer support
    [
      { type: 'tank', position: new THREE.Vector3(0, 3, 25), delay: 0 },
      { type: 'healer', position: new THREE.Vector3(5, 3, 20), delay: 1 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, 15), delay: 2 },
      { type: 'minion', position: new THREE.Vector3(15, 3, 15), delay: 2 }
    ],
    // Wave 4: Shielders and bombers
    [
      { type: 'shielder', position: new THREE.Vector3(15, 3, 0), delay: 0 },
      { type: 'shielder', position: new THREE.Vector3(-15, 3, 0), delay: 0 },
      { type: 'bomber', position: new THREE.Vector3(0, 3, 15), delay: 2 },
      { type: 'bomber', position: new THREE.Vector3(0, 3, -15), delay: 2 },
      { type: 'speeder', position: new THREE.Vector3(20, 3, 20), delay: 3 }
    ],
    // Wave 5: Full chaos
    [
      { type: 'tank', position: new THREE.Vector3(0, 3, 0), delay: 0 },
      { type: 'shooter', position: new THREE.Vector3(20, 3, 10), delay: 1 },
      { type: 'shooter', position: new THREE.Vector3(-20, 3, 10), delay: 1 },
      { type: 'healer', position: new THREE.Vector3(0, 3, -15), delay: 2 },
      { type: 'speeder', position: new THREE.Vector3(25, 3, -10), delay: 3 },
      { type: 'speeder', position: new THREE.Vector3(-25, 3, -10), delay: 3 },
      { type: 'bomber', position: new THREE.Vector3(10, 3, 25), delay: 4 }
    ]
  ],
  waveCooldown: 10,

  // Power-ups scattered around
  powerUps: [
    { type: 'health', position: new THREE.Vector3(20, 2, 20) },
    { type: 'speed', position: new THREE.Vector3(-20, 2, 20) },
    { type: 'damage', position: new THREE.Vector3(20, 2, -20) },
    { type: 'health', position: new THREE.Vector3(-20, 2, -20) }
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

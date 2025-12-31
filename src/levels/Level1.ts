import * as THREE from 'three';
import { LevelConfig, DEFAULT_LEVEL_CONFIG } from './LevelConfig';

// Level 1: Tutorial Arena
// Small arena with basic minions to learn controls
export const Level1: LevelConfig = {
  ...DEFAULT_LEVEL_CONFIG as LevelConfig,

  id: 'level1',
  name: 'Training Grounds',
  description: 'Learn the basics of combat',

  // Smaller world for tutorial
  worldSize: 48,
  worldSeed: 101,
  heightScale: 4,
  waterLevel: -2,
  treeChance: 0.02,

  // Player starts in center
  playerSpawn: new THREE.Vector3(0, 5, 0),

  // No boss in tutorial
  bossSpawn: null,
  bossEnabled: false,

  // Simple enemy waves
  enemyWaves: [
    // Wave 1: Single minion
    [
      { type: 'minion', position: new THREE.Vector3(10, 3, 10), delay: 2 }
    ],
    // Wave 2: Two minions
    [
      { type: 'minion', position: new THREE.Vector3(-10, 3, 10), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(10, 3, -10), delay: 1 }
    ],
    // Wave 3: Three minions + bomber
    [
      { type: 'minion', position: new THREE.Vector3(15, 3, 0), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, 0), delay: 0.5 },
      { type: 'minion', position: new THREE.Vector3(0, 3, 15), delay: 1 },
      { type: 'bomber', position: new THREE.Vector3(0, 3, -15), delay: 2 }
    ]
  ],
  waveCooldown: 8,

  // Health pickup
  powerUps: [
    { type: 'health', position: new THREE.Vector3(0, 2, 20) }
  ],

  // Bright, friendly atmosphere
  fogNear: 40,
  fogFar: 150,
  fogColor: 0x87ceeb,
  skyTopColor: 0x4a90e2,
  skyBottomColor: 0x87ceeb,
  ambientIntensity: 0.5,
  sunIntensity: 1.0,

  // Win by surviving all waves
  winCondition: 'survive_waves',
  timeLimit: 0
};

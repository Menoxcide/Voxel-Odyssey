import * as THREE from 'three';
import { LevelConfig, DEFAULT_LEVEL_CONFIG } from './LevelConfig';

// Level 1: Tutorial Arena
// Small arena with basic minions to learn controls
export const Level1: LevelConfig = {
  ...DEFAULT_LEVEL_CONFIG as LevelConfig,

  id: 'level1',
  name: 'Training Grounds',
  description: 'Learn the basics of combat',

  // Larger, flatter world for tutorial - better camera visibility
  worldSize: 64,
  worldSeed: 101,
  heightScale: 2,  // Flatter terrain for consistent movement
  waterLevel: -3,
  treeChance: 0.004,  // Very few trees to avoid camera obstruction

  // Player starts in center
  playerSpawn: new THREE.Vector3(0, 5, 0),

  // No boss in tutorial
  bossSpawn: null,
  bossEnabled: false,

  // Enemy waves - spread out for larger arena
  enemyWaves: [
    // Wave 1: Warm-up group (5 enemies) - spread around player
    [
      { type: 'minion', position: new THREE.Vector3(15, 3, 15), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, 15), delay: 0.3 },
      { type: 'minion', position: new THREE.Vector3(15, 3, -15), delay: 0.6 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, -15), delay: 0.9 },
      { type: 'speeder', position: new THREE.Vector3(0, 3, 20), delay: 1.2 }
    ],
    // Wave 2: Mixed group (7 enemies) - wider spread
    [
      { type: 'minion', position: new THREE.Vector3(20, 3, 0), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(-20, 3, 0), delay: 0.2 },
      { type: 'speeder', position: new THREE.Vector3(0, 3, 22), delay: 0.4 },
      { type: 'minion', position: new THREE.Vector3(18, 3, 18), delay: 0.6 },
      { type: 'minion', position: new THREE.Vector3(-18, 3, 18), delay: 0.8 },
      { type: 'shooter', position: new THREE.Vector3(25, 3, 0), delay: 1.0 },
      { type: 'minion', position: new THREE.Vector3(0, 3, -22), delay: 1.2 }
    ],
    // Wave 3: Swarm attack (10 enemies - enables "MONSTER KILL!")
    [
      { type: 'minion', position: new THREE.Vector3(14, 3, 14), delay: 0 },
      { type: 'minion', position: new THREE.Vector3(-14, 3, 14), delay: 0.15 },
      { type: 'minion', position: new THREE.Vector3(14, 3, -14), delay: 0.3 },
      { type: 'minion', position: new THREE.Vector3(-14, 3, -14), delay: 0.45 },
      { type: 'speeder', position: new THREE.Vector3(20, 3, 8), delay: 0.6 },
      { type: 'speeder', position: new THREE.Vector3(-20, 3, 8), delay: 0.75 },
      { type: 'minion', position: new THREE.Vector3(0, 3, 25), delay: 0.9 },
      { type: 'minion', position: new THREE.Vector3(8, 3, -25), delay: 1.05 },
      { type: 'bomber', position: new THREE.Vector3(-8, 3, -25), delay: 1.2 },
      { type: 'minion', position: new THREE.Vector3(0, 3, 10), delay: 1.5 }
    ],
    // Wave 4: Dangerous mix (8 enemies)
    [
      { type: 'shooter', position: new THREE.Vector3(25, 3, 0), delay: 0 },
      { type: 'shooter', position: new THREE.Vector3(-25, 3, 0), delay: 0.2 },
      { type: 'minion', position: new THREE.Vector3(15, 3, 15), delay: 0.4 },
      { type: 'minion', position: new THREE.Vector3(-15, 3, 15), delay: 0.6 },
      { type: 'bomber', position: new THREE.Vector3(0, 3, -20), delay: 0.8 },
      { type: 'bomber', position: new THREE.Vector3(8, 3, 20), delay: 1.0 },
      { type: 'speeder', position: new THREE.Vector3(-8, 3, 20), delay: 1.2 },
      { type: 'minion', position: new THREE.Vector3(0, 3, -28), delay: 1.5 }
    ]
  ],
  waveCooldown: 4, // Faster waves to maintain combo

  // Health pickup
  powerUps: [
    { type: 'health', position: new THREE.Vector3(0, 2, 20) }
  ],

  // Bright, friendly atmosphere - extended visibility for larger arena
  fogNear: 60,
  fogFar: 180,
  fogColor: 0x87ceeb,
  skyTopColor: 0x4a90e2,
  skyBottomColor: 0x87ceeb,
  ambientIntensity: 0.5,
  sunIntensity: 1.0,

  // Win by surviving all waves
  winCondition: 'survive_waves',
  timeLimit: 0
};

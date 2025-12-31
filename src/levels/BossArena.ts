import * as THREE from 'three';
import { LevelConfig, DEFAULT_LEVEL_CONFIG } from './LevelConfig';

// Boss Arena: Final Confrontation
// Enclosed arena with the Voxel Guardian
export const BossArena: LevelConfig = {
  ...DEFAULT_LEVEL_CONFIG as LevelConfig,

  id: 'boss_arena',
  name: 'Guardian\'s Domain',
  description: 'Face the Voxel Guardian',

  // Compact arena
  worldSize: 64,
  worldSeed: 999,
  heightScale: 3,
  waterLevel: -5, // No water
  treeChance: 0.01, // Few trees

  // Player starts at one end
  playerSpawn: new THREE.Vector3(0, 5, -25),

  // Boss in center
  bossSpawn: new THREE.Vector3(0, 5, 15),
  bossEnabled: true,

  // Boss handles enemy spawning
  enemyWaves: [],
  waveCooldown: 0,

  // Power-ups at edges
  powerUps: [
    { type: 'health', position: new THREE.Vector3(-25, 2, 0) },
    { type: 'health', position: new THREE.Vector3(25, 2, 0) }
  ],

  // Dark, ominous atmosphere
  fogNear: 20,
  fogFar: 80,
  fogColor: 0x1a1a2e,
  skyTopColor: 0x0f0f1a,
  skyBottomColor: 0x2d1f4e,
  ambientIntensity: 0.2,
  sunIntensity: 0.6,

  // Win by defeating boss
  winCondition: 'defeat_boss',
  timeLimit: 0
};

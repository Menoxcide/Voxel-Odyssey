import * as THREE from 'three';
import { HazardType, HazardConfig } from '../game/Hazard';

export type EnemyType = 'minion' | 'bomber' | 'shooter' | 'tank' | 'speeder' | 'healer' | 'shielder';

export interface EnemySpawn {
  type: EnemyType;
  position: THREE.Vector3;
  delay: number; // seconds after level start
}

export interface PowerUp {
  type: 'health' | 'speed' | 'damage';
  position: THREE.Vector3;
}

// Re-export for convenience
export { HazardType };
export type { HazardConfig };

export interface LevelConfig {
  id: string;
  name: string;
  description: string;

  // World generation
  worldSize: number;
  worldSeed: number;
  heightScale: number;
  waterLevel: number;
  treeChance: number;

  // Player spawn
  playerSpawn: THREE.Vector3;

  // Boss config (null for non-boss levels)
  bossSpawn: THREE.Vector3 | null;
  bossEnabled: boolean;

  // Enemy waves
  enemyWaves: EnemySpawn[][];
  waveCooldown: number; // seconds between waves

  // Powerups
  powerUps: PowerUp[];

  // Environmental hazards
  hazards: HazardConfig[];

  // Environment
  fogNear: number;
  fogFar: number;
  fogColor: number;
  skyTopColor: number;
  skyBottomColor: number;
  ambientIntensity: number;
  sunIntensity: number;

  // Win condition
  winCondition: 'defeat_boss' | 'survive_waves' | 'collect_gems';
  targetScore?: number;

  // Time limit (0 = no limit)
  timeLimit: number;
}

export const DEFAULT_LEVEL_CONFIG: Partial<LevelConfig> = {
  worldSize: 64,
  heightScale: 6,
  waterLevel: -1,
  treeChance: 0.03,
  waveCooldown: 5,
  hazards: [],
  fogNear: 50,
  fogFar: 200,
  fogColor: 0x87ceeb,
  skyTopColor: 0x4a90e2,
  skyBottomColor: 0x87ceeb,
  ambientIntensity: 0.4,
  sunIntensity: 1.2,
  timeLimit: 0
};

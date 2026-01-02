// Class System Configuration Types
// Defines interfaces for player classes, abilities, and stats

export type AbilityType = 'projectile' | 'aoe' | 'buff' | 'dash' | 'melee' | 'trap';

export interface ClassAbility {
  id: string;
  name: string;
  type: AbilityType;
  damage: number;
  cooldown: number; // seconds
  range: number;
  description: string;
  // Type-specific properties
  projectileSpeed?: number;
  projectileCount?: number;
  aoeRadius?: number;
  buffDuration?: number;
  buffEffect?: BuffEffect;
  dashDistance?: number;
  dashSpeed?: number;
}

export interface BuffEffect {
  type: 'damage_reduction' | 'speed_boost' | 'damage_boost' | 'heal_over_time';
  value: number; // percentage or flat value depending on type
}

export interface ClassStats {
  health: number;
  speed: number;
  baseDamage: number;
  shootRate: number; // seconds between shots
}

export interface ClassColors {
  primary: number;    // Main body color
  secondary: number;  // Accent color
  staff: number;      // Staff/weapon color
  orb: number;        // Orb/projectile base color
  orbEmissive: number; // Orb glow color
}

export interface PlayerClass {
  id: string;
  name: string;
  description: string;
  stats: ClassStats;
  colors: ClassColors;
  primaryAbility: ClassAbility;
  secondaryAbility: ClassAbility;
  passiveDescription: string;
  unlockRequirement: UnlockRequirement;
}

export interface UnlockRequirement {
  type: 'default' | 'boss_defeat' | 'total_kills' | 'game_complete' | 'secret';
  value?: number; // e.g., number of kills required
  description: string;
}

// Ability effect result for handling in combat system
export interface AbilityResult {
  success: boolean;
  damage?: number;
  affectedPositions?: { x: number; y: number; z: number }[];
  buffApplied?: ActiveBuff;
  projectileData?: ProjectileData;
}

export interface ProjectileData {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  speed: number;
  damage: number;
  color: number;
  isPlayerProjectile: boolean;
  piercing?: boolean;
  homing?: boolean;
}

export interface ActiveBuff {
  id: string;
  type: BuffEffect['type'];
  value: number;
  duration: number;
  remainingTime: number;
  sourceClassId: string;
}

// Trap data for placed AOE abilities
export interface TrapData {
  id: string;
  position: { x: number; y: number; z: number };
  radius: number;
  damage: number;
  color: number;
  remainingTime: number;
  triggered: boolean;
}

// Class Definitions - 4 Playable Classes
// Each class has unique stats, abilities, colors, and unlock requirements

import { PlayerClass } from './ClassConfig';

// ═══════════════════════════════════════════════════════════════════════════════
// MAGE - Balanced spellcaster with AOE burst
// ═══════════════════════════════════════════════════════════════════════════════
export const MAGE_CLASS: PlayerClass = {
  id: 'mage',
  name: 'Arcane Mage',
  description: 'A balanced spellcaster wielding arcane magic. Master of ranged combat with devastating area attacks.',
  stats: {
    health: 3,
    speed: 10,
    baseDamage: 1,
    shootRate: 0.15
  },
  colors: {
    primary: 0x4a90e2,    // Blue
    secondary: 0x2c5aa0,  // Dark blue
    staff: 0x8b4513,      // Brown wood
    orb: 0x00ffff,        // Cyan
    orbEmissive: 0x00ffff
  },
  primaryAbility: {
    id: 'magic_bolt',
    name: 'Magic Bolt',
    type: 'projectile',
    damage: 1,
    cooldown: 0.15,
    range: 30,
    description: 'Fire a bolt of arcane energy',
    projectileSpeed: 20,
    projectileCount: 1
  },
  secondaryAbility: {
    id: 'arcane_burst',
    name: 'Arcane Burst',
    type: 'aoe',
    damage: 2,
    cooldown: 3,
    range: 0, // Centered on player
    description: 'Unleash a burst of arcane energy around you',
    aoeRadius: 5
  },
  passiveDescription: 'Arcane Affinity: Projectiles travel 10% faster',
  unlockRequirement: {
    type: 'default',
    description: 'Available from start'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// WARRIOR - Tanky melee fighter with charge
// ═══════════════════════════════════════════════════════════════════════════════
export const WARRIOR_CLASS: PlayerClass = {
  id: 'warrior',
  name: 'Voxel Knight',
  description: 'A heavily armored warrior specializing in close combat. High durability with powerful charge attacks.',
  stats: {
    health: 5,
    speed: 8,
    baseDamage: 2,
    shootRate: 0.3
  },
  colors: {
    primary: 0xdc2626,    // Red
    secondary: 0x991b1b,  // Dark red
    staff: 0x71717a,      // Steel gray
    orb: 0xff6b35,        // Orange flame
    orbEmissive: 0xff4500
  },
  primaryAbility: {
    id: 'heavy_strike',
    name: 'Heavy Strike',
    type: 'melee',
    damage: 2,
    cooldown: 0.3,
    range: 3,
    description: 'A powerful melee swing dealing heavy damage'
  },
  secondaryAbility: {
    id: 'charge',
    name: 'Warrior Charge',
    type: 'dash',
    damage: 2,
    cooldown: 2,
    range: 8,
    description: 'Dash forward, damaging enemies in your path',
    dashDistance: 8,
    dashSpeed: 30
  },
  passiveDescription: 'Iron Will: Take 20% less damage from all sources',
  unlockRequirement: {
    type: 'boss_defeat',
    value: 1,
    description: 'Defeat the Voxel Guardian'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RANGER - Fast archer with traps
// ═══════════════════════════════════════════════════════════════════════════════
export const RANGER_CLASS: PlayerClass = {
  id: 'ranger',
  name: 'Shadow Ranger',
  description: 'A swift archer favoring hit-and-run tactics. Fires multiple arrows and sets deadly traps.',
  stats: {
    health: 2,
    speed: 12,
    baseDamage: 0.5,
    shootRate: 0.12
  },
  colors: {
    primary: 0x22c55e,    // Green
    secondary: 0x166534,  // Dark green
    staff: 0x854d0e,      // Dark wood (bow)
    orb: 0xfbbf24,        // Gold arrow tip
    orbEmissive: 0xfcd34d
  },
  primaryAbility: {
    id: 'triple_arrow',
    name: 'Triple Arrow',
    type: 'projectile',
    damage: 0.5,
    cooldown: 0.3,
    range: 35,
    description: 'Fire three arrows in a spread pattern',
    projectileSpeed: 25,
    projectileCount: 3
  },
  secondaryAbility: {
    id: 'explosive_trap',
    name: 'Explosive Trap',
    type: 'trap',
    damage: 4,
    cooldown: 8,
    range: 0, // Placed at player position
    description: 'Place a trap that explodes when enemies approach',
    aoeRadius: 3
  },
  passiveDescription: 'Swift Feet: Move 15% faster and jump higher',
  unlockRequirement: {
    type: 'total_kills',
    value: 100,
    description: 'Defeat 100 enemies'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// HEALER - Support class with barrier buff
// ═══════════════════════════════════════════════════════════════════════════════
export const HEALER_CLASS: PlayerClass = {
  id: 'healer',
  name: 'Light Weaver',
  description: 'A mystical healer channeling light energy. Can heal themselves while damaging foes with protective barriers.',
  stats: {
    health: 3,
    speed: 9,
    baseDamage: 1,
    shootRate: 0.5
  },
  colors: {
    primary: 0xfbbf24,    // Gold
    secondary: 0xd97706,  // Amber
    staff: 0xfefce8,      // Light cream
    orb: 0xfef08a,        // Soft yellow
    orbEmissive: 0xfef9c3
  },
  primaryAbility: {
    id: 'heal_bolt',
    name: 'Heal Bolt',
    type: 'projectile',
    damage: 1,
    cooldown: 0.5,
    range: 25,
    description: 'Fire a bolt that heals you on hit or damages enemies',
    projectileSpeed: 15,
    projectileCount: 1
  },
  secondaryAbility: {
    id: 'barrier',
    name: 'Light Barrier',
    type: 'buff',
    damage: 0,
    cooldown: 10,
    range: 0,
    description: 'Create a protective barrier reducing damage by 50%',
    buffDuration: 5,
    buffEffect: {
      type: 'damage_reduction',
      value: 0.5
    }
  },
  passiveDescription: 'Regeneration: Slowly heal over time when not in combat',
  unlockRequirement: {
    type: 'game_complete',
    value: 1,
    description: 'Complete the game once'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// All Classes Registry
// ═══════════════════════════════════════════════════════════════════════════════
export const ALL_CLASSES: PlayerClass[] = [
  MAGE_CLASS,
  WARRIOR_CLASS,
  RANGER_CLASS,
  HEALER_CLASS
];

export const CLASS_MAP: Map<string, PlayerClass> = new Map(
  ALL_CLASSES.map(c => [c.id, c])
);

export function getClassById(id: string): PlayerClass | undefined {
  return CLASS_MAP.get(id);
}

export function getDefaultClass(): PlayerClass {
  return MAGE_CLASS;
}

export function getUnlockedClasses(unlockedIds: string[]): PlayerClass[] {
  // Mage is always available
  const unlocked = [MAGE_CLASS];

  for (const id of unlockedIds) {
    const cls = CLASS_MAP.get(id);
    if (cls && cls.id !== 'mage') {
      unlocked.push(cls);
    }
  }

  return unlocked;
}

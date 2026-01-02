// Ability System - Manages cooldowns, execution, and effects
// Handles all ability types: projectile, aoe, buff, dash, melee, trap

import * as THREE from 'three';
import {
  ClassAbility,
  ActiveBuff,
  TrapData,
  BuffEffect
} from './ClassConfig';

export interface AbilityExecutionContext {
  playerPosition: THREE.Vector3;
  orbPosition: THREE.Vector3;  // Wand tip position for projectile origin
  aimDirection: THREE.Vector3;
  onProjectileFire?: (
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    speed: number,
    damage: number,
    color: number,
    count: number
  ) => void;
  onAOEExecute?: (
    center: THREE.Vector3,
    radius: number,
    damage: number,
    color: number
  ) => void;
  onDashExecute?: (
    direction: THREE.Vector3,
    distance: number,
    speed: number,
    damage: number
  ) => void;
  onMeleeExecute?: (
    position: THREE.Vector3,
    range: number,
    damage: number
  ) => void;
  onTrapPlace?: (trap: TrapData) => void;
  onBuffApply?: (buff: ActiveBuff) => void;
}

export class AbilitySystem {
  private cooldowns: Map<string, number> = new Map();
  private activeBuffs: Map<string, ActiveBuff> = new Map();
  private activeTraps: Map<string, TrapData> = new Map();
  private trapIdCounter = 0;

  // Callbacks for visual effects
  private onCooldownUpdate?: (abilityId: string, percent: number) => void;
  private onBuffUpdate?: (buffs: ActiveBuff[]) => void;

  constructor() {
    // Initialize
  }

  setCallbacks(
    onCooldownUpdate?: (abilityId: string, percent: number) => void,
    onBuffUpdate?: (buffs: ActiveBuff[]) => void
  ): void {
    this.onCooldownUpdate = onCooldownUpdate;
    this.onBuffUpdate = onBuffUpdate;
  }

  update(delta: number): void {
    // Update cooldowns
    for (const [abilityId, remaining] of this.cooldowns.entries()) {
      const newRemaining = Math.max(0, remaining - delta);
      this.cooldowns.set(abilityId, newRemaining);

      if (this.onCooldownUpdate) {
        // Notify UI of cooldown progress (0 = ready, 1 = just used)
        // We'd need to store max cooldown to calculate percentage
      }
    }

    // Update active buffs
    let buffsChanged = false;
    for (const [buffId, buff] of this.activeBuffs.entries()) {
      buff.remainingTime -= delta;
      if (buff.remainingTime <= 0) {
        this.activeBuffs.delete(buffId);
        buffsChanged = true;
      }
    }

    if (buffsChanged && this.onBuffUpdate) {
      this.onBuffUpdate(Array.from(this.activeBuffs.values()));
    }

    // Update traps (decay over time)
    for (const [trapId, trap] of this.activeTraps.entries()) {
      trap.remainingTime -= delta;
      if (trap.remainingTime <= 0 || trap.triggered) {
        this.activeTraps.delete(trapId);
      }
    }
  }

  canUseAbility(ability: ClassAbility): boolean {
    const remaining = this.cooldowns.get(ability.id) ?? 0;
    return remaining <= 0;
  }

  getCooldownRemaining(abilityId: string): number {
    return this.cooldowns.get(abilityId) ?? 0;
  }

  getCooldownPercent(ability: ClassAbility): number {
    const remaining = this.cooldowns.get(ability.id) ?? 0;
    if (ability.cooldown <= 0) return 0;
    return remaining / ability.cooldown;
  }

  useAbility(
    ability: ClassAbility,
    context: AbilityExecutionContext,
    classColors: { orb: number; orbEmissive: number }
  ): boolean {
    if (!this.canUseAbility(ability)) {
      return false;
    }

    // Set cooldown
    this.cooldowns.set(ability.id, ability.cooldown);

    // Execute based on type
    switch (ability.type) {
      case 'projectile':
        this.executeProjectile(ability, context, classColors);
        break;
      case 'aoe':
        this.executeAOE(ability, context, classColors);
        break;
      case 'buff':
        this.executeBuff(ability, context);
        break;
      case 'dash':
        this.executeDash(ability, context);
        break;
      case 'melee':
        this.executeMelee(ability, context);
        break;
      case 'trap':
        this.executeTrap(ability, context, classColors);
        break;
    }

    return true;
  }

  private executeProjectile(
    ability: ClassAbility,
    context: AbilityExecutionContext,
    colors: { orb: number; orbEmissive: number }
  ): void {
    if (!context.onProjectileFire) return;

    const count = ability.projectileCount ?? 1;
    const speed = ability.projectileSpeed ?? 20;

    // Fire from wand tip (orb position) for realistic visuals
    context.onProjectileFire(
      context.orbPosition.clone(),
      context.aimDirection,
      speed,
      ability.damage,
      colors.orb,
      count
    );
  }

  private executeAOE(
    ability: ClassAbility,
    context: AbilityExecutionContext,
    colors: { orb: number; orbEmissive: number }
  ): void {
    if (!context.onAOEExecute) return;

    const radius = ability.aoeRadius ?? 5;

    context.onAOEExecute(
      context.playerPosition.clone(),
      radius,
      ability.damage,
      colors.orbEmissive
    );
  }

  private executeBuff(
    ability: ClassAbility,
    context: AbilityExecutionContext
  ): void {
    if (!ability.buffEffect || !ability.buffDuration) return;

    const buff: ActiveBuff = {
      id: `${ability.id}_${Date.now()}`,
      type: ability.buffEffect.type,
      value: ability.buffEffect.value,
      duration: ability.buffDuration,
      remainingTime: ability.buffDuration,
      sourceClassId: ability.id
    };

    this.activeBuffs.set(buff.id, buff);

    if (context.onBuffApply) {
      context.onBuffApply(buff);
    }

    if (this.onBuffUpdate) {
      this.onBuffUpdate(Array.from(this.activeBuffs.values()));
    }
  }

  private executeDash(
    ability: ClassAbility,
    context: AbilityExecutionContext
  ): void {
    if (!context.onDashExecute) return;

    const distance = ability.dashDistance ?? 8;
    const speed = ability.dashSpeed ?? 30;

    // Dash in aim direction (horizontal only for safety)
    const dashDir = context.aimDirection.clone();
    dashDir.y = 0;
    dashDir.normalize();

    context.onDashExecute(dashDir, distance, speed, ability.damage);
  }

  private executeMelee(
    ability: ClassAbility,
    context: AbilityExecutionContext
  ): void {
    if (!context.onMeleeExecute) return;

    context.onMeleeExecute(
      context.playerPosition.clone(),
      ability.range,
      ability.damage
    );
  }

  private executeTrap(
    ability: ClassAbility,
    context: AbilityExecutionContext,
    colors: { orb: number; orbEmissive: number }
  ): void {
    if (!context.onTrapPlace) return;

    const trap: TrapData = {
      id: `trap_${this.trapIdCounter++}`,
      position: {
        x: context.playerPosition.x,
        y: context.playerPosition.y,
        z: context.playerPosition.z
      },
      radius: ability.aoeRadius ?? 3,
      damage: ability.damage,
      color: colors.orbEmissive,
      remainingTime: 30, // Traps last 30 seconds
      triggered: false
    };

    this.activeTraps.set(trap.id, trap);
    context.onTrapPlace(trap);
  }

  // Get damage modifier from active buffs
  getDamageReduction(): number {
    let reduction = 0;

    for (const buff of this.activeBuffs.values()) {
      if (buff.type === 'damage_reduction') {
        reduction = Math.max(reduction, buff.value);
      }
    }

    return reduction;
  }

  getSpeedModifier(): number {
    let modifier = 1;

    for (const buff of this.activeBuffs.values()) {
      if (buff.type === 'speed_boost') {
        modifier = Math.max(modifier, 1 + buff.value);
      }
    }

    return modifier;
  }

  getDamageModifier(): number {
    let modifier = 1;

    for (const buff of this.activeBuffs.values()) {
      if (buff.type === 'damage_boost') {
        modifier = Math.max(modifier, 1 + buff.value);
      }
    }

    return modifier;
  }

  hasActiveBuff(type: BuffEffect['type']): boolean {
    for (const buff of this.activeBuffs.values()) {
      if (buff.type === type) {
        return true;
      }
    }
    return false;
  }

  getActiveBuffs(): ActiveBuff[] {
    return Array.from(this.activeBuffs.values());
  }

  getActiveTraps(): TrapData[] {
    return Array.from(this.activeTraps.values());
  }

  triggerTrap(trapId: string): TrapData | null {
    const trap = this.activeTraps.get(trapId);
    if (trap && !trap.triggered) {
      trap.triggered = true;
      return trap;
    }
    return null;
  }

  reset(): void {
    this.cooldowns.clear();
    this.activeBuffs.clear();
    this.activeTraps.clear();
  }

  dispose(): void {
    this.reset();
    this.onCooldownUpdate = undefined;
    this.onBuffUpdate = undefined;
  }
}

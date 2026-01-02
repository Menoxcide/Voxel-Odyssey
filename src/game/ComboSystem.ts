/**
 * Combo System - Tracks kill streaks and provides damage multipliers
 * Kills within the combo window extend the combo, providing increasing bonuses
 */

export interface ComboState {
  count: number;
  multiplier: number;
  timeRemaining: number;
  isActive: boolean;
  tier: ComboTier;
}

export type ComboTier = 'none' | 'good' | 'great' | 'amazing' | 'legendary';

export interface ComboTierConfig {
  name: string;
  minKills: number;
  multiplier: number;
  color: number;
  sound: string;
}

// Kill streak announcements (like "Double Kill!", "Triple Kill!")
export interface KillStreakConfig {
  name: string;
  color: number;
}

const KILL_STREAKS: Record<number, KillStreakConfig> = {
  2: { name: 'DOUBLE KILL!', color: 0x4ade80 },
  3: { name: 'TRIPLE KILL!', color: 0x60a5fa },
  4: { name: 'QUAD KILL!', color: 0xa855f7 },
  5: { name: 'PENTA KILL!', color: 0xfbbf24 },
  6: { name: 'MEGA KILL!', color: 0xef4444 },
  8: { name: 'ULTRA KILL!', color: 0xf97316 },
  10: { name: 'MONSTER KILL!', color: 0xff0000 },
  15: { name: 'GODLIKE!', color: 0xffd700 }
};

const COMBO_TIERS: Record<ComboTier, ComboTierConfig> = {
  none: { name: '', minKills: 0, multiplier: 1.0, color: 0xffffff, sound: '' },
  good: { name: 'GOOD!', minKills: 3, multiplier: 1.25, color: 0x4ade80, sound: 'comboGood' },
  great: { name: 'GREAT!', minKills: 5, multiplier: 1.5, color: 0x60a5fa, sound: 'comboGreat' },
  amazing: { name: 'AMAZING!', minKills: 8, multiplier: 2.0, color: 0xa855f7, sound: 'comboAmazing' },
  legendary: { name: 'LEGENDARY!', minKills: 12, multiplier: 3.0, color: 0xfbbf24, sound: 'comboLegendary' }
};

const COMBO_WINDOW = 3.0; // Seconds to chain next kill
const COMBO_EXTENSION = 1.5; // Time added per kill

export class ComboSystem {
  private count = 0;
  private timeRemaining = 0;
  private currentTier: ComboTier = 'none';
  private highestCombo = 0;
  private totalBonusDamage = 0;

  // Callbacks
  private onComboChange?: (state: ComboState) => void;
  private onTierUp?: (tier: ComboTier, config: ComboTierConfig) => void;
  private onComboEnd?: (finalCount: number, bonusDamage: number) => void;
  private onKillStreak?: (config: KillStreakConfig) => void;

  setCallbacks(callbacks: {
    onComboChange?: (state: ComboState) => void;
    onTierUp?: (tier: ComboTier, config: ComboTierConfig) => void;
    onComboEnd?: (finalCount: number, bonusDamage: number) => void;
    onKillStreak?: (config: KillStreakConfig) => void;
  }): void {
    this.onComboChange = callbacks.onComboChange;
    this.onTierUp = callbacks.onTierUp;
    this.onComboEnd = callbacks.onComboEnd;
    this.onKillStreak = callbacks.onKillStreak;
  }

  /**
   * Register a kill and update combo state
   * @returns The damage multiplier to apply
   */
  registerKill(): number {
    const wasActive = this.count > 0;

    this.count++;
    this.timeRemaining = Math.min(COMBO_WINDOW, this.timeRemaining + COMBO_EXTENSION);

    // Track highest combo
    if (this.count > this.highestCombo) {
      this.highestCombo = this.count;
    }

    // Check for tier up
    const previousTier = this.currentTier;
    this.currentTier = this.calculateTier();

    if (this.currentTier !== previousTier && this.currentTier !== 'none') {
      if (this.onTierUp) {
        this.onTierUp(this.currentTier, COMBO_TIERS[this.currentTier]);
      }
    }

    // Check for kill streak announcement
    const streakConfig = KILL_STREAKS[this.count];
    if (streakConfig && this.onKillStreak) {
      this.onKillStreak(streakConfig);
    }

    // Calculate bonus damage from multiplier
    const multiplier = this.getMultiplier();
    if (multiplier > 1) {
      this.totalBonusDamage += multiplier - 1;
    }

    // Notify of combo change
    if (this.onComboChange) {
      this.onComboChange(this.getState());
    }

    // First kill starts combo but doesn't get multiplier
    if (!wasActive) {
      return 1.0;
    }

    return multiplier;
  }

  update(delta: number): void {
    if (this.count === 0) return;

    this.timeRemaining -= delta;

    if (this.timeRemaining <= 0) {
      this.endCombo();
    } else if (this.onComboChange) {
      this.onComboChange(this.getState());
    }
  }

  private endCombo(): void {
    const finalCount = this.count;
    const bonusDamage = this.totalBonusDamage;

    if (this.onComboEnd && finalCount > 0) {
      this.onComboEnd(finalCount, bonusDamage);
    }

    this.count = 0;
    this.timeRemaining = 0;
    this.currentTier = 'none';
    this.totalBonusDamage = 0;

    if (this.onComboChange) {
      this.onComboChange(this.getState());
    }
  }

  private calculateTier(): ComboTier {
    if (this.count >= COMBO_TIERS.legendary.minKills) return 'legendary';
    if (this.count >= COMBO_TIERS.amazing.minKills) return 'amazing';
    if (this.count >= COMBO_TIERS.great.minKills) return 'great';
    if (this.count >= COMBO_TIERS.good.minKills) return 'good';
    return 'none';
  }

  getMultiplier(): number {
    return COMBO_TIERS[this.currentTier].multiplier;
  }

  getState(): ComboState {
    return {
      count: this.count,
      multiplier: this.getMultiplier(),
      timeRemaining: this.timeRemaining,
      isActive: this.count > 0,
      tier: this.currentTier
    };
  }

  getCount(): number {
    return this.count;
  }

  getTier(): ComboTier {
    return this.currentTier;
  }

  getTierConfig(): ComboTierConfig {
    return COMBO_TIERS[this.currentTier];
  }

  getHighestCombo(): number {
    return this.highestCombo;
  }

  getTimeRemaining(): number {
    return this.timeRemaining;
  }

  getTimePercent(): number {
    if (this.count === 0) return 0;
    return this.timeRemaining / COMBO_WINDOW;
  }

  isActive(): boolean {
    return this.count > 0;
  }

  reset(): void {
    this.count = 0;
    this.timeRemaining = 0;
    this.currentTier = 'none';
    this.totalBonusDamage = 0;
    // Don't reset highestCombo - track across session

    if (this.onComboChange) {
      this.onComboChange(this.getState());
    }
  }

  resetSession(): void {
    this.reset();
    this.highestCombo = 0;
  }
}

// Export tier configs for UI
export { COMBO_TIERS };

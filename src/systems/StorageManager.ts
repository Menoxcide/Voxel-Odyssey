export interface GameProgress {
  currentLevel: number;
  highestLevel: number;
  totalScore: number;
  highScore: number;
  unlockedSkins: string[];
  selectedClass: string;
  unlockedClasses: string[];
  settings: GameSettings;
  stats: GameStats;
}

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  vibration: boolean;
  showFps: boolean;
  lowPowerMode: boolean;
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

export interface GameStats {
  totalPlayTime: number; // seconds
  totalKills: number;
  bossesDefeated: number;
  deathCount: number;
  shotsFired: number;
  shotsHit: number;
  gamesPlayed: number;
  highestCombo: number;
  coins: number; // Currency for item shop
  totalCoinsEarned: number;
}

const STORAGE_KEY = 'voxel_odyssey_save';
const CHECKSUM_KEY = 'voxel_odyssey_checksum';

// Simple hash function for integrity checking (djb2 algorithm)
function computeChecksum(data: string): string {
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash) ^ data.charCodeAt(i);
  }
  // Convert to hex string and add salt to prevent easy tampering
  return ((hash >>> 0).toString(16) + 'vo').split('').reverse().join('');
}

const DEFAULT_PROGRESS: GameProgress = {
  currentLevel: 0,
  highestLevel: 0,
  totalScore: 0,
  highScore: 0,
  unlockedSkins: ['default'],
  selectedClass: 'mage',
  unlockedClasses: ['mage'], // Mage is always unlocked by default
  settings: {
    musicVolume: 0.5,
    sfxVolume: 0.7,
    vibration: true,
    showFps: false,
    lowPowerMode: false,
    colorblindMode: 'none'
  },
  stats: {
    totalPlayTime: 0,
    totalKills: 0,
    bossesDefeated: 0,
    deathCount: 0,
    shotsFired: 0,
    shotsHit: 0,
    gamesPlayed: 0,
    highestCombo: 0,
    coins: 0,
    totalCoinsEarned: 0
  }
};

export class StorageManager {
  private progress: GameProgress;
  private sessionStartTime: number;

  constructor() {
    this.progress = this.load();
    this.sessionStartTime = Date.now();
  }

  private load(): GameProgress {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      const storedChecksum = localStorage.getItem(CHECKSUM_KEY);

      if (data) {
        // Verify integrity
        if (!this.verifyChecksum(data, storedChecksum)) {
          console.warn('Save data integrity check failed, possible tampering detected');
          // Don't reset completely - just log the warning
          // This helps detect cheating but doesn't punish legitimate players
        }

        const parsed = JSON.parse(data) as Partial<GameProgress>;

        // Validate and sanitize loaded data
        if (!this.validateProgress(parsed)) {
          console.warn('Invalid save data schema, resetting to defaults');
          return { ...DEFAULT_PROGRESS };
        }

        // Additional sanity checks for stat validation
        const validated = this.sanitizeStats(parsed);

        // Merge with defaults to handle new fields
        return {
          ...DEFAULT_PROGRESS,
          ...validated,
          // Ensure arrays are properly merged (don't use spread for arrays)
          unlockedSkins: validated.unlockedSkins ?? DEFAULT_PROGRESS.unlockedSkins,
          unlockedClasses: validated.unlockedClasses ?? DEFAULT_PROGRESS.unlockedClasses,
          settings: { ...DEFAULT_PROGRESS.settings, ...validated.settings },
          stats: { ...DEFAULT_PROGRESS.stats, ...validated.stats }
        };
      }
    } catch (e) {
      console.warn('Failed to load save data:', e);
    }
    return { ...DEFAULT_PROGRESS };
  }

  private verifyChecksum(data: string, storedChecksum: string | null): boolean {
    if (!storedChecksum) {
      // No checksum stored (first time or old save)
      return true;
    }
    const computed = computeChecksum(data);
    return computed === storedChecksum;
  }

  private sanitizeStats(data: Partial<GameProgress>): Partial<GameProgress> {
    if (!data.stats) return data;

    const stats = { ...data.stats };

    // Sanity checks - impossible values indicate tampering
    // shotsHit can't exceed shotsFired
    if (stats.shotsHit !== undefined && stats.shotsFired !== undefined) {
      stats.shotsHit = Math.min(stats.shotsHit, stats.shotsFired);
    }

    // Values must be non-negative
    for (const key of Object.keys(stats) as (keyof GameStats)[]) {
      if (typeof stats[key] === 'number' && stats[key] < 0) {
        stats[key] = 0;
      }
    }

    // Clamp to reasonable maximums to prevent overflow exploits
    const MAX_STAT = 999999999; // ~1 billion
    for (const key of Object.keys(stats) as (keyof GameStats)[]) {
      if (typeof stats[key] === 'number' && stats[key] > MAX_STAT) {
        stats[key] = MAX_STAT;
      }
    }

    return { ...data, stats };
  }

  private validateProgress(data: Partial<GameProgress>): boolean {
    // Validate required fields and types
    if (typeof data.currentLevel !== 'undefined' && typeof data.currentLevel !== 'number') return false;
    if (typeof data.highestLevel !== 'undefined' && typeof data.highestLevel !== 'number') return false;
    if (typeof data.totalScore !== 'undefined' && typeof data.totalScore !== 'number') return false;
    if (typeof data.highScore !== 'undefined' && typeof data.highScore !== 'number') return false;

    // Validate arrays
    if (data.unlockedSkins && !Array.isArray(data.unlockedSkins)) return false;
    if (data.unlockedClasses && !Array.isArray(data.unlockedClasses)) return false;

    // Validate class selection
    if (typeof data.selectedClass !== 'undefined' && typeof data.selectedClass !== 'string') return false;

    // Validate settings if present
    if (data.settings) {
      const s = data.settings;
      if (typeof s.musicVolume !== 'undefined' && (typeof s.musicVolume !== 'number' || s.musicVolume < 0 || s.musicVolume > 1)) return false;
      if (typeof s.sfxVolume !== 'undefined' && (typeof s.sfxVolume !== 'number' || s.sfxVolume < 0 || s.sfxVolume > 1)) return false;
      if (typeof s.vibration !== 'undefined' && typeof s.vibration !== 'boolean') return false;
      if (typeof s.showFps !== 'undefined' && typeof s.showFps !== 'boolean') return false;
      if (typeof s.lowPowerMode !== 'undefined' && typeof s.lowPowerMode !== 'boolean') return false;
      if (typeof s.colorblindMode !== 'undefined' && !['none', 'protanopia', 'deuteranopia', 'tritanopia'].includes(s.colorblindMode)) return false;
    }

    // Validate stats if present
    if (data.stats) {
      const statsKeys: (keyof GameStats)[] = ['totalPlayTime', 'totalKills', 'bossesDefeated', 'deathCount', 'shotsFired', 'shotsHit', 'gamesPlayed', 'highestCombo'];
      for (const key of statsKeys) {
        if (typeof data.stats[key] !== 'undefined' && typeof data.stats[key] !== 'number') return false;
      }
    }

    return true;
  }

  save(): void {
    try {
      // Update play time
      const sessionTime = (Date.now() - this.sessionStartTime) / 1000;
      this.progress.stats.totalPlayTime += sessionTime;
      this.sessionStartTime = Date.now();

      // Sanitize stats before saving
      this.progress = this.sanitizeStats(this.progress) as GameProgress;

      // Check localStorage quota before saving
      const dataStr = JSON.stringify(this.progress);
      const dataSize = new Blob([dataStr]).size;

      // Warn if approaching 5MB limit (localStorage is typically 5-10MB)
      if (dataSize > 5000000) {
        console.warn('Save data too large, may fail on some devices');
        return;
      }

      // Compute and store checksum for integrity verification
      const checksum = computeChecksum(dataStr);

      localStorage.setItem(STORAGE_KEY, dataStr);
      localStorage.setItem(CHECKSUM_KEY, checksum);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.error('Storage quota exceeded. Unable to save game data.');
      } else {
        console.warn('Failed to save data:', e);
      }
    }
  }

  getProgress(): GameProgress {
    return this.progress;
  }

  // Level progress
  setCurrentLevel(level: number): void {
    this.progress.currentLevel = level;
    if (level > this.progress.highestLevel) {
      this.progress.highestLevel = level;
    }
    this.save();
  }

  getCurrentLevel(): number {
    return this.progress.currentLevel;
  }

  getHighestLevel(): number {
    return this.progress.highestLevel;
  }

  // Score
  addScore(points: number): void {
    this.progress.totalScore += points;
    if (this.progress.totalScore > this.progress.highScore) {
      this.progress.highScore = this.progress.totalScore;
    }
  }

  resetSessionScore(): void {
    this.progress.totalScore = 0;
  }

  getScore(): number {
    return this.progress.totalScore;
  }

  getHighScore(): number {
    return this.progress.highScore;
  }

  // Skins
  unlockSkin(skinId: string): void {
    if (!this.progress.unlockedSkins.includes(skinId)) {
      this.progress.unlockedSkins.push(skinId);
      this.save();
    }
  }

  isSkinUnlocked(skinId: string): boolean {
    return this.progress.unlockedSkins.includes(skinId);
  }

  getUnlockedSkins(): string[] {
    return [...this.progress.unlockedSkins];
  }

  // Classes
  setSelectedClass(classId: string): void {
    // Only allow selection of unlocked classes
    if (this.isClassUnlocked(classId)) {
      this.progress.selectedClass = classId;
      this.save();
    }
  }

  getSelectedClass(): string {
    return this.progress.selectedClass;
  }

  unlockClass(classId: string): boolean {
    if (!this.progress.unlockedClasses.includes(classId)) {
      this.progress.unlockedClasses.push(classId);
      this.save();
      return true; // Newly unlocked
    }
    return false; // Already unlocked
  }

  isClassUnlocked(classId: string): boolean {
    return this.progress.unlockedClasses.includes(classId);
  }

  getUnlockedClasses(): string[] {
    return [...this.progress.unlockedClasses];
  }

  // Check and unlock classes based on current stats
  checkClassUnlocks(): string[] {
    const newlyUnlocked: string[] = [];

    // Warrior: Defeat first boss
    if (this.progress.stats.bossesDefeated >= 1 && !this.isClassUnlocked('warrior')) {
      this.progress.unlockedClasses.push('warrior');
      newlyUnlocked.push('warrior');
    }

    // Ranger: 100 total kills
    if (this.progress.stats.totalKills >= 100 && !this.isClassUnlocked('ranger')) {
      this.progress.unlockedClasses.push('ranger');
      newlyUnlocked.push('ranger');
    }

    // Healer: Complete game once (high enough level or boss defeated while on final level)
    // For now, use bossesDefeated >= 1 as proxy for game completion
    // This can be refined based on actual level progression
    if (this.progress.highestLevel >= 1 && this.progress.stats.bossesDefeated >= 1 && !this.isClassUnlocked('healer')) {
      this.progress.unlockedClasses.push('healer');
      newlyUnlocked.push('healer');
    }

    if (newlyUnlocked.length > 0) {
      this.save();
    }

    return newlyUnlocked;
  }

  // Settings
  getSettings(): GameSettings {
    return { ...this.progress.settings };
  }

  updateSettings(settings: Partial<GameSettings>): void {
    this.progress.settings = { ...this.progress.settings, ...settings };
    this.save();
  }

  // Stats
  getStats(): GameStats {
    return { ...this.progress.stats };
  }

  incrementStat(stat: keyof GameStats, amount: number = 1): void {
    // Special handling for max-type stats (should track highest value, not sum)
    if (stat === 'highestCombo') {
      this.progress.stats[stat] = Math.max(this.progress.stats[stat], amount);
    } else {
      this.progress.stats[stat] += amount;
    }
  }

  recordKill(): void {
    this.incrementStat('totalKills');
    this.addScore(10);
  }

  recordBossDefeat(): void {
    this.incrementStat('bossesDefeated');
    this.addScore(100);
  }

  recordDeath(): void {
    this.incrementStat('deathCount');
  }

  recordShot(hit: boolean): void {
    this.incrementStat('shotsFired');
    if (hit) {
      this.incrementStat('shotsHit');
    }
  }

  recordGameStart(): void {
    this.incrementStat('gamesPlayed');
    this.sessionStartTime = Date.now();
  }

  getAccuracy(): number {
    const { shotsFired, shotsHit } = this.progress.stats;
    if (shotsFired === 0) return 0;
    return (shotsHit / shotsFired) * 100;
  }

  // Coins
  getCoins(): number {
    return this.progress.stats.coins;
  }

  addCoins(amount: number): void {
    this.progress.stats.coins += amount;
    this.progress.stats.totalCoinsEarned += amount;
  }

  spendCoins(amount: number): boolean {
    if (this.progress.stats.coins >= amount) {
      this.progress.stats.coins -= amount;
      this.save();
      return true;
    }
    return false;
  }

  // Class unlock progress info
  getClassUnlockProgress(): { classId: string; requirement: string; current: number; target: number; percent: number }[] {
    const progress: { classId: string; requirement: string; current: number; target: number; percent: number }[] = [];

    // Warrior: Defeat first boss
    if (!this.isClassUnlocked('warrior')) {
      progress.push({
        classId: 'warrior',
        requirement: 'Defeat 1 boss',
        current: this.progress.stats.bossesDefeated,
        target: 1,
        percent: Math.min(100, (this.progress.stats.bossesDefeated / 1) * 100)
      });
    }

    // Ranger: 100 total kills
    if (!this.isClassUnlocked('ranger')) {
      progress.push({
        classId: 'ranger',
        requirement: 'Defeat 100 enemies',
        current: this.progress.stats.totalKills,
        target: 100,
        percent: Math.min(100, (this.progress.stats.totalKills / 100) * 100)
      });
    }

    // Healer: Complete game (level 1+ and boss defeated)
    if (!this.isClassUnlocked('healer')) {
      const bossProgress = this.progress.stats.bossesDefeated >= 1 ? 50 : 0;
      const levelProgress = this.progress.highestLevel >= 1 ? 50 : 0;
      progress.push({
        classId: 'healer',
        requirement: 'Reach level 2 and defeat a boss',
        current: bossProgress + levelProgress,
        target: 100,
        percent: bossProgress + levelProgress
      });
    }

    return progress;
  }

  // Reset
  resetProgress(): void {
    this.progress = { ...DEFAULT_PROGRESS };
    this.save();
  }

  resetStats(): void {
    this.progress.stats = { ...DEFAULT_PROGRESS.stats };
    this.save();
  }

  // Export/Import for cloud save compatibility
  exportData(): string {
    return JSON.stringify(this.progress);
  }

  importData(data: string): boolean {
    try {
      const parsed = JSON.parse(data) as Partial<GameProgress>;

      // Validate imported data schema
      if (!this.validateProgress(parsed)) {
        console.warn('Invalid import data schema');
        return false;
      }

      this.progress = {
        ...DEFAULT_PROGRESS,
        ...parsed,
        settings: { ...DEFAULT_PROGRESS.settings, ...parsed.settings },
        stats: { ...DEFAULT_PROGRESS.stats, ...parsed.stats }
      };
      this.save();
      return true;
    } catch {
      return false;
    }
  }
}

export interface GameProgress {
  currentLevel: number;
  highestLevel: number;
  totalScore: number;
  highScore: number;
  unlockedSkins: string[];
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
}

const STORAGE_KEY = 'voxel_odyssey_save';

const DEFAULT_PROGRESS: GameProgress = {
  currentLevel: 0,
  highestLevel: 0,
  totalScore: 0,
  highScore: 0,
  unlockedSkins: ['default'],
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
    gamesPlayed: 0
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
      if (data) {
        const parsed = JSON.parse(data) as Partial<GameProgress>;
        // Merge with defaults to handle new fields
        return {
          ...DEFAULT_PROGRESS,
          ...parsed,
          settings: { ...DEFAULT_PROGRESS.settings, ...parsed.settings },
          stats: { ...DEFAULT_PROGRESS.stats, ...parsed.stats }
        };
      }
    } catch (e) {
      console.warn('Failed to load save data:', e);
    }
    return { ...DEFAULT_PROGRESS };
  }

  save(): void {
    try {
      // Update play time
      const sessionTime = (Date.now() - this.sessionStartTime) / 1000;
      this.progress.stats.totalPlayTime += sessionTime;
      this.sessionStartTime = Date.now();

      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.progress));
    } catch (e) {
      console.warn('Failed to save data:', e);
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
    this.progress.stats[stat] += amount;
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
      const parsed = JSON.parse(data) as GameProgress;
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

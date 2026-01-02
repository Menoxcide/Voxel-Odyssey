import { Howl, Howler } from 'howler';

interface SoundConfig {
  src: string[];
  volume?: number;
  loop?: boolean;
  pool?: number;
}

interface SoundPool {
  howl: Howl;
  lastPlayed: number;
}

export class AudioManager {
  private readonly sounds: Map<string, SoundPool> = new Map();
  private musicHowl: Howl | null = null;
  private musicVolume = 0.3;
  private sfxVolume = 0.5;
  private muted = false;

  // Throttle settings to prevent audio spam
  private readonly minPlayInterval = 50; // ms between same sound

  constructor() {
    // Set global volume
    Howler.volume(1);

    // Register default sounds
    this.registerDefaultSounds();
  }

  private registerDefaultSounds(): void {
    // These will use placeholder silent audio if files don't exist
    // In production, replace with actual sound files
    const defaultSounds: Record<string, SoundConfig> = {
      shoot: {
        src: ['/sounds/shoot.ogg', '/sounds/shoot.mp3'],
        volume: 0.4,
        pool: 5
      },
      hit: {
        src: ['/sounds/hit.ogg', '/sounds/hit.mp3'],
        volume: 0.5,
        pool: 3
      },
      explosion: {
        src: ['/sounds/explosion.ogg', '/sounds/explosion.mp3'],
        volume: 0.6,
        pool: 2
      },
      playerHurt: {
        src: ['/sounds/player_hurt.ogg', '/sounds/player_hurt.mp3'],
        volume: 0.6
      },
      enemyDeath: {
        src: ['/sounds/enemy_death.ogg', '/sounds/enemy_death.mp3'],
        volume: 0.5,
        pool: 3
      },
      bossRoar: {
        src: ['/sounds/boss_roar.ogg', '/sounds/boss_roar.mp3'],
        volume: 0.7
      },
      bossPhase: {
        src: ['/sounds/boss_phase.ogg', '/sounds/boss_phase.mp3'],
        volume: 0.6
      },
      victory: {
        src: ['/sounds/victory.ogg', '/sounds/victory.mp3'],
        volume: 0.7
      },
      gameOver: {
        src: ['/sounds/game_over.ogg', '/sounds/game_over.mp3'],
        volume: 0.6
      },
      criticalHit: {
        src: ['/sounds/critical_hit.ogg', '/sounds/critical_hit.mp3'],
        volume: 0.7,
        pool: 3
      },
      pickup: {
        src: ['/sounds/pickup.ogg', '/sounds/pickup.mp3'],
        volume: 0.4,
        pool: 3
      },
      shieldBreak: {
        src: ['/sounds/shield_break.ogg', '/sounds/shield_break.mp3'],
        volume: 0.6
      },
      // Combo tier sounds - escalating intensity
      comboGood: {
        src: ['/sounds/combo_good.ogg', '/sounds/combo_good.mp3'],
        volume: 0.5
      },
      comboGreat: {
        src: ['/sounds/combo_great.ogg', '/sounds/combo_great.mp3'],
        volume: 0.6
      },
      comboAmazing: {
        src: ['/sounds/combo_amazing.ogg', '/sounds/combo_amazing.mp3'],
        volume: 0.7
      },
      comboLegendary: {
        src: ['/sounds/combo_legendary.ogg', '/sounds/combo_legendary.mp3'],
        volume: 0.8
      },
      // Kill streak announcements
      killStreak: {
        src: ['/sounds/kill_streak.ogg', '/sounds/kill_streak.mp3'],
        volume: 0.7,
        pool: 2
      }
    };

    // Only register sounds - they'll fail silently if files don't exist
    for (const [name, config] of Object.entries(defaultSounds)) {
      this.registerSound(name, config);
    }
  }

  registerSound(name: string, config: SoundConfig): void {
    const howl = new Howl({
      src: config.src,
      volume: (config.volume ?? 1) * this.sfxVolume,
      loop: config.loop ?? false,
      pool: config.pool ?? 1,
      preload: true,
      onloaderror: () => {
        // Silent fail - sound files may not exist yet
        console.debug(`Audio file not found: ${name}`);
      }
    });

    this.sounds.set(name, {
      howl,
      lastPlayed: 0
    });
  }

  play(name: string, volume?: number): number | null {
    const pool = this.sounds.get(name);
    if (!pool || this.muted) return null;

    // Throttle rapid plays of same sound
    const now = Date.now();
    if (now - pool.lastPlayed < this.minPlayInterval) {
      return null;
    }
    pool.lastPlayed = now;

    // Play with optional volume override
    if (volume !== undefined) {
      pool.howl.volume(volume * this.sfxVolume);
    }

    return pool.howl.play();
  }

  stop(name: string): void {
    const pool = this.sounds.get(name);
    if (pool) {
      pool.howl.stop();
    }
  }

  playMusic(src: string | string[], fadeIn: number = 1000): void {
    // Stop existing music
    this.stopMusic();

    const sources = Array.isArray(src) ? src : [src];

    this.musicHowl = new Howl({
      src: sources,
      volume: 0,
      loop: true,
      preload: true,
      onload: () => {
        if (this.musicHowl && !this.muted) {
          this.musicHowl.play();
          this.musicHowl.fade(0, this.musicVolume, fadeIn);
        }
      },
      onloaderror: () => {
        console.debug('Music file not found');
      }
    });
  }

  stopMusic(fadeOut: number = 500): void {
    if (this.musicHowl) {
      const howl = this.musicHowl;
      howl.fade(howl.volume(), 0, fadeOut);
      setTimeout(() => {
        howl.stop();
        howl.unload();
      }, fadeOut);
      this.musicHowl = null;
    }
  }

  pauseMusic(): void {
    if (this.musicHowl) {
      this.musicHowl.pause();
    }
  }

  resumeMusic(): void {
    if (this.musicHowl && !this.muted) {
      this.musicHowl.play();
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicHowl) {
      this.musicHowl.volume(this.musicVolume);
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));

    // Update all sound volumes
    this.sounds.forEach((pool) => {
      const baseVolume = pool.howl.volume() / (this.sfxVolume || 1);
      pool.howl.volume(baseVolume * this.sfxVolume);
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    Howler.mute(muted);
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // Mobile vibration feedback
  vibrate(pattern: number | number[] = 50): void {
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  }

  // Play sound with vibration (for hits, etc.)
  playWithVibration(name: string, vibratePattern: number | number[] = 50): void {
    this.play(name);
    this.vibrate(vibratePattern);
  }

  dispose(): void {
    this.stopMusic(0);

    this.sounds.forEach((pool) => {
      pool.howl.unload();
    });
    this.sounds.clear();
  }
}

import nipplejs, { JoystickManager, JoystickOutputData } from 'nipplejs';

export interface InputState {
  moveX: number;
  moveZ: number;
  aimX: number;
  aimY: number;
  shooting: boolean;
  jumping: boolean;
  secondaryAbility: boolean;
  targetScreenX?: number;
  targetScreenY?: number;
  cycleTarget: boolean;
  clearTarget: boolean;
  pause: boolean;
}

interface GyroState {
  alpha: number;
  beta: number;
  gamma: number;
}

export class InputManager {
  private readonly state: InputState = {
    moveX: 0,
    moveZ: 0,
    aimX: 0,
    aimY: 0,
    shooting: false,
    jumping: false,
    secondaryAbility: false,
    cycleTarget: false,
    clearTarget: false,
    pause: false
  };

  // Input sanitization bounds
  private static readonly MOVE_CLAMP = 1.0;
  private static readonly AIM_X_MAX = Math.PI * 4; // Allow 2 full rotations
  private static readonly AIM_Y_MIN = -Math.PI / 3;
  private static readonly AIM_Y_MAX = Math.PI / 3;

  private joystick: JoystickManager | null = null;
  private readonly keys: Set<string> = new Set();
  private gyroEnabled = false;
  private readonly gyroState: GyroState = { alpha: 0, beta: 0, gamma: 0 };

  private lastInputTime = 0;
  private readonly throttleInterval = 1000 / 60; // 60Hz

  private readonly canvas: HTMLCanvasElement;
  private isPointerLocked = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.setupKeyboard();
    this.setupMouse();
    this.setupTouch();
  }

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.keys.add(e.code);

      if (e.code === 'Space') {
        e.preventDefault();
        this.state.jumping = true;
      }

      // Secondary ability (E key or Q key)
      if (e.code === 'KeyE' || e.code === 'KeyQ') {
        e.preventDefault();
        this.state.secondaryAbility = true;
      }

      // Target cycling (Tab key)
      if (e.code === 'Tab') {
        e.preventDefault();
        this.state.cycleTarget = true;
      }

      // Pause (Escape key)
      if (e.code === 'Escape') {
        e.preventDefault();
        this.state.pause = true;
      }

      // Clear target (X key)
      if (e.code === 'KeyX') {
        this.state.clearTarget = true;
      }
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.code);

      if (e.code === 'Space') {
        this.state.jumping = false;
      }

      if (e.code === 'KeyE' || e.code === 'KeyQ') {
        this.state.secondaryAbility = false;
      }

      if (e.code === 'Tab') {
        this.state.cycleTarget = false;
      }

      if (e.code === 'Escape') {
        this.state.pause = false;
      }

      if (e.code === 'KeyX') {
        this.state.clearTarget = false;
      }
    });
  }

  private setupMouse(): void {
    // Pointer lock for desktop aiming
    this.canvas.addEventListener('click', () => {
      if (!this.isTouchDevice() && !this.isPointerLocked) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
    });

    // Mouse movement for aiming
    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.isPointerLocked) {
        this.state.aimX += e.movementX * 0.002;
        this.state.aimY = Math.max(
          -Math.PI / 3,
          Math.min(Math.PI / 3, this.state.aimY - e.movementY * 0.002)
        );
      }
    });

    // Mouse click for shooting
    document.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 0 && this.isPointerLocked) {
        this.state.shooting = true;
      }
    });

    document.addEventListener('mouseup', (e: MouseEvent) => {
      if (e.button === 0) {
        this.state.shooting = false;
      }
    });
  }

  private setupTouch(): void {
    if (!this.isTouchDevice()) return;

    const joystickZone = document.getElementById('joystick-zone');
    const shootBtn = document.getElementById('shoot-btn');
    const abilityBtn = document.getElementById('ability-btn');

    if (joystickZone) {
      this.joystick = nipplejs.create({
        zone: joystickZone,
        mode: 'static',
        position: { left: '100px', bottom: '100px' },
        color: 'rgba(74, 144, 226, 0.5)',
        size: 150 // Bigger joystick
      });

      this.joystick.on('move', (_evt: unknown, data: JoystickOutputData) => {
        if (!this.shouldProcessInput()) return;

        const force = Math.min(data.force, 1);
        const angle = data.angle.radian;

        this.state.moveX = Math.cos(angle) * force;
        this.state.moveZ = -Math.sin(angle) * force;
      });

      this.joystick.on('end', () => {
        this.state.moveX = 0;
        this.state.moveZ = 0;
      });
    }

    if (shootBtn) {
      // Track shoot button touch separately for multi-touch support
      let shootTouchId: number | null = null;

      shootBtn.addEventListener('touchstart', (e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          shootTouchId = e.changedTouches[i].identifier;
          this.state.shooting = true;
          break;
        }
      }, { passive: false });

      shootBtn.addEventListener('touchend', (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === shootTouchId) {
            shootTouchId = null;
            this.state.shooting = false;
            break;
          }
        }
      }, { passive: false });

      shootBtn.addEventListener('touchcancel', (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === shootTouchId) {
            shootTouchId = null;
            this.state.shooting = false;
            break;
          }
        }
      }, { passive: true });
    }

    // Ability button for secondary ability
    if (abilityBtn) {
      let abilityTouchId: number | null = null;

      abilityBtn.addEventListener('touchstart', (e: TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();
        for (let i = 0; i < e.changedTouches.length; i++) {
          abilityTouchId = e.changedTouches[i].identifier;
          this.state.secondaryAbility = true;
          break;
        }
      }, { passive: false });

      abilityBtn.addEventListener('touchend', (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === abilityTouchId) {
            abilityTouchId = null;
            this.state.secondaryAbility = false;
            break;
          }
        }
      }, { passive: false });

      abilityBtn.addEventListener('touchcancel', (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === abilityTouchId) {
            abilityTouchId = null;
            this.state.secondaryAbility = false;
            break;
          }
        }
      }, { passive: true });
    }

    // Right side touch drag for camera rotation
    this.setupCameraTouchControl();

    // Tap detection for targeting (anywhere on screen that's not a button)
    this.setupTapTargeting();
  }

  private setupCameraTouchControl(): void {
    let lastTouchX = 0;
    let lastTouchY = 0;
    let cameraTouchId: number | null = null;
    let isCameraTouchActive = false;

    // Use the canvas for camera touch on right side of screen
    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      // Don't capture if we already have a camera touch
      if (cameraTouchId !== null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        // Only use touches on right 50% of screen for camera (leave left for joystick)
        if (touch.clientX > window.innerWidth * 0.5) {
          cameraTouchId = touch.identifier;
          lastTouchX = touch.clientX;
          lastTouchY = touch.clientY;
          isCameraTouchActive = true;
          break;
        }
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      if (cameraTouchId === null || !isCameraTouchActive) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === cameraTouchId) {
          const deltaX = touch.clientX - lastTouchX;
          const deltaY = touch.clientY - lastTouchY;

          // Rotate camera - very low sensitivity for precise control
          // Full screen swipe = ~60 degree turn
          const sensitivity = 0.0008;
          this.state.aimX += deltaX * sensitivity;
          this.state.aimY = Math.max(
            -Math.PI / 4,
            Math.min(Math.PI / 4, this.state.aimY - deltaY * sensitivity)
          );

          lastTouchX = touch.clientX;
          lastTouchY = touch.clientY;
          break;
        }
      }
    }, { passive: true });

    const endCameraTouch = (e: TouchEvent) => {
      if (cameraTouchId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === cameraTouchId) {
          cameraTouchId = null;
          isCameraTouchActive = false;
          break;
        }
      }
    };

    this.canvas.addEventListener('touchend', endCameraTouch, { passive: true });
    this.canvas.addEventListener('touchcancel', endCameraTouch, { passive: true });
  }

  private setupTapTargeting(): void {
    let tapStartX = 0;
    let tapStartY = 0;
    let tapStartTime = 0;
    const maxTapMovement = 20; // pixels
    const maxTapDuration = 300; // ms

    this.canvas.addEventListener('touchstart', (e: TouchEvent) => {
      const touch = e.touches[0];
      tapStartX = touch.clientX;
      tapStartY = touch.clientY;
      tapStartTime = Date.now();
    }, { passive: true });

    this.canvas.addEventListener('touchend', (e: TouchEvent) => {
      if (e.changedTouches.length === 0) return;

      const touch = e.changedTouches[0];
      const tapEndX = touch.clientX;
      const tapEndY = touch.clientY;
      const tapDuration = Date.now() - tapStartTime;

      // Check if it was a tap (not a drag)
      const distance = Math.sqrt(
        Math.pow(tapEndX - tapStartX, 2) +
        Math.pow(tapEndY - tapStartY, 2)
      );

      if (distance < maxTapMovement && tapDuration < maxTapDuration) {
        // It's a tap! Store the screen coordinates for targeting
        this.state.targetScreenX = tapEndX;
        this.state.targetScreenY = tapEndY;

        // Clear after one frame
        setTimeout(() => {
          this.state.targetScreenX = undefined;
          this.state.targetScreenY = undefined;
        }, 100);
      }
    }, { passive: true });
  }

  async requestGyroPermission(): Promise<boolean> {
    if (!('DeviceOrientationEvent' in window)) {
      return false;
    }

    // iOS 13+ requires permission
    const DeviceOrientationEventTyped = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof DeviceOrientationEventTyped.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEventTyped.requestPermission();
        if (permission === 'granted') {
          this.enableGyro();
          return true;
        }
        return false;
      } catch {
        return false;
      }
    } else {
      // Android and older iOS
      this.enableGyro();
      return true;
    }
  }

  private enableGyro(): void {
    this.gyroEnabled = true;

    window.addEventListener('deviceorientation', (e: DeviceOrientationEvent) => {
      if (!this.shouldProcessInput()) return;

      this.gyroState.alpha = e.alpha ?? 0;
      this.gyroState.beta = e.beta ?? 0;
      this.gyroState.gamma = e.gamma ?? 0;

      // Use gamma (left/right tilt) for horizontal aim
      // Use beta (forward/back tilt) for vertical aim
      this.state.aimX += (this.gyroState.gamma / 90) * 0.02;
      this.state.aimY = Math.max(
        -Math.PI / 3,
        Math.min(Math.PI / 3, (this.gyroState.beta - 45) / 90 * Math.PI / 2)
      );
    });
  }

  private shouldProcessInput(): boolean {
    const now = performance.now();
    if (now - this.lastInputTime < this.throttleInterval) {
      return false;
    }
    this.lastInputTime = now;
    return true;
  }

  private isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  update(): void {
    // Process keyboard input for movement
    let moveX = 0;
    let moveZ = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveZ += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveX += 1;

    // On desktop (non-touch), always use keyboard state
    // On touch devices, only override if keyboard is active
    if (!this.isTouchDevice()) {
      // Desktop: always apply keyboard state (including 0,0 when no keys pressed)
      if (moveX !== 0 || moveZ !== 0) {
        const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
        this.state.moveX = moveX / length;
        this.state.moveZ = moveZ / length;
      } else {
        this.state.moveX = 0;
        this.state.moveZ = 0;
      }
    } else if (moveX !== 0 || moveZ !== 0) {
      // Touch device with keyboard: only override when keys pressed
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      this.state.moveX = moveX / length;
      this.state.moveZ = moveZ / length;
    }

    // Camera aim values persist - they represent absolute rotation, not deltas
    // Touch and mouse controls update them incrementally
  }

  getState(): Readonly<InputState> {
    // Sanitize before returning
    this.sanitizeInput();
    return this.state;
  }

  /**
   * Sanitize input values to prevent:
   * - NaN/Infinity values from corrupting game state
   * - Out-of-bounds values that could cause unexpected behavior
   * - Potential exploits through extreme input values
   */
  private sanitizeInput(): void {
    // Clamp movement to [-1, 1]
    this.state.moveX = this.clampSafe(this.state.moveX, -InputManager.MOVE_CLAMP, InputManager.MOVE_CLAMP);
    this.state.moveZ = this.clampSafe(this.state.moveZ, -InputManager.MOVE_CLAMP, InputManager.MOVE_CLAMP);

    // Wrap aim X to reasonable range (prevent accumulation over time)
    if (Math.abs(this.state.aimX) > InputManager.AIM_X_MAX) {
      this.state.aimX = this.state.aimX % (Math.PI * 2);
    }

    // Clamp aim Y to vertical look limits
    this.state.aimY = this.clampSafe(this.state.aimY, InputManager.AIM_Y_MIN, InputManager.AIM_Y_MAX);
  }

  /**
   * Safe clamp that handles NaN and Infinity
   */
  private clampSafe(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(min, Math.min(max, value));
  }

  isGyroEnabled(): boolean {
    return this.gyroEnabled;
  }

  dispose(): void {
    if (this.joystick) {
      this.joystick.destroy();
      this.joystick = null;
    }

    this.keys.clear();
  }
}

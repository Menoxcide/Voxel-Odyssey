import nipplejs, { JoystickManager, JoystickOutputData } from 'nipplejs';

export interface InputState {
  moveX: number;
  moveZ: number;
  aimX: number;
  aimY: number;
  shooting: boolean;
  jumping: boolean;
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
    jumping: false
  };

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
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.code);

      if (e.code === 'Space') {
        this.state.jumping = false;
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
      shootBtn.addEventListener('touchstart', (e: TouchEvent) => {
        e.preventDefault();
        if (this.shouldProcessInput()) {
          this.state.shooting = true;
        }
      }, { passive: false });

      shootBtn.addEventListener('touchend', (e: TouchEvent) => {
        e.preventDefault();
        this.state.shooting = false;
      }, { passive: false });
    }

    // Right side touch drag for camera rotation
    this.setupCameraTouchControl();
  }

  private setupCameraTouchControl(): void {
    let lastTouchX = 0;
    let lastTouchY = 0;
    let cameraTouchId: number | null = null;

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
          break;
        }
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e: TouchEvent) => {
      if (cameraTouchId === null) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === cameraTouchId) {
          const deltaX = touch.clientX - lastTouchX;
          const deltaY = touch.clientY - lastTouchY;

          // Rotate camera - matches finger movement speed
          // Swipe across half the screen width = 90 degree turn
          const sensitivity = 0.002;
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
          break;
        }
      }
    };

    this.canvas.addEventListener('touchend', endCameraTouch, { passive: true });
    this.canvas.addEventListener('touchcancel', endCameraTouch, { passive: true });
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

    // Only override touch input if keyboard is active
    if (moveX !== 0 || moveZ !== 0) {
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      this.state.moveX = moveX / length;
      this.state.moveZ = moveZ / length;
    }
  }

  getState(): Readonly<InputState> {
    return this.state;
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

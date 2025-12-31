export type UpdateCallback = (delta: number) => void;
export type FixedUpdateCallback = (fixedDelta: number) => void;
export type RenderCallback = (alpha: number) => void;

export class GameLoop {
  private readonly fixedTimeStep = 1 / 60; // 60Hz physics
  private readonly maxFrameTime = 0.1; // Cap to prevent spiral of death

  private accumulator = 0;
  private lastTime = 0;
  private running = false;
  private rafId: number | null = null;

  private readonly updateCallbacks: UpdateCallback[] = [];
  private readonly fixedUpdateCallbacks: FixedUpdateCallback[] = [];
  private readonly renderCallbacks: RenderCallback[] = [];

  // Performance monitoring
  private frameCount = 0;
  private fpsTime = 0;
  private currentFps = 0;

  constructor() {
    this.tick = this.tick.bind(this);
  }

  start(): void {
    if (this.running) return;

    this.running = true;
    this.lastTime = performance.now() / 1000;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private tick(timestamp: number): void {
    if (!this.running) return;

    const currentTime = timestamp / 1000;
    let frameTime = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Cap frame time to prevent spiral of death
    if (frameTime > this.maxFrameTime) {
      frameTime = this.maxFrameTime;
    }

    // FPS calculation
    this.frameCount++;
    this.fpsTime += frameTime;
    if (this.fpsTime >= 1) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime -= 1;
    }

    // Variable update (input, animations, etc.)
    for (const callback of this.updateCallbacks) {
      callback(frameTime);
    }

    // Fixed timestep physics updates
    this.accumulator += frameTime;

    while (this.accumulator >= this.fixedTimeStep) {
      for (const callback of this.fixedUpdateCallbacks) {
        callback(this.fixedTimeStep);
      }
      this.accumulator -= this.fixedTimeStep;
    }

    // Render with interpolation alpha
    const alpha = this.accumulator / this.fixedTimeStep;
    for (const callback of this.renderCallbacks) {
      callback(alpha);
    }

    this.rafId = requestAnimationFrame(this.tick);
  }

  onUpdate(callback: UpdateCallback): void {
    this.updateCallbacks.push(callback);
  }

  onFixedUpdate(callback: FixedUpdateCallback): void {
    this.fixedUpdateCallbacks.push(callback);
  }

  onRender(callback: RenderCallback): void {
    this.renderCallbacks.push(callback);
  }

  removeUpdate(callback: UpdateCallback): void {
    const index = this.updateCallbacks.indexOf(callback);
    if (index !== -1) {
      this.updateCallbacks.splice(index, 1);
    }
  }

  removeFixedUpdate(callback: FixedUpdateCallback): void {
    const index = this.fixedUpdateCallbacks.indexOf(callback);
    if (index !== -1) {
      this.fixedUpdateCallbacks.splice(index, 1);
    }
  }

  removeRender(callback: RenderCallback): void {
    const index = this.renderCallbacks.indexOf(callback);
    if (index !== -1) {
      this.renderCallbacks.splice(index, 1);
    }
  }

  getFps(): number {
    return this.currentFps;
  }

  isRunning(): boolean {
    return this.running;
  }

  dispose(): void {
    this.stop();
    this.updateCallbacks.length = 0;
    this.fixedUpdateCallbacks.length = 0;
    this.renderCallbacks.length = 0;
  }
}

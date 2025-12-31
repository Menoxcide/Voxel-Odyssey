import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

// Particle pool for efficiency
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  size: number;
  active: boolean;
}

export class ParticleSystem {
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly points: THREE.Points;
  private readonly particles: Particle[];
  private readonly maxParticles: number;

  // Buffer attributes
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;

  constructor(maxParticles: number = 1000) {
    this.maxParticles = maxParticles;
    this.particles = [];

    // Initialize particle pool
    for (let i = 0; i < maxParticles; i++) {
      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        color: new THREE.Color(),
        life: 0,
        maxLife: 1,
        size: 1,
        active: false
      });
    }

    // Create buffer geometry
    this.positions = new Float32Array(maxParticles * 3);
    this.colors = new Float32Array(maxParticles * 3);
    this.sizes = new Float32Array(maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Create material
    this.material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  emit(
    position: THREE.Vector3,
    count: number,
    color: number,
    spread: number = 1,
    speed: number = 2,
    lifetime: number = 1
  ): void {
    let emitted = 0;

    for (let i = 0; i < this.maxParticles && emitted < count; i++) {
      const particle = this.particles[i];

      if (!particle.active) {
        particle.position.copy(position);
        particle.velocity.set(
          (Math.random() - 0.5) * spread,
          Math.random() * spread,
          (Math.random() - 0.5) * spread
        ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.5));

        particle.color.setHex(color);
        particle.life = lifetime;
        particle.maxLife = lifetime;
        particle.size = 0.2 + Math.random() * 0.3;
        particle.active = true;

        emitted++;
      }
    }
  }

  // Emit magic trail effect
  emitTrail(position: THREE.Vector3, color: number): void {
    this.emit(position, 3, color, 0.2, 0.5, 0.5);
  }

  // Emit hit sparks
  emitHitSparks(position: THREE.Vector3, color: number = 0xffffff): void {
    this.emit(position, 15, color, 2, 5, 0.3);
  }

  // Emit explosion
  emitExplosion(position: THREE.Vector3, color: number): void {
    this.emit(position, 50, color, 3, 8, 0.8);
  }

  update(delta: number): void {
    let activeCount = 0;

    for (let i = 0; i < this.maxParticles; i++) {
      const particle = this.particles[i];

      if (particle.active) {
        particle.life -= delta;

        if (particle.life <= 0) {
          particle.active = false;
          continue;
        }

        // Update physics
        particle.velocity.y -= 5 * delta; // Gravity
        particle.position.addScaledVector(particle.velocity, delta);

        // Update buffers
        const i3 = activeCount * 3;
        this.positions[i3] = particle.position.x;
        this.positions[i3 + 1] = particle.position.y;
        this.positions[i3 + 2] = particle.position.z;

        // Fade color based on life
        const lifeRatio = particle.life / particle.maxLife;
        this.colors[i3] = particle.color.r * lifeRatio;
        this.colors[i3 + 1] = particle.color.g * lifeRatio;
        this.colors[i3 + 2] = particle.color.b * lifeRatio;

        this.sizes[activeCount] = particle.size * lifeRatio;

        activeCount++;
      }
    }

    // Update geometry
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.setDrawRange(0, activeCount);
  }

  getPoints(): THREE.Points {
    return this.points;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// Post-processing effects manager
export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private enabled = true;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera
  ) {
    this.composer = new EffectComposer(renderer);

    // Render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Bloom pass (subtle glow)
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.3,  // Strength
      0.4,  // Radius
      0.85  // Threshold
    );
    this.composer.addPass(this.bloomPass);
  }

  render(): void {
    if (this.enabled) {
      this.composer.render();
    }
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  setBloomStrength(strength: number): void {
    this.bloomPass.strength = strength;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  dispose(): void {
    this.composer.dispose();
  }
}

// Screen shake effect
export class ScreenShake {
  private intensity = 0;
  private readonly decay = 5;
  private readonly originalPosition = new THREE.Vector3();

  shake(amount: number): void {
    this.intensity = Math.max(this.intensity, amount);
  }

  update(delta: number, camera: THREE.Camera): void {
    if (this.intensity > 0.01) {
      // Store original if not shaking
      if (this.intensity === this.intensity) {
        this.originalPosition.copy(camera.position);
      }

      // Apply shake
      camera.position.x += (Math.random() - 0.5) * this.intensity;
      camera.position.y += (Math.random() - 0.5) * this.intensity;

      // Decay
      this.intensity *= Math.pow(0.1, delta * this.decay);

      if (this.intensity < 0.01) {
        this.intensity = 0;
      }
    }
  }

  getIntensity(): number {
    return this.intensity;
  }
}

// Hit stop effect (brief freeze on impact)
export class HitStop {
  private freezeTime = 0;
  private timeScale = 1;

  trigger(duration: number = 0.05): void {
    this.freezeTime = duration;
    this.timeScale = 0.1;
  }

  update(delta: number): number {
    if (this.freezeTime > 0) {
      this.freezeTime -= delta;

      if (this.freezeTime <= 0) {
        this.timeScale = 1;
      }

      return delta * this.timeScale;
    }

    return delta;
  }

  isActive(): boolean {
    return this.freezeTime > 0;
  }
}

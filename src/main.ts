import * as THREE from 'three';
import './styles/global.scss';
import { GameLoop } from './core/GameLoop';
import { InputManager } from './systems/InputManager';

class VoxelOdyssey {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly gameLoop: GameLoop;
  private readonly inputManager: InputManager;

  // Test cube for Phase 1 validation
  private readonly testCube: THREE.Mesh;

  constructor() {
    // Get canvas element
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    if (!canvas) {
      throw new Error('Canvas element not found');
    }

    // Initialize renderer with mobile optimizations
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // Disabled for mobile performance
      powerPreference: 'high-performance',
      stencil: false
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x1a1a2e);

    // Initialize scene
    this.scene = new THREE.Scene();

    // Create gradient skybox using shader
    this.createSkybox();

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 2, 5);
    this.camera.lookAt(0, 0, 0);

    // Add lighting
    this.setupLighting();

    // Create test cube
    this.testCube = this.createTestCube();

    // Initialize systems
    this.gameLoop = new GameLoop();
    this.inputManager = new InputManager(canvas);

    // Setup game loop callbacks
    this.gameLoop.onUpdate(this.update.bind(this));
    this.gameLoop.onRender(this.render.bind(this));

    // Handle window resize
    window.addEventListener('resize', this.onResize.bind(this));

    // Hide loading screen
    this.hideLoading();

    // Start the game loop
    this.gameLoop.start();

    console.log('Voxel Odyssey initialized - Phase 1 complete!');
  }

  private createSkybox(): void {
    // Gradient sky using a large sphere with shader material
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x0f0f23) },
        bottomColor: { value: new THREE.Color(0x1a1a2e) },
        offset: { value: 20 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });

    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    this.scene.add(sky);
  }

  private setupLighting(): void {
    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambientLight);

    // Directional light for shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;

    // Shadow map settings (optimized for mobile)
    directionalLight.shadow.mapSize.width = 512;
    directionalLight.shadow.mapSize.height = 512;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;

    this.scene.add(directionalLight);

    // Subtle point light for player glow effect
    const playerGlow = new THREE.PointLight(0x4a90e2, 0.5, 10);
    playerGlow.position.set(0, 1, 0);
    this.scene.add(playerGlow);
  }

  private createTestCube(): THREE.Mesh {
    // Create procedural voxel-style cube
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a90e2,
      flatShading: true,
      metalness: 0,
      roughness: 0.8
    });

    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    cube.receiveShadow = true;

    this.scene.add(cube);

    // Add ground plane
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      flatShading: true,
      metalness: 0,
      roughness: 1
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;

    this.scene.add(ground);

    return cube;
  }

  private update(delta: number): void {
    // Update input manager
    this.inputManager.update();

    // Rotate test cube
    this.testCube.rotation.x += delta * 0.5;
    this.testCube.rotation.y += delta * 0.8;

    // Move cube based on input
    const input = this.inputManager.getState();
    this.testCube.position.x += input.moveX * delta * 3;
    this.testCube.position.z += input.moveZ * delta * 3;

    // Change cube color when shooting
    const material = this.testCube.material as THREE.MeshStandardMaterial;
    if (input.shooting) {
      material.color.setHex(0xa855f7); // Purple when shooting
      material.emissive.setHex(0x4a2080);
    } else {
      material.color.setHex(0x4a90e2); // Blue normally
      material.emissive.setHex(0x000000);
    }
  }

  private render(_alpha: number): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }

  private hideLoading(): void {
    const loading = document.getElementById('loading');
    if (loading) {
      loading.classList.add('hidden');
      setTimeout(() => {
        loading.remove();
      }, 300);
    }
  }

  dispose(): void {
    this.gameLoop.dispose();
    this.inputManager.dispose();

    // Dispose Three.js resources
    this.testCube.geometry.dispose();
    (this.testCube.material as THREE.Material).dispose();

    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });

    this.renderer.dispose();
  }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new VoxelOdyssey();
});

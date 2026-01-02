import * as THREE from 'three';
import { ClassColors } from '../game/classes/ClassConfig';

// Default color palette (Mage class)
const PLAYER_COLORS: ClassColors = {
  primary: 0x4a90e2,
  secondary: 0x2c5aa0,
  staff: 0x78350f,
  orb: 0x60a5fa,
  orbEmissive: 0x3b82f6
};

const BOSS_COLORS: ClassColors = {
  primary: 0xa855f7,
  secondary: 0x7c3aed,
  staff: 0x581c87,
  orb: 0xc084fc,
  orbEmissive: 0xa855f7
};

export interface CharacterAnimationState {
  idle: boolean;
  walking: boolean;
  attacking: boolean;
  damaged: boolean;
}

export class CharacterModel {
  protected readonly group: THREE.Group;
  protected readonly head: THREE.Mesh;
  protected readonly body: THREE.Mesh;
  protected readonly staff: THREE.Group;
  protected readonly orb: THREE.Mesh;

  // Animation state
  protected animationTime = 0;
  protected readonly bobSpeed = 3;
  protected readonly bobAmount = 0.1;
  protected walkCycle = 0;
  protected isWalking = false;
  protected isAttacking = false;
  protected attackProgress = 0;

  // Damage flash
  protected damageFlashTime = 0;
  protected readonly materials: THREE.MeshStandardMaterial[] = [];

  protected colors: ClassColors;

  constructor(colors: ClassColors = PLAYER_COLORS) {
    this.group = new THREE.Group();
    this.colors = colors;

    // Create head (dodecahedron - IcosahedronGeometry with subdivision)
    const headGeometry = new THREE.IcosahedronGeometry(0.5, 1);
    const headMaterial = new THREE.MeshStandardMaterial({
      color: colors.primary,
      flatShading: true,
      metalness: 0,
      roughness: 0.7
    });
    this.head = new THREE.Mesh(headGeometry, headMaterial);
    this.head.position.y = 1.8;
    this.head.castShadow = true;
    this.materials.push(headMaterial);

    // Create body (cone)
    const bodyGeometry = new THREE.ConeGeometry(0.4, 1.2, 8);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: colors.secondary,
      flatShading: true,
      metalness: 0,
      roughness: 0.8
    });
    this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.body.position.y = 0.8;
    this.body.castShadow = true;
    this.materials.push(bodyMaterial);

    // Create staff group
    this.staff = new THREE.Group();
    this.staff.position.set(0.6, 1.0, 0);
    this.staff.rotation.z = -Math.PI / 6;

    // Staff cylinder
    const staffGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8);
    const staffMaterial = new THREE.MeshStandardMaterial({
      color: colors.staff,
      flatShading: true,
      metalness: 0.2,
      roughness: 0.6
    });
    const staffMesh = new THREE.Mesh(staffGeometry, staffMaterial);
    staffMesh.castShadow = true;
    this.materials.push(staffMaterial);

    // Glowing orb at staff tip
    const orbGeometry = new THREE.SphereGeometry(0.15, 8, 8);
    const orbMaterial = new THREE.MeshStandardMaterial({
      color: colors.orb,
      emissive: colors.orbEmissive,
      emissiveIntensity: 0.5,
      flatShading: true,
      metalness: 0.3,
      roughness: 0.2
    });
    this.orb = new THREE.Mesh(orbGeometry, orbMaterial);
    this.orb.position.y = 0.85;
    this.materials.push(orbMaterial);

    // Add point light to orb
    const orbLight = new THREE.PointLight(colors.orbEmissive, 0.5, 5);
    orbLight.position.copy(this.orb.position);
    this.staff.add(orbLight);

    this.staff.add(staffMesh);
    this.staff.add(this.orb);

    // Assemble character
    this.group.add(this.head);
    this.group.add(this.body);
    this.group.add(this.staff);
  }

  getColors(): ClassColors {
    return this.colors;
  }

  update(delta: number, velocity: THREE.Vector3): void {
    this.animationTime += delta;

    // Determine if walking based on velocity
    this.isWalking = velocity.lengthSq() > 0.01;

    // Idle bob animation
    if (!this.isWalking) {
      const bobOffset = Math.sin(this.animationTime * this.bobSpeed) * this.bobAmount;
      this.head.position.y = 1.8 + bobOffset;
      this.body.position.y = 0.8 + bobOffset * 0.5;
    } else {
      // Walking animation
      this.walkCycle += delta * 10;
      const walkBob = Math.abs(Math.sin(this.walkCycle)) * 0.15;
      this.head.position.y = 1.8 + walkBob;
      this.body.position.y = 0.8 + walkBob * 0.5;

      // Slight body tilt in movement direction
      if (velocity.lengthSq() > 0.01) {
        const angle = Math.atan2(velocity.x, velocity.z);
        this.group.rotation.y = THREE.MathUtils.lerp(
          this.group.rotation.y,
          angle,
          delta * 10
        );
      }
    }

    // Attack animation
    if (this.isAttacking) {
      this.attackProgress += delta * 5;

      if (this.attackProgress < 0.5) {
        // Wind up
        this.staff.rotation.z = -Math.PI / 6 - this.attackProgress * Math.PI / 3;
      } else if (this.attackProgress < 1) {
        // Strike
        const t = (this.attackProgress - 0.5) * 2;
        this.staff.rotation.z = -Math.PI / 6 - Math.PI / 3 * (1 - t);
      } else {
        // Reset
        this.isAttacking = false;
        this.attackProgress = 0;
        this.staff.rotation.z = -Math.PI / 6;
      }

      // Orb glow during attack
      const orbMaterial = this.orb.material as THREE.MeshStandardMaterial;
      orbMaterial.emissiveIntensity = 0.5 + Math.sin(this.attackProgress * Math.PI) * 0.5;
    }

    // Damage flash
    if (this.damageFlashTime > 0) {
      this.damageFlashTime -= delta;
      const flash = Math.sin(this.damageFlashTime * 30) > 0;

      this.materials.forEach((mat) => {
        mat.emissive.setHex(flash ? 0xff0000 : 0x000000);
        mat.emissiveIntensity = flash ? 0.5 : 0;
      });

      if (this.damageFlashTime <= 0) {
        this.materials.forEach((mat) => {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        });
      }
    }
  }

  attack(): void {
    if (!this.isAttacking) {
      this.isAttacking = true;
      this.attackProgress = 0;
    }
  }

  takeDamage(): void {
    this.damageFlashTime = 0.5;
  }

  setPosition(x: number, y: number, z: number): void {
    this.group.position.set(x, y, z);
  }

  getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  setRotation(y: number): void {
    this.group.rotation.y = y;
  }

  getRotation(): number {
    return this.group.rotation.y;
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  getOrbWorldPosition(): THREE.Vector3 {
    const worldPos = new THREE.Vector3();
    this.orb.getWorldPosition(worldPos);
    return worldPos;
  }

  dispose(): void {
    this.head.geometry.dispose();
    this.body.geometry.dispose();

    this.staff.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });

    this.materials.forEach((mat) => mat.dispose());
  }
}

// Boss character with additional features
export class BossModel extends CharacterModel {
  private readonly leftEar: THREE.Mesh;
  private readonly rightEar: THREE.Mesh;
  private readonly tail: THREE.Mesh;

  constructor() {
    super(BOSS_COLORS);

    // Scale up the boss
    this.group.scale.setScalar(1.5);

    // Add ears (boxes)
    const earGeometry = new THREE.BoxGeometry(0.2, 0.4, 0.1);
    const earMaterial = new THREE.MeshStandardMaterial({
      color: BOSS_COLORS.primary,
      flatShading: true
    });

    this.leftEar = new THREE.Mesh(earGeometry, earMaterial);
    this.leftEar.position.set(-0.35, 2.2, 0);
    this.leftEar.rotation.z = Math.PI / 6;
    this.leftEar.castShadow = true;

    this.rightEar = new THREE.Mesh(earGeometry, earMaterial);
    this.rightEar.position.set(0.35, 2.2, 0);
    this.rightEar.rotation.z = -Math.PI / 6;
    this.rightEar.castShadow = true;

    this.group.add(this.leftEar);
    this.group.add(this.rightEar);
    this.materials.push(earMaterial);

    // Add tail (tube/cylinder)
    const tailGeometry = new THREE.CylinderGeometry(0.08, 0.04, 1, 8);
    const tailMaterial = new THREE.MeshStandardMaterial({
      color: BOSS_COLORS.secondary,
      flatShading: true
    });

    this.tail = new THREE.Mesh(tailGeometry, tailMaterial);
    this.tail.position.set(0, 0.5, -0.5);
    this.tail.rotation.x = Math.PI / 3;
    this.tail.castShadow = true;

    this.group.add(this.tail);
    this.materials.push(tailMaterial);
  }

  override update(delta: number, velocity: THREE.Vector3): void {
    super.update(delta, velocity);

    // Ear wiggle animation
    const earWiggle = Math.sin(this.animationTime * 4) * 0.1;
    this.leftEar.rotation.z = Math.PI / 6 + earWiggle;
    this.rightEar.rotation.z = -Math.PI / 6 - earWiggle;

    // Tail sway
    const tailSway = Math.sin(this.animationTime * 3) * 0.2;
    this.tail.rotation.y = tailSway;
  }

  override dispose(): void {
    super.dispose();
    this.leftEar.geometry.dispose();
    this.rightEar.geometry.dispose();
    this.tail.geometry.dispose();
  }
}

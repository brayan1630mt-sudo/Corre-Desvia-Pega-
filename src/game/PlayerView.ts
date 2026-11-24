import * as THREE from "three";
import { ARENA, PALETTE, PLAYER_MOVEMENT, PARKOUR } from "../shared/constants.ts";
import { lerp, shortestAngle } from "../shared/math.ts";
import type { PlayerInput, PlayerSnapshot, PlayerState } from "../shared/types.ts";

const AVATAR_SCALE = 0.94;
const FADE_DISTANCE = 70;

export class PlayerView {
  readonly id: string;
  readonly group: THREE.Group;
  private readonly body: THREE.Group;
  private readonly torso: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly headGroup: THREE.Group;
  private readonly leftArm: THREE.Group;
  private readonly rightArm: THREE.Group;
  private readonly leftLeg: THREE.Group;
  private readonly rightLeg: THREE.Group;
  private readonly shadow: THREE.Mesh;
  private readonly tagRing: THREE.Mesh;
  private readonly freezeRing: THREE.Mesh;
  private readonly grappleLine: THREE.Line;
  private readonly color: THREE.Color;
  private grappleAnchor: THREE.Vector3 | null = null;
  private requestedVisible = true;
  private invisible = false;
  private readonly target = new THREE.Vector3();
  private readonly targetRotation = new THREE.Euler();
  private strideTime = 0;
  private gaitAmount = 0;
  private jumpAmount = 0;
  private dashAmount = 0;
  private targetPitch = 0;
  private moving = false;
  private sprinting = false;
  private dashing = false;
  private isIt = false;
  private sliding = false;
  private wallRunning = false;
  private wallRunSide: -1 | 0 | 1 = 0;
  private vaulting = false;
  private eliminated = false;
  private disposed = false;

  constructor(player: PlayerState, scene: THREE.Scene) {
    this.id = player.id;
    this.color = new THREE.Color(player.color);
    this.group = new THREE.Group();
    this.group.name = `jogador-${player.name}`;
    this.body = new THREE.Group();
    this.body.scale.setScalar(AVATAR_SCALE);
    this.group.add(this.body);
    this.torso = this.createTorso();
    this.head = this.createHead();
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 1.89;
    this.headGroup.add(this.head, ...this.createFace());
    this.leftArm = this.createLimb("arm", -0.54, 1.27);
    this.rightArm = this.createLimb("arm", 0.54, 1.27);
    this.leftLeg = this.createLimb("leg", -0.23, 0.61);
    this.rightLeg = this.createLimb("leg", 0.23, 0.61);
    this.shadow = this.createShadow();
    this.tagRing = this.createTagRing();
    this.freezeRing = this.createFreezeRing();
    this.body.add(
      this.torso,
      this.headGroup,
      this.leftArm,
      this.rightArm,
      this.leftLeg,
      this.rightLeg,
    );
    this.group.add(this.shadow, this.tagRing, this.freezeRing);
    const grappleGeometry = new THREE.BufferGeometry();
    grappleGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(6), 3),
    );
    this.grappleLine = new THREE.Line(
      grappleGeometry,
      new THREE.LineBasicMaterial({
        color: PALETTE.gold,
        transparent: true,
        opacity: 0.88,
      }),
    );
    this.grappleLine.visible = false;
    scene.add(this.group);
    scene.add(this.grappleLine);
    this.applyState(player);
    this.setTagged(player.isIt);
  }

  update(deltaSeconds: number): void {
    if (this.disposed) {
      return;
    }
    const interpolation = 1 - Math.exp(-deltaSeconds * 14);
    this.group.position.lerp(this.target, interpolation);
    this.shadow.position.y = 0.025 - this.group.position.y;
    this.group.rotation.y = shortestAngle(
      this.group.rotation.y,
      this.targetRotation.y,
      interpolation,
    );
    this.headGroup.rotation.x = lerp(
      this.headGroup.rotation.x,
      this.targetPitch,
      interpolation,
    );
    if (this.isIt) {
      this.tagRing.rotation.z += deltaSeconds * 1.15;
      this.tagRing.scale.setScalar(1 + Math.sin(performance.now() * 0.008) * 0.07);
    }

    this.animateMovement(deltaSeconds);
    this.updateGrappleLine();
  }

  applyState(player: PlayerState): void {
    this.target.set(player.x, player.y, player.z);
    this.targetRotation.set(0, player.rotation, 0);
    this.targetPitch = player.pitch;
    this.moving = player.isMoving;
    this.sprinting = player.isSprinting;
    this.dashing = player.isDashing;
    this.sliding = player.isSliding;
    this.wallRunning = player.isWallRunning;
    this.wallRunSide = player.wallRunSide;
    this.vaulting = player.isVaulting;
    this.eliminated = player.isEliminated;
    this.setTagged(player.isIt);
    this.invisible = player.isInvisible;
    this.group.visible =
      this.requestedVisible && !this.invisible && !this.eliminated;
    this.freezeRing.visible = player.isFrozen;
    this.grappleAnchor = player.grappleAnchor
      ? new THREE.Vector3(
          player.grappleAnchor.x,
          player.grappleAnchor.y,
          player.grappleAnchor.z,
        )
      : null;
    this.grappleLine.visible = Boolean(this.grappleAnchor);
    this.group.userData.playerName = player.name;
  }

  setVisible(visible: boolean): void {
    this.requestedVisible = visible;
    this.group.visible = visible && !this.invisible;
  }

  setTagged(isIt: boolean): void {
    this.isIt = isIt;
    const material = this.tagRing.material as THREE.MeshBasicMaterial;
    material.color.set(isIt ? PALETTE.coral : PALETTE.gold);
    material.opacity = isIt ? 0.96 : 0;
    material.transparent = true;
    this.tagRing.visible = isIt && !this.eliminated;
    const headMaterial = this.head.material as THREE.MeshStandardMaterial;
    headMaterial.color.set(
      isIt
        ? PALETTE.coral
        : this.color.clone().lerp(new THREE.Color(PALETTE.paper), 0.52),
    );
  }

  setOpacity(distance: number): void {
    const opacity = lerp(1, 0.68, distance / FADE_DISTANCE);
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) {
        return;
      }
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if ("opacity" in material) {
          material.opacity = opacity;
          material.transparent = opacity < 1;
        }
      }
    });
  }

  getPosition(): THREE.Vector3 {
    return this.group.position;
  }

  predictMovement(
    input: PlayerInput,
    deltaSeconds: number,
    isSliding: boolean,
    isDashing: boolean,
  ): void {
    const length = Math.hypot(input.forward, input.right);
    if (length <= 0.001) return;
    const speed = isDashing
      ? PLAYER_MOVEMENT.dashSpeed
      : isSliding
        ? PARKOUR.slideSpeed
        : input.sprint
          ? PLAYER_MOVEMENT.sprintSpeed
          : PLAYER_MOVEMENT.walkSpeed;
    this.target.x +=
      (input.right / Math.max(1, length)) * speed * deltaSeconds;
    this.target.z -=
      (input.forward / Math.max(1, length)) * speed * deltaSeconds;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.group.parent?.remove(this.group);
    this.grappleLine.parent?.remove(this.grappleLine);
    this.grappleLine.geometry.dispose();
    const grappleMaterial = this.grappleLine.material as THREE.Material;
    grappleMaterial.dispose();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        material.dispose();
      }
    });
  }

  private createTorso(): THREE.Mesh {
    const geometry = new THREE.CapsuleGeometry(0.39, 0.7, 5, 10);
    geometry.scale(1, 0.9, 0.72);
    const material = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.58,
      metalness: 0.02,
    });
    const torso = new THREE.Mesh(geometry, material);
    torso.position.y = 1.19;
    torso.castShadow = true;
    torso.receiveShadow = true;
    return torso;
  }

  private createHead(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(0.39, 20, 16);
    const material = new THREE.MeshStandardMaterial({
      color: this.color.clone().lerp(new THREE.Color(PALETTE.paper), 0.52),
      roughness: 0.72,
    });
    const head = new THREE.Mesh(geometry, material);
    head.castShadow = true;
    return head;
  }

  private createFace(): THREE.Object3D[] {
    const eyeWhite = new THREE.MeshStandardMaterial({
      color: PALETTE.paper,
      roughness: 0.5,
    });
    const pupilMaterial = new THREE.MeshStandardMaterial({
      color: "#28343a",
      roughness: 0.56,
    });
    const noseMaterial = new THREE.MeshStandardMaterial({
      color: "#e5a487",
      roughness: 0.7,
    });
    const mouthMaterial = new THREE.MeshStandardMaterial({
      color: "#8e5e56",
      roughness: 0.78,
    });
    const features: THREE.Object3D[] = [];

    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.078, 12, 10),
        eyeWhite,
      );
      eye.position.set(side * 0.135, 0.055, -0.338);
      features.push(eye);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.037, 10, 8),
        pupilMaterial,
      );
      pupil.position.set(side * 0.135, 0.055, -0.401);
      features.push(pupil);
    }

    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.046, 10, 8),
      noseMaterial,
    );
    nose.position.set(0, -0.035, -0.389);
    features.push(nose);

    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.105, 0.025, 0.018),
      mouthMaterial,
    );
    mouth.position.set(0, -0.15, -0.367);
    features.push(mouth);
    return features;
  }

  private createLimb(kind: "arm" | "leg", x: number, y: number): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    const isArm = kind === "arm";
    const geometry = new THREE.CapsuleGeometry(
      isArm ? 0.13 : 0.17,
      isArm ? 0.55 : 0.55,
      4,
      8,
    );
    const material = new THREE.MeshStandardMaterial({
      color: isArm
        ? this.color.clone().lerp(new THREE.Color(PALETTE.paper), 0.16)
        : PALETTE.ink,
      roughness: 0.72,
    });
    const limb = new THREE.Mesh(geometry, material);
    limb.position.y = isArm ? -0.36 : -0.36;
    limb.castShadow = true;
    group.add(limb);

    if (!isArm) {
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.12, 0.39),
        new THREE.MeshStandardMaterial({ color: PALETTE.paper, roughness: 0.5 }),
      );
      shoe.position.set(0, -0.66, 0.08);
      shoe.castShadow = true;
      group.add(shoe);
    }
    return group;
  }

  private createShadow(): THREE.Mesh {
    const geometry = new THREE.CircleGeometry(ARENA.playerRadius * 1.3, 24);
    const material = new THREE.MeshBasicMaterial({
      color: "#24312b",
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(geometry, material);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    shadow.scale.set(1, 0.73, 1);
    return shadow;
  }

  private createTagRing(): THREE.Mesh {
    const geometry = new THREE.TorusGeometry(0.73, 0.09, 8, 36);
    const material = new THREE.MeshBasicMaterial({
      color: PALETTE.coral,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.position.y = 2.61;
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    return ring;
  }

  private createFreezeRing(): THREE.Mesh {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.68, 0.075, 8, 36),
      new THREE.MeshBasicMaterial({
        color: "#bdeeff",
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
    );
    ring.position.y = 0.16;
    ring.rotation.x = Math.PI / 2;
    ring.visible = false;
    return ring;
  }

  private updateGrappleLine(): void {
    if (!this.grappleAnchor) {
      this.grappleLine.visible = false;
      return;
    }
    const handOffset = new THREE.Vector3(0, 1.28, -0.15).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.group.rotation.y,
    );
    const start = this.group.position.clone().add(handOffset);
    const positions = this.grappleLine.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    positions.setXYZ(0, start.x, start.y, start.z);
    positions.setXYZ(
      1,
      this.grappleAnchor.x,
      this.grappleAnchor.y,
      this.grappleAnchor.z,
    );
    positions.needsUpdate = true;
    this.grappleLine.geometry.computeBoundingSphere();
    this.grappleLine.visible = true;
  }

  private animateMovement(deltaSeconds: number): void {
    const gaitTarget = this.dashing
      ? 0.88
      : this.moving
        ? this.sprinting
          ? 1
          : 0.52
        : 0;
    const jumpTarget = this.target.y > 0.04
      ? Math.min(1, this.target.y / 0.7)
      : 0;
    const smoothing = 1 - Math.exp(-deltaSeconds * 12);
    this.gaitAmount = lerp(this.gaitAmount, gaitTarget, smoothing);
    this.jumpAmount = lerp(this.jumpAmount, jumpTarget, smoothing);
    this.dashAmount = this.dashing
      ? 1
      : Math.max(0, this.dashAmount - deltaSeconds * 5.5);

    const cadence = this.dashing ? 17 : this.sprinting ? 13 : 8.5;
    this.strideTime += deltaSeconds * cadence;
    const stride = Math.sin(this.strideTime);
    const legSwing = stride * this.gaitAmount * (this.sprinting ? 0.58 : 0.32);
    const armSwing = legSwing * 0.72;
    const jumpTuck = this.jumpAmount * 0.42;
    const dashLean = this.dashAmount * 0.85;

    this.leftLeg.rotation.x = legSwing + jumpTuck;
    this.rightLeg.rotation.x = -legSwing + jumpTuck;
    this.leftArm.rotation.x = -armSwing - this.jumpAmount * 0.55 - dashLean;
    this.rightArm.rotation.x = armSwing - this.jumpAmount * 0.55 - dashLean;
    this.body.position.y =
      Math.abs(Math.sin(this.strideTime * 2)) * this.gaitAmount * 0.055 +
      Math.sin(this.strideTime * 0.12) *
        0.008 *
        (1 - this.gaitAmount) *
        (1 - this.jumpAmount);
    const bodyHeight = this.sliding ? 0.62 : 0.94;
    this.body.scale.y = lerp(this.body.scale.y, bodyHeight, smoothing);
    this.body.rotation.x =
      -this.dashAmount * 0.16 +
      this.jumpAmount * 0.025 -
      (this.vaulting ? 0.12 : 0);
    const wallLean = this.wallRunning ? this.wallRunSide * 0.2 : 0;
    this.body.rotation.z = lerp(
      this.body.rotation.z,
      wallLean + stride * this.gaitAmount * 0.025,
      smoothing,
    );
  }
}

export type PlayerViewState = PlayerSnapshot;

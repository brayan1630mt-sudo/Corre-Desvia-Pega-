import * as THREE from "three";
import {
  ARENA,
  ARENA_RAMPS,
  BUILDING_LADDERS,
  BUILDING_ROOF_THICKNESS,
  CLIMBABLE_PLATFORMS,
  ELEVATED_PLATFORM_THICKNESS,
  LADDER_RUNG_SPACING,
  LADDER_TOP_EXTENSION,
  OBSTACLES,
  PALETTE,
  POWER_UP_COLORS,
  VERTICAL_PLATFORMS,
} from "../shared/constants.ts";
import { seededRandom } from "../shared/math.ts";
import type {
  ArenaEffectState,
  PowerUpState,
  SnowballState,
} from "../shared/types.ts";

const SHADOW_MAP_SIZE = 2048;
const FOG_NEAR = 48;
const FOG_FAR = 112;
const PAVEMENT_GRAIN = ["#747a77", "#7f8581", "#898e89", "#959993"];
const ARENA_COLORS = {
  field: "#878c88",
  stone: "#a8ada9",
  fence: "#566064",
} as const;

export class Arena {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly world = new THREE.Group();
  private readonly container: HTMLElement;
  private readonly desiredCamera = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly floorMaterial: THREE.MeshStandardMaterial;
  private animationTime = 0;
  private cameraYaw = 0;
  private cameraPitch = 0;
  private cameraRoll = 0;
  private locomotionTime = 0;
  private armGaitAmount = 0;
  private armJumpAmount = 0;
  private armDashAmount = 0;
  private readonly firstPersonArms: THREE.Group;
  private readonly firstPersonArmGroups: Array<{
    group: THREE.Group;
    side: number;
  }> = [];
  private readonly armMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly powerUpGroup = new THREE.Group();
  private readonly powerUpMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly snowballViews = new Map<string, THREE.Mesh>();
  private readonly effectViews = new Map<string, THREE.Mesh>();
  private readonly effectBeams = new Map<string, THREE.Line>();
  private activePowerUpKey = "";
  private resizeObserver: ResizeObserver | null = null;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#aebdc3");
    this.scene.fog = new THREE.Fog("#bdc8ca", FOG_NEAR, FOG_FAR);
    this.camera = new THREE.PerspectiveCamera(
      74,
      window.innerWidth / window.innerHeight,
      0.1,
      220,
    );
    this.camera.position.set(0, 1.57, 19);
    this.camera.lookAt(0, 1.57, 7);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.domElement.className = "game-canvas";
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Visão em primeira pessoa da arena. Use WASD para se mover.",
    );
    this.container.append(this.renderer.domElement);
    this.floorMaterial = this.createFloorMaterial();
    this.firstPersonArms = this.createFirstPersonArms();
    this.camera.add(this.firstPersonArms);
    this.scene.add(this.world);
    this.scene.add(this.camera);
    this.addLighting();
    this.addGround();
    this.addArenaMarkings();
    this.addObstacles();
    this.addParkourPads();
    this.addClimbablePlatforms();
    this.addVerticalPlatforms();
    this.addRamps();
    this.addBuildingLadders();
    this.addLandscaping();
    this.addSkyDetails();
    this.createPowerUp();
    this.updateFirstPersonArmLayout();
    this.watchResize();
    this.render();
  }

  setCameraRotation(yaw: number, pitch: number): void {
    this.cameraYaw = yaw;
    this.cameraPitch = pitch;
  }

  setFirstPersonColor(color: string): void {
    for (const material of this.armMaterials) {
      material.color.set(color);
    }
  }

  private addVerticalPlatforms(): void {
    const deckMaterials = [
      new THREE.MeshStandardMaterial({
        color: "#536e70",
        roughness: 0.72,
        metalness: 0.18,
      }),
      new THREE.MeshStandardMaterial({
        color: "#5e6279",
        roughness: 0.68,
        metalness: 0.22,
      }),
    ];
    const panelMaterials = [
      new THREE.MeshStandardMaterial({ color: "#788b85", roughness: 0.76 }),
      new THREE.MeshStandardMaterial({ color: "#84958d", roughness: 0.76 }),
    ];
    const trimMaterials = [
      new THREE.MeshStandardMaterial({
        color: "#76e5cf",
        emissive: "#248d7d",
        emissiveIntensity: 0.38,
        roughness: 0.42,
      }),
      new THREE.MeshStandardMaterial({
        color: "#c5a5ff",
        emissive: "#684da1",
        emissiveIntensity: 0.38,
        roughness: 0.42,
      }),
    ];
    const girderMaterial = new THREE.MeshStandardMaterial({
      color: "#35474d",
      roughness: 0.82,
      metalness: 0.16,
    });
    for (const platform of VERTICAL_PLATFORMS) {
      const levelIndex = platform.height >= 6 ? 1 : 0;
      const deckMaterial = deckMaterials[levelIndex]!;
      const trimMaterial = trimMaterials[levelIndex]!;
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(
          platform.width,
          ELEVATED_PLATFORM_THICKNESS,
          platform.depth,
        ),
        deckMaterial,
      );
      deck.position.set(
        platform.x,
        platform.height - ELEVATED_PLATFORM_THICKNESS / 2,
        platform.z,
      );
      deck.castShadow = true;
      deck.receiveShadow = true;
      this.world.add(deck);

      const topPanel = new THREE.Mesh(
        new THREE.BoxGeometry(
          platform.width - 0.18,
          0.012,
          platform.depth - 0.36,
        ),
        panelMaterials[levelIndex]!,
      );
      topPanel.position.set(platform.x, platform.height + 0.004, platform.z);
      topPanel.receiveShadow = true;
      this.world.add(topPanel);

      const isHorizontal = platform.width > platform.depth;
      const railLength = isHorizontal ? platform.width : platform.depth;
      const railOffset = isHorizontal
        ? platform.depth / 2 - 0.08
        : platform.width / 2 - 0.08;
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(
            isHorizontal ? railLength : 0.16,
            0.12,
            isHorizontal ? 0.16 : railLength,
          ),
          deckMaterial,
        );
        rail.position.set(
          platform.x + (isHorizontal ? 0 : side * railOffset),
          platform.height + 0.06,
          platform.z + (isHorizontal ? side * railOffset : 0),
        );
        rail.castShadow = true;
        this.world.add(rail);

        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(
            isHorizontal ? railLength : 0.045,
            0.025,
            isHorizontal ? 0.045 : railLength,
          ),
          trimMaterial,
        );
        trim.position.set(
          platform.x + (isHorizontal ? 0 : side * railOffset),
          platform.height + 0.125,
          platform.z + (isHorizontal ? side * railOffset : 0),
        );
        this.world.add(trim);
      }

      if (isHorizontal) {
        for (
          let offset = -platform.width / 2 + 2;
          offset < platform.width / 2 - 1;
          offset += 4
        ) {
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(3.55, 0.006, platform.depth - 0.52),
            panelMaterials[Math.round((offset + platform.width / 2) / 4) % 2]!,
          );
          panel.position.set(
            platform.x + offset,
            platform.height + 0.012,
            platform.z,
          );
          this.world.add(panel);

          const rib = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.18, platform.depth - 0.12),
            girderMaterial,
          );
          rib.position.set(
            platform.x + offset,
            platform.height -
              ELEVATED_PLATFORM_THICKNESS -
              0.09,
            platform.z,
          );
          rib.castShadow = true;
          this.world.add(rib);
        }

        const centerStripe = new THREE.Mesh(
          new THREE.BoxGeometry(platform.width - 0.5, 0.006, 0.08),
          trimMaterial,
        );
        centerStripe.position.set(
          platform.x,
          platform.height + 0.016,
          platform.z,
        );
        this.world.add(centerStripe);
      }
    }
  }

  private addRamps(): void {
    const rampMaterial = new THREE.MeshStandardMaterial({
      color: "#788487",
      roughness: 0.86,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    for (const ramp of ARENA_RAMPS) {
      const alongLength = ramp.axis === "x" ? ramp.width : ramp.depth;
      const acrossWidth = ramp.axis === "x" ? ramp.depth : ramp.width;
      const alongCenter = ramp.axis === "x" ? ramp.x : ramp.z;
      const acrossCenter = ramp.axis === "x" ? ramp.z : ramp.x;
      const low = alongCenter + (ramp.direction === 1 ? -1 : 1) * alongLength / 2;
      const high = alongCenter - (ramp.direction === 1 ? -1 : 1) * alongLength / 2;
      const lowA = ramp.axis === "x"
        ? [low, ramp.startY, acrossCenter - acrossWidth / 2]
        : [acrossCenter - acrossWidth / 2, ramp.startY, low];
      const lowB = ramp.axis === "x"
        ? [low, ramp.startY, acrossCenter + acrossWidth / 2]
        : [acrossCenter + acrossWidth / 2, ramp.startY, low];
      const highA = ramp.axis === "x"
        ? [high, ramp.endY, acrossCenter - acrossWidth / 2]
        : [acrossCenter - acrossWidth / 2, ramp.endY, high];
      const highB = ramp.axis === "x"
        ? [high, ramp.endY, acrossCenter + acrossWidth / 2]
        : [acrossCenter + acrossWidth / 2, ramp.endY, high];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [...lowA, ...lowB, ...highA, ...highB],
          3,
        ),
      );
      geometry.setIndex([0, 2, 1, 1, 2, 3]);
      geometry.computeVertexNormals();
      const surface = new THREE.Mesh(geometry, rampMaterial);
      surface.receiveShadow = true;
      surface.castShadow = true;
      this.world.add(surface);
    }
  }

  private addParkourWall(
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
  ): void {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: "#687579",
        roughness: 0.88,
        metalness: 0.08,
      }),
    );
    wall.position.set(x, height / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    this.world.add(wall);
    for (const y of [0.18, height - 0.2]) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(width + 0.04, 0.08, depth + 0.04),
        new THREE.MeshStandardMaterial({
          color: y < 1 ? "#91d9cb" : "#d1d8d1",
          roughness: 0.68,
        }),
      );
      stripe.position.set(x, y, z);
      this.world.add(stripe);
    }
  }

  setFirstPersonArmsVisible(visible: boolean): void {
    this.firstPersonArms.visible = visible;
  }

  setPowerUp(powerUp: PowerUpState | null): void {
    if (!powerUp) {
      this.activePowerUpKey = "";
      this.powerUpGroup.visible = false;
      return;
    }

    const key = `${powerUp.type}:${powerUp.x}:${powerUp.z}`;
    if (key === this.activePowerUpKey) {
      return;
    }
    this.activePowerUpKey = key;
    const color = POWER_UP_COLORS[powerUp.type];
    for (const material of this.powerUpMaterials) {
      material.color.set(color);
      material.emissive.set(color);
    }
    this.powerUpGroup.position.set(powerUp.x, 1.2, powerUp.z);
    this.powerUpGroup.visible = true;
  }

  setSnowballs(snowballs: SnowballState[]): void {
    const activeIds = new Set(snowballs.map((snowball) => snowball.id));
    for (const [id, mesh] of this.snowballViews) {
      if (activeIds.has(id)) {
        continue;
      }
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      const material = mesh.material as THREE.Material;
      material.dispose();
      this.snowballViews.delete(id);
    }

    for (const snowball of snowballs) {
      let mesh = this.snowballViews.get(snowball.id);
      if (!mesh) {
        const isInk = snowball.kind === "ink";
        mesh = new THREE.Mesh(
          isInk
            ? new THREE.SphereGeometry(0.28, 16, 12)
            : new THREE.SphereGeometry(0.22, 16, 12),
          new THREE.MeshStandardMaterial({
            color: isInk ? POWER_UP_COLORS.ink : "#d9f6ff",
            emissive: isInk ? "#5d4c86" : "#83cce8",
            emissiveIntensity: isInk ? 0.45 : 0.62,
            roughness: 0.25,
          }),
        );
        mesh.castShadow = true;
        this.snowballViews.set(snowball.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(snowball.x, snowball.y, snowball.z);
    }
  }

  setEffects(effects: ArenaEffectState[]): void {
    const activeIds = new Set(effects.map((effect) => effect.id));
    for (const [id, mesh] of this.effectViews) {
      if (activeIds.has(id)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.effectViews.delete(id);
    }
    for (const [id, beam] of this.effectBeams) {
      if (activeIds.has(id)) continue;
      this.scene.remove(beam);
      beam.geometry.dispose();
      (beam.material as THREE.Material).dispose();
      this.effectBeams.delete(id);
    }

    for (const effect of effects) {
      let mesh = this.effectViews.get(effect.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.09, 8, 48),
          new THREE.MeshBasicMaterial({
            color:
              effect.type === "shockwave"
                ? "#ffbd76"
                : effect.type === "ink"
                  ? "#6d5aa8"
                  : "#fa86bb",
            transparent: true,
            opacity: 0.85,
          }),
        );
        mesh.rotation.x = Math.PI / 2;
        this.effectViews.set(effect.id, mesh);
        this.scene.add(mesh);
      }
      const progress = Math.min(
        1,
        Math.max(
          0,
          (Date.now() - effect.startedAt) /
            Math.max(1, effect.expiresAt - effect.startedAt),
        ),
      );
      mesh.position.set(effect.x, effect.y + 0.12, effect.z);
      mesh.scale.setScalar(1 + progress * 5);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - progress);
      if (effect.type === "swap" && effect.end) {
        let beam = this.effectBeams.get(effect.id);
        if (!beam) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(new Float32Array(6), 3),
          );
          beam = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({
              color: "#fa86bb",
              transparent: true,
              opacity: 0.95,
            }),
          );
          this.effectBeams.set(effect.id, beam);
          this.scene.add(beam);
        }
        const positions = beam.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        positions.setXYZ(0, effect.x, effect.y, effect.z);
        positions.setXYZ(1, effect.end.x, effect.end.y, effect.end.z);
        positions.needsUpdate = true;
        beam.geometry.computeBoundingSphere();
        (beam.material as THREE.LineBasicMaterial).opacity =
          0.95 * (1 - progress);
      }
    }
  }

  focusOn(
    position: THREE.Vector3,
    deltaSeconds: number,
    isMoving = false,
    isSprinting = false,
    isJumping = false,
    isDashing = false,
    wallRunSide: -1 | 0 | 1 = 0,
    isSliding = false,
  ): void {
    const cadence = isDashing ? 17 : isSprinting ? 13 : 8.5;
    if (isMoving || isDashing) {
      this.locomotionTime += deltaSeconds * cadence;
    }
    const gaitTarget = isDashing ? 1 : isMoving ? (isSprinting ? 1 : 0.55) : 0;
    const smoothing = 1 - Math.exp(-deltaSeconds * 13);
    this.armGaitAmount += (gaitTarget - this.armGaitAmount) * smoothing;
    this.armJumpAmount +=
      ((isJumping ? 1 : 0) - this.armJumpAmount) * smoothing;
    this.armDashAmount = isDashing
      ? Math.min(1, this.armDashAmount + deltaSeconds * 12)
      : Math.max(0, this.armDashAmount - deltaSeconds * 6);
    const stride = Math.sin(this.locomotionTime);
    const bob = isDashing
      ? Math.abs(Math.sin(this.locomotionTime * 1.4)) * 0.055
      : isMoving
        ? Math.sin(this.locomotionTime * 2) * (isSprinting ? 0.042 : 0.02)
        : 0;
    const eyeHeight = (isSliding ? 1.08 : 1.57) + bob;
    this.desiredCamera.set(position.x, position.y + eyeHeight, position.z);
    const horizontalLook = Math.cos(this.cameraPitch) * 12;
    this.lookTarget.set(
      this.desiredCamera.x - Math.sin(this.cameraYaw) * horizontalLook,
      this.desiredCamera.y + Math.sin(this.cameraPitch) * 12,
      this.desiredCamera.z - Math.cos(this.cameraYaw) * horizontalLook,
    );
    this.firstPersonArms.position.y = -0.06 + Math.abs(bob) * 0.8;
    for (const { group, side } of this.firstPersonArmGroups) {
      const swing =
        stride * this.armGaitAmount * (isSprinting ? 0.08 : 0.045);
      const idleBreath =
        Math.sin(this.animationTime * 1.4) * 0.004 * (1 - this.armGaitAmount);
      group.position.y =
        -0.48 + Math.abs(bob) * 0.42 + this.armJumpAmount * 0.035 + idleBreath;
      group.position.z = -1.1 - this.armDashAmount * 0.12;
      group.rotation.x =
        -this.armJumpAmount * 0.52 - this.armDashAmount * 0.72 + swing * side;
      group.rotation.z =
        side * 0.18 + swing * side - this.armDashAmount * side * 0.04;
    }
    const cameraSmoothing = 1 - Math.exp(-deltaSeconds * 19);
    this.camera.position.lerp(this.desiredCamera, cameraSmoothing);
    this.camera.lookAt(this.lookTarget);
    this.cameraRoll +=
      (wallRunSide * 0.11 - this.cameraRoll) * cameraSmoothing;
    this.camera.rotateZ(this.cameraRoll);
  }

  render(): void {
    if (this.disposed) {
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateEnvironment(deltaSeconds: number): void {
    this.animationTime += deltaSeconds;
    if (this.powerUpGroup.visible) {
      this.powerUpGroup.rotation.y += deltaSeconds * 1.8;
      this.powerUpGroup.position.y =
        1.2 + Math.sin(this.animationTime * 3.2) * 0.14;
    }
    for (const object of this.world.children) {
      if (object.userData.sway) {
        object.rotation.z =
          Math.sin(this.animationTime * 1.3 + object.userData.phase) * 0.035;
      }
    }
  }

  getCanvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.resizeObserver?.disconnect();
    for (const beam of this.effectBeams.values()) {
      this.scene.remove(beam);
      beam.geometry.dispose();
      (beam.material as THREE.Material).dispose();
    }
    this.effectBeams.clear();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) {
        return;
      }
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        if (material !== this.floorMaterial) {
          material.dispose();
        }
      }
    });
    this.floorMaterial.map?.dispose();
    this.floorMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private addLighting(): void {
    const hemisphere = new THREE.HemisphereLight("#f4fff5", "#879078", 2.25);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight("#fff0d4", 3.3);
    sun.position.set(-18, 30, 21);
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 5;
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight("#c6e7ff", 0.82);
    fill.position.set(19, 12, -16);
    this.scene.add(fill);
  }

  private createFirstPersonArms(): THREE.Group {
    const arms = new THREE.Group();
    const sleeveMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.mint,
      roughness: 0.62,
    });
    const cuffMaterial = new THREE.MeshStandardMaterial({
      color: "#f7f5ef",
      roughness: 0.72,
    });
    const handMaterial = new THREE.MeshStandardMaterial({
      color: "#e8b99d",
      roughness: 0.75,
    });
    this.armMaterials.push(sleeveMaterial);

    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.2, -0.48, -1.1);
      arm.rotation.z = side * 0.18;
      arm.scale.setScalar(0.36);
      this.firstPersonArmGroups.push({ group: arm, side });

      const sleeve = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.135, 0.52, 4, 8),
        sleeveMaterial,
      );
      sleeve.position.y = -0.12;
      sleeve.castShadow = true;
      arm.add(sleeve);

      const cuff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.137, 0.137, 0.12, 12),
        cuffMaterial,
      );
      cuff.position.y = -0.36;
      arm.add(cuff);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.145, 12, 10),
        handMaterial,
      );
      hand.position.y = -0.48;
      hand.scale.set(0.88, 1, 0.8);
      arm.add(hand);
      arms.add(arm);
    }
    arms.position.set(0, -0.06, 0);
    arms.renderOrder = 5;
    arms.visible = false;
    return arms;
  }

  private createPowerUp(): void {
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.gold,
      emissive: PALETTE.gold,
      emissiveIntensity: 0.72,
      roughness: 0.24,
      metalness: 0.12,
      flatShading: true,
    });
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.42, 0),
      crystalMaterial,
    );
    crystal.castShadow = true;
    this.powerUpMaterials.push(crystalMaterial);
    this.powerUpGroup.add(crystal);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.64, 0.035, 8, 36),
      new THREE.MeshBasicMaterial({
        color: PALETTE.paper,
        transparent: true,
        opacity: 0.78,
      }),
    );
    ring.position.y = -0.24;
    ring.rotation.x = Math.PI / 2;
    this.powerUpGroup.add(ring);

    const sparkle = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.paper }),
    );
    sparkle.position.set(0, 0.08, 0);
    this.powerUpGroup.add(sparkle);
    this.powerUpGroup.visible = false;
    this.world.add(this.powerUpGroup);
  }

  private addGround(): void {
    const groundGeometry = new THREE.PlaneGeometry(190, 190);
    const ground = new THREE.Mesh(
      groundGeometry,
      new THREE.MeshStandardMaterial({
        color: "#747b7c",
        roughness: 1,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.34;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const field = new THREE.Mesh(
      new THREE.PlaneGeometry(
        ARENA.halfWidth * 2 + 2.2,
        ARENA.halfDepth * 2 + 2.2,
      ),
      this.floorMaterial,
    );
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    field.position.y = -0.11;
    this.world.add(field);

    this.addEdgeBorder();
  }

  private createFloorMaterial(): THREE.MeshStandardMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) {
      return new THREE.MeshStandardMaterial({
        color: ARENA_COLORS.field,
        roughness: 1,
      });
    }

    context.fillStyle = ARENA_COLORS.field;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const random = seededRandom(2026);
    for (let index = 0; index < 28000; index += 1) {
      context.globalAlpha = 0.04 + random() * 0.13;
      context.fillStyle =
        PAVEMENT_GRAIN[Math.floor(random() * PAVEMENT_GRAIN.length)]!;
      const size = 1 + random() * 2.4;
      context.fillRect(
        random() * canvas.width,
        random() * canvas.height,
        size,
        size,
      );
    }
    context.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3.2, 3.2);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: texture,
      color: "#ffffff",
      roughness: 0.94,
      metalness: 0,
    });
  }

  private addEdgeBorder(): void {
    for (let side = 0; side < 4; side += 1) {
      const fence = new THREE.Group();
      const horizontal = side < 2;
      const length = horizontal ? ARENA.halfWidth * 2 + 1.8 : ARENA.halfDepth * 2 + 1.8;
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? length : 0.22, 0.2, horizontal ? 0.22 : length),
        new THREE.MeshStandardMaterial({
          color: ARENA_COLORS.fence,
          roughness: 0.8,
        }),
      );
      plank.position.y = 0.42;
      plank.castShadow = true;
      fence.add(plank);

      const rail = plank.clone();
      rail.position.y = 1.08;
      rail.scale.y = 0.72;
      fence.add(rail);

      const x = horizontal ? 0 : (side === 2 ? -ARENA.halfWidth : ARENA.halfWidth);
      const z = horizontal ? (side === 0 ? -ARENA.halfDepth : ARENA.halfDepth) : 0;
      fence.position.set(x, 0, z);
      this.world.add(fence);

      const postCount = Math.ceil(length / 3);
      for (let index = 0; index <= postCount; index += 1) {
        const offset = -length / 2 + (length / postCount) * index;
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 1.35, 0.25),
          new THREE.MeshStandardMaterial({
            color: "#60696d",
            roughness: 0.82,
          }),
        );
        post.position.set(horizontal ? offset : x, 0.68, horizontal ? z : offset);
        post.castShadow = true;
        this.world.add(post);
      }
    }
  }

  private addArenaMarkings(): void {
    this.addRoadSurfaces();

    const center = new THREE.Mesh(
      new THREE.CircleGeometry(4.7, 64),
      new THREE.MeshStandardMaterial({
        color: "#a6aaa5",
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    center.rotation.x = -Math.PI / 2;
    center.position.y = -0.055;
    this.world.add(center);

    for (const [x, z] of [
      [-18, 0],
      [18, 0],
      [0, -18],
      [0, 18],
    ]) {
      this.addLamp(x, z);
    }

    this.addStreetMarkings();
  }

  private addRoadSurfaces(): void {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: "#3d4549",
      roughness: 0.98,
      metalness: 0,
    });
    const roadWidth = 7.5;
    const roadLength = 44;
    for (const [width, depth] of [
      [roadLength, roadWidth],
      [roadWidth, roadLength],
    ]) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(width, depth),
        roadMaterial,
      );
      road.rotation.x = -Math.PI / 2;
      road.position.y = -0.085;
      road.receiveShadow = true;
      this.world.add(road);
    }
  }

  private addStreetMarkings(): void {
    const paint = new THREE.MeshBasicMaterial({
      color: "#e2d39a",
      transparent: true,
      opacity: 0.82,
    });
    for (let offset = -19; offset <= 19; offset += 4) {
      if (Math.abs(offset) < 5) {
        continue;
      }
      for (const [x, z, rotation] of [
        [offset, 0, 0],
        [0, offset, Math.PI / 2],
      ] as const) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(1.9, 0.018, 0.12),
          paint,
        );
        dash.position.set(x, -0.06, z);
        dash.rotation.y = rotation;
        this.world.add(dash);
      }
    }

    const crosswalkMaterial = new THREE.MeshBasicMaterial({
      color: "#d9d9d2",
      transparent: true,
      opacity: 0.8,
    });
    for (const crossing of [-10, 10]) {
      for (let stripe = -3; stripe <= 3; stripe += 1) {
        for (const [x, z, rotation] of [
          [stripe * 0.72, crossing, Math.PI / 2],
          [crossing, stripe * 0.72, 0],
        ]) {
          const marking = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.02, 2.2),
            crosswalkMaterial,
          );
          marking.position.set(x, -0.06, z);
          marking.rotation.y = rotation;
          this.world.add(marking);
        }
      }
    }
  }

  private addLamp(x: number, z: number): void {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.62, 0.25, 12),
      new THREE.MeshStandardMaterial({
        color: ARENA_COLORS.stone,
        roughness: 0.95,
      }),
    );
    base.position.set(x, 0.04, z);
    base.castShadow = true;
    this.world.add(base);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 2.65, 10),
      new THREE.MeshStandardMaterial({
        color: "#3d474b",
        roughness: 0.64,
        metalness: 0.16,
      }),
    );
    stem.position.set(x, 1.42, z);
    stem.castShadow = true;
    this.world.add(stem);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.08, 0.08),
      new THREE.MeshStandardMaterial({
        color: "#3d474b",
        roughness: 0.64,
        metalness: 0.18,
      }),
    );
    arm.position.set(x + 0.28, 2.72, z);
    this.world.add(arm);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.16, 0.32),
      new THREE.MeshStandardMaterial({
        color: "#ffe8a6",
        emissive: "#ffc95a",
        emissiveIntensity: 0.35,
        roughness: 0.38,
      }),
    );
    cap.position.set(x + 0.58, 2.64, z);
    cap.castShadow = true;
    this.world.add(cap);
  }

  private addObstacles(): void {
    for (const obstacle of OBSTACLES) {
      if (obstacle.kind === "building") {
        this.addBuilding(
          obstacle.x,
          obstacle.z,
          obstacle.width,
          obstacle.depth,
          obstacle.height,
        );
      } else if (obstacle.kind === "wall") {
        this.addParkourWall(
          obstacle.x,
          obstacle.z,
          obstacle.width,
          obstacle.depth,
          obstacle.height,
        );
      } else {
        this.addStreetBarrier(
          obstacle.x,
          obstacle.z,
          obstacle.width,
          obstacle.depth,
          obstacle.height,
        );
      }
    }
  }

  private addParkourPads(): void {
    const material = new THREE.MeshStandardMaterial({
      color: "#727a78",
      roughness: 0.96,
    });
    for (const platform of CLIMBABLE_PLATFORMS) {
      if (platform.kind === "roof") {
        continue;
      }
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(
          platform.width + 0.9,
          platform.depth + 0.9,
        ),
        material,
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(platform.x, -0.075, platform.z);
      pad.receiveShadow = true;
      this.world.add(pad);
    }
  }

  private addClimbablePlatforms(): void {
    const styles = {
      concrete: { body: "#7c8587", top: "#b1b8b5", detail: "#565e61" },
      crate: { body: "#9b6845", top: "#c58d5b", detail: "#674832" },
      dumpster: { body: "#355f59", top: "#54877a", detail: "#243c39" },
      container: { body: "#35617c", top: "#4b819f", detail: "#203f52" },
    } as const;

    for (const platform of CLIMBABLE_PLATFORMS) {
      if (platform.kind === "roof") {
        continue;
      }
      const style = styles[platform.kind];
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(
          platform.width,
          platform.height - 0.12,
          platform.depth,
        ),
        new THREE.MeshStandardMaterial({
          color: style.body,
          roughness: 0.88,
          flatShading: platform.kind === "concrete",
        }),
      );
      base.position.set(platform.x, (platform.height - 0.12) / 2, platform.z);
      base.castShadow = true;
      base.receiveShadow = true;
      this.world.add(base);

      const top = new THREE.Mesh(
        new THREE.BoxGeometry(
          platform.width + 0.12,
          0.12,
          platform.depth + 0.12,
        ),
        new THREE.MeshStandardMaterial({
          color: style.top,
          roughness: 0.82,
        }),
      );
      top.position.set(platform.x, platform.height - 0.06, platform.z);
      top.castShadow = true;
      top.receiveShadow = true;
      this.world.add(top);

      if (platform.kind === "crate" || platform.kind === "container") {
        const slatMaterial = new THREE.MeshStandardMaterial({
          color: style.detail,
          roughness: 0.86,
        });
        for (const offset of [-0.28, 0.28]) {
          const slat = new THREE.Mesh(
            new THREE.BoxGeometry(platform.width - 0.2, 0.045, 0.09),
            slatMaterial,
          );
          slat.position.set(
            platform.x,
            platform.height - 0.025,
            platform.z + offset * platform.depth,
          );
          this.world.add(slat);
        }
      }

      if (platform.kind === "dumpster") {
        const twineMaterial = new THREE.MeshStandardMaterial({
          color: style.detail,
          roughness: 0.95,
        });
        for (const offset of [-0.28, 0.28]) {
          const twine = new THREE.Mesh(
            new THREE.BoxGeometry(0.055, platform.height - 0.08, platform.depth),
            twineMaterial,
          );
          twine.position.set(
            platform.x + offset * platform.width,
            (platform.height - 0.08) / 2,
            platform.z,
          );
          this.world.add(twine);
        }
      }
    }
  }

  private addBuildingLadders(): void {
    const railMaterial = new THREE.MeshStandardMaterial({
      color: "#39484d",
      roughness: 0.64,
      metalness: 0.28,
    });
    const rungMaterial = new THREE.MeshStandardMaterial({
      color: "#aab4b3",
      roughness: 0.7,
      metalness: 0.2,
    });

    for (const ladder of BUILDING_LADDERS) {
      const railHeight = ladder.roofHeight + LADDER_TOP_EXTENSION;
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(
          new THREE.CylinderGeometry(0.055, 0.055, railHeight, 8),
          railMaterial,
        );
        rail.position.set(
          ladder.x,
          railHeight / 2,
          ladder.z + side * (ladder.width / 2),
        );
        rail.castShadow = true;
        rail.receiveShadow = true;
        this.world.add(rail);
      }

      for (
        let height = LADDER_RUNG_SPACING;
        height <= ladder.roofHeight + LADDER_TOP_EXTENSION * 0.75;
        height += LADDER_RUNG_SPACING
      ) {
        const rung = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.035, ladder.width, 8),
          rungMaterial,
        );
        rung.rotation.x = Math.PI / 2;
        rung.position.set(ladder.x, height, ladder.z);
        rung.castShadow = true;
        this.world.add(rung);
      }

      for (const height of [0.8, ladder.roofHeight / 2, ladder.roofHeight - 0.4]) {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, 0.08, 0.08),
          railMaterial,
        );
        brace.position.set(
          ladder.wallX - ladder.directionX * 0.08,
          height,
          ladder.z,
        );
        this.world.add(brace);
      }
    }
  }

  private addBuilding(
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
  ): void {
    const facadeColors = ["#777d7c", "#8b8276", "#68767a", "#9a9387"];
    const facade = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: facadeColors[Math.abs(Math.round(x + z)) % facadeColors.length]!,
        roughness: 0.9,
      }),
    );
    facade.position.set(x, height / 2, z);
    facade.castShadow = true;
    facade.receiveShadow = true;
    this.world.add(facade);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(
        width + BUILDING_ROOF_THICKNESS,
        BUILDING_ROOF_THICKNESS,
        depth + BUILDING_ROOF_THICKNESS,
      ),
      new THREE.MeshStandardMaterial({
        color: "#424b4f",
        roughness: 0.84,
        metalness: 0.08,
      }),
    );
    roof.position.set(x, height + BUILDING_ROOF_THICKNESS / 2, z);
    roof.castShadow = true;
    this.world.add(roof);

    const windowMaterial = new THREE.MeshStandardMaterial({
      color: "#8bb9c2",
      emissive: "#38616b",
      emissiveIntensity: 0.13,
      roughness: 0.3,
      metalness: 0.22,
    });
    const sideFacingCenter = Math.abs(x) > Math.abs(z);
    const columns = Math.max(2, Math.floor((sideFacingCenter ? depth : width) / 2.25));
    const rows = Math.max(2, Math.floor((height - 1.2) / 2.2));
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const window = new THREE.Mesh(
          new THREE.BoxGeometry(0.82, 0.96, 0.06),
          windowMaterial,
        );
        const offset = (column - (columns - 1) / 2) * 1.65;
        const windowY = 1.5 + row * 2.1;
        if (sideFacingCenter) {
          window.position.set(
            x - Math.sign(x) * (width / 2 + 0.04),
            windowY,
            z + offset,
          );
          window.rotation.y = Math.PI / 2;
        } else {
          window.position.set(
            x + offset,
            windowY,
            z - Math.sign(z) * (depth / 2 + 0.04),
          );
        }
        window.castShadow = true;
        this.world.add(window);
      }
    }

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 1.78, 0.08),
      new THREE.MeshStandardMaterial({
        color: "#343d41",
        roughness: 0.68,
        metalness: 0.16,
      }),
    );
    if (sideFacingCenter) {
      door.position.set(x - Math.sign(x) * (width / 2 + 0.05), 0.89, z);
      door.rotation.y = Math.PI / 2;
    } else {
      door.position.set(x, 0.89, z - Math.sign(z) * (depth / 2 + 0.05));
    }
    this.world.add(door);
  }

  private addStreetBarrier(
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
  ): void {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: "#626c70",
        roughness: 0.84,
      }),
    );
    body.position.set(x, height / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    this.world.add(body);

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.04, 0.14, depth + 0.04),
      new THREE.MeshStandardMaterial({
        color: "#e5b651",
        emissive: "#714a10",
        emissiveIntensity: 0.12,
        roughness: 0.62,
      }),
    );
    stripe.position.set(x, height * 0.68, z);
    this.world.add(stripe);
  }

  private addLandscaping(): void {
    this.addFountain();
    this.addTreesBehindFence();
  }

  private addTreesBehindFence(): void {
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: "#76513b",
      roughness: 0.96,
    });
    const canopyMaterials = [
      new THREE.MeshStandardMaterial({
        color: "#547b58",
        roughness: 0.92,
      }),
      new THREE.MeshStandardMaterial({
        color: "#638b60",
        roughness: 0.92,
      }),
      new THREE.MeshStandardMaterial({
        color: "#466d51",
        roughness: 0.92,
      }),
    ];
    const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.36, 3.2, 8);
    const lowerCanopyGeometry = new THREE.ConeGeometry(1.45, 2.6, 7);
    const upperCanopyGeometry = new THREE.ConeGeometry(1.05, 2.1, 7);
    const random = seededRandom(3107);
    const offsets = [-25, -15, -5, 5, 15, 25];
    const fenceLine = ARENA.halfWidth + 2.5;
    const positions = [
      ...offsets.flatMap((offset) => [
        { x: offset, z: -fenceLine, axis: "x" as const },
        { x: offset, z: fenceLine, axis: "x" as const },
        { x: -fenceLine, z: offset, axis: "z" as const },
        { x: fenceLine, z: offset, axis: "z" as const },
      ]),
    ];

    for (const position of positions) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      trunk.position.y = 1.6;
      trunk.castShadow = true;
      tree.add(trunk);

      const canopyMaterial =
        canopyMaterials[Math.floor(random() * canopyMaterials.length)]!;
      const lowerCanopy = new THREE.Mesh(
        lowerCanopyGeometry,
        canopyMaterial,
      );
      lowerCanopy.position.y = 2.9;
      lowerCanopy.castShadow = true;
      lowerCanopy.receiveShadow = true;
      tree.add(lowerCanopy);

      const upperCanopy = new THREE.Mesh(
        upperCanopyGeometry,
        canopyMaterial,
      );
      upperCanopy.position.y = 3.85;
      upperCanopy.castShadow = true;
      upperCanopy.receiveShadow = true;
      tree.add(upperCanopy);

      const alongFenceOffset = (random() - 0.5) * 1.2;
      if (position.axis === "x") {
        tree.position.set(position.x + alongFenceOffset, 0, position.z);
      } else {
        tree.position.set(position.x, 0, position.z + alongFenceOffset);
      }
      tree.rotation.y = random() * Math.PI * 2;
      tree.scale.setScalar(0.88 + random() * 0.32);
      this.world.add(tree);
    }
  }

  private addFountain(): void {
    const fountain = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.9, 0.42, 48),
      new THREE.MeshStandardMaterial({
        color: "#c4c0af",
        roughness: 0.66,
      }),
    );
    base.position.y = 0.18;
    base.receiveShadow = true;
    fountain.add(base);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(2.25, 48),
      new THREE.MeshStandardMaterial({
        color: "#88c9d0",
        roughness: 0.28,
        metalness: 0.12,
        transparent: true,
        opacity: 0.84,
        side: THREE.DoubleSide,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.4;
    fountain.add(water);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.58, 1.4, 10),
      new THREE.MeshStandardMaterial({
        color: "#b3b0a3",
        roughness: 0.72,
      }),
    );
    pedestal.position.y = 1.05;
    pedestal.castShadow = true;
    fountain.add(pedestal);
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.57, 14, 10),
      new THREE.MeshStandardMaterial({
        color: "#bce4d9",
        roughness: 0.24,
        metalness: 0.08,
        flatShading: true,
      }),
    );
    orb.position.y = 2.03;
    orb.castShadow = true;
    fountain.add(orb);
    fountain.position.set(0, 0, 0);
    this.world.add(fountain);
  }

  private addSkyDetails(): void {
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 24, 16),
      new THREE.MeshBasicMaterial({
        color: "#fff2cc",
        transparent: true,
        opacity: 0.72,
      }),
    );
    sunDisc.position.set(-34, 41, -60);
    this.scene.add(sunDisc);
    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.32,
    });
    for (let index = 0; index < 7; index += 1) {
      const cloud = new THREE.Group();
      for (let puff = 0; puff < 4; puff += 1) {
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(1.3 + puff * 0.12, 12, 8),
          cloudMaterial,
        );
        ball.scale.set(1.5, 0.58, 0.85);
        ball.position.set(puff * 1.45 - 2.1, Math.sin(puff) * 0.35, 0);
        cloud.add(ball);
      }
      cloud.position.set(-40 + index * 13, 30 + (index % 2) * 6, -35 - (index % 3) * 15);
      this.scene.add(cloud);
    }
  }

  private watchResize(): void {
    this.resizeObserver = new ResizeObserver(() => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
      this.updateFirstPersonArmLayout(width, height);
    });
    this.resizeObserver.observe(this.container);
  }

  private updateFirstPersonArmLayout(
    width = this.container.clientWidth || window.innerWidth,
    height = this.container.clientHeight || window.innerHeight,
  ): void {
    const spread = Math.max(0.2, Math.min(0.5, (width / height) * 0.42));
    for (const arm of this.firstPersonArmGroups) {
      arm.group.position.x = arm.side * spread;
    }
  }
}


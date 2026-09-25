import { useEffect, useRef } from "react";
import * as THREE from "three";
import { clamp } from "../simulation/format";
import { PRESENCE_SEQUENCE } from "../simulation/presence";
import { getSnapshot } from "../simulation/SignalEngine";
import { AVATAR_BY_ID } from "../realtime/avatars";
import type { AvatarId, StationId } from "../realtime/types";
import type {
  Participant,
  PresenceFormId,
  TransmissionEvent
} from "../simulation/types";

interface SpatialSceneProps {
  events: TransmissionEvent[];
  focusMessageId: string;
  simulationTime: number;
  selectedForm: PresenceFormId;
  reducedMotion: boolean;
  fatherStation: StationId | null;
  daughterStation: StationId | null;
  fatherAvatar: AvatarId | null;
  daughterAvatar: AvatarId | null;
}

interface AvatarRig {
  group: THREE.Group;
  mouth: THREE.Mesh;
  gestureArm: THREE.Group;
  gestureElbow: THREE.Group;
  gestureRest: number;
  gestureDirection: number;
}

interface CharacterMaterials {
  skin: THREE.Material;
  top: THREE.Material;
  lower: THREE.Material;
  hair: THREE.Material;
  shoe: THREE.Material;
  detail: THREE.Material;
  feature: THREE.Material;
}

interface MonitorRig {
  group: THREE.Group;
  screenMaterial: THREE.MeshStandardMaterial;
  textLines: THREE.Group;
  textMaterial: THREE.MeshBasicMaterial;
  voiceRings: THREE.Group;
  voiceMaterial: THREE.MeshBasicMaterial;
  expressionRig: AvatarRig;
  expressionMaterial: THREE.MeshBasicMaterial;
  pointCloud: THREE.Group;
  pointMaterial: THREE.PointsMaterial;
  formIndicators: Record<PresenceFormId, THREE.MeshBasicMaterial>;
}

const formColors: Record<PresenceFormId, number> = {
  text: 0xb9c3d1,
  voice: 0x8fdcff,
  expression: 0xffd36a,
  pointCloud: 0xef8fc5
};

const participantColors: Record<Participant, number> = {
  father: 0xffa86b,
  daughter: 0x8fdcff
};

const seededRandom = () => {
  let seed = 80421;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

const createHumanPointGeometry = () => {
  const random = seededRandom();
  const positions: number[] = [];
  const point = (x: number, y: number, z: number) => positions.push(x, y, z);

  for (let index = 0; index < 220; index += 1) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    point(
      Math.sin(phi) * Math.cos(theta) * 0.3,
      1.82 + Math.cos(phi) * 0.3,
      Math.sin(phi) * Math.sin(theta) * 0.3
    );
  }

  for (let index = 0; index < 360; index += 1) {
    const y = 0.72 + random() * 0.85;
    const width = 0.48 - Math.abs(y - 1.12) * 0.2;
    const angle = random() * Math.PI * 2;
    point(Math.cos(angle) * width, y, Math.sin(angle) * width * 0.46);
  }

  [-1, 1].forEach((side) => {
    for (let index = 0; index < 150; index += 1) {
      const t = random();
      point(side * (0.38 + t * 0.42), 1.45 - t * 0.72, (random() - 0.5) * 0.16);
    }
    for (let index = 0; index < 170; index += 1) {
      const t = random();
      point(side * (0.2 + t * 0.16), 0.72 - t * 1.12, (random() - 0.5) * 0.19);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
};

const createEnvironmentPointGeometry = (station: StationId) => {
  const random = seededRandom();
  const positions: number[] = [];
  const point = (x: number, y: number, z: number) => positions.push(x, y, z);
  const addBoxSurface = (
    position: [number, number, number],
    size: [number, number, number],
    count: number
  ) => {
    const [centerX, centerY, centerZ] = position;
    const [width, height, depth] = size;
    for (let index = 0; index < count; index += 1) {
      let x = (random() - 0.5) * width;
      let y = (random() - 0.5) * height;
      let z = (random() - 0.5) * depth;
      const face = Math.floor(random() * 6);
      if (face < 2) {
        x = (face === 0 ? -0.5 : 0.5) * width;
      } else if (face < 4) {
        y = (face === 2 ? -0.5 : 0.5) * height;
      } else {
        z = (face === 4 ? -0.5 : 0.5) * depth;
      }
      point(centerX + x, centerY + y, centerZ + z);
    }
  };
  const addCylinderSurface = (
    position: [number, number, number],
    radius: number,
    height: number,
    count: number
  ) => {
    const [centerX, centerY, centerZ] = position;
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      point(
        centerX + Math.cos(angle) * radius,
        centerY + (random() - 0.5) * height,
        centerZ + Math.sin(angle) * radius
      );
    }
  };

  addBoxSurface([0, -0.4, 0.02], [2.8, 0.05, 1.08], 210);
  addBoxSurface([-1.38, 0.66, -0.45], [0.05, 2.1, 0.05], 65);
  addBoxSurface([1.38, 0.66, -0.45], [0.05, 2.1, 0.05], 65);
  addBoxSurface([0, 1.7, -0.45], [2.8, 0.05, 0.05], 95);

  if (station === "earth") {
    addBoxSurface([-0.92, 0.23, 0.02], [0.92, 0.08, 0.5], 120);
    [-1.28, -0.58].forEach((x) => {
      addBoxSurface([x, -0.08, 0.02], [0.07, 0.6, 0.07], 34);
    });
    addBoxSurface([0.84, 0.98, -0.41], [0.88, 0.58, 0.06], 190);
    addBoxSurface([0.84, 0.27, -0.3], [1.0, 0.08, 0.34], 95);
    addBoxSurface([0.84, -0.04, -0.3], [0.76, 0.56, 0.26], 100);
    addCylinderSurface([-1.18, 0.02, -0.28], 0.13, 0.34, 70);
  } else if (station === "moon") {
    addBoxSurface([0.68, 0.25, -0.02], [1.42, 0.08, 0.54], 155);
    [0.12, 1.24].forEach((x) => {
      addBoxSurface([x, -0.08, -0.02], [0.07, 0.62, 0.07], 34);
    });
    addBoxSurface([0.62, 0.37, 0.04], [0.52, 0.04, 0.32], 68);
    addBoxSurface([0.62, 0.67, -0.12], [0.52, 0.42, 0.04], 110);
    addBoxSurface([-0.93, 0.48, -0.35], [0.5, 0.9, 0.34], 150);
    addBoxSurface([-0.93, 1.16, -0.43], [0.72, 0.43, 0.05], 120);
    [-1.22, -0.92, -0.62].forEach((x) => {
      addCylinderSurface([x, -0.03, 0.16], 0.09, 0.68, 58);
    });
    [1.0, 1.18].forEach((x) => {
      addCylinderSurface([x, 0.43, 0.04], 0.045, 0.3, 38);
    });
  } else {
    addBoxSurface([0.72, 0.25, -0.04], [1.34, 0.08, 0.5], 150);
    [0.2, 1.24].forEach((x) => {
      addBoxSurface([x, -0.08, -0.04], [0.07, 0.62, 0.07], 34);
    });
    addBoxSurface([0.72, 0.78, -0.36], [0.72, 0.48, 0.05], 145);
    addBoxSurface([-0.95, 0.62, -0.38], [0.5, 1.18, 0.3], 170);
    addBoxSurface([-0.95, 1.34, -0.43], [0.74, 0.28, 0.05], 95);
    [-1.18, -0.94, -0.7].forEach((x) => {
      addCylinderSurface([x, -0.04, 0.14], 0.085, 0.65, 52);
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
};

const createAvatar = (
  participant: Participant,
  materials: CharacterMaterials,
  suited: boolean,
  avatarId: AvatarId
): AvatarRig => {
  const group = new THREE.Group();
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.255, 28, 20),
    materials.skin
  );
  head.scale.set(0.92, 1.08, 0.92);
  head.position.y = 1.83;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.115, 0.18, 16),
    materials.skin
  );
  neck.position.y = 1.53;
  const shoulders = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 24, 14),
    materials.top
  );
  shoulders.scale.set(
    participant === "daughter" ? 1.02 : 1.18,
    participant === "daughter" ? 0.36 : 0.46,
    participant === "daughter" ? 0.62 : 0.7
  );
  shoulders.position.y = 1.39;
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(
      participant === "daughter" ? 0.255 : 0.29,
      participant === "daughter" ? 0.29 : 0.335,
      0.66,
      24
    ),
    materials.top
  );
  torso.position.y = 1.12;
  const waist = new THREE.Mesh(
    new THREE.CylinderGeometry(
      participant === "daughter" ? 0.255 : 0.285,
      participant === "daughter" ? 0.27 : 0.3,
      0.17,
      22
    ),
    materials.lower
  );
  waist.position.y = 0.72;

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.105, 0.018, 0.018),
    materials.feature
  );
  mouth.position.set(0, 1.75, 0.238);
  const eyeGeometry = new THREE.SphereGeometry(0.022, 12, 8);
  [-0.086, 0.086].forEach((x) => {
    const eye = new THREE.Mesh(eyeGeometry, materials.feature);
    eye.position.set(x, 1.87, 0.238);
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.014, 0.014),
      materials.hair
    );
    brow.position.set(x, 1.925, 0.232);
    group.add(eye);
    group.add(brow);
  });

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.025, 0.09, 12),
    materials.skin
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.82, 0.255);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(
      0.263,
      28,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.44
    ),
    materials.hair
  );
  hairCap.scale.set(0.94, 1.04, 0.94);
  hairCap.position.y = 1.85;
  group.add(hairCap);

  if (avatarId === "nova") {
    const bun = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 18, 12),
      materials.hair
    );
    bun.position.set(0.18, 1.91, -0.15);
    group.add(bun);
  } else {
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(
        new THREE.SphereGeometry(0.038, 12, 8),
        materials.skin
      );
      ear.position.set(side * 0.245, 1.83, 0);
      group.add(ear);
    });

    if (avatarId === "sol") {
      const sweptHair = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.06, 0.08),
        materials.hair
      );
      sweptHair.position.set(-0.13, 2.02, 0.12);
      sweptHair.rotation.z = -0.36;
      group.add(sweptHair);
    }
  }

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.12, 0.025, 8, 28),
    materials.detail
  );
  collar.position.set(0, 1.47, 0.045);
  collar.rotation.x = Math.PI / 2;
  group.add(collar);

  const arms: Array<{ shoulder: THREE.Group; elbow: THREE.Group; side: number }> = [];
  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.36, 1.4, 0);
    shoulder.rotation.z = side * -0.1;
    const upperArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.078, 0.07, 0.39, 14),
      materials.top
    );
    upperArm.position.y = -0.19;
    const elbow = new THREE.Group();
    elbow.position.y = -0.38;
    const elbowJoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 14, 10),
      materials.detail
    );
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.055, 0.34, 14),
      suited ? materials.top : materials.skin
    );
    forearm.position.y = -0.17;
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 10),
      materials.skin
    );
    hand.scale.set(0.82, 1.18, 0.72);
    hand.position.y = -0.37;
    elbow.add(elbowJoint, forearm, hand);
    shoulder.add(upperArm, elbow);
    arms.push({ shoulder, elbow, side });
    group.add(shoulder);

    const upperLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.105, 0.095, 0.42, 16),
      materials.lower
    );
    upperLeg.position.set(side * 0.15, 0.48, 0);
    const lowerLeg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.075, 0.39, 16),
      materials.lower
    );
    lowerLeg.position.set(side * 0.15, 0.1, 0);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.11, 0.32),
      materials.shoe
    );
    shoe.position.set(side * 0.15, -0.1, 0.07);
    group.add(upperLeg, lowerLeg, shoe);

    if (suited) {
      const kneeBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.101, 0.101, 0.055, 16),
        materials.detail
      );
      kneeBand.position.set(side * 0.15, 0.28, 0);
      group.add(kneeBand);
    }
  });

  if (!suited) {
    const shirtHem = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.018, 8, 30),
      materials.detail
    );
    shirtHem.position.y = 0.79;
    shirtHem.rotation.x = Math.PI / 2;
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.055, 0.05),
      materials.detail
    );
    belt.position.set(0, 0.72, 0.27);
    group.add(shirtHem, belt);
  } else {
    const chestPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.13, 0.035),
      materials.detail
    );
    chestPanel.position.set(0, 1.22, 0.3);
    const suitStripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.48, 0.032),
      materials.detail
    );
    suitStripe.position.set(-0.2, 1.08, 0.27);
    suitStripe.rotation.z = -0.08;
    const suitBelt = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.07, 0.05),
      materials.detail
    );
    suitBelt.position.set(0, 0.74, 0.27);
    group.add(chestPanel, suitStripe, suitBelt);
  }

  group.add(head, neck, shoulders, torso, waist, nose, mouth);
  const gestureSide = participant === "father" ? 1 : -1;
  const gestureLimb = arms.find((arm) => arm.side === gestureSide) ?? arms[1];
  return {
    group,
    mouth,
    gestureArm: gestureLimb.shoulder,
    gestureElbow: gestureLimb.elbow,
    gestureRest: gestureSide * -0.1,
    gestureDirection: gestureSide
  };
};

const createCharacterMaterials = (
  avatarId: AvatarId,
  suited: boolean
): CharacterMaterials => {
  const avatar = AVATAR_BY_ID[avatarId];
  const colors = suited
    ? {
        skin: avatar.skin,
        top: 0xe0e5e6,
        lower: 0xaebbc2,
        hair: avatar.hair,
        shoe: 0x59666e,
        detail: avatar.accent,
        feature: 0x171412
      }
    : {
        skin: avatar.skin,
        top: avatar.accent,
        lower: 0x263344,
        hair: avatar.hair,
        shoe: 0x5a3c2e,
        detail: 0xe8d8b6,
        feature: 0x171412
      };

  return {
    skin: new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.72 }),
    top: new THREE.MeshStandardMaterial({ color: colors.top, roughness: 0.64 }),
    lower: new THREE.MeshStandardMaterial({ color: colors.lower, roughness: 0.72 }),
    hair: new THREE.MeshStandardMaterial({ color: colors.hair, roughness: 0.88 }),
    shoe: new THREE.MeshStandardMaterial({ color: colors.shoe, roughness: 0.75 }),
    detail: new THREE.MeshStandardMaterial({
      color: colors.detail,
      roughness: 0.48,
      metalness: suited ? 0.18 : 0.02
    }),
    feature: new THREE.MeshBasicMaterial({ color: colors.feature })
  };
};

const createHologramMaterials = (
  material: THREE.Material
): CharacterMaterials => ({
  skin: material,
  top: material,
  lower: material,
  hair: material,
  shoe: material,
  detail: material,
  feature: material
});

const addBox = (
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material
) => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  object.position.set(...position);
  group.add(object);
  return object;
};

const createWindowFrame = (
  group: THREE.Group,
  width: number,
  height: number,
  centerX: number,
  material: THREE.Material
) => {
  const y = 2.42;
  const z = -1.34;
  const rail = 0.09;
  addBox(group, [width + rail * 2, rail, 0.09], [centerX, y + height / 2, z], material);
  addBox(group, [width + rail * 2, rail, 0.09], [centerX, y - height / 2, z], material);
  addBox(group, [rail, height, 0.09], [centerX - width / 2, y, z], material);
  addBox(group, [rail, height, 0.09], [centerX + width / 2, y, z], material);
  addBox(group, [rail * 0.65, height, 0.075], [centerX, y, z + 0.02], material);
};

const createEarthRoom = () => {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x75695c,
    roughness: 0.96
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b3025,
    roughness: 0.78
  });
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x34231d,
    roughness: 0.7
  });
  const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x7fb9d2 });
  const grassMaterial = new THREE.MeshBasicMaterial({ color: 0x477b49 });
  const treeMaterial = new THREE.MeshBasicMaterial({ color: 0x315e39 });
  const treeLightMaterial = new THREE.MeshBasicMaterial({ color: 0x5d8d50 });
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xdce8e5 });

  addBox(group, [6.1, 3.8, 0.14], [0, 1.9, -1.7], wallMaterial);
  addBox(group, [6.1, 0.1, 4.3], [0, -0.07, 0.18], floorMaterial);
  [-2.35, -1.18, 0, 1.18, 2.35].forEach((x) => {
    addBox(group, [0.026, 0.012, 4.1], [x, 0, 0.18], woodMaterial);
  });

  const windowX = -0.42;
  addBox(group, [3.35, 1.9, 0.035], [windowX, 2.42, -1.55], skyMaterial);
  addBox(group, [3.3, 0.57, 0.045], [windowX, 1.76, -1.49], grassMaterial);
  [
    { x: -1.35, y: 2.0, scale: 0.72 },
    { x: 0.78, y: 1.94, scale: 0.58 }
  ].forEach(({ x, y, scale }) => {
    addBox(group, [0.13 * scale, 0.78 * scale, 0.05], [x, y, -1.43], woodMaterial);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.48 * scale, 18, 12),
      x < 0 ? treeMaterial : treeLightMaterial
    );
    crown.scale.set(1.05, 1.2, 0.12);
    crown.position.set(x, y + 0.48 * scale, -1.4);
    group.add(crown);
  });
  [-0.85, -0.55, -0.2].forEach((x, index) => {
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 + index * 0.03, 14, 10),
      cloudMaterial
    );
    cloud.scale.set(1.4, 0.55, 0.08);
    cloud.position.set(x, 2.92 + index * 0.04, -1.42);
    group.add(cloud);
  });
  createWindowFrame(group, 3.35, 1.9, windowX, woodMaterial);

  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc9e8ef,
    transparent: true,
    opacity: 0.11,
    roughness: 0.05,
    transmission: 0.18
  });
  addBox(group, [3.2, 1.75, 0.018], [windowX, 2.42, -1.28], glassMaterial);

  const curtainMaterial = new THREE.MeshStandardMaterial({
    color: 0x596246,
    roughness: 0.95
  });
  addBox(group, [0.18, 2.15, 0.11], [windowX - 1.8, 2.35, -1.25], curtainMaterial);
  addBox(group, [0.18, 2.15, 0.11], [windowX + 1.8, 2.35, -1.25], curtainMaterial);

  const rugMaterial = new THREE.MeshStandardMaterial({
    color: 0x38534b,
    roughness: 0.92,
    side: THREE.DoubleSide
  });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.05, 40), rugMaterial);
  rug.scale.set(1.22, 0.72, 1);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-0.35, 0.005, 0.5);
  group.add(rug);

  const potMaterial = new THREE.MeshStandardMaterial({ color: 0x9a593e });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x4d8155 });
  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.16, 0.34, 18),
    potMaterial
  );
  pot.position.set(-2.45, 0.16, -0.85);
  group.add(pot);
  [-0.18, 0, 0.18].forEach((x, index) => {
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 14, 10),
      leafMaterial
    );
    leaf.scale.set(0.55, 1.45, 0.38);
    leaf.rotation.z = x * 2.1;
    leaf.position.set(-2.45 + x, 0.55 + index * 0.06, -0.85);
    group.add(leaf);
  });

  const tableMaterial = new THREE.MeshStandardMaterial({
    color: 0x6d4936,
    roughness: 0.72
  });
  addBox(group, [0.9, 0.09, 0.68], [-1.62, 0.62, 0.42], tableMaterial);
  [-1.94, -1.3].forEach((x) => {
    [-0.22, 0.7].forEach((z) => {
      addBox(group, [0.08, 0.58, 0.08], [x, 0.3, z], tableMaterial);
    });
  });

  const televisionFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b1d,
    roughness: 0.42,
    metalness: 0.3
  });
  const televisionScreenMaterial = new THREE.MeshStandardMaterial({
    color: 0x16252a,
    emissive: 0x467f7b,
    emissiveIntensity: 0.24,
    roughness: 0.52
  });
  addBox(group, [1.36, 0.84, 0.11], [2.15, 2.57, -1.47], televisionFrameMaterial);
  addBox(group, [1.18, 0.66, 0.025], [2.15, 2.57, -1.39], televisionScreenMaterial);
  addBox(group, [1.48, 0.1, 0.52], [2.15, 0.74, -1.0], tableMaterial);
  [1.55, 2.75].forEach((x) => {
    addBox(group, [0.09, 0.7, 0.09], [x, 0.36, -1.0], tableMaterial);
  });
  [0.28, 0, -0.28].forEach((offset, index) => {
    const mediaTileMaterial = new THREE.MeshBasicMaterial({
      color: index === 1 ? 0x9fc7b3 : 0x6d9991
    });
    addBox(
      group,
      [0.2 + index * 0.04, 0.035, 0.012],
      [2.15 + offset, 2.57 - index * 0.13, -1.365],
      mediaTileMaterial
    );
  });

  return group;
};

const createMoonHabitat = () => {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x69747a,
    roughness: 0.72,
    metalness: 0.16
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x2e383e,
    roughness: 0.66,
    metalness: 0.25
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8c2c6,
    roughness: 0.42,
    metalness: 0.48
  });
  const spaceMaterial = new THREE.MeshBasicMaterial({ color: 0x07101a });
  const lunarMaterial = new THREE.MeshBasicMaterial({ color: 0x92999b });
  const lunarDarkMaterial = new THREE.MeshBasicMaterial({ color: 0x666d70 });

  addBox(group, [6.1, 3.8, 0.14], [0, 1.9, -1.7], wallMaterial);
  addBox(group, [6.1, 0.1, 4.3], [0, -0.07, 0.18], floorMaterial);
  const floorGrid = new THREE.GridHelper(6, 12, 0x839198, 0x4d5b62);
  floorGrid.position.set(0, 0, 0.18);
  group.add(floorGrid);

  const windowX = 0.35;
  addBox(group, [3.55, 1.95, 0.035], [windowX, 2.42, -1.55], spaceMaterial);
  const terrainShape = new THREE.Shape();
  terrainShape.moveTo(-1.72, -0.94);
  terrainShape.lineTo(-1.72, -0.38);
  terrainShape.lineTo(-1.25, -0.3);
  terrainShape.lineTo(-0.82, -0.42);
  terrainShape.lineTo(-0.3, -0.24);
  terrainShape.lineTo(0.2, -0.36);
  terrainShape.lineTo(0.72, -0.18);
  terrainShape.lineTo(1.2, -0.32);
  terrainShape.lineTo(1.72, -0.25);
  terrainShape.lineTo(1.72, -0.94);
  const terrain = new THREE.Mesh(
    new THREE.ShapeGeometry(terrainShape),
    lunarMaterial
  );
  terrain.position.set(windowX, 2.42, -1.45);
  group.add(terrain);

  [
    { x: -0.72, y: 1.72, sx: 0.32, sy: 0.12 },
    { x: 0.85, y: 1.83, sx: 0.24, sy: 0.09 }
  ].forEach(({ x, y, sx, sy }) => {
    const crater = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.1, 8, 30),
      lunarDarkMaterial
    );
    crater.scale.set(sx, sy, 0.05);
    crater.position.set(windowX + x, y, -1.39);
    group.add(crater);
  });

  const earthMaterial = new THREE.MeshStandardMaterial({
    color: 0x5ea9d1,
    emissive: 0x173d58,
    emissiveIntensity: 0.35,
    roughness: 0.7
  });
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 24, 16),
    earthMaterial
  );
  earth.position.set(windowX + 0.92, 2.94, -1.36);
  group.add(earth);
  const land = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x5f865c })
  );
  land.scale.set(1.25, 0.55, 0.15);
  land.position.set(windowX + 0.88, 2.98, -1.17);
  group.add(land);

  const starMaterial = new THREE.MeshBasicMaterial({ color: 0xe9f4f5 });
  [
    [-1.25, 2.85],
    [-0.72, 3.05],
    [-0.24, 2.7],
    [0.28, 3.02],
    [1.4, 2.73]
  ].forEach(([x, y]) => {
    const star = new THREE.Mesh(
      new THREE.SphereGeometry(0.017, 8, 6),
      starMaterial
    );
    star.position.set(windowX + x, y, -1.4);
    group.add(star);
  });
  createWindowFrame(group, 3.55, 1.95, windowX, frameMaterial);

  [-2.65, 2.65].forEach((x) => {
    const rib = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 3.5, 14),
      frameMaterial
    );
    rib.position.set(x, 1.72, -1.25);
    group.add(rib);
  });
  addBox(group, [5.45, 0.11, 0.16], [0, 3.42, -1.25], frameMaterial);
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xd8f2f2 });
  addBox(group, [1.65, 0.055, 0.08], [0, 3.34, -1.12], lightMaterial);

  const deskMaterial = new THREE.MeshStandardMaterial({
    color: 0x59666b,
    roughness: 0.5,
    metalness: 0.42
  });
  const equipmentMaterial = new THREE.MeshStandardMaterial({
    color: 0xc4ced0,
    roughness: 0.38,
    metalness: 0.56
  });
  const equipmentDarkMaterial = new THREE.MeshStandardMaterial({
    color: 0x202b31,
    roughness: 0.5,
    metalness: 0.38
  });
  const displayMaterial = new THREE.MeshStandardMaterial({
    color: 0x10262d,
    emissive: 0x45b8c3,
    emissiveIntensity: 0.38,
    roughness: 0.48
  });

  addBox(group, [1.68, 0.1, 0.78], [1.72, 0.82, -0.42], deskMaterial);
  [1.06, 2.38].forEach((x) => {
    [-0.68, -0.16].forEach((z) => {
      addBox(group, [0.09, 0.76, 0.09], [x, 0.4, z], deskMaterial);
    });
  });

  addBox(group, [0.58, 0.04, 0.38], [1.62, 0.91, -0.38], equipmentDarkMaterial);
  addBox(group, [0.6, 0.4, 0.045], [1.62, 1.13, -0.64], equipmentDarkMaterial);
  addBox(group, [0.5, 0.3, 0.012], [1.62, 1.13, -0.605], displayMaterial);
  addBox(group, [0.2, 0.018, 0.08], [1.62, 0.935, -0.2], equipmentMaterial);

  addBox(group, [0.34, 0.06, 0.28], [1.08, 0.9, -0.28], equipmentDarkMaterial);
  const analyzerStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.36, 12),
    equipmentMaterial
  );
  analyzerStand.position.set(1.08, 1.1, -0.38);
  group.add(analyzerStand);
  const analyzerArm = addBox(
    group,
    [0.08, 0.38, 0.08],
    [1.17, 1.24, -0.38],
    equipmentMaterial
  );
  analyzerArm.rotation.z = -0.58;

  addBox(group, [0.46, 0.1, 0.22], [2.24, 0.91, -0.26], equipmentDarkMaterial);
  [2.1, 2.24, 2.38].forEach((x, index) => {
    const sampleMaterial = new THREE.MeshStandardMaterial({
      color: index === 0 ? 0x82dce0 : index === 1 ? 0xe5cf78 : 0xd89dbf,
      emissive: index === 0 ? 0x1e646c : index === 1 ? 0x554b1a : 0x5b2647,
      emissiveIntensity: 0.28,
      transparent: true,
      opacity: 0.9
    });
    const sample = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.3, 12),
      sampleMaterial
    );
    sample.position.set(x, 1.08, -0.26);
    group.add(sample);
  });

  [2.58, 2.82].forEach((x, index) => {
    const canister = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.78 - index * 0.08, 18),
      equipmentMaterial
    );
    canister.position.set(x, 0.36, -0.92);
    group.add(canister);
    const canisterBand = new THREE.Mesh(
      new THREE.TorusGeometry(0.135, 0.018, 8, 20),
      index === 0 ? displayMaterial : lightMaterial
    );
    canisterBand.rotation.x = Math.PI / 2;
    canisterBand.position.set(x, 0.48, -0.92);
    group.add(canisterBand);
  });

  addBox(group, [1.08, 0.76, 0.09], [-2.27, 2.52, -1.47], equipmentDarkMaterial);
  addBox(group, [0.92, 0.6, 0.022], [-2.27, 2.52, -1.39], displayMaterial);
  [0.18, 0, -0.18].forEach((offset, index) => {
    addBox(
      group,
      [0.5 - index * 0.08, 0.035, 0.012],
      [-2.27, 2.52 + offset, -1.365],
      index === 1 ? lightMaterial : equipmentMaterial
    );
  });

  return group;
};

const createSpaceStation = () => {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x39444c,
    roughness: 0.58,
    metalness: 0.34
  });
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8c2c6,
    roughness: 0.35,
    metalness: 0.62
  });
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x242d33,
    roughness: 0.62,
    metalness: 0.28
  });
  const equipmentMaterial = new THREE.MeshStandardMaterial({
    color: 0x59666b,
    roughness: 0.45,
    metalness: 0.5
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x172128,
    roughness: 0.48,
    metalness: 0.38
  });
  const displayMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b2028,
    emissive: 0x48b8d1,
    emissiveIntensity: 0.46,
    roughness: 0.42
  });

  addBox(group, [6.1, 3.8, 0.14], [0, 1.9, -1.7], wallMaterial);
  addBox(group, [6.1, 0.1, 4.3], [0, -0.07, 0.18], floorMaterial);
  const floorGrid = new THREE.GridHelper(6, 12, 0x75848c, 0x3e4b52);
  floorGrid.position.set(0, 0, 0.18);
  group.add(floorGrid);

  const viewportX = 0.18;
  const spaceMaterial = new THREE.MeshBasicMaterial({ color: 0x03080f });
  addBox(group, [3.75, 1.98, 0.035], [viewportX, 2.4, -1.55], spaceMaterial);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 36, 24),
    new THREE.MeshStandardMaterial({
      color: 0x4c9bc2,
      emissive: 0x153d58,
      emissiveIntensity: 0.38,
      roughness: 0.68
    })
  );
  earth.position.set(viewportX + 0.78, 2.1, -1.42);
  group.add(earth);
  const atmosphere = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.035, 10, 56),
    new THREE.MeshBasicMaterial({ color: 0x9edbe7, transparent: true, opacity: 0.65 })
  );
  atmosphere.position.copy(earth.position);
  group.add(atmosphere);
  [-1.4, -0.92, -0.54, 0.08, 1.52].forEach((x, index) => {
    const star = new THREE.Mesh(
      new THREE.SphereGeometry(0.016 + (index % 2) * 0.008, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xeaf5f6 })
    );
    star.position.set(viewportX + x, 2.75 + (index % 3) * 0.18, -1.4);
    group.add(star);
  });
  createWindowFrame(group, 3.75, 1.98, viewportX, frameMaterial);

  [-2.68, 2.68].forEach((x) => {
    const rib = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 3.5, 14),
      frameMaterial
    );
    rib.position.set(x, 1.72, -1.2);
    group.add(rib);
  });
  addBox(group, [5.5, 0.12, 0.18], [0, 3.44, -1.2], frameMaterial);
  addBox(
    group,
    [1.8, 0.055, 0.08],
    [0, 3.34, -1.08],
    new THREE.MeshBasicMaterial({ color: 0xe6f4ed })
  );

  addBox(group, [1.58, 0.1, 0.72], [1.82, 0.8, -0.38], equipmentMaterial);
  [1.2, 2.44].forEach((x) => {
    [-0.62, -0.16].forEach((z) => {
      addBox(group, [0.08, 0.74, 0.08], [x, 0.39, z], frameMaterial);
    });
  });
  addBox(group, [0.76, 0.5, 0.06], [1.82, 1.18, -0.68], darkMaterial);
  addBox(group, [0.64, 0.38, 0.018], [1.82, 1.18, -0.635], displayMaterial);
  [0.19, 0, -0.19].forEach((offset, index) => {
    addBox(
      group,
      [0.42 - index * 0.06, 0.028, 0.012],
      [1.82, 1.18 + offset, -0.615],
      index === 1
        ? new THREE.MeshBasicMaterial({ color: 0xffd36a })
        : new THREE.MeshBasicMaterial({ color: 0x8fdcff })
    );
  });

  addBox(group, [0.74, 1.36, 0.38], [-2.35, 0.68, -0.9], equipmentMaterial);
  addBox(group, [0.58, 0.28, 0.035], [-2.35, 1.24, -0.68], displayMaterial);
  [-2.56, -2.34, -2.12].forEach((x, index) => {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.62, 16),
      index === 1 ? frameMaterial : equipmentMaterial
    );
    tank.position.set(x, 0.31, -0.45);
    group.add(tank);
  });

  return group;
};

const createStationEnvironment = (station: StationId) => {
  if (station === "earth") {
    return createEarthRoom();
  }
  if (station === "moon") {
    return createMoonHabitat();
  }
  return createSpaceStation();
};

const createMonitor = (
  accentColor: number,
  remoteParticipant: Participant,
  remoteStation: StationId,
  remoteAvatar: AvatarId
): MonitorRig => {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b3038,
    roughness: 0.46,
    metalness: 0.34
  });
  const screenMaterial = new THREE.MeshStandardMaterial({
    color: 0x090d12,
    emissive: accentColor,
    emissiveIntensity: 0.035,
    roughness: 0.8
  });
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 1.62, 0.1),
    frameMaterial
  );
  frame.position.y = 1.38;
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 1.39, 0.035),
    screenMaterial
  );
  screen.position.set(0, 1.38, 0.07);
  const stand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.055, 0.55, 12),
    frameMaterial
  );
  stand.position.y = 0.37;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.07, 0.34),
    frameMaterial
  );
  base.position.y = 0.08;
  group.add(frame, screen, stand, base);

  const textMaterial = new THREE.MeshBasicMaterial({
    color: formColors.text,
    transparent: true,
    opacity: 0
  });
  const textLines = new THREE.Group();
  [0.72, 0.56, 0.64].forEach((width, index) => {
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.035, 0.018),
      textMaterial
    );
    line.position.set(-0.16 + width * 0.08, 1.66 - index * 0.14, 0.13);
    textLines.add(line);
  });
  group.add(textLines);

  const voiceMaterial = new THREE.MeshBasicMaterial({
    color: formColors.voice,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const voiceRings = new THREE.Group();
  [0.2, 0.31, 0.42].forEach((radius) => {
    voiceRings.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.012, 8, 40),
        voiceMaterial
      )
    );
  });
  voiceRings.position.set(0, 1.47, 0.13);
  group.add(voiceRings);

  const expressionMaterial = new THREE.MeshBasicMaterial({
    color: formColors.expression,
    wireframe: true,
    transparent: true,
    opacity: 0
  });
  const expressionRig = createAvatar(
    remoteParticipant,
    createHologramMaterials(expressionMaterial),
    remoteStation !== "earth",
    remoteAvatar
  );
  expressionRig.group.position.set(0, 1.0, 0.13);
  expressionRig.group.scale.setScalar(0.4);
  expressionRig.group.visible = false;
  group.add(expressionRig.group);

  const pointMaterial = new THREE.PointsMaterial({
    color: formColors.pointCloud,
    size: 0.026,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const pointCloud = new THREE.Group();
  pointCloud.add(
    new THREE.Points(createEnvironmentPointGeometry(remoteStation), pointMaterial),
    new THREE.Points(createHumanPointGeometry(), pointMaterial)
  );
  pointCloud.position.set(0, 1.02, 0.34);
  pointCloud.scale.setScalar(0.39);
  pointCloud.visible = false;
  group.add(pointCloud);

  const formIndicators = PRESENCE_SEQUENCE.reduce(
    (indicators, form, index) => {
      const material = new THREE.MeshBasicMaterial({
        color: formColors[form],
        transparent: true,
        opacity: 0.12
      });
      const indicator = new THREE.Mesh(
        new THREE.BoxGeometry(0.27, 0.025, 0.018),
        material
      );
      indicator.position.set(
        (index - (PRESENCE_SEQUENCE.length - 1) / 2) * 0.28,
        0.76,
        0.12
      );
      group.add(indicator);
      indicators[form] = material;
      return indicators;
    },
    {} as Record<PresenceFormId, THREE.MeshBasicMaterial>
  );

  return {
    group,
    screenMaterial,
    textLines,
    textMaterial,
    voiceRings,
    voiceMaterial,
    expressionRig,
    expressionMaterial,
    pointCloud,
    pointMaterial,
    formIndicators
  };
};

const getLatestTurn = (
  events: TransmissionEvent[],
  recipient: Participant,
  simulationTime: number
) => {
  const receivedTurns = events.filter((event) =>
    event.recipient === recipient && event.captureTime <= simulationTime);
  const latest = receivedTurns.reduce<TransmissionEvent | null>((current, event) =>
    !current || event.captureTime > current.captureTime ||
    (event.captureTime === current.captureTime && event.messageIndex > current.messageIndex)
      ? event : current, null);
  return receivedTurns.filter((event) => event.messageId === latest?.messageId);
};

const setAvatarMotion = (
  rig: AvatarRig,
  speaking: boolean,
  gesturing: boolean,
  elapsed: number,
  reducedMotion: boolean
) => {
  const mouthPulse = reducedMotion
    ? 1
    : 0.55 + Math.abs(Math.sin(elapsed * 11)) * 2.1;
  rig.mouth.scale.y = speaking ? mouthPulse : 0.45;
  const gestureLift = gesturing
    ? 1.02 + (reducedMotion ? 0 : Math.sin(elapsed * 3.2) * 0.14)
    : 0;
  rig.gestureArm.rotation.z =
    rig.gestureRest + rig.gestureDirection * gestureLift;
  rig.gestureElbow.rotation.z = gesturing
    ? rig.gestureDirection * 1.15
    : 0;
};

const updateMonitor = (
  monitor: MonitorRig,
  events: TransmissionEvent[],
  simulationTime: number,
  selectedForm: PresenceFormId,
  elapsed: number,
  reducedMotion: boolean
) => {
  const text = events.find((event) => event.presenceForm === "text");
  const voice = events.find((event) => event.presenceForm === "voice");
  const expression = events.find(
    (event) => event.presenceForm === "expression"
  );
  const pointCloud = events.find(
    (event) => event.presenceForm === "pointCloud"
  );
  const textReady = Boolean(text && simulationTime >= text.renderReadyAt);
  const voiceReady = Boolean(voice && simulationTime >= voice.renderReadyAt);
  const expressionReady = Boolean(
    expression && simulationTime >= expression.renderReadyAt
  );
  const pointProgress = pointCloud
    ? simulationTime < pointCloud.networkArrivalTime
      ? 0
      : pointCloud.reconstructionTime <= 0
        ? 1
        : clamp(
            (simulationTime - pointCloud.networkArrivalTime) /
              pointCloud.reconstructionTime
          )
    : 0;

  monitor.textMaterial.opacity = textReady
    ? voiceReady
      ? 0.18
      : selectedForm === "text"
        ? 0.9
        : 0.62
    : 0;

  monitor.voiceMaterial.opacity = voiceReady
    ? expressionReady
      ? 0.14
      : selectedForm === "voice"
        ? 0.88
        : 0.58
    : 0;
  monitor.voiceRings.scale.setScalar(
    reducedMotion ? 1 : 0.96 + Math.sin(elapsed * 3.1) * 0.06
  );

  monitor.expressionRig.group.visible = expressionReady && pointProgress < 1;
  monitor.expressionMaterial.opacity = expressionReady
    ? pointProgress >= 1
      ? 0.14
      : selectedForm === "expression"
        ? 0.82
        : 0.58
    : 0;
  const embodiedPlayback = expressionReady && pointProgress < 1;
  setAvatarMotion(
    monitor.expressionRig,
    embodiedPlayback,
    embodiedPlayback,
    elapsed,
    reducedMotion
  );

  monitor.pointCloud.visible = pointProgress > 0;
  monitor.pointMaterial.opacity =
    pointProgress * (selectedForm === "pointCloud" ? 0.98 : 0.72);
  monitor.pointCloud.rotation.y = reducedMotion
    ? 0
    : Math.sin(elapsed * 0.55) * 0.08;
  monitor.screenMaterial.emissiveIntensity =
    pointProgress > 0
      ? 0.16
      : expressionReady
        ? 0.11
        : voiceReady
          ? 0.08
          : textReady
            ? 0.055
            : 0.035;

  monitor.formIndicators.text.opacity = textReady ? 0.9 : 0.12;
  monitor.formIndicators.voice.opacity = voiceReady ? 0.9 : 0.12;
  monitor.formIndicators.expression.opacity = expressionReady ? 0.9 : 0.12;
  monitor.formIndicators.pointCloud.opacity = pointProgress >= 1 ? 0.9 : 0.12;
};

export function SpatialScene({
  events,
  focusMessageId,
  simulationTime,
  selectedForm,
  reducedMotion,
  fatherStation,
  daughterStation,
  fatherAvatar,
  daughterAvatar
}: SpatialSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({
    events,
    focusMessageId,
    simulationTime,
    selectedForm,
    reducedMotion
  });

  stateRef.current = {
    events,
    focusMessageId,
    simulationTime,
    selectedForm,
    reducedMotion
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07090d, 12, 22);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 40);
    camera.position.set(0, 2.35, 8.2);
    camera.lookAt(0, 0.95, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x07090d, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      fatherStation && daughterStation
        ? "Two participants in their selected environments, each beside a presence monitor"
        : "One participant in their selected environment with the second position waiting to be filled"
    );
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xd6e9f1, 0x332b26, 1.5));
    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    const fatherLight = new THREE.PointLight(0xffc08a, 28, 12);
    fatherLight.position.set(-3.4, 4.2, 3.5);
    scene.add(fatherLight);
    const daughterLight = new THREE.PointLight(0x8bdcff, 24, 12);
    daughterLight.position.set(3.4, 3.8, 3.2);
    scene.add(daughterLight);

    const fatherSceneStation = fatherStation ?? "earth";
    const daughterSceneStation = daughterStation ?? "moon";
    const fatherSceneAvatar = fatherAvatar ?? "atlas";
    const daughterSceneAvatar = daughterAvatar ?? "nova";
    const earthRoom = createStationEnvironment(fatherSceneStation);
    const moonHabitat = createStationEnvironment(daughterSceneStation);
    earthRoom.visible = fatherStation !== null;
    moonHabitat.visible = daughterStation !== null;
    earthRoom.position.x = -3.25;
    moonHabitat.position.x = 3.25;
    scene.add(earthRoom, moonHabitat);

    const father = createAvatar(
      "father",
      createCharacterMaterials(
        fatherSceneAvatar,
        fatherSceneStation !== "earth"
      ),
      fatherSceneStation !== "earth",
      fatherSceneAvatar
    );
    const daughter = createAvatar(
      "daughter",
      createCharacterMaterials(
        daughterSceneAvatar,
        daughterSceneStation !== "earth"
      ),
      daughterSceneStation !== "earth",
      daughterSceneAvatar
    );
    father.group.visible = fatherStation !== null;
    daughter.group.visible = daughterStation !== null;
    father.group.position.set(-3.25, 0.16, 0);
    daughter.group.position.set(3.25, 0.16, 0);
    scene.add(father.group, daughter.group);

    const fatherMonitor = createMonitor(
      participantColors.father,
      "daughter",
      daughterSceneStation,
      daughterSceneAvatar
    );
    const daughterMonitor = createMonitor(
      participantColors.daughter,
      "father",
      fatherSceneStation,
      fatherSceneAvatar
    );
    fatherMonitor.group.visible = fatherStation !== null;
    daughterMonitor.group.visible = daughterStation !== null;
    fatherMonitor.group.position.x = -1.32;
    daughterMonitor.group.position.x = 1.32;
    scene.add(fatherMonitor.group, daughterMonitor.group);

    const createAnchor = (color: number) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.22
      });
      const anchor = new THREE.Mesh(
        new THREE.RingGeometry(0.68, 0.7, 48),
        material
      );
      anchor.rotation.x = -Math.PI / 2;
      anchor.position.y = 0.02;
      scene.add(anchor);
      return { anchor, material };
    };
    const fatherAnchor = createAnchor(participantColors.father);
    const daughterAnchor = createAnchor(participantColors.daughter);
    fatherAnchor.anchor.visible = fatherStation !== null;
    daughterAnchor.anchor.visible = daughterStation !== null;
    fatherAnchor.anchor.position.x = -3.25;
    daughterAnchor.anchor.position.x = 3.25;

    const packetGeometry = new THREE.SphereGeometry(0.085, 16, 12);
    const packets = PRESENCE_SEQUENCE.reduce(
      (map, form) => {
        const material = new THREE.MeshBasicMaterial({ color: formColors[form] });
        const packet = new THREE.Mesh(packetGeometry, material);
        packet.visible = false;
        scene.add(packet);
        map[form] = packet;
        return map;
      },
      {} as Record<PresenceFormId, THREE.Mesh>
    );

    const layout = {
      fatherX: -3.25,
      fatherMonitorX: -1.32,
      daughterMonitorX: 1.32,
      daughterX: 3.25
    };

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const compact = width < 620;
      const medium = width >= 620 && width < 1020;
      layout.fatherX = compact ? -1.42 : medium ? -2.55 : -3.25;
      layout.fatherMonitorX = compact ? -0.56 : medium ? -0.92 : -1.32;
      layout.daughterMonitorX = -layout.fatherMonitorX;
      layout.daughterX = -layout.fatherX;

      father.group.position.x = layout.fatherX;
      daughter.group.position.x = layout.daughterX;
      fatherMonitor.group.position.x = layout.fatherMonitorX;
      daughterMonitor.group.position.x = layout.daughterMonitorX;
      earthRoom.position.x = layout.fatherX;
      moonHabitat.position.x = layout.daughterX;
      fatherAnchor.anchor.position.x = layout.fatherX;
      daughterAnchor.anchor.position.x = layout.daughterX;

      const avatarScale = compact ? 0.8 : medium ? 0.9 : 1;
      const monitorScale = compact ? 0.64 : medium ? 0.88 : 1;
      const environmentScaleX = compact ? 0.4 : medium ? 0.76 : 1;
      const environmentScaleY = compact ? 0.8 : medium ? 0.92 : 1;
      const environmentScaleZ = compact ? 0.66 : medium ? 0.84 : 1;
      father.group.scale.setScalar(avatarScale);
      daughter.group.scale.setScalar(avatarScale);
      fatherMonitor.group.scale.setScalar(monitorScale);
      daughterMonitor.group.scale.setScalar(monitorScale);
      earthRoom.scale.set(
        environmentScaleX,
        environmentScaleY,
        environmentScaleZ
      );
      moonHabitat.scale.set(
        environmentScaleX,
        environmentScaleY,
        environmentScaleZ
      );
      const compactAspect = width / height;
      const compactCameraDistance =
        compactAspect > 1.8 ? 6.4 : compactAspect > 1.1 ? 8.6 : 11.7;
      camera.position.z = compact ? compactCameraDistance : medium ? 10.2 : 8.6;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const current = stateRef.current;
      const focusEvents = current.events.filter(
        (event) => event.messageId === current.focusMessageId
      );
      const source = focusEvents[0]?.sender ?? "father";
      const destination = source === "father" ? "daughter" : "father";
      const formEvents = PRESENCE_SEQUENCE.reduce(
        (map, form) => {
          map[form] = focusEvents.find((event) => event.presenceForm === form);
          return map;
        },
        {} as Partial<Record<PresenceFormId, TransmissionEvent>>
      );

      const sourceCenterX =
        source === "father" ? layout.fatherX : layout.daughterX;
      const startX = sourceCenterX + (source === "father" ? 0.55 : -0.55);
      const endX =
        destination === "father"
          ? layout.fatherMonitorX
          : layout.daughterMonitorX;
      PRESENCE_SEQUENCE.forEach((form, index) => {
        const packet = packets[form];
        const event = formEvents[form];
        if (!event) {
          packet.visible = false;
          return;
        }

        const snapshot = getSnapshot(event, current.simulationTime);
        packet.visible = snapshot.state === "travelling";
        packet.position.set(
          startX + snapshot.progress * (endX - startX),
          1.95 - index * 0.38 + Math.sin(snapshot.progress * Math.PI) * 0.35,
          0.2 - index * 0.12
        );
        packet.scale.setScalar(current.selectedForm === form ? 1.45 : 1);
      });

      const cloudStarts = new Map(current.events.filter((event) =>
        event.presenceForm === "pointCloud").map((event) => [event.messageId, event.sentAt]));
      const activity = {
        father: { speaking: false, gesturing: false },
        daughter: { speaking: false, gesturing: false }
      };
      current.events.forEach((event) => {
        const cloudStart = cloudStarts.get(event.messageId) ?? event.sentAt;
        if (event.presenceForm === "voice" &&
          current.simulationTime >= event.sentAt &&
          current.simulationTime < cloudStart + 0.45) {
          activity[event.sender].speaking = true;
        }
        if (event.presenceForm === "expression" &&
          current.simulationTime >= event.sentAt - 0.2 &&
          current.simulationTime < cloudStart + 0.7) {
          activity[event.sender].gesturing = true;
        }
      });
      setAvatarMotion(
        father,
        activity.father.speaking,
        activity.father.gesturing,
        elapsed,
        current.reducedMotion
      );
      setAvatarMotion(
        daughter,
        activity.daughter.speaking,
        activity.daughter.gesturing,
        elapsed,
        current.reducedMotion
      );

      fatherAnchor.material.opacity = source === "father" || activity.father.speaking ? 0.68 : 0.2;
      daughterAnchor.material.opacity = source === "daughter" || activity.daughter.speaking ? 0.68 : 0.2;

      updateMonitor(
        fatherMonitor,
        getLatestTurn(current.events, "father", current.simulationTime),
        current.simulationTime,
        current.selectedForm,
        elapsed,
        current.reducedMotion
      );
      updateMonitor(
        daughterMonitor,
        getLatestTurn(current.events, "daughter", current.simulationTime),
        current.simulationTime,
        current.selectedForm,
        elapsed,
        current.reducedMotion
      );

      if (!current.reducedMotion) {
        father.group.position.y = 0.16 + Math.sin(elapsed * 1.1) * 0.014;
        daughter.group.position.y = 0.16 + Math.sin(elapsed * 1.1 + 1.4) * 0.014;
        camera.position.x = Math.sin(elapsed * 0.16) * 0.08;
        camera.lookAt(0, 0.95, 0);
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      renderer.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [daughterAvatar, daughterStation, fatherAvatar, fatherStation]);

  return <div className="spatial-canvas" ref={mountRef} />;
}

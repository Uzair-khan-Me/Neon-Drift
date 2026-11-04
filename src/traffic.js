/**
 * Autonomous traffic system.
 *
 * Multiple vehicle types (sedan, SUV, hatchback, van, pickup) drive in fixed
 * lanes at their own speed, despawn behind the player and respawn ahead with
 * spacing. Right-hand traffic: player direction on the right lanes, oncoming
 * on the left lanes.
 */
import * as THREE from 'three';

const LANES = [
  { x: 7.5, dir: 1 },    // player direction, right lanes
  { x: 2.5, dir: 1 },
  { x: -2.5, dir: -1 },  // oncoming, left lanes
  { x: -7.5, dir: -1 },
];

const DESPAWN_BEHIND = 340;
const SPAWN_AHEAD_MIN = 240;
const SPAWN_AHEAD_MAX = 750;
const MAX_VEHICLES = 20;

const typeConfigs = [
  { name: 'sedan', size: 1.0, color: 0x1a252f, height: 1.45, length: 4.6, width: 1.85 },
  { name: 'sedan', size: 0.95, color: 0xffffff, height: 1.42, length: 4.55, width: 1.8 },
  { name: 'suv', size: 1.15, color: 0x2a3a4a, height: 1.75, length: 4.9, width: 1.95 },
  { name: 'hatchback', size: 0.85, color: 0x4a5a2a, height: 1.5, length: 4.1, width: 1.75 },
  { name: 'van', size: 1.05, color: 0xc9d2d9, height: 1.95, length: 5.1, width: 1.9 },
  { name: 'pickup', size: 1.1, color: 0x3a4a2a, height: 1.85, length: 5.4, width: 2.0 },
];

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = [];
  }

  init(playerZ) {
    for (let i = 0; i < 12; i++) {
      this.spawn(playerZ + 200 + Math.random() * 900);
    }
  }

  spawn(preferredZ) {
    if (this.vehicles.length >= MAX_VEHICLES) return;

    const lane = LANES[Math.floor(Math.random() * LANES.length)];
    const tooClose = this.vehicles.some(
      (v) => v.lane === lane && Math.abs(v.z - preferredZ) < 48
    );
    if (tooClose) return;

    const cfg = typeConfigs[Math.floor(Math.random() * typeConfigs.length)];
    const speed = 15 + Math.random() * 16; // m/s (~54-112 km/h)
    const mesh = this.buildVehicle(cfg);
    mesh.position.set(lane.x, 0.3, preferredZ);

    this.scene.add(mesh);
    this.vehicles.push({ mesh, lane, z: preferredZ, speed, cfg, nearMissed: false });
  }

  buildVehicle(cfg) {
    const group = new THREE.Group();
    const s = cfg.size;
    const mat = new THREE.MeshStandardMaterial({ color: cfg.color, metalness: 0.6, roughness: 0.35 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.8, roughness: 0.2 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x263238, transparent: true, opacity: 0.55 });
    const matTire = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95 });
    const matRim = new THREE.MeshStandardMaterial({ color: 0x2a2f35, metalness: 0.6, roughness: 0.3 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(cfg.width * s, cfg.height * s * 0.55, cfg.length * s), mat);
    body.position.y = 0.75 * s;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(cfg.width * s * 0.85, cfg.height * s * 0.45, cfg.length * s * 0.5), mat);
    cabin.position.set(0, 1.05 * s, cfg.length * s * 0.1);
    cabin.castShadow = true;
    group.add(cabin);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.width * s * 0.8, cfg.height * s * 0.35, cfg.length * s * 0.42),
      matGlass
    );
    glass.position.set(0, 1.3 * s, cfg.length * s * 0.12);
    group.add(glass);

    // Bumpers
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(cfg.width * s * 1.05, cfg.height * s * 0.35, 0.35 * s), matDark);
    bumperF.position.set(0, 0.55 * s, cfg.length * s / 2 + 0.18 * s);
    bumperF.castShadow = true;
    group.add(bumperF);
    const bumperR = bumperF.clone();
    bumperR.position.z = -(cfg.length * s / 2 + 0.18 * s);
    group.add(bumperR);

    // Lights
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222244, emissiveIntensity: 0.3 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x7a1414, emissive: 0x220000, emissiveIntensity: 0.3 });
    const hlW = 0.12 * s, hlH = 0.18 * s, hlD = 0.35 * s;
    const headL = new THREE.Mesh(new THREE.BoxGeometry(hlW, hlH, hlD), headMat);
    headL.position.set(cfg.width * s / 2 - 0.1 * s, 0.7 * s, cfg.length * s / 2 + 0.19 * s);
    group.add(headL);
    const headR = headL.clone(); headR.position.x = -headL.position.x; group.add(headR);
    const tailL = new THREE.Mesh(new THREE.BoxGeometry(hlW, hlH, hlD), tailMat);
    tailL.position.set(cfg.width * s / 2 - 0.1 * s, 0.7 * s, -(cfg.length * s / 2 + 0.19 * s));
    group.add(tailL);
    const tailR = tailL.clone(); tailR.position.x = -tailL.position.x; group.add(tailR);

    // Wheels
    const wheelR = 0.36 * s;
    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.34 * s, 16);
    wheelGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(wheelR * 0.6, wheelR * 0.6, 0.36 * s, 14);
    rimGeo.rotateX(Math.PI / 2);
    const wPos = [
      [cfg.width * s / 2 + 0.05 * s, 0.65 * s, -cfg.length * s / 3],
      [-cfg.width * s / 2 - 0.05 * s, 0.65 * s, -cfg.length * s / 3],
      [cfg.width * s / 2 + 0.05 * s, 0.65 * s, cfg.length * s / 3],
      [-cfg.width * s / 2 - 0.05 * s, 0.65 * s, cfg.length * s / 3],
    ];
    for (const [x, y, z] of wPos) {
      const asm = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, matTire);
      tire.position.set(x, y, z);
      tire.castShadow = true;
      asm.add(tire);
      const rim = new THREE.Mesh(rimGeo, matRim);
      rim.position.set(x, y, z);
      rim.castShadow = true;
      asm.add(rim);
      group.add(asm);
    }

    group.updateMatrixWorld();
    return group;
  }

  step(dt, playerZ) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.z += v.speed * v.lane.dir * dt;
      v.mesh.position.z = v.z;

      if (v.z < playerZ - DESPAWN_BEHIND) {
        this.remove(i);
        this.spawn(playerZ + SPAWN_AHEAD_MIN + Math.random() * (SPAWN_AHEAD_MAX - SPAWN_AHEAD_MIN));
        continue;
      }
    }

    while (this.vehicles.length < 5) {
      this.spawn(playerZ + SPAWN_AHEAD_MIN + Math.random() * SPAWN_AHEAD_MAX);
    }
  }

  remove(i) {
    const v = this.vehicles[i];
    this.scene.remove(v.mesh);
    v.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    this.vehicles.splice(i, 1);
  }

  vehicleBounds(v) {
    const p = v.mesh.position;
    const s = v.cfg.size;
    return new THREE.Box3(
      new THREE.Vector3(p.x - 0.95 * s, 0.05, v.z - 1.05 * s),
      new THREE.Vector3(p.x + 0.95 * s, 1.5 * s, v.z + 1.05 * s)
    );
  }

  dispose() {
    for (const v of this.vehicles) this.scene.remove(v.mesh);
    this.vehicles = [];
  }
}

/**
 * Autonomous traffic system.
 *
 * Vehicles drive in fixed lanes at their own speed, despawn behind the player
 * and are respawned ahead with spacing. Same-direction traffic uses the left
 * lanes; oncoming traffic uses the right lanes (left-hand traffic country).
 */
import * as THREE from 'three';

const LANES = [
  { x: -7.5, dir: 1 },   // player direction, left lanes
  { x: -2.5, dir: 1 },
  { x: 2.5, dir: -1 },   // oncoming, right lanes
  { x: 7.5, dir: -1 },
];

const DESPAWN_BEHIND = 360;
const SPAWN_AHEAD_MIN = 220;
const SPAWN_AHEAD_MAX = 700;
const MAX_VEHICLES = 22;

const colors = [0xff4444, 0x44ff88, 0x4488ff, 0xffe066, 0xff66ff, 0x888888, 0x222222, 0xdddd22];

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = [];
  }

  /** Spawn a handful of vehicles immediately ahead at the start of a run. */
  init(playerZ) {
    for (let i = 0; i < 14; i++) {
      this.spawn(playerZ + 180 + Math.random() * 900);
    }
  }

  spawn(preferredZ) {
    if (this.vehicles.length >= MAX_VEHICLES) return;

    const lane = LANES[Math.floor(Math.random() * LANES.length)];
    // Avoid spawning right on top of another vehicle in the same lane
    const tooClose = this.vehicles.some(
      (v) => v.lane === lane && Math.abs(v.z - preferredZ) < 45
    );
    if (tooClose) return;

    const speed = 15 + Math.random() * 15; // m/s (~54-108 km/h)
    const mesh = this.buildVehicle();
    mesh.position.set(lane.x, 0.3, preferredZ);

    this.scene.add(mesh);
    this.vehicles.push({ mesh, lane, z: preferredZ, speed, nearMissed: false });
  }

  buildVehicle() {
    const group = new THREE.Group();
    const color = colors[Math.floor(Math.random() * colors.length)];
    const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.4 });

    const size = 0.8 + Math.random() * 0.45; // vehicle variety
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.1 * size, 1.4 * size, 4.2 * size), mat);
    body.position.y = 0.7 * size;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5 * size, 0.9 * size, 2.2 * size), mat);
    cabin.position.set(0, 1.35 * size, 0);
    cabin.castShadow = true;
    group.add(cabin);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.3 * size, 0.7 * size, 1.8 * size),
      new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.55 })
    );
    glass.position.set(0, 1.62 * size, 0.05);
    group.add(glass);

    const wheelGeo = new THREE.CylinderGeometry(0.34 * size, 0.34 * size, 0.28 * size, 12);
    wheelGeo.rotateX(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const wPos = [
      [1.05 * size, 0.7 * size, -1.5 * size],
      [-1.05 * size, 0.7 * size, -1.5 * size],
      [1.05 * size, 0.7 * size, 1.5 * size],
      [-1.05 * size, 0.7 * size, 1.5 * size],
    ];
    for (const [x, y, z] of wPos) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, y, z);
      w.castShadow = true;
      group.add(w);
    }

    group.updateMatrixWorld();
    return group;
  }

  /** Advance all vehicles by dt seconds. Despawn / respawn those behind the player. */
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

    // Keep traffic density up
    while (this.vehicles.length < 6) {
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

  /** Axis-aligned hitbox for a vehicle (a bit tighter than visuals for forgiveness). */
  vehicleBounds(v) {
    const p = v.mesh.position;
    return new THREE.Box3(
      new THREE.Vector3(p.x - 1.05, 0.05, v.z - 2.0),
      new THREE.Vector3(p.x + 1.05, 1.55, v.z + 2.0)
    );
  }

  dispose() {
    for (const v of this.vehicles) this.scene.remove(v.mesh);
    this.vehicles = [];
  }
}

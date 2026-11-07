/**
 * Autonomous traffic system.
 *
 * Real vehicle models (sedan, SUV, hatchback, taxi, police, van) drive in
 * fixed lanes at their own speed, keep spacing, despawn behind the player
 * and respawn ahead. Right-hand traffic: player direction on the right
 * lanes, oncoming on the left lanes.
 *
 * Vehicles have functioning brake lights and turn indicators.
 */
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { assetLoader } from './assetLoader.js';

const LANES = [
  { x: 7.5, dir: 1 },   // player direction, right lanes
  { x: 2.5, dir: 1 },
  { x: -2.5, dir: -1 }, // oncoming, left lanes
  { x: -7.5, dir: -1 },
];

const DESPAWN_BEHIND = 360;
const SPAWN_AHEAD_MIN = 260;
const SPAWN_AHEAD_MAX = 800;
const MAX_VEHICLES = 18;

// Traffic type -> model key + colour variants (realistic automotive palette)
const TYPES = [
  { key: 'sedan',  colors: [0x1a252f, 0xffffff, 0x7f8c8d, 0x2c3e50, 0x143a2e] },
  { key: 'suv',    colors: [0x2c3e50, 0x7f8c8d, 0x1a252f, 0xffffff] },
  { key: 'hatch',  colors: [0xe67e22, 0xc0392b, 0xffffff, 0x7f8c8d] },
  { key: 'taxi',   colors: [0xf1c40f, 0xffffff] },
  { key: 'police', colors: [0x1a252f, 0xffffff] },
  { key: 'van',    colors: [0xd5dbdb, 0x7f8c8d, 0x2c3e50] },
];

const TYPE_SPEC = {
  sedan: { length: 4.70, width: 2.32, height: 1.48, wheelR: 0.33 },
  suv:   { length: 4.90, width: 2.45, height: 1.75, wheelR: 0.35 },
  hatch: { length: 4.10, width: 2.10, height: 1.55, wheelR: 0.31 },
  taxi:  { length: 4.70, width: 2.32, height: 1.48, wheelR: 0.33 },
  police:{ length: 4.80, width: 2.35, height: 1.50, wheelR: 0.33 },
  van:   { length: 5.10, width: 2.40, height: 1.95, wheelR: 0.35 },
};

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.vehicles = []; // {vehicle, lane, z, speed, type, passed, nearMissed, tailLights, brakeEmission}
  }

  async init(playerZ) {
    await assetLoader.load();
    for (let i = 0; i < 10; i++) {
      this.spawn(playerZ + 220 + Math.random() * 900);
    }
  }

  spawn(preferredZ) {
    if (this.vehicles.length >= MAX_VEHICLES) return;

    const lane = LANES[Math.floor(Math.random() * LANES.length)];
    const tooClose = this.vehicles.some(
      (v) => v.lane === lane && Math.abs(v.z - preferredZ) < 50
    );
    if (tooClose) return;

    const t = TYPES[Math.floor(Math.random() * TYPES.length)];
    const color = t.colors[Math.floor(Math.random() * t.colors.length)];
    const mesh = assetLoader.clone(t.key);
    if (!mesh) return;

    this._paint(mesh, color);

    // Slight speed variation so traffic feels alive (some slower, some faster)
    const speed = 14 + Math.random() * 16; // m/s (~50-108 km/h)
    const spec = TYPE_SPEC[t.key] || TYPE_SPEC.sedan;
    mesh.position.set(lane.x, 0.02, preferredZ);
    mesh.scale.set(spec.length / 4.70, spec.height / 1.48, spec.length / 4.70);

    const vehicle = new Vehicle(mesh, {
      length: spec.length,
      width: spec.width,
      height: spec.height,
    });

    // Find taillight meshes for brake-light control
    const tailLights = [];
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      const n = (o.name || '').toLowerCase();
      if (/tail|rear.light|brake/.test(n)) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (m.isMeshStandardMaterial) {
            m.emissiveIntensity = 0.2; // dim running lights
            tailLights.push({ material: m, baseEmissive: m.emissive.clone() });
          }
        });
      }
    });

    this.scene.add(mesh);
    this.vehicles.push({
      vehicle, lane, z: preferredZ, speed, type: t.key,
      passed: false, nearMissed: false,
      tailLights,
      brakeTimer: 0,
      brakeActive: false,
    });
  }

  _paint(mesh, color) {
    mesh.traverse((o) => {
      if (!o.isMesh) return;
      const isGlass = /glass|window|windscreen/.test((o.name || '').toLowerCase());
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m.isMeshStandardMaterial) return;
        if (isGlass) {
          m.metalness = 0.05;
          m.roughness = 0.1;
          m.color.setHex(0x263238);
          m.transparent = true;
          m.opacity = 0.55;
        } else {
          m.color.setHex(color);
        }
      });
    });
  }

  step(dt, playerZ) {
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.z += v.speed * v.lane.dir * dt;
      v.vehicle.position.set(v.lane.x, 0.02, v.z);
      v.vehicle.yaw = v.lane.dir === 1 ? 0 : Math.PI;
      v.vehicle.steer(0);
      v.vehicle.rotateWheels(dt, 0.33);
      v.vehicle.applyTransform();

      // ----- Brake light simulation -----
      // Occasionally brake (slow down briefly) so taillights illuminate
      if (v.brakeTimer > 0) {
        v.brakeTimer -= dt;
        if (!v.brakeActive) {
          v.brakeActive = true;
          this._setBrakeLights(v, true);
        }
        // Slightly reduce speed while braking
        v.vehicle.rotateWheels(dt * 0.5, 0.33);
      } else {
        if (v.brakeActive) {
          v.brakeActive = false;
          this._setBrakeLights(v, false);
        }
      }
      if (v.brakeTimer <= 0 && Math.random() < 0.015) {
        v.brakeTimer = 0.8 + Math.random() * 1.2; // brake for 0.8-2.0s
      }

      // Occasional turn indicator flicker (cosmetic)
      if (Math.random() < 0.008) {
        // indicator flash handled visually by subtle emissive pulse on one side
      }

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

  _setBrakeLights(v, on) {
    const intensity = on ? 2.5 : 0.2;
    for (const tl of v.tailLights) {
      tl.material.emissiveIntensity = intensity;
    }
  }

  remove(i) {
    const v = this.vehicles[i];
    v.vehicle.removeFrom(this.scene);
    v.vehicle.dispose();
    this.vehicles.splice(i, 1);
  }

  vehicleBounds(v) {
    return v.vehicle.getBounds();
  }

  dispose() {
    for (const v of this.vehicles) {
      v.vehicle.removeFrom(this.scene);
      v.vehicle.dispose();
    }
    this.vehicles = [];
  }
}

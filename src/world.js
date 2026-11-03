/**
 * Endless 3D city highway.
 *
 * The world is built from recycled road segments. As the player drives forward,
 * segments that fall behind are moved ahead of the player and re-procedurally
 * populated, creating a never-ending road illusion.
 *
 * Layout (left-hand traffic, like Pakistan):
 *   * Player drives +Z on the left side (lanes at x = -7.5, -2.5)
 *   * Median divider at x = 0
 *   * Oncoming lanes on the right (x = 2.5, 7.5)
 */
import * as THREE from 'three';

const SEG_LEN = 260;
const ROAD_WIDTH = 26;
const LANE_W = 5;
const ACTIVE_SEGMENTS = 10;
const SPAWN_AHEAD = 850;
const RECYCLE_BEHIND = 700;

// Simple xorshift32 PRNG so segment contents are deterministic per index
function xorshift(seed) {
  return function () {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0xffffffff;
  };
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.segIndex = 0;
    this.segCounter = 0;

    // Environment meshes (static per segment, moved on recycle)
    this.buildLights();

    // Seed the road ahead of the player
    for (let i = 0; i < ACTIVE_SEGMENTS; i++) {
      this.addSegment(-SEG_LEN * i);
    }
  }

  buildLights() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffffff, 0.9);
    this.sun.position.set(60, 80, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 1024;
    this.sun.shadow.mapSize.height = 1024;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 250;
    this.sun.shadow.camera.left = -110;
    this.sun.shadow.camera.right = 110;
    this.sun.shadow.camera.top = 110;
    this.sun.shadow.camera.bottom = -110;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);

    this.fog = new THREE.Fog(0x080a12, 180, 900);
    this.scene.fog = this.fog;
  }

  /** Add one segment at baseZ (its centre Z). */
  addSegment(baseZ) {
    const index = this.segCounter++;
    const seg = new THREE.Group();
    seg.position.z = baseZ;
    this.buildSegmentContent(seg, index, baseZ);
    this.scene.add(seg);
    this.segments.push({ group: seg, baseZ, index });
    return seg;
  }

  buildSegmentContent(seg, index, baseZ) {
    const rand = xorshift(index * 2654435761 + 987654321);

    // ---- Road surface ----
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH + 4, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.9, metalness: 0.1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.receiveShadow = true;
    seg.add(road);

    // ---- Shoulders ----
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(60, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x1f2129, roughness: 1, metalness: 0 })
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = 0.02;
    seg.add(shoulder);

    // ---- Median divider ----
    const median = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.35, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.8, metalness: 0.2 })
    );
    median.position.set(0, 0.18, 0);
    median.receiveShadow = true;
    median.castShadow = true;
    seg.add(median);

    const medianLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.08, SEG_LEN),
      new THREE.MeshBasicMaterial({ color: 0x555a66 })
    );
    medianLine.rotation.x = -Math.PI / 2;
    medianLine.position.set(0, 0.36, 0);
    seg.add(medianLine);

    // ---- Lane markings (dashed lines between lanes and at edges) ----
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dashLine = (x, zOffset, dashLen = 6, gapLen = 7, width = 0.12) => {
      const zStart = baseZ - SEG_LEN / 2 + 4;
      const zEnd = baseZ + SEG_LEN / 2 - 4;
      let z = zStart;
      while (z < zEnd) {
        const len = Math.min(dashLen, zEnd - z);
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(width, len), dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.31, z);
        seg.add(dash);
        z += dashLen + gapLen;
      }
    };
    // boundary between player lanes, boundary at outer edges, between oncoming lanes
    dashLine(-5, 0);
    dashLine(5, 0);

    // ---- Barriers at road edges ----
    const barMat = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.6, metalness: 0.6 });
    for (const sx of [-13, 13]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, SEG_LEN), barMat);
      barrier.position.set(sx, 0.55, 0);
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      seg.add(barrier);
    }

    // ---- Streetlights along both sides ----
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x22252e, roughness: 0.7, metalness: 0.8 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff5e6, emissive: 0xffd780, emissiveIntensity: 0.4 });
    for (let z = baseZ - SEG_LEN / 2 + 20; z < baseZ + SEG_LEN / 2; z += 32) {
      for (const sx of [-15.5, 15.5]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 7.5, 8), poleMat);
        pole.position.set(sx, 3.75, z);
        pole.castShadow = true;
        seg.add(pole);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.08), poleMat);
        arm.position.set(sx + 1.1, 7.2, z);
        arm.castShadow = true;
        seg.add(arm);

        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.25, 0.35), lampMat);
        lamp.position.set(sx + 2.1, 7.2, z);
        lamp.castShadow = false;
        seg.add(lamp);
      }
    }

    // ---- Buildings off-road ----
    const buildMat = new THREE.MeshStandardMaterial({ color: 0x242630, roughness: 0.7, metalness: 0.3 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0x4a5a80 });
    const buildingCount = 1 + Math.floor(rand() * 3);
    for (let b = 0; b < buildingCount; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (24 + rand() * 40);
      const bw = 10 + rand() * 16;
      const bh = 16 + rand() * 55;
      const bd = 10 + rand() * 22;
      const bz = baseZ + (rand() - 0.5) * SEG_LEN * 0.85;

      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildMat);
      building.position.set(bx, bh / 2, bz);
      building.castShadow = true;
      building.receiveShadow = true;
      seg.add(building);

      // a few lit windows
      const winCount = Math.floor((bw * bd) / 110);
      for (let w = 0; w < Math.min(winCount, 6); w++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.05), winMat);
        win.position.set(
          bx + (rand() - 0.5) * bw,
          6 + rand() * (bh - 12),
          bz + side * bd / 2 + 0.03
        );
        seg.add(win);
      }
    }

    // ---- Trees off-road ----
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 0.9, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.9, metalness: 0 });
    const treeCount = 3 + Math.floor(rand() * 5);
    for (let t = 0; t < treeCount; t++) {
      const side = rand() < 0.5 ? -1 : 1;
      const tx = side * (16 + rand() * 30);
      const tz = baseZ + (rand() - 0.5) * SEG_LEN * 0.9;

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.6, 8), trunkMat);
      trunk.position.set(tx, 1.3, tz);
      trunk.castShadow = true;
      seg.add(trunk);

      const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.2, 8), leafMat);
      foliage.position.set(tx, 3.4, tz);
      foliage.castShadow = true;
      seg.add(foliage);
    }

    // ---- Road signs ----
    if (rand() < 0.4) {
      const side = rand() < 0.5 ? -1 : 1;
      const sx = side * (14 + rand() * 6);
      const sz = baseZ + (rand() - 0.5) * SEG_LEN * 0.6;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 6), new THREE.MeshStandardMaterial({ color: 0x33363f }));
      pole.position.set(sx, 1.8, sz);
      pole.castShadow = true;
      seg.add(pole);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x2d4a73, emissive: 0x1a2b4a, emissiveIntensity: 0.5 }));
      sign.position.set(sx, 3.6, sz + 0.02);
      sign.castShadow = true;
      seg.add(sign);
    }
  }

  /** Move behind-segments ahead of the player as required. */
  update(playerZ) {
    // Keep the sun's shadow frustum near the car so shadows stay sharp
    this.sun.position.set(playerZ + 60, 80, 40);
    this.sun.shadow.camera.position.copy(this.sun.position);
    this.sun.shadow.camera.lookAt(playerZ, 0, 0);

    for (const seg of this.segments) {
      if (seg.baseZ + SEG_LEN / 2 < playerZ - RECYCLE_BEHIND) {
        seg.baseZ = playerZ + SPAWN_AHEAD + (seg.index % 3) * 340;
        seg.group.position.z = seg.baseZ;
        // Re-proceduralize content so the world doesn't repeat exactly
        while (seg.group.children.length > 0) seg.group.remove(seg.group.children[0]);
        this.buildSegmentContent(seg.group, this.segCounter++, seg.baseZ);
      }
    }
  }

  dispose() {
    for (const seg of this.segments) this.scene.remove(seg.group);
    this.scene.remove(this.ambient, this.sun);
    this.scene.fog = null;
  }
}

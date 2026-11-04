/**
 * Realistic endless driving environment.
 *
 * Built from recycled road segments. As the player drives forward, segments
 * behind are moved ahead and re-procedurally populated, creating a seamless
 * never-ending road.
 *
 * Layout (right-hand traffic): player drives +Z on the right side
 * (lanes at x = 2.5, 7.5); median at x = 0; oncoming lanes on the left
 * (x = -2.5, -7.5).
 *
 * Environment zones transition gradually with distance:
 *  0   - Modern urban highway
 *  1   - Suburban highway
 *  2   - Open countryside road
 *  3   - City outskirts
 *  4   - Elevated highway section
 */
import * as THREE from 'three';

const SEG_LEN = 220;
const ROAD_WIDTH = 28;
const LANE_W = 5;
const ACTIVE_SEGMENTS = 10;
const SPAWN_AHEAD = 900;
const RECYCLE_BEHIND = 650;

function xorshift(seed) {
  return function () {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0xffffffff;
  };
}

// Zone definition -> (minDistance, name, config)
const ZONES = [
  { name: 'urban', minDist: 0 },
  { name: 'suburban', minDist: 1500 },
  { name: 'countryside', minDist: 3500 },
  { name: 'outskirts', minDist: 5500 },
  { name: 'elevated', minDist: 8000 },
];

function zoneFor(dist) {
  let zone = ZONES[0];
  for (const z of ZONES) if (dist >= z.minDist) zone = z;
  return zone;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.segCounter = 0;

    this.buildLighting();
    this.buildSky();

    for (let i = 0; i < ACTIVE_SEGMENTS; i++) {
      this.addSegment(-SEG_LEN * i);
    }
  }

  buildLighting() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffeedd, 1.05);
    this.sun.position.set(60, 70, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 1024;
    this.sun.shadow.mapSize.height = 1024;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 260;
    this.sun.shadow.camera.left = -110;
    this.sun.shadow.camera.right = 110;
    this.sun.shadow.camera.top = 110;
    this.sun.shadow.camera.bottom = -110;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);

    this.fog = new THREE.Fog(0x12151a, 220, 950);
    this.scene.fog = this.fog;

    // Sky hemisphere for horizon tint
    this.hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a5a6a, 0.35);
    this.scene.add(this.hemi);
  }

  buildSky() {
    // Simple distant skyline ring (subtle, no neon)
    const skyline = new THREE.Group();
    const buildMat = new THREE.MeshStandardMaterial({
      color: 0x2a3037, metalness: 0.2, roughness: 0.7
    });
    const ringR = 1400;
    const segs = 24;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const h = 60 + Math.random() * 140;
      const b = new THREE.Mesh(new THREE.BoxGeometry(70, h, 30), buildMat);
      b.position.set(Math.cos(a) * ringR, h / 2, Math.sin(a) * ringR);
      b.lookAt(0, h / 2, 0);
      skyline.add(b);
    }
    skyline.position.y = -5;
    this.scene.add(skyline);
  }

  /** Zone-aware segment content builder. */
  buildSegmentContent(seg, index, baseZ, dist) {
    const rand = xorshift(index * 2654435761 + 987654321);
    const zone = zoneFor(dist).name;

    // ---- Road surface ----
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH + 6, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.95, metalness: 0.15 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.02;
    road.receiveShadow = true;
    seg.add(road);

    // ---- Shoulders (concrete) ----
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(70, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 1, metalness: 0.05 })
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = 0.03;
    seg.add(shoulder);

    // ---- Median divider ----
    const median = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.35, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x1e2328, roughness: 0.8, metalness: 0.15 })
    );
    median.position.set(0, 0.18, 0);
    median.castShadow = true;
    median.receiveShadow = true;
    seg.add(median);

    const medianLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, SEG_LEN),
      new THREE.MeshBasicMaterial({ color: 0x4a525a })
    );
    medianLine.rotation.x = -Math.PI / 2;
    medianLine.position.set(0, 0.36, 0);
    seg.add(medianLine);

    // ---- Lane markings (dashed white between lanes, solid at edges) ----
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dashLine = (x, dashLen = 7, gapLen = 8, width = 0.12) => {
      const zStart = baseZ - SEG_LEN / 2 + 5;
      const zEnd = baseZ + SEG_LEN / 2 - 5;
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
    // between player lanes, outer edges, between oncoming lanes
    dashLine(5);
    dashLine(-5);
    dashLine(ROAD_WIDTH / 2 - 1.5, 40, 6, 0.12); // outer edge solid-ish (long dashes)
    dashLine(-(ROAD_WIDTH / 2 - 1.5), 40, 6, 0.12);

    // ---- Concrete barriers at road edges ----
    const barMat = new THREE.MeshStandardMaterial({ color: 0x24292e, roughness: 0.6, metalness: 0.2 });
    for (const sx of [-14.5, 14.5]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, SEG_LEN), barMat);
      barrier.position.set(sx, 0.5, 0);
      barrier.castShadow = true;
      barrier.receiveShadow = true;
      seg.add(barrier);
    }

    // ---- Guardrail posts along barriers (subtle detail) ----
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a525a, roughness: 0.7, metalness: 0.4 });
    for (const sx of [-14.9, 14.9]) {
      for (let z = baseZ - SEG_LEN / 2 + 6; z < baseZ + SEG_LEN / 2; z += 10) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), postMat);
        post.position.set(sx, 0.7, z);
        post.castShadow = true;
        seg.add(post);
      }
    }

    // ---- Streetlights ----
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333a41, roughness: 0.7, metalness: 0.8 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffe8d9, emissive: 0x2a1e10, emissiveIntensity: 0.15 });
    for (let z = baseZ - SEG_LEN / 2 + 24; z < baseZ + SEG_LEN / 2; z += 40) {
      for (const sx of [-16.5, 16.5]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8, 8), poleMat);
        pole.position.set(sx, 4, z);
        pole.castShadow = true;
        seg.add(pole);

        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.06), poleMat);
        arm.position.set(sx + 1.2, 7.7, z);
        arm.castShadow = true;
        seg.add(arm);

        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.3), lampMat);
        lamp.position.set(sx + 2.4, 7.7, z);
        seg.add(lamp);
      }
    }

    // ---- Road signs ----
    if (rand() < 0.35) {
      const side = rand() < 0.5 ? -1 : 1;
      const sx = side * (15 + rand() * 5);
      const sz = baseZ + (rand() - 0.5) * SEG_LEN * 0.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.8, 6), new THREE.MeshStandardMaterial({ color: 0x3a424a }));
      pole.position.set(sx, 1.9, sz);
      pole.castShadow = true;
      seg.add(pole);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ color: 0x2d3a45, emissive: 0x12181e, emissiveIntensity: 0.3 }));
      sign.position.set(sx, 3.9, sz + 0.02);
      sign.castShadow = true;
      seg.add(sign);
    }

    // ---- Roadside objects by zone ----
    if (zone === 'urban' || zone === 'outskirts') {
      this.addCityObjects(seg, rand, baseZ, SEG_LEN);
    } else if (zone === 'suburban') {
      this.addSuburbanObjects(seg, rand, baseZ, SEG_LEN);
    } else if (zone === 'countryside') {
      this.addCountrysideObjects(seg, rand, baseZ, SEG_LEN);
    } else if (zone === 'elevated') {
      this.addElevatedObjects(seg, rand, baseZ, SEG_LEN);
    }
  }

  addCityObjects(seg, rand, baseZ, len) {
    const buildMat = new THREE.MeshStandardMaterial({ color: 0x383d44, roughness: 0.7, metalness: 0.25 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0x5a7080 });
    const count = 1 + Math.floor(rand() * 2);
    for (let b = 0; b < count; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (26 + rand() * 35);
      const bw = 12 + rand() * 18;
      const bh = 20 + rand() * 60;
      const bd = 12 + rand() * 22;
      const bz = baseZ + (rand() - 0.5) * len * 0.8;
      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildMat);
      building.position.set(bx, bh / 2, bz);
      building.castShadow = true;
      building.receiveShadow = true;
      seg.add(building);
      const winCount = Math.min(Math.floor((bw * bd) / 120), 5);
      for (let w = 0; w < winCount; w++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.05), winMat);
        win.position.set(
          bx + (rand() - 0.5) * bw,
          7 + rand() * (bh - 14),
          bz + side * bd / 2 + 0.03
        );
        seg.add(win);
      }
    }
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 0.9, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x22442d, roughness: 0.9, metalness: 0 });
    const treeCount = 2 + Math.floor(rand() * 4);
    for (let t = 0; t < treeCount; t++) {
      const side = rand() < 0.5 ? -1 : 1;
      const tx = side * (17 + rand() * 25);
      const tz = baseZ + (rand() - 0.5) * len * 0.85;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 2.8, 8), trunkMat);
      trunk.position.set(tx, 1.4, tz);
      trunk.castShadow = true;
      seg.add(trunk);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.4, 8), leafMat);
      foliage.position.set(tx, 3.6, tz);
      foliage.castShadow = true;
      seg.add(foliage);
    }
  }

  addSuburbanObjects(seg, rand, baseZ, len) {
    const buildMat = new THREE.MeshStandardMaterial({ color: 0x5c6b73, roughness: 0.8, metalness: 0.1 });
    const count = 1 + Math.floor(rand() * 2);
    for (let b = 0; b < count; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (28 + rand() * 30);
      const bw = 10 + rand() * 14;
      const bh = 14 + rand() * 30;
      const bd = 10 + rand() * 18;
      const bz = baseZ + (rand() - 0.5) * len * 0.8;
      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildMat);
      building.position.set(bx, bh / 2, bz);
      building.castShadow = true;
      building.receiveShadow = true;
      seg.add(building);
    }
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 0.9, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e6b4a, roughness: 0.9, metalness: 0 });
    const treeCount = 3 + Math.floor(rand() * 5);
    for (let t = 0; t < treeCount; t++) {
      const side = rand() < 0.5 ? -1 : 1;
      const tx = side * (18 + rand() * 28);
      const tz = baseZ + (rand() - 0.5) * len * 0.9;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 3, 8), trunkMat);
      trunk.position.set(tx, 1.5, tz);
      trunk.castShadow = true;
      seg.add(trunk);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4, 8), leafMat);
      foliage.position.set(tx, 4, tz);
      foliage.castShadow = true;
      seg.add(foliage);
    }
    // utility poles
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 0.9, metalness: 0 });
    for (let z = baseZ - len / 2 + 20; z < baseZ + len / 2; z += 45) {
      const side = rand() < 0.5 ? -1 : 1;
      const sx = side * 20;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 6), poleMat);
      pole.position.set(sx, 3, z);
      pole.castShadow = true;
      seg.add(pole);
    }
  }

  addCountrysideObjects(seg, rand, baseZ, len) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 0.9, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 0.9, metalness: 0 });
    const treeCount = 4 + Math.floor(rand() * 6);
    for (let t = 0; t < treeCount; t++) {
      const side = rand() < 0.5 ? -1 : 1;
      const tx = side * (17 + rand() * 40);
      const tz = baseZ + (rand() - 0.5) * len * 0.95;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 3.2, 8), trunkMat);
      trunk.position.set(tx, 1.6, tz);
      trunk.castShadow = true;
      seg.add(trunk);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 8), leafMat);
      foliage.position.set(tx, 4.8, tz);
      foliage.castShadow = true;
      seg.add(foliage);
    }
    // occasional fence posts
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a443a, roughness: 0.9, metalness: 0 });
    for (let z = baseZ - len / 2 + 10; z < baseZ + len / 2; z += 6) {
      const side = rand() < 0.5 ? -1 : 1;
      const sx = side * 16;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 5), postMat);
      post.position.set(sx, 0.85, z);
      post.castShadow = true;
      seg.add(post);
    }
  }

  addOutskirtsObjects(seg, rand, baseZ, len) {
    this.addCityObjects(seg, rand, baseZ, len);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 0.9, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d4a2d, roughness: 0.9, metalness: 0 });
    for (let t = 0; t < 2; t++) {
      const side = rand() < 0.5 ? -1 : 1;
      const tx = side * (16 + rand() * 20);
      const tz = baseZ + (rand() - 0.5) * len * 0.8;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 8), trunkMat);
      trunk.position.set(tx, 1.5, tz);
      trunk.castShadow = true;
      seg.add(trunk);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.8, 8), leafMat);
      foliage.position.set(tx, 4, tz);
      foliage.castShadow = true;
      seg.add(foliage);
    }
  }

  addElevatedObjects(seg, rand, baseZ, len) {
    // Elevated: concrete pillars beneath road, sparse city in distance
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7, metalness: 0.15 });
    for (let z = baseZ - len / 2 + 15; z < baseZ + len / 2; z += 28) {
      for (const sx of [-14.5, 14.5]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6, 1.2), pillarMat);
        pillar.position.set(sx, -2.7, z);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        seg.add(pillar);
      }
    }
    // distant buildings below/around
    const buildMat = new THREE.MeshStandardMaterial({ color: 0x2d333a, roughness: 0.7, metalness: 0.2 });
    const winMat = new THREE.MeshBasicMaterial({ color: 0x556a7a });
    for (let b = 0; b < 2; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (40 + rand() * 50);
      const bw = 14 + rand() * 20;
      const bh = 25 + rand() * 45;
      const bd = 14 + rand() * 20;
      const bz = baseZ + (rand() - 0.5) * len * 0.7;
      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), buildMat);
      building.position.set(bx, bh / 2 - 40, bz);
      building.castShadow = true;
      seg.add(building);
      const winCount = Math.min(Math.floor((bw * bd) / 140), 4);
      for (let w = 0; w < winCount; w++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.05), winMat);
        win.position.set(
          bx + (rand() - 0.5) * bw,
          -35 + rand() * bh,
          bz + side * bd / 2 + 0.03
        );
        seg.add(win);
      }
    }
  }

  addSegment(baseZ) {
    const index = this.segCounter++;
    const seg = new THREE.Group();
    seg.position.z = baseZ;
    this.buildSegmentContent(seg, index, baseZ, 0); // dist updated per-frame via update()
    this.scene.add(seg);
    this.segments.push({ group: seg, baseZ, index });
    return seg;
  }

  /** Move behind-segments ahead and refresh zone-appropriate content. */
  update(playerZ) {
    // Move sun shadow frustum with the car
    this.sun.position.set(playerZ + 60, 70, 30);
    this.sun.shadow.camera.position.copy(this.sun.position);
    this.sun.shadow.camera.lookAt(playerZ, 0, 0);

    // Fog follows the car slightly for consistent atmospheric perspective
    this.fog.near = playerZ + 100;
    this.fog.far = playerZ + 950;

    for (const seg of this.segments) {
      if (seg.baseZ + SEG_LEN / 2 < playerZ - RECYCLE_BEHIND) {
        seg.baseZ = playerZ + SPAWN_AHEAD + (seg.index % 4) * 280;
        seg.group.position.z = seg.baseZ;
        while (seg.group.children.length > 0) seg.group.remove(seg.group.children[0]);
        const dist = playerZ + SPAWN_AHEAD + (seg.index % 4) * 280;
        this.buildSegmentContent(seg.group, this.segCounter++, seg.baseZ, dist);
      }
    }
  }

  dispose() {
    for (const seg of this.segments) this.scene.remove(seg.group);
    this.scene.remove(this.ambient, this.sun, this.hemi);
    this.scene.fog = null;
  }
}

/**
 * Realistic endless driving environment.
 *
 * Right-hand traffic. Player drives +Z on the right side of a median:
 *   lanes at x = +2.5 and x = +7.5 (player direction)
 *   median at x = 0
 *   oncoming lanes at x = -2.5 and x = -7.5
 *
 * The road is built from recycled segments. As the player drives forward,
 * segments behind are moved ahead and re-populated procedurally.
 *
 * Surface: procedurally generated asphalt texture (no external image files).
 */
import * as THREE from 'three';

const SEG_LEN = 240;
const ROAD_WIDTH = 30;   // drivable + shoulders width
const LANE_W = 3.6;      // realistic lane width
const ACTIVE_SEGMENTS = 10;
const SPAWN_AHEAD = 950;
const RECYCLE_BEHIND = 700;

const ZONES = [
  { name: 'urban', minDist: 0 },
  { name: 'suburban', minDist: 1500 },
  { name: 'countryside', minDist: 3500 },
  { name: 'outskirts', minDist: 5500 },
  { name: 'elevated', minDist: 8000 },
];
function zoneFor(dist) {
  let z = ZONES[0];
  for (const c of ZONES) if (dist >= c.minDist) z = c;
  return z;
}

function xorshift(seed) {
  return function () {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 0xffffffff;
  };
}

/** Generate a procedural asphalt texture (dark grey with subtle speckle). */
function makeAsphaltTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Base asphalt
  ctx.fillStyle = '#2b2f34'; ctx.fillRect(0, 0, size, size);
  // Speckle noise
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const w = 1 + Math.random() * 2;
    const h = 1 + Math.random() * 2;
    const bright = 10 + Math.random() * 40;
    ctx.fillStyle = `rgba(${bright},${bright},${bright},${0.15 + Math.random() * 0.25})`;
    ctx.fillRect(x, y, w, h);
  }
  // Slight gradient for depth
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, 'rgba(20,22,26,0.25)');
  grad.addColorStop(1, 'rgba(20,22,26,0.05)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.segCounter = 0;
    this.asphalt = makeAsphaltTexture();

    this.buildLighting();
    this.buildSky();

    for (let i = 0; i < ACTIVE_SEGMENTS; i++) {
      this.addSegment(-SEG_LEN * i, 0);
    }
  }

  buildLighting() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambient);

    // Natural sunlight
    this.sun = new THREE.DirectionalLight(0xffeedd, 1.1);
    this.sun.position.set(60, 75, 25);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 1024;
    this.sun.shadow.mapSize.height = 1024;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.camera.left = -120;
    this.sun.shadow.camera.right = 120;
    this.sun.shadow.camera.top = 120;
    this.sun.shadow.camera.bottom = -120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);

    this.hemi = new THREE.HemisphereLight(0x87aec0, 0x5a6a72, 0.3);
    this.scene.add(this.hemi);

    this.fog = new THREE.FogExp2(0x0f141a, 0.0011);
    this.scene.fog = this.fog;
  }

  buildSky() {
    // Distant skyline (subtle silhouettes, no neon)
    const skyline = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1c2329, metalness: 0.2, roughness: 0.8
    });
    const ringR = 1500;
    const segs = 28;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const h = 70 + Math.random() * 170;
      const b = new THREE.Mesh(new THREE.BoxGeometry(80, h, 40), mat);
      b.position.set(Math.cos(a) * ringR, h / 2, Math.sin(a) * ringR);
      b.lookAt(0, h / 2, 0);
      b.castShadow = false; b.receiveShadow = true;
      skyline.add(b);
    }
    skyline.position.y = -4;
    this.scene.add(skyline);
  }

  /* ---------- segment content ---------- */

  buildSegmentContent(seg, index, baseZ, dist) {
    const rand = xorshift(index * 2654435761 + 987654321);
    const zone = zoneFor(dist).name;

    // ---- Road surface (textured asphalt) ----
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH + 8, SEG_LEN),
      new THREE.MeshStandardMaterial({
        map: this.asphalt, roughness: 0.92, metalness: 0.1
      })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.02;
    road.receiveShadow = true;
    road.userData.type = 'road';
    seg.add(road);

    // ---- Shoulders (concrete) ----
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(80, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x42484e, roughness: 1.0, metalness: 0.05 })
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = 0.03;
    shoulder.receiveShadow = true;
    seg.add(shoulder);

    // ---- Median divider (concrete) ----
    const median = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.4, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.85, metalness: 0.15 })
    );
    median.position.set(0, 0.2, 0);
    median.castShadow = true; median.receiveShadow = true;
    seg.add(median);

    const medianTop = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x555d65, roughness: 0.9, metalness: 0.1 })
    );
    medianTop.position.set(0, 0.41, 0);
    seg.add(medianTop);

    // ---- Lane markings ----
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8eaed });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dash = (x, len = 7, gap = 8, w = 0.12, mat = lineMat) => {
      const zStart = baseZ - SEG_LEN / 2 + 6;
      const zEnd = baseZ + SEG_LEN / 2 - 6;
      let z = zStart;
      while (z < zEnd) {
        const l = Math.min(len, zEnd - z);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.31, z);
        seg.add(m);
        z += len + gap;
      }
    };
    // between the two player lanes (+2.5 and +7.5) and between oncoming lanes
    dash(5.0);                 // x = +5.0
    dash(-5.0);                // x = -5.0
    // outer edges (solid white, just inside barriers)
    dash(13.8, 40, 4, 0.14, edgeMat);   // x = +13.8
    dash(-13.8, 40, 4, 0.14, edgeMat);  // x = -13.8

    // ---- Concrete barriers at road edges ----
    const barMat = new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.7, metalness: 0.2 });
    for (const sx of [-15.2, 15.2]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.05, SEG_LEN), barMat);
      barrier.position.set(sx, 0.52, 0);
      barrier.castShadow = true; barrier.receiveShadow = true;
      seg.add(barrier);
    }

    // ---- Guardrail posts ----
    const postMat = new THREE.MeshStandardMaterial({ color: 0x556068, roughness: 0.8, metalness: 0.4 });
    for (const sx of [-15.6, 15.6]) {
      for (let z = baseZ - SEG_LEN / 2 + 8; z < baseZ + SEG_LEN / 2; z += 11) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 6), postMat);
        post.position.set(sx, 0.72, z);
        post.castShadow = true;
        seg.add(post);
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 11), postMat);
        rail.position.set(sx, 0.95, z);
        rail.castShadow = true;
        seg.add(rail);
      }
    }

    // ---- Streetlights ----
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b424a, roughness: 0.75, metalness: 0.85 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffeadd, emissive: 0x2a1e10, emissiveIntensity: 0.12 });
    for (let z = baseZ - SEG_LEN / 2 + 28; z < baseZ + SEG_LEN / 2; z += 42) {
      for (const sx of [-17.2, 17.2]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 8.2, 8), poleMat);
        pole.position.set(sx, 4.1, z);
        pole.castShadow = true;
        seg.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.07), poleMat);
        arm.position.set(sx + 1.3, 8.0, z);
        arm.castShadow = true;
        seg.add(arm);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.32), lampMat);
        lamp.position.set(sx + 2.55, 8.0, z);
        seg.add(lamp);
      }
    }

    // ---- Road signs ----
    if (rand() < 0.4) {
      const side = rand() < 0.5 ? -1 : 1;
      const sx = side * (15.8 + rand() * 5);
      const sz = baseZ + (rand() - 0.5) * SEG_LEN * 0.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.0, 6), new THREE.MeshStandardMaterial({ color: 0x424a52 }));
      pole.position.set(sx, 2.0, sz);
      pole.castShadow = true;
      seg.add(pole);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x2f3c46, emissive: 0x141c22, emissiveIntensity: 0.25 }));
      sign.position.set(sx, 4.1, sz + 0.02);
      sign.castShadow = true;
      seg.add(sign);
    }

    // ---- Terrain beside road (gentle roll) ----
    this._addTerrain(seg, rand, baseZ, SEG_LEN, zone);

    // ---- Roadside objects by zone ----
    if (zone === 'urban' || zone === 'outskirts') this._addCity(seg, rand, baseZ, SEG_LEN);
    else if (zone === 'suburban') this._addSuburban(seg, rand, baseZ, SEG_LEN);
    else if (zone === 'countryside') this._addCountryside(seg, rand, baseZ, SEG_LEN);
    else if (zone === 'elevated') this._addElevated(seg, rand, baseZ, SEG_LEN);
  }

  _addTerrain(seg, rand, baseZ, len, zone) {
    const mat = new THREE.MeshStandardMaterial({
      color: zone === 'countryside' ? 0x4a6b4a : 0x3d463d,
      roughness: 1.0, metalness: 0
    });
    // A strip of ground beside each shoulder
    for (const sx of [-1, 1]) {
      const gx = sx * (16 + 40);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, len), mat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(sx * (ROAD_WIDTH / 2 + 32), 0.04, 0);
      ground.position.z = baseZ;
      ground.receiveShadow = true;
      // slight noise via vertex displacement not possible on PlaneGeometry easily; keep flat
      seg.add(ground);
    }
  }

  _addCity(seg, rand, baseZ, len) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x424a52, roughness: 0.75, metalness: 0.2 });
    const win = new THREE.MeshStandardMaterial({ color: 0x5a7080, roughness: 0.1, metalness: 0.05 });
    const count = 1 + Math.floor(rand() * 2);
    for (let b = 0; b < count; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (28 + rand() * 45);
      const bw = 14 + rand() * 22;
      const bh = 22 + rand() * 70;
      const bd = 14 + rand() * 24;
      const bz = baseZ + (rand() - 0.5) * len * 0.75;
      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      building.position.set(bx, bh / 2, bz);
      building.castShadow = true; building.receiveShadow = true;
      seg.add(building);
      // windows
      const wc = Math.min(Math.floor((bw * bd) / 140), 6);
      for (let w = 0; w < wc; w++) {
        const wm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.1, 0.04), win);
        wm.position.set(
          bx + (rand() - 0.5) * bw,
          8 + rand() * Math.max(2, bh - 16),
          bz + side * bd / 2 + 0.03
        );
        seg.add(wm);
      }
    }
    this._addTrees(seg, rand, baseZ, len, 2 + Math.floor(rand() * 4), 0x22442d);
  }

  _addSuburban(seg, rand, baseZ, len) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x6b7a82, roughness: 0.85, metalness: 0.08 });
    const count = 1 + Math.floor(rand() * 2);
    for (let b = 0; b < count; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (30 + rand() * 35);
      const bw = 11 + rand() * 16;
      const bh = 12 + rand() * 32;
      const bd = 11 + rand() * 20;
      const bz = baseZ + (rand() - 0.5) * len * 0.8;
      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      building.position.set(bx, bh / 2, bz);
      building.castShadow = true; building.receiveShadow = true;
      seg.add(building);
    }
    this._addTrees(seg, rand, baseZ, len, 3 + Math.floor(rand() * 5), 0x3a7a3a);
    // utility poles
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a544a, roughness: 0.9, metalness: 0 });
    for (let z = baseZ - len / 2 + 24; z < baseZ + len / 2; z += 48) {
      const side = rand() < 0.5 ? -1 : 1;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.5, 6), poleMat);
      pole.position.set(side * 22, 3.25, z);
      pole.castShadow = true;
      seg.add(pole);
    }
  }

  _addCountryside(seg, rand, baseZ, len) {
    this._addTrees(seg, rand, baseZ, len, 4 + Math.floor(rand() * 6), 0x4a8a4a);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5a503a, roughness: 0.9, metalness: 0 });
    for (let z = baseZ - len / 2 + 12; z < baseZ + len / 2; z += 7) {
      const side = rand() < 0.5 ? -1 : 1;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 5), postMat);
      post.position.set(side * 17, 0.85, z);
      post.castShadow = true;
      seg.add(post);
    }
  }

  _addOutskirts(seg, rand, baseZ, len) {
    this._addCity(seg, rand, baseZ, len);
    this._addTrees(seg, rand, baseZ, len, 2, 0x355a35);
  }

  _addElevated(seg, rand, baseZ, len) {
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x4a5056, roughness: 0.75, metalness: 0.15 });
    for (let z = baseZ - len / 2 + 18; z < baseZ + len / 2; z += 30) {
      for (const sx of [-15.2, 15.2]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 6, 1.3), pillarMat);
        pillar.position.set(sx, -2.8, z);
        pillar.castShadow = true; pillar.receiveShadow = true;
        seg.add(pillar);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x343c44, roughness: 0.75, metalness: 0.2 });
    const win = new THREE.MeshStandardMaterial({ color: 0x556a7a, roughness: 0.1, metalness: 0.05 });
    for (let b = 0; b < 2; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (45 + rand() * 55);
      const bw = 15 + rand() * 22;
      const bh = 28 + rand() * 50;
      const bd = 15 + rand() * 22;
      const bz = baseZ + (rand() - 0.5) * len * 0.7;
      const building = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
      building.position.set(bx, bh / 2 - 45, bz);
      building.castShadow = true; building.receiveShadow = true;
      seg.add(building);
      const wc = Math.min(Math.floor((bw * bd) / 160), 4);
      for (let w = 0; w < wc; w++) {
        const wm = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.2, 0.04), win);
        wm.position.set(bx + (rand() - 0.5) * bw, -40 + rand() * bh, bz + side * bd / 2 + 0.03);
        seg.add(wm);
      }
    }
  }

  _addTrees(seg, rand, baseZ, len, count, leafColor) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d3226, roughness: 0.9, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.9, metalness: 0 });
    for (let t = 0; t < count; t++) {
      const side = rand() < 0.5 ? -1 : 1;
      const tx = side * (18 + rand() * 40);
      const tz = baseZ + (rand() - 0.5) * len * 0.9;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 3.1, 8), trunkMat);
      trunk.position.set(tx, 1.55, tz);
      trunk.castShadow = true;
      seg.add(trunk);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.6, 8), leafMat);
      foliage.position.set(tx, 4.6, tz);
      foliage.castShadow = true;
      seg.add(foliage);
    }
  }

  /* ---------- recycling ---------- */

  addSegment(baseZ, dist) {
    const index = this.segCounter++;
    const seg = new THREE.Group();
    seg.position.z = baseZ;
    this.buildSegmentContent(seg, index, baseZ, dist);
    this.scene.add(seg);
    this.segments.push({ group: seg, baseZ, index });
    return seg;
  }

  update(playerZ) {
    // Track sun with the car so shadows stay sharp & local
    this.sun.position.set(playerZ + 60, 75, 25);
    this.sun.shadow.camera.position.copy(this.sun.position);
    this.sun.shadow.camera.lookAt(playerZ, 0, 0);

    // Fog stays ahead of the car for atmospheric perspective
    this.fog.near = playerZ + 120;
    // density slightly higher in distance
    this.fog.density = 0.0011;

    for (const seg of this.segments) {
      if (seg.baseZ + SEG_LEN / 2 < playerZ - RECYCLE_BEHIND) {
        seg.baseZ = playerZ + SPAWN_AHEAD + (seg.index % 4) * 300;
        seg.group.position.z = seg.baseZ;
        while (seg.group.children.length > 0) seg.group.remove(seg.group.children[0]);
        const dist = playerZ + SPAWN_AHEAD + (seg.index % 4) * 300;
        this.buildSegmentContent(seg.group, this.segCounter++, seg.baseZ, dist);
      }
    }
  }

  dispose() {
    for (const seg of this.segments) this.scene.remove(seg.group);
    this.scene.remove(this.ambient, this.sun, this.hemi);
    this.scene.fog = null;
    this.asphalt.dispose();
  }
}

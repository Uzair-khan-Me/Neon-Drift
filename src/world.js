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
 * Surface: high-detail procedural asphalt texture with aggregate, wear,
 * and micro-crack patterns (no external image files).
 */
import * as THREE from 'three';

const SEG_LEN = 260;
const ROAD_WIDTH = 34;   // drivable + shoulders width
const LANE_W = 3.6;      // realistic lane width
const ACTIVE_SEGMENTS = 10;
const SPAWN_AHEAD = 1100;
const RECYCLE_BEHIND = 800;

const ZONES = [
  { name: 'urban', minDist: 0 },
  { name: 'suburban', minDist: 1800 },
  { name: 'countryside', minDist: 4200 },
  { name: 'outskirts', minDist: 6800 },
  { name: 'elevated', minDist: 9800 },
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

/* ----------------------------------------------------------------
   PROCEDURAL ASPHALT TEXTURE
   ---------------------------------------------------------------- */
function makeAsphaltTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // ---- Base asphalt (dark charcoal grey) ----
  ctx.fillStyle = '#262a2f';
  ctx.fillRect(0, 0, size, size);

  // ---- Aggregate / stone speckles ----
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 0.5 + Math.random() * 1.5;
    const shade = 15 + Math.random() * 60;
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 5},${0.12 + Math.random() * 0.18})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Subtle tonal variation patches (wear / oil / sun fade) ----
  for (let i = 0; i < 14; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const rad = 40 + Math.random() * 120;
    const grad = ctx.createRadialGradient(cx, cy, rad * 0.2, cx, cy, rad);
    const lighten = Math.random() > 0.5;
    grad.addColorStop(0, lighten ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }

  // ---- Very subtle micro-crack network ----
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 0.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 25;
    const ang = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  // ---- Vignette (darker at edges) ----
  const vignette = ctx.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size / 2);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* ----------------------------------------------------------------
   WINDOW GRID MATERIAL (illuminated office windows)
   ---------------------------------------------------------------- */
function makeWindowGridMat(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.1,
    metalness: 0.05,
    emissive: color,
    emissiveIntensity: 0.0,
  });
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
    this.ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(this.ambient);

    // Natural sunlight — warm, directional, casts long soft shadows
    this.sun = new THREE.DirectionalLight(0xfff4e6, 1.2);
    this.sun.position.set(60, 80, 20);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.width = 2048;
    this.sun.shadow.mapSize.height = 2048;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 160;
    this.sun.shadow.camera.bottom = -160;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);

    this.hemi = new THREE.HemisphereLight(0x87aec0, 0x5a6a72, 0.35);
    this.scene.add(this.hemi);

    this.fog = new THREE.FogExp2(0x0f141a, 0.0009);
    this.scene.fog = this.fog;
  }

  buildSky() {
    // Distant city skyline silhouette — varied building heights, no neon
    const skyline = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1c2329, metalness: 0.2, roughness: 0.8
    });
    const ringR = 1800;
    const segs = 32;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const h = 90 + Math.random() * 220;
      const w = 70 + Math.random() * 90;
      const d = 30 + Math.random() * 50;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(Math.cos(a) * ringR, h / 2, Math.sin(a) * ringR);
      b.lookAt(0, h / 2, 0);
      b.castShadow = false; b.receiveShadow = true;
      skyline.add(b);
    }
    skyline.position.y = -6;
    this.scene.add(skyline);
  }

  /* ---------- segment content ---------- */

  buildSegmentContent(seg, index, baseZ, dist) {
    const rand = xorshift(index * 2654435761 + 987654321);
    const zone = zoneFor(dist).name;

    // ============ ROAD SURFACE (textured asphalt) ============
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_WIDTH + 10, SEG_LEN),
      new THREE.MeshStandardMaterial({
        map: this.asphalt, roughness: 0.94, metalness: 0.08
      })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.02;
    road.receiveShadow = true;
    road.userData.type = 'road';
    seg.add(road);

    // ============ SHOULDERS (concrete) ============
    const shoulder = new THREE.Mesh(
      new THREE.PlaneGeometry(90, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x4a525a, roughness: 1.0, metalness: 0.04 })
    );
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = 0.03;
    shoulder.receiveShadow = true;
    seg.add(shoulder);

    // ============ SIDEWALKS ============
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x3d4349, roughness: 0.95, metalness: 0.06
    });
    for (const sx of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(3.2, SEG_LEN), sidewalkMat);
      sw.rotation.x = -Math.PI / 2;
      sw.position.set(sx * (ROAD_WIDTH / 2 + 1.6), 0.04, 0);
      sw.position.z = baseZ;
      sw.receiveShadow = true;
      seg.add(sw);

      // Sidewalk curb
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.1, SEG_LEN),
        new THREE.MeshStandardMaterial({ color: 0x555d64, roughness: 0.9, metalness: 0.05 })
      );
      curb.position.set(sx * (ROAD_WIDTH / 2 + 0.06), 0.09, 0);
      curb.position.z = baseZ;
      curb.castShadow = true; curb.receiveShadow = true;
      seg.add(curb);

      // Sidewalk expansion joints
      for (let j = baseZ - SEG_LEN / 2 + 4; j < baseZ + SEG_LEN / 2; j += 2.4) {
        const joint = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 0.02, 0.06),
          new THREE.MeshBasicMaterial({ color: 0x2a2e33 })
        );
        joint.rotation.x = -Math.PI / 2;
        joint.position.set(sx * (ROAD_WIDTH / 2 + 1.6), 0.041, j);
        seg.add(joint);
      }
    }

    // ============ MEDIAN DIVIDER (concrete with landscaping) ============
    const median = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.45, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.85, metalness: 0.15 })
    );
    median.position.set(0, 0.22, 0);
    median.castShadow = true; median.receiveShadow = true;
    seg.add(median);

    const medianTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.06, SEG_LEN),
      new THREE.MeshStandardMaterial({ color: 0x555d65, roughness: 0.9, metalness: 0.1 })
    );
    medianTop.position.set(0, 0.46, 0);
    seg.add(medianTop);

    // Median trees (urban/suburban)
    if (zone === 'urban' || zone === 'suburban' || zone === 'outskirts') {
      const mTrunk = new THREE.MeshStandardMaterial({ color: 0x3d3226, roughness: 0.9, metalness: 0 });
      const mLeaf = new THREE.MeshStandardMaterial({ color: 0x2d5a3a, roughness: 0.9, metalness: 0 });
      for (let z = baseZ - SEG_LEN / 2 + 18; z < baseZ + SEG_LEN / 2; z += 40) {
        const side = (z / 40) % 2 < 1 ? -1 : 1;
        const mx = side * 0.75;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.6, 6), mTrunk);
        trunk.position.set(mx, 1.3, z);
        trunk.castShadow = true;
        seg.add(trunk);
        const foliage = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 6), mLeaf);
        foliage.position.set(mx, 2.9, z);
        foliage.castShadow = true;
        seg.add(foliage);
      }
    }

    // ============ LANE MARKINGS ============
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xeef0f2 });
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dash = (x, len = 7, gap = 9, w = 0.14, mat = lineMat) => {
      const zStart = baseZ - SEG_LEN / 2 + 8;
      const zEnd = baseZ + SEG_LEN / 2 - 8;
      let z = zStart;
      while (z < zEnd) {
        const l = Math.min(len, zEnd - z);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.32, z);
        seg.add(m);
        z += len + gap;
      }
    };
    // between player lanes (+2.5 and +7.5)
    dash(5.0);
    // between oncoming lanes
    dash(-5.0);
    // outer edges (solid white)
    dash(16.8, 45, 5, 0.16, edgeMat);
    dash(-16.8, 45, 5, 0.16, edgeMat);

    // Reflective road markers (cat's eyes) between lanes
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x555555, emissiveIntensity: 0.3,
      roughness: 0.1, metalness: 0.8
    });
    for (const mx of [5.0, -5.0]) {
      for (let z = baseZ - SEG_LEN / 2 + 10; z < baseZ + SEG_LEN / 2; z += 13) {
        const cat = new THREE.Mesh(
          new THREE.CylinderGeometry(0.07, 0.07, 0.04, 8),
          markerMat
        );
        cat.rotation.x = Math.PI / 2;
        cat.position.set(mx, 0.06, z);
        cat.castShadow = true;
        seg.add(cat);
      }
    }

    // ============ CONCRETE BARRIERS AT ROAD EDGES ============
    const barMat = new THREE.MeshStandardMaterial({ color: 0x3d4349, roughness: 0.7, metalness: 0.2 });
    for (const sx of [-17.4, 17.4]) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, SEG_LEN), barMat);
      barrier.position.set(sx, 0.5, 0);
      barrier.castShadow = true; barrier.receiveShadow = true;
      seg.add(barrier);
      // Barrier top cap
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.94, 0.05, SEG_LEN),
        new THREE.MeshStandardMaterial({ color: 0x555d64, roughness: 0.8, metalness: 0.1 })
      );
      cap.position.set(sx, 1.02, 0);
      seg.add(cap);
    }

    // ============ GUARDRAIL POSTS ============
    const postMat = new THREE.MeshStandardMaterial({ color: 0x556068, roughness: 0.8, metalness: 0.4 });
    for (const sx of [-17.8, 17.8]) {
      for (let z = baseZ - SEG_LEN / 2 + 9; z < baseZ + SEG_LEN / 2; z += 10) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6), postMat);
        post.position.set(sx, 0.75, z);
        post.castShadow = true;
        seg.add(post);
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 0.05, 10),
          new THREE.MeshStandardMaterial({ color: 0x4a525a, roughness: 0.8, metalness: 0.3 })
        );
        rail.position.set(sx, 0.98, z);
        rail.castShadow = true;
        seg.add(rail);
      }
    }

    // ============ STREETLIGHTS ============
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b424a, roughness: 0.75, metalness: 0.85 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffeadd, emissive: 0x2a1e10, emissiveIntensity: 0.15 });
    for (let z = baseZ - SEG_LEN / 2 + 30; z < baseZ + SEG_LEN / 2; z += 44) {
      for (const sx of [-19.2, 19.2]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 8.4, 8), poleMat);
        pole.position.set(sx, 4.2, z);
        pole.castShadow = true;
        seg.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.07, 0.07), poleMat);
        arm.position.set(sx + 1.4, 8.15, z);
        arm.castShadow = true;
        seg.add(arm);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.24, 0.36), lampMat);
        lamp.position.set(sx + 2.8, 8.15, z);
        seg.add(lamp);
      }
    }

    // ============ ROAD SIGNS ============
    if (rand() < 0.45) {
      const side = rand() < 0.5 ? -1 : 1;
      const sx = side * (18.2 + rand() * 6);
      const sz = baseZ + (rand() - 0.5) * SEG_LEN * 0.5;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x424a52 }));
      pole.position.set(sx, 2.1, sz);
      pole.castShadow = true;
      seg.add(pole);
      const signBack = new THREE.Mesh(
        new THREE.PlaneGeometry(1.8, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x2f3c46, roughness: 0.8, metalness: 0.1 })
      );
      signBack.position.set(sx, 4.3, sz + 0.02);
      signBack.castShadow = true;
      seg.add(signBack);
      const signFace = new THREE.Mesh(
        new THREE.PlaneGeometry(1.7, 1.1),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x2a2a2a, emissiveIntensity: 0.2 })
      );
      signFace.position.set(sx, 4.3, sz + 0.022);
      seg.add(signFace);
    }

    // ============ TERRAIN ============
    this._addTerrain(seg, rand, baseZ, SEG_LEN, zone);

    // ============ ROADSIDE OBJECTS BY ZONE ============
    if (zone === 'urban' || zone === 'outskirts') this._addCity(seg, rand, baseZ, SEG_LEN);
    else if (zone === 'suburban') this._addSuburban(seg, rand, baseZ, SEG_LEN);
    else if (zone === 'countryside') this._addCountryside(seg, rand, baseZ, SEG_LEN);
    else if (zone === 'elevated') this._addElevated(seg, rand, baseZ, SEG_LEN);
  }

  /* ---------- terrain ---------- */

  _addTerrain(seg, rand, baseZ, len, zone) {
    const grassColor = zone === 'countryside' ? 0x4a6b4a : 0x3d463d;
    const mat = new THREE.MeshStandardMaterial({
      color: grassColor, roughness: 1.0, metalness: 0
    });
    for (const sx of [-1, 1]) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, len), mat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(sx * (ROAD_WIDTH / 2 + 36), 0.04, 0);
      ground.position.z = baseZ;
      ground.receiveShadow = true;
      seg.add(ground);
    }
  }

  /* ---------- detailed buildings ---------- */

  _addCity(seg, rand, baseZ, len) {
    const count = 1 + Math.floor(rand() * 2);
    for (let b = 0; b < count; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (30 + rand() * 55);
      const bw = 16 + rand() * 28;
      const bh = 28 + rand() * 90;
      const bd = 16 + rand() * 30;
      const bz = baseZ + (rand() - 0.5) * len * 0.7;
      this._addBuilding(seg, bx, bh / 2, bz, bw, bh, bd, 'urban', rand);
    }
    this._addTrees(seg, rand, baseZ, len, 2 + Math.floor(rand() * 4), 0x22442d);
  }

  _addSuburban(seg, rand, baseZ, len) {
    const count = 1 + Math.floor(rand() * 2);
    for (let b = 0; b < count; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (32 + rand() * 45);
      const bw = 13 + rand() * 20;
      const bh = 14 + rand() * 40;
      const bd = 13 + rand() * 24;
      const bz = baseZ + (rand() - 0.5) * len * 0.75;
      this._addBuilding(seg, bx, bh / 2, bz, bw, bh, bd, 'suburban', rand);
    }
    this._addTrees(seg, rand, baseZ, len, 3 + Math.floor(rand() * 5), 0x3a7a3a);
    // utility poles
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a544a, roughness: 0.9, metalness: 0 });
    for (let z = baseZ - len / 2 + 26; z < baseZ + len / 2; z += 50) {
      const side = rand() < 0.5 ? -1 : 1;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.8, 6), poleMat);
      pole.position.set(side * 24, 3.4, z);
      pole.castShadow = true;
      seg.add(pole);
    }
  }

  _addCountryside(seg, rand, baseZ, len) {
    this._addTrees(seg, rand, baseZ, len, 4 + Math.floor(rand() * 6), 0x4a8a4a);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x5a503a, roughness: 0.9, metalness: 0 });
    for (let z = baseZ - len / 2 + 14; z < baseZ + len / 2; z += 8) {
      const side = rand() < 0.5 ? -1 : 1;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 5), postMat);
      post.position.set(side * 18, 0.9, z);
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
    for (let z = baseZ - len / 2 + 20; z < baseZ + len / 2; z += 32) {
      for (const sx of [-17.4, 17.4]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.2, 1.4), pillarMat);
        pillar.position.set(sx, -2.9, z);
        pillar.castShadow = true; pillar.receiveShadow = true;
        seg.add(pillar);
        // cross-brace detail
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.1, 32),
          new THREE.MeshStandardMaterial({ color: 0x555d64, roughness: 0.8, metalness: 0.1 })
        );
        brace.position.set(sx, -0.2, z);
        seg.add(brace);
      }
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x343c44, roughness: 0.75, metalness: 0.2 });
    const win = new THREE.MeshStandardMaterial({ color: 0x556a7a, roughness: 0.1, metalness: 0.05 });
    for (let b = 0; b < 2; b++) {
      const side = rand() < 0.5 ? -1 : 1;
      const bx = side * (48 + rand() * 60);
      const bw = 17 + rand() * 26;
      const bh = 32 + rand() * 55;
      const bd = 17 + rand() * 26;
      const bz = baseZ + (rand() - 0.5) * len * 0.7;
      this._addBuilding(seg, bx, bh / 2 - 45, bz, bw, bh, bd, 'elevated', rand, win, mat);
    }
  }

  /** Build a detailed building with window grid, setbacks, roof, and varied facade. */
  _addBuilding(seg, x, y, z, w, h, d, zone, rand, overrideWinMat, overrideMat) {
    const wallMat = overrideMat || new THREE.MeshStandardMaterial({
      color: zone === 'urban' ? 0x3e464e : 0x5c6b73,
      roughness: 0.8, metalness: 0.15
    });
    const winMat = overrideWinMat || new THREE.MeshStandardMaterial({
      color: 0x4a6580, roughness: 0.1, metalness: 0.05,
      emissive: 0x1a252f, emissiveIntensity: 0.0
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x2d3339, roughness: 0.9, metalness: 0.05
    });

    const group = new THREE.Group();

    // Main volume
    const main = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    main.position.y = h / 2;
    main.castShadow = true; main.receiveShadow = true;
    group.add(main);

    // Setback tower (adds visual interest / skyscraper look)
    if (h > 45 && rand() < 0.6) {
      const tw = w * 0.55;
      const th = h * 0.35;
      const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, th, d * 0.55), wallMat);
      tower.position.set(0, h + th / 2, 0);
      tower.castShadow = true; tower.receiveShadow = true;
      group.add(tower);
    }

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 1.4, d * 1.08), roofMat);
    roof.position.y = h + 0.7;
    roof.castShadow = true; roof.receiveShadow = true;
    group.add(roof);

    // Roof parapet / detail
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.5, d * 1.04), new THREE.MeshStandardMaterial({ color: 0x22272c }));
    parapet.position.y = h + 1.65;
    group.add(parapet);

    // Window grid — rows x columns of recessed window panes
    const winW = 0.9;
    const winH = 1.3;
    const gapX = 2.2;
    const gapY = 2.6;
    const cols = Math.max(2, Math.floor(w / gapX));
    const rows = Math.max(1, Math.floor((h - 4) / gapY));
    const depthOff = d / 2 + 0.03;

    for (let r = 0; r < rows; r++) {
      const wy = 2 + r * gapY + gapY / 2;
      if (wy > h - 2) break;
      for (let c = 0; c < cols; c++) {
        const wx = -w / 2 + gapX / 2 + c * gapX;
        if (wx > w / 2 - 1) break;
        // Randomly darken some windows for realism
        const lit = rand() > 0.3;
        const wm = winMat.clone();
        if (!lit) {
          wm.emissiveIntensity = 0.0;
          wm.color.setHex(0x2a3540);
        } else {
          wm.emissiveIntensity = 0.05;
        }
        // Front face windows
        const wf = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.05), wm);
        wf.position.set(wx, wy, depthOff);
        group.add(wf);
        // Side face windows (left side)
        const ws = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, winW), wm);
        ws.position.set(-depthOff, wy, wx);
        ws.rotation.y = Math.PI / 2;
        group.add(ws);
      }
    }

    group.position.set(x, y, z);
    group.updateMatrixWorld();
    group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
      }
    });
    seg.add(group);
  }

  /* ---------- improved trees ---------- */

  _addTrees(seg, rand, baseZ, len, count, leafColor) {
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d3226, roughness: 0.9, metalness: 0 });
    const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.9, metalness: 0 });
    for (let t = 0; t < count; t++) {
      const side = rand() < 0.5 ? -1 : 1;
      const tx = side * (18 + rand() * 45);
      const tz = baseZ + (rand() - 0.5) * len * 0.9;
      const trunkH = 2.8 + rand() * 1.6;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.36, trunkH, 8), trunkMat);
      trunk.position.set(tx, trunkH / 2, tz);
      trunk.castShadow = true;
      seg.add(trunk);

      // Multi-layer foliage for realistic tree shape
      const layers = 3 + Math.floor(rand() * 2);
      for (let l = 0; l < layers; l++) {
        const layerY = trunkH - 0.6 + l * 1.5;
        const layerR = 1.4 + l * 0.5 + rand() * 0.4;
        const foliage = new THREE.Mesh(new THREE.ConeGeometry(layerR, layerR * 1.4, 8), leafMat);
        foliage.position.set(tx, layerY, tz);
        foliage.castShadow = true;
        seg.add(foliage);
      }
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
    this.sun.position.set(playerZ + 60, 80, 20);
    this.sun.shadow.camera.position.copy(this.sun.position);
    this.sun.shadow.camera.lookAt(playerZ, 0, 0);

    // Fog stays ahead of the car for atmospheric perspective
    this.fog.near = playerZ + 140;
    this.fog.density = 0.0009;

    for (const seg of this.segments) {
      if (seg.baseZ + SEG_LEN / 2 < playerZ - RECYCLE_BEHIND) {
        seg.baseZ = playerZ + SPAWN_AHEAD + (seg.index % 4) * 320;
        seg.group.position.z = seg.baseZ;
        while (seg.group.children.length > 0) seg.group.remove(seg.group.children[0]);
        const dist = playerZ + SPAWN_AHEAD + (seg.index % 4) * 320;
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

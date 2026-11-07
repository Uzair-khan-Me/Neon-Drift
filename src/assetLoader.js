/**
 * Asset loader — loads GLB vehicle models once and provides cloneable copies.
 *
 * Models live in public/models/ so Vite copies them into dist/ as-is. They are
 * loaded by absolute URL at runtime. Licences are documented in README.md and
 * CREDITS.txt.
 *
 *   player / sedan  : sedan-original.glb  — CC0 1.0 (Innerscene 3D Parts Library)
 *   suv / hatch ... : RaymondTmD/Car-Models (attributed; see CREDITS.txt)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_FILES = {
  player: '/models/sedan-original.glb',
  sedan:  '/models/sedan-original.glb', // share the CC0 sedan
  suv:    '/models/suv.glb',
  hatch:  '/models/hatchback-sports.glb',
  taxi:   '/models/taxi.glb',
  police: '/models/police.glb',
  van:    '/models/delivery.glb',
};

const _v = new THREE.Vector3();
const _box = new THREE.Box3();

/** Auto-orient a cloned GLB scene so the vehicle faces +Z (headlamps front),
 * is centred horizontally, and sits with its bottom on y = 0. */
function prepareModel(scene) {
  const group = scene.clone();
  group.updateMatrixWorld();

  // 1) Align the dominant horizontal axis (car length) to +Z.
  _box.setFromObject(group);
  const size = _box.getSize(new THREE.Vector3());
  let rotY = 0;
  if (size.x > size.z) rotY = Math.PI / 2; // length along X -> rotate to Z

  group.rotation.y = rotY;
  group.updateMatrixWorld();
  _box.setFromObject(group);
  const size2 = _box.getSize(new THREE.Vector3());

  // 2) Rotate 180° if headlamps are at the rear (-Z), so front faces +Z.
  let hlSumZ = 0, hlCount = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const n = (o.name || '').toLowerCase();
    if (/headlamp|headlight|head_lamp|front.light|phare|faro/.test(n)) {
      o.getWorldPosition(_v);
      hlSumZ += _v.z;
      hlCount++;
    }
  });
  if (hlCount > 0 && hlSumZ / hlCount < 0) {
    group.rotation.y += Math.PI;
    group.updateMatrixWorld();
    _box.setFromObject(group);
  }

  // 3) Centre horizontally, bottom-align to y = 0.
  _box.setFromObject(group);
  const center = _box.getCenter(new THREE.Vector3());
  const h = _box.getSize(new THREE.Vector3()).y;
  group.position.set(-center.x, -center.y + h / 2, -center.z);
  group.updateMatrixWorld();

  _box.setFromObject(group);
  group.userData.modelSize = _box.getSize(new THREE.Vector3()).clone();
  return group;
}

export class AssetLoader {
  constructor() {
    this.loader = new GLTFLoader();
    this.cache = new Map(); // name -> prepared THREE.Group (master copy)
    this.loading = false;
    this.promise = null;
  }

  /** Load every model. Resolves when all are ready. */
  load() {
    if (this.loading) return this.promise;
    this.loading = true;
    const tasks = [];
    for (const [name, url] of Object.entries(MODEL_FILES)) {
      tasks.push(this._loadOne(name, url));
    }
    this.promise = Promise.all(tasks).then(() => {
      this.loading = false;
    });
    return this.promise;
  }

  async _loadOne(name, url) {
    try {
      const gltf = await this.loader.loadAsync(url);
      this.cache.set(name, prepareModel(gltf.scene));
    } catch (err) {
      console.error(`[AssetLoader] failed to load ${url}:`, err);
      const fb = new THREE.Mesh(
        new THREE.BoxGeometry(1.85, 1.5, 4.7),
        new THREE.MeshStandardMaterial({ color: 0x334455 })
      );
      fb.position.y = 0.75;
      this.cache.set(name, fb);
    }
  }

  clone(name) {
    const master = this.cache.get(name);
    if (!master) {
      console.warn(`[AssetLoader] model "${name}" not loaded`);
      return null;
    }
    return master.clone();
  }

  has(name) {
    return this.cache.has(name);
  }
}

export const assetLoader = new AssetLoader();

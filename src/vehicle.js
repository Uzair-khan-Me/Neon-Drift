/**
 * Base vehicle: a cloned GLB model with wheel/steering handling.
 *
 * Responsibilities:
 *   * hold the model mesh (added to the scene by the owner)
 *   * track yaw, position, speed
 *   * rotate wheels according to speed
 *   * steer front wheels
 *   * provide an oriented collision box
 */
import * as THREE from 'three';

const WHEEL_KEYWORDS = [/tire/, /wheel/, /rim/];
const _worldPos = new THREE.Vector3();

export class Vehicle {
  constructor(mesh, options = {}) {
    this.mesh = mesh; // THREE.Group (already prepared/oriented)
    this.options = {
      length: 4.6,
      width: 1.85,
      height: 1.5,
      ...options,
    };

    this.position = new THREE.Vector3();
    this.yaw = 0; // radians, +Z is forward
    this.speed = 0; // m/s (signed)

    // Wheel sub-mesh references (for rotation & steering)
    this.wheelMeshes = []; // {mesh, isFront, side(-1|1)}
    this._collectWheels();

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
  }

  /** Walk the model graph and find wheel meshes by name/shape. Classify
   * front vs rear using world-space Z (front = +Z for our models). */
  _collectWheels() {
    this.wheelMeshes = [];
    if (!this.mesh) return;
    // Ensure world matrices are computed so getWorldPosition is accurate
    this.mesh.updateMatrixWorld();
    const center = new THREE.Vector3();
    new THREE.Box3().setFromObject(this.mesh).getCenter(center);

    this.mesh.traverse((o) => {
      if (!o.isMesh) return;
      const name = (o.name || '').toLowerCase();
      const isWheel = WHEEL_KEYWORDS.some((re) => re.test(name));
      if (!isWheel) return;
      o.getWorldPosition(_worldPos);
      const isFront = _worldPos.z > center.z;
      const side = _worldPos.x > center.x ? 1 : -1;
      this.wheelMeshes.push({
        mesh: o,
        isFront,
        side,
        baseRotationY: o.rotation.y,
      });
    });

    if (this.wheelMeshes.length === 0) {
      console.warn('[Vehicle] no named wheels found; wheel rotation disabled');
    }
  }

  /** Set steering angle for front wheels (radians). */
  steer(angle) {
    for (const w of this.wheelMeshes) {
      if (!w.isFront) continue;
      w.mesh.rotation.y = w.baseRotationY + angle * w.side;
    }
  }

  /** Spin all wheels based on current speed (called each frame). */
  rotateWheels(dt, wheelRadius = 0.33) {
    const angleDelta = (this.speed / wheelRadius) * dt;
    for (const w of this.wheelMeshes) {
      w.mesh.rotation.x += angleDelta;
    }
  }

  /** Apply position + yaw to the mesh. */
  applyTransform() {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.yaw;
  }

  /** Collision box around the vehicle (tighter than visuals for forgiveness). */
  getBounds() {
    const { length, width, height } = this.options;
    const p = this.position;
    return new THREE.Box3(
      new THREE.Vector3(p.x - width * 0.42, 0.05, p.z - length * 0.42),
      new THREE.Vector3(p.x + width * 0.42, height * 0.75, p.z + length * 0.42)
    );
  }

  addTo(scene) {
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    this.applyTransform();
  }

  removeFrom(scene) {
    scene.remove(this.mesh);
  }

  dispose() {
    this.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
  }
}

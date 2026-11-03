/**
 * Camera system: third-person chase and first-person cockpit.
 */
import * as THREE from 'three';

export class Camera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 2000);
    this.camera.position.set(0, 6, -10);
    this.mode = 'chase'; // 'chase' | 'cockpit'

    this.shake = 0;
    this.shakeIntensity = 0;
    this.dashboard = null; // set externally (Three.Group locked to the camera view)
  }

  setMode(mode) {
    this.mode = mode;
  }

  /** Set a mesh group that will be locked to the camera view (cockpit dashboard). */
  linkDashboard(group) {
    this.dashboard = group;
  }

  update(dt, car) {
    const forward = car.forward;
    const right = car.right;
    const pos = car.group.position;
    const kmh = car.speedKmh;

    let targetPos, targetLook;

    if (this.mode === 'cockpit') {
      // Driver's seat, slightly to the right of centre
      const seat = new THREE.Vector3(0.32, 1.05, 0.5);
      const worldOff = seat.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw);
      targetPos = pos.clone().add(worldOff);
      targetLook = pos.clone().add(forward.clone().multiplyScalar(14));
      targetLook.y += 0.4;
      // Look slightly into the turn
      targetLook.add(right.clone().multiplyScalar(car.steerInput * 2.5));
    } else {
      // Chase camera: behind & above, further away at higher speed
      const back = 9.5 + Math.min(kmh / 18, 6);
      const height = 5.6 + Math.min(kmh / 110, 1.8);
      targetPos = pos.clone()
        .add(forward.clone().multiplyScalar(-back))
        .add(new THREE.Vector3(0, height, 0));
      // Camera pulls to the outside of the turn (centrifugal feel)
      targetPos.add(right.clone().multiplyScalar(-car.steerInput * Math.min(kmh / 70, 1) * 3));
      // Pitch the camera down a bit more under braking
      targetLook = pos.clone()
        .add(forward.clone().multiplyScalar(kmh / 20 + 7))
        .add(new THREE.Vector3(0, 1.4, 0));
    }

    // Smooth follow
    this.camera.position.lerp(targetPos, dt * 6);
    this.camera.lookAt(targetLook);

    // Lock dashboard to camera view (cockpit)
    if (this.dashboard) {
      this.dashboard.position.copy(this.camera.position);
      this.dashboard.quaternion.copy(this.camera.quaternion);
    }

    // Crash shake
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 8);
      const amp = this.shake * this.shakeIntensity;
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp * 0.6;
      this.camera.position.z += (Math.random() - 0.5) * amp;
      this.camera.lookAt(targetLook);
    }
  }

  shakeCamera(intensity = 1) {
    this.shake = 1;
    this.shakeIntensity = intensity;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}

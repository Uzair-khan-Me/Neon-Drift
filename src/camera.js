/**
 * Camera system: third-person chase and first-person cockpit.
 */
import * as THREE from 'three';

export class Camera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.3, 2000);
    this.camera.position.set(0, 5.5, -9);
    this.mode = 'chase'; // 'chase' | 'cockpit'

    this.shake = 0;
    this.shakeIntensity = 0;
    this.dashboard = null; // Three.Group locked to camera view (cockpit)
  }

  setMode(mode) {
    this.mode = mode;
  }

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
      const seat = new THREE.Vector3(0.18, 1.02, 0.55);
      const worldOff = seat.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw);
      targetPos = pos.clone().add(worldOff);
      targetLook = pos.clone().add(forward.clone().multiplyScalar(16));
      targetLook.y += 0.5;
      targetLook.add(right.clone().multiplyScalar(car.steerInput * 3));
    } else {
      const back = 9.5 + Math.min(kmh / 20, 5);
      const height = 5.4 + Math.min(kmh / 120, 1.6);
      targetPos = pos.clone()
        .add(forward.clone().multiplyScalar(-back))
        .add(new THREE.Vector3(0, height, 0));
      targetPos.add(right.clone().multiplyScalar(-car.steerInput * Math.min(kmh / 80, 1) * 2.5));
      targetLook = pos.clone()
        .add(forward.clone().multiplyScalar(kmh / 22 + 8))
        .add(new THREE.Vector3(0, 1.5, 0));
    }

    this.camera.position.lerp(targetPos, dt * 6);
    this.camera.lookAt(targetLook);

    if (this.dashboard) {
      this.dashboard.position.copy(this.camera.position);
      this.dashboard.quaternion.copy(this.camera.quaternion);
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 8);
      const amp = this.shake * this.shakeIntensity;
      this.camera.position.x += (Math.random() - 0.5) * amp;
      this.camera.position.y += (Math.random() - 0.5) * amp * 0.5;
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

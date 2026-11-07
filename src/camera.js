/**
 * Camera system: third-person chase and first-person cockpit.
 */
import * as THREE from 'three';

export class Camera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 3000);
    this.camera.position.set(0, 6, -8);
    this.mode = 'chase'; // 'chase' | 'cockpit'

    this.shake = 0;
    this.shakeIntensity = 0;
    this.dashboard = null; // locked to camera view (cockpit)
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
    const pos = car.position;
    const kmh = car.speedKmh;

    let targetPos, targetLook;

    if (this.mode === 'cockpit') {
      // Driver's seat (right-hand drive position slightly offset)
      const seat = new THREE.Vector3(0.25, 1.12, 0.62);
      const worldOff = seat.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), car.yaw);
      targetPos = pos.clone().add(worldOff);
      targetLook = pos.clone().add(forward.clone().multiplyScalar(18));
      targetLook.y += 0.55;
      // Look into the turn slightly
      targetLook.add(right.clone().multiplyScalar(car.steerInput * 3.5));
    } else {
      // Chase: behind & above, car visible in lower center of screen
      const back = 7.5 + Math.min(kmh / 25, 4.5);
      const height = 4.8 + Math.min(kmh / 140, 1.5);
      targetPos = pos.clone()
        .add(forward.clone().multiplyScalar(-back))
        .add(new THREE.Vector3(0, height, 0));
      targetPos.add(right.clone().multiplyScalar(-car.steerInput * Math.min(kmh / 90, 1) * 2.0));
      // Look well ahead down the road, slightly above the horizon
      targetLook = pos.clone()
        .add(forward.clone().multiplyScalar(kmh / 20 + 14))
        .add(new THREE.Vector3(0, 1.2, 0));
    }

    // Smooth follow
    this.camera.position.lerp(targetPos, dt * 6.5);
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

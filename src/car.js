/**
 * Player car — detailed GLB model + realistic driving physics.
 *
 * Physics (delta-time, no teleportation / no instant lane switching):
 *   * engine force along heading, RPM/power curve, per-gear taper
 *   * brake force always opposing current direction of travel
 *   * reverse gear
 *   * bicycle-model yaw rate from steering angle & wheelbase
 *   * speed-sensitive steering sensitivity & gradual return-to-center
 *   * lateral tire grip -> understeer at low slip, controlled oversteer
 *   * handbrake reduces rear grip (drift initiation)
 *   * air drag (linear + quadratic) + rolling resistance
 *   * weight & momentum via integrated velocity
 *   * body roll / pitch / per-wheel suspension visuals
 *
 * Speed is always derived from the integrated velocity (never faked).
 */
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';

const WHEEL_R = 0.33; // m, matches the GLB wheel radius (~0.33 m)

export class Car extends Vehicle {
  constructor(mesh) {
    super(mesh, { length: 4.70, width: 2.32, height: 1.48 });

    // ---------- Physics state ----------
    this.velocity = new THREE.Vector3(); // world-space m/s
    this.speedKmh = 0;
    this.steerInput = 0;   // -1..1 smoothed steering
    this.gear = 'N';
    this.rpm = 0;
    this.engineLoad = 0;   // 0..1, for audio

    // ---------- Tuning (realistic sedan) ----------
    this.mass = 1600;            // kg
    this.maxForce = 12500;       // N peak at wheels
    this.brakeForce = 26000;     // N
    this.reverseForce = 5500;    // N
    this.maxSpeed = 62;          // m/s (~223 km/h)
    this.dragLinear = 0.8;       // N per (m/s)
    this.dragQuad = 0.85;        // N per (m/s)^2
    this.rollResist = 210;       // N
    this.wheelBase = 2.85;       // m
    this.maxSteerAngle = 0.40;   // rad (~23 deg)
    this.steerReturn = 2.6;      // smoothing (1/s)
    this.lateralGrip = 9.0;      // cornering strength
    this.handbrakeGrip = 0.13;   // rear grip with handbrake

    // ---------- Visual state ----------
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.suspension = { fl: 0, fr: 0, rl: 0, rr: 0 };
  }

  /** Advance physics by dt seconds and refresh visuals. */
  update(dt, input) {
    const kmh = this.getSpeedKmh();
    this.speedKmh = kmh;

    const forward = this.forward;
    const right = this.right;
    const speed = this.velocity.length();
    const vsign = speed > 0.01 ? this.velocity.dot(forward) / speed : 1;

    // ---------- Drivetrain ----------
    let engineForce = 0;
    const reversing = kmh < 1.5 && input.brake && !input.accel;

    if (reversing) {
      engineForce = -this.reverseForce;
      this.gear = 'R';
      this.rpm = Math.min(1, kmh / 40);
      this.engineLoad = 0.6;
    } else if (input.accel && kmh < this.maxSpeed * 3.6) {
      const taper = Math.max(0, 1 - kmh / (this.maxSpeed * 3.6));
      engineForce = this.maxForce * taper;
      this.gear = this.gearFromSpeed(kmh);
      this.rpm = Math.min(1, kmh / (this.maxSpeed * 3.6) + 0.12);
      this.engineLoad = Math.min(1, 0.3 + taper * 0.7);
    } else if (input.brake && kmh > 1.5) {
      engineForce = -this.brakeForce * vsign;
      this.gear = this.gearFromSpeed(kmh);
      this.rpm = Math.max(0.08, this.rpm - dt * 2.0);
      this.engineLoad = 0.15;
    } else {
      this.gear = kmh < 6 ? 'N' : this.gearFromSpeed(kmh);
      this.rpm = Math.max(0.06, this.rpm - dt * 2.5);
      this.engineLoad = 0.12;
    }

    // Apply engine force along heading
    this.velocity.addScaledVector(forward, (engineForce / this.mass) * dt);

    // Drag & rolling resistance oppose velocity
    const resistMag = this.dragLinear * speed + this.dragQuad * speed * speed + this.rollResist;
    if (speed > 0.01) {
      this.velocity.addScaledVector(this.velocity, -(resistMag / this.mass) * dt);
    }

    // ---------- Steering ----------
    this.steerInput += (input.steer - this.steerInput) * this.steerReturn * dt;

    // Speed-dependent sensitivity: less reactive at high speed
    const sens = Math.max(0.3, 1.1 - kmh / 220);
    const steerAngle = this.steerInput * this.maxSteerAngle * sens;

    // Bicycle model yaw rate
    const yawRate = (speed * Math.tan(steerAngle) / this.wheelBase);
    this.yaw += yawRate * dt;

    // ---------- Lateral grip (understeer / controlled oversteer) ----------
    const lat = this.velocity.dot(right);
    const grip = input.handbrake ? this.handbrakeGrip : 1.0;
    this.velocity.addScaledVector(right, -lat * grip * this.lateralGrip * dt);

    // Gentle alignment of velocity toward heading (momentum / crab-slide)
    const align = 2.4 * dt * (input.handbrake ? 0.35 : 1.0);
    this.velocity.lerp(forward.clone().multiplyScalar(speed), align);

    // ---------- Integrate position ----------
    this.position.addScaledVector(this.velocity, dt);

    // ---------- Visuals ----------
    this.applyTransform();
    this.steer(steerAngle);
    this.rotateWheels(dt, WHEEL_R);

    // Body roll in corners
    const targetRoll = -this.steerInput * Math.min(kmh / 150, 1) * 0.16;
    this.bodyRoll += (targetRoll - this.bodyRoll) * 5 * dt;

    // Pitch under acceleration / braking
    const targetPitch = (engineForce / this.maxForce) * 0.08;
    this.bodyPitch += (targetPitch - this.bodyPitch) * 4 * dt;

    // Per-wheel suspension compression (visual only)
    const roll = this.bodyRoll;
    const pitch = this.bodyPitch;
    this.suspension.fl = Math.max(0, 0.02 - pitch * 0.3 + roll * 0.4);
    this.suspension.fr = Math.max(0, 0.02 - pitch * 0.3 - roll * 0.4);
    this.suspension.rl = Math.max(0, 0.02 + pitch * 0.3 + roll * 0.4);
    this.suspension.rr = Math.max(0, 0.02 + pitch * 0.3 - roll * 0.4);

    this.mesh.rotation.set(this.bodyPitch, this.yaw, this.bodyRoll);
  }

  getSpeedKmh() {
    return this.velocity.length() * 3.6;
  }

  gearFromSpeed(kmh) {
    if (kmh < 15) return 1;
    if (kmh < 40) return 2;
    if (kmh < 70) return 3;
    if (kmh < 100) return 4;
    if (kmh < 135) return 5;
    return 6;
  }

  /** Brake-light state: true when braking hard or reversing. */
  get braking() {
    const kmh = this.getSpeedKmh();
    return kmh > 3 && (this.gear === 'R' || this.velocity.length() > 0);
  }
}

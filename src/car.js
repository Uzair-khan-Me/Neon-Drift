/**
 * Player car: driving physics + Three.js visuals.
 *
 * Physics model (delta-time based, no teleportation):
 *   * engine / brake / reverse force applied along the car's heading
 *   * air drag (linear + quadratic) and rolling resistance
 *   * bicycle-model yaw rate from steering angle & wheelbase
 *   * speed-sensitive steering sensitivity
 *   * lateral tire grip -> drift / oversteer when turning fast or braking
 *   * handbrake reduces rear grip (controlled oversteer)
 *   * velocity is integrated into position, so the car has weight & momentum
 */
import * as THREE from 'three';

const WHEEL_R = 0.5;

export class Car {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.y = 0;

    this.buildVisuals();

    // ---------- Physics state ----------
    this.yaw = 0;                       // heading (radians, +Z is forward)
    this.velocity = new THREE.Vector3(); // world-space velocity (m/s)
    this.speedKmh = 0;
    this.steerInput = 0;                // smoothed steering, -1..1
    this.targetSteer = 0;
    this.gear = 'N';

    // ---------- Tuning ----------
    this.mass = 1400;
    this.maxForce = 9800;          // N
    this.brakeForce = 15000;       // N
    this.reverseForce = 5000;      // N
    this.maxSpeed = 66;            // m/s (~238 km/h)
    this.dragLinear = 0.5;         // N per (m/s)
    this.dragQuad = 0.55;          // N per (m/s)^2
    this.rollResist = 150;         // N
    this.wheelBase = 2.9;          // m
    this.maxSteerAngle = 0.4;      // rad (~23 deg)
    this.steerReturn = 3.0;        // smoothing speed for steering return
    this.lateralGrip = 9.0;        // lateral friction strength
    this.handbrakeGrip = 0.16;     // grip multiplier with handbrake

    // ---------- Visual state ----------
    this.wheelRotation = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.suspensionOffset = 0;
  }

  buildVisuals() {
    const matBody = new THREE.MeshStandardMaterial({ color: 0x00e5ff, metalness: 0.6, roughness: 0.35 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x141414, metalness: 0.8, roughness: 0.2 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.55 });
    const matNeon = new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 2, metalness: 0.5, roughness: 0.3 });
    const matWheel = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.85 });
    const matLight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x222266, emissiveIntensity: 0.6 });

    // Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.25, 1.9), matBody);
    chassis.position.y = 0.55;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    this.group.add(chassis);

    // Hood
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 1.45), matBody);
    hood.position.set(1.3, 1.05, 0);
    hood.castShadow = true;
    this.group.add(hood);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.85, 1.0, 1.2), matBody);
    cabin.position.set(-0.8, 1.5, 0);
    cabin.castShadow = true;
    this.group.add(cabin);

    // Windows
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.8, 1.0), matGlass);
    glass.position.set(-0.8, 1.82, 0.51);
    this.group.add(glass);

    // Neon side stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.1, 1.95), matNeon);
    stripe.position.set(0, -0.02, -0.99);
    this.group.add(stripe);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.38, 20);
    wheelGeo.rotateX(Math.PI / 2);
    this.wheels = [];
    const wheelPos = [
      [1.0, 0.55, -1.0], [-1.0, 0.55, -1.0],
      [1.0, 0.55, 1.0], [-1.0, 0.55, 1.0],
    ];
    for (const [x, y, z] of wheelPos) {
      const w = new THREE.Mesh(wheelGeo, matWheel);
      w.position.set(x, y, z);
      w.castShadow = true;
      this.group.add(w);
      this.wheels.push(w);
    }

    // Head / tail lights
    const headL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.42), matLight);
    headL.position.set(2.08, 0.95, -0.82);
    this.group.add(headL);
    const headR = headL.clone(); headR.position.z = 0.82; this.group.add(headR);
    const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.42), matLight);
    tailL.material = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0x660000, emissiveIntensity: 0.8 });
    tailL.position.set(-2.08, 0.95, -0.82);
    this.group.add(tailL);
    const tailR = tailL.clone(); tailR.position.z = 0.82; this.group.add(tailR);

    this.group.updateMatrixWorld();
  }

  /** Heading direction in world space. */
  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Right direction in world space. */
  get right() {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  /** Current speed in km/h. */
  getSpeedKmh() {
    return this.velocity.length() * 3.6;
  }

  gearFromSpeed(kmh) {
    if (kmh < 15) return 1;
    if (kmh < 38) return 2;
    if (kmh < 68) return 3;
    if (kmh < 98) return 4;
    if (kmh < 132) return 5;
    return 6;
  }

  /**
   * Advance physics by dt seconds and refresh visuals.
   * @param {number} dt delta time in seconds
   * @param {object} input {accel, brake, steer(-1..1), handbrake}
   */
  update(dt, input) {
    const kmh = this.getSpeedKmh();
    this.speedKmh = kmh;

    const forward = this.forward;
    const right = this.right;
    const speed = this.velocity.length();
    const vsign = speed > 0.01 ? this.velocity.dot(forward) / speed : 1; // +1 forward, -1 backward

    // ---------- Drivetrain ----------
    let engineForce = 0;
    const reversing = kmh < 1.5 && input.brake && !input.accel;

    if (reversing) {
      engineForce = -this.reverseForce;
      this.gear = 'R';
    } else if (input.accel && kmh < this.maxSpeed * 3.6) {
      const taper = Math.max(0, 1 - kmh / (this.maxSpeed * 3.6));
      engineForce = this.maxForce * taper;
      this.gear = this.gearFromSpeed(kmh);
    } else if (input.brake && kmh > 1.5) {
      // Brake force always opposes current direction of travel
      engineForce = -this.brakeForce * vsign;
      this.gear = this.gearFromSpeed(kmh);
    } else {
      this.gear = kmh < 6 ? 'N' : this.gearFromSpeed(kmh);
    }

    // Engine force along heading; drag & rolling resistance oppose velocity
    this.velocity.addScaledVector(forward, (engineForce / this.mass) * dt);
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

    // ---------- Lateral grip (drift / momentum) ----------
    const lat = this.velocity.dot(right);
    const grip = input.handbrake ? this.handbrakeGrip : 1.0;
    this.velocity.addScaledVector(right, -lat * grip * this.lateralGrip * dt);

    // Gentle alignment of velocity toward heading keeps the "momentum" feel
    // without snapping: at high speed the car crab-slides through turns.
    const align = 3.0 * dt * (input.handbrake ? 0.35 : 1.0);
    this.velocity.lerp(forward.clone().multiplyScalar(speed), align);

    // ---------- Integrate position ----------
    this.group.position.addScaledVector(this.velocity, dt);
    this.group.position.y = this.suspensionOffset;

    // ---------- Visuals ----------
    this.group.rotation.y = this.yaw;

    // Wheel spin
    this.wheelRotation += (speed / WHEEL_R) * dt;
    for (const w of this.wheels) w.rotation.x = this.wheelRotation;

    // Front wheels turn with steering
    this.wheels[0].rotation.y = steerAngle;
    this.wheels[1].rotation.y = steerAngle;

    // Body roll in corners
    const targetRoll = -this.steerInput * Math.min(kmh / 150, 1) * 0.22;
    this.bodyRoll += (targetRoll - this.bodyRoll) * 5 * dt;

    // Pitch under acceleration / braking
    const targetPitch = (engineForce / this.maxForce) * 0.1;
    this.bodyPitch += (targetPitch - this.bodyPitch) * 4 * dt;

    // Suspension bounce scaled by speed
    const freq = 3.5 + speed * 0.5;
    this.suspensionOffset = Math.sin(Date.now() * 0.001 * freq) * (0.025 + speed * 0.0012);

    this.group.rotation.set(this.bodyPitch, this.yaw, this.bodyRoll);
  }

  /** Axis-aligned collision box around the car (slightly smaller than visuals for forgiveness). */
  getBounds() {
    const p = this.group.position;
    return new THREE.Box3(
      new THREE.Vector3(p.x - 0.75, 0.05, p.z - 1.9),
      new THREE.Vector3(p.x + 0.75, 1.55, p.z + 1.9)
    );
  }
}

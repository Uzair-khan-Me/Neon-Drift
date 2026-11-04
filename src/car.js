/**
 * Player car — detailed realistic model + driving physics.
 *
 * Visuals are built from multiple Three.js primitives so the vehicle reads
 * as a modern premium sedan rather than a box. The car faces +Z (front = +Z),
 * matching the physics forward vector.
 *
 * Physics (delta-time, no teleportation):
 *   * engine force along heading with RPM/power curve and gear taper
 *   * brake force always opposing direction of travel
 *   * reverse gear
 *   * bicycle-model yaw rate from steering angle & wheelbase
 *   * speed-sensitive steering sensitivity & gradual return-to-center
 *   * lateral tire grip -> understeer / controlled oversteer
 *   * handbrake reduces rear grip
 *   * drag (linear + quadratic) + rolling resistance
 *   * weight & momentum via integrated velocity
 *   * suspension compression/rebound + body roll & pitch visuals
 */
import * as THREE from 'three';

const WHEEL_R = 0.42;

export class Car {
  constructor() {
    this.group = new THREE.Group();
    this.group.position.y = 0;

    this.buildVisuals();

    // ---------- Physics state ----------
    this.yaw = 0;
    this.velocity = new THREE.Vector3();
    this.speedKmh = 0;
    this.steerInput = 0;
    this.targetSteer = 0;
    this.gear = 'N';
    this.rpm = 0;

    // ---------- Tuning ----------
    this.mass = 1550;
    this.maxForce = 11500;        // N peak engine force at wheels
    this.brakeForce = 22000;      // N
    this.reverseForce = 4500;     // N
    this.maxSpeed = 64;           // m/s (~230 km/h)
    this.dragLinear = 0.7;        // N per (m/s)
    this.dragQuad = 0.75;         // N per (m/s)^2
    this.rollResist = 180;        // N
    this.wheelBase = 2.85;        // m
    this.maxSteerAngle = 0.42;    // rad (~24 deg)
    this.steerReturn = 2.8;       // smoothing speed
    this.lateralGrip = 8.5;       // lateral friction strength
    this.handbrakeGrip = 0.14;    // rear grip multiplier with handbrake

    // ---------- Visual state ----------
    this.wheelRotation = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
  }

  buildVisuals() {
    const matBody = new THREE.MeshStandardMaterial({
      color: 0x1a252f, metalness: 0.75, roughness: 0.28, envMapIntensity: 1
    });
    const matBodyDark = new THREE.MeshStandardMaterial({
      color: 0x10171c, metalness: 0.8, roughness: 0.2
    });
    const matGlass = new THREE.MeshStandardMaterial({
      color: 0x263238, metalness: 0.05, roughness: 0.08, transparent: true, opacity: 0.52
    });
    const matChrome = new THREE.MeshStandardMaterial({
      color: 0xbbbbbb, metalness: 1, roughness: 0.15
    });
    const matTire = new THREE.MeshStandardMaterial({
      color: 0x141414, metalness: 0.1, roughness: 0.95
    });
    const matRim = new THREE.MeshStandardMaterial({
      color: 0x2a2f35, metalness: 0.7, roughness: 0.25
    });
    const matLight = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x222244, emissiveIntensity: 0.4
    });
    const matTail = new THREE.MeshStandardMaterial({
      color: 0x7a1414, emissive: 0x330000, emissiveIntensity: 0.4
    });

    // ---- Body shell (car faces +Z) ----
    const body = new THREE.Group();

    // Lower chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.0, 1.85), matBody);
    chassis.position.set(0, 0.45, 0);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    body.add(chassis);

    // Hood (front)
    const hood = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.75, 1.55), matBody);
    hood.position.set(0, 0.85, 1.2);
    hood.castShadow = true;
    body.add(hood);

    // Cabin (middle)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.05, 1.35), matBody);
    cabin.position.set(0, 1.42, -0.4);
    cabin.castShadow = true;
    body.add(cabin);

    // Trunk (rear)
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.55), matBody);
    trunk.position.set(0, 0.75, -1.6);
    trunk.castShadow = true;
    body.add(trunk);

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.45, 1.2), matBodyDark);
    roof.position.set(0, 2.02, -0.4);
    roof.castShadow = true;
    body.add(roof);

    // Windshield / windows
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.75, 1.15), matGlass);
    windshield.position.set(0, 1.82, 0.62);
    body.add(windshield);
    const glassSideL = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.7, 0.08), matGlass);
    glassSideL.position.set(-0.72, 1.78, -0.4);
    body.add(glassSideL);
    const glassSideR = glassSideL.clone();
    glassSideR.position.set(0.72, 1.78, -0.4);
    body.add(glassSideR);

    // Front grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 1.0), matChrome);
    grille.position.set(0, 0.62, 2.28);
    body.add(grille);

    // Bumpers
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 1.7), matBodyDark);
    bumperF.position.set(0, 0.35, 2.35);
    bumperF.castShadow = true;
    body.add(bumperF);
    const bumperR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.5, 1.7), matBodyDark);
    bumperR.position.set(0, 0.32, -2.75);
    bumperR.castShadow = true;
    body.add(bumperR);

    // Headlights (front, +Z)
    const headL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.42), matLight);
    headL.position.set(-0.72, 0.92, 2.32);
    body.add(headL);
    const headR = headL.clone();
    headR.position.set(0.72, 0.92, 2.32);
    body.add(headR);

    // Taillights (rear, -Z)
    const tailL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.42), matTail);
    tailL.position.set(-0.72, 0.72, -2.8);
    body.add(tailL);
    const tailR = tailL.clone();
    tailR.position.set(0.72, 0.72, -2.8);
    body.add(tailR);

    // Side mirrors
    const mirrorMat = new THREE.MeshStandardMaterial({ color: 0x1a252f, metalness: 0.6, roughness: 0.3 });
    const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.32), mirrorMat);
    mirrorL.position.set(-0.88, 1.5, 0.5);
    mirrorL.castShadow = true;
    body.add(mirrorL);
    const mirrorR = mirrorL.clone();
    mirrorR.position.set(0.88, 1.5, 0.5);
    body.add(mirrorR);

    // Door handles
    const handleL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 0.09), matChrome);
    handleL.position.set(-0.75, 1.32, -0.4);
    body.add(handleL);
    const handleR = handleL.clone();
    handleR.position.set(0.75, 1.32, -0.4);
    body.add(handleR);

    this.group.add(body);

    // ---- Wheels (front = +Z) ----
    const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.4, 24);
    tireGeo.rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(WHEEL_R * 0.62, WHEEL_R * 0.62, 0.42, 20);
    rimGeo.rotateX(Math.PI / 2);
    const capGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.44, 12);
    capGeo.rotateX(Math.PI / 2);

    this.wheels = [];
    this.wheelRims = [];
    this.wheelCaps = [];
    // order: front-right, front-left, rear-right, rear-left
    const wheelPos = [
      [1.05, 0.45, 1.0],   // front right
      [-1.05, 0.45, 1.0],  // front left
      [1.05, 0.45, -1.0],  // rear right
      [-1.05, 0.45, -1.0], // rear left
    ];
    for (const [x, y, z] of wheelPos) {
      const assembly = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, matTire);
      tire.position.set(x, y, z);
      tire.castShadow = true;
      assembly.add(tire);
      const rim = new THREE.Mesh(rimGeo, matRim);
      rim.position.set(x, y, z);
      rim.castShadow = true;
      assembly.add(rim);
      const cap = new THREE.Mesh(capGeo, matChrome);
      cap.position.set(x, y, z);
      assembly.add(cap);
      this.group.add(assembly);
      this.wheels.push(tire);
      this.wheelRims.push(rim);
      this.wheelCaps.push(cap);
    }

    this.group.updateMatrixWorld();
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  get right() {
    return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
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
    } else if (input.accel && kmh < this.maxSpeed * 3.6) {
      const taper = Math.max(0, 1 - kmh / (this.maxSpeed * 3.6));
      engineForce = this.maxForce * taper;
      this.gear = this.gearFromSpeed(kmh);
      this.rpm = Math.min(1, kmh / (this.maxSpeed * 3.6) + 0.15);
    } else if (input.brake && kmh > 1.5) {
      engineForce = -this.brakeForce * vsign;
      this.gear = this.gearFromSpeed(kmh);
      this.rpm = Math.max(0, this.rpm - dt * 1.5);
    } else {
      this.gear = kmh < 6 ? 'N' : this.gearFromSpeed(kmh);
      this.rpm = Math.max(0, this.rpm - dt * 2);
    }

    // Apply engine force along heading; drag & rolling resistance oppose velocity
    this.velocity.addScaledVector(forward, (engineForce / this.mass) * dt);
    const resistMag = this.dragLinear * speed + this.dragQuad * speed * speed + this.rollResist;
    if (speed > 0.01) {
      this.velocity.addScaledVector(this.velocity, -(resistMag / this.mass) * dt);
    }

    // ---------- Steering ----------
    this.steerInput += (input.steer - this.steerInput) * this.steerReturn * dt;

    // Speed-dependent sensitivity
    const sens = Math.max(0.3, 1.1 - kmh / 220);
    const steerAngle = this.steerInput * this.maxSteerAngle * sens;

    // Bicycle model yaw rate
    const yawRate = (speed * Math.tan(steerAngle) / this.wheelBase);
    this.yaw += yawRate * dt;

    // ---------- Lateral grip (understeer / oversteer) ----------
    const lat = this.velocity.dot(right);
    const grip = input.handbrake ? this.handbrakeGrip : 1.0;
    this.velocity.addScaledVector(right, -lat * grip * this.lateralGrip * dt);

    // Gentle alignment of velocity toward heading (momentum / crab-slide)
    const align = 2.6 * dt * (input.handbrake ? 0.4 : 1.0);
    this.velocity.lerp(forward.clone().multiplyScalar(speed), align);

    // ---------- Integrate position ----------
    this.group.position.addScaledVector(this.velocity, dt);
    this.group.position.y = 0.45 + Math.sin(Date.now() * 0.0015 * 4) * 0.012;

    // ---------- Visuals ----------
    this.group.rotation.y = this.yaw;

    // Wheel spin + steering (combine so front wheels both spin and steer)
    this.wheelRotation += (speed / WHEEL_R) * dt;
    for (let i = 0; i < this.wheels.length; i++) {
      if (i < 2) {
        // front wheels: spin + steer
        this.wheels[i].rotation.set(this.wheelRotation, steerAngle, 0);
      } else {
        // rear wheels: spin only
        this.wheels[i].rotation.x = this.wheelRotation;
      }
    }

    // Body roll in corners
    const targetRoll = -this.steerInput * Math.min(kmh / 150, 1) * 0.18;
    this.bodyRoll += (targetRoll - this.bodyRoll) * 5 * dt;

    // Pitch under acceleration / braking
    const targetPitch = (engineForce / this.maxForce) * 0.09;
    this.bodyPitch += (targetPitch - this.bodyPitch) * 4 * dt;

    this.group.rotation.set(this.bodyPitch, this.yaw, this.bodyRoll);
  }

  /** Axis-aligned collision box around the car (tighter than visuals for forgiveness). */
  getBounds() {
    const p = this.group.position;
    return new THREE.Box3(
      new THREE.Vector3(p.x - 0.7, 0.05, p.z - 1.85),
      new THREE.Vector3(p.x + 0.7, 1.45, p.z + 1.85)
    );
  }
}

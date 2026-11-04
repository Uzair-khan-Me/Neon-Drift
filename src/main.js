/**
 * Traffic Rush — main entry point.
 * Three.js renderer, state machine, game loop, rewards, collisions.
 */
import * as THREE from 'three';
import { Input } from './input.js';
import { Car } from './car.js';
import { World } from './world.js';
import { Traffic } from './traffic.js';
import { Camera } from './camera.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';

const STORAGE_KEY = 'traffic_rush_best';
const MAX_SPEED_KMH = 260;

export class Game {
  constructor() {
    // ---------- Renderer ----------
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ---------- Scenes ----------
    this.sceneGame = new THREE.Scene();
    this.sceneGame.background = new THREE.Color(0x0e1115);

    this.sceneMenu = new THREE.Scene();
    this.sceneMenu.background = new THREE.Color(0x0b0d10);

    // ---------- Cameras ----------
    this.cam = new Camera();
    this.menuCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 2000);
    this.menuCamera.position.set(0, 6, -13);
    this.menuCamera.lookAt(0, 1.8, 0);

    // ---------- Entities ----------
    this.input = new Input();
    this.audio = new Audio();
    this.car = new Car();
    this.sceneMenu.add(this.car.group); // preview in menu

    this.world = new World(this.sceneGame);
    this.traffic = new Traffic(this.sceneGame);

    this.hud = new HUD();

    // ---------- Cockpit dashboard (locked to camera view) ----------
    this.buildDashboard();

    // ---------- Menu stage ----------
    this.buildMenuStage();

    // ---------- State ----------
    this.state = 'MENU';
    this.clock = new THREE.Clock();

    this.distance = 0;
    this.score = 0;
    this.nearMisses = 0;
    this.overtakes = 0;
    this.maxSpeed = 0;
    this.speedSum = 0;
    this.speedSamples = 0;
    this.highSpeedTimer = 0;
    this.cleanOvertakeTimer = 0;
    this.gameOverTimer = 0;
    this._brakeCooldown = 0;

    this.best = Number(localStorage.getItem(STORAGE_KEY) || 0);

    // ---------- Bindings ----------
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);

    this.bindMenuButtons();

    // Fullscreen on click/tap of canvas
    this.canvas.addEventListener('click', () => this.requestFullscreen());

    this.loop();
  }

  buildDashboard() {
    this.dashboard = new THREE.Group();
    this.sceneGame.add(this.dashboard);
    this.cam.linkDashboard(this.dashboard);

    const dark = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.6, metalness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.5 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xbfa86e, emissive: 0x3d2d10, emissiveIntensity: 0.5 });

    // Dashboard panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.22), dark);
    panel.position.y = -0.3;
    this.dashboard.add(panel);

    // Gauge faces
    const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.52, 0.23), glass);
    gauge.position.set(-0.62, -0.3, 0.12);
    this.dashboard.add(gauge);
    const gauge2 = gauge.clone();
    gauge2.position.set(0.62, -0.3, 0.12);
    this.dashboard.add(gauge2);

    // Amber accent strip
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.24), amber);
    strip.position.y = -0.56;
    this.dashboard.add(strip);

    // Steering wheel
    const wheelGeo = new THREE.TorusGeometry(0.44, 0.045, 16, 48);
    wheelGeo.rotateX(Math.PI / 2);
    this.wheelMesh = new THREE.Mesh(wheelGeo, dark);
    this.wheelMesh.position.set(0, -0.62, 0.55);
    this.dashboard.add(this.wheelMesh);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), dark);
    column.position.set(0, -0.95, 0.55);
    this.dashboard.add(column);
  }

  buildMenuStage() {
    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x161a1f, roughness: 0.9, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.sceneMenu.add(floor);

    // Road patch behind the car
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 40),
      new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.95, metalness: 0.15 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(6, 0.03, 2);
    this.sceneMenu.add(road);

    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(6, 0.04, 2);
    this.sceneMenu.add(line);

    // Lights
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 25, 10);
    sun.castShadow = true;
    this.sceneMenu.add(sun);
    this.sceneMenu.add(new THREE.AmbientLight(0xffffff, 0.35));
  }

  // ---------- Input ----------
  bindMenuButtons() {
    const click = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    };
    click('btn-play', () => this.startRun());
    click('btn-resume', () => { if (this.state === 'PAUSED') this.state = 'PLAYING'; });
    click('btn-menu-pause', () => this.goToMenu());
    click('btn-playagain', () => this.startRun());
    click('btn-mainmenu', () => this.goToMenu());
    document.getElementById('sound-toggle').addEventListener('change', (e) => {
      this.audio.setEnabled(e.target.checked);
    });
  }

  requestFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  // ---------- Run lifecycle ----------
  startRun() {
    this.audio.start().then(() => {
      this.audio.setEnabled(document.getElementById('sound-toggle').checked);
    });

    // Reset car
    this.car.group.position.set(0, 0, 10);
    this.car.velocity.set(0, 0, 0);
    this.car.yaw = 0;
    this.car.steerInput = 0;
    this.car.group.rotation.set(0, 0, 0);

    // Reset stats
    this.distance = 0;
    this.score = 0;
    this.nearMisses = 0;
    this.overtakes = 0;
    this.maxSpeed = 0;
    this.speedSum = 0;
    this.speedSamples = 0;
    this.highSpeedTimer = 0;
    this.cleanOvertakeTimer = 0;
    this.gameOverTimer = 0;

    // Traffic ahead of the player
    this.traffic.init(10);

    this.sceneGame.add(this.car.group); // move car from menu scene to game scene

    this.state = 'PLAYING';
    this.hud.playing();
  }

  goToMenu() {
    this.state = 'MENU';
    this.audio.engine(0, 0);
    this.sceneMenu.add(this.car.group);
    this.hud.menu(this.best);
  }

  triggerCrash() {
    if (this.state !== 'PLAYING') return;
    this.state = 'CRASHING';
    this.gameOverTimer = 0.5;
    this.cam.shakeCamera(1.4);
    this.hud.flashCrash();
    this.audio.impact();
  }

  showGameOver() {
    this.state = 'GAMEOVER';
    const avgSpeed = this.speedSamples > 0 ? this.speedSum / this.speedSamples : 0;
    const stats = {
      distance: this.distance,
      maxSpeed: this.maxSpeed,
      avgSpeed,
      overtakes: this.overtakes,
      nearMisses: this.nearMisses,
      score: this.score,
      best: this.best,
    };
    if (this.distance > this.best) {
      this.best = this.distance;
      localStorage.setItem(STORAGE_KEY, Math.floor(this.best));
      stats.best = this.best;
    }
    this.hud.gameOver(stats);
  }

  // ---------- Resize ----------
  onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cam.resize();
    this.menuCamera.aspect = window.innerWidth / window.innerHeight;
    this.menuCamera.updateProjectionMatrix();
  }

  // ---------- Rewards / collisions ----------
  updateRewards(dt, kmh, traffic) {
    const speedMs = this.car.velocity.length();

    // Distance (km)
    this.distance += speedMs * dt / 1000;
    this.score += speedMs * dt * 0.5;

    this.maxSpeed = Math.max(this.maxSpeed, kmh);
    this.speedSum += kmh;
    this.speedSamples++;

    // High speed bonus
    const highSpeedActive = kmh > 100;
    if (highSpeedActive) {
      this.highSpeedTimer += dt;
      while (this.highSpeedTimer >= 1.0) {
        this.highSpeedTimer -= 1.0;
        this.score += 100;
      }
    }

    const playerBox = this.car.getBounds();
    const carPos = this.car.group.position;

    for (const v of traffic.vehicles) {
      // Collision
      if (playerBox.intersectsBox(traffic.vehicleBounds(v))) {
        this.triggerCrash();
        return;
      }

      // Overtake: player was behind, now ahead of the vehicle
      const dz = carPos.z - v.z;
      const vspeedKmh = v.speed * 3.6;
      const overtaking = kmh > vspeedKmh + 8;

      if (!v.passed && dz > 12 && overtaking) {
        v.passed = true;
        this.overtakes++;
        this.score += 150;

        // Clean overtake bonus (not a near miss)
        if (!v.nearMissed) {
          this.cleanOvertakeTimer = 0.8;
          this.score += 60;
        }
      }

      // Near miss: close lateral pass at speed
      const dx = Math.abs(carPos.x - v.mesh.position.x);
      if (!v.nearMissed && dx < 4.2 && dz > 0 && dz < 16 && kmh > vspeedKmh + 6 && kmh > 50) {
        v.nearMissed = true;
        this.nearMisses++;
        this.score += 200;
      }
      if (dz < -20) {
        v.nearMissed = false;
        v.passed = false;
      }
    }

    this.hud.update(this.car, {
      distance: this.distance,
      score: this.score,
      nearMisses: this.nearMisses,
      overtakes: this.overtakes,
      highSpeedActive,
      cleanOvertakeActive: this.cleanOvertakeTimer > 0,
    });

    if (this.cleanOvertakeTimer > 0) this.cleanOvertakeTimer -= dt;
  }

  // ---------- Core update ----------
  update(dt) {
    this.input.tick();

    // Fullscreen
    if (this.input.fullscreen) this.requestFullscreen();

    // Camera toggle
    if (this.input.camera && this.state === 'PLAYING') {
      this.cam.setMode(this.cam.mode === 'chase' ? 'cockpit' : 'chase');
    }

    // Pause toggle
    if (this.input.pause) {
      if (this.state === 'PLAYING') this.state = 'PAUSED';
      else if (this.state === 'PAUSED') this.state = 'PLAYING';
    }

    if (this.state === 'PLAYING') {
      this.car.update(dt, this.input);
      this.world.update(this.car.group.position.z);
      this.traffic.step(dt, this.car.group.position.z);
      this.cam.update(dt, this.car);

      const kmh = this.car.speedKmh;
      const slip = Math.abs(this.input.steer) * Math.min(kmh / 110, 1) * (this.input.handbrake ? 1 : 0.5);
      const rpm = Math.min(kmh / MAX_SPEED_KMH, 1);
      this.audio.engine(rpm, slip, kmh);
      if (this._brakeCooldown > 0) this._brakeCooldown -= dt;
      if (this.input.brake && kmh > 20 && this._brakeCooldown <= 0) {
        this.audio.brake();
        this._brakeCooldown = 0.5;
      }

      this.updateRewards(dt, kmh, this.traffic);
    } else if (this.state === 'PAUSED') {
      this.audio.engine(0, 0);
    } else if (this.state === 'CRASHING') {
      this.gameOverTimer -= dt;
      this.cam.update(dt, this.car);
      if (this.gameOverTimer <= 0) this.showGameOver();
      this.audio.engine(0, 0);
    } else if (this.state === 'MENU') {
      this.audio.engine(0, 0);
      const time = performance.now() * 0.001;
      this.car.group.rotation.y += 0.12 * dt;
      this.car.group.position.y = Math.sin(time * 1.2) * 0.04;
      this.hud.update(this.car, {
        distance: 0, score: 0, nearMisses: 0, overtakes: 0,
        highSpeedActive: false, cleanOvertakeActive: false,
      });
    } else if (this.state === 'GAMEOVER') {
      this.audio.engine(0, 0);
    }

    // Dashboard locked to cockpit camera view
    const camForward = new THREE.Vector3();
    this.cam.camera.getWorldDirection(camForward);
    this.dashboard.position.copy(this.cam.camera.position).addScaledVector(camForward, 0.55);
    this.dashboard.quaternion.copy(this.cam.camera.quaternion);
    if (this.wheelMesh) {
      this.wheelMesh.rotation.z = -this.car.steerInput * 0.6;
    }
  }

  render() {
    if (this.state === 'MENU') {
      this.renderer.render(this.sceneMenu, this.menuCamera);
    } else {
      this.renderer.render(this.sceneGame, this.cam.camera);
    }
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.update(dt);
    this.render();
  }
}

// Start the game
new Game();

/**
 * Traffic Rush — realistic 3D driving game.
 * Three.js renderer, asset loading, state machine, game loop, rewards, collisions.
 */
import * as THREE from 'three';
import { Input } from './input.js';
import { Car } from './car.js';
import { World } from './world.js';
import { Traffic } from './traffic.js';
import { Camera } from './camera.js';
import { Audio } from './audio.js';
import { HUD } from './hud.js';
import { assetLoader } from './assetLoader.js';

const STORAGE_KEY = 'traffic_rush_best';
const MAX_SPEED_KMH = 260;

export class Game {
  constructor() {
    // ---------- Renderer ----------
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Physically based rendering & color management
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    // ---------- Scenes ----------
    this.sceneGame = new THREE.Scene();
    this.sceneGame.background = new THREE.Color(0xb8d4f0);

    this.sceneMenu = new THREE.Scene();
    this.sceneMenu.background = new THREE.Color(0x0b0d10);

    // ---------- Cameras ----------
    this.cam = new Camera();
    this.menuCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 2500);
    this.menuCamera.position.set(0, 6, -14);
    this.menuCamera.lookAt(0, 1.8, 0);

    // ---------- Entities ----------
    this.input = new Input();
    this.audio = new Audio();
    this.car = null;       // created after model loads
    this.world = null;
    this.traffic = null;

    this.hud = new HUD();

    this.buildDashboard();
    this.buildMenuStage();

    // ---------- State ----------
    this.state = 'LOADING'; // LOADING | MENU | PLAYING | PAUSED | CRASHING | GAMEOVER
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
    this.canvas.addEventListener('click', () => this.requestFullscreen());

    // Start loading assets, then show menu
    assetLoader.load().then(() => {
      this._onReady();
    });

    this.loop();
  }

  // ---------- Asset readiness ----------
  _onReady() {
    // Player car from GLB model
    const carMesh = assetLoader.clone('player');
    this.car = new Car(carMesh);
    this.sceneGame.add(carMesh);

    this.world = new World(this.sceneGame);
    this.traffic = new Traffic(this.sceneGame);

    this.state = 'MENU';
    this.hud.menu(this.best);
    document.getElementById('loading').style.display = 'none';
  }

  // ---------- Scenes ----------
  buildDashboard() {
    this.dashboard = new THREE.Group();
    this.sceneGame.add(this.dashboard);
    this.cam.linkDashboard(this.dashboard);

    const dark = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.6, metalness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.5 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xbfa86e, emissive: 0x3d2d10, emissiveIntensity: 0.6 });

    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 0.22), dark);
    panel.position.y = -0.32;
    this.dashboard.add(panel);

    const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.52, 0.23), glass);
    gauge.position.set(-0.66, -0.32, 0.12);
    this.dashboard.add(gauge);
    const gauge2 = gauge.clone();
    gauge2.position.set(0.66, -0.32, 0.12);
    this.dashboard.add(gauge2);

    const strip = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.24), amber);
    strip.position.y = -0.58;
    this.dashboard.add(strip);

    const wheelGeo = new THREE.TorusGeometry(0.46, 0.05, 16, 48);
    wheelGeo.rotateX(Math.PI / 2);
    this.wheelMesh = new THREE.Mesh(wheelGeo, dark);
    this.wheelMesh.position.set(0, -0.66, 0.58);
    this.dashboard.add(this.wheelMesh);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 8), dark);
    column.position.set(0, -1.02, 0.58);
    this.dashboard.add(column);
  }

  buildMenuStage() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.9, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.sceneMenu.add(floor);

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 45),
      new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.95, metalness: 0.1 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(7, 0.03, 0);
    this.sceneMenu.add(road);

    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(7, 0.04, 0);
    this.sceneMenu.add(line);

    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(20, 30, 10);
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

    // Defensive: never start with a missing car mesh
    if (!this.car || !this.car.mesh) {
      console.error('[Game] cannot start run: player car is missing');
      return;
    }

    // Ensure the car mesh is in the game scene (it may have been moved to
    // the menu scene by goToMenu(); an object can only have one parent).
    if (this.car.mesh.parent !== this.sceneGame) {
      this.sceneGame.add(this.car.mesh);
    }

    // Reset car: right-hand player lane, facing +Z (tyres on the road)
    this.car.position.set(7.5, 0.02, 12);
    this.car.velocity.set(0, 0, 0);
    this.car.yaw = 0;
    this.car.steerInput = 0;
    this.car.signedSpeedKmh = 0;
    this.car.mesh.rotation.set(0, 0, 0);
    this.car.mesh.position.copy(this.car.position);

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
    this._brakeCooldown = 0;

    // Traffic ahead
    this.traffic.init(12);

    this.state = 'PLAYING';
    this.hud.playing();
  }

  goToMenu() {
    this.state = 'MENU';
    this.audio.engine(0, 0);
    this.sceneMenu.add(this.car.mesh);
    this.hud.menu(this.best);
  }

  triggerCrash() {
    if (this.state !== 'PLAYING') return;
    this.state = 'CRASHING';
    this.gameOverTimer = 0.5;
    this.cam.shakeCamera(1.5);
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
    const carPos = this.car.position;

    for (const v of traffic.vehicles) {
      // Collision
      if (playerBox.intersectsBox(traffic.vehicleBounds(v))) {
        this.triggerCrash();
        return;
      }

      // Overtake
      const dz = carPos.z - v.z;
      const vspeedKmh = v.speed * 3.6;
      const overtaking = kmh > vspeedKmh + 8;

      if (!v.passed && dz > 14 && overtaking) {
        v.passed = true;
        this.overtakes++;
        this.score += 150;
        if (!v.nearMissed) {
          this.cleanOvertakeTimer = 0.8;
          this.score += 60;
        }
      }

      // Near miss
      const dx = Math.abs(carPos.x - v.vehicle.position.x);
      if (!v.nearMissed && dx < 4.4 && dz > 0 && dz < 18 && kmh > vspeedKmh + 6 && kmh > 50) {
        v.nearMissed = true;
        this.nearMisses++;
        this.score += 200;
      }
      if (dz < -22) {
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

    if (this.input.fullscreen) this.requestFullscreen();

    if (this.state === 'PLAYING') {
      if (this.input.camera) {
        this.cam.setMode(this.cam.mode === 'chase' ? 'cockpit' : 'chase');
      }
      if (this.input.pause) {
        this.state = 'PAUSED';
        this.hud.pause();
      }
    } else if (this.state === 'PAUSED') {
      if (this.input.pause) {
        this.state = 'PLAYING';
        this.hud.playing();
      }
    }

    if (this.state === 'PLAYING') {
      this.car.update(dt, this.input);
      this.world.update(this.car.position.z);
      this.traffic.step(dt, this.car.position.z);
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
      if (this.car) {
        this.car.yaw += 0.12 * dt;
        this.car.mesh.rotation.y = this.car.yaw;
        this.car.mesh.position.y = 0.3 + Math.sin(time * 1.2) * 0.04;
      }
      this.hud.update(this.car, {
        distance: 0, score: 0, nearMisses: 0, overtakes: 0,
        highSpeedActive: false, cleanOvertakeActive: false,
      });
    } else if (this.state === 'GAMEOVER') {
      this.audio.engine(0, 0);
    }

    // Dashboard locked to cockpit camera view
    if (this.dashboard && this.cam.camera) {
      const camForward = new THREE.Vector3();
      this.cam.camera.getWorldDirection(camForward);
      this.dashboard.position.copy(this.cam.camera.position).addScaledVector(camForward, 0.55);
      this.dashboard.quaternion.copy(this.cam.camera.quaternion);
      if (this.wheelMesh) {
        this.wheelMesh.rotation.z = -(this.car ? this.car.steerInput : 0) * 0.6;
      }
    }
  }

  render() {
    if (this.state === 'LOADING' || this.state === 'MENU') {
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

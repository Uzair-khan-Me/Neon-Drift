/**
 * Neon Drift — main entry point.
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

const STORAGE_KEY = 'neon_drift_best';
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
    this.sceneGame.background = new THREE.Color(0x080a12);

    this.sceneMenu = new THREE.Scene();
    this.sceneMenu.background = new THREE.Color(0x06070a);

    // ---------- Cameras ----------
    this.cam = new Camera();
    this.menuCamera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 2000);
    this.menuCamera.position.set(0, 5, -12);
    this.menuCamera.lookAt(0, 1.5, 0);

    // ---------- Entities ----------
    this.input = new Input();
    this.audio = new Audio();
    this.car = new Car();
    this.car.group.position.set(0, 0, 5); // preview framing
    this.sceneMenu.add(this.car.group); // menu preview; moved to sceneGame on start

    // Menu stage: floor + spotlight so the car preview isn't floating in void
    const menuFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.9, metalness: 0.1 })
    );
    menuFloor.rotation.x = -Math.PI / 2;
    menuFloor.position.y = 0;
    menuFloor.receiveShadow = true;
    this.sceneMenu.add(menuFloor);

    const menuLight = new THREE.DirectionalLight(0xffffff, 1);
    menuLight.position.set(12, 16, 8);
    menuLight.castShadow = true;
    menuLight.shadow.mapSize.width = 512;
    menuLight.shadow.mapSize.height = 512;
    this.sceneMenu.add(menuLight);
    this.sceneMenu.add(new THREE.AmbientLight(0xffffff, 0.35));

    this.world = new World(this.sceneGame);
    this.traffic = new Traffic(this.sceneGame);

    this.hud = new HUD();

    // ---------- Cockpit dashboard (locked to camera view) ----------
    this.buildDashboard();

    // ---------- State ----------
    this.state = 'MENU'; // MENU | PLAYING | PAUSED | CRASHING | GAMEOVER
    this.clock = new THREE.Clock();

    // Run stats
    this.distance = 0;
    this.score = 0;
    this.money = 0;
    this.nearMisses = 0;
    this.maxSpeed = 0;
    this.speedSum = 0;
    this.speedSamples = 0;
    this.highSpeedTimer = 0;
    this.highSpeedCount = 0;
    this.wrongWayTimer = 0;
    this.wrongWayCount = 0;
    this.gameOverTimer = 0;

    this.best = Number(localStorage.getItem(STORAGE_KEY) || 0);

    // ---------- Bindings ----------
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);

    this.bindMenuButtons();
    this.lastTime = performance.now();
    this.loop();
  }

  buildDashboard() {
    this.dashboard = new THREE.Group();
    this.sceneGame.add(this.dashboard);
    this.cam.linkDashboard(this.dashboard);

    const dark = new THREE.MeshStandardMaterial({ color: 0x16181f, roughness: 0.6, metalness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x223344, transparent: true, opacity: 0.5 });
    const neon = new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1 });

    // Dashboard panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.25), dark);
    panel.position.y = -0.32;
    this.dashboard.add(panel);

    // Gauge faces
    const gauge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.26), glass);
    gauge.position.set(-0.5, -0.32, 0.14);
    this.dashboard.add(gauge);
    const gauge2 = gauge.clone();
    gauge2.position.set(0.5, -0.32, 0.14);
    this.dashboard.add(gauge2);

    // Steering wheel
    const wheelGeo = new THREE.TorusGeometry(0.42, 0.05, 16, 40);
    wheelGeo.rotateX(Math.PI / 2);
    this.wheelMesh = new THREE.Mesh(wheelGeo, dark);
    this.wheelMesh.position.set(0, -0.62, 0.5);
    this.dashboard.add(this.wheelMesh);

    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), dark);
    column.position.set(0, -0.95, 0.5);
    this.dashboard.add(column);
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
    click('sound-toggle', () => {});
    document.getElementById('sound-toggle').addEventListener('change', (e) => {
      this.audio.setEnabled(e.target.checked);
    });
  }

  // ---------- Run lifecycle ----------
  startRun() {
    this.audio.start();
    this.audio.setEnabled(document.getElementById('sound-toggle').checked);

    // Reset car
    this.car.group.position.set(0, 0, 22);
    this.car.velocity.set(0, 0, 0);
    this.car.yaw = 0;
    this.car.steerInput = 0;
    this.car.group.rotation.set(0, 0, 0);

    // Reset stats
    this.distance = 0;
    this.score = 0;
    this.money = 0;
    this.nearMisses = 0;
    this.maxSpeed = 0;
    this.speedSum = 0;
    this.speedSamples = 0;
    this.highSpeedTimer = 0;
    this.highSpeedCount = 0;
    this.wrongWayTimer = 0;
    this.wrongWayCount = 0;
    this.gameOverTimer = 0;

    // Traffic ahead of the player
    this.traffic.init(22);
    this.sceneGame.add(this.car.group); // move car from menu scene into game scene

    this.state = 'PLAYING';
    this.hud.playing();
  }

  goToMenu() {
    this.state = 'MENU';
    this.audio.engine(0, 0);
    this.sceneMenu.add(this.car.group); // move car back to menu scene
    this.hud.menu(this.best);
  }

  triggerCrash() {
    if (this.state !== 'PLAYING') return;
    this.state = 'CRASHING';
    this.gameOverTimer = 0.5;
    this.cam.shakeCamera(1.6);
    this.hud.flashCrash();
    this.audio.crash();
  }

  showGameOver() {
    this.state = 'GAMEOVER';
    const avgSpeed = this.speedSamples > 0 ? this.speedSum / this.speedSamples : 0;
    const stats = {
      distance: this.distance,
      maxSpeed: this.maxSpeed,
      avgSpeed,
      nearMisses: this.nearMisses,
      score: this.score,
      money: this.money,
      best: this.best,
    };
    // Persist personal best
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

  // ---------- Core update ----------
  updateRewards(dt, kmh, traffic) {
    const speedMs = this.car.velocity.length();

    // Distance & base score (1 point per metre)
    this.distance += speedMs * dt;
    this.score += speedMs * dt * 1.0;
    this.money = Math.floor(this.distance / 10);

    this.maxSpeed = Math.max(this.maxSpeed, kmh);
    this.speedSum += kmh;
    this.speedSamples++;

    // High speed bonus (> 100 km/h)
    const highSpeedActive = kmh > 100;
    if (highSpeedActive) {
      this.highSpeedTimer += dt;
      while (this.highSpeedTimer >= 1.0) {
        this.highSpeedTimer -= 1.0;
        this.highSpeedCount++;
        this.score += 500;
        this.money += 25;
      }
    }

    // Wrong-way bonus: driving on the oncoming side fast, with oncoming traffic near
    const oncomingNear = traffic.vehicles.some((v) =>
      v.lane.dir === -1 &&
      v.z > this.car.group.position.z &&
      v.z - this.car.group.position.z < 30 &&
      Math.abs(v.mesh.position.x - this.car.group.position.x) < 9
    );
    const wrongWayActive = this.car.group.position.x > 3.5 && kmh > 70 && oncomingNear;
    if (wrongWayActive) {
      this.wrongWayTimer += dt;
      while (this.wrongWayTimer >= 0.6) {
        this.wrongWayTimer -= 0.6;
        this.wrongWayCount++;
        this.score += 200;
        this.money += 40;
      }
    }

    // Near misses & collisions
    const playerBox = this.car.getBounds();
    const carPos = this.car.group.position;

    for (const v of traffic.vehicles) {
      // Collision
      if (playerBox.intersectsBox(traffic.vehicleBounds(v))) {
        this.triggerCrash();
        return;
      }

      // Near miss: overtaking closely at speed
      const dx = Math.abs(carPos.x - v.mesh.position.x);
      const dz = carPos.z - v.z; // positive = player ahead of the vehicle
      const vspeedKmh = v.speed * 3.6;
      if (!v.nearMissed && dx < 5.5 && dz > 0 && dz < 14 && kmh > vspeedKmh + 7 && kmh > 50) {
        v.nearMissed = true;
        this.nearMisses++;
        this.score += 250;
        this.money += 25;
      }
      if (dz < -18) v.nearMissed = false; // allow re-award on a later pass
    }

    this.hud.update(this.car, {
      distance: this.distance,
      score: this.score,
      money: this.money,
      nearMisses: this.nearMisses,
      highSpeedActive,
      wrongWayActive,
    });
  }

  update(dt) {
    this.input.tick();

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

      // Engine audio: pitch by rpm, screech when drifting / handbraking
      const slip = Math.abs(this.input.steer) * Math.min(kmh / 110, 1) * (this.input.handbrake ? 1 : 0.5);
      const rpm = Math.min(kmh / MAX_SPEED_KMH, 1);
      this.audio.engine(rpm, slip);

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
      // Animate the menu car preview
      const time = performance.now() * 0.001;
      this.car.group.rotation.y += 0.18 * dt;
      this.car.group.position.y = Math.sin(time * 1.5) * 0.06;
      this.cam.update(dt, this.car); // keep dashboard logic ticking (harmless)
      this.hud.update(this.car, {
        distance: 0, score: 0, money: 0, nearMisses: 0,
        highSpeedActive: false, wrongWayActive: false,
      });
    } else if (this.state === 'GAMEOVER') {
      this.audio.engine(0, 0);
    }

    // Dashboard locked to cockpit camera view
    const camForward = new THREE.Vector3();
    this.cam.camera.getWorldDirection(camForward);
    this.dashboard.position.copy(this.cam.camera.position).addScaledVector(camForward, 0.6);
    this.dashboard.quaternion.copy(this.cam.camera.quaternion);
    if (this.wheelMesh) {
      this.wheelMesh.rotation.z = -this.car.steerInput * 0.7;
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

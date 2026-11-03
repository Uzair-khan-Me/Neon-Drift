/**
 * Input handling — keyboard (desktop) + touch buttons (mobile).
 * Normalizes everything into a small state object consumed by the car physics.
 */
export class Input {
  constructor() {
    this.accel = false;
    this.brake = false;
    this.steer = 0;          // -1 left, 0 center, 1 right
    this.handbrake = false;
    this.camera = false;     // edge-triggered toggle
    this.pause = false;      // edge-triggered toggle

    this._steerLeft = false;
    this._steerRight = false;
    this._cameraEdge = false;
    this._pauseEdge = false;

    this.bindKeyboard();
    this.bindTouch();
  }

  bindKeyboard() {
    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') this.accel = true;
      if (k === 'arrowdown' || k === 's') this.brake = true;
      if (k === 'arrowleft' || k === 'a') { this.steer = -1; this._steerLeft = true; }
      if (k === 'arrowright' || k === 'd') { this.steer = 1; this._steerRight = true; }
      if (k === ' ') { this.handbrake = true; e.preventDefault(); }
      if (k === 'c') { this._cameraEdge = true; }
      if (k === 'escape') { this._pauseEdge = true; }
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') this.accel = false;
      if (k === 'arrowdown' || k === 's') this.brake = false;
      if (k === 'arrowleft' || k === 'a') { this._steerLeft = false; this.recomputeSteer(); }
      if (k === 'arrowright' || k === 'd') { this._steerRight = false; this.recomputeSteer(); }
      if (k === ' ') this.handbrake = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
  }

  recomputeSteer() {
    if (this._steerLeft && this._steerRight) this.steer = 0;
    else if (this._steerLeft) this.steer = -1;
    else if (this._steerRight) this.steer = 1;
    else this.steer = 0;
  }

  bindTouch() {
    // Stop the page from scrolling / zooming while playing
    const viewport = document.getElementById('game-viewport');
    viewport.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    const press = (act) => {
      if (act === 'steerL') { this.steer = -1; this._steerLeft = true; }
      if (act === 'steerR') { this.steer = 1; this._steerRight = true; }
      if (act === 'accel') this.accel = true;
      if (act === 'brake') this.brake = true;
      if (act === 'handbrake') this.handbrake = true;
      if (act === 'camera') { this._cameraEdge = true; }
    };
    const release = (act) => {
      if (act === 'steerL') { this._steerLeft = false; this.recomputeSteer(); }
      if (act === 'steerR') { this._steerRight = false; this.recomputeSteer(); }
      if (act === 'accel') this.accel = false;
      if (act === 'brake') this.brake = false;
      if (act === 'handbrake') this.handbrake = false;
    };

    document.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); press(act); });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); release(act); });
      btn.addEventListener('touchcancel', (e) => { e.preventDefault(); release(act); });
      // mouse fallback for desktop testing
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); press(act); });
      btn.addEventListener('mouseup', (e) => { e.preventDefault(); release(act); });
      btn.addEventListener('mouseleave', (e) => release(act));
    });
  }

  /** Call once per frame to consume edge-triggered inputs. */
  tick() {
    this.camera = this._cameraEdge;
    this._cameraEdge = false;
    this.pause = this._pauseEdge;
    this._pauseEdge = false;
  }
}

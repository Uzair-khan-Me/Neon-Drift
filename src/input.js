/**
 * Input handling — keyboard (desktop), touch buttons (mobile), and gamepad.
 * Normalizes everything into a small state object consumed by the car physics.
 */
export class Input {
  constructor() {
    this.accel = false;
    this.brake = false;
    this.rev = false;          // reverse input (R key / mobile REV button)
    this.steer = 0;            // -1 left, 0 center, 1 right
    this.handbrake = false;
    this.camera = false;       // edge-triggered toggle
    this.pause = false;        // edge-triggered toggle
    this.fullscreen = false;   // edge-triggered toggle

    this._steerLeft = false;
    this._steerRight = false;
    this._cameraEdge = false;
    this._pauseEdge = false;
    this._fullscreenEdge = false;

    this._bound = null;        // stores bound handler references for cleanup
    this._touchBound = false;  // tracks whether touch listeners are attached

    this.bindKeyboard();
    this.bindTouch();
    this.bindGamepad();
  }

  bindKeyboard() {
    if (this._bound) {
      window.removeEventListener('keydown', this._bound.down);
      window.removeEventListener('keyup', this._bound.up);
      window.removeEventListener('blur', this._bound.onBlur);
      window.removeEventListener('focus', this._bound.onFocus);
    }

    const down = (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') this.accel = true;
      if (k === 'arrowdown' || k === 's') this.brake = true;
      if (k === 'r') { this.rev = true; }
      if (k === 'arrowleft' || k === 'a') { this.steer = -1; this._steerLeft = true; }
      if (k === 'arrowright' || k === 'd') { this.steer = 1; this._steerRight = true; }
      if (k === ' ') { this.handbrake = true; e.preventDefault(); }
      if (k === 'c') { this._cameraEdge = true; }
      if (k === 'escape') { this._pauseEdge = true; }
      if (k === 'f11' || k === 'f') { this._fullscreenEdge = true; }
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') this.accel = false;
      if (k === 'arrowdown' || k === 's') this.brake = false;
      if (k === 'r') this.rev = false;
      if (k === 'arrowleft' || k === 'a') { this._steerLeft = false; this.recomputeSteer(); }
      if (k === 'arrowright' || k === 'd') { this._steerRight = false; this.recomputeSteer(); }
      if (k === ' ') this.handbrake = false;
    };
    const onBlur = () => {
      this.accel = false;
      this.brake = false;
      this.rev = false;
      this.handbrake = false;
      this.steer = 0;
      this._steerLeft = false;
      this._steerRight = false;
    };
    const onFocus = () => {
      // Re-sync modifier state on focus; keys physically held are unknown
    };

    this._bound = { down, up, onBlur, onFocus };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
  }

  recomputeSteer() {
    if (this._steerLeft && this._steerRight) this.steer = 0;
    else if (this._steerLeft) this.steer = -1;
    else if (this._steerRight) this.steer = 1;
    else this.steer = 0;
  }

  bindTouch() {
    if (this._touchBound) return;
    this._touchBound = true;

    const viewport = document.getElementById('game-viewport');
    viewport.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    const press = (act) => {
      if (act === 'steerL') { this.steer = -1; this._steerLeft = true; }
      if (act === 'steerR') { this.steer = 1; this._steerRight = true; }
      if (act === 'accel') this.accel = true;
      if (act === 'brake') this.brake = true;
      if (act === 'rev') this.rev = true;
      if (act === 'handbrake') this.handbrake = true;
      if (act === 'camera') { this._cameraEdge = true; }
    };
    const release = (act) => {
      if (act === 'steerL') { this._steerLeft = false; this.recomputeSteer(); }
      if (act === 'steerR') { this._steerRight = false; this.recomputeSteer(); }
      if (act === 'accel') this.accel = false;
      if (act === 'brake') this.brake = false;
      if (act === 'rev') this.rev = false;
      if (act === 'handbrake') this.handbrake = false;
    };

    document.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      const on = (e) => { e.preventDefault(); press(act); };
      const off = (e) => { e.preventDefault(); release(act); };
      btn.addEventListener('touchstart', on, { passive: false });
      btn.addEventListener('touchend', off, { passive: false });
      btn.addEventListener('touchcancel', off, { passive: false });
      btn.addEventListener('pointerup', off, { passive: false });
      btn.addEventListener('pointercancel', off, { passive: false });
      btn.addEventListener('mousedown', on);
      btn.addEventListener('mouseup', off);
      btn.addEventListener('mouseleave', release);
    });
  }

  bindGamepad() {
    // Gamepad is polled in tick(); no listeners needed.
  }

  readGamepad() {
    const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
    if (!gp) return;
    // Left stick horizontal -> steer
    const stick = gp.axes[0];
    if (Math.abs(stick) > 0.2) {
      this.steer = stick;
      if (stick < 0) { this._steerLeft = true; this._steerRight = false; }
      else { this._steerLeft = false; this._steerRight = true; }
    } else {
      this._steerLeft = false;
      this._steerRight = false;
      this.steer = 0;
    }
    // Right trigger (accel) / Left trigger (brake)
    this.accel = gp.axes[5] > 0.3;   // right trigger
    this.brake = gp.axes[4] > 0.3;   // left trigger
    // Buttons
    this.handbrake = gp.buttons[1]?.pressed || gp.buttons[0]?.pressed; // B or A
    if (gp.buttons[1]?.pressed) this._cameraEdge = true; // B -> camera
    if (gp.buttons[9]?.pressed) this._pauseEdge = true;  // Start -> pause
  }

  /** Call once per frame to consume edge-triggered inputs. */
  tick() {
    this.readGamepad();
    this.camera = this._cameraEdge;
    this._cameraEdge = false;
    this.pause = this._pauseEdge;
    this._pauseEdge = false;
    this.fullscreen = this._fullscreenEdge;
    this._fullscreenEdge = false;
  }

  /** Remove all listeners — call before re-initialising or unmounting. */
  destroy() {
    if (this._bound) {
      window.removeEventListener('keydown', this._bound.down);
      window.removeEventListener('keyup', this._bound.up);
      window.removeEventListener('blur', this._bound.onBlur);
      window.removeEventListener('focus', this._bound.onFocus);
      this._bound = null;
    }
    this._touchBound = false;
  }
}

# Neon Drift — 3D Traffic Rush (Playable MVP)

A continuous 3D browser driving game inspired by Traffic Rush Online.
Original implementation — no proprietary assets, logos, or source code.

## Tech
- **Three.js** (3D rendering)
- **JavaScript** (ES modules)
- **HTML5 / CSS3**
- **Vite** (dev server + production build)
- **Web Audio API** (synthesized sound, no audio files)

No backend, database, auth, or paid services. Everything runs in the browser.

## Features
- Continuous simulated driving physics (acceleration, inertia, braking, reverse,
  speed-sensitive steering, drift/oversteer, handbrake, suspension, weight)
- Endless procedurally generated city highway with recycling segments
- Autonomous traffic (same-direction + oncoming), object pooling
- Collision detection, near-miss rewards, high-speed & wrong-way bonuses
- Chase camera and first-person cockpit camera with dashboard & steering wheel
- Desktop (WASD/Arrows, Space, C, ESC) and mobile touch controls
- Driving HUD: speedometer, distance, score, money, near misses, gear
- Game-over screen with stats, personal best (localStorage), instant restart
- Main menu with 3D car preview, best distance, sound toggle

## Run locally

```bash
# install dependencies
npm install

# start dev server (http://localhost:5173)
npm run dev

# production build
npm run build

# preview production build
npm run preview
```

## Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Accelerate | W / Up Arrow | ACCEL button |
| Brake / Reverse | S / Down Arrow | BRAKE button |
| Steer Left | A / Left Arrow | ◀ button |
| Steer Right | D / Right Arrow | ▶ button |
| Handbrake | Space | BRAKE (handbrake) button |
| Switch Camera | C | CAM button |
| Pause | Escape | — |

## Project structure

```
index.html          # entry HTML + UI overlays
style.css           # all styles
vite.config.js      # vite config
package.json
src/
  main.js           # entry, renderer, state machine, game loop
  car.js            # car visuals + driving physics
  world.js          # endless road + environment segments
  traffic.js        # autonomous traffic system
  camera.js         # chase + cockpit cameras
  input.js          # keyboard + touch input
  audio.js          # synthesized engine / tire / crash audio
  hud.js            # HUD, menus, game-over screen
```

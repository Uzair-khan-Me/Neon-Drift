# Traffic Rush — Realistic 3D Driving

A premium, immersive, realistic 3D browser driving game built with **Three.js**
and **Vite**. Original implementation — no proprietary assets, logos, or source
code. Inspired by the core gameplay of Traffic Rush, with its own identity,
vehicles, environment, and interface.

No backend, database, authentication, or paid services. Everything runs
directly in the browser.

## Visual direction

Realistic modern automotive simulator aesthetic:

- Natural colour palette (asphalt grey, concrete, charcoal, off-white, warm
  amber accents) — no neon, no cyberpunk, no glowing roads.
- Physically based rendering, natural sunlight, soft shadows, atmospheric fog.
- Detailed player vehicle (modern luxury sports sedan) with rotating wheels,
  steering front wheels, brake lights, headlights and a visible interior.
- Real traffic fleet: sedans, SUVs, hatchbacks, taxis, police cars, vans — all
  real 3D models, not boxes.
- Endless recycled highway with textured asphalt, lane markings, concrete
  barriers, guardrails, streetlights, road signs, buildings, trees and terrain
  across several environment zones.

## Features

- Continuous delta-time driving physics: acceleration, engine RPM / gears,
  progressive braking & reverse, speed-sensitive steering, steering return,
  weight & momentum, body roll/pitch, suspension, lateral grip (understeer /
  controlled oversteer), handbrake, collision detection.
- Chase camera and first-person cockpit camera (dashboard, steering wheel,
  windshield view), smooth switching with **C**.
- Autonomous traffic with lane discipline, safe spacing, despawn/respawn.
- Distance, overtakes, near-misses, high-speed and clean-overtake scoring.
- Premium minimal HUD (animated speedometer, distance, score, overtakes, near
  misses, gear), main menu, pause, game-over with stats, personal best saved
  to localStorage, instant restart.
- Desktop (WASD / arrows, Space handbrake, C camera, ESC pause, F11 fullscreen),
  mobile touch controls, and gamepad support.
- Synthesised Web Audio (engine, tyre-road, screech, brake, impact, wind) — no
  audio files.

## Tech stack

- Three.js (3D rendering, PBR, shadows)
- JavaScript (ES modules)
- HTML5 / CSS3
- Vite (dev server + production build)
- Web Audio API (synthesised sound)

## Third-party assets (stored locally, see CREDITS.txt)

- `public/models/sedan-original.glb` — CC0 1.0 (Innerscene 3D Parts Library)
- `public/models/suv.glb`, `hatchback-sports.glb`, `taxi.glb`, `police.glb`,
  `delivery.glb` — RaymondTmD/Car-Models (attributed)
- `public/models/Textures/colormap.png` — bundled with the RaymondTmD models
- Three.js (MIT), Vite (MIT)

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
| Handbrake | Space | HANDBRAKE button |
| Switch Camera | C | CAM button |
| Pause | Escape | — |
| Fullscreen | F11 / click canvas | — |

## Project structure

```
index.html          # entry HTML + UI overlays
style.css           # premium automotive UI
vite.config.js      # vite config
package.json
CREDITS.txt         # third-party asset licences
README.md
public/
  models/           # GLB vehicle models + textures (copied to dist)
src/
  main.js           # entry, renderer, state machine, game loop
  assetLoader.js    # GLB model loading + model orientation
  vehicle.js        # base vehicle (wheels, steering, bounds)
  car.js            # player car + driving physics
  traffic.js        # autonomous traffic (real models)
  world.js          # road, environment, lighting
  camera.js         # chase + cockpit cameras
  audio.js          # synthesised engine / tyre / impact audio
  hud.js            # HUD, menus, game-over screen
```

## Definition of done

Open the site → sophisticated menu with a realistic car → PLAY → continuous
3D road with real traffic → accelerate, steer, brake, reverse → overtake &
near-misses → chase / cockpit cameras → HUD updates live → crash → results
screen with accurate stats → RESTART runs immediately → personal best persists
after refresh.

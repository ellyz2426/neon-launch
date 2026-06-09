# Neon Launch VR

A rocket launch simulation game built with IWSDK (Immersive Web SDK) for VR and browser play. Control a multi-stage rocket through atmospheric flight to orbital insertion, navigating weather systems, orbital debris, and re-entry physics.

## Play

**Live:** [https://ellyz2426.github.io/neon-launch/](https://ellyz2426.github.io/neon-launch/)

## Controls

### Browser
- **W/S or Up/Down** — Throttle up/down
- **A/D or Left/Right** — Adjust trajectory angle
- **Space** — Stage separation
- **ESC/P** — Abort mission

### VR (Quest)
- **Right Thumbstick Y** — Throttle control
- **Right Thumbstick X** — Angle control
- **A Button** — Stage separation
- **B Button** — Abort mission

## Features

### Flight Physics
- Atmospheric drag with exponential density model
- Inverse-square gravity
- Throttle and fuel management with 3 fuel types (Standard, High Thrust, Efficient)
- 2 or 3 stage rockets with mass reduction on separation
- Dynamic pressure (Max-Q) tracking
- Weather system affecting drag, turbulence, headwind, and visibility

### Missions (19)

| Mission | Target | Difficulty |
|---------|--------|------------|
| Low Orbit | 200 km | Easy |
| Medium Orbit | 400 km | Easy |
| High Orbit | 800 km | Medium |
| GEO Transfer | 2000 km | Medium |
| Deep Space | 5000 km | Hard |
| Crew Delivery | 400 km | Medium |
| Station Module | 600 km | Hard |
| Escape Velocity | 10000 km | Expert |
| Daily Mission | Random (seeded) | Daily |
| Polar Orbit | 500 km | Medium |
| Lunar Transfer | 15000 km | Expert |
| Speed Run | 300 km in <60s | Medium |
| Fuel Challenge | 400 km, 50%+ fuel | Hard |
| Heavy Launch | 300 km, heavy payload | Hard |
| Re-entry Run | Survive atmospheric re-entry | Expert |
| Micro-G Lab | 250 km | Easy |
| Debris Dodge | 350 km through Kessler debris | Medium |
| Rescue Mission | 420 km emergency crew | Hard |
| Mars Transfer | 25000 km | Expert |

Plus a **Custom Mission Creator** with adjustable altitude and payload.

### Content
- **78 achievements** with localStorage persistence
- **16 rocket skins** with gameplay-gated unlocks
- **12 arena themes** with full environment theming
- **3 difficulty levels** (Easy ×0.7 / Medium ×1.0 / Hard ×1.5 score multiplier)
- **5 weather conditions** (Clear → Hurricane)
- **XP/Level progression** — 50 levels, 20 rank titles
- **Career mode** with sequential mission unlocks
- **Daily challenges** with seeded PRNG
- **Score grading system** (S/A/B/C/D/F)
- **Leaderboard** with last 20 runs

### Gameplay Systems
- **Stage separation** with animated debris and camera shake
- **Orbital debris field** for Debris Dodge mission (20 Kenney meteor models, collision + near-miss detection)
- **Re-entry physics** — heat, shield HP, temperature simulation
- **Mission control callouts** (12 triggers)
- **Tutorial mode** (6-step guided first launch)
- **Orbit visualization** with target ring
- **Telemetry HUD** — G-force, dynamic pressure, drag, atmospheric density, thrust, wind
- **Altimeter** with 9 altitude milestone zones
- **Camera shake** during Max-Q and high thrust
- **Speed lines** at high velocity
- **Starfield** (200 stars) + dynamic sky darkening with altitude

### Visuals & Audio
- **153 Kenney Space Kit GLB models** — modular rocket assembly (top/sides/fins/fuel/base) + full launch environment (platform, hangars, structures, satellite dishes, rocks, craters, pipes, terrain, barrels, generator)
- **Box3-based rocket stacking** — measure-then-place assembly of Kenney parts
- **Procedural Web Audio** — 15+ SFX (ignition, thrust, separation, explosion, orbit, warning, countdown, achievement, etc.) + ambient drone + procedural arpeggiator music overlay
- **Particle system** (150-particle pool) with exhaust, separation, and collision effects
- **Trail renderer** for flight path visualization
- **Holodeck aesthetic** — wireframe grid, floating geometric decorations, ambient particles, neon tint system

### UI
- **24 PanelUI spatial panels** — zero HTML DOM
- **ScreenSpace browser-mode UI** with dynamic add/remove for 7 HUD panels
- All panels use `.uikitml` templates compiled by `@iwsdk/vite-plugin-uikitml`
- Menus: Title, Modes, Difficulty, Gameover, Achievements, Stats, Settings, Help, Skins, Weather, Career, Leaderboard, Custom Mission, Pause
- HUDs: Flight HUD, Throttle, Telemetry, Altimeter, Countdown, Toast, Callout, Tutorial, Orbit Info, Re-entry

## Tech

- **IWSDK 0.4.1+** (Three.js / super-three + ECS)
- TypeScript, Vite 7
- 25 source files (1 TS + 24 uikitml templates)
- Dual runtime: VR + Browser (`xr: { offer: 'once' }`)
- Holodeck environment with 153 Kenney Space Kit 3D models
- All imports from `@iwsdk/core` — no direct `three` imports
- ECS Systems: `GameLoopSystem`, `UISystem`
- AssetManager-based GLB preloading (30 models)

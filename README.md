# Neon Launch VR

A rocket launch simulation game built with IWSDK (Immersive Web SDK) for VR and browser play. Control a multi-stage rocket through atmospheric flight to orbital insertion.

## Play

**Live:** [https://ellyz2426.github.io/neon-launch/](https://ellyz2426.github.io/neon-launch/)

## Controls

### Browser
- **W/S or Up/Down** - Throttle up/down
- **A/D or Left/Right** - Adjust trajectory angle
- **Space** - Stage separation
- **ESC/P** - Abort mission

### VR (Quest)
- **Right Thumbstick Y** - Throttle control
- **Right Thumbstick X** - Angle control
- **A Button** - Stage separation
- **B Button** - Abort mission

## Missions

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
| Daily Mission | Random | Daily |

## Features

- **Flight Physics**: Realistic atmospheric drag, inverse-square gravity, throttle/fuel management
- **Stage Separation**: 2 or 3 stage rockets with mass reduction and fuel refill on separation
- **Fuel Types**: Standard, High Thrust (more power, faster burn), Efficient (less power, slower burn)
- **30 Achievements**: Altitude milestones, perfect launches, fuel efficiency, daily streaks
- **8 Rocket Skins**: Unlock through gameplay milestones
- **5 Arena Themes**: Neon Holodeck, Crimson Pad, Toxic Launch, Ultra Violet, Solar Blaze
- **XP/Level Progression**: 50 levels with 20 rank titles
- **Daily Missions**: Date-seeded random targets
- **All UI via PanelUI**: 15 spatial UI templates, zero HTML DOM

## Tech

- IWSDK 0.4.1+ (Three.js / super-three + ECS)
- TypeScript, Vite 7
- 1 source file + 15 uikitml templates
- Dual runtime: VR + Browser
- Procedural audio (Web Audio API): 15+ SFX + ambient drone
- Holodeck environment with neon wireframe aesthetics

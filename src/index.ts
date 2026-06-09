import {
  World,
  createSystem,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  eq,
  Mesh,
  Group,
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  ConeGeometry,
  TorusGeometry,
  PlaneGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  LineBasicMaterial,
  Color,
  Vector3,
  Fog,
  AmbientLight,
  PointLight,
  DirectionalLight,
  EdgesGeometry,
  LineSegments,
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  InputComponent,
  Follower,
  FollowBehavior,
} from '@iwsdk/core';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type GameState = 'title' | 'config' | 'preflight' | 'countdown' | 'flying' | 'orbit' | 'gameover' | 'achievements' | 'stats' | 'settings' | 'help' | 'skins' | 'modes' | 'difficulty';

interface RocketConfig {
  stages: number; // 2 or 3
  payload: string; // 'satellite' | 'probe' | 'crew' | 'station'
  fuelType: string; // 'standard' | 'high-thrust' | 'efficient'
}

interface FlightData {
  altitude: number; // meters
  velocity: number; // m/s
  acceleration: number; // m/s^2
  fuel: number; // 0-100%
  angle: number; // degrees from vertical
  stage: number; // current stage
  maxStages: number;
  throttle: number; // 0-100%
  apoapsis: number; // target orbit altitude
  periapsis: number; // current min orbit alt
  missionTime: number;
  maxAltitude: number;
  maxVelocity: number;
  score: number;
  stageSeparations: number;
  orbitalVelocity: number; // m/s needed for orbit
  dragCoeff: number;
  thrust: number;
  mass: number;
  gravity: number;
}

interface Mission {
  name: string;
  target: number; // target altitude km
  payload: string;
  difficulty: string;
  description: string;
}

interface Achievement {
  id: string;
  name: string;
  desc: string;
  unlocked: boolean;
}

interface RocketSkin {
  name: string;
  body: string;
  accent: string;
  flame: string;
  unlockCondition: string;
  unlocked: boolean;
}

interface ArenaTheme {
  name: string;
  grid: string;
  accent: string;
  bg: string;
  fog: string;
  wall: string;
  sky: string;
  glow: string;
}

// ============================================================================
// GAME STATE MANAGER
// ============================================================================

const MISSIONS: Mission[] = [
  { name: 'Low Orbit', target: 200, payload: 'satellite', difficulty: 'Easy', description: 'Reach 200km LEO' },
  { name: 'Medium Orbit', target: 400, payload: 'probe', difficulty: 'Easy', description: 'Reach 400km orbit' },
  { name: 'High Orbit', target: 800, payload: 'satellite', difficulty: 'Medium', description: 'Reach 800km orbit' },
  { name: 'GEO Transfer', target: 2000, payload: 'satellite', difficulty: 'Medium', description: 'Reach geostationary transfer' },
  { name: 'Deep Space', target: 5000, payload: 'probe', difficulty: 'Hard', description: 'Escape low orbit to 5000km' },
  { name: 'Crew Delivery', target: 400, payload: 'crew', difficulty: 'Medium', description: 'Deliver crew to ISS orbit safely' },
  { name: 'Station Module', target: 600, payload: 'station', difficulty: 'Hard', description: 'Heavy payload to 600km' },
  { name: 'Escape Velocity', target: 10000, payload: 'probe', difficulty: 'Expert', description: 'Reach escape velocity' },
  { name: 'Daily Mission', target: 0, payload: 'satellite', difficulty: 'Daily', description: 'Daily challenge - seeded' },
];

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_launch', name: 'Liftoff!', desc: 'Complete your first launch', unlocked: false },
  { id: 'orbit_100', name: 'Suborbital', desc: 'Reach 100km altitude', unlocked: false },
  { id: 'orbit_200', name: 'Low Orbit', desc: 'Reach 200km orbit', unlocked: false },
  { id: 'orbit_400', name: 'Station Orbit', desc: 'Reach 400km orbit', unlocked: false },
  { id: 'orbit_800', name: 'High Orbit', desc: 'Reach 800km orbit', unlocked: false },
  { id: 'orbit_2000', name: 'GEO Transfer', desc: 'Reach 2000km altitude', unlocked: false },
  { id: 'orbit_5000', name: 'Deep Space', desc: 'Reach 5000km altitude', unlocked: false },
  { id: 'orbit_10000', name: 'Escape!', desc: 'Reach escape velocity', unlocked: false },
  { id: 'perfect_launch', name: 'Perfect Launch', desc: 'Score 10000+ on a mission', unlocked: false },
  { id: 'fuel_saver', name: 'Fuel Saver', desc: 'Complete orbit with 20%+ fuel', unlocked: false },
  { id: 'speed_demon', name: 'Speed Demon', desc: 'Reach 8000 m/s velocity', unlocked: false },
  { id: 'stage_master', name: 'Stage Master', desc: 'Perform 3-stage separation', unlocked: false },
  { id: 'smooth_pilot', name: 'Smooth Pilot', desc: 'Keep angle under 10 degrees', unlocked: false },
  { id: 'ten_launches', name: 'Veteran', desc: 'Complete 10 launches', unlocked: false },
  { id: 'fifty_launches', name: 'Commander', desc: 'Complete 50 launches', unlocked: false },
  { id: 'daily_done', name: 'Daily Pilot', desc: 'Complete a daily mission', unlocked: false },
  { id: 'daily_streak_3', name: 'Streak x3', desc: '3-day daily streak', unlocked: false },
  { id: 'daily_streak_7', name: 'Streak x7', desc: '7-day daily streak', unlocked: false },
  { id: 'all_missions', name: 'Mission Master', desc: 'Complete all 8 missions', unlocked: false },
  { id: 'crew_safe', name: 'Safe Landing', desc: 'Crew mission under 3g max', unlocked: false },
  { id: 'heavy_lifter', name: 'Heavy Lifter', desc: 'Complete station module mission', unlocked: false },
  { id: 'throttle_master', name: 'Throttle Master', desc: 'Use throttle control to orbit', unlocked: false },
  { id: 'gravity_turn', name: 'Gravity Turn', desc: 'Optimal trajectory (angle 40-50 at 100km)', unlocked: false },
  { id: 'no_abort', name: 'Never Quit', desc: 'Complete 5 missions without abort', unlocked: false },
  { id: 'skin_unlock', name: 'Fashionista', desc: 'Unlock a rocket skin', unlocked: false },
  { id: 'theme_explorer', name: 'Explorer', desc: 'Try all arena themes', unlocked: false },
  { id: 'level_10', name: 'Cadet', desc: 'Reach level 10', unlocked: false },
  { id: 'level_25', name: 'Captain', desc: 'Reach level 25', unlocked: false },
  { id: 'level_50', name: 'Admiral', desc: 'Reach level 50', unlocked: false },
  { id: 'max_throttle', name: 'Full Burn', desc: 'Launch at 100% throttle', unlocked: false },
];

const ROCKET_SKINS: RocketSkin[] = [
  { name: 'Neon White', body: '#e0e0ff', accent: '#00ffff', flame: '#00ccff', unlockCondition: 'Default', unlocked: true },
  { name: 'Solar Flare', body: '#ff6600', accent: '#ffcc00', flame: '#ff3300', unlockCondition: '10 launches', unlocked: false },
  { name: 'Frost Core', body: '#aaddff', accent: '#4499ff', flame: '#2277ff', unlockCondition: '5000km altitude', unlocked: false },
  { name: 'Plasma Pink', body: '#ff66cc', accent: '#ff00ff', flame: '#cc00ff', unlockCondition: '5000 score', unlocked: false },
  { name: 'Toxic Green', body: '#66ff66', accent: '#00ff00', flame: '#33cc00', unlockCondition: 'All missions', unlocked: false },
  { name: 'Void Purple', body: '#9966ff', accent: '#6600ff', flame: '#4400cc', unlockCondition: 'Level 25', unlocked: false },
  { name: 'Chrome Silver', body: '#cccccc', accent: '#ffffff', flame: '#aaaaff', unlockCondition: 'Fuel saver', unlocked: false },
  { name: 'Inferno Red', body: '#ff3333', accent: '#ff0000', flame: '#ff6600', unlockCondition: 'Escape velocity', unlocked: false },
];

const ARENA_THEMES: ArenaTheme[] = [
  { name: 'Neon Holodeck', grid: '#00ffff', accent: '#00ffff', bg: '#050510', fog: '#050510', wall: '#001a2a', sky: '#000822', glow: '#00ffff' },
  { name: 'Crimson Pad', grid: '#ff3333', accent: '#ff4444', bg: '#100505', fog: '#100505', wall: '#2a0000', sky: '#220000', glow: '#ff3333' },
  { name: 'Toxic Launch', grid: '#33ff33', accent: '#44ff44', bg: '#051005', fog: '#051005', wall: '#002a00', sky: '#002200', glow: '#33ff33' },
  { name: 'Ultra Violet', grid: '#9933ff', accent: '#aa44ff', bg: '#0a0510', fog: '#0a0510', wall: '#1a002a', sky: '#110022', glow: '#9933ff' },
  { name: 'Solar Blaze', grid: '#ff9933', accent: '#ffaa44', bg: '#100a05', fog: '#100a05', wall: '#2a1500', sky: '#221100', glow: '#ff9933' },
];

const LEVEL_TITLES = [
  'Cadet', 'Trainee', 'Rookie', 'Pilot', 'Navigator',
  'Engineer', 'Specialist', 'Officer', 'Captain', 'Commander',
  'Ace', 'Elite', 'Veteran', 'Expert', 'Master',
  'Champion', 'Legend', 'Hero', 'Titan', 'NEON GOD',
];

class GameStateManager {
  state: GameState = 'title';
  flight: FlightData;
  config: RocketConfig;
  currentMission: Mission;
  missionIndex = 0;
  achievements: Achievement[];
  skins: RocketSkin[];
  themes: ArenaTheme[];
  currentThemeIndex = 0;
  currentSkinIndex = 0;
  level = 1;
  xp = 0;
  totalLaunches = 0;
  totalScore = 0;
  bestScore = 0;
  bestAltitude = 0;
  totalMissionsDone = 0;
  missionsCompleted: Set<string> = new Set();
  consecutiveNoAbort = 0;
  dailyStreak = 0;
  lastDailyDate = '';
  themesUsed: Set<string> = new Set();
  maxG = 0;
  smoothAngle = true;
  difficulty = 1; // 0=easy, 1=medium, 2=hard

  constructor() {
    this.config = { stages: 2, payload: 'satellite', fuelType: 'standard' };
    this.currentMission = MISSIONS[0];
    this.achievements = ACHIEVEMENTS.map(a => ({ ...a }));
    this.skins = ROCKET_SKINS.map(s => ({ ...s }));
    this.themes = ARENA_THEMES;
    this.flight = this.resetFlight();
    this.load();
  }

  resetFlight(): FlightData {
    const stages = this.config?.stages ?? 2;
    const payloadMass = this.config?.payload === 'station' ? 50 : this.config?.payload === 'crew' ? 30 : 10;
    const baseMass = stages === 3 ? 500 : 350;
    const fuelMult = this.config?.fuelType === 'high-thrust' ? 1.3 : this.config?.fuelType === 'efficient' ? 0.8 : 1.0;
    const thrustMult = this.config?.fuelType === 'high-thrust' ? 1.4 : this.config?.fuelType === 'efficient' ? 0.9 : 1.0;

    return {
      altitude: 0,
      velocity: 0,
      acceleration: 0,
      fuel: 100,
      angle: 0,
      stage: 1,
      maxStages: stages,
      throttle: 80,
      apoapsis: this.currentMission?.target ?? 200,
      periapsis: 0,
      missionTime: 0,
      maxAltitude: 0,
      maxVelocity: 0,
      score: 0,
      stageSeparations: 0,
      orbitalVelocity: 7800, // ~LEO orbital velocity
      dragCoeff: 0.3,
      thrust: 2000 * thrustMult,
      mass: (baseMass + payloadMass) * fuelMult,
      gravity: 9.81,
    };
  }

  xpForLevel(lv: number): number { return 100 + 50 * lv; }

  addXP(amount: number) {
    this.xp += amount;
    while (this.xp >= this.xpForLevel(this.level) && this.level < 50) {
      this.xp -= this.xpForLevel(this.level);
      this.level++;
    }
  }

  getLevelTitle(): string {
    return LEVEL_TITLES[Math.min(Math.floor((this.level - 1) / 2.5), LEVEL_TITLES.length - 1)];
  }

  checkAchievements(): string[] {
    const unlocked: string[] = [];
    const check = (id: string, cond: boolean) => {
      const a = this.achievements.find(x => x.id === id);
      if (a && !a.unlocked && cond) { a.unlocked = true; unlocked.push(a.name); }
    };
    const f = this.flight;
    check('first_launch', this.totalLaunches >= 1);
    check('orbit_100', f.maxAltitude >= 100000);
    check('orbit_200', f.maxAltitude >= 200000);
    check('orbit_400', f.maxAltitude >= 400000);
    check('orbit_800', f.maxAltitude >= 800000);
    check('orbit_2000', f.maxAltitude >= 2000000);
    check('orbit_5000', f.maxAltitude >= 5000000);
    check('orbit_10000', f.maxAltitude >= 10000000);
    check('perfect_launch', f.score >= 10000);
    check('fuel_saver', f.fuel >= 20 && f.altitude >= this.currentMission.target * 1000);
    check('speed_demon', f.maxVelocity >= 8000);
    check('stage_master', f.stageSeparations >= 2);
    check('smooth_pilot', this.smoothAngle);
    check('ten_launches', this.totalLaunches >= 10);
    check('fifty_launches', this.totalLaunches >= 50);
    check('daily_done', this.currentMission.difficulty === 'Daily');
    check('daily_streak_3', this.dailyStreak >= 3);
    check('daily_streak_7', this.dailyStreak >= 7);
    check('all_missions', this.missionsCompleted.size >= 8);
    check('crew_safe', this.currentMission.payload === 'crew' && this.maxG <= 3);
    check('heavy_lifter', this.currentMission.payload === 'station' && f.altitude >= this.currentMission.target * 1000);
    check('throttle_master', f.throttle < 100 && f.altitude >= this.currentMission.target * 1000);
    check('gravity_turn', f.altitude >= 100000 && f.angle >= 40 && f.angle <= 50);
    check('no_abort', this.consecutiveNoAbort >= 5);
    check('skin_unlock', this.skins.filter(s => s.unlocked).length > 1);
    check('theme_explorer', this.themesUsed.size >= 5);
    check('level_10', this.level >= 10);
    check('level_25', this.level >= 25);
    check('level_50', this.level >= 50);
    check('max_throttle', f.throttle >= 100);
    return unlocked;
  }

  checkSkinUnlocks() {
    this.skins[1].unlocked = this.totalLaunches >= 10;
    this.skins[2].unlocked = this.bestAltitude >= 5000000;
    this.skins[3].unlocked = this.bestScore >= 5000;
    this.skins[4].unlocked = this.missionsCompleted.size >= 8;
    this.skins[5].unlocked = this.level >= 25;
    this.skins[6].unlocked = this.achievements.find(a => a.id === 'fuel_saver')?.unlocked ?? false;
    this.skins[7].unlocked = this.bestAltitude >= 10000000;
  }

  save() {
    const data = {
      level: this.level, xp: this.xp, totalLaunches: this.totalLaunches,
      totalScore: this.totalScore, bestScore: this.bestScore, bestAltitude: this.bestAltitude,
      totalMissionsDone: this.totalMissionsDone, missionsCompleted: [...this.missionsCompleted],
      consecutiveNoAbort: this.consecutiveNoAbort, dailyStreak: this.dailyStreak,
      lastDailyDate: this.lastDailyDate, themesUsed: [...this.themesUsed],
      currentThemeIndex: this.currentThemeIndex, currentSkinIndex: this.currentSkinIndex,
      achievements: this.achievements.filter(a => a.unlocked).map(a => a.id),
      difficulty: this.difficulty,
    };
    try { localStorage.setItem('neon-launch-save', JSON.stringify(data)); } catch {}
  }

  load() {
    try {
      const raw = localStorage.getItem('neon-launch-save');
      if (!raw) return;
      const d = JSON.parse(raw);
      this.level = d.level ?? 1; this.xp = d.xp ?? 0;
      this.totalLaunches = d.totalLaunches ?? 0; this.totalScore = d.totalScore ?? 0;
      this.bestScore = d.bestScore ?? 0; this.bestAltitude = d.bestAltitude ?? 0;
      this.totalMissionsDone = d.totalMissionsDone ?? 0;
      this.missionsCompleted = new Set(d.missionsCompleted ?? []);
      this.consecutiveNoAbort = d.consecutiveNoAbort ?? 0;
      this.dailyStreak = d.dailyStreak ?? 0; this.lastDailyDate = d.lastDailyDate ?? '';
      this.themesUsed = new Set(d.themesUsed ?? []);
      this.currentThemeIndex = d.currentThemeIndex ?? 0;
      this.currentSkinIndex = d.currentSkinIndex ?? 0;
      this.difficulty = d.difficulty ?? 1;
      if (d.achievements) {
        for (const id of d.achievements) {
          const a = this.achievements.find(x => x.id === id);
          if (a) a.unlocked = true;
        }
      }
      this.checkSkinUnlocks();
    } catch {}
  }
}

// ============================================================================
// AUDIO MANAGER
// ============================================================================

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  masterVol = 0.7;
  sfxVol = 0.8;
  musicVol = 0.5;
  private droneOscs: OscillatorNode[] = [];
  private musicPlaying = false;

  private ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.masterVol;
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.masterGain);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.masterGain);
  }

  setMasterVol(v: number) { this.masterVol = v; if (this.masterGain) this.masterGain.gain.value = v; }
  setSfxVol(v: number) { this.sfxVol = v; if (this.sfxGain) this.sfxGain.gain.value = v; }
  setMusicVol(v: number) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.value = v; }

  playSfx(type: string, pitch = 1) {
    this.ensure();
    if (!this.ctx || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const variation = 0.95 + Math.random() * 0.1;
    const p = pitch * variation;

    const osc = (waveform: OscillatorType, freq: number, dur: number, vol = 0.3) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = waveform; o.frequency.value = freq * p;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.sfxGain!);
      o.start(t); o.stop(t + dur);
    };

    switch (type) {
      case 'ignition': osc('sawtooth', 80, 1.5, 0.4); osc('square', 120, 1.2, 0.2); osc('triangle', 40, 2, 0.3); break;
      case 'thrust': osc('sawtooth', 60 + Math.random() * 20, 0.3, 0.15); osc('square', 100, 0.2, 0.1); break;
      case 'separation': osc('sine', 880, 0.3, 0.4); osc('triangle', 660, 0.2, 0.3); osc('square', 440, 0.15, 0.2); break;
      case 'explosion': osc('sawtooth', 40, 0.8, 0.5); osc('square', 60, 0.6, 0.4); break;
      case 'orbit': {
        for (let i = 0; i < 5; i++) osc('sine', 440 * Math.pow(1.2, i), 0.3, 0.3);
        break;
      }
      case 'warning': osc('square', 440, 0.15, 0.4); osc('square', 330, 0.15, 0.3); break;
      case 'click': osc('sine', 800, 0.05, 0.2); osc('sine', 1200, 0.03, 0.15); break;
      case 'countdown': osc('sine', 660, 0.15, 0.3); break;
      case 'go': osc('sine', 880, 0.3, 0.4); osc('sine', 1100, 0.2, 0.3); break;
      case 'achievement': {
        for (let i = 0; i < 5; i++) osc('sine', 523 * Math.pow(1.25, i), 0.15, 0.25);
        break;
      }
      case 'throttle': osc('triangle', 200 + pitch * 400, 0.1, 0.15); break;
      case 'abort': osc('sawtooth', 200, 0.5, 0.4); osc('sawtooth', 150, 0.4, 0.3); break;
      case 'levelup': {
        for (let i = 0; i < 6; i++) osc('sine', 440 * Math.pow(1.15, i), 0.2, 0.3);
        break;
      }
      case 'gameStart': {
        for (let i = 0; i < 4; i++) osc('triangle', 330 * Math.pow(1.33, i), 0.15, 0.25);
        break;
      }
      case 'gameOver': {
        for (let i = 0; i < 4; i++) osc('triangle', 660 / Math.pow(1.33, i), 0.2, 0.25);
        break;
      }
    }
  }

  startMusic() {
    if (this.musicPlaying) return;
    this.ensure();
    if (!this.ctx || !this.musicGain) return;
    this.musicPlaying = true;
    const t = this.ctx.currentTime;
    const mkOsc = (type: OscillatorType, freq: number, vol: number): OscillatorNode => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      const lfo = this.ctx!.createOscillator();
      const lfoG = this.ctx!.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = vol;
      lfo.type = 'sine'; lfo.frequency.value = 0.15;
      lfoG.gain.value = vol * 0.3;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      o.connect(g); g.connect(this.musicGain!);
      o.start(t); lfo.start(t);
      this.droneOscs.push(o, lfo);
      return o;
    };
    mkOsc('sine', 55, 0.12);
    mkOsc('triangle', 82.5, 0.08);
    mkOsc('sine', 110, 0.06);
    mkOsc('sine', 220, 0.03);
  }

  stopMusic() {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    for (const o of this.droneOscs) { try { o.stop(); } catch {} }
    this.droneOscs = [];
  }
}

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

interface Particle {
  mesh: Mesh;
  vx: number; vy: number; vz: number;
  life: number; maxLife: number;
  active: boolean;
}

class ParticlePool {
  particles: Particle[] = [];
  group: Group;

  constructor(count: number) {
    this.group = new Group();
    const geo = new SphereGeometry(0.015, 4, 4);
    for (let i = 0; i < count; i++) {
      const mat = new MeshBasicMaterial({ color: 0x00ffff, transparent: true, blending: AdditiveBlending });
      const mesh = new Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, active: false });
    }
  }

  burst(x: number, y: number, z: number, count: number, color: string, speed = 2, life = 0.8) {
    let spawned = 0;
    for (const p of this.particles) {
      if (p.active || spawned >= count) continue;
      p.mesh.position.set(x, y, z);
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      p.vx = Math.cos(a) * Math.cos(b) * speed * (0.5 + Math.random());
      p.vy = Math.sin(b) * speed * (0.5 + Math.random()) + 1;
      p.vz = Math.sin(a) * Math.cos(b) * speed * (0.5 + Math.random());
      p.life = life; p.maxLife = life;
      p.active = true;
      p.mesh.visible = true;
      (p.mesh.material as MeshBasicMaterial).color.set(color);
      (p.mesh.material as MeshBasicMaterial).opacity = 1;
      spawned++;
    }
  }

  update(dt: number) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 3 * dt;
      (p.mesh.material as MeshBasicMaterial).opacity = p.life / p.maxLife;
    }
  }
}

// ============================================================================
// SCENE BUILDER
// ============================================================================

function buildHolodeck(theme: ArenaTheme): Group {
  const env = new Group();
  const gridColor = new Color(theme.grid);
  const accentColor = new Color(theme.accent);

  // Floor grid
  const floorGeo = new PlaneGeometry(40, 40, 20, 20);
  const floorMat = new MeshBasicMaterial({ color: gridColor, wireframe: true, transparent: true, opacity: 0.15 });
  const floor = new Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  env.add(floor);

  // Ceiling grid
  const ceilGeo = new PlaneGeometry(40, 40, 20, 20);
  const ceilMat = new MeshBasicMaterial({ color: gridColor, wireframe: true, transparent: true, opacity: 0.08 });
  const ceil = new Mesh(ceilGeo, ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 8;
  env.add(ceil);

  // Launch pad platform
  const padGeo = new CylinderGeometry(1.5, 1.5, 0.1, 16);
  const padMat = new MeshStandardMaterial({ color: 0x333344, emissive: new Color(theme.accent), emissiveIntensity: 0.3 });
  const pad = new Mesh(padGeo, padMat);
  pad.position.set(0, 0.05, -4);
  env.add(pad);

  // Pad edge glow
  const padEdge = new Mesh(new TorusGeometry(1.5, 0.03, 8, 32), new MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.8 }));
  padEdge.rotation.x = -Math.PI / 2;
  padEdge.position.set(0, 0.11, -4);
  env.add(padEdge);

  // Support towers
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const tower = new Group();
    const tBody = new Mesh(new BoxGeometry(0.1, 3, 0.1), new MeshStandardMaterial({ color: 0x444466, emissive: accentColor, emissiveIntensity: 0.15 }));
    tBody.position.y = 1.5;
    tower.add(tBody);
    const tEdge = new LineSegments(new EdgesGeometry(new BoxGeometry(0.1, 3, 0.1)), new LineBasicMaterial({ color: accentColor, transparent: true, opacity: 0.4 }));
    tEdge.position.y = 1.5;
    tower.add(tEdge);
    // Top light
    const tLight = new Mesh(new SphereGeometry(0.06, 8, 8), new MeshBasicMaterial({ color: 0xff3300, transparent: true, blending: AdditiveBlending }));
    tLight.position.y = 3.1;
    tower.add(tLight);
    tower.position.set(Math.cos(a) * 2.2 + 0, 0, Math.sin(a) * 2.2 - 4);
    env.add(tower);
  }

  // Floating decorations
  for (let i = 0; i < 14; i++) {
    const x = (Math.random() - 0.5) * 16;
    const y = 2 + Math.random() * 4;
    const z = (Math.random() - 0.5) * 16;
    const types = [new TorusGeometry(0.15, 0.04, 8, 16), new BoxGeometry(0.2, 0.2, 0.2), new SphereGeometry(0.12, 8, 8), new ConeGeometry(0.1, 0.25, 6)];
    const geo = types[i % 4];
    const mat = new MeshBasicMaterial({ color: accentColor, wireframe: true, transparent: true, opacity: 0.2 });
    const dec = new Mesh(geo, mat);
    dec.position.set(x, y, z);
    dec.userData.floatSpeed = 0.3 + Math.random() * 0.5;
    dec.userData.floatOffset = Math.random() * Math.PI * 2;
    dec.userData.rotSpeed = 0.2 + Math.random() * 0.4;
    env.add(dec);
  }

  // Ambient particles
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * 20;
    const y = 0.5 + Math.random() * 6;
    const z = (Math.random() - 0.5) * 20;
    const dot = new Mesh(new SphereGeometry(0.008, 4, 4), new MeshBasicMaterial({ color: accentColor, transparent: true, blending: AdditiveBlending, opacity: 0.3 + Math.random() * 0.4 }));
    dot.position.set(x, y, z);
    dot.userData.driftX = (Math.random() - 0.5) * 0.2;
    dot.userData.driftY = (Math.random() - 0.5) * 0.1;
    dot.userData.pulsePhase = Math.random() * Math.PI * 2;
    env.add(dot);
  }

  // Lights
  const ambient = new AmbientLight(0x111122, 0.6);
  env.add(ambient);
  const dirLight = new DirectionalLight(0xffffff, 0.4);
  dirLight.position.set(3, 8, 5);
  env.add(dirLight);
  const padLight = new PointLight(new Color(theme.accent).getHex(), 1.5, 10);
  padLight.position.set(0, 1.5, -4);
  env.add(padLight);
  const acLight1 = new PointLight(new Color(theme.glow).getHex(), 0.8, 15);
  acLight1.position.set(-5, 4, -2);
  env.add(acLight1);
  const acLight2 = new PointLight(0xff00ff, 0.4, 15);
  acLight2.position.set(5, 3, -6);
  env.add(acLight2);

  return env;
}

// ============================================================================
// ROCKET BUILDER
// ============================================================================

function buildRocket(skin: RocketSkin, stages: number): Group {
  const rocket = new Group();
  const bodyColor = new Color(skin.body);
  const accentColor = new Color(skin.accent);

  // Nose cone
  const noseCone = new Mesh(new ConeGeometry(0.18, 0.6, 8), new MeshStandardMaterial({ color: bodyColor, emissive: accentColor, emissiveIntensity: 0.3 }));
  noseCone.position.y = stages === 3 ? 3.2 : 2.6;
  rocket.add(noseCone);
  const noseEdge = new LineSegments(new EdgesGeometry(new ConeGeometry(0.18, 0.6, 8)), new LineBasicMaterial({ color: accentColor, transparent: true, opacity: 0.6 }));
  noseEdge.position.copy(noseCone.position);
  rocket.add(noseEdge);

  // Stage bodies
  const stageHeights = stages === 3 ? [1.0, 0.8, 0.6] : [1.2, 1.0];
  const stageRadii = stages === 3 ? [0.22, 0.2, 0.18] : [0.22, 0.18];
  let yOff = stages === 3 ? 2.5 : 2.0;

  for (let s = 0; s < stages; s++) {
    const h = stageHeights[s];
    const r = stageRadii[s];
    const body = new Mesh(new CylinderGeometry(r, r, h, 8), new MeshStandardMaterial({ color: bodyColor, emissive: accentColor, emissiveIntensity: 0.15 }));
    body.position.y = yOff;
    rocket.add(body);
    const bodyEdge = new LineSegments(new EdgesGeometry(new CylinderGeometry(r, r, h, 8)), new LineBasicMaterial({ color: accentColor, transparent: true, opacity: 0.5 }));
    bodyEdge.position.copy(body.position);
    rocket.add(bodyEdge);
    // Stage separator ring
    if (s < stages - 1) {
      const ring = new Mesh(new TorusGeometry(r + 0.02, 0.015, 6, 16), new MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.7 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = yOff - h / 2;
      rocket.add(ring);
    }
    yOff -= h + 0.05;
  }

  // Nozzle
  const nozzle = new Mesh(new ConeGeometry(0.15, 0.25, 8), new MeshStandardMaterial({ color: 0x666688, emissive: 0x333344, emissiveIntensity: 0.3 }));
  nozzle.position.y = yOff + 0.05;
  nozzle.rotation.x = Math.PI;
  rocket.add(nozzle);

  // Fins (4)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fin = new Mesh(new BoxGeometry(0.02, 0.4, 0.2), new MeshStandardMaterial({ color: accentColor, emissive: accentColor, emissiveIntensity: 0.4 }));
    fin.position.set(Math.cos(a) * 0.25, yOff + 0.3, Math.sin(a) * 0.25);
    fin.rotation.y = a;
    rocket.add(fin);
  }

  // Exhaust flame placeholder (invisible initially)
  const flameGeo = new ConeGeometry(0.12, 0.8, 8);
  const flameMat = new MeshBasicMaterial({ color: new Color(skin.flame), transparent: true, blending: AdditiveBlending, opacity: 0 });
  const flame = new Mesh(flameGeo, flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = yOff - 0.3;
  flame.name = 'flame';
  rocket.add(flame);

  // Exhaust glow
  const glowGeo = new SphereGeometry(0.2, 8, 8);
  const glowMat = new MeshBasicMaterial({ color: new Color(skin.flame), transparent: true, blending: AdditiveBlending, opacity: 0 });
  const glow = new Mesh(glowGeo, glowMat);
  glow.position.y = yOff - 0.1;
  glow.name = 'exhaustGlow';
  rocket.add(glow);

  return rocket;
}

// ============================================================================
// TRAIL RENDERER
// ============================================================================

class TrailRenderer {
  points: Vector3[] = [];
  maxPoints = 60;
  line: LineSegments;
  geo: BufferGeometry;

  constructor(color: string) {
    this.geo = new BufferGeometry();
    const positions = new Float32Array(this.maxPoints * 2 * 3);
    this.geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    const mat = new LineBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.4, blending: AdditiveBlending });
    this.line = new LineSegments(this.geo, mat);
    this.line.frustumCulled = false;
  }

  addPoint(x: number, y: number, z: number) {
    this.points.push(new Vector3(x, y, z));
    if (this.points.length > this.maxPoints) this.points.shift();
    this.updateGeometry();
  }

  updateGeometry() {
    const pos = this.geo.attributes.position as Float32BufferAttribute;
    const arr = pos.array as Float32Array;
    arr.fill(0);
    for (let i = 0; i < this.points.length - 1; i++) {
      const j = i * 6;
      arr[j] = this.points[i].x; arr[j + 1] = this.points[i].y; arr[j + 2] = this.points[i].z;
      arr[j + 3] = this.points[i + 1].x; arr[j + 4] = this.points[i + 1].y; arr[j + 5] = this.points[i + 1].z;
    }
    pos.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(0, (this.points.length - 1) * 2));
  }

  clear() { this.points = []; this.updateGeometry(); }
}

// ============================================================================
// MAIN INIT
// ============================================================================

async function main() {
  const container = document.getElementById('app') as HTMLDivElement;
  const world = await World.create(container, {
    xr: { offer: 'once' },
    features: {
      locomotion: false,
      physics: false,
    },
  });

  world.scene.fog = new Fog(0x050510, 5, 30);

  const game = new GameStateManager();
  const audio = new AudioManager();
  const particles = new ParticlePool(150);
  world.scene.add(particles.group);

  // Build environment
  let envGroup = buildHolodeck(game.themes[game.currentThemeIndex]);
  world.scene.add(envGroup);

  // Build rocket
  const skin = game.skins[game.currentSkinIndex];
  let rocketGroup = buildRocket(skin, game.config.stages);
  rocketGroup.position.set(0, 0.1, -4);
  world.scene.add(rocketGroup);

  // Trail renderer
  const trail = new TrailRenderer(skin.accent);
  world.scene.add(trail.line);

  // Toast state
  let toastText = '';
  let toastTimer = 0;

  function showToast(text: string, duration = 2) {
    toastText = text;
    toastTimer = duration;
  }

  function rebuildRocket() {
    world.scene.remove(rocketGroup);
    const s = game.skins[game.currentSkinIndex];
    rocketGroup = buildRocket(s, game.config.stages);
    rocketGroup.position.set(0, 0.1, -4);
    world.scene.add(rocketGroup);
    trail.clear();
  }

  function applyTheme() {
    world.scene.remove(envGroup);
    envGroup = buildHolodeck(game.themes[game.currentThemeIndex]);
    world.scene.add(envGroup);
    game.themesUsed.add(game.themes[game.currentThemeIndex].name);
    const fogColor = new Color(game.themes[game.currentThemeIndex].fog);
    world.scene.fog = new Fog(fogColor.getHex(), 5, 30);
  }

  function setState(s: GameState) {
    game.state = s;
    if (s === 'title') {
      rocketGroup.position.set(0, 0.1, -4);
      rocketGroup.rotation.set(0, 0, 0);
      trail.clear();
      const flame = rocketGroup.getObjectByName('flame') as Mesh | undefined;
      const glow = rocketGroup.getObjectByName('exhaustGlow') as Mesh | undefined;
      if (flame) (flame.material as MeshBasicMaterial).opacity = 0;
      if (glow) (glow.material as MeshBasicMaterial).opacity = 0;
    }
  }

  function startCountdown() {
    game.flight = game.resetFlight();
    game.maxG = 0;
    game.smoothAngle = true;
    countdownValue = 5;
    setState('countdown');
    audio.playSfx('gameStart');
  }

  function startFlight() {
    setState('flying');
    audio.playSfx('ignition');
    audio.startMusic();
  }

  function endFlight(success: boolean) {
    audio.stopMusic();
    const f = game.flight;
    game.totalLaunches++;
    f.score = Math.floor(f.maxAltitude / 100 + f.maxVelocity / 10 + f.fuel * 50);
    if (f.score > 100000) f.score = 100000;
    game.totalScore += f.score;
    if (f.score > game.bestScore) game.bestScore = f.score;
    if (f.maxAltitude > game.bestAltitude) game.bestAltitude = f.maxAltitude;

    if (success) {
      game.totalMissionsDone++;
      game.consecutiveNoAbort++;
      const mName = game.currentMission.name;
      if (mName !== 'Daily Mission') game.missionsCompleted.add(mName);
      if (game.currentMission.difficulty === 'Daily') {
        const today = new Date().toISOString().slice(0, 10);
        if (game.lastDailyDate === new Date(Date.now() - 86400000).toISOString().slice(0, 10)) {
          game.dailyStreak++;
        } else if (game.lastDailyDate !== today) {
          game.dailyStreak = 1;
        }
        game.lastDailyDate = today;
      }
      audio.playSfx('orbit');
      particles.burst(rocketGroup.position.x, rocketGroup.position.y, rocketGroup.position.z, 30, game.skins[game.currentSkinIndex].accent, 3, 1.2);
    } else {
      audio.playSfx('gameOver');
    }

    game.addXP(Math.floor(f.score / 10) + (success ? 100 : 20));
    game.checkSkinUnlocks();
    const newAchievements = game.checkAchievements();
    for (const name of newAchievements) {
      showToast('Achievement: ' + name);
      audio.playSfx('achievement');
    }
    game.save();
    setState('gameover');
  }

  let countdownValue = 5;
  let countdownTimer = 0;
  let thrustSoundTimer = 0;
  let trailTimer = 0;

  // Keyboard input ref (typed via world.input)
  const keyboard = (world.input as any).keyboard ?? world.input;

  // ============================================================================
  // GAME LOOP SYSTEM
  // ============================================================================

  class GameLoopSystem extends createSystem({}) {
    update(delta: number, time: number) {
      const dt = Math.min(delta, 0.05);

      // Update particles
      particles.update(dt);

      // Toast timer
      if (toastTimer > 0) toastTimer -= dt;

      // Animate floating decorations
      for (const child of envGroup.children) {
        if (child.userData.floatSpeed) {
          child.position.y += Math.sin(time * child.userData.floatSpeed + child.userData.floatOffset) * 0.001;
          child.rotation.x += child.userData.rotSpeed * dt;
          child.rotation.y += child.userData.rotSpeed * 0.7 * dt;
        }
        if (child.userData.driftX !== undefined) {
          child.position.x += child.userData.driftX * dt;
          child.position.y += child.userData.driftY * dt;
          const mat = (child as Mesh).material as MeshBasicMaterial;
          if (mat.opacity !== undefined) {
            mat.opacity = 0.3 + 0.3 * Math.sin(time * 2 + (child.userData.pulsePhase ?? 0));
          }
          // Wrap
          if (child.position.x > 10) child.position.x = -10;
          if (child.position.x < -10) child.position.x = 10;
        }
      }

      // Countdown
      if (game.state === 'countdown') {
        countdownTimer += dt;
        if (countdownTimer >= 1) {
          countdownTimer -= 1;
          countdownValue--;
          if (countdownValue > 0) {
            audio.playSfx('countdown');
          } else {
            audio.playSfx('go');
            startFlight();
          }
        }
      }

      // Flight physics
      if (game.state === 'flying') {
        const f = game.flight;
        f.missionTime += dt;

        // Input: throttle and angle
        const kb = keyboard;
        if (kb.getKeyPressed('KeyW') || kb.getKeyPressed('ArrowUp')) f.throttle = Math.min(100, f.throttle + 30 * dt);
        if (kb.getKeyPressed('KeyS') || kb.getKeyPressed('ArrowDown')) f.throttle = Math.max(0, f.throttle - 30 * dt);
        if (kb.getKeyPressed('KeyA') || kb.getKeyPressed('ArrowLeft')) f.angle = Math.max(-80, f.angle - 20 * dt);
        if (kb.getKeyPressed('KeyD') || kb.getKeyPressed('ArrowRight')) f.angle = Math.min(80, f.angle + 20 * dt);
        if (kb.getKeyDown('Space')) {
          if (f.stage < f.maxStages) {
            f.stage++;
            f.stageSeparations++;
            f.fuel = Math.min(100, f.fuel + 40);
            f.mass *= 0.65;
            f.thrust *= 0.85;
            audio.playSfx('separation');
            particles.burst(rocketGroup.position.x, rocketGroup.position.y - 0.5, rocketGroup.position.z, 15, '#ff8800', 2, 0.6);
            showToast('Stage ' + f.stage + ' separation!');
          }
        }
        if (kb.getKeyDown('Escape') || kb.getKeyDown('KeyP')) {
          game.consecutiveNoAbort = 0;
          audio.playSfx('abort');
          endFlight(false);
          return;
        }

        // XR input
        const right = (world.input as any).xr?.gamepads?.right;
        if (right) {
          const stick = right.getAxesValues(InputComponent.Thumbstick);
          if (stick) {
            if (Math.abs(stick.y) > 0.15) f.throttle = Math.min(100, Math.max(0, f.throttle + stick.y * 40 * dt));
            if (Math.abs(stick.x) > 0.15) f.angle = Math.max(-80, Math.min(80, f.angle + stick.x * 25 * dt));
          }
          if (right.getButtonDown(InputComponent.A_Button)) {
            if (f.stage < f.maxStages) {
              f.stage++;
              f.stageSeparations++;
              f.fuel = Math.min(100, f.fuel + 40);
              f.mass *= 0.65;
              f.thrust *= 0.85;
              audio.playSfx('separation');
              particles.burst(rocketGroup.position.x, rocketGroup.position.y - 0.5, rocketGroup.position.z, 15, '#ff8800', 2, 0.6);
              showToast('Stage ' + f.stage + ' separation!');
            }
          }
          if (right.getButtonDown(InputComponent.B_Button)) {
            game.consecutiveNoAbort = 0;
            audio.playSfx('abort');
            endFlight(false);
            return;
          }
        }

        // Physics
        const altKm = f.altitude / 1000;
        const atmDensity = Math.exp(-altKm / 8.5); // exponential atmosphere
        const grav = f.gravity * Math.pow(6371 / (6371 + altKm), 2); // inverse square
        const drag = 0.5 * atmDensity * f.dragCoeff * f.velocity * f.velocity * 0.001;

        if (f.fuel > 0 && f.throttle > 0) {
          const thrustForce = f.thrust * (f.throttle / 100);
          f.fuel -= (f.throttle / 100) * dt * (game.config.fuelType === 'efficient' ? 2.5 : game.config.fuelType === 'high-thrust' ? 5 : 3.5);
          if (f.fuel < 0) f.fuel = 0;
          f.acceleration = (thrustForce / f.mass) - grav - (drag / f.mass);
        } else {
          f.acceleration = -grav - (drag / f.mass);
        }

        // Track max G
        const gForce = Math.abs(f.acceleration) / 9.81;
        if (gForce > game.maxG) game.maxG = gForce;
        if (Math.abs(f.angle) > 10) game.smoothAngle = false;

        const angleRad = (f.angle * Math.PI) / 180;
        const verticalAccel = f.acceleration * Math.cos(angleRad);
        const horizontalAccel = f.acceleration * Math.sin(angleRad);

        f.velocity += verticalAccel * dt;
        f.altitude += f.velocity * dt;
        if (f.altitude < 0) f.altitude = 0;
        if (f.velocity > f.maxVelocity) f.maxVelocity = f.velocity;
        if (f.altitude > f.maxAltitude) f.maxAltitude = f.altitude;

        // Update rocket visual position (scaled: 1m scene = 10km altitude)
        const sceneY = 0.1 + (f.altitude / 10000) * 1.0;
        const sceneX = horizontalAccel * dt * 0.01;
        rocketGroup.position.y = Math.min(sceneY, 6);
        rocketGroup.position.x += sceneX;
        rocketGroup.rotation.z = -angleRad * 0.5;

        // Flame effect
        const flame = rocketGroup.getObjectByName('flame') as Mesh | undefined;
        const glow = rocketGroup.getObjectByName('exhaustGlow') as Mesh | undefined;
        if (flame && f.fuel > 0 && f.throttle > 0) {
          const intensity = f.throttle / 100;
          (flame.material as MeshBasicMaterial).opacity = 0.6 + 0.4 * intensity;
          flame.scale.y = 0.8 + Math.random() * 0.6 * intensity;
          flame.scale.x = 0.9 + Math.random() * 0.2;
          flame.scale.z = 0.9 + Math.random() * 0.2;
        } else if (flame) {
          (flame.material as MeshBasicMaterial).opacity = 0;
        }
        if (glow && f.fuel > 0 && f.throttle > 0) {
          (glow.material as MeshBasicMaterial).opacity = 0.3 + 0.2 * (f.throttle / 100);
          glow.scale.setScalar(1 + Math.random() * 0.3);
        } else if (glow) {
          (glow.material as MeshBasicMaterial).opacity = 0;
        }

        // Thrust sound
        thrustSoundTimer += dt;
        if (thrustSoundTimer > 0.3 && f.fuel > 0 && f.throttle > 0) {
          thrustSoundTimer = 0;
          audio.playSfx('thrust', f.throttle / 100);
        }

        // Exhaust particles
        if (f.fuel > 0 && f.throttle > 20) {
          trailTimer += dt;
          if (trailTimer > 0.1) {
            trailTimer = 0;
            particles.burst(
              rocketGroup.position.x, rocketGroup.position.y - 0.5, rocketGroup.position.z,
              3, game.skins[game.currentSkinIndex].flame, 1.5, 0.4
            );
          }
        }

        // Trail
        trail.addPoint(rocketGroup.position.x, rocketGroup.position.y, rocketGroup.position.z);

        // Fuel warning
        if (f.fuel <= 10 && f.fuel > 0 && Math.floor(f.missionTime * 2) % 2 === 0) {
          // visual warning handled in HUD
        }

        // Check orbit reached
        const targetAlt = game.currentMission.target * 1000;
        if (targetAlt > 0 && f.altitude >= targetAlt && f.velocity >= 100) {
          endFlight(true);
          showToast('Orbit achieved!');
          return;
        }

        // Check crash
        if (f.altitude <= 0 && f.velocity < -10 && f.missionTime > 2) {
          audio.playSfx('explosion');
          particles.burst(rocketGroup.position.x, 0.2, rocketGroup.position.z, 25, '#ff4400', 4, 1);
          endFlight(false);
          showToast('Rocket destroyed!');
          return;
        }

        // Check fuel exhausted + falling
        if (f.fuel <= 0 && f.velocity < 0 && f.altitude > 0 && f.missionTime > 5) {
          // Still flying on momentum, let gravity decide
        }
      }
    }
  }

  world.registerSystem(GameLoopSystem);

  // ============================================================================
  // UI SYSTEM
  // ============================================================================

  // Create UI panel entities
  const panelConfigs = [
    'title', 'modes', 'difficulty', 'hud', 'throttle', 'countdown',
    'pause', 'gameover', 'leaderboard', 'achievements', 'settings',
    'help', 'toast', 'stats', 'skins',
  ];

  const panelEntities: Record<string, any> = {};

  function createWorldPanel(config: string, x: number, y: number, z: number, w: number, h: number) {
    const e = world.createTransformEntity(undefined, { persistent: true });
    e.object3D!.position.set(x, y, z);
    e.addComponent(PanelUI, { config, maxWidth: w, maxHeight: h });
    return e;
  }

  function createFollowerPanel(config: string, ox: number, oy: number, oz: number, w: number, h: number) {
    const e = world.createTransformEntity(undefined, { persistent: true });
    e.addComponent(PanelUI, { config, maxWidth: w, maxHeight: h });
    e.addComponent(Follower, {
      target: world.player.head,
      offsetPosition: [ox, oy, oz],
      behavior: FollowBehavior.PivotY,
      speed: 5,
      tolerance: 0.3,
    });
    return e;
  }

  // World-space panels (menus)
  panelEntities['title'] = createWorldPanel('./ui/title.json', 0, 1.6, -2, 0.5, 0.6);
  panelEntities['modes'] = createWorldPanel('./ui/modes.json', 0, 1.6, -2, 0.55, 0.8);
  panelEntities['difficulty'] = createWorldPanel('./ui/difficulty.json', 0, 1.6, -2, 0.5, 0.7);
  panelEntities['gameover'] = createWorldPanel('./ui/gameover.json', 0, 1.6, -2, 0.5, 0.6);
  panelEntities['achievements'] = createWorldPanel('./ui/achievements.json', 0, 1.6, -2, 0.6, 0.9);
  panelEntities['stats'] = createWorldPanel('./ui/stats.json', 0, 1.6, -2, 0.5, 0.5);
  panelEntities['settings'] = createWorldPanel('./ui/settings.json', 0, 1.6, -2, 0.5, 0.55);
  panelEntities['help'] = createWorldPanel('./ui/help.json', 0, 1.6, -2, 0.5, 0.7);
  panelEntities['skins'] = createWorldPanel('./ui/skins.json', 0, 1.6, -2, 0.5, 0.65);
  panelEntities['leaderboard'] = createWorldPanel('./ui/leaderboard.json', 0, 1.6, -2, 0.4, 0.3);
  panelEntities['pause'] = createWorldPanel('./ui/pause.json', 0, 1.6, -2, 0.3, 0.15);

  // Follower panels (HUDs)
  panelEntities['hud'] = createFollowerPanel('./ui/hud.json', 0.3, -0.12, -0.5, 0.4, 0.2);
  panelEntities['throttle'] = createFollowerPanel('./ui/throttle.json', -0.3, -0.15, -0.5, 0.18, 0.08);
  panelEntities['countdown'] = createFollowerPanel('./ui/countdown.json', 0, 0.05, -0.6, 0.2, 0.15);
  panelEntities['toast'] = createFollowerPanel('./ui/toast.json', 0, 0.15, -0.5, 0.4, 0.06);

  // UI binding system
  class UISystem extends createSystem({
    title: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/title.json')] },
    modes: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/modes.json')] },
    difficulty: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/difficulty.json')] },
    hud: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
    throttle: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/throttle.json')] },
    countdown: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/countdown.json')] },
    gameover: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/gameover.json')] },
    achievements: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
    settings: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
    stats: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
    help: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/help.json')] },
    skins: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/skins.json')] },
    toast: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/toast.json')] },
  }) {
    private docs: Record<string, UIKitDocument> = {};

    private getDoc(name: string): UIKitDocument | undefined {
      return this.docs[name];
    }

    private setText(name: string, id: string, text: string) {
      const doc = this.getDoc(name);
      const el = doc?.getElementById(id) as UIKit.Text | undefined;
      el?.setProperties({ text });
    }

    private bindButton(name: string, id: string, handler: () => void) {
      const doc = this.getDoc(name);
      const el = doc?.getElementById(id) as UIKit.Text | undefined;
      el?.addEventListener('click', handler);
    }

    init() {
      const bindPanel = (queryName: string) => {
        (this.queries as any)[queryName]?.subscribe?.('qualify', (entity: any) => {
          const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
          if (!doc) return;
          this.docs[queryName] = doc;
          this.setupPanel(queryName, doc);
        });
      };

      for (const name of panelConfigs) {
        bindPanel(name);
      }
    }

    setupPanel(name: string, doc: UIKitDocument) {
      switch (name) {
        case 'title':
          this.bindButton('title', 'btn-play', () => { audio.playSfx('click'); setState('modes'); });
          this.bindButton('title', 'btn-achievements', () => { audio.playSfx('click'); setState('achievements'); });
          this.bindButton('title', 'btn-stats', () => { audio.playSfx('click'); setState('stats'); });
          this.bindButton('title', 'btn-skins', () => { audio.playSfx('click'); setState('skins'); });
          this.bindButton('title', 'btn-settings', () => { audio.playSfx('click'); setState('settings'); });
          this.bindButton('title', 'btn-help', () => { audio.playSfx('click'); setState('help'); });
          break;

        case 'modes':
          for (let i = 0; i < MISSIONS.length; i++) {
            this.bindButton('modes', `btn-mission-${i}`, () => {
              audio.playSfx('click');
              game.missionIndex = i;
              game.currentMission = MISSIONS[i];
              if (game.currentMission.difficulty === 'Daily') {
                const seed = new Date().toISOString().slice(0, 10);
                const hash = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                game.currentMission = { ...game.currentMission, target: 200 + (hash % 800) };
              }
              setState('difficulty');
            });
          }
          this.bindButton('modes', 'btn-back', () => { audio.playSfx('click'); setState('title'); });
          break;

        case 'difficulty':
          this.bindButton('difficulty', 'btn-2stage', () => { audio.playSfx('click'); game.config.stages = 2; rebuildRocket(); });
          this.bindButton('difficulty', 'btn-3stage', () => { audio.playSfx('click'); game.config.stages = 3; rebuildRocket(); });
          this.bindButton('difficulty', 'btn-standard', () => { audio.playSfx('click'); game.config.fuelType = 'standard'; });
          this.bindButton('difficulty', 'btn-highthrust', () => { audio.playSfx('click'); game.config.fuelType = 'high-thrust'; });
          this.bindButton('difficulty', 'btn-efficient', () => { audio.playSfx('click'); game.config.fuelType = 'efficient'; });
          this.bindButton('difficulty', 'btn-launch', () => { audio.playSfx('click'); startCountdown(); });
          this.bindButton('difficulty', 'btn-back-d', () => { audio.playSfx('click'); setState('modes'); });
          break;

        case 'gameover':
          this.bindButton('gameover', 'btn-relaunch', () => { audio.playSfx('click'); rebuildRocket(); startCountdown(); });
          this.bindButton('gameover', 'btn-menu', () => { audio.playSfx('click'); rebuildRocket(); setState('title'); });
          break;

        case 'achievements':
          this.bindButton('achievements', 'btn-back-ach', () => { audio.playSfx('click'); setState('title'); });
          break;

        case 'stats':
          this.bindButton('stats', 'btn-back-stats', () => { audio.playSfx('click'); setState('title'); });
          break;

        case 'settings':
          this.bindButton('settings', 'btn-master-up', () => { audio.setMasterVol(Math.min(1, audio.masterVol + 0.1)); audio.playSfx('click'); });
          this.bindButton('settings', 'btn-master-dn', () => { audio.setMasterVol(Math.max(0, audio.masterVol - 0.1)); audio.playSfx('click'); });
          this.bindButton('settings', 'btn-sfx-up', () => { audio.setSfxVol(Math.min(1, audio.sfxVol + 0.1)); audio.playSfx('click'); });
          this.bindButton('settings', 'btn-sfx-dn', () => { audio.setSfxVol(Math.max(0, audio.sfxVol - 0.1)); audio.playSfx('click'); });
          this.bindButton('settings', 'btn-music-up', () => { audio.setMusicVol(Math.min(1, audio.musicVol + 0.1)); audio.playSfx('click'); });
          this.bindButton('settings', 'btn-music-dn', () => { audio.setMusicVol(Math.max(0, audio.musicVol - 0.1)); audio.playSfx('click'); });
          this.bindButton('settings', 'btn-theme-prev', () => {
            game.currentThemeIndex = (game.currentThemeIndex - 1 + game.themes.length) % game.themes.length;
            applyTheme(); audio.playSfx('click');
          });
          this.bindButton('settings', 'btn-theme-next', () => {
            game.currentThemeIndex = (game.currentThemeIndex + 1) % game.themes.length;
            applyTheme(); audio.playSfx('click');
          });
          this.bindButton('settings', 'btn-back-set', () => { audio.playSfx('click'); setState('title'); });
          break;

        case 'skins':
          for (let i = 0; i < ROCKET_SKINS.length; i++) {
            this.bindButton('skins', `btn-skin-${i}`, () => {
              if (game.skins[i].unlocked) {
                game.currentSkinIndex = i;
                rebuildRocket();
                audio.playSfx('click');
              }
            });
          }
          this.bindButton('skins', 'btn-back-skins', () => { audio.playSfx('click'); setState('title'); });
          break;

        case 'help':
          this.bindButton('help', 'btn-back-help', () => { audio.playSfx('click'); setState('title'); });
          break;
      }
    }

    update(_delta: number, _time: number) {
      const s = game.state;
      const f = game.flight;

      // Visibility
      const vis: Record<string, boolean> = {
        title: s === 'title',
        modes: s === 'modes',
        difficulty: s === 'difficulty',
        hud: s === 'flying',
        throttle: s === 'flying',
        countdown: s === 'countdown',
        gameover: s === 'gameover',
        achievements: s === 'achievements',
        stats: s === 'stats',
        settings: s === 'settings',
        help: s === 'help',
        skins: s === 'skins',
        toast: toastTimer > 0,
      };
      for (const [name, entity] of Object.entries(panelEntities)) {
        if (entity.object3D) entity.object3D.visible = vis[name] ?? false;
      }

      // Update HUD
      if (s === 'flying') {
        this.setText('hud', 'alt-value', (f.altitude / 1000).toFixed(1) + ' km');
        this.setText('hud', 'vel-value', f.velocity.toFixed(0) + ' m/s');
        this.setText('hud', 'fuel-value', f.fuel.toFixed(0) + '%');
        this.setText('hud', 'stage-value', f.stage + '/' + f.maxStages);
        this.setText('hud', 'angle-value', f.angle.toFixed(1) + ' deg');
        this.setText('hud', 'time-value', f.missionTime.toFixed(1) + 's');
        this.setText('hud', 'target-value', game.currentMission.target + ' km');
        this.setText('hud', 'mission-label', game.currentMission.name);

        // Throttle bar
        const pct = Math.floor(f.throttle);
        const bars = Math.floor(pct / 5);
        let barStr = '';
        for (let i = 0; i < 20; i++) barStr += i < bars ? '|' : '.';
        this.setText('throttle', 'throttle-bar', barStr);
        this.setText('throttle', 'throttle-pct', pct + '%');
      }

      // Update countdown
      if (s === 'countdown') {
        this.setText('countdown', 'count-text', countdownValue > 0 ? String(countdownValue) : 'LAUNCH!');
      }

      // Update game over
      if (s === 'gameover') {
        this.setText('gameover', 'go-mission', game.currentMission.name);
        this.setText('gameover', 'go-altitude', (f.maxAltitude / 1000).toFixed(1) + ' km');
        this.setText('gameover', 'go-velocity', f.maxVelocity.toFixed(0) + ' m/s');
        this.setText('gameover', 'go-fuel', f.fuel.toFixed(0) + '%');
        this.setText('gameover', 'go-time', f.missionTime.toFixed(1) + 's');
        this.setText('gameover', 'go-score', String(f.score));
        this.setText('gameover', 'go-result', f.altitude >= game.currentMission.target * 1000 ? 'ORBIT ACHIEVED' : 'MISSION FAILED');
        this.setText('gameover', 'go-stages', String(f.stageSeparations));
      }

      // Update title
      if (s === 'title') {
        this.setText('title', 'level-display', 'Lv.' + game.level + ' ' + game.getLevelTitle());
      }

      // Update achievements
      if (s === 'achievements') {
        for (let i = 0; i < game.achievements.length; i++) {
          const a = game.achievements[i];
          this.setText('achievements', `ach-name-${i}`, (a.unlocked ? '[x] ' : '[ ] ') + a.name);
          this.setText('achievements', `ach-desc-${i}`, a.desc);
        }
      }

      // Update stats
      if (s === 'stats') {
        this.setText('stats', 'stat-launches', String(game.totalLaunches));
        this.setText('stats', 'stat-score', String(game.totalScore));
        this.setText('stats', 'stat-best', String(game.bestScore));
        this.setText('stats', 'stat-altitude', (game.bestAltitude / 1000).toFixed(1) + ' km');
        this.setText('stats', 'stat-missions', String(game.totalMissionsDone));
        this.setText('stats', 'stat-level', game.level + ' (' + game.getLevelTitle() + ')');
        this.setText('stats', 'stat-streak', String(game.dailyStreak));
        this.setText('stats', 'stat-achievements', game.achievements.filter(a => a.unlocked).length + '/' + game.achievements.length);
      }

      // Update settings
      if (s === 'settings') {
        this.setText('settings', 'master-vol', Math.round(audio.masterVol * 100) + '%');
        this.setText('settings', 'sfx-vol', Math.round(audio.sfxVol * 100) + '%');
        this.setText('settings', 'music-vol', Math.round(audio.musicVol * 100) + '%');
        this.setText('settings', 'theme-name', game.themes[game.currentThemeIndex].name);
      }

      // Update skins
      if (s === 'skins') {
        for (let i = 0; i < game.skins.length; i++) {
          const sk = game.skins[i];
          const status = sk.unlocked ? (i === game.currentSkinIndex ? 'EQUIPPED' : 'AVAILABLE') : 'LOCKED';
          this.setText('skins', `skin-name-${i}`, sk.name);
          this.setText('skins', `skin-status-${i}`, status);
        }
      }

      // Toast
      if (toastTimer > 0) {
        this.setText('toast', 'toast-text', toastText);
      }

      // Update modes list
      if (s === 'modes') {
        for (let i = 0; i < MISSIONS.length; i++) {
          const m = MISSIONS[i];
          this.setText('modes', `mission-name-${i}`, m.name);
          this.setText('modes', `mission-desc-${i}`, m.description);
        }
      }

      // Difficulty config display
      if (s === 'difficulty') {
        this.setText('difficulty', 'cfg-stages', game.config.stages + ' stages');
        this.setText('difficulty', 'cfg-fuel', game.config.fuelType);
        this.setText('difficulty', 'cfg-target', game.currentMission.target + ' km');
        this.setText('difficulty', 'cfg-mission', game.currentMission.name);
      }
    }
  }

  world.registerSystem(UISystem);
}

main();

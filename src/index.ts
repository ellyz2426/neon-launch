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
  ScreenSpace,
  AssetManager,
} from '@iwsdk/core';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type GameState = 'title' | 'config' | 'preflight' | 'countdown' | 'flying' | 'orbit' | 'gameover' | 'achievements' | 'stats' | 'settings' | 'help' | 'skins' | 'modes' | 'difficulty' | 'weather' | 'career' | 'leaderboard' | 'tutorial' | 'custom-mission';

// Tutorial steps
interface TutorialStep {
  title: string;
  desc: string;
  check: (game: GameStateManager) => boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  { title: 'Step 1: Throttle Up', desc: 'Press W or push thumbstick up to increase throttle above 70%.', check: (g) => g.flight.throttle >= 70 },
  { title: 'Step 2: Liftoff!', desc: 'Your rocket is lifting off! Watch the altitude climb on the HUD.', check: (g) => g.flight.altitude >= 5000 },
  { title: 'Step 3: Gravity Turn', desc: 'Press D or push thumbstick right to angle the rocket. Aim for 20-40 degrees.', check: (g) => g.flight.angle >= 15 },
  { title: 'Step 4: Stage Separation', desc: 'When fuel drops below 30%, press SPACE or A button to separate stages!', check: (g) => g.flight.stageSeparations >= 1 },
  { title: 'Step 5: Approaching Orbit', desc: 'Keep climbing! You need to reach the target altitude shown on HUD.', check: (g) => g.flight.altitude >= 100000 },
  { title: 'Step 6: Orbit!', desc: 'Almost there! Maintain velocity and altitude to achieve orbit.', check: (g) => g.flight.altitude >= 200000 },
];

// Mission control callouts
interface Callout {
  trigger: string;
  message: string;
  fired: boolean;
}

// Re-entry data
interface ReentryData {
  heat: number;       // 0-100
  shieldHP: number;   // 0-100
  temperature: number; // Kelvin
  descending: boolean;
  peakHeat: number;
}

// Separated stage debris
interface StageDebris {
  group: Group;
  vy: number;
  vx: number;
  rot: number;
  life: number;
}

// Orbital debris for Debris Dodge mission
interface OrbitalDebris {
  group: Group;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  altitudeKm: number; // the altitude band this debris orbits at
  hitRadius: number;
  active: boolean;
}

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
  maxQ: number;       // max dynamic pressure
  currentQ: number;   // current dynamic pressure
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

interface WeatherCondition {
  name: string;
  windSpeed: number;
  turbulence: number;
  headwind: number;
  visibility: number;
}

interface AltitudeMilestone {
  altitude: number;
  name: string;
}

interface LeaderboardEntry {
  mission: string;
  score: number;
  altitude: number;
  time: number;
  date: string;
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
  { name: 'Polar Orbit', target: 500, payload: 'satellite', difficulty: 'Medium', description: 'Sun-sync polar orbit at 500km' },
  { name: 'Lunar Transfer', target: 15000, payload: 'probe', difficulty: 'Expert', description: 'Trans-lunar injection burn' },
  { name: 'Speed Run', target: 300, payload: 'satellite', difficulty: 'Medium', description: 'Reach 300km in under 60s' },
  { name: 'Fuel Challenge', target: 400, payload: 'satellite', difficulty: 'Hard', description: 'Orbit with 50%+ fuel left' },
  { name: 'Heavy Launch', target: 300, payload: 'station', difficulty: 'Hard', description: 'Heavy payload to low orbit' },
  { name: 'Re-entry Run', target: 0, payload: 'crew', difficulty: 'Expert', description: 'Survive atmospheric re-entry' },
  { name: 'Micro-G Lab', target: 250, payload: 'satellite', difficulty: 'Easy', description: 'Micro-gravity research at 250km' },
  { name: 'Debris Dodge', target: 350, payload: 'satellite', difficulty: 'Medium', description: 'Navigate past Kessler debris to 350km' },
  { name: 'Rescue Mission', target: 420, payload: 'crew', difficulty: 'Hard', description: 'Emergency crew rescue at ISS orbit' },
  { name: 'Mars Transfer', target: 25000, payload: 'probe', difficulty: 'Expert', description: 'Trans-Mars injection burn' },
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
  { id: 'karman_line', name: 'Karman Line', desc: 'Cross 100km altitude', unlocked: false },
  { id: 'orbit_15000', name: 'Lunar Transfer', desc: 'Reach 15000km altitude', unlocked: false },
  { id: 'speed_run', name: 'Speed Demon Pro', desc: 'Orbit in under 60 seconds', unlocked: false },
  { id: 'fuel_50', name: 'Efficiency Expert', desc: 'Orbit with 50%+ fuel', unlocked: false },
  { id: 'polar_orbit', name: 'Polar Pioneer', desc: 'Complete polar orbit mission', unlocked: false },
  { id: 'hundred_launches', name: 'Astronaut', desc: 'Complete 100 launches', unlocked: false },
  { id: 'wind_warrior', name: 'Wind Warrior', desc: 'Orbit in stormy weather', unlocked: false },
  { id: 'hurricane_hero', name: 'Hurricane Hero', desc: 'Orbit in hurricane conditions', unlocked: false },
  { id: 'no_throttle_change', name: 'Steady Hand', desc: 'Orbit without changing throttle', unlocked: false },
  { id: 'max_speed_10k', name: 'Hypersonic', desc: 'Reach 10000 m/s', unlocked: false },
  { id: 'max_speed_15k', name: 'Escape Velocity', desc: 'Reach 15000 m/s', unlocked: false },
  { id: 'ten_missions', name: 'Explorer', desc: 'Complete 10 different missions', unlocked: false },
  { id: 'reentry_survive', name: 'Heat Shield', desc: 'Survive a re-entry mission', unlocked: false },
  { id: 'daily_streak_14', name: 'Streak x14', desc: '14-day daily streak', unlocked: false },
  { id: 'daily_streak_30', name: 'Streak x30', desc: '30-day daily streak', unlocked: false },
  { id: 'three_stage_orbit', name: 'Triple Burn', desc: 'Orbit using all 3 stages', unlocked: false },
  { id: 'career_complete', name: 'Career Pilot', desc: 'Complete career mode', unlocked: false },
  { id: 'score_50k', name: 'High Scorer', desc: 'Score 50000+ on a mission', unlocked: false },
  { id: 'score_100k', name: 'Top Gun', desc: 'Score 100000 on a mission', unlocked: false },
  { id: 'low_fuel_orbit', name: 'Fumes Only', desc: 'Orbit with less than 5% fuel', unlocked: false },
  { id: 'five_g', name: 'High G', desc: 'Experience 5G acceleration', unlocked: false },
  { id: 'ten_g', name: 'Extreme G', desc: 'Experience 10G acceleration', unlocked: false },
  { id: 'altitude_drop', name: 'Controlled Descent', desc: 'Drop 100km and recover', unlocked: false },
  { id: 'all_skins', name: 'Collector', desc: 'Unlock all rocket skins', unlocked: false },
  { id: 'all_themes', name: 'Interior Designer', desc: 'Try all arena themes', unlocked: false },
  { id: 'heavy_orbit_800', name: 'Titan Lifter', desc: 'Heavy payload to 800km', unlocked: false },
  { id: 'crew_ten', name: 'Taxi Service', desc: 'Complete 10 crew missions', unlocked: false },
  { id: 'no_separation', name: 'Single Stage', desc: 'Orbit without stage separation', unlocked: false },
  { id: 'perfect_angle', name: 'Optimal Trajectory', desc: 'Keep angle 30-45 deg above 50km', unlocked: false },
  { id: 'reentry_shield_90', name: 'Iron Shield', desc: 'Re-entry with 90%+ shield', unlocked: false },
  { id: 'orbit_20000', name: 'Deep Space Explorer', desc: 'Reach 20000km', unlocked: false },
  { id: 'no_weather_orbit', name: 'Storm Chaser', desc: 'Orbit in any non-clear weather', unlocked: false },
  { id: 'tutorial_complete', name: 'Graduate', desc: 'Complete the tutorial', unlocked: false },
  { id: 'speed_30s', name: 'Speed Freak', desc: 'Reach 100km in under 30s', unlocked: false },
  { id: 'gravity_assist', name: 'Gravity Master', desc: 'Orbit with angle 30-50 at 200km', unlocked: false },
  { id: 'efficient_orbit', name: 'Fuel Miser', desc: 'Orbit with efficient fuel + 60% left', unlocked: false },
  { id: 'max_throttle_orbit', name: 'Full Throttle', desc: 'Orbit at 100% throttle whole flight', unlocked: false },
  { id: 'skin_master', name: 'Wardrobe', desc: 'Unlock 8 rocket skins', unlocked: false },
  { id: 'career_half', name: 'Halfway There', desc: 'Unlock 8 career missions', unlocked: false },
  { id: 'combo_weather_heavy', name: 'Iron Will', desc: 'Heavy launch in storm weather', unlocked: false },
  { id: 'two_hundred_launches', name: 'Legend', desc: '200 launches completed', unlocked: false },
  { id: 'mars_transfer', name: 'Mars Bound', desc: 'Complete Mars Transfer mission', unlocked: false },
  { id: 'rescue_hero', name: 'Rescue Hero', desc: 'Complete Rescue Mission', unlocked: false },
  { id: 'micro_g', name: 'Scientist', desc: 'Complete Micro-G Lab mission', unlocked: false },
  { id: 'debris_dodge', name: 'Dodge Master', desc: 'Complete Debris Dodge mission', unlocked: false },
  { id: 'all_themes_used', name: 'World Traveler', desc: 'Use all arena themes', unlocked: false },
  { id: 'speed_orbit_45s', name: 'Lightning Fast', desc: 'Reach orbit in under 45s', unlocked: false },
  { id: 'all_fuel_types', name: 'Fuel Expert', desc: 'Orbit with each fuel type', unlocked: false },
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
  { name: 'Galaxy Blue', body: '#2244aa', accent: '#4488ff', flame: '#00aaff', unlockCondition: 'Lunar transfer', unlocked: false },
  { name: 'Meteor Gold', body: '#cc8800', accent: '#ffcc00', flame: '#ffaa00', unlockCondition: '100 launches', unlocked: false },
  { name: 'Shadow Black', body: '#222222', accent: '#666666', flame: '#ff4444', unlockCondition: 'Hurricane orbit', unlocked: false },
  { name: 'Aurora', body: '#44ddaa', accent: '#22ffcc', flame: '#00ff88', unlockCondition: 'Level 40', unlocked: false },
  { name: 'Deep Ocean', body: '#1a4466', accent: '#2288bb', flame: '#44aadd', unlockCondition: 'Complete 15 missions', unlocked: false },
  { name: 'Sunset Blaze', body: '#cc4400', accent: '#ff8833', flame: '#ffcc44', unlockCondition: '200 launches', unlocked: false },
  { name: 'Neon Matrix', body: '#112211', accent: '#33ff33', flame: '#88ff88', unlockCondition: 'Score 100k', unlocked: false },
  { name: 'Royal Gold', body: '#aa8833', accent: '#ffdd44', flame: '#ffee88', unlockCondition: 'All milestones in one flight', unlocked: false },
];

const ARENA_THEMES: ArenaTheme[] = [
  { name: 'Neon Holodeck', grid: '#00ffff', accent: '#00ffff', bg: '#050510', fog: '#050510', wall: '#001a2a', sky: '#000822', glow: '#00ffff' },
  { name: 'Crimson Pad', grid: '#ff3333', accent: '#ff4444', bg: '#100505', fog: '#100505', wall: '#2a0000', sky: '#220000', glow: '#ff3333' },
  { name: 'Toxic Launch', grid: '#33ff33', accent: '#44ff44', bg: '#051005', fog: '#051005', wall: '#002a00', sky: '#002200', glow: '#33ff33' },
  { name: 'Ultra Violet', grid: '#9933ff', accent: '#aa44ff', bg: '#0a0510', fog: '#0a0510', wall: '#1a002a', sky: '#110022', glow: '#9933ff' },
  { name: 'Solar Blaze', grid: '#ff9933', accent: '#ffaa44', bg: '#100a05', fog: '#100a05', wall: '#2a1500', sky: '#221100', glow: '#ff9933' },
  { name: 'Arctic Launch', grid: '#88ccff', accent: '#aaddff', bg: '#0a0f15', fog: '#0a0f15', wall: '#152535', sky: '#0a1a2a', glow: '#88ccff' },
  { name: 'Desert Pad', grid: '#cc8844', accent: '#ddaa66', bg: '#151008', fog: '#151008', wall: '#2a2010', sky: '#221a08', glow: '#cc8844' },
  { name: 'Ocean Platform', grid: '#2288cc', accent: '#33aadd', bg: '#050a10', fog: '#050a10', wall: '#0a1a2a', sky: '#061525', glow: '#2288cc' },
  { name: 'Midnight Launch', grid: '#4444cc', accent: '#5555ee', bg: '#050510', fog: '#050510', wall: '#0a0a2a', sky: '#050522', glow: '#4444cc' },
  { name: 'Volcanic Base', grid: '#dd4422', accent: '#ff6644', bg: '#150805', fog: '#150805', wall: '#2a1008', sky: '#221005', glow: '#dd4422' },
  { name: 'Forest Clearing', grid: '#228844', accent: '#33aa55', bg: '#050f08', fog: '#050f08', wall: '#0a200f', sky: '#081a0a', glow: '#228844' },
  { name: 'Neon City', grid: '#ff44ff', accent: '#ff66ff', bg: '#100510', fog: '#100510', wall: '#2a0a2a', sky: '#220822', glow: '#ff44ff' },
];

const LEVEL_TITLES = [
  'Cadet', 'Trainee', 'Rookie', 'Pilot', 'Navigator',
  'Engineer', 'Specialist', 'Officer', 'Captain', 'Commander',
  'Ace', 'Elite', 'Veteran', 'Expert', 'Master',
  'Champion', 'Legend', 'Hero', 'Titan', 'NEON GOD',
];

const WEATHER_CONDITIONS: WeatherCondition[] = [
  { name: 'Clear', windSpeed: 0, turbulence: 0, headwind: 0, visibility: 1 },
  { name: 'Light Winds', windSpeed: 5, turbulence: 0.1, headwind: 2, visibility: 0.9 },
  { name: 'Gusty', windSpeed: 15, turbulence: 0.3, headwind: 5, visibility: 0.7 },
  { name: 'Storm', windSpeed: 25, turbulence: 0.5, headwind: 10, visibility: 0.4 },
  { name: 'Hurricane', windSpeed: 40, turbulence: 0.8, headwind: 20, visibility: 0.2 },
];

const ALTITUDE_MILESTONES: AltitudeMilestone[] = [
  { altitude: 10000, name: 'Troposphere' },
  { altitude: 50000, name: 'Stratosphere' },
  { altitude: 80000, name: 'Mesosphere' },
  { altitude: 100000, name: 'KARMAN LINE' },
  { altitude: 200000, name: 'Low Earth Orbit' },
  { altitude: 400000, name: 'ISS Altitude' },
  { altitude: 1000000, name: 'Van Allen Belt' },
  { altitude: 5000000, name: 'Magnetosphere' },
  { altitude: 10000000, name: 'Escape Zone' },
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
  weather: WeatherCondition = WEATHER_CONDITIONS[0];
  weatherIndex = 0;
  careerMode = false;
  careerUnlocked = 3;
  history: LeaderboardEntry[] = [];
  milestoneTriggered: Set<number> = new Set();
  throttleChanged = false;
  crewMissions = 0;
  fuelTypesUsed: Set<string> = new Set();
  altitudeDropped = false;
  peakAltBeforeDrop = 0;
  tutorialMode = false;
  tutorialStep = 0;
  reentry: ReentryData = { heat: 0, shieldHP: 100, temperature: 300, descending: false, peakHeat: 0 };
  callouts: Callout[] = [];
  stageDebris: StageDebris[] = [];
  cameraShakeIntensity = 0;
  speedLineIntensity = 0;
  customAltitude = 500;
  customPayload = 'satellite';

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

    // Reset re-entry
    this.reentry = { heat: 0, shieldHP: 100, temperature: 300, descending: false, peakHeat: 0 };

    // Reset callouts
    this.callouts = [
      { trigger: 'liftoff', message: 'We have liftoff! All engines nominal.', fired: false },
      { trigger: 'altitude_10km', message: 'Passing 10km. Max-Q approaching.', fired: false },
      { trigger: 'altitude_50km', message: 'Stratosphere. Drag is decreasing.', fired: false },
      { trigger: 'karman_line', message: 'KARMAN LINE! Welcome to space!', fired: false },
      { trigger: 'fuel_50', message: 'Warning: 50% fuel remaining.', fired: false },
      { trigger: 'fuel_20', message: 'CAUTION: 20% fuel. Consider staging.', fired: false },
      { trigger: 'fuel_5', message: 'CRITICAL: 5% fuel remaining!', fired: false },
      { trigger: 'orbit_50pct', message: 'Halfway to target orbit!', fired: false },
      { trigger: 'orbit_90pct', message: 'Final approach! 90% to target!', fired: false },
      { trigger: 'high_g', message: 'High G-force detected! Ease throttle!', fired: false },
      { trigger: 'separation', message: 'Stage separation confirmed!', fired: false },
      { trigger: 'max_q', message: 'MAX-Q. Maximum dynamic pressure.', fired: false },
    ];

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
      maxQ: 0,
      currentQ: 0,
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
    check('karman_line', f.maxAltitude >= 100000);
    check('orbit_15000', f.maxAltitude >= 15000000);
    check('speed_run', f.altitude >= 300000 && f.missionTime < 60);
    check('fuel_50', f.fuel >= 50 && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('polar_orbit', this.currentMission.name === 'Polar Orbit' && f.altitude >= this.currentMission.target * 1000);
    check('hundred_launches', this.totalLaunches >= 100);
    check('wind_warrior', this.weather.name === 'Storm' && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('hurricane_hero', this.weather.name === 'Hurricane' && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('no_throttle_change', !this.throttleChanged && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('max_speed_10k', f.maxVelocity >= 10000);
    check('max_speed_15k', f.maxVelocity >= 15000);
    check('ten_missions', this.missionsCompleted.size >= 10);
    check('reentry_survive', this.currentMission.name === 'Re-entry Run');
    check('daily_streak_14', this.dailyStreak >= 14);
    check('daily_streak_30', this.dailyStreak >= 30);
    check('three_stage_orbit', this.config.stages === 3 && f.stageSeparations >= 2 && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('career_complete', this.careerUnlocked >= MISSIONS.length);
    check('score_50k', f.score >= 50000);
    check('score_100k', f.score >= 100000);
    check('low_fuel_orbit', f.fuel < 5 && f.fuel > 0 && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('five_g', this.maxG >= 5);
    check('ten_g', this.maxG >= 10);
    check('altitude_drop', this.altitudeDropped);
    check('all_skins', this.skins.filter(s => s.unlocked).length >= this.skins.length);
    check('all_themes', this.themesUsed.size >= this.themes.length);
    check('heavy_orbit_800', this.currentMission.payload === 'station' && f.altitude >= 800000);
    check('crew_ten', this.crewMissions >= 10);
    check('no_separation', f.stageSeparations === 0 && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('perfect_angle', f.altitude >= 50000 && f.angle >= 30 && f.angle <= 45);
    check('reentry_shield_90', this.currentMission.name === 'Re-entry Run' && this.reentry.shieldHP >= 90 && f.altitude <= 500);
    check('orbit_20000', f.maxAltitude >= 20000000);
    check('no_weather_orbit', this.weather.name !== 'Clear' && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('tutorial_complete', this.tutorialStep >= TUTORIAL_STEPS.length);
    check('speed_30s', f.altitude >= 100000 && f.missionTime < 30);
    check('gravity_assist', f.altitude >= 200000 && f.angle >= 30 && f.angle <= 50);
    check('efficient_orbit', this.config.fuelType === 'efficient' && f.fuel >= 60 && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('max_throttle_orbit', !this.throttleChanged && f.throttle >= 100 && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('skin_master', this.skins.filter(s => s.unlocked).length >= 8);
    check('career_half', this.careerUnlocked >= 8);
    check('combo_weather_heavy', this.currentMission.payload === 'station' && this.weather.name === 'Storm' && f.altitude >= this.currentMission.target * 1000 && this.currentMission.target > 0);
    check('two_hundred_launches', this.totalLaunches >= 200);
    check('mars_transfer', this.currentMission.name === 'Mars Transfer' && f.altitude >= 25000000);
    check('rescue_hero', this.currentMission.name === 'Rescue Mission' && f.altitude >= 420000);
    check('micro_g', this.currentMission.name === 'Micro-G Lab' && f.altitude >= 250000);
    check('debris_dodge', this.currentMission.name === 'Debris Dodge' && f.altitude >= 350000);
    check('all_themes_used', this.themesUsed.size >= this.themes.length);
    check('speed_orbit_45s', f.altitude >= this.currentMission.target * 1000 && f.missionTime < 45 && this.currentMission.target > 0);
    check('all_fuel_types', this.fuelTypesUsed.size >= 3);
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
    if (this.skins[8]) this.skins[8].unlocked = this.bestAltitude >= 15000000;
    if (this.skins[9]) this.skins[9].unlocked = this.totalLaunches >= 100;
    if (this.skins[10]) this.skins[10].unlocked = this.achievements.find(a => a.id === 'hurricane_hero')?.unlocked ?? false;
    if (this.skins[11]) this.skins[11].unlocked = this.level >= 40;
    if (this.skins[12]) this.skins[12].unlocked = this.missionsCompleted.size >= 15;
    if (this.skins[13]) this.skins[13].unlocked = this.totalLaunches >= 200;
    if (this.skins[14]) this.skins[14].unlocked = this.bestScore >= 100000;
    if (this.skins[15]) this.skins[15].unlocked = this.milestoneTriggered.size >= 9;
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
      careerUnlocked: this.careerUnlocked, careerMode: this.careerMode,
      crewMissions: this.crewMissions, weatherIndex: this.weatherIndex,
      fuelTypesUsed: [...this.fuelTypesUsed],
      history: this.history.slice(-20), // keep last 20 runs
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
      this.careerUnlocked = d.careerUnlocked ?? 3;
      this.careerMode = d.careerMode ?? false;
      this.crewMissions = d.crewMissions ?? 0;
      this.fuelTypesUsed = new Set(d.fuelTypesUsed ?? []);
      this.weatherIndex = d.weatherIndex ?? 0;
      this.weather = WEATHER_CONDITIONS[this.weatherIndex] ?? WEATHER_CONDITIONS[0];
      this.history = d.history ?? [];
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
  private arpInterval: ReturnType<typeof setInterval> | null = null;

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

    // Arpeggiator — cascading notes that evolve over time
    const arpNotes = [110, 138.59, 164.81, 220, 277.18, 329.63, 440, 554.37];
    let arpIdx = 0;
    let arpOctave = 0;
    this.arpInterval = setInterval(() => {
      if (!this.ctx || !this.musicGain || !this.musicPlaying) return;
      const now = this.ctx.currentTime;
      const freq = arpNotes[arpIdx % arpNotes.length] * (1 + arpOctave);
      const arpO = this.ctx.createOscillator();
      const arpG = this.ctx.createGain();
      arpO.type = 'sine';
      arpO.frequency.value = freq;
      arpG.gain.setValueAtTime(0.04, now);
      arpG.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      arpO.connect(arpG);
      arpG.connect(this.musicGain!);
      arpO.start(now);
      arpO.stop(now + 0.45);
      arpIdx++;
      if (arpIdx % 16 === 0) arpOctave = (arpOctave + 1) % 3;
    }, 250);
  }

  stopMusic() {
    if (!this.musicPlaying) return;
    this.musicPlaying = false;
    for (const o of this.droneOscs) { try { o.stop(); } catch {} }
    this.droneOscs = [];
    if (this.arpInterval) { clearInterval(this.arpInterval); this.arpInterval = null; }
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
// ASSET LOADER -- Kenney Space Kit GLB models
// ============================================================================

interface LoadedModels {
  rocketTopA: Group; rocketTopB: Group;
  rocketSidesA: Group; rocketSidesB: Group;
  rocketFinsA: Group; rocketFinsB: Group;
  rocketFuelA: Group; rocketFuelB: Group;
  rocketBaseA: Group; rocketBaseB: Group;
  platformLarge: Group; platformCenter: Group;
  supportsHigh: Group; supportsLow: Group;
  stairs: Group;
  terrain: Group;
  structureDetailed: Group;
  hangarLargeA: Group;
  satelliteDishLarge: Group;
  satelliteDish: Group;
  rockLargeA: Group; rockLargeB: Group;
  rocksSmallA: Group;
  crater: Group;
  pipeStraight: Group; pipeCorner: Group;
  meteor: Group; meteorDetailed: Group;
  barrel: Group;
  machineGenerator: Group;
}

let loadedModels: LoadedModels | null = null;

function applyNeonTint(model: Group, tintColor: Color, emissiveIntensity = 0.5) {
  model.traverse((child) => {
    if ((child as Mesh).isMesh) {
      const mesh = child as Mesh;
      const oldMat = mesh.material as MeshStandardMaterial;
      const newMat = new MeshStandardMaterial({
        color: oldMat.color ? oldMat.color.clone().lerp(tintColor, 0.3) : new Color(0x333355),
        emissive: tintColor,
        emissiveIntensity,
        metalness: 0.7,
        roughness: 0.2,
      });
      mesh.material = newMat;
    }
  });
}

async function preloadModels(): Promise<LoadedModels> {
  const load = async (name: string): Promise<Group> => {
    const gltf = await AssetManager.loadGLTF('./gltf/' + name + '.glb', name);
    return gltf.scene.clone() as Group;
  };

  const [
    rocketTopA, rocketTopB, rocketSidesA, rocketSidesB,
    rocketFinsA, rocketFinsB, rocketFuelA, rocketFuelB,
    rocketBaseA, rocketBaseB, platformLarge, platformCenter,
    supportsHigh, supportsLow, stairs, terrain,
    structureDetailed, hangarLargeA, satelliteDishLarge, satelliteDish,
    rockLargeA, rockLargeB, rocksSmallA, crater,
    pipeStraight, pipeCorner, meteor, meteorDetailed,
    barrel, machineGenerator,
  ] = await Promise.all([
    load('rocket_topA'), load('rocket_topB'),
    load('rocket_sidesA'), load('rocket_sidesB'),
    load('rocket_finsA'), load('rocket_finsB'),
    load('rocket_fuelA'), load('rocket_fuelB'),
    load('rocket_baseA'), load('rocket_baseB'),
    load('platform_large'), load('platform_center'),
    load('supports_high'), load('supports_low'),
    load('stairs'), load('terrain'),
    load('structure_detailed'), load('hangar_largeA'),
    load('satelliteDish_large'), load('satelliteDish'),
    load('rock_largeA'), load('rock_largeB'),
    load('rocks_smallA'), load('crater'),
    load('pipe_straight'), load('pipe_corner'),
    load('meteor'), load('meteor_detailed'),
    load('barrel'), load('machine_generator'),
  ]);

  return {
    rocketTopA, rocketTopB, rocketSidesA, rocketSidesB,
    rocketFinsA, rocketFinsB, rocketFuelA, rocketFuelB,
    rocketBaseA, rocketBaseB, platformLarge, platformCenter,
    supportsHigh, supportsLow, stairs, terrain,
    structureDetailed, hangarLargeA, satelliteDishLarge, satelliteDish,
    rockLargeA, rockLargeB, rocksSmallA, crater,
    pipeStraight, pipeCorner, meteor, meteorDetailed,
    barrel, machineGenerator,
  };
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

  // --- Kenney Space Kit: Launch Pad ---
  if (loadedModels) {
    // Central platform
    const pad = loadedModels.platformLarge.clone();
    pad.scale.setScalar(1.2);
    pad.position.set(0, 0, -4);
    applyNeonTint(pad, accentColor, 0.35);
    env.add(pad);

    // Platform center piece
    const padCenter = loadedModels.platformCenter.clone();
    padCenter.scale.setScalar(1.0);
    padCenter.position.set(0, 0.01, -4);
    applyNeonTint(padCenter, accentColor, 0.5);
    env.add(padCenter);

    // Support structures
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const support = loadedModels.supportsHigh.clone();
      support.scale.setScalar(0.8);
      support.position.set(Math.cos(angle) * 2.5, 0, Math.sin(angle) * 2.5 - 4);
      applyNeonTint(support, accentColor, 0.25);
      env.add(support);
    }

    // Stairs access
    const stairsModel = loadedModels.stairs.clone();
    stairsModel.scale.setScalar(0.7);
    stairsModel.position.set(2.0, 0, -3);
    stairsModel.rotation.y = -Math.PI / 2;
    applyNeonTint(stairsModel, accentColor, 0.2);
    env.add(stairsModel);

    // --- Environment: Hangars, Structures, Equipment ---
    // Hangar
    const hangar = loadedModels.hangarLargeA.clone();
    hangar.scale.setScalar(1.0);
    hangar.position.set(-8, 0, -6);
    hangar.rotation.y = Math.PI / 4;
    applyNeonTint(hangar, new Color(theme.wall), 0.15);
    env.add(hangar);

    // Mission control structure
    const structure = loadedModels.structureDetailed.clone();
    structure.scale.setScalar(0.9);
    structure.position.set(7, 0, -8);
    structure.rotation.y = -Math.PI / 3;
    applyNeonTint(structure, accentColor, 0.2);
    env.add(structure);

    // Satellite dishes (tracking equipment)
    const dish1 = loadedModels.satelliteDishLarge.clone();
    dish1.scale.setScalar(0.8);
    dish1.position.set(-5, 0, 4);
    dish1.rotation.y = Math.PI / 6;
    applyNeonTint(dish1, accentColor, 0.3);
    env.add(dish1);

    const dish2 = loadedModels.satelliteDish.clone();
    dish2.scale.setScalar(0.6);
    dish2.position.set(9, 0, 2);
    dish2.rotation.y = -Math.PI / 4;
    applyNeonTint(dish2, accentColor, 0.3);
    env.add(dish2);

    // Fuel pipe runs from hangar to pad
    for (let i = 0; i < 5; i++) {
      const pipe = loadedModels.pipeStraight.clone();
      pipe.scale.setScalar(0.5);
      pipe.position.set(-4 + i * 1.2, 0.1, -2);
      applyNeonTint(pipe, new Color(theme.glow), 0.2);
      env.add(pipe);
    }
    // Pipe corner at pad
    const pipeC = loadedModels.pipeCorner.clone();
    pipeC.scale.setScalar(0.5);
    pipeC.position.set(1.5, 0.1, -2);
    pipeC.rotation.y = Math.PI / 2;
    applyNeonTint(pipeC, new Color(theme.glow), 0.2);
    env.add(pipeC);

    // Terrain chunks around the pad
    const terrainPositions: [number, number, number][] = [
      [-12, 0, -10], [12, 0, -10], [-10, 0, 6], [10, 0, 6],
      [-14, 0, 0], [14, 0, 0],
    ];
    for (const [tx, ty, tz] of terrainPositions) {
      const t = loadedModels.terrain.clone();
      t.scale.setScalar(1.5);
      t.position.set(tx, ty, tz);
      t.rotation.y = Math.random() * Math.PI * 2;
      applyNeonTint(t, new Color(theme.wall), 0.08);
      env.add(t);
    }

    // Rocks and craters for terrain detail
    const rockPositions: [number, number, number][] = [
      [-6, 0, 7], [8, 0, 5], [-9, 0, -2], [11, 0, -4], [4, 0, 8],
    ];
    for (let i = 0; i < rockPositions.length; i++) {
      const [rx, ry, rz] = rockPositions[i];
      const rock = (i % 2 === 0 ? loadedModels.rockLargeA : loadedModels.rockLargeB).clone();
      rock.scale.setScalar(0.4 + Math.random() * 0.3);
      rock.position.set(rx, ry, rz);
      rock.rotation.y = Math.random() * Math.PI * 2;
      applyNeonTint(rock, accentColor, 0.1);
      env.add(rock);
    }

    // Small rock clusters
    for (let i = 0; i < 8; i++) {
      const rs = loadedModels.rocksSmallA.clone();
      rs.scale.setScalar(0.3 + Math.random() * 0.2);
      rs.position.set((Math.random() - 0.5) * 20, 0, (Math.random() - 0.5) * 20);
      rs.rotation.y = Math.random() * Math.PI * 2;
      applyNeonTint(rs, new Color(theme.wall), 0.05);
      env.add(rs);
    }

    // Crater
    const craterModel = loadedModels.crater.clone();
    craterModel.scale.setScalar(0.8);
    craterModel.position.set(-3, 0, 8);
    applyNeonTint(craterModel, new Color(theme.wall), 0.05);
    env.add(craterModel);

    // Barrels near hangar
    for (let i = 0; i < 3; i++) {
      const b = loadedModels.barrel.clone();
      b.scale.setScalar(0.4);
      b.position.set(-7 + i * 0.6, 0, -4.5);
      applyNeonTint(b, new Color(theme.glow), 0.15);
      env.add(b);
    }

    // Generator near mission control
    const gen = loadedModels.machineGenerator.clone();
    gen.scale.setScalar(0.6);
    gen.position.set(5.5, 0, -7);
    applyNeonTint(gen, accentColor, 0.2);
    env.add(gen);
  }

  // Pad edge glow ring (always present as holodeck flourish)
  const padEdge = new Mesh(new TorusGeometry(1.5, 0.03, 8, 32), new MeshBasicMaterial({ color: accentColor, transparent: true, opacity: 0.8 }));
  padEdge.rotation.x = -Math.PI / 2;
  padEdge.position.set(0, 0.11, -4);
  env.add(padEdge);

  // Floating decorations (holodeck aesthetic overlay)
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
// ORBITAL DEBRIS FIELD (Debris Dodge mission)
// ============================================================================

class OrbitalDebrisField {
  debris: OrbitalDebris[] = [];
  group: Group;

  constructor(models: LoadedModels | null) {
    this.group = new Group();
    // Create debris at various altitude bands between 150km - 400km
    const debrisBands = [150, 200, 230, 260, 290, 310, 340, 360, 380, 400];
    for (let i = 0; i < 20; i++) {
      const altBand = debrisBands[i % debrisBands.length] + (Math.random() - 0.5) * 30;
      const debrisGroup = new Group();

      if (models) {
        const model = (i % 2 === 0 ? models.meteor : models.meteorDetailed).clone();
        model.scale.setScalar(0.15 + Math.random() * 0.2);
        model.traverse((child) => {
          if ((child as Mesh).isMesh) {
            (child as Mesh).material = new MeshStandardMaterial({
              color: new Color(0x888899),
              emissive: new Color(0xff4400),
              emissiveIntensity: 0.15 + Math.random() * 0.1,
              metalness: 0.6,
              roughness: 0.4,
            });
          }
        });
        debrisGroup.add(model);
      } else {
        // Fallback procedural debris
        const geos = [
          new BoxGeometry(0.08, 0.08, 0.08),
          new ConeGeometry(0.05, 0.1, 4),
          new SphereGeometry(0.05, 4, 4),
        ];
        const mesh = new Mesh(geos[i % 3], new MeshStandardMaterial({
          color: 0x888899, emissive: 0xff4400, emissiveIntensity: 0.2,
        }));
        debrisGroup.add(mesh);
      }

      // Add a warning glow around each debris piece
      const glowMesh = new Mesh(
        new SphereGeometry(0.12, 6, 6),
        new MeshBasicMaterial({ color: 0xff4400, transparent: true, blending: AdditiveBlending, opacity: 0.15 })
      );
      debrisGroup.add(glowMesh);

      const orbitRadius = 2 + Math.random() * 4;
      const orbitSpeed = 0.3 + Math.random() * 0.5;
      const orbitPhase = Math.random() * Math.PI * 2;
      // Map altitude to scene Y position (matching game's 1m = 10km)
      const sceneY = 0.1 + (altBand * 1000 / 10000);
      debrisGroup.position.set(
        Math.cos(orbitPhase) * orbitRadius,
        sceneY,
        Math.sin(orbitPhase) * orbitRadius - 4
      );
      debrisGroup.visible = false;
      this.group.add(debrisGroup);

      this.debris.push({
        group: debrisGroup,
        orbitRadius,
        orbitSpeed,
        orbitPhase,
        altitudeKm: altBand,
        hitRadius: 0.3,
        active: true,
      });
    }
  }

  update(playerAltitude: number, time: number, playerX: number, playerY: number): { hit: boolean; nearMiss: boolean } {
    let hit = false;
    let nearMiss = false;
    const playerAltKm = playerAltitude / 1000;

    for (const d of this.debris) {
      if (!d.active) { d.group.visible = false; continue; }

      // Only show debris within ±100km of player altitude
      const altDiff = Math.abs(playerAltKm - d.altitudeKm);
      d.group.visible = altDiff < 100 && playerAltKm > 50;

      if (!d.group.visible) continue;

      // Orbit the debris around center
      const angle = time * d.orbitSpeed + d.orbitPhase;
      const sceneY = 0.1 + (d.altitudeKm * 1000 / 10000);
      d.group.position.x = Math.cos(angle) * d.orbitRadius;
      d.group.position.y = Math.min(sceneY, 6);
      d.group.position.z = Math.sin(angle) * d.orbitRadius - 4;

      // Spin
      d.group.rotation.x += d.orbitSpeed * 0.02;
      d.group.rotation.z += d.orbitSpeed * 0.015;

      // Pulsate warning glow
      const glowChild = d.group.children[1];
      if (glowChild && (glowChild as Mesh).material) {
        const proximity = 1 - Math.min(1, altDiff / 50);
        ((glowChild as Mesh).material as MeshBasicMaterial).opacity = 0.1 + proximity * 0.3;
      }

      // Collision check (altitude-based proximity + XY distance in scene)
      if (altDiff < 15) {
        const dx = d.group.position.x - playerX;
        const dy = d.group.position.y - playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < d.hitRadius) {
          hit = true;
        } else if (dist < d.hitRadius * 2.5) {
          nearMiss = true;
        }
      }
    }

    return { hit, nearMiss };
  }

  reset() {
    for (const d of this.debris) d.active = true;
  }
}

// ============================================================================
// ROCKET BUILDER
// ============================================================================

// ============================================================================
// STARFIELD SYSTEM
// ============================================================================

class Starfield {
  stars: Mesh[] = [];
  group: Group;

  constructor() {
    this.group = new Group();
    const starGeo = new SphereGeometry(0.01, 4, 4);
    for (let i = 0; i < 200; i++) {
      const brightness = 0.3 + Math.random() * 0.7;
      const mat = new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: AdditiveBlending,
        opacity: brightness * 0.6,
      });
      const star = new Mesh(starGeo, mat);
      star.position.set(
        (Math.random() - 0.5) * 30,
        5 + Math.random() * 20,
        (Math.random() - 0.5) * 30,
      );
      star.userData.twinklePhase = Math.random() * Math.PI * 2;
      star.userData.twinkleSpeed = 1 + Math.random() * 2;
      star.userData.baseBrightness = brightness;
      star.scale.setScalar(0.5 + Math.random() * 1.5);
      this.group.add(star);
      this.stars.push(star);
    }
    this.group.visible = false;
  }

  update(altitude: number, time: number) {
    // Stars appear as altitude increases (above 50km)
    const altKm = altitude / 1000;
    const visibility = Math.min(1, Math.max(0, (altKm - 30) / 70));
    this.group.visible = visibility > 0.01;

    if (!this.group.visible) return;

    for (const star of this.stars) {
      const twinkle = 0.5 + 0.5 * Math.sin(time * star.userData.twinkleSpeed + star.userData.twinklePhase);
      (star.material as MeshBasicMaterial).opacity = star.userData.baseBrightness * visibility * twinkle;
    }
  }
}

// ============================================================================
// ROCKET BUILDER
// ============================================================================

function buildRocket(skin: RocketSkin, stages: number, fuelType = 'standard'): Group {
  const rocket = new Group();
  const bodyColor = new Color(skin.body);
  const accentColor = new Color(skin.accent);

  if (loadedModels) {
    // Kenney Space Kit modular rocket
    // Use variant A or B based on skin index for variety
    const useB = skin.name.includes('Gold') || skin.name.includes('Silver') || skin.name.includes('Chrome');

    // Nose cone
    const nose = (useB ? loadedModels.rocketTopB : loadedModels.rocketTopA).clone();
    nose.scale.setScalar(0.3);
    const noseY = stages === 3 ? 2.0 : 1.6;
    nose.position.y = noseY;
    applyNeonTint(nose, accentColor, 0.5);
    // Override base color for skin
    nose.traverse((child) => {
      if ((child as Mesh).isMesh) {
        (child as Mesh).material = new MeshStandardMaterial({
          color: bodyColor, emissive: accentColor, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.3,
        });
      }
    });
    rocket.add(nose);

    // Stage bodies - use sides + fuel modules
    const stageYPositions = stages === 3 ? [1.5, 1.0, 0.5] : [1.2, 0.6];
    for (let s = 0; s < stages; s++) {
      const sides = (s % 2 === 0 ? loadedModels.rocketSidesA : loadedModels.rocketSidesB).clone();
      sides.scale.setScalar(0.3);
      sides.position.y = stageYPositions[s];
      sides.traverse((child) => {
        if ((child as Mesh).isMesh) {
          (child as Mesh).material = new MeshStandardMaterial({
            color: bodyColor, emissive: accentColor, emissiveIntensity: 0.2, metalness: 0.5, roughness: 0.3,
          });
        }
      });
      rocket.add(sides);

      // Fuel tank between stages
      if (s < stages - 1) {
        const fuel = (s % 2 === 0 ? loadedModels.rocketFuelA : loadedModels.rocketFuelB).clone();
        fuel.scale.setScalar(0.3);
        fuel.position.y = stageYPositions[s] - 0.3;
        fuel.traverse((child) => {
          if ((child as Mesh).isMesh) {
            (child as Mesh).material = new MeshStandardMaterial({
              color: bodyColor.clone().multiplyScalar(0.8), emissive: accentColor, emissiveIntensity: 0.15, metalness: 0.6, roughness: 0.4,
            });
          }
        });
        rocket.add(fuel);
      }
    }

    // Fins
    const fins = (useB ? loadedModels.rocketFinsB : loadedModels.rocketFinsA).clone();
    const finsY = stages === 3 ? 0.2 : 0.15;
    fins.scale.setScalar(0.3);
    fins.position.y = finsY;
    fins.traverse((child) => {
      if ((child as Mesh).isMesh) {
        (child as Mesh).material = new MeshStandardMaterial({
          color: accentColor, emissive: accentColor, emissiveIntensity: 0.5, metalness: 0.7, roughness: 0.2,
        });
      }
    });
    rocket.add(fins);

    // Engine base
    const base = (useB ? loadedModels.rocketBaseB : loadedModels.rocketBaseA).clone();
    base.scale.setScalar(0.3);
    base.position.y = stages === 3 ? 0.0 : -0.1;
    base.traverse((child) => {
      if ((child as Mesh).isMesh) {
        (child as Mesh).material = new MeshStandardMaterial({
          color: new Color(0x666688), emissive: accentColor, emissiveIntensity: 0.2, metalness: 0.7, roughness: 0.3,
        });
      }
    });
    rocket.add(base);
  } else {
    // Fallback: procedural geometry if models not yet loaded
    const noseCone = new Mesh(new ConeGeometry(0.18, 0.6, 8), new MeshStandardMaterial({ color: bodyColor, emissive: accentColor, emissiveIntensity: 0.3 }));
    noseCone.position.y = stages === 3 ? 3.2 : 2.6;
    rocket.add(noseCone);
    const stageHeights = stages === 3 ? [1.0, 0.8, 0.6] : [1.2, 1.0];
    const stageRadii = stages === 3 ? [0.22, 0.2, 0.18] : [0.22, 0.18];
    let yOff = stages === 3 ? 2.5 : 2.0;
    for (let s = 0; s < stages; s++) {
      const h = stageHeights[s]; const r = stageRadii[s];
      const body = new Mesh(new CylinderGeometry(r, r, h, 8), new MeshStandardMaterial({ color: bodyColor, emissive: accentColor, emissiveIntensity: 0.15 }));
      body.position.y = yOff;
      rocket.add(body);
      yOff -= h + 0.05;
    }
    const nozzle = new Mesh(new ConeGeometry(0.15, 0.25, 8), new MeshStandardMaterial({ color: 0x666688, emissive: 0x333344, emissiveIntensity: 0.3 }));
    nozzle.position.y = yOff + 0.05;
    nozzle.rotation.x = Math.PI;
    rocket.add(nozzle);
  }

  // Exhaust flame (works with both model and procedural rockets)
  // Fuel-type specific flame colors
  const fuelFlameColor = fuelType === 'high-thrust' ? '#ff4400' : fuelType === 'efficient' ? '#4488ff' : skin.flame;
  const flameYBase = stages === 3 ? -0.3 : -0.4;
  const flameGeo = new ConeGeometry(fuelType === 'high-thrust' ? 0.15 : 0.12, fuelType === 'high-thrust' ? 1.0 : 0.8, 8);
  const flameMat = new MeshBasicMaterial({ color: new Color(fuelFlameColor), transparent: true, blending: AdditiveBlending, opacity: 0 });
  const flame = new Mesh(flameGeo, flameMat);
  flame.rotation.x = Math.PI;
  flame.position.y = flameYBase;
  flame.name = 'flame';
  rocket.add(flame);

  // Exhaust glow
  const glowGeo = new SphereGeometry(fuelType === 'high-thrust' ? 0.25 : 0.2, 8, 8);
  const glowMat = new MeshBasicMaterial({ color: new Color(fuelFlameColor), transparent: true, blending: AdditiveBlending, opacity: 0 });
  const glow = new Mesh(glowGeo, glowMat);
  glow.position.y = flameYBase + 0.2;
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
// SPEED LINE SYSTEM
// ============================================================================

class SpeedLines {
  lines: Mesh[] = [];
  group: Group;

  constructor() {
    this.group = new Group();
    const geo = new BoxGeometry(0.005, 0.4, 0.005);
    const mat = new MeshBasicMaterial({ color: 0x00ffff, transparent: true, blending: AdditiveBlending, opacity: 0 });
    for (let i = 0; i < 30; i++) {
      const line = new Mesh(geo.clone(), mat.clone());
      line.position.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, -2 - Math.random() * 3);
      line.visible = false;
      this.group.add(line);
      this.lines.push(line);
    }
  }

  update(intensity: number, dt: number) {
    for (const line of this.lines) {
      if (intensity > 0.1) {
        line.visible = true;
        (line.material as MeshBasicMaterial).opacity = intensity * 0.4;
        line.position.y -= (2 + intensity * 8) * dt;
        line.scale.y = 1 + intensity * 3;
        if (line.position.y < -3) {
          line.position.y = 3;
          line.position.x = (Math.random() - 0.5) * 3;
          line.position.z = -2 - Math.random() * 3;
        }
      } else {
        line.visible = false;
      }
    }
  }
}

// ============================================================================
// ORBIT RING VISUALIZATION
// ============================================================================

function buildOrbitRing(): { ring: Mesh; glow: Mesh; group: Group } {
  const group = new Group();
  const ringGeo = new TorusGeometry(2.0, 0.015, 8, 64);
  const ringMat = new MeshBasicMaterial({ color: 0x9966ff, transparent: true, blending: AdditiveBlending, opacity: 0 });
  const ring = new Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  const glowGeo = new TorusGeometry(2.0, 0.04, 8, 64);
  const glowMat = new MeshBasicMaterial({ color: 0x6633cc, transparent: true, blending: AdditiveBlending, opacity: 0 });
  const glow = new Mesh(glowGeo, glowMat);
  glow.rotation.x = Math.PI / 2;
  group.add(glow);

  group.position.set(0, 5.5, -4); // Near top of scene
  return { ring, glow, group };
}

// ============================================================================
// STAGE DEBRIS BUILDER
// ============================================================================

function buildStageDebris(skin: RocketSkin): Group {
  const debris = new Group();
  const bodyColor = new Color(skin.body);
  const accentColor = new Color(skin.accent);

  if (loadedModels) {
    // Use a Kenney rocket sides piece as debris
    const piece = loadedModels.rocketSidesA.clone();
    piece.scale.setScalar(0.35);
    piece.traverse((child) => {
      if ((child as Mesh).isMesh) {
        const mat = new MeshStandardMaterial({
          color: bodyColor, emissive: accentColor, emissiveIntensity: 0.3,
          transparent: true, opacity: 0.8, metalness: 0.5, roughness: 0.3,
        });
        (child as Mesh).material = mat;
      }
    });
    debris.add(piece);

    // Add engine base piece
    const nozzlePiece = loadedModels.rocketBaseA.clone();
    nozzlePiece.scale.setScalar(0.3);
    nozzlePiece.position.y = -0.4;
    nozzlePiece.traverse((child) => {
      if ((child as Mesh).isMesh) {
        (child as Mesh).material = new MeshStandardMaterial({
          color: new Color(0x666688), emissive: accentColor, emissiveIntensity: 0.2,
          transparent: true, opacity: 0.8, metalness: 0.6, roughness: 0.3,
        });
      }
    });
    debris.add(nozzlePiece);
  } else {
    // Fallback procedural
    const body = new Mesh(
      new CylinderGeometry(0.2, 0.2, 0.6, 8),
      new MeshStandardMaterial({ color: bodyColor, emissive: accentColor, emissiveIntensity: 0.2 })
    );
    debris.add(body);
    const nozzle = new Mesh(
      new ConeGeometry(0.12, 0.2, 8),
      new MeshStandardMaterial({ color: 0x666688, emissive: 0x333344, emissiveIntensity: 0.2 })
    );
    nozzle.position.y = -0.4;
    nozzle.rotation.x = Math.PI;
    debris.add(nozzle);
  }

  return debris;
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
  world.scene.background = new Color(0x050510);

  // Initialize AssetManager and preload Kenney models
  AssetManager.init(world.renderer, world);
  try {
    loadedModels = await preloadModels();
  } catch (e) {
    console.warn('Failed to load some Kenney models, using procedural fallback:', e);
  }

  const game = new GameStateManager();
  const audio = new AudioManager();
  const particles = new ParticlePool(150);
  world.scene.add(particles.group);

  // Build environment
  let envGroup = buildHolodeck(game.themes[game.currentThemeIndex]);
  world.scene.add(envGroup);

  // Build rocket
  const skin = game.skins[game.currentSkinIndex];
  let rocketGroup = buildRocket(skin, game.config.stages, game.config.fuelType);
  rocketGroup.position.set(0, 0.1, -4);
  world.scene.add(rocketGroup);

  // Trail renderer
  const trail = new TrailRenderer(skin.accent);
  world.scene.add(trail.line);

  // Speed lines (attached to camera area)
  const speedLines = new SpeedLines();
  world.scene.add(speedLines.group);

  // Orbit ring visualization
  const orbitVis = buildOrbitRing();
  world.scene.add(orbitVis.group);

  // Starfield (appears at high altitude)
  const starfield = new Starfield();
  world.scene.add(starfield.group);

  // Orbital debris field (for Debris Dodge mission)
  const debrisField = new OrbitalDebrisField(loadedModels);
  debrisField.group.visible = false;
  world.scene.add(debrisField.group);
  let nearMissCount = 0;
  let nearMissTimer = 0;

  // Callout text state
  let calloutText = '';
  let calloutTimer = 0;

  function showCallout(text: string, duration = 3) {
    calloutText = text;
    calloutTimer = duration;
  }

  // Check callout triggers
  function checkCallouts() {
    const f = game.flight;
    const fire = (trigger: string) => {
      const c = game.callouts.find(x => x.trigger === trigger && !x.fired);
      if (c) { c.fired = true; showCallout(c.message); }
    };

    if (f.altitude > 10 && f.velocity > 10) fire('liftoff');
    if (f.altitude >= 10000) fire('altitude_10km');
    if (f.altitude >= 50000) fire('altitude_50km');
    if (f.altitude >= 100000) fire('karman_line');
    if (f.fuel <= 50 && f.fuel > 0) fire('fuel_50');
    if (f.fuel <= 20 && f.fuel > 0) fire('fuel_20');
    if (f.fuel <= 5 && f.fuel > 0) fire('fuel_5');
    const target = game.currentMission.target * 1000;
    if (target > 0 && f.altitude >= target * 0.5) fire('orbit_50pct');
    if (target > 0 && f.altitude >= target * 0.9) fire('orbit_90pct');
    if (game.maxG >= 5) fire('high_g');

    // Max-Q: peak dynamic pressure (roughly 10-30km altitude at high speed)
    const altKm = f.altitude / 1000;
    const atmDensity = Math.exp(-altKm / 8.5);
    const dynP = 0.5 * atmDensity * f.velocity * f.velocity * 0.001;
    if (dynP > 50 && altKm > 8 && altKm < 40) fire('max_q');
  }

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
    rocketGroup = buildRocket(s, game.config.stages, game.config.fuelType);
    rocketGroup.position.set(0, 0.1, -4);
    world.scene.add(rocketGroup);
    trail.clear();
    // Clear debris
    for (const d of game.stageDebris) world.scene.remove(d.group);
    game.stageDebris = [];
  }

  function spawnStageDebris() {
    const s = game.skins[game.currentSkinIndex];
    const debris = buildStageDebris(s);
    debris.position.copy(rocketGroup.position);
    debris.position.y -= 0.3;
    world.scene.add(debris);
    game.stageDebris.push({
      group: debris,
      vy: -1.5 - Math.random() * 0.5,
      vx: (Math.random() - 0.5) * 0.5,
      rot: (Math.random() - 0.5) * 3,
      life: 4,
    });
  }

  function applyTheme() {
    world.scene.remove(envGroup);
    envGroup = buildHolodeck(game.themes[game.currentThemeIndex]);
    world.scene.add(envGroup);
    game.themesUsed.add(game.themes[game.currentThemeIndex].name);
    const fogColor = new Color(game.themes[game.currentThemeIndex].fog);
    world.scene.fog = new Fog(fogColor.getHex(), 5, 30);
    world.scene.background = fogColor.clone();
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
    game.cameraShakeIntensity = 0;
    game.speedLineIntensity = 0;
    countdownValue = 5;
    setState('countdown');
    audio.playSfx('gameStart');
  }

  function startTutorial() {
    game.tutorialMode = true;
    game.tutorialStep = 0;
    game.missionIndex = 0;
    game.currentMission = MISSIONS[0]; // Low Orbit for tutorial
    game.config.stages = 2;
    game.config.fuelType = 'standard';
    rebuildRocket();
    startCountdown();
  }

  function startFlight() {
    setState('flying');
    audio.playSfx('ignition');
    audio.startMusic();
    // Track fuel type for achievement
    game.fuelTypesUsed.add(game.config.fuelType);
    // Reset debris field for Debris Dodge
    debrisField.reset();
    nearMissCount = 0;
    nearMissTimer = 0;
  }

  function endFlight(success: boolean) {
    audio.stopMusic();
    const f = game.flight;
    game.totalLaunches++;
    // Enhanced scoring: weather bonus + difficulty multiplier + near-miss bonus
    const weatherBonus = game.weather.windSpeed > 0 ? game.weather.windSpeed * 10 : 0;
    const nearMissBonus = game.currentMission.name === 'Debris Dodge' ? nearMissCount * 500 : 0;
    const diffMult = game.difficulty === 0 ? 0.7 : game.difficulty === 2 ? 1.5 : 1.0;
    f.score = Math.floor((f.maxAltitude / 100 + f.maxVelocity / 10 + f.fuel * 50 + weatherBonus + nearMissBonus) * diffMult);
    if (f.score > 100000) f.score = 100000;
    game.totalScore += f.score;
    if (f.score > game.bestScore) game.bestScore = f.score;
    if (f.maxAltitude > game.bestAltitude) game.bestAltitude = f.maxAltitude;

    // Leaderboard history
    game.history.push({
      mission: game.currentMission.name,
      score: f.score,
      altitude: f.maxAltitude,
      time: f.missionTime,
      date: new Date().toISOString().slice(0, 10),
    });
    if (game.history.length > 20) game.history = game.history.slice(-20);

    if (success) {
      game.totalMissionsDone++;
      game.consecutiveNoAbort++;
      const mName = game.currentMission.name;
      if (mName !== 'Daily Mission') game.missionsCompleted.add(mName);
      if (game.currentMission.payload === 'crew') game.crewMissions++;
      // Career mode: unlock next mission
      if (game.careerMode && game.missionIndex === game.careerUnlocked - 1 && game.careerUnlocked < MISSIONS.length) {
        game.careerUnlocked++;
        showToast('New mission unlocked!');
      }
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
      game.consecutiveNoAbort = 0;
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
    // Reset milestones for next flight
    game.milestoneTriggered.clear();
    game.throttleChanged = false;
    game.altitudeDropped = false;
    game.peakAltBeforeDrop = 0;
    game.tutorialMode = false;
    game.tutorialStep = 0;
    // Clear debris
    for (const d of game.stageDebris) world.scene.remove(d.group);
    game.stageDebris = [];
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

      // Callout timer
      if (calloutTimer > 0) calloutTimer -= dt;

      // Update stage debris
      for (let i = game.stageDebris.length - 1; i >= 0; i--) {
        const d = game.stageDebris[i];
        d.life -= dt;
        if (d.life <= 0) {
          world.scene.remove(d.group);
          game.stageDebris.splice(i, 1);
          continue;
        }
        d.group.position.y += d.vy * dt;
        d.group.position.x += d.vx * dt;
        d.group.rotation.x += d.rot * dt;
        d.group.rotation.z += d.rot * 0.5 * dt;
        d.vy -= 2 * dt; // gravity
        // Fade out
        d.group.traverse((child) => {
          if ((child as Mesh).material && 'opacity' in (child as Mesh).material) {
            ((child as Mesh).material as MeshBasicMaterial).opacity = d.life / 4;
          }
        });
      }

      // Camera shake decay
      if (game.cameraShakeIntensity > 0) {
        game.cameraShakeIntensity *= 0.92;
        if (game.cameraShakeIntensity < 0.001) game.cameraShakeIntensity = 0;
      }

      // Speed lines
      if (game.state === 'flying') {
        const velNorm = Math.min(1, game.flight.velocity / 5000);
        game.speedLineIntensity = velNorm > 0.3 ? (velNorm - 0.3) / 0.7 : 0;
      } else {
        game.speedLineIntensity = 0;
      }
      speedLines.update(game.speedLineIntensity, dt);

      // Orbit ring visualization
      if (game.state === 'flying' && game.currentMission.target > 0) {
        const progress = Math.min(1, game.flight.altitude / (game.currentMission.target * 1000));
        const ringOpacity = progress > 0.3 ? (progress - 0.3) * 1.4 : 0;
        (orbitVis.ring.material as MeshBasicMaterial).opacity = ringOpacity * 0.6;
        (orbitVis.glow.material as MeshBasicMaterial).opacity = ringOpacity * 0.3;
        // Pulse when close
        if (progress > 0.8) {
          const pulse = 0.5 + 0.5 * Math.sin(time * 4);
          (orbitVis.ring.material as MeshBasicMaterial).opacity = ringOpacity * (0.4 + pulse * 0.6);
        }
        orbitVis.group.visible = true;
      } else {
        orbitVis.group.visible = false;
      }

      // Starfield update
      if (game.state === 'flying') {
        starfield.update(game.flight.altitude, time);
        // Dynamic sky: darken as altitude increases
        const altKm = game.flight.altitude / 1000;
        const skyDarken = Math.min(1, altKm / 100);
        const theme = game.themes[game.currentThemeIndex];
        const baseFog = new Color(theme.fog);
        const spaceFog = new Color(0x000005);
        const currentFog = baseFog.clone().lerp(spaceFog, skyDarken);
        if (world.scene.fog) {
          (world.scene.fog as Fog).color.copy(currentFog);
        }
        if (world.scene.background) {
          (world.scene.background as Color).copy(currentFog);
        }
      } else {
        starfield.group.visible = false;
      }

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
        if (kb.getKeyPressed('KeyW') || kb.getKeyPressed('ArrowUp')) { f.throttle = Math.min(100, f.throttle + 30 * dt); game.throttleChanged = true; }
        if (kb.getKeyPressed('KeyS') || kb.getKeyPressed('ArrowDown')) { f.throttle = Math.max(0, f.throttle - 30 * dt); game.throttleChanged = true; }
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
            spawnStageDebris();
            game.cameraShakeIntensity = 0.3;
            // Fire callout
            const sc = game.callouts.find(x => x.trigger === 'separation' && !x.fired);
            if (sc) { sc.fired = true; showCallout(sc.message); }
          }
        }
        if (kb.getKeyDown('Escape') || kb.getKeyDown('KeyP')) {
          // Toggle pause
          if (game.state === 'flying') {
            game.state = 'title'; // Go back to title acts as abort
            game.consecutiveNoAbort = 0;
            audio.playSfx('abort');
            endFlight(false);
            return;
          }
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
              spawnStageDebris();
              game.cameraShakeIntensity = 0.3;
              const sc = game.callouts.find(x => x.trigger === 'separation' && !x.fired);
              if (sc) { sc.fired = true; showCallout(sc.message); }
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

        // Track dynamic pressure
        f.currentQ = 0.5 * atmDensity * f.velocity * f.velocity * 0.001;
        if (f.currentQ > f.maxQ) f.maxQ = f.currentQ;

        // Weather effects (diminish with altitude)
        const weatherFactor = Math.max(0, 1 - altKm / 100); // weather fades above 100km
        const windForce = game.weather.windSpeed * weatherFactor * 0.3;
        const turbJitter = game.weather.turbulence * weatherFactor * (Math.random() - 0.5) * 15;
        const headwindDrag = game.weather.headwind * weatherFactor * 0.5;

        if (f.fuel > 0 && f.throttle > 0) {
          const thrustForce = f.thrust * (f.throttle / 100);
          f.fuel -= (f.throttle / 100) * dt * (game.config.fuelType === 'efficient' ? 2.5 : game.config.fuelType === 'high-thrust' ? 5 : 3.5);
          if (f.fuel < 0) f.fuel = 0;
          f.acceleration = (thrustForce / f.mass) - grav - (drag / f.mass) - (headwindDrag / f.mass);
        } else {
          f.acceleration = -grav - (drag / f.mass) - (headwindDrag / f.mass);
        }

        // Track max G
        const gForce = Math.abs(f.acceleration) / 9.81;
        if (gForce > game.maxG) game.maxG = gForce;
        if (Math.abs(f.angle) > 10) game.smoothAngle = false;

        // Track altitude drops for achievement
        if (f.altitude > game.peakAltBeforeDrop) game.peakAltBeforeDrop = f.altitude;
        if (game.peakAltBeforeDrop - f.altitude > 100000 && f.altitude > 0) game.altitudeDropped = true;

        const angleRad = (f.angle * Math.PI) / 180;
        const verticalAccel = f.acceleration * Math.cos(angleRad);
        const horizontalAccel = f.acceleration * Math.sin(angleRad) + windForce + turbJitter;

        f.velocity += verticalAccel * dt;
        f.altitude += f.velocity * dt;
        if (f.altitude < 0) f.altitude = 0;
        if (f.velocity > f.maxVelocity) f.maxVelocity = f.velocity;
        if (f.altitude > f.maxAltitude) f.maxAltitude = f.altitude;

        // Altitude milestones
        for (const ms of ALTITUDE_MILESTONES) {
          if (f.altitude >= ms.altitude && !game.milestoneTriggered.has(ms.altitude)) {
            game.milestoneTriggered.add(ms.altitude);
            showToast(ms.name + ' - ' + (ms.altitude / 1000) + 'km');
            audio.playSfx('achievement');
          }
        }

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

        // Camera shake during flight
        if (game.cameraShakeIntensity > 0.01) {
          const shk = game.cameraShakeIntensity;
          rocketGroup.position.x += (Math.random() - 0.5) * shk * 0.1;
          rocketGroup.position.y += (Math.random() - 0.5) * shk * 0.05;
        }
        // Add shake on high thrust
        if (f.throttle > 80 && f.fuel > 0 && f.altitude < 50000) {
          game.cameraShakeIntensity = Math.max(game.cameraShakeIntensity, 0.05 * (f.throttle / 100));
        }

        // Re-entry physics (for Re-entry Run mission)
        if (game.currentMission.name === 'Re-entry Run') {
          const re = game.reentry;
          if (f.velocity < 0) re.descending = true;
          if (re.descending && f.altitude < 100000 && f.altitude > 0) {
            // Heat builds with speed and atmosphere density
            const heatRate = Math.abs(f.velocity) * atmDensity * 0.02;
            re.heat = Math.min(100, re.heat + heatRate * dt);
            re.temperature = 300 + re.heat * 30; // Up to 3300K
            if (re.heat > re.peakHeat) re.peakHeat = re.heat;
            // Shield degrades at high heat
            if (re.heat > 60) {
              re.shieldHP -= (re.heat - 60) * 0.05 * dt;
            }
            // Shield failure = mission fail
            if (re.shieldHP <= 0) {
              audio.playSfx('explosion');
              particles.burst(rocketGroup.position.x, rocketGroup.position.y, rocketGroup.position.z, 30, '#ff2200', 5, 1.5);
              showToast('Heat shield failure!');
              endFlight(false);
              return;
            }
            // Success: survived to ground
            if (f.altitude <= 500 && Math.abs(f.velocity) < 100) {
              showToast('Safe re-entry!');
              endFlight(true);
              return;
            }
          }
        }

        // Check mission control callouts
        checkCallouts();

        // Tutorial step check
        if (game.tutorialMode && game.tutorialStep < TUTORIAL_STEPS.length) {
          const step = TUTORIAL_STEPS[game.tutorialStep];
          if (step.check(game)) {
            game.tutorialStep++;
            if (game.tutorialStep < TUTORIAL_STEPS.length) {
              showToast('Step complete!');
              audio.playSfx('achievement');
            }
          }
        }

        // Fuel warning
        if (f.fuel <= 10 && f.fuel > 0 && Math.floor(f.missionTime * 2) % 2 === 0) {
          // visual warning handled in HUD
        }

        // Max-Q camera shake
        if (f.currentQ > f.maxQ * 0.8 && f.currentQ > 30 && altKm > 8 && altKm < 40) {
          const qIntensity = Math.min(1, f.currentQ / 80);
          game.cameraShakeIntensity = Math.max(game.cameraShakeIntensity, 0.08 * qIntensity);
        }

        // Orbital debris field (Debris Dodge mission)
        if (game.currentMission.name === 'Debris Dodge') {
          debrisField.group.visible = true;
          nearMissTimer -= dt;
          const result = debrisField.update(f.altitude, time, rocketGroup.position.x, rocketGroup.position.y);
          if (result.hit) {
            audio.playSfx('explosion');
            particles.burst(rocketGroup.position.x, rocketGroup.position.y, rocketGroup.position.z, 30, '#ff4400', 5, 1.5);
            showToast('DEBRIS COLLISION!');
            game.cameraShakeIntensity = 0.8;
            endFlight(false);
            return;
          }
          if (result.nearMiss && nearMissTimer <= 0) {
            nearMissCount++;
            nearMissTimer = 1.5; // Cooldown between near-miss notifications
            showToast('NEAR MISS! (' + nearMissCount + ')');
            audio.playSfx('warning');
            game.cameraShakeIntensity = Math.max(game.cameraShakeIntensity, 0.15);
            particles.burst(rocketGroup.position.x, rocketGroup.position.y, rocketGroup.position.z, 5, '#ffcc00', 1, 0.3);
          }
        } else {
          debrisField.group.visible = false;
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
    'help', 'toast', 'stats', 'skins', 'telemetry', 'weather', 'career', 'altimeter',
    'tutorial', 'orbit-info', 'callout', 'reentry', 'custom-mission',
  ];

  const panelEntities: Record<string, any> = {};

  function createWorldPanel(config: string, x: number, y: number, z: number, w: number, h: number) {
    const e = world.createTransformEntity(undefined, { persistent: true });
    e.object3D!.position.set(x, y, z);
    e.addComponent(PanelUI, { config, maxWidth: w, maxHeight: h });
    return e;
  }

  function createFollowerPanel(config: string, ox: number, oy: number, oz: number, w: number, h: number, screenSpaceOpts?: { width: string; height: string; top?: string; bottom?: string; left?: string; right?: string; zOffset?: number }) {
    const e = world.createTransformEntity(undefined, { persistent: true });
    e.addComponent(PanelUI, { config, maxWidth: w, maxHeight: h });
    // In browser mode: ScreenSpace handles CSS-like positioning.
    // In XR mode: ScreenSpace auto-returns to world space, Follower takes over.
    if (screenSpaceOpts) {
      e.addComponent(ScreenSpace, {
        width: screenSpaceOpts.width,
        height: screenSpaceOpts.height,
        top: screenSpaceOpts.top ?? 'auto',
        bottom: screenSpaceOpts.bottom ?? 'auto',
        left: screenSpaceOpts.left ?? 'auto',
        right: screenSpaceOpts.right ?? 'auto',
        zOffset: screenSpaceOpts.zOffset ?? 0.3,
      });
    }
    // Follower still added -- in XR mode (when ScreenSpace returns to world space),
    // the panel follows the player's head
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
  panelEntities['weather'] = createWorldPanel('./ui/weather.json', 0, 1.6, -2, 0.5, 0.65);
  panelEntities['career'] = createWorldPanel('./ui/career.json', 0, 1.6, -2, 0.55, 0.9);
  panelEntities['altimeter'] = createFollowerPanel('./ui/altimeter.json', -0.32, 0.05, -0.5, 0.15, 0.25);

  // New panels
  panelEntities['tutorial'] = createFollowerPanel('./ui/tutorial.json', 0, 0.2, -0.6, 0.35, 0.15);
  panelEntities['orbit-info'] = createFollowerPanel('./ui/orbit-info.json', 0.35, 0.05, -0.5, 0.2, 0.18);
  panelEntities['callout'] = createFollowerPanel('./ui/callout.json', 0, 0.25, -0.6, 0.35, 0.08);
  panelEntities['reentry'] = createFollowerPanel('./ui/reentry.json', 0.35, -0.15, -0.5, 0.2, 0.18);
  panelEntities['custom-mission'] = createWorldPanel('./ui/custom-mission.json', 0, 1.6, -2, 0.5, 0.7);

  // Follower panels (HUDs)
  panelEntities['hud'] = createFollowerPanel('./ui/hud.json', 0.3, -0.12, -0.5, 0.4, 0.2);
  panelEntities['throttle'] = createFollowerPanel('./ui/throttle.json', -0.3, -0.15, -0.5, 0.18, 0.08);
  panelEntities['countdown'] = createFollowerPanel('./ui/countdown.json', 0, 0.05, -0.6, 0.2, 0.15);
  panelEntities['toast'] = createFollowerPanel('./ui/toast.json', 0, 0.15, -0.5, 0.4, 0.06);
  panelEntities['telemetry'] = createFollowerPanel('./ui/telemetry.json', -0.35, -0.05, -0.5, 0.25, 0.2);

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
    telemetry: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/telemetry.json')] },
    weather: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/weather.json')] },
    career: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/career.json')] },
    altimeter: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/altimeter.json')] },
    tutorial: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/tutorial.json')] },
    orbitInfo: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/orbit-info.json')] },
    calloutPanel: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/callout.json')] },
    reentry: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/reentry.json')] },
    customMission: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/custom-mission.json')] },
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
          this.bindButton('title', 'btn-weather', () => { audio.playSfx('click'); setState('weather'); });
          this.bindButton('title', 'btn-career', () => { audio.playSfx('click'); setState('career'); });
          this.bindButton('title', 'btn-leaderboard', () => { audio.playSfx('click'); setState('leaderboard'); });
          this.bindButton('title', 'btn-tutorial', () => { audio.playSfx('click'); startTutorial(); });
          this.bindButton('title', 'btn-custom', () => { audio.playSfx('click'); setState('custom-mission'); });
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
          this.bindButton('difficulty', 'btn-easy', () => { audio.playSfx('click'); game.difficulty = 0; });
          this.bindButton('difficulty', 'btn-medium', () => { audio.playSfx('click'); game.difficulty = 1; });
          this.bindButton('difficulty', 'btn-hard', () => { audio.playSfx('click'); game.difficulty = 2; });
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

        case 'weather':
          this.bindButton('weather', 'btn-weather-prev', () => {
            game.weatherIndex = (game.weatherIndex - 1 + WEATHER_CONDITIONS.length) % WEATHER_CONDITIONS.length;
            game.weather = WEATHER_CONDITIONS[game.weatherIndex];
            audio.playSfx('click');
          });
          this.bindButton('weather', 'btn-weather-next', () => {
            game.weatherIndex = (game.weatherIndex + 1) % WEATHER_CONDITIONS.length;
            game.weather = WEATHER_CONDITIONS[game.weatherIndex];
            audio.playSfx('click');
          });
          this.bindButton('weather', 'btn-back-weather', () => { audio.playSfx('click'); setState('title'); });
          break;

        case 'career':
          this.bindButton('career', 'btn-career-toggle', () => {
            game.careerMode = !game.careerMode;
            audio.playSfx('click');
          });
          this.bindButton('career', 'btn-back-career', () => { audio.playSfx('click'); setState('title'); });
          break;

        case 'leaderboard':
          this.bindButton('leaderboard', 'btn-back-lb', () => { audio.playSfx('click'); setState('title'); });
          break;

        case 'tutorial':
          this.bindButton('tutorial', 'btn-skip-tut', () => {
            audio.playSfx('click');
            game.tutorialMode = false;
          });
          break;

        case 'custom-mission':
          this.bindButton('customMission', 'btn-alt-up', () => {
            game.customAltitude = Math.min(20000, game.customAltitude + 100);
            audio.playSfx('click');
          });
          this.bindButton('customMission', 'btn-alt-dn', () => {
            game.customAltitude = Math.max(100, game.customAltitude - 100);
            audio.playSfx('click');
          });
          this.bindButton('customMission', 'btn-pay-sat', () => { game.customPayload = 'satellite'; audio.playSfx('click'); });
          this.bindButton('customMission', 'btn-pay-crew', () => { game.customPayload = 'crew'; audio.playSfx('click'); });
          this.bindButton('customMission', 'btn-pay-heavy', () => { game.customPayload = 'station'; audio.playSfx('click'); });
          this.bindButton('customMission', 'btn-custom-launch', () => {
            audio.playSfx('click');
            game.currentMission = {
              name: 'Custom: ' + game.customAltitude + 'km',
              target: game.customAltitude,
              payload: game.customPayload,
              difficulty: 'Custom',
              description: 'Custom mission to ' + game.customAltitude + 'km',
            };
            game.config.payload = game.customPayload;
            rebuildRocket();
            setState('difficulty');
          });
          this.bindButton('customMission', 'btn-back-custom', () => { audio.playSfx('click'); setState('title'); });
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
        telemetry: s === 'flying',
        altimeter: s === 'flying',
        weather: s === 'weather',
        career: s === 'career',
        leaderboard: s === 'leaderboard',
        tutorial: s === 'flying' && game.tutorialMode,
        'orbit-info': s === 'flying' && game.currentMission.target > 0 && game.flight.altitude > 50000,
        callout: calloutTimer > 0 && s === 'flying',
        reentry: s === 'flying' && game.currentMission.name === 'Re-entry Run' && game.reentry.descending,
        'custom-mission': s === 'custom-mission',
      };
      for (const [name, entity] of Object.entries(panelEntities)) {
        if (entity.object3D) entity.object3D.visible = vis[name] ?? false;
      }

      // ScreenSpace management: add/remove component based on visibility
      // This prevents ScreenSpace from showing hidden panels in browser mode
      const screenSpaceConfigs: Record<string, { width: string; height: string; top?: string; bottom?: string; left?: string; right?: string; zOffset?: number }> = {
        hud: { width: '340px', height: 'auto', bottom: '16px', right: '16px', zOffset: 0.35 },
        throttle: { width: '160px', height: 'auto', bottom: '16px', left: '16px', zOffset: 0.35 },
        telemetry: { width: '200px', height: 'auto', bottom: '100px', left: '16px', zOffset: 0.35 },
        altimeter: { width: '130px', height: 'auto', top: '16px', left: '16px', zOffset: 0.35 },
        toast: { width: '360px', height: 'auto', top: '16px', left: '50%', zOffset: 0.3 },
        countdown: { width: '180px', height: 'auto', top: '40vh', left: '50%', zOffset: 0.3 },
        callout: { width: '360px', height: 'auto', top: '60px', left: '50%', zOffset: 0.3 },
      };
      for (const [name, cfg] of Object.entries(screenSpaceConfigs)) {
        const entity = panelEntities[name];
        if (!entity) continue;
        const shouldShow = vis[name] ?? false;
        const hasScreenSpace = entity.hasComponent?.(ScreenSpace) ?? false;
        if (shouldShow && !hasScreenSpace) {
          try {
            entity.addComponent(ScreenSpace, {
              width: cfg.width, height: cfg.height,
              top: cfg.top ?? 'auto', bottom: cfg.bottom ?? 'auto',
              left: cfg.left ?? 'auto', right: cfg.right ?? 'auto',
              zOffset: cfg.zOffset ?? 0.3,
            });
          } catch {}
        } else if (!shouldShow && hasScreenSpace) {
          try { entity.removeComponent(ScreenSpace); } catch {}
        }
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
        // G-force display
        const gForce = Math.abs(f.acceleration) / 9.81;
        this.setText('hud', 'gforce-value', gForce.toFixed(1) + ' G');
        // Progress percentage
        if (game.currentMission.target > 0) {
          const pct = Math.min(100, Math.floor((f.altitude / (game.currentMission.target * 1000)) * 100));
          this.setText('hud', 'progress-value', pct + '%');
        } else {
          this.setText('hud', 'progress-value', '---');
        }
        // Fuel warning
        if (f.fuel <= 10 && f.fuel > 0) {
          this.setText('hud', 'fuel-warn', 'LOW FUEL!');
        } else if (f.fuel <= 0) {
          this.setText('hud', 'fuel-warn', 'NO FUEL');
        } else {
          this.setText('hud', 'fuel-warn', '');
        }

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
        const success = f.altitude >= game.currentMission.target * 1000 || (game.currentMission.name === 'Re-entry Run' && f.altitude <= 500);
        this.setText('gameover', 'go-result', success ? 'ORBIT ACHIEVED' : 'MISSION FAILED');
        this.setText('gameover', 'go-stages', String(f.stageSeparations));
        // Grade
        const grade = f.score >= 80000 ? 'S' : f.score >= 50000 ? 'A' : f.score >= 30000 ? 'B' : f.score >= 15000 ? 'C' : f.score >= 5000 ? 'D' : 'F';
        this.setText('gameover', 'go-grade', grade);
        this.setText('gameover', 'go-xp', '+' + (Math.floor(f.score / 10) + (success ? 100 : 20)) + ' XP');
        // Score breakdown
        const altScore = Math.floor(f.maxAltitude / 100);
        const velScore = Math.floor(f.maxVelocity / 10);
        const fuelScore = Math.floor(f.fuel * 50);
        const weatherBonus = game.weather.windSpeed > 0 ? Math.floor(game.weather.windSpeed * 10) : 0;
        const diffMult = game.difficulty === 0 ? 0.7 : game.difficulty === 2 ? 1.5 : 1.0;
        this.setText('gameover', 'go-break-alt', 'Altitude: +' + altScore);
        this.setText('gameover', 'go-break-vel', 'Velocity: +' + velScore);
        this.setText('gameover', 'go-break-fuel', 'Fuel bonus: +' + fuelScore);
        this.setText('gameover', 'go-break-weather', 'Weather: +' + weatherBonus);
        this.setText('gameover', 'go-break-diff', 'Difficulty: x' + diffMult.toFixed(1));
        this.setText('gameover', 'go-break-maxq', 'Max-Q: ' + f.maxQ.toFixed(1) + ' kPa');
        this.setText('gameover', 'go-break-maxg', 'Max G: ' + game.maxG.toFixed(1));
        if (game.currentMission.name === 'Debris Dodge' && nearMissCount > 0) {
          this.setText('gameover', 'go-break-debris', 'Near misses: +' + (nearMissCount * 500));
        } else {
          this.setText('gameover', 'go-break-debris', '');
        }
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
        const diffNames = ['Easy', 'Medium', 'Hard'];
        const diffMults = ['x0.7', 'x1.0', 'x1.5'];
        this.setText('difficulty', 'cfg-diff', diffNames[game.difficulty] + ' (' + diffMults[game.difficulty] + ')');
      }

      // Telemetry panel
      if (s === 'flying') {
        const altKm = f.altitude / 1000;
        const atmDensity = Math.exp(-altKm / 8.5);
        const dynP = 0.5 * atmDensity * f.velocity * f.velocity * 0.001;
        const gForce = Math.abs(f.acceleration) / 9.81;
        const dragForce = 0.5 * atmDensity * f.dragCoeff * f.velocity * f.velocity * 0.001;
        this.setText('telemetry', 'telem-gforce', gForce.toFixed(1) + ' G');
        this.setText('telemetry', 'telem-dynp', dynP.toFixed(1) + ' kPa');
        this.setText('telemetry', 'telem-drag', dragForce.toFixed(0) + ' N');
        this.setText('telemetry', 'telem-atm', (atmDensity * 100).toFixed(1) + '%');
        this.setText('telemetry', 'telem-mass', f.mass.toFixed(0) + ' kg');
        this.setText('telemetry', 'telem-thrust', (f.fuel > 0 ? (f.thrust * f.throttle / 100).toFixed(0) : '0') + ' kN');
        this.setText('telemetry', 'telem-wind', game.weather.windSpeed.toFixed(0) + ' m/s');
        this.setText('telemetry', 'telem-weather', game.weather.name);

        // Altimeter panel
        const altStr = f.altitude < 1000 ? f.altitude.toFixed(0) + ' m' :
                       f.altitude < 1000000 ? (f.altitude / 1000).toFixed(1) + ' km' :
                       (f.altitude / 1000000).toFixed(2) + ' Mm';
        this.setText('altimeter', 'alt-display', altStr);
        // Find current/next milestone
        let currentMs = '';
        let nextMs = '';
        let nextAlt = 0;
        for (const ms of ALTITUDE_MILESTONES) {
          if (f.altitude >= ms.altitude) currentMs = ms.name;
          if (f.altitude < ms.altitude && !nextMs) { nextMs = ms.name; nextAlt = ms.altitude; }
        }
        this.setText('altimeter', 'alt-zone', currentMs || 'Ground');
        this.setText('altimeter', 'alt-next', nextMs ? 'Next: ' + nextMs : 'MAX ALTITUDE');
        if (nextAlt > 0) {
          const pct = Math.min(100, Math.floor((f.altitude / nextAlt) * 100));
          this.setText('altimeter', 'alt-progress', pct + '%');
        } else {
          this.setText('altimeter', 'alt-progress', '---');
        }
      }

      // Weather panel
      if (s === 'weather') {
        this.setText('weather', 'weather-name', game.weather.name);
        this.setText('weather', 'weather-wind', game.weather.windSpeed + ' m/s');
        this.setText('weather', 'weather-turb', game.weather.turbulence > 0 ? (game.weather.turbulence * 100).toFixed(0) + '%' : 'None');
        this.setText('weather', 'weather-head', game.weather.headwind + ' m/s');
        this.setText('weather', 'weather-vis', (game.weather.visibility * 100).toFixed(0) + '%');
      }

      // Career panel
      if (s === 'career') {
        for (let i = 0; i < MISSIONS.length; i++) {
          const unlocked = !game.careerMode || i < game.careerUnlocked;
          const completed = game.missionsCompleted.has(MISSIONS[i].name);
          const status = completed ? '[DONE] ' : unlocked ? '' : '[LOCKED] ';
          const color = completed ? '#44ff44' : unlocked ? '#ffffff' : '#666688';
          this.setText('career', `career-m${i}`, (i + 1) + '. ' + status + MISSIONS[i].name);
          const el = this.getDoc('career')?.getElementById(`career-m${i}`) as UIKit.Text | undefined;
          el?.setProperties({ color });
        }
        this.setText('career', 'career-progress', 'Unlocked: ' + game.careerUnlocked + '/' + MISSIONS.length);
        this.setText('career', 'btn-career-toggle', game.careerMode ? 'DISABLE CAREER' : 'ENABLE CAREER');
      }

      // Leaderboard panel
      if (s === 'leaderboard') {
        for (let i = 0; i < 10; i++) {
          const entry = game.history[game.history.length - 1 - i];
          if (entry) {
            this.setText('leaderboard', `lb-entry-${i}`, (i + 1) + '. ' + entry.mission + ' - ' + entry.score + 'pts - ' + (entry.altitude / 1000).toFixed(0) + 'km');
          } else {
            this.setText('leaderboard', `lb-entry-${i}`, (i + 1) + '. ---');
          }
        }
      }

      // Tutorial panel
      if (game.tutorialMode && s === 'flying') {
        const step = TUTORIAL_STEPS[Math.min(game.tutorialStep, TUTORIAL_STEPS.length - 1)];
        this.setText('tutorial', 'tut-step', step.title);
        this.setText('tutorial', 'tut-desc', step.desc);
        this.setText('tutorial', 'tut-progress', (game.tutorialStep) + ' / ' + TUTORIAL_STEPS.length + ' steps');
      }

      // Orbit info panel
      if (s === 'flying' && game.currentMission.target > 0 && f.altitude > 50000) {
        const targetAltM = game.currentMission.target * 1000;
        // Simplified orbital mechanics display
        const altKm = f.altitude / 1000;
        const orbitVelNeeded = 7800 * Math.sqrt(6371 / (6371 + altKm));
        const apoapsis = f.maxAltitude / 1000;
        const periapsis = Math.max(0, altKm - (apoapsis - altKm) * 0.5);
        const eccentricity = apoapsis > 0 ? Math.abs(apoapsis - periapsis) / (apoapsis + periapsis + 0.01) : 0;
        const orbStatus = f.altitude >= targetAltM * 0.9 ? 'Near Orbit!'
          : f.altitude >= targetAltM * 0.5 ? 'Approaching'
          : f.altitude >= 100000 ? 'Sub-orbital'
          : 'Ascending';

        this.setText('orbitInfo', 'orb-apo', apoapsis.toFixed(0) + ' km');
        this.setText('orbitInfo', 'orb-peri', periapsis.toFixed(0) + ' km');
        this.setText('orbitInfo', 'orb-vel', orbitVelNeeded.toFixed(0) + ' m/s');
        this.setText('orbitInfo', 'orb-ecc', eccentricity.toFixed(3));
        this.setText('orbitInfo', 'orb-status', orbStatus);
      }

      // Callout panel
      if (calloutTimer > 0 && s === 'flying') {
        this.setText('calloutPanel', 'callout-text', calloutText);
      }

      // Re-entry panel
      if (s === 'flying' && game.currentMission.name === 'Re-entry Run' && game.reentry.descending) {
        const re = game.reentry;
        this.setText('reentry', 're-heat', re.heat.toFixed(0) + '%');
        this.setText('reentry', 're-shield', re.shieldHP.toFixed(0) + '%');
        this.setText('reentry', 're-descent', Math.abs(f.velocity).toFixed(0) + ' m/s');
        this.setText('reentry', 're-temp', re.temperature.toFixed(0) + ' K');
        const status = re.heat > 80 ? 'CRITICAL' : re.heat > 50 ? 'WARNING' : 'NOMINAL';
        this.setText('reentry', 're-status', status);
      }

      // Custom mission panel
      if (s === 'custom-mission') {
        this.setText('customMission', 'custom-alt', game.customAltitude + ' km');
        this.setText('customMission', 'custom-payload', game.customPayload);
      }
    }
  }

  world.registerSystem(UISystem);
}

main();

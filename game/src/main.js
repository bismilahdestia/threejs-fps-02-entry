// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's rate.
// ?shot=start|buy|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb } from './bomb.js';
import { createAudio } from './audio.js';
import { createTracers } from './tracers.js';
import { createHud } from './hud.js';
import { createState } from './state.js';
import { createRounds } from './rounds.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Shot captures are seeded for a repeatable frame; live play seeds from the clock.
const random = mulberry32(shot ? seed : (Date.now() % 2147483647) | 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const state = createState();
const world = createWorld(scene);
const tracers = createTracers(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders);
const weapon = createWeapon(camera, world.colliders);
const bomb = createBomb(scene, world.sites);
const raycaster = new THREE.Raycaster();
raycaster.far = 80;
// The world's surfaces plus every bot's hit meshes: one ray decides a shot.
const shootables = world.shootables.slice();
const direction = new THREE.Vector3();
const eyePos = new THREE.Vector3();
const muzzlePos = new THREE.Vector3();

let elapsed = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let prevKeys = new Set();
let lastShotPos = null;
let lastShotAt = -Infinity;
let buyVisible = false;

const body = player.state;

function syncHud() {
  hud.setHealth(Math.ceil(body.health));
  hud.setMoney(state.money);
  hud.setRoundScore(state.score.ember, state.score.wardens, state.round);
  hud.setKills(state.kills);
  hud.setWeapon(weapon.def().name);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}

function setupRound() {
  body.position.copy(world.playerSpawn);
  body.velocity.set(0, 0, 0);
  body.yaw = 0;
  body.pitch = 0;
  player.heal();
  if (state.weapon !== weapon.state.weaponId) weapon.switchTo(state.weapon);
  weapon.refill();
  weapon.state.grenades = state.grenades;
  bots.reset(world.botSpawns);
  bomb.reset();
  syncCamera();
  syncHud();
}

const bots = createBots(scene, world, random, {
  onShoot(bot, from, to, hit, damage, headshot) {
    tracers.fire(from, to, hit ? 0xffb347 : 0xff9a2a);
    audio.enemyShot(camera.position.distanceTo(from));
    if (!hit || state.phase !== 'live') return;
    const health = player.damage(damage);
    hud.damageFlash();
    audio.hurt();
    hud.killfeed(`${bot.name} ▸ You ${headshot ? '(headshot) ' : ''}−${damage}`);
    if (health <= 0) {
      state.deaths += 1;
      rounds.endRound('wardens', 'You were dropped');
    }
  },
  onDeath(bot, part) {
    rounds.awardKill();
    hud.killfeed(`You ▸ <b>${bot.name}</b>${part === 'head' ? ' (headshot)' : ''} +$300`);
    audio.kill();
    syncHud();
  },
});
shootables.push(...bots.hitMeshes);

const rounds = createRounds(state, {
  onPhase(phase) {
    if (phase === 'buy') {
      setupRound();
      buyVisible = true;
      hud.setTimer(state.buyTime, 'Buy phase');
      hud.showBuy(state.money, state.owned, state.weapon, state.grenades);
      hud.banner(`Round ${state.round}`, 'Buy up — Deploy when ready', 2200);
    } else if (phase === 'live') {
      hud.hideBuy();
      hud.setTimer(state.roundTime, 'Round time');
      hud.banner(`Round ${state.round} — Go`, 'Plant the charge at Crane or Silo', 2200);
      if (!shot && !input.state.locked) hud.showOverlay('paused', 0);
    }
  },
  onRoundEnd(winner, reason) {
    hud.hideBuy();
    hud.prompt(null);
    hud.plantProgress(null);
    if (winner === 'ember') {
      hud.banner('Round won', reason, 3400);
      audio.roundWin();
    } else {
      hud.banner('Round lost', reason, 3400);
      audio.roundLose();
    }
    syncHud();
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner) {
    const final = `EMBER ${state.score.ember} — ${state.score.wardens} WARDENS`;
    hud.showOverlay(winner === 'ember' ? 'matchWin' : 'matchLose', final);
  },
  onBuy(id) {
    audio.buy();
    if (id !== 'grenade') {
      weapon.switchTo(id);
      weapon.refill();
      weapon.state.grenades = state.grenades;
    } else {
      weapon.state.grenades = state.grenades;
    }
    hud.showBuy(state.money, state.owned, state.weapon, state.grenades);
    syncHud();
  },
});

const input = createInput(renderer.domElement, onLockChange);

hud.onPlay(() => {
  if (shot) return;
  audio.resume();
  if (state.phase === 'menu' || state.phase === 'matchEnd') {
    hud.hideOverlay();
    rounds.startMatch();
  } else if (state.phase === 'live') {
    input.requestLock();
  }
});
hud.onDeploy(() => {
  if (shot || state.phase !== 'buy') return;
  audio.resume();
  rounds.startRound();
  input.requestLock();
});
hud.onBuy((id) => {
  if (shot || state.phase !== 'buy') return;
  if (id === 'grenade') rounds.buyGrenade();
  else rounds.buyWeapon(id);
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (state.phase === 'menu') {
    hud.showOverlay('start', 0);
  } else if (state.phase === 'matchEnd') {
    hud.showOverlay(state.matchWinner === 'ember' ? 'matchWin' : 'matchLose', `EMBER ${state.score.ember} — ${state.score.wardens} WARDENS`);
  } else if (state.phase === 'live') {
    hud.showOverlay('paused', 0);
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dryFire();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzlePos.copy(camera.position).addScaledVector(direction, 0.6);
  muzzlePos.x += 0.18;
  muzzlePos.y -= 0.14;
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  const end = hit ? hit.point.clone() : camera.position.clone().addScaledVector(direction, 70);
  tracers.fire(muzzlePos, end);
  if (hit && hit.object.userData.bot) {
    const bot = hit.object.userData.bot;
    const part = hit.object.userData.part;
    const def = weapon.def();
    const amount = part === 'head' ? def.headDamage : def.damage;
    const killed = bots.damage(bot, amount, part, elapsed);
    hud.hitMarker(killed, shot ? 4000 : 90);
    if (killed) audio.kill();
    else audio.hit();
  }
  weapon.pullTrigger();
  player.recoil(weapon.def().kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot();
  lastShotPos = camera.position.clone();
  lastShotAt = elapsed;
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  return true;
}

function edgePressed(code) {
  return input.state.keys.has(code) && !prevKeys.has(code);
}

function step(dt) {
  elapsed += dt;
  rounds.step(dt);

  // Buy-phase keys work while the menu is up and the pointer is free: 1/2/3 buy a
  // weapon, G buys a flash grenade, Enter deploys, B hides the menu to see the map.
  if (state.phase === 'buy' && !shot) {
    const weaponOrder = ['pistol', 'smg', 'rifle'];
    if (edgePressed('Digit1') || edgePressed('Digit2') || edgePressed('Digit3')) {
      const index = edgePressed('Digit1') ? 0 : edgePressed('Digit2') ? 1 : 2;
      rounds.buyWeapon(weaponOrder[index]);
    }
    if (edgePressed('KeyG')) rounds.buyGrenade();
    if (edgePressed('KeyB')) {
      if (buyVisible) {
        buyVisible = false;
        hud.hideBuy();
      } else {
        buyVisible = true;
        hud.showBuy(state.money, state.owned, state.weapon, state.grenades);
      }
    }
    if (edgePressed('Enter')) {
      rounds.startRound();
      input.requestLock();
    }
    hud.setTimer(state.timer, 'Buy phase');
  }

  // The simulation runs only while a live round is locked in. Buy time, the round-end
  // pause and the menu are frozen by design, like Counter-Strike's freeze time.
  const simulating = state.phase === 'live' && (shot || input.state.locked);
  if (simulating) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    player.step(dt, input.state.keys);

    // Keys, on their rising edge: switch weapon, reload, throw a grenade.
    const weaponOrder = ['pistol', 'smg', 'rifle'];
    if (edgePressed('Digit1') || edgePressed('Digit2') || edgePressed('Digit3')) {
      const index = edgePressed('Digit1') ? 0 : edgePressed('Digit2') ? 1 : 2;
      const id = weaponOrder[index];
      if (state.owned.includes(id) && weapon.switchTo(id)) syncHud();
    }
    if (edgePressed('KeyR') && weapon.reload()) audio.reload();
    if (edgePressed('KeyG')) {
      camera.getWorldDirection(direction);
      if (weapon.throwGrenade(camera.position, direction)) audio.reload();
    }

    // Fire: automatics hold the trigger, the pistol fires on the rising edge.
    const def = weapon.def();
    const trigger = def.auto ? input.state.firing : input.state.firing && !prevFiring;
    if (trigger && weapon.ready()) shoot(weapon.spread(player.groundSpeed()));
    else if (trigger && weapon.state.mag === 0 && weapon.state.cooldown === 0) audio.dryFire();
    prevFiring = input.state.firing;

    // The grenade's fuse: a detonation blinds every bot with a line of sight to the
    // burst and flashes the player when they are looking at it.
    const grenadeEvent = weapon.step(dt);
    if (grenadeEvent) {
      audio.flashbang();
      for (const bot of bots.bots) {
        if (!bot.alive) continue;
        const distance = bot.group.position.distanceTo(grenadeEvent.detonatedAt);
        if (distance > 20) continue;
        eyePos.set(bot.group.position.x, bot.group.position.y + 1.5, bot.group.position.z);
        direction.copy(eyePos).sub(grenadeEvent.detonatedAt).normalize();
        raycaster.set(grenadeEvent.detonatedAt, direction);
        const hits = raycaster.intersectObjects(world.shootables, false);
        if (hits.length === 0 || hits[0].distance >= distance - 0.6) bots.blind(bot, elapsed + 2.5);
      }
      camera.getWorldDirection(direction);
      const toBlast = grenadeEvent.detonatedAt.clone().sub(camera.position);
      const blastDistance = toBlast.length();
      if (blastDistance < 25 && direction.dot(toBlast.normalize()) > 0.2) {
        hud.flashbang(1 - blastDistance / 25);
      }
    }

    eyePos.set(body.position.x, body.position.y + body.eye, body.position.z);
    bots.step(dt, {
      time: elapsed,
      playerEye: eyePos,
      playerPos: body.position,
      playerSpeed: player.groundSpeed(),
      playerCrouching: body.crouching,
      playerAlive: body.health > 0,
      bombPlanted: bomb.state.status === 'planted',
      bombPos: bomb.state.site ? bomb.state.site.center : null,
      lastShotPos,
      lastShotAt,
    });

    bomb.step(dt, {
      playerPos: body.position,
      holdingPlant: input.state.keys.has('KeyE'),
      bots: bots.bots,
      time: elapsed,
      onPlant(site) {
        rounds.awardPlant();
        hud.killfeed(`Charge planted at Site ${site.id} +$300`);
        audio.plantDone();
        syncHud();
      },
      onBeep() {
        audio.plantBeep();
      },
      onDetonate(site) {
        audio.explosion();
        rounds.endRound('ember', `Charge detonated at Site ${site.id}`);
      },
      onDefuse(site) {
        rounds.endRound('wardens', `Charge defused at Site ${site.id}`);
      },
    });

    tracers.step(dt);

    // The round clock stops once the charge is planted: the fuse decides the round.
    if (bomb.state.status === 'carried' || bomb.state.status === 'planting') {
      state.timer -= dt;
      if (state.timer <= 0) rounds.endRound('wardens', 'Time expired — the sites held');
    }
    if (bots.aliveCount() === 0 && state.phase === 'live') {
      rounds.endRound('ember', 'All Wardens down');
    }

    // HUD prompts: planting, defusing, or the charge ticking.
    const site = bomb.siteAt(body.position);
    if (bomb.state.status === 'planted') {
      hud.prompt('Charge planted — hold the site');
      if (bomb.state.defuseProgress > 0) hud.plantProgress(bomb.state.defuseProgress, 'Wardens defusing');
      else hud.plantProgress(null);
    } else if (site && bomb.state.status !== 'planted') {
      hud.prompt('Hold E — Plant the charge at Site ' + site.id);
      if (bomb.state.status === 'planting') hud.plantProgress(bomb.state.plantProgress, 'Planting the charge');
      else hud.plantProgress(null);
    } else {
      hud.prompt(null);
      hud.plantProgress(null);
    }

    hud.setTimer(state.timer, bomb.state.status === 'planted' ? 'Charge fuse' : 'Round time');
    hud.setCrosshairGap(4 + weapon.spread(player.groundSpeed()) * 400);
    syncCamera();
  } else if (state.phase === 'roundEnd') {
    hud.setTimer(state.timer, 'Next round');
  }
  prevKeys = new Set(input.state.keys);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function placeBot(index, x, z, yaw) {
  const bot = bots.bots[index];
  bot.body.state.position.set(x, 0, z);
  bot.body.state.velocity.set(0, 0, 0);
  bot.group.position.set(x, 0, z);
  bot.group.rotation.set(0, yaw, 0);
  bot.yaw = yaw;
  bot.state = 'engage';
  bot.canSee = true;
  bot.lastSeen = body.position.clone();
  bot.lastSeen.y = 0;
  bot.seenAt = elapsed;
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  state.phase = 'live';
  state.round = 1;
  state.money = 3200;
  state.owned = ['pistol', 'smg', 'rifle'];
  state.grenades = 1;
  state.kills = 0;

  if (name === 'start') {
    state.phase = 'menu';
    body.position.set(0, 0, 12);
    body.yaw = -0.12;
    aimAt(new THREE.Vector3(0, 1.6, -8));
    hud.showOverlay('start', 0);
  } else if (name === 'buy') {
    state.phase = 'buy';
    state.money = 3200;
    state.owned = ['pistol', 'smg'];
    state.weapon = 'smg';
    body.position.set(0, 0, 12);
    body.yaw = -0.1;
    weapon.switchTo('smg');
    weapon.refill();
    weapon.state.grenades = 1;
    aimAt(new THREE.Vector3(0, 1.6, -8));
    hud.setTimer(14, 'Buy phase');
    hud.showBuy(3200, state.owned, 'smg', 1);
  } else if (name === 'play') {
    state.weapon = 'rifle';
    weapon.switchTo('rifle');
    weapon.refill();
    weapon.state.grenades = 1;
    body.position.set(0, 0, 6);
    bots.reset(world.botSpawns);
    placeBot(0, 0.5, -3, Math.PI);
    placeBot(1, -5.5, 1.5, Math.PI * 0.85);
    // One torso hit on the west-lane Warden, then a headshot on the one at mid: the
    // kill feed and the kill hitmarker come from the real damage path, not a script.
    aimAt(bots.aimPoint(1));
    shoot(0);
    aimAt(bots.headPoint(0));
    shoot(0);
    // The west-lane Warden fires back: one tracer past the player.
    const from = new THREE.Vector3(-5.5, 1.35, 1.5);
    tracers.fire(from, body.position.clone().add(new THREE.Vector3(0.4, 1.5, 0)));
    weapon.state.flash = 1;
    hud.setTimer(72, 'Round time');
    hud.prompt(null);
  } else {
    // 'end': the round is won, every Warden is down. The bots are laid down directly
    // (not through damage) so the economy is not counted five times over.
    state.phase = 'roundEnd';
    state.score.ember = 1;
    state.money = 4450;
    state.kills = 5;
    body.position.set(0, 0, 2);
    bots.reset(world.botSpawns);
    for (const bot of bots.bots) {
      bot.alive = false;
      bot.health = 0;
      bot.fall = 1;
      bot.group.rotation.x = -1.45;
      bot.group.position.y = -0.08;
      hud.killfeed(`You ▸ <b>${bot.name}</b> +$300`);
    }
    aimAt(new THREE.Vector3(2.5, 0.5, -4));
    hud.banner('Round won', 'All Wardens down — +$3,250', 60000);
    hud.setTimer(4, 'Next round');
  }
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
syncHud();
if (shot) runShot(shot);
else requestAnimationFrame(frame);

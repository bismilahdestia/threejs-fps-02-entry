// The Wardens: five bots that patrol the yard on a waypoint graph, hold the sites, chase
// what they see and hear, and shoot back in bursts. One bot, one job each: see, move,
// shoot. Vision is a real line-of-sight raycast against the map; hearing is the player's
// last shot. A bot that is flashed cannot see, and a bot that falls stays down for the round.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody } from './physics.js';

const HEALTH = 100;
const BOT_COUNT = 5;
const VISION_RANGE = 30;
const VISION_HALF_ANGLE = 1.31; // ~75 degrees
const REACTION_MIN = 0.35;
const REACTION_SPREAD = 0.25;
const BURST_GAP = 0.12;
const BURST_REST_MIN = 0.7;
const BURST_REST_SPREAD = 0.6;
const SEEK_MEMORY = 6;
const FALL_SECONDS = 0.4;
const CALLSIGNS = ['ASH', 'CINDER', 'SOOT', 'FLINT', 'SLAG'];

function nearestNode(waypoints, position) {
  let best = 0;
  let bestDist = Infinity;
  for (let index = 0; index < waypoints.nodes.length; index += 1) {
    const node = waypoints.nodes[index];
    const dist = (node.x - position.x) ** 2 + (node.z - position.z) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

function findPath(waypoints, from, to) {
  const start = nearestNode(waypoints, from);
  const goal = nearestNode(waypoints, to);
  const previous = new Array(waypoints.nodes.length).fill(-1);
  previous[start] = start;
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === goal) break;
    for (const next of waypoints.adjacency[node]) {
      if (previous[next] === -1) {
        previous[next] = node;
        queue.push(next);
      }
    }
  }
  if (previous[goal] === -1) return [goal];
  const path = [];
  let current = goal;
  while (current !== start) {
    path.unshift(current);
    current = previous[current];
  }
  return path;
}

export function createBots(scene, world, random, callbacks) {
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.05 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.1 });
  const visorMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 0.8,
    roughness: 0.4,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.155, 16, 12);
  const legGeometry = new THREE.BoxGeometry(0.18, 0.62, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.55);
  const visorGeometry = new THREE.BoxGeometry(0.2, 0.04, 0.05);

  const raycaster = new THREE.Raycaster();
  raycaster.far = VISION_RANGE + 2;
  const toPlayer = new THREE.Vector3();
  const eyePos = new THREE.Vector3();
  const chestPos = new THREE.Vector3();
  const scratchWish = new THREE.Vector3();

  const bots = [];
  const hitMeshes = [];

  for (let index = 0; index < BOT_COUNT; index += 1) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial.clone());
    torso.position.y = 1.0;
    const head = new THREE.Mesh(headGeometry, headMaterial.clone());
    head.position.y = 1.53;
    const visor = new THREE.Mesh(visorGeometry, visorMaterial);
    visor.position.set(0, 1.55, -0.14);
    const legLeft = new THREE.Mesh(legGeometry, darkMaterial);
    legLeft.position.set(-0.14, 0.31, 0);
    const legRight = new THREE.Mesh(legGeometry, darkMaterial);
    legRight.position.set(0.14, 0.31, 0);
    const gun = new THREE.Mesh(gunGeometry, darkMaterial);
    gun.position.set(0.2, 1.05, -0.35);
    group.add(torso, head, visor, legLeft, legRight, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      index,
      name: CALLSIGNS[index],
      group,
      torso,
      head,
      legLeft,
      legRight,
      body: createBody(world.colliders, { walkSpeed: 3.4 }),
      health: HEALTH,
      alive: true,
      state: 'patrol',
      yaw: Math.PI,
      node: -1,
      path: [],
      pathIndex: 0,
      holdUntil: 0,
      lastSeen: null,
      seenAt: -Infinity,
      reactionAt: 0,
      burstLeft: 0,
      burstTimer: 0,
      restUntil: 0,
      strafeDir: 1,
      strafeUntil: 0,
      blindUntil: 0,
      flashUntil: 0,
      fall: 0,
      visionTimer: index * 0.03,
      canSee: false,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  function reset(spawns) {
    for (let index = 0; index < bots.length; index += 1) {
      const bot = bots[index];
      const spawn = spawns[index % spawns.length];
      bot.body.state.position.set(spawn.x, 0, spawn.z);
      bot.body.state.velocity.set(0, 0, 0);
      bot.group.position.copy(spawn);
      bot.group.rotation.set(0, Math.PI, 0);
      bot.health = HEALTH;
      bot.alive = true;
      bot.state = 'patrol';
      bot.yaw = Math.PI;
      bot.node = -1;
      bot.path = [];
      bot.pathIndex = 0;
      bot.holdUntil = 0;
      bot.lastSeen = null;
      bot.seenAt = -Infinity;
      bot.burstLeft = 0;
      bot.blindUntil = 0;
      bot.flashUntil = 0;
      bot.fall = 0;
      bot.canSee = false;
      bot.torso.material.emissive.setHex(0x000000);
      bot.head.material.emissive.setHex(0x000000);
    }
  }

  function canSee(bot, playerEye, time) {
    if (time < bot.blindUntil) return false;
    eyePos.set(bot.group.position.x, bot.group.position.y + 1.5, bot.group.position.z);
    chestPos.copy(playerEye);
    toPlayer.copy(chestPos).sub(eyePos);
    const distance = toPlayer.length();
    if (distance > VISION_RANGE) return false;
    toPlayer.normalize();
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    if (forward.dot(toPlayer) < Math.cos(VISION_HALF_ANGLE)) return false;
    raycaster.set(eyePos, toPlayer);
    const hits = raycaster.intersectObjects(world.shootables, false);
    return hits.length === 0 || hits[0].distance >= distance - 0.6;
  }

  function pickPatrolTarget(bot, time) {
    const neighbours = world.waypoints.adjacency[bot.node === -1 ? nearestNode(world.waypoints, bot.group.position) : bot.node];
    const next = neighbours[Math.floor(random() * neighbours.length)];
    bot.node = next;
    bot.path = [next];
    bot.pathIndex = 0;
    bot.holdUntil = time + 1 + random() * 1.5;
  }

  function walkPath(bot, out) {
    out.set(0, 0, 0);
    if (bot.pathIndex >= bot.path.length) return out;
    const target = world.waypoints.nodes[bot.path[bot.pathIndex]];
    const dx = target.x - bot.group.position.x;
    const dz = target.z - bot.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.6) {
      bot.pathIndex += 1;
      return out;
    }
    out.set(dx / distance, 0, dz / distance);
    return out;
  }

  function faceToward(bot, targetX, targetZ, dt) {
    const want = Math.atan2(-(targetX - bot.group.position.x), -(targetZ - bot.group.position.z));
    let diff = want - bot.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.yaw += Math.max(-3 * dt, Math.min(3 * dt, diff));
  }

  function muzzleOf(bot) {
    const forward = new THREE.Vector3(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    return new THREE.Vector3(bot.group.position.x, bot.group.position.y + 1.35, bot.group.position.z)
      .addScaledVector(forward, 0.5);
  }

  function shootAt(bot, ctx) {
    const from = muzzleOf(bot);
    const distance = from.distanceTo(ctx.playerEye);
    let chance = 0.34 * Math.max(0.35, Math.min(1, 1.3 - distance / 30));
    if (ctx.playerSpeed > 3) chance *= 0.7;
    if (ctx.playerCrouching) chance *= 0.8;
    if (ctx.time < bot.blindUntil) chance *= 0.05;
    const hit = random() < chance;
    const headshot = hit && random() < 0.12;
    const damage = hit ? Math.round((9 + random() * 6) * (headshot ? 2 : 1)) : 0;
    const to = ctx.playerEye.clone();
    if (!hit) {
      to.x += (random() * 2 - 1) * 1.2;
      to.y += (random() * 2 - 1) * 0.8;
      to.z += (random() * 2 - 1) * 1.2;
    }
    callbacks.onShoot(bot, from, to, hit, damage, headshot);
  }

  function step(dt, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / FALL_SECONDS);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      if (ctx.time < bot.flashUntil) {
        const pulse = 0.6 + 0.4 * Math.sin(ctx.time * 30);
        bot.torso.material.emissive.setRGB(pulse, 0.25 * pulse, 0.05 * pulse);
      } else {
        bot.torso.material.emissive.setHex(0x000000);
      }

      // Vision, staggered so not every bot raycasts every step.
      bot.visionTimer -= dt;
      if (bot.visionTimer <= 0) {
        bot.visionTimer = 0.1;
        bot.canSee = ctx.playerAlive && canSee(bot, ctx.playerEye, ctx.time);
        if (bot.canSee) {
          if (bot.state !== 'engage') bot.reactionAt = ctx.time + REACTION_MIN + random() * REACTION_SPREAD;
          bot.lastSeen = ctx.playerEye.clone();
          bot.lastSeen.y = 0;
          bot.seenAt = ctx.time;
        }
      }
      // Hearing: a shot nearby pulls bots toward it.
      if (ctx.lastShotAt > bot.seenAt && ctx.lastShotPos) {
        const shotDist = bot.group.position.distanceTo(ctx.lastShotPos);
        if (shotDist < 28 && bot.state !== 'engage') {
          bot.lastSeen = ctx.lastShotPos.clone();
          bot.lastSeen.y = 0;
          bot.seenAt = ctx.lastShotAt;
        }
      }

      // State: the planted bomb outranks everything; sight outranks memory.
      if (ctx.bombPlanted && ctx.bombPos && ctx.time >= bot.blindUntil) {
        if (bot.state !== 'defuse') {
          bot.state = 'defuse';
          bot.path = findPath(world.waypoints, bot.group.position, ctx.bombPos);
          bot.pathIndex = 0;
        }
      } else if (bot.canSee) {
        bot.state = 'engage';
      } else if (bot.lastSeen && ctx.time - bot.seenAt < SEEK_MEMORY) {
        if (bot.state !== 'seek') {
          bot.state = 'seek';
          bot.path = findPath(world.waypoints, bot.group.position, bot.lastSeen);
          bot.pathIndex = 0;
        }
      } else if (bot.state !== 'patrol') {
        bot.state = 'patrol';
        bot.node = nearestNode(world.waypoints, bot.group.position);
        bot.path = [];
        bot.pathIndex = 0;
      }

      const wish = scratchWish.set(0, 0, 0);
      if (bot.state === 'engage') {
        faceToward(bot, ctx.playerEye.x, ctx.playerEye.z, dt);
        const dx = ctx.playerEye.x - bot.group.position.x;
        const dz = ctx.playerEye.z - bot.group.position.z;
        const distance = Math.hypot(dx, dz) || 1;
        if (ctx.time > bot.strafeUntil) {
          bot.strafeUntil = ctx.time + 1.2 + random() * 0.8;
          bot.strafeDir = random() < 0.5 ? -1 : 1;
        }
        const radial = distance > 18 ? 1 : distance < 8 ? -1 : 0;
        wish.set(
          (-dz / distance) * bot.strafeDir + (dx / distance) * radial,
          0,
          (dx / distance) * bot.strafeDir + (dz / distance) * radial,
        );
        if (wish.lengthSq() > 0) wish.normalize();
        if (ctx.time >= bot.reactionAt && ctx.time >= bot.restUntil) {
          if (bot.burstLeft === 0) bot.burstLeft = 3 + Math.floor(random() * 3);
          bot.burstTimer -= dt;
          if (bot.burstTimer <= 0 && bot.burstLeft > 0) {
            shootAt(bot, ctx);
            bot.burstLeft -= 1;
            bot.burstTimer = BURST_GAP;
            if (bot.burstLeft === 0) bot.restUntil = ctx.time + BURST_REST_MIN + random() * BURST_REST_SPREAD;
          }
        }
      } else if (bot.state === 'seek' || bot.state === 'defuse') {
        const target = bot.state === 'defuse' ? ctx.bombPos : bot.lastSeen;
        const distance = bot.group.position.distanceTo(target);
        if (bot.state === 'defuse' && distance < 1.6) {
          wish.set(0, 0, 0); // stands on the bomb and channels the defuse
        } else {
          walkPath(bot, wish);
          if (bot.pathIndex >= bot.path.length && distance > 1) {
            bot.path = findPath(world.waypoints, bot.group.position, target);
            bot.pathIndex = 0;
          }
        }
        if (wish.lengthSq() > 0) faceToward(bot, bot.group.position.x + wish.x, bot.group.position.z + wish.z, dt);
      } else {
        if (ctx.time < bot.holdUntil) {
          wish.set(0, 0, 0);
        } else if (bot.pathIndex >= bot.path.length) {
          pickPatrolTarget(bot, ctx.time);
        } else {
          walkPath(bot, wish);
          if (wish.lengthSq() > 0) faceToward(bot, bot.group.position.x + wish.x, bot.group.position.z + wish.z, dt);
        }
      }

      const speed = bot.state === 'seek' || bot.state === 'defuse' ? 4.2 : 3.4;
      const moving = wish.lengthSq() > 0;
      bot.body.state.position.copy(bot.group.position);
      bot.body.step(dt, wish.x, wish.z, false, false, speed);
      bot.group.position.copy(bot.body.state.position);
      bot.group.rotation.y = bot.yaw;
      if (moving) {
        const t = ctx.time * 10;
        bot.legLeft.position.y = 0.31 + Math.sin(t) * 0.05;
        bot.legRight.position.y = 0.31 - Math.sin(t) * 0.05;
      }
    }
  }

  function damage(bot, amount, part, time) {
    if (!bot.alive) return false;
    bot.health -= amount;
    bot.flashUntil = time + 0.12;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    callbacks.onDeath(bot, part);
    return true;
  }

  return {
    bots,
    hitMeshes,
    step,
    reset,
    damage,
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      return new THREE.Vector3(bot.group.position.x, bot.group.position.y + 1.0, bot.group.position.z);
    },
    headPoint(index) {
      const bot = bots[index % bots.length];
      return new THREE.Vector3(bot.group.position.x, bot.group.position.y + 1.53, bot.group.position.z);
    },
    blind(bot, until) {
      bot.blindUntil = Math.max(bot.blindUntil, until);
    },
  };
}

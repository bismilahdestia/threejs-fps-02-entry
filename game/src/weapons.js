// The armoury: three weapons and one flash grenade. The numbers are the gunplay: a rifle
// that kills in three torso hits or one headshot, an SMG that is fast and cheap, a pistol
// that is always there. Spread grows with movement speed, so stopping to aim pays.
// The view model, muzzle flash and kick live here; main.js owns the ray and the damage.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sparrow', price: 0, auto: false,
    mag: 12, reserve: 48, damage: 26, headDamage: 78,
    fireGap: 0.16, reloadTime: 1.4,
    spreadStill: 0.003, spreadMoving: 0.02, kick: 0.006,
    barrel: 0.28, length: 0.3,
  },
  smg: {
    id: 'smg', name: 'KX-9 Wasp', price: 1500, auto: true,
    mag: 25, reserve: 100, damage: 22, headDamage: 66,
    fireGap: 0.075, reloadTime: 1.7,
    spreadStill: 0.004, spreadMoving: 0.024, kick: 0.005,
    barrel: 0.34, length: 0.42,
  },
  rifle: {
    id: 'rifle', name: 'VK-7 Emberline', price: 2700, auto: true,
    mag: 30, reserve: 90, damage: 34, headDamage: 100,
    fireGap: 0.096, reloadTime: 1.9,
    spreadStill: 0.0022, spreadMoving: 0.028, kick: 0.009,
    barrel: 0.42, length: 0.52,
  },
};
export const GRENADE_PRICE = 300;
export const GRENADE_MAX = 2;

const MOVE_REFERENCE = 5.2;
const MUZZLE_TIME = 0.06;
const GRENADE_FUSE = 1.4;

export function createWeapon(camera, colliders) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });

  let model = null;
  function buildModel(def) {
    if (model) {
      camera.remove(model);
      model.traverse((child) => {
        if (child.isMesh) child.geometry.dispose();
      });
    }
    model = new THREE.Group();
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, def.length), body);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, def.barrel), grip);
    barrel.position.set(0, 0.025, -def.length / 2 - def.barrel / 2 + 0.08);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
    stock.position.set(0, -0.02, def.length / 2 - 0.02);
    model.add(receiver, barrel, stock);
    model.position.set(0.24, -0.2, -0.42);
    camera.add(model);
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // One grenade in flight at a time: a small dark sphere with a fuse and a bounce.
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.3 }),
  );
  grenadeMesh.visible = false;
  grenadeMesh.castShadow = true;
  camera.parent.add(grenadeMesh);

  const state = {
    weaponId: 'pistol', mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve,
    cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0,
    grenade: null, // { position, velocity, fuse } while one is in the air
  };
  buildModel(WEAPONS.pistol);

  const probe = new THREE.Box3();
  function grenadeBlocked(position) {
    probe.min.set(position.x - 0.09, position.y - 0.09, position.z - 0.09);
    probe.max.set(position.x + 0.09, position.y + 0.09, position.z + 0.09);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (model) {
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    const def = WEAPONS[state.weaponId];
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (model) model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    const g = state.grenade;
    if (g) {
      g.fuse -= dt;
      g.velocity.y -= 14 * dt;
      const next = g.position.clone().addScaledVector(g.velocity, dt);
      if (grenadeBlocked(next)) {
        g.velocity.multiplyScalar(-0.35);
        g.velocity.y = Math.abs(g.velocity.y) * 0.4;
        next.copy(g.position);
      }
      g.position.copy(next);
      if (g.position.y < 0.09) {
        g.position.y = 0.09;
        g.velocity.y = Math.abs(g.velocity.y) * 0.35;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
      }
      grenadeMesh.position.copy(g.position);
      if (g.fuse <= 0) {
        state.grenade = null;
        grenadeMesh.visible = false;
        return { detonatedAt: g.position.clone() };
      }
    }
    return null;
  }

  return {
    state,
    def() {
      return WEAPONS[state.weaponId];
    },
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = WEAPONS[state.weaponId].fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      const def = WEAPONS[state.weaponId];
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return false;
      state.reloadLeft = def.reloadTime;
      return true;
    },
    spread(speed) {
      const def = WEAPONS[state.weaponId];
      return def.spreadStill + Math.min(1, speed / MOVE_REFERENCE) * def.spreadMoving;
    },
    refill() {
      const def = WEAPONS[state.weaponId];
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    switchTo(id) {
      if (!WEAPONS[id] || id === state.weaponId) return false;
      const def = WEAPONS[id];
      state.weaponId = id;
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      buildModel(def);
      return true;
    },
    // A flash grenade: thrown from the camera, it blinds every bot with a line of sight
    // to the burst, and flashes the player's screen when they are looking at it.
    throwGrenade(origin, direction) {
      if (state.grenades <= 0 || state.grenade) return false;
      state.grenades -= 1;
      state.grenade = {
        position: origin.clone(),
        velocity: direction.clone().multiplyScalar(11).add(new THREE.Vector3(0, 3.2, 0)),
        fuse: GRENADE_FUSE,
      };
      grenadeMesh.position.copy(state.grenade.position);
      grenadeMesh.visible = true;
      return true;
    },
  };
}

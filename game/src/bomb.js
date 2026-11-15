// The objective: one charge the Vanguard carries to a site. Hold E inside a site's pad
// for three seconds to plant it; the charge then burns a 35-second fuse while its beeps
// speed up, and a Warden standing on it channels a five-second defuse. Detonation wins
// the round for the Vanguard; a defuse wins it for the Wardens.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const PLANT_SECONDS = 3;
const FUSE_SECONDS = 35;
const DEFUSE_SECONDS = 5;

export function createBomb(scene, sites) {
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.28, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.4 }),
  );
  box.visible = false;
  box.castShadow = true;
  scene.add(box);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  lamp.visible = false;
  scene.add(lamp);

  const state = {
    status: 'carried', // carried | planting | planted | defused | detonated
    site: null,
    plantProgress: 0,
    fuseLeft: FUSE_SECONDS,
    defuseProgress: 0,
    beepTimer: 0,
  };

  function siteAt(position) {
    for (const site of sites) {
      const dx = position.x - site.center.x;
      const dz = position.z - site.center.z;
      if (Math.hypot(dx, dz) <= site.radius) return site;
    }
    return null;
  }

  // step runs on the fixed clock. ctx: { playerPos, holdingPlant, bots, time, onPlant,
  // onBeep, onDetonate, onDefuse }. Returns nothing; the callbacks carry the events.
  function step(dt, ctx) {
    if (state.status === 'carried' || state.status === 'planting') {
      const site = siteAt(ctx.playerPos);
      if (site && ctx.holdingPlant) {
        state.status = 'planting';
        state.site = site;
        state.plantProgress = Math.min(1, state.plantProgress + dt / PLANT_SECONDS);
        if (state.plantProgress >= 1) {
          state.status = 'planted';
          state.fuseLeft = FUSE_SECONDS;
          state.defuseProgress = 0;
          box.position.set(site.center.x, 0.18, site.center.z);
          box.visible = true;
          lamp.position.set(site.center.x, 0.42, site.center.z);
          lamp.visible = true;
          ctx.onPlant(site);
        }
      } else {
        state.status = 'carried';
        state.site = null;
        state.plantProgress = 0;
      }
      return;
    }
    if (state.status !== 'planted') return;
    state.fuseLeft -= dt;
    // The beeps speed up as the fuse burns down: one a second at first, four a second
    // in the last five seconds.
    const interval = state.fuseLeft > 10 ? 1 : state.fuseLeft > 5 ? 0.5 : 0.25;
    state.beepTimer -= dt;
    if (state.beepTimer <= 0) {
      state.beepTimer = interval;
      lamp.material.color.setHex(0xff9a2a);
      ctx.onBeep();
    } else {
      lamp.material.color.setHex(0x402a08);
    }
    if (state.fuseLeft <= 0) {
      state.status = 'detonated';
      box.visible = false;
      lamp.visible = false;
      ctx.onDetonate(state.site);
      return;
    }
    // A living, unflashed Warden standing on the charge channels the defuse.
    let channeling = false;
    for (const bot of ctx.bots) {
      if (!bot.alive) continue;
      if (ctx.time < bot.blindUntil) continue;
      const dx = bot.group.position.x - state.site.center.x;
      const dz = bot.group.position.z - state.site.center.z;
      if (Math.hypot(dx, dz) < 1.6) {
        channeling = true;
        break;
      }
    }
    if (channeling) {
      state.defuseProgress = Math.min(1, state.defuseProgress + dt / DEFUSE_SECONDS);
      if (state.defuseProgress >= 1) {
        state.status = 'defused';
        box.visible = false;
        lamp.visible = false;
        ctx.onDefuse(state.site);
      }
    } else {
      state.defuseProgress = Math.max(0, state.defuseProgress - dt / DEFUSE_SECONDS);
    }
  }

  function reset() {
    state.status = 'carried';
    state.site = null;
    state.plantProgress = 0;
    state.fuseLeft = FUSE_SECONDS;
    state.defuseProgress = 0;
    state.beepTimer = 0;
    box.visible = false;
    lamp.visible = false;
  }

  return { state, step, reset, siteAt };
}

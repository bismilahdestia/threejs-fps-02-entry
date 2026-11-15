// The Vanguard: look, movement and health, on the shared physics body. The body owns
// the position and the collision; this module owns the yaw, the pitch, the recoil and
// the health, and turns keys into a wish direction for the body.
import * as THREE from 'three';
import { createBody } from './physics.js';

export function createPlayer(colliders) {
  const body = createBody(colliders, { walkSpeed: 5.2, crouchSpeed: 2.4 });
  const state = body.state;
  state.yaw = 0;
  state.pitch = 0;
  state.health = 100;

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wishX = -sin * forward + cos * strafe;
      wishZ = -cos * forward - sin * strafe;
      const length = Math.hypot(wishX, wishZ);
      wishX /= length;
      wishZ /= length;
    }
    const jump = keys.has('Space');
    body.step(dt, wishX, wishZ, crouching, jump);
  }

  return {
    state,
    step,
    look,
    recoil,
    groundSpeed() {
      return body.groundSpeed();
    },
    damage(amount) {
      state.health = Math.max(0, state.health - amount);
      return state.health;
    },
    heal() {
      state.health = 100;
    },
  };
}

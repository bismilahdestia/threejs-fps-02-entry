// One body: a standing box that accelerates, falls, crouches and slides along colliders,
// resolved one axis at a time, so a wall never swallows it. The player and every bot share
// this code, so both obey the same map. No allocation in step: the probe and wish vectors
// are created once and reused.
import * as THREE from 'three';

const GRAVITY = 20;

export function createBody(colliders, options = {}) {
  const radius = options.radius ?? 0.34;
  const standHeight = options.standHeight ?? 1.72;
  const crouchHeight = options.crouchHeight ?? 1.12;
  const walkSpeed = options.walkSpeed ?? 5.2;
  const crouchSpeed = options.crouchSpeed ?? 2.4;
  const groundAccel = options.groundAccel ?? 42;
  const airAccel = options.airAccel ?? 9;
  const friction = options.friction ?? 9;
  const jumpSpeed = options.jumpSpeed ?? 6.2;

  const body = {
    position: new THREE.Vector3(options.x ?? 0, 0, options.z ?? 0),
    velocity: new THREE.Vector3(),
    height: standHeight,
    eye: options.eye ?? 1.6,
    onGround: true,
    crouching: false,
  };
  const probe = new THREE.Box3();
  const wish = new THREE.Vector3();

  // lift keeps the feet and the crown out of the horizontal tests, so standing on the
  // floor is not read as walking into a wall.
  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) {
      if (probe.intersectsBox(collider)) return collider;
    }
    return null;
  }

  function setCrouch(want) {
    if (want && !body.crouching) {
      body.crouching = true;
      body.height = crouchHeight;
    } else if (!want && body.crouching && !overlaps(body.position.x, body.position.y, body.position.z, standHeight, 0.02)) {
      body.crouching = false;
      body.height = standHeight;
    }
  }

  // wishX/wishZ is a world-space direction (already normalised, or zero). jump is a boolean.
  // speedOverride, when given, replaces the body's walk speed for this step (bots pace
  // themselves: a seek is faster than a patrol).
  function step(dt, wishX, wishZ, wantCrouch, jump, speedOverride) {
    setCrouch(wantCrouch);
    const eyeTarget = body.crouching ? 1.02 : (options.eye ?? 1.6);
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const speed = speedOverride ?? (body.crouching ? crouchSpeed : walkSpeed);
    wish.set(wishX, 0, wishZ);
    const blend = Math.min(1, ((body.onGround ? groundAccel : airAccel) * dt) / speed);
    body.velocity.x += (wish.x * speed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * speed - body.velocity.z) * blend;
    if (body.onGround && wish.lengthSq() === 0) {
      const damp = Math.max(0, 1 - friction * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }

    if (jump && body.onGround) {
      body.velocity.y = jumpSpeed;
      body.onGround = false;
    }
    body.velocity.y -= GRAVITY * dt;

    const nextX = body.position.x + body.velocity.x * dt;
    if (!overlaps(nextX, body.position.y, body.position.z, body.height, 0.04)) body.position.x = nextX;
    else body.velocity.x = 0;
    const nextZ = body.position.z + body.velocity.z * dt;
    if (!overlaps(body.position.x, body.position.y, nextZ, body.height, 0.04)) body.position.z = nextZ;
    else body.velocity.z = 0;

    body.position.y += body.velocity.y * dt;
    body.onGround = false;
    const hit = overlaps(body.position.x, body.position.y, body.position.z, body.height, 0);
    if (hit && body.velocity.y <= 0) {
      body.position.y = hit.max.y;
      body.velocity.y = 0;
      body.onGround = true;
    } else if (hit) {
      body.position.y = hit.min.y - body.height;
      body.velocity.y = 0;
    }
    if (body.position.y < 0) {
      body.position.y = 0;
      body.velocity.y = 0;
      body.onGround = true;
    }
    body.velocity.y = Math.max(-30, body.velocity.y);
  }

  return {
    state: body,
    step,
    setCrouch,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}

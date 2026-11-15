// Tracers: a fixed pool of line segments, reused, never allocated in the frame loop.
// A shot draws one line from a muzzle to its end point and fades it over a tenth of a
// second, so a firefight reads at a glance in a still frame as well as in motion.
import * as THREE from 'three';

const POOL = 24;
const LIFE = 0.12;

export function createTracers(scene) {
  const slots = [];
  for (let index = 0; index < POOL; index += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const material = new THREE.LineBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0 });
    const line = new THREE.Line(geometry, material);
    line.frustumCulled = false;
    scene.add(line);
    slots.push({ line, life: 0 });
  }
  let next = 0;

  function fire(from, to, color = 0xff9a2a) {
    const slot = slots[next];
    next = (next + 1) % POOL;
    const positions = slot.line.geometry.attributes.position.array;
    positions[0] = from.x;
    positions[1] = from.y;
    positions[2] = from.z;
    positions[3] = to.x;
    positions[4] = to.y;
    positions[5] = to.z;
    slot.line.geometry.attributes.position.needsUpdate = true;
    slot.line.material.color.setHex(color);
    slot.life = LIFE;
  }

  function step(dt) {
    for (const slot of slots) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / LIFE) * 0.9;
    }
  }

  return { fire, step };
}

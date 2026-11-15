// The map: Ember Yard, a container yard at dusk, 40 x 30 m. Three lanes run north from the
// Vanguard spawn to the two bomb sites: west lane to Site A (Crane), east lane to Site B
// (Silo), and a mid lane with a long sightline broken by one container corner. Every solid
// box is a collider for bodies and a surface a bullet stops on; the site pads, beacons and
// the sun are decoration and never block a shot. Plain geometry only, no models, no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoint graph the bots walk: nodes are [x, z], edges link neighbours the bots may walk
// between. Lanes run along x = -9, 0 and 9; cross links run at z = 8, 0, -4 and -8.
const WAYPOINTS = [
  [0, 12], // 0 spawn
  [0, 6], // 1 mid south
  [0, 0], // 2 mid
  [0.5, -6], // 3 mid north (in the gap between the two mid containers)
  [-9, 8], // 4 west south
  [-9, 0], // 5 west mid
  [-9, -8], // 6 west north
  [9, 8], // 7 east south
  [9, 0], // 8 east mid
  [9, -8], // 9 east north
  [-14, -9.5], // 10 site A
  [-13, -4], // 11 site A approach
  [14, -9.5], // 12 site B
  [13, -4], // 13 site B approach
  [-16, 10], // 14 south-west corner
  [16, 10], // 15 south-east corner
  [-14.5, -6], // 16 north-west (clear of the A stack)
  [16, -3], // 17 north-east (clear of the silos)
  [0, -12.5], // 18 north mid (bot spawn line)
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 18],
  [0, 4], [4, 5], [5, 6], [6, 11], [6, 16],
  [0, 7], [7, 8], [8, 9], [9, 13], [9, 17],
  [1, 4], [1, 7], [1, 5], [2, 8], [3, 8], [3, 11],
  [11, 10], [13, 12], [10, 16], [12, 17], [16, 18], [9, 18],
  [4, 14], [7, 15], [14, 0], [15, 0],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }
  // The site pads and beacons glow: the same accent, as light instead of paint.
  const padMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(PALETTE.accent),
    emissive: new THREE.Color(PALETTE.accent),
    emissiveIntensity: 0.55,
    roughness: 0.6,
  });
  const beaconMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(PALETTE.accent),
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }

  function cylinder(radius, height, x, z, material) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), materials[material]);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // A cylinder's collider is its bounding box: close enough for a silo, and the same
    // Box3 the bodies already test against.
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground, 40 x 30 m, and 5 m walls, open to the dusk sky.
  box(40.4, 0.4, 30.4, 0, -0.2, 0, 'surface');
  box(0.4, 5, 30.4, -20.2, 2.5, 0, 'surface');
  box(0.4, 5, 30.4, 20.2, 2.5, 0, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, -15.2, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, 15.2, 'surface');

  // Site A, Crane: stacked containers and a gantry crane over the pad.
  box(6, 2.6, 2.6, -14.5, 1.3, -12.5, 'rust');
  box(6, 2.6, 2.6, -14.5, 3.9, -12.5, 'moss');
  box(2.6, 2.6, 6, -17.5, 1.3, -7.5, 'hairline');
  box(1.2, 1.2, 1.2, -11.5, 0.6, -11.5, 'hairline');
  box(1.2, 1.2, 1.2, -11.5, 0.6, -10.2, 'hairline');
  // Crane legs and jib, high over the site so they frame it without blocking the pad.
  box(0.5, 7, 0.5, -17.5, 3.5, -12.8, 'accent');
  box(0.5, 7, 0.5, -11.5, 3.5, -12.8, 'accent');
  box(7, 0.5, 0.5, -14.5, 7, -12.8, 'hairline');

  // Site B, Silo: two grain silos and a low crate for cover.
  cylinder(1.7, 6.5, 16.5, -12.5, 'muted');
  cylinder(1.7, 5.2, 13.2, -13.2, 'hairline');
  box(6, 2.6, 2.6, 10.5, 1.3, -12.5, 'moss');
  box(2.4, 1.2, 2.4, 17.5, 0.6, -7.5, 'rust');

  // Mid: one container corner that breaks the long sightline, a second container set
  // east of the lane so a 2 m gap stays open down the middle, and a jumpable perch.
  box(2.6, 2.6, 6, -1.8, 1.3, -2, 'rust');
  box(4, 2.6, 2.6, 5.0, 1.3, -6.5, 'hairline');
  box(3.2, 0.9, 2.4, -4.5, 0.45, -0.5, 'surface');

  // Lane cover: crates to crouch behind, kept off the lane centrelines so the waypoint
  // routes run clear. The corner blocks frame the spawn.
  box(1.2, 1.1, 1.2, -11.5, 0.55, 3.5, 'hairline');
  box(1.2, 1.1, 1.2, 11.5, 0.55, 3.5, 'hairline');
  box(0.9, 1.6, 0.9, -12, 0.8, 12, 'hairline');
  box(0.9, 1.6, 0.9, 12, 0.8, 12, 'hairline');

  // Bomb sites: a glowing pad and a beacon pillar. Decoration only: they never block a
  // bullet and never collide with a body.
  const sites = [];
  for (const [id, name, x, z] of [['A', 'Crane', -14, -9.5], ['B', 'Silo', 14, -9.5]]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 4.4), padMaterial);
    pad.position.set(x, 0.04, z);
    pad.receiveShadow = true;
    group.add(pad);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 7, 12, 1, true), beaconMaterial);
    beacon.position.set(x, 3.5, z);
    group.add(beacon);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 14, 1.8);
    lamp.position.set(x, 3.2, z);
    scene.add(lamp);
    sites.push({ id, name, center: new THREE.Vector3(x, 0, z), radius: 3.4 });
  }

  // Light: a low dusk sun from the west, a cool fill from behind, and a sky/ground gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.muted), new THREE.Color(PALETTE.canvas), 0.9);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd9a0'), 2.4);
  sun.position.set(-18, 12, 6);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(10, 9, 12);
  scene.add(fill);

  // The sun itself, low on the horizon: a flat disc the fog never touches.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(4, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), fog: false }),
  );
  disc.position.set(-55, 10, -70);
  disc.lookAt(0, 4, 0);
  scene.add(disc);

  // Waypoint graph, with an adjacency list built from the edges above.
  const nodes = WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const adjacency = nodes.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    group,
    sites,
    playerSpawn: new THREE.Vector3(0, 0, 12),
    botSpawns: [
      new THREE.Vector3(-10, 0, -10.5),
      new THREE.Vector3(-5, 0, -10.5),
      new THREE.Vector3(0, 0, -10.5),
      new THREE.Vector3(5, 0, -10.5),
      new THREE.Vector3(10, 0, -10.5),
    ],
    waypoints: { nodes, adjacency },
  };
}

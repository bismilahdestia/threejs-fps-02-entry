# Ember Yard — a three.js tactical FPS

A round-based tactical shooter in the style Counter-Strike made famous, built on
three.js 0.187.0 from static files with no build step and no network requests. One
Vanguard against five Wardens in a container yard at dusk.

## The game

- **Map** — Ember Yard, 40 x 30 m: three lanes (west to Site A "Crane", east to Site B
  "Silo", mid with a long sightline broken by one container corner), stacked
  containers, crates, grain silos, a gantry crane, a jumpable perch, and a low dusk
  sun. Every solid is a collider and a surface a bullet stops on.
- **Rounds** — first to 5, at most 9. Each round opens with a buy phase (20 s), then a
  100-second live round. Win by eliminating all five Wardens or by detonating the
  charge; lose by dying, by the clock, or by a defuse.
- **Objective** — you carry the charge. Hold **E** inside a glowing site pad for 3 s
  to plant it; the 35-second fuse beeps faster as it burns, and a Warden standing on
  it channels a 5-second defuse.
- **Economy** — start with $800 and a pistol. Kill +$300, plant +$300, round win
  +$3,250, round loss +$1,900. Buy the KX-9 Wasp SMG ($1,500), the VK-7 Emberline
  rifle ($2,700), or flash grenades ($300, max 2) between rounds.
- **Gunplay** — hitscan weapons with headshot bonus damage (rifle: 34 body / 100
  head), recoil and spread that grow with movement speed, a magazine and a reserve,
  a reload, and a view model with muzzle flash. The crosshair opens as you move.
- **Bots** — five Wardens (ASH, CINDER, SOOT, FLINT, SLAG) that patrol a waypoint
  graph, hold the sites, chase what they see and hear, strafe and burst-fire when
  they engage, converge on a planted charge, and channel the defuse. A flash
  grenade blinds every bot with a line of sight to the burst.
- **Sound** — every effect is synthesised with WebAudio: shots, hits, reloads,
  plant beeps, the explosion, round stingers. No audio files.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock) |
| Click | Fire (hold for automatics) |
| R | Reload |
| 1 / 2 / 3 | Switch weapon (buy in the buy phase) |
| E | Hold to plant the charge |
| G | Throw flash grenade (buy in the buy phase) |
| B | Hide / show the buy menu |
| Enter | Deploy from the buy phase |
| Ctrl / C | Crouch |
| Space | Jump |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

Hand it in (outside the grader, `MAKEFUN_OUTPUT_DIR` stands in for `/output`):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## Screenshot hooks

`game/index.html` takes `?shot=` with `&seed=N` (seeded, deterministic). Each
renders twice, freezes, and sets `window.__shotReady`:

| Shot | URL | Frame |
| --- | --- | --- |
| Start | `index.html?shot=start&seed=1` | Menu overlay, spawn looking down mid lane |
| Buy | `index.html?shot=buy&seed=1` | Buy menu open, SMG owned, $3,200 |
| Play | `index.html?shot=play&seed=1` | Mid-firefight: a torso hit, a headshot kill, a Warden's tracer past the player, muzzle flash |
| End | `index.html?shot=end&seed=1` | Round won, all five Wardens down, +$3,250 |

The same four URLs are in `shots.json`. Screenshots are real browser renders of
this code; `screenshots/` is filled by the capture step, not by hand.

## Layout

```
game/
  index.html            page + HUD (DOM)
  vendor/three/         three.js 0.187.0, byte for byte from the kit
  src/
    main.js             boot, fixed 60 Hz loop, shooting, shot hooks
    state.js            the match state, in one place
    rounds.js           buy / live / round end / match end + economy
    world.js            Ember Yard: map, sites, waypoint graph
    physics.js          the shared body: accel, crouch, jump, collision
    player.js           look, movement, health
    weapons.js          pistol / SMG / rifle + flash grenade + view models
    bots.js             Warden AI: patrol, seek, engage, defuse
    bomb.js             plant / fuse / defuse
    audio.js            synthesised WebAudio effects
    tracers.js          a fixed pool of tracer lines
    hud.js              DOM HUD + buy menu
    input.js            keyboard, mouse, pointer lock
    palette.js          the eight-colour look plan
```

## License

MIT — see `LICENSE`. three.js is under its own license in
`game/vendor/three/LICENSE`.

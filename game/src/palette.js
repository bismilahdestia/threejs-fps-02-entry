// The look plan, in one place. Ember Yard is a container yard at dusk: warm dark browns,
// one ember-orange accent, rust on the containers and a little moss where the yard is old.
// The same names are the CSS custom properties in index.html; no other colour appears.
export const PALETTE = {
  canvas: '#171310', // dusk sky and fog
  surface: '#2b211a', // ground and walls
  hairline: '#4a3a2a', // crates and dark steel
  ink: '#f2e9d8', // warm off-white
  muted: '#a89a83', // dim warm grey
  accent: '#ff9a2a', // ember orange: sites, HUD accents, tracers
  rust: '#b4552d', // container rust
  moss: '#7d8a6a', // old container green
};

export function shade(name) {
  return PALETTE[name];
}

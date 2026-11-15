// The match state, in one place. Nothing else holds a copy of the score, the money or
// the round: rounds.js moves it, main.js reads it, hud.js shows it.
export function createState() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    maxRounds: 9,
    winsToTake: 5,
    score: { ember: 0, wardens: 0 },
    money: 800,
    kills: 0,
    deaths: 0,
    owned: ['pistol'],
    weapon: 'pistol',
    grenades: 0,
    roundTime: 100,
    buyTime: 20,
    timer: 0,
    roundWinner: null,
    roundReason: '',
    matchWinner: null,
  };
}

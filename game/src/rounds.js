// The match: buy phase, live round, round end, next round, match end. First to five
// rounds takes the match, at most nine rounds. The economy is Counter-Strike-shaped:
// a kill pays $300, a round win pays $3,250, a loss pays $1,900, a plant pays $300.
import { WEAPONS, GRENADE_PRICE, GRENADE_MAX } from './weapons.js';

const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const PLANT_REWARD = 300;
const ROUND_END_SECONDS = 4;

export function createRounds(state, callbacks) {
  function startMatch() {
    state.phase = 'buy';
    state.round = 1;
    state.score.ember = 0;
    state.score.wardens = 0;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    state.owned = ['pistol'];
    state.weapon = 'pistol';
    state.grenades = 0;
    state.roundWinner = null;
    state.roundReason = '';
    state.matchWinner = null;
    state.timer = state.buyTime;
    callbacks.onPhase('buy');
  }

  function startRound() {
    state.phase = 'live';
    state.timer = state.roundTime;
    callbacks.onPhase('live');
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.roundWinner = winner;
    state.roundReason = reason;
    state.timer = ROUND_END_SECONDS;
    if (winner === 'ember') {
      state.score.ember += 1;
      state.money += WIN_REWARD;
    } else {
      state.score.wardens += 1;
      state.money += LOSS_REWARD;
    }
    callbacks.onRoundEnd(winner, reason);
    if (state.score.ember >= state.winsToTake || state.score.wardens >= state.winsToTake || state.round >= state.maxRounds) {
      state.phase = 'matchEnd';
      state.matchWinner = state.score.ember > state.score.wardens ? 'ember' : 'wardens';
      callbacks.onMatchEnd(state.matchWinner);
    }
  }

  function nextRound() {
    if (state.phase === 'matchEnd') {
      startMatch();
      return;
    }
    state.round += 1;
    state.phase = 'buy';
    state.roundWinner = null;
    state.roundReason = '';
    state.timer = state.buyTime;
    callbacks.onPhase('buy');
  }

  // The buy phase clock: it ticks down in buy and in roundEnd, and the round starts
  // when it runs out. Live rounds tick their own timer in main.js, which calls endRound
  // on the conditions it sees (elimination, detonation, defuse, timeout).
  function step(dt) {
    if (state.phase === 'buy' || state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.phase === 'buy') startRound();
        else nextRound();
      }
    }
  }

  function buyWeapon(id) {
    const def = WEAPONS[id];
    if (!def || state.phase !== 'buy') return false;
    if (state.owned.includes(id)) {
      state.weapon = id;
      callbacks.onBuy(id);
      return true;
    }
    if (state.money < def.price) return false;
    state.money -= def.price;
    state.owned.push(id);
    state.weapon = id;
    callbacks.onBuy(id);
    return true;
  }

  function buyGrenade() {
    if (state.phase !== 'buy' || state.grenades >= GRENADE_MAX) return false;
    if (state.money < GRENADE_PRICE) return false;
    state.money -= GRENADE_PRICE;
    state.grenades += 1;
    callbacks.onBuy('grenade');
    return true;
  }

  return {
    startMatch,
    startRound,
    endRound,
    nextRound,
    step,
    buyWeapon,
    buyGrenade,
    awardKill() {
      state.kills += 1;
      state.money += KILL_REWARD;
    },
    awardPlant() {
      state.money += PLANT_REWARD;
    },
  };
}

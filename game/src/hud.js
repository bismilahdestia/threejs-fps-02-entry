// The DOM HUD: crosshair, hit marker, health, money, timer, score, ammo, kill feed,
// banners, the plant/defuse bars and the buy menu. It never touches the simulation;
// main.js pushes numbers in and reads the button callbacks out.
import { WEAPONS, GRENADE_PRICE, GRENADE_MAX } from './weapons.js';

const COPY = {
  start: {
    title: 'Ember Yard',
    copy: 'A container yard at dusk. Five Wardens hold two bomb sites. Plant the charge at Crane or Silo — or drop them all. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Ember Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  matchWin: {
    title: 'Yard taken',
    copy: 'The Wardens are beaten and the yard is yours.',
    action: 'Play again',
  },
  matchLose: {
    title: 'Yard held',
    copy: 'The Wardens kept their sites. Run it back.',
    action: 'Play again',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammo = document.getElementById('ammo');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const weaponName = document.getElementById('weapon-name');
  const healthFill = document.getElementById('health-fill');
  const healthNum = document.getElementById('health-num');
  const moneyValue = document.getElementById('money-value');
  const timerValue = document.getElementById('timer-value');
  const timerLabel = document.getElementById('timer-label');
  const scoreValue = document.getElementById('score-value');
  const killsValue = document.getElementById('kills-value');
  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  const damage = document.getElementById('damage');
  const flash = document.getElementById('flash');
  const banner = document.getElementById('banner');
  const bannerTitle = document.getElementById('banner-title');
  const bannerSub = document.getElementById('banner-sub');
  const prompt = document.getElementById('prompt');
  const plant = document.getElementById('plant');
  const plantFill = document.getElementById('plant-fill');
  const plantLabel = document.getElementById('plant-label');
  const killfeed = document.getElementById('killfeed');
  const buy = document.getElementById('buy');
  const buyItems = document.getElementById('buy-items');
  const buyMoney = document.getElementById('buy-money');
  const deploy = document.getElementById('deploy');

  let hitTimer = 0;
  let bannerTimer = 0;
  let damageTimer = 0;
  let lastMag = -1;
  let lastReserve = -1;
  let lastHealth = -1;
  let lastMoney = -1;
  let lastTimer = -1;
  let lastScore = '';
  let lastKills = -1;
  let lastWeapon = '';
  let buyHandler = null;

  function text(element, value, last) {
    if (value === last) return last;
    element.textContent = value;
    return value;
  }

  return {
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      if (name === lastWeapon) return;
      lastWeapon = name;
      weaponName.textContent = name;
    },
    setHealth(hp) {
      if (hp === lastHealth) return;
      lastHealth = hp;
      healthNum.textContent = String(hp);
      healthFill.style.width = `${hp}%`;
      healthFill.classList.toggle('low', hp <= 30);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
    },
    setTimer(seconds, label) {
      const shown = Math.max(0, Math.ceil(seconds));
      if (shown !== lastTimer) {
        lastTimer = shown;
        const minutes = Math.floor(shown / 60);
        const rest = shown % 60;
        timerValue.textContent = `${minutes}:${String(rest).padStart(2, '0')}`;
      }
      if (label !== undefined) timerLabel.textContent = label;
    },
    setRoundScore(ember, wardens, round) {
      const value = `EMBER ${ember} — ${wardens} WARDENS · ROUND ${round}`;
      lastScore = text(scoreValue, value, lastScore);
    },
    setKills(value) {
      lastKills = text(killsValue, String(value), lastKills);
    },
    setCrosshairGap(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      damage.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => damage.classList.remove('on'), 220);
    },
    flashbang(strength) {
      flash.style.opacity = String(Math.min(1, strength));
      setTimeout(() => {
        flash.style.opacity = '0';
      }, 60);
    },
    killfeed(line) {
      const item = document.createElement('div');
      item.className = 'feed-item';
      item.innerHTML = line; // lines are built here from fixed callsigns, never from input
      killfeed.prepend(item);
      while (killfeed.children.length > 5) killfeed.lastChild.remove();
      setTimeout(() => item.remove(), 6000);
    },
    banner(titleText, subText, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => banner.classList.remove('on'), holdMs);
    },
    hideBanner() {
      clearTimeout(bannerTimer);
      banner.classList.remove('on');
    },
    prompt(textValue) {
      if (textValue) {
        prompt.textContent = textValue;
        prompt.hidden = false;
      } else {
        prompt.hidden = true;
      }
    },
    plantProgress(value, label) {
      if (value === null) {
        plant.hidden = true;
        return;
      }
      plant.hidden = false;
      plantLabel.textContent = label;
      plantFill.style.width = `${Math.round(value * 100)}%`;
    },
    showBuy(money, owned, weapon, grenades) {
      buyMoney.textContent = `$${money}`;
      buyItems.innerHTML = '';
      const entries = Object.values(WEAPONS).map((def) => ({
        id: def.id,
        name: def.name,
        price: def.price,
        desc: def.id === 'pistol' ? 'Sidearm · 12 rounds · always yours' : `${def.mag} rounds · ${def.damage} dmg · ${def.headDamage} headshot`,
        owned: owned.includes(def.id),
        current: weapon === def.id,
      }));
      entries.push({
        id: 'grenade',
        name: 'Flash grenade',
        price: GRENADE_PRICE,
        desc: `Blinds Wardens with line of sight · ${grenades}/${GRENADE_MAX} carried`,
        owned: grenades >= GRENADE_MAX,
        current: false,
      });
      for (const entry of entries) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = entry.owned || money < entry.price;
        button.innerHTML = `<b>${entry.name}</b><span>${entry.desc}</span><i>${entry.owned ? (entry.current ? 'EQUIPPED' : 'OWNED') : `$${entry.price}`}</i>`;
        button.addEventListener('click', () => {
          if (buyHandler) buyHandler(entry.id);
        });
        buyItems.appendChild(button);
      }
      buy.hidden = false;
    },
    hideBuy() {
      buy.hidden = true;
    },
    showOverlay(mode, score) {
      const textCopy = COPY[mode];
      title.textContent = textCopy.title;
      copy.textContent = mode === 'matchWin' || mode === 'matchLose' ? `${textCopy.copy} Final score ${score}.` : textCopy.copy;
      play.textContent = textCopy.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    onDeploy(handler) {
      deploy.addEventListener('click', handler);
    },
  };
}

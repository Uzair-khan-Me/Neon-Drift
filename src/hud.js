/**
 * HUD, menus and game-over screen — all DOM/CSS, updated from the game loop.
 */
export class HUD {
  constructor() {
    this.els = {
      menu: document.getElementById('screen-menu'),
      hud: document.getElementById('hud'),
      pause: document.getElementById('screen-pause'),
      gameover: document.getElementById('screen-gameover'),
      speedValue: document.getElementById('speed-value'),
      needle: document.getElementById('needle'),
      gear: document.getElementById('gear-display'),
      distance: document.getElementById('hud-distance'),
      score: document.getElementById('hud-score'),
      money: document.getElementById('hud-money'),
      nearmiss: document.getElementById('hud-nearmiss'),
      bonusHighSpeed: document.getElementById('bonus-highspeed'),
      bonusWrongWay: document.getElementById('bonus-wrongway'),
      goDistance: document.getElementById('go-distance'),
      goMaxSpeed: document.getElementById('go-maxspeed'),
      goAvgSpeed: document.getElementById('go-avgspeed'),
      goNearMiss: document.getElementById('go-nearmiss'),
      goScore: document.getElementById('go-score'),
      goMoney: document.getElementById('go-money'),
      goBest: document.getElementById('go-best'),
      menuBest: document.getElementById('menu-best'),
      crashFlash: null,
    };

    this.buildGaugeTicks();
    this.createCrashFlash();
  }

  buildGaugeTicks() {
    const layer = document.getElementById('tick-layer');
    // Gauge spans -135deg (0 km/h) to +135deg (260 km/h) -> 270 deg total
    const maxSpeed = 260;
    const step = 20;
    for (let v = 0; v <= maxSpeed; v += step) {
      const deg = -135 + (v / maxSpeed) * 270;
      const tick = document.createElement('div');
      tick.className = 'tick ' + (v % 100 === 0 ? 'major' : '');
      tick.style.transform = `rotate(${deg}deg) translateY(-86px)`;
      layer.appendChild(tick);
    }
  }

  createCrashFlash() {
    const flash = document.createElement('div');
    flash.className = 'crash-flash';
    document.body.appendChild(flash);
    this.els.crashFlash = flash;
  }

  show(screen) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(screen).classList.add('active');
  }

  menu(bestDistance) {
    this.els.menuBest.textContent = Math.floor(bestDistance) + ' M';
    this.show('screen-menu');
  }

  playing() {
    this.show('hud');
  }

  pause() {
    this.show('screen-pause');
  }

  gameOver(stats) {
    this.els.goDistance.textContent = Math.floor(stats.distance);
    this.els.goMaxSpeed.textContent = Math.floor(stats.maxSpeed);
    this.els.goAvgSpeed.textContent = Math.floor(stats.avgSpeed);
    this.els.goNearMiss.textContent = stats.nearMisses;
    this.els.goScore.textContent = Math.floor(stats.score);
    this.els.goMoney.textContent = Math.floor(stats.money);
    this.els.goBest.textContent = Math.floor(stats.best) + ' M';
    this.show('screen-gameover');
  }

  /** Called every frame while driving. */
  update(car, stats) {
    const kmh = car.speedKmh;
    this.els.speedValue.textContent = Math.floor(kmh);

    // Needle: -135 deg at 0, +135 deg at 260 km/h
    const needleDeg = -135 + Math.min(kmh, 260) / 260 * 270;
    this.els.needle.style.transform = `translateX(-50%) rotate(${needleDeg}deg)`;

    this.els.gear.textContent = car.gear;
    this.els.gear.style.color = car.gear === 'R' ? '#ff6b6b' : car.gear === 'N' ? '#ff00ff' : '#00e5ff';

    this.els.distance.textContent = Math.floor(stats.distance);
    this.els.score.textContent = Math.floor(stats.score);
    this.els.money.textContent = Math.floor(stats.money);
    this.els.nearmiss.textContent = stats.nearMisses;

    // Bonus banners
    const hs = this.els.bonusHighSpeed;
    const ww = this.els.bonusWrongWay;
    const showHigh = stats.highSpeedActive;
    const showWrong = stats.wrongWayActive;
    hs.style.display = showHigh ? 'block' : 'none';
    ww.style.display = showWrong ? 'block' : 'none';
    if (showHigh) hs.classList.add('flash'); else hs.classList.remove('flash');
    if (showWrong) ww.classList.add('flash'); else ww.classList.remove('flash');
  }

  flashCrash() {
    const f = this.els.crashFlash;
    f.style.opacity = '1';
    setTimeout(() => { f.style.opacity = '0'; }, 260);
  }
}

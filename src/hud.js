/**
 * HUD, menus and game-over screen — DOM/CSS, updated from the game loop.
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
      overtakes: document.getElementById('hud-overtakes'),
      nearmiss: document.getElementById('hud-nearmiss'),
      bonusHighSpeed: document.getElementById('bonus-highspeed'),
      bonusClean: document.getElementById('bonus-clean'),
      goDistance: document.getElementById('go-distance'),
      goMaxSpeed: document.getElementById('go-maxspeed'),
      goAvgSpeed: document.getElementById('go-avgspeed'),
      goOvertakes: document.getElementById('go-overtakes'),
      goNearMiss: document.getElementById('go-nearmiss'),
      goScore: document.getElementById('go-score'),
      goBest: document.getElementById('go-best'),
      menuBest: document.getElementById('menu-best'),
      crashFlash: null,
    };

    this.buildGaugeTicks();
    this.createCrashFlash();
  }

  buildGaugeTicks() {
    const layer = document.getElementById('tick-layer');
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
    this.els.menuBest.textContent = this.formatDistance(bestDistance);
    this.show('screen-menu');
  }

  playing() {
    this.show('hud');
  }

  pause() {
    this.show('screen-pause');
  }

  gameOver(stats) {
    this.els.goDistance.textContent = this.formatDistance(stats.distance);
    this.els.goMaxSpeed.textContent = Math.floor(stats.maxSpeed);
    this.els.goAvgSpeed.textContent = Math.floor(stats.avgSpeed);
    this.els.goOvertakes.textContent = stats.overtakes;
    this.els.goNearMiss.textContent = stats.nearMisses;
    this.els.goScore.textContent = Math.floor(stats.score);
    this.els.goBest.textContent = this.formatDistance(stats.best);
    this.show('screen-gameover');
  }

  /** Format distance: meters below 1km, decimal km above. */
  formatDistance(distanceKm) {
    if (distanceKm < 1) {
      return Math.floor(distanceKm * 1000) + ' m';
    }
    return distanceKm.toFixed(1) + ' km';
  }

  update(car, stats) {
    const kmh = car.speedKmh;
    this.els.speedValue.textContent = Math.floor(kmh);
    const needleDeg = -135 + Math.min(kmh, 260) / 260 * 270;
    this.els.needle.style.transform = `translateX(-50%) rotate(${needleDeg}deg)`;

    this.els.gear.textContent = car.gear;
    this.els.gear.style.color = car.gear === 'R' ? '#a86a6a' : car.gear === 'N' ? '#b9a87d' : '#b9a87d';

    this.els.distance.textContent = this.formatDistance(stats.distance);
    this.els.score.textContent = Math.floor(stats.score);
    this.els.overtakes.textContent = stats.overtakes;
    this.els.nearmiss.textContent = stats.nearMisses;

    const hs = this.els.bonusHighSpeed;
    const cl = this.els.bonusClean;
    hs.style.display = stats.highSpeedActive ? 'block' : 'none';
    cl.style.display = stats.cleanOvertakeActive ? 'block' : 'none';
    if (stats.highSpeedActive) hs.classList.add('flash'); else hs.classList.remove('flash');
    if (stats.cleanOvertakeActive) cl.classList.add('flash'); else cl.classList.remove('flash');
  }

  flashCrash() {
    const f = this.els.crashFlash;
    f.style.opacity = '1';
    setTimeout(() => { f.style.opacity = '0'; }, 350);
  }
}

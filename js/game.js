/**
 * Idle Breakout - Classic Retro Edition with Bosses, Power-ups & Bonus Orbs
 */

class IdleBreakoutGame {
  constructor() {
    this.SAVE_KEY = 'idle_breakout_classic_v2';

    // Core Game State
    this.money = 0;
    this.level = 1;
    this.bb = 0; // Breakout Badges
    this.rebirthCount = 0;
    this.rebirthMultiplier = 1.0;
    this.clickPower = 1;
    this.clickUpgradeLevel = 1;

    // Ball types definition
    this.ballTypes = {
      basic: {
        id: 'basic',
        name: 'BASIC BALL',
        color: '#ffee00',
        count: 0,
        baseCost: 25,
        costMult: 1.15,
        baseSpeed: 4.5,
        speedLevel: 1,
        speedBaseCost: 100,
        basePower: 1,
        powerLevel: 1,
        powerBaseCost: 250
      },
      plasma: {
        id: 'plasma',
        name: 'PLASMA BALL',
        color: '#ff00bb',
        count: 0,
        baseCost: 200,
        costMult: 1.20,
        baseSpeed: 5.8,
        speedLevel: 1,
        speedBaseCost: 400,
        basePower: 3,
        powerLevel: 1,
        powerBaseCost: 800
      },
      sniper: {
        id: 'sniper',
        name: 'SNIPER BALL',
        color: '#00ff66',
        count: 0,
        baseCost: 1000,
        costMult: 1.22,
        baseSpeed: 5.0,
        speedLevel: 1,
        speedBaseCost: 1500,
        basePower: 6,
        powerLevel: 1,
        powerBaseCost: 3000
      },
      scatter: {
        id: 'scatter',
        name: 'SCATTER BALL',
        color: '#ff6600',
        count: 0,
        baseCost: 4500,
        costMult: 1.25,
        baseSpeed: 4.8,
        speedLevel: 1,
        speedBaseCost: 5000,
        basePower: 12,
        powerLevel: 1,
        powerBaseCost: 9000
      },
      poison: {
        id: 'poison',
        name: 'POISON BALL',
        color: '#aa00ff',
        count: 0,
        baseCost: 20000,
        costMult: 1.28,
        baseSpeed: 5.2,
        speedLevel: 1,
        speedBaseCost: 25000,
        basePower: 8,
        powerLevel: 1,
        powerBaseCost: 40000
      }
    };

    // Active entities in arena
    this.balls = [];
    this.bricks = [];
    this.perimeterBricks = [];
    this.floatingTexts = [];
    this.particles = [];

    // Active Power-ups System
    // Keys: '2x_money', '2x_dmg', 'piercing', 'shockwave', 'speed_boost'
    this.activePowerUps = {};

    // Shockwave ticker
    this.shockwaveTimer = 0;
    this.shockwaveRings = []; // visual expanding rings

    // Shrinking Bonus Orb Event (5s lifespan, shrinks, gives cash on click)
    this.bonusOrb = null; // { x, y, radius, maxRadius, lifetime, maxLifetime, value }
    this.nextBonusOrbTime = 18; // seconds until first spawn

    // Canvas & Dimensions
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.width = 800;
    this.height = 650;
    this.dpr = window.devicePixelRatio || 1;

    // Timing & Background/Offline Runner
    this.lastTime = performance.now();
    this.lastTickMs = Date.now();
    this.autosaveTimer = 0;
    this.suppressAudioAndVisuals = false;
    this.pendingOfflineSeconds = 0;
    this.bgWorker = null;
    this.bgInterval = null;
    this.isResetting = false;
  }

  init() {
    this.setupCanvas();
    window.addEventListener('resize', () => this.handleResize());

    // Load saved data
    this.load();

    // Setup perimeter border bricks and arena level
    this.createPerimeterBricks();
    this.generateLevel(this.level);

    // Apply offline progress if the game was closed for >= 5s and player has balls
    if (this.pendingOfflineSeconds >= 5 && this.getTotalBalls() > 0) {
      this.applyOfflineProgress(this.pendingOfflineSeconds, true);
      this.pendingOfflineSeconds = 0;
    }

    // Bind UI & Canvas events
    this.bindEvents();

    // Start background runner so the game keeps running on other tabs
    this.startBackgroundRunner();

    // Start 60 FPS visual Game Loop
    this.lastTickMs = Date.now();
    requestAnimationFrame((t) => this.gameLoop(t));
  }

  // --- Canvas Setup ---
  setupCanvas() {
    const wrapper = document.getElementById('arena-wrapper');
    const rect = wrapper.getBoundingClientRect();
    this.width = Math.max(400, Math.floor(rect.width));
    this.height = Math.max(400, Math.floor(rect.height));
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  handleResize() {
    this.setupCanvas();
    this.createPerimeterBricks();
    this.generateLevel(this.level);
  }

  // --- White Perimeter Border Bricks ---
  createPerimeterBricks() {
    this.perimeterBricks = [];
    const borderWidth = 18;

    const topCount = Math.floor(this.width / 50);
    const topW = this.width / topCount;
    for (let i = 0; i < topCount; i++) {
      this.perimeterBricks.push({ x: i * topW, y: 0, w: topW, h: borderWidth });
    }

    const btmCount = Math.floor(this.width / 50);
    const btmW = this.width / btmCount;
    for (let i = 0; i < btmCount; i++) {
      this.perimeterBricks.push({ x: i * btmW, y: this.height - borderWidth, w: btmW, h: borderWidth });
    }

    const leftCount = Math.floor((this.height - borderWidth * 2) / 35);
    const leftH = (this.height - borderWidth * 2) / leftCount;
    for (let i = 0; i < leftCount; i++) {
      this.perimeterBricks.push({ x: 0, y: borderWidth + i * leftH, w: borderWidth, h: leftH });
    }

    const rightCount = Math.floor((this.height - borderWidth * 2) / 35);
    const rightH = (this.height - borderWidth * 2) / rightCount;
    for (let i = 0; i < rightCount; i++) {
      this.perimeterBricks.push({ x: this.width - borderWidth, y: borderWidth + i * rightH, w: borderWidth, h: rightH });
    }
  }

  // --- Color Mapping by HP (1: Kék, 2: Citromsárga, 3: Narancs...) ---
  getBlockColor(hp, isBoss = false) {
    if (isBoss) {
      return '#e11d48'; // Striking boss crimson
    }

    switch (hp) {
      case 1: return '#42c2f7'; // 1: Kék
      case 2: return '#facc15'; // 2: Citromsárga
      case 3: return '#f97316'; // 3: Narancssárga
      case 4: return '#4ade80'; // 4: Élénkzöld
      case 5: return '#ef4444'; // 5: Piros
      case 6: return '#a855f7'; // 6: Lila
      case 7: return '#ec4899'; // 7: Rózsaszín
      case 8: return '#06b6d4'; // 8: Cián/Türkiz
      case 9: return '#eab308'; // 9: Arany/Borostyán
      default:
        // Ciklikus szép retro paletta a 10 feletti blokkokhoz
        const hues = ['#38bdf8', '#facc15', '#fb923c', '#22c55e', '#ef4444', '#c084fc', '#f472b6', '#14b8a6'];
        return hues[(hp - 1) % hues.length];
    }
  }

  // --- Level Generator (Normal random grids OR Boss Blocks on lvl 10, 20, 30...) ---
  generateLevel(lvl) {
    this.bricks = [];
    const perimeterPadding = 22;
    const arenaW = this.width - perimeterPadding * 2;
    const arenaH = this.height - perimeterPadding * 2;

    // Boss level check: Every 10th level is a Mega Boss Block!
    if (lvl % 10 === 0) {
      const bossW = arenaW * 0.62;
      const bossH = arenaH * 0.44;
      const bossX = perimeterPadding + (arenaW - bossW) / 2;
      const bossY = perimeterPadding + (arenaH * 0.5 - bossH) / 2 + 30;

      // Boss HP scales with level
      const bossHp = lvl * 40;

      this.bricks.push({
        x: bossX,
        y: bossY,
        w: bossW,
        h: bossH,
        hp: bossHp,
        maxHp: bossHp,
        isBoss: true,
        flash: 0
      });

      if (!this.suppressAudioAndVisuals) this.updateHUD();
      return;
    }

    // Normal level generation with random patterns
    const cols = Math.max(6, Math.min(10, Math.floor(arenaW / 55)));
    const rows = Math.max(8, Math.min(15, Math.floor(arenaH / 30)));

    const brickW = arenaW / cols;
    const brickH = (arenaH * 0.88) / rows;

    const blockHp = lvl;
    const patternType = (lvl + Math.floor(Math.random() * 4)) % 4;
    const midCol = Math.floor(cols / 2);
    const midRow = Math.floor(rows / 2);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let spawn = true;

        if (patternType === 0) {
          // Hollow center arena
          const distToCenter = Math.hypot(c - midCol, r - midRow);
          if (distToCenter < 2.2) spawn = false;
        } else if (patternType === 1) {
          // Random maze scattering
          if (Math.random() < 0.28) spawn = false;
        } else if (patternType === 2) {
          // Gaps in alternating columns
          if ((c % 2 === 1) && (r > 2 && r < rows - 2) && Math.random() < 0.5) spawn = false;
        } else if (patternType === 3) {
          // Diamond / circular cutout
          if (Math.abs(c - midCol) + Math.abs(r - midRow) < 2) spawn = false;
        }

        if (spawn) {
          this.bricks.push({
            x: perimeterPadding + c * brickW,
            y: perimeterPadding + r * brickH,
            w: brickW,
            h: brickH,
            hp: blockHp,
            maxHp: blockHp,
            isBoss: false,
            flash: 0
          });
        }
      }
    }

    // Fallback if empty
    if (this.bricks.length === 0) {
      for (let c = 0; c < cols; c++) {
        this.bricks.push({
          x: perimeterPadding + c * brickW,
          y: perimeterPadding + 2 * brickH,
          w: brickW,
          h: brickH,
          hp: blockHp,
          maxHp: blockHp,
          isBoss: false,
          flash: 0
        });
      }
    }

    if (!this.suppressAudioAndVisuals) this.updateHUD();
  }

  // --- Brick Damage & Money Reward ---
  damageBrick(brick, dmg, source = 'click') {
    if (brick.hp <= 0) return;

    // A piercing hatás CSAK a külön ideiglenes áttörő szuperlabdára érvényes, NEM az összes labdára!
    let actualDmg = dmg;
    if (source === 'piercing_special') {
      if (brick.isBoss) {
        actualDmg = Math.max(10, Math.round(brick.maxHp * 0.05)); // 5% HP ütésenként a Boss-ra
      } else {
        actualDmg = brick.hp; // Normál téglák azonnali kiütése
      }
    }

    // Check 2x Damage power-up
    if (this.isPowerUpActive('2x_dmg') && (source !== 'piercing_special' || brick.isBoss)) {
      actualDmg *= 2;
    }

    actualDmg = Math.min(brick.hp, actualDmg);
    brick.hp -= actualDmg;
    brick.flash = 0.1;

    // Money calculation:
    // Boss gives significantly more money per damage, scaling with level!
    let baseRewardPerDmg = 1;
    if (brick.isBoss) {
      baseRewardPerDmg = 1 + (this.level * 0.15); // e.g. lvl 10 = 2.5x, lvl 50 = 8.5x
    }

    let reward = actualDmg * baseRewardPerDmg * this.rebirthMultiplier;
    if (this.isPowerUpActive('2x_money')) {
      reward *= 2;
    }

    this.money += reward;

    const silent = this.suppressAudioAndVisuals || document.hidden;

    // Floating text
    if (!silent) {
      this.addFloatingText(`+$${Math.round(reward)}`, brick.x + brick.w / 2, brick.y + brick.h / 2);
    }

    if (brick.hp <= 0) {
      if (!silent && window.soundEngine) window.soundEngine.playBrickDestroy(brick.isBoss ? 5 : 1);

      // Boss death reward
      if (brick.isBoss) {
        const bossBonus = Math.round(this.level * 120 * this.rebirthMultiplier * (this.isPowerUpActive('2x_money') ? 2 : 1));
        this.money += bossBonus;
        if (!silent) {
          this.addFloatingText(`BOSS BONUS: +$${bossBonus}! 🏆`, brick.x + brick.w / 2, brick.y + brick.h / 2 - 20);
        }
      } else if (source !== 'piercing_special' && source !== 'shockwave') {
        // Roll for random power-up drop on regular bricks
        this.rollPowerUpDrop(brick.x + brick.w / 2, brick.y + brick.h / 2);
      }

      this.checkLevelClear();
    } else {
      if (!silent && window.soundEngine) {
        if (source === 'click') window.soundEngine.playClickHit();
        else window.soundEngine.playHit(source);
      }
    }

    if (!this.suppressAudioAndVisuals) {
      this.updateHUD();
    }
  }

  checkLevelClear() {
    const remaining = this.bricks.filter(b => b.hp > 0).length;
    if (remaining === 0) {
      this.level++;
      if (!this.suppressAudioAndVisuals && !document.hidden && window.soundEngine) {
        window.soundEngine.playLevelUp();
      }
      this.generateLevel(this.level);
    }
  }

  // --- Power-Up Drop & Active Management ---
  rollPowerUpDrop(x, y) {
    // Ha már van bármilyen aktív power-up, egyáltalán NE dobjon újat (nem halmozódik!)
    if (Object.keys(this.activePowerUps).length > 0) {
      return;
    }

    // Power-Up esélyek közvetlenül százalékban (%) minden kiütött normál blokk után:
    // Összesen: 0.31% (~323 blokkonként 1 power-up, 300-350 közötti átlag!), 99.69% semmi!
    // Arányok: 10 : 10 : 5 : 5 : 1 | Rebirth bónusz: +0.03% össz-esély / rebirth
    const baseTotalPercent = 0.31;
    const rebirthBonusPercent = this.rebirthCount * 0.03;
    const scale = (baseTotalPercent + rebirthBonusPercent) / baseTotalPercent;

    const chanceMoney     = 0.10 * scale; // 0.10% esély: 2x Pénz (10 rész)
    const chanceDamage    = 0.10 * scale; // 0.10% esély: 2x Sebzés (10 rész)
    const chanceShockwave = 0.05 * scale; // 0.05% esély: Sokk-hullám (5 rész)
    const chanceSpeed     = 0.05 * scale; // 0.05% esély: Turbó Sebesség (5 rész)
    const chancePiercing  = 0.01 * scale; // 0.01% esély: Áttörő Szuperlabda (1 rész)
    // Összesen: 0.31% (~1 / 323 blokk) | Semmi: 99.69%

    const roll = Math.random() * 100; // 0.00% - 100.00%

    if (roll < chanceMoney) {
      // 0.10% eséllyel 2x Pénz (10 mp)
      this.activatePowerUp('2x_money', '💰', '2x Pénz', 'Minden találat és kiütött blokk kétszeres pénzt ad 10 mp-ig!', 10);
    } else if (roll < chanceMoney + chanceDamage) {
      // 0.10% eséllyel 2x Sebzés (10 mp)
      this.activatePowerUp('2x_dmg', '💥', '2x Sebzés', 'Dupla sebzés minden labdára és kézi kattintásra 10 mp-ig!', 10);
    } else if (roll < chanceMoney + chanceDamage + chanceShockwave) {
      // 0.05% eséllyel Sokk-hullám (30 mp)
      this.activatePowerUp('shockwave', '🌊', 'Sokk-hullám', 'Másodpercenként 1 területi sebzést okoz a környező blokkoknak 30 mp-ig!', 30);
    } else if (roll < chanceMoney + chanceDamage + chanceShockwave + chanceSpeed) {
      // 0.05% eséllyel Turbó Sebesség (20 mp)
      this.activatePowerUp('speed_boost', '🚀', 'Turbó Sebesség', 'A labdák 1.4x gyorsabban pattognak 20 mp-ig!', 20);
    } else if (roll < chanceMoney + chanceDamage + chanceShockwave + chanceSpeed + chancePiercing) {
      // 0.01% eséllyel Áttörő Szuperlabda (45 mp - külön új ideiglenes labda!)
      this.activatePowerUp('piercing', '⚡', 'Áttörő Szuperlabda', 'Egy új áttörő szuperlabda csatlakozott 45 mp-re, ami átvág a blokkokon és azonnal kiüti őket!', 45);
      this.spawnPiercingBall(45);
    }
    // Egyébként (99.50%): SEMMI sem történik!
  }

  activatePowerUp(id, icon, name, desc, duration) {
    this.activePowerUps[id] = {
      id,
      icon,
      name,
      desc,
      duration,
      maxDuration: duration
    };

    if (!this.suppressAudioAndVisuals && !document.hidden && window.soundEngine) {
      window.soundEngine.playCoin();
    }
    if (!this.suppressAudioAndVisuals) {
      this.renderPowerUpsHUD();
    }
  }

  isPowerUpActive(id) {
    return !!this.activePowerUps[id] && this.activePowerUps[id].duration > 0;
  }

  updatePowerUps(dt) {
    let changed = false;
    for (const key in this.activePowerUps) {
      const p = this.activePowerUps[key];
      p.duration -= dt;
      if (p.duration <= 0) {
        delete this.activePowerUps[key];
        changed = true;
      }
    }

    // Shockwave ticker (every 1.0 second while active)
    if (this.isPowerUpActive('shockwave')) {
      this.shockwaveTimer += dt;
      if (this.shockwaveTimer >= 1.0) {
        this.shockwaveTimer = 0;
        this.triggerShockwave();
      }
    }

    if (!this.suppressAudioAndVisuals) {
      if (changed) {
        this.renderPowerUpsHUD();
      } else {
        // Update timer bars smoothly
        this.updatePowerUpTimerBars();
      }
    }
  }

  triggerShockwave() {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.45;

    // Visual expanding shockwave ring
    this.shockwaveRings.push({ x: cx, y: cy, radius: 10, maxRadius, alpha: 0.8 });

    // Damage all bricks within radius by 1
    for (const b of this.bricks) {
      if (b.hp <= 0) continue;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;
      if (Math.hypot(bx - cx, by - cy) <= maxRadius) {
        this.damageBrick(b, 1, 'shockwave');
      }
    }
  }

  renderPowerUpsHUD() {
    const container = document.getElementById('active-powerups-container');
    if (!container) return;
    container.innerHTML = '';

    for (const key in this.activePowerUps) {
      const p = this.activePowerUps[key];
      const badge = document.createElement('div');
      badge.className = 'powerup-hud-badge';
      badge.id = `pu-badge-${p.id}`;

      badge.innerHTML = `
        <span>${p.icon}</span>
        <div class="powerup-timer-bar" id="pu-bar-${p.id}"></div>
        <div class="tooltip-box">
          <strong>${p.name}</strong><br>
          ${p.desc}<br>
          <span style="color: #2cd64e;" id="pu-time-${p.id}">Hátralévő idő: ${Math.ceil(p.duration)}mp</span>
        </div>
      `;

      container.appendChild(badge);
    }
  }

  updatePowerUpTimerBars() {
    for (const key in this.activePowerUps) {
      const p = this.activePowerUps[key];
      const bar = document.getElementById(`pu-bar-${p.id}`);
      if (bar) {
        const pct = Math.max(0, (p.duration / p.maxDuration) * 100);
        bar.style.width = `${pct}%`;
      }
      const timeEl = document.getElementById(`pu-time-${p.id}`);
      if (timeEl) {
        timeEl.textContent = `Hátralévő idő: ${Math.ceil(p.duration)}mp`;
      }
    }
  }

  // --- Shrinking Bonus Orb Event (5s countdown, reward on click) ---
  updateBonusOrb(dt) {
    // If active, decrement lifetime and shrink
    if (this.bonusOrb) {
      this.bonusOrb.lifetime -= dt;
      this.bonusOrb.radius = Math.max(2, this.bonusOrb.maxRadius * (this.bonusOrb.lifetime / this.bonusOrb.maxLifetime));

      if (this.bonusOrb.lifetime <= 0) {
        this.bonusOrb = null;
        this.nextBonusOrbTime = 22 + Math.random() * 20; // 22-42 seconds until next
      }
    } else {
      // Countdown to spawn
      this.nextBonusOrbTime -= dt;
      if (this.nextBonusOrbTime <= 0) {
        this.spawnBonusOrb();
      }
    }
  }

  spawnBonusOrb() {
    const padding = 60;
    const x = padding + Math.random() * (this.width - padding * 2);
    const y = padding + Math.random() * (this.height - padding * 2);
    const maxRadius = 26;

    // Value scales with Rebirth Multiplier and Level!
    const value = Math.round(100 * this.rebirthMultiplier * (1 + this.level * 0.1));

    this.bonusOrb = {
      x,
      y,
      radius: maxRadius,
      maxRadius,
      lifetime: 5.0, // exactly 5 seconds
      maxLifetime: 5.0,
      value
    };
  }

  clickBonusOrb(clickX, clickY) {
    if (!this.bonusOrb) return false;

    const dist = Math.hypot(clickX - this.bonusOrb.x, clickY - this.bonusOrb.y);
    if (dist <= Math.max(this.bonusOrb.radius, 18)) {
      const reward = this.bonusOrb.value * (this.isPowerUpActive('2x_money') ? 2 : 1);
      this.money += reward;

      // Confetti / star particles
      this.addFloatingText(`BÓNUSZ: +$${reward}! 🌟`, this.bonusOrb.x, this.bonusOrb.y);
      if (window.soundEngine) window.soundEngine.playCoin();

      this.bonusOrb = null;
      this.nextBonusOrbTime = 25 + Math.random() * 25;
      this.updateHUD();
      return true;
    }
    return false;
  }

  // --- Ball Purchase & Spawning ---
  getBallCost(typeKey) {
    const b = this.ballTypes[typeKey];
    return Math.round(b.baseCost * Math.pow(b.costMult, b.count));
  }

  buyBall(typeKey) {
    const cost = this.getBallCost(typeKey);
    if (this.money >= cost && this.getTotalBalls() < 50) {
      this.money -= cost;
      this.ballTypes[typeKey].count++;

      this.spawnBall(typeKey);

      if (window.soundEngine) window.soundEngine.playCoin();
      this.updateHUD();
      this.renderUpgradesMenu();
    }
  }

  spawnBall(typeKey) {
    const bDef = this.ballTypes[typeKey];
    const borderWidth = 22;
    const x = this.width / 2 + (Math.random() * 40 - 20);
    const y = this.height - borderWidth - 30;

    const angle = -(Math.PI * 0.25 + Math.random() * Math.PI * 0.5);
    const speed = bDef.baseSpeed + (bDef.speedLevel - 1) * 0.3;

    this.balls.push({
      type: typeKey,
      color: bDef.color,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 7.5,
      power: bDef.basePower + (bDef.powerLevel - 1) * (typeKey === 'basic' ? 1 : 2),
      speed
    });
  }

  spawnPiercingBall(duration = 45) {
    const borderWidth = 22;
    const x = this.width / 2 + (Math.random() * 40 - 20);
    const y = this.height - borderWidth - 30;
    const angle = -(Math.PI * 0.25 + Math.random() * Math.PI * 0.5);
    const speed = 6.2;

    this.balls.push({
      type: 'piercing_special',
      color: '#ffffff',
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 8.5,
      power: 999999,
      speed,
      isPiercing: true,
      timeLeft: duration
    });
  }

  deleteBall(typeKey) {
    const bDef = this.ballTypes[typeKey];
    if (bDef.count > 0) {
      bDef.count--;
      const idx = this.balls.findIndex(b => b.type === typeKey && !b.isPiercing);
      if (idx !== -1) this.balls.splice(idx, 1);
      this.updateHUD();
      this.renderUpgradesMenu();
    }
  }

  getTotalBalls() {
    // Az ideiglenes áttörő szuperlabda nem számít bele a vásárolható 50-es limitbe
    return this.balls.filter(b => !b.isPiercing).length;
  }

  // --- Upgrades (Speed, Power, Click) ---
  getSpeedUpgradeCost(typeKey) {
    const b = this.ballTypes[typeKey];
    return Math.round(b.speedBaseCost * Math.pow(1.22, b.speedLevel - 1));
  }

  getPowerUpgradeCost(typeKey) {
    const b = this.ballTypes[typeKey];
    return Math.round(b.powerBaseCost * Math.pow(1.25, b.powerLevel - 1));
  }

  getClickUpgradeCost() {
    return Math.round(50 * Math.pow(1.3, this.clickUpgradeLevel - 1));
  }

  upgradeBallSpeed(typeKey) {
    const cost = this.getSpeedUpgradeCost(typeKey);
    if (this.money >= cost) {
      this.money -= cost;
      const bDef = this.ballTypes[typeKey];
      bDef.speedLevel++;

      const newSpeed = bDef.baseSpeed + (bDef.speedLevel - 1) * 0.3;
      this.balls.forEach(ball => {
        if (ball.type === typeKey) {
          const angle = Math.atan2(ball.vy, ball.vx);
          ball.speed = newSpeed;
          ball.vx = Math.cos(angle) * newSpeed;
          ball.vy = Math.sin(angle) * newSpeed;
        }
      });

      if (window.soundEngine) window.soundEngine.playCoin();
      this.updateHUD();
      this.renderUpgradesMenu();
    }
  }

  upgradeBallPower(typeKey) {
    const cost = this.getPowerUpgradeCost(typeKey);
    if (this.money >= cost) {
      this.money -= cost;
      const bDef = this.ballTypes[typeKey];
      bDef.powerLevel++;

      const newPower = bDef.basePower + (bDef.powerLevel - 1) * (typeKey === 'basic' ? 1 : 2);
      this.balls.forEach(ball => {
        if (ball.type === typeKey) {
          ball.power = newPower;
        }
      });

      if (window.soundEngine) window.soundEngine.playCoin();
      this.updateHUD();
      this.renderUpgradesMenu();
    }
  }

  upgradeClick() {
    const cost = this.getClickUpgradeCost();
    if (this.money >= cost) {
      this.money -= cost;
      this.clickUpgradeLevel++;
      this.clickPower = this.clickUpgradeLevel;

      if (window.soundEngine) window.soundEngine.playCoin();
      this.updateHUD();
      this.renderUpgradesMenu();
    }
  }

  // --- Rebirth System ---
  getRequiredRebirthLevel() {
    // 1. rebirth: lvl 20 után, 2. rebirth: lvl 40 után, 3. rebirth: lvl 60 után, stb.
    return (this.rebirthCount + 1) * 20;
  }

  canRebirth() {
    return this.level >= this.getRequiredRebirthLevel();
  }

  executeRebirth() {
    if (!this.canRebirth()) return;

    this.rebirthCount++;
    this.rebirthMultiplier = Math.pow(1.5, this.rebirthCount); // 1.5x, 2.25x, 3.375x, 5.06x...
    this.bb += 1;

    // Reset run progress completely back to the start
    this.level = 1;
    this.money = 0;
    this.balls = [];
    this.activePowerUps = {};
    this.bonusOrb = null;
    this.shockwaveRings = [];

    // Reset ball counts & upgrades
    for (const key in this.ballTypes) {
      this.ballTypes[key].count = 0;
      this.ballTypes[key].speedLevel = 1;
      this.ballTypes[key].powerLevel = 1;
    }
    this.clickUpgradeLevel = 1;
    this.clickPower = 1;

    // Generate fresh level 1 blocks (1 HP)
    this.generateLevel(1);
    this.renderPowerUpsHUD();

    if (window.soundEngine) window.soundEngine.playPrestige();
    this.save();
    this.updateHUD();
  }

  // --- Floating Combat Texts ---
  addFloatingText(txt, x, y) {
    if (this.floatingTexts.length > 25) this.floatingTexts.shift();
    this.floatingTexts.push({
      text: txt,
      x: x + (Math.random() * 12 - 6),
      y,
      alpha: 1.0,
      vy: -1.2
    });
  }

  // --- Background Tab & Offline Progression Runner ---
  startBackgroundRunner() {
    // 1. Inline Web Worker (háttérfülön sem lassítja be a böngésző!)
    try {
      const workerCode = `
        setInterval(() => { postMessage('tick'); }, 250);
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.bgWorker = new Worker(workerUrl);
      this.bgWorker.onmessage = () => {
        if (document.hidden) {
          this.advanceByElapsedTime(true);
        }
      };
    } catch (e) {
      // file:// protokollon bizonyos böngészők tilthatják a Blob Workert; a setInterval fallback átveszi
      this.bgWorker = null;
    }

    // 2. Fallback & folyamatos háttér időzítő (háttérfülön ~1 mp-enként fut, valós idő alapján léptet!)
    this.bgInterval = setInterval(() => {
      if (document.hidden) {
        this.advanceByElapsedTime(true);
      }
    }, 500);

    // 3. Azonnali szinkronizálás fülváltáskor / visszatéréskor
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.save();
      } else {
        this.advanceByElapsedTime(true);
        this.renderPowerUpsHUD();
        this.updateHUD();
        this.render();
      }
    });

    // 4. Mentés bezáráskor / oldal elhagyásakor az offline haladáshoz
    window.addEventListener('beforeunload', () => this.save());
    window.addEventListener('pagehide', () => this.save());
  }

  // --- Core Simulation Step (Foreground & Background) ---
  stepSimulation(dt, isBackground = false) {
    // 1. Update Power-ups
    this.updatePowerUps(dt);

    // 2. Update Bonus Orb (csak akkor fogyjon / jelenjen meg, amikor látja a játékos)
    if (!isBackground) {
      this.updateBonusOrb(dt);
    }

    // 3. Update Balls
    this.updateBalls(dt);

    // 4. Update Bricks & Visual Effects
    if (!this.suppressAudioAndVisuals) {
      for (const b of this.bricks) {
        if (b.flash > 0) b.flash -= dt;
      }

      for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
        const ft = this.floatingTexts[i];
        ft.y += ft.vy;
        ft.alpha -= 1.8 * dt;
        if (ft.alpha <= 0) this.floatingTexts.splice(i, 1);
      }

      for (let i = this.shockwaveRings.length - 1; i >= 0; i--) {
        const ring = this.shockwaveRings[i];
        ring.radius += 200 * dt;
        ring.alpha = Math.max(0, 1 - (ring.radius / ring.maxRadius));
        if (ring.radius >= ring.maxRadius || ring.alpha <= 0) {
          this.shockwaveRings.splice(i, 1);
        }
      }
    }

    // 5. Autosave every 3s
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= 3.0) {
      this.autosaveTimer = 0;
      this.save();
    }
  }

  advanceByElapsedTime(isBackground = false) {
    const now = Date.now();
    const elapsedSec = (now - this.lastTickMs) / 1000;
    if (elapsedSec <= 0.001) return;
    this.lastTickMs = now;

    // Normál aktív 60 FPS képkocka
    if (!isBackground && elapsedSec <= 0.1) {
      this.stepSimulation(elapsedSec, false);
      return;
    }

    // Háttérfül vagy hosszabb visszatérés: valós fizikai léptetés fix 1/30 mp-es lépésekben
    const maxRealSimSec = 120; // legfeljebb 2 percnyi pontos fizika egy menetben
    const realSimSec = Math.min(elapsedSec, maxRealSimSec);
    const fixedDt = 1 / 30;

    this.suppressAudioAndVisuals = true;
    let remaining = realSimSec;
    while (remaining > 0.0001) {
      const step = Math.min(fixedDt, remaining);
      this.stepSimulation(step, true);
      remaining -= step;
    }
    this.suppressAudioAndVisuals = false;

    // Ha 2 percnél több idő telt el egyben (pl. gép alvó mód / fül altatás), gyors offline pótlás
    if (elapsedSec > maxRealSimSec && this.getTotalBalls() > 0) {
      this.applyOfflineProgress(elapsedSec - maxRealSimSec, false);
    }

    this.renderPowerUpsHUD();
    this.updateHUD();
  }

  // --- Offline Progress (amikor a játék/böngésző teljesen be volt zárva) ---
  applyOfflineProgress(seconds, showToast = true) {
    const cappedSec = Math.min(seconds, 86400); // max 24 óra offline számítás
    if (cappedSec < 5 || this.getTotalBalls() === 0) return;

    const startMoney = this.money;
    const startLevel = this.level;

    // 2 percig futtassuk le a valódi labdafizikát a maximális pontosságért
    if (cappedSec <= 120) {
      const fixedDt = 1 / 30;
      this.suppressAudioAndVisuals = true;
      let rem = cappedSec;
      while (rem > 0.0001) {
        const step = Math.min(fixedDt, rem);
        this.stepSimulation(step, true);
        rem -= step;
      }
      this.suppressAudioAndVisuals = false;
    } else {
      // Hosszabb offline időre számolt valósághű DPS és szintléptetés
      let totalDps = 0;
      for (const key in this.ballTypes) {
        const b = this.ballTypes[key];
        if (b.count <= 0) continue;
        const speed = b.baseSpeed + (b.speedLevel - 1) * 0.3;
        const power = b.basePower + (b.powerLevel - 1) * (key === 'basic' ? 1 : 2);
        let hitRate = speed * 0.42;
        if (key === 'sniper') hitRate = speed * 0.55;
        if (key === 'scatter') hitRate = speed * 0.65;
        totalDps += b.count * power * hitRate;
      }

      let remainingDamage = totalDps * cappedSec;
      let earned = 0;

      while (remainingDamage > 0) {
        const isBoss = this.level % 10 === 0;
        const levelTotalHp = isBoss ? (this.level * 40) : (this.level * 72);
        const dmgOnLevel = Math.min(remainingDamage, levelTotalHp);
        const rewardMult = isBoss ? (1 + this.level * 0.15) : 1;

        earned += dmgOnLevel * rewardMult * this.rebirthMultiplier;
        remainingDamage -= dmgOnLevel;

        if (dmgOnLevel >= levelTotalHp) {
          if (isBoss) {
            earned += Math.round(this.level * 120 * this.rebirthMultiplier);
          }
          this.level++;
        } else {
          break;
        }
      }

      this.money += earned;
      this.generateLevel(this.level);
    }

    this.updateHUD();
    this.save();

    if (showToast) {
      const gainedMoney = Math.floor(this.money - startMoney);
      const gainedLevels = this.level - startLevel;
      if (gainedMoney > 0 || gainedLevels > 0) {
        this.showOfflineToast(cappedSec, gainedMoney, gainedLevels);
      }
    }
  }

  formatDuration(sec) {
    const s = Math.floor(sec);
    if (s < 60) return `${s} mp`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} perc`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return remM > 0 ? `${h} óra ${remM} perc` : `${h} óra`;
  }

  showOfflineToast(seconds, gainedMoney, gainedLevels) {
    const toast = document.getElementById('offline-toast');
    if (!toast) return;

    const lvlText = gainedLevels > 0 ? ` | +${gainedLevels} szint` : '';
    toast.innerHTML = `⏱️ <strong>OFFLINE HALADÁS (${this.formatDuration(seconds)}):</strong> <span style="color:#2cd64e;">+$${gainedMoney.toLocaleString()}</span>${lvlText}`;
    toast.classList.add('show');

    clearTimeout(this.offlineToastTimer);
    this.offlineToastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 6500);
  }

  // --- Game Loop (60 FPS Foreground Render) ---
  gameLoop(timestamp) {
    this.lastTime = timestamp;

    // 1. Advance game simulation based on real wall-clock time
    this.advanceByElapsedTime(false);

    // 2. Render Canvas
    this.render();

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  // --- Ball Physics & Collision ---
  updateBalls(dt) {
    const borderWidth = 18;
    const arenaLeft = borderWidth;
    const arenaRight = this.width - borderWidth;
    const arenaTop = borderWidth;
    const arenaBottom = this.height - borderWidth;

    const speedMult = this.isPowerUpActive('speed_boost') ? 1.4 : 1.0;

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];

      // Ideiglenes áttörő szuperlabda élettartama (45 mp után eltűnik!)
      if (ball.isPiercing) {
        ball.timeLeft -= dt;
        if (ball.timeLeft <= 0) {
          this.balls.splice(i, 1);
          continue;
        }
      }

      const effectiveSpeed = ball.speed * speedMult;
      const steps = 2;
      const subDt = dt / steps;

      for (let s = 0; s < steps; s++) {
        if (ball.type === 'sniper') {
          this.applySniperHoming(ball, subDt);
        }

        if (Math.abs(ball.vx) < effectiveSpeed * 0.25) {
          ball.vx += (ball.vx >= 0 ? 0.3 : -0.3);
        }
        if (Math.abs(ball.vy) < effectiveSpeed * 0.25) {
          ball.vy += (ball.vy >= 0 ? 0.3 : -0.3);
        }

        ball.x += ball.vx * speedMult * subDt * 60;
        ball.y += ball.vy * speedMult * subDt * 60;

        // Perimeter wall collisions
        if (ball.x - ball.radius < arenaLeft) {
          ball.x = arenaLeft + ball.radius;
          ball.vx = Math.abs(ball.vx);
        } else if (ball.x + ball.radius > arenaRight) {
          ball.x = arenaRight - ball.radius;
          ball.vx = -Math.abs(ball.vx);
        }

        if (ball.y - ball.radius < arenaTop) {
          ball.y = arenaTop + ball.radius;
          ball.vy = Math.abs(ball.vy);
        } else if (ball.y + ball.radius > arenaBottom) {
          ball.y = arenaBottom - ball.radius;
          ball.vy = -Math.abs(ball.vy);
        }

        // Brick collisions
        for (const brick of this.bricks) {
          if (brick.hp <= 0) continue;

          const cx = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
          const cy = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
          const distX = ball.x - cx;
          const distY = ball.y - cy;

          if (distX * distX + distY * distY < ball.radius * ball.radius) {
            // CSAK az ideiglenes áttörő szuperlabda megy át a normál blokkokon!
            // Az összes többi labda rendesen lepattan.
            if (!ball.isPiercing || brick.isBoss) {
              const ovL = (ball.x + ball.radius) - brick.x;
              const ovR = (brick.x + brick.w) - (ball.x - ball.radius);
              const ovT = (ball.y + ball.radius) - brick.y;
              const ovB = (brick.y + brick.h) - (ball.y - ball.radius);

              const minOv = Math.min(ovL, ovR, ovT, ovB);
              if (minOv === ovL) {
                ball.x = brick.x - ball.radius;
                ball.vx = -Math.abs(ball.vx);
              } else if (minOv === ovR) {
                ball.x = brick.x + brick.w + ball.radius;
                ball.vx = Math.abs(ball.vx);
              } else if (minOv === ovT) {
                ball.y = brick.y - ball.radius;
                ball.vy = -Math.abs(ball.vy);
              } else {
                ball.y = brick.y + brick.h + ball.radius;
                ball.vy = Math.abs(ball.vy);
              }
            }

            if (ball.type === 'scatter') {
              this.triggerScatterExplosion(brick, ball.power);
            }

            this.damageBrick(brick, ball.power, ball.type);
            break;
          }
        }
      }
    }
  }

  applySniperHoming(ball, dt) {
    let target = null;
    let minDist = Infinity;

    for (const b of this.bricks) {
      if (b.hp <= 0) continue;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;
      const d = Math.hypot(bx - ball.x, by - ball.y);
      if (d < minDist) {
        minDist = d;
        target = { x: bx, y: by };
      }
    }

    if (target && minDist < 320) {
      const targetAngle = Math.atan2(target.y - ball.y, target.x - ball.x);
      const curAngle = Math.atan2(ball.vy, ball.vx);
      let diff = targetAngle - curAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      const turn = Math.max(-2.5 * dt, Math.min(2.5 * dt, diff));
      const newAngle = curAngle + turn;
      ball.vx = Math.cos(newAngle) * ball.speed;
      ball.vy = Math.sin(newAngle) * ball.speed;
    }
  }

  triggerScatterExplosion(originBrick, power) {
    const cx = originBrick.x + originBrick.w / 2;
    const cy = originBrick.y + originBrick.h / 2;
    const splashRadius = 75;

    for (const b of this.bricks) {
      if (b === originBrick || b.hp <= 0) continue;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;
      if (Math.hypot(bx - cx, by - cy) <= splashRadius) {
        this.damageBrick(b, Math.max(1, Math.round(power * 0.5)), 'scatter');
      }
    }
  }

  // --- Render (Authentic Retro Graphics + Boss + Bonus Orb + Shockwaves) ---
  render() {
    this.ctx.fillStyle = '#ede0c8';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Subtle Graph Grid Design
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.035)';
    this.ctx.lineWidth = 1;
    const gridStep = 24;
    for (let x = 0; x < this.width; x += gridStep) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.height; y += gridStep) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
    this.ctx.restore();

    // 1. Draw White Perimeter Bricks
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#000000';
    for (const pb of this.perimeterBricks) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(pb.x, pb.y, pb.w, pb.h);
      this.ctx.strokeRect(pb.x, pb.y, pb.w, pb.h);
    }

    // 2. Draw Shockwave Rings
    for (const ring of this.shockwaveRings) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = `rgba(59, 130, 246, ${ring.alpha.toFixed(2)})`;
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 3. Draw Bricks (Color by HP or Boss Appearance)
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (const b of this.bricks) {
      if (b.hp <= 0) continue;

      if (b.isBoss) {
        // Boss Block Design: Large warning border, crimson body, gold accents
        this.ctx.fillStyle = b.flash > 0 ? '#ffffff' : '#be123c';
        this.ctx.fillRect(b.x, b.y, b.w, b.h);

        this.ctx.lineWidth = 4;
        this.ctx.strokeStyle = '#000000';
        this.ctx.strokeRect(b.x, b.y, b.w, b.h);

        // Warning inner outline
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#facc15';
        this.ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);

        // Boss Title & HP
        this.ctx.fillStyle = '#fef08a';
        this.ctx.font = 'bold 24px "VT323", "Courier New", Courier, monospace';
        this.ctx.fillText(`👑 BOSS BLOKK [SZINT ${this.level}]`, b.x + b.w / 2, b.y + b.h * 0.35);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 36px "VT323", "Courier New", Courier, monospace';
        this.ctx.fillText(`HP: ${b.hp.toLocaleString()}`, b.x + b.w / 2, b.y + b.h * 0.65);
      } else {
        // Normal Brick: Color determined by HP (1=Kék, 2=Citromsárga, 3=Narancs, etc.)
        this.ctx.fillStyle = b.flash > 0 ? '#ffffff' : this.getBlockColor(b.hp);
        this.ctx.fillRect(b.x, b.y, b.w, b.h);

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#000000';
        this.ctx.strokeRect(b.x, b.y, b.w, b.h);

        // Centered HP number
        this.ctx.font = 'bold 16px "VT323", "Courier New", Courier, monospace';
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText(b.hp.toString(), b.x + b.w / 2, b.y + b.h / 2);
      }
    }

    // 4. Draw Balls
    for (const ball of this.balls) {
      if (ball.isPiercing) {
        // Különleges ideiglenes áttörő szuperlabda: elektromos cián gyűrű + fehér mag + arany szegély
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, ball.radius + 4, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)';
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fill();

        this.ctx.lineWidth = 2.5;
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.stroke();
        this.ctx.restore();
      } else {
        // Normál játékos labdák
        this.ctx.beginPath();
        this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = ball.color;
        this.ctx.fill();

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = '#000000';
        this.ctx.stroke();
      }
    }

    // 5. Draw Shrinking Bonus Orb (if active)
    if (this.bonusOrb) {
      const orb = this.bonusOrb;
      this.ctx.save();

      // Outer pulsating glow ring
      this.ctx.beginPath();
      this.ctx.arc(orb.x, orb.y, orb.radius + 4, 0, Math.PI * 2);
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([4, 4]);
      this.ctx.stroke();

      // Inner shrinking gold circle
      this.ctx.beginPath();
      this.ctx.arc(orb.x, orb.y, Math.max(2, orb.radius), 0, Math.PI * 2);
      this.ctx.fillStyle = '#facc15';
      this.ctx.fill();
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([]);
      this.ctx.strokeStyle = '#000000';
      this.ctx.stroke();

      // Dollar / Star icon in center
      if (orb.radius > 10) {
        this.ctx.font = 'bold 16px "VT323", "Courier New", Courier, monospace';
        this.ctx.fillStyle = '#000000';
        this.ctx.fillText('$', orb.x, orb.y);
      }

      this.ctx.restore();
    }

    // 6. Draw Floating Numbers
    for (const ft of this.floatingTexts) {
      this.ctx.save();
      this.ctx.globalAlpha = Math.max(0, ft.alpha);
      this.ctx.font = 'bold 18px "VT323", "Courier New", Courier, monospace';
      this.ctx.fillStyle = '#2cd64e';
      this.ctx.fillText(ft.text, ft.x, ft.y);
      this.ctx.restore();
    }
  }

  // --- HUD Updates ---
  updateHUD() {
    const moneyDisplay = document.getElementById('hud-money-text');
    if (moneyDisplay) moneyDisplay.textContent = Math.floor(this.money).toLocaleString();

    const bbDisplay = document.getElementById('hud-bb-text');
    if (bbDisplay) bbDisplay.textContent = this.bb.toString();

    const levelDisplay = document.getElementById('hud-level-text');
    if (levelDisplay) levelDisplay.textContent = this.level.toString();

    const ballCountDisplay = document.getElementById('hud-balls-text');
    if (ballCountDisplay) ballCountDisplay.textContent = `${this.getTotalBalls()}/50`;

    for (const key in this.ballTypes) {
      const b = this.ballTypes[key];
      const slot = document.getElementById(`ball-slot-${key}`);
      const priceText = document.getElementById(`ball-price-${key}`);
      if (slot && priceText) {
        const cost = this.getBallCost(key);
        priceText.textContent = `$${this.formatNumber(cost)}`;
        const canAfford = this.money >= cost && this.getTotalBalls() < 50;
        slot.classList.toggle('affordable', canAfford);
      }
    }

    const rebirthBtn = document.getElementById('btn-rebirth-trigger');
    if (rebirthBtn) {
      const reqLvl = this.getRequiredRebirthLevel();
      rebirthBtn.style.display = 'flex';
      if (this.canRebirth()) {
        rebirthBtn.classList.remove('locked');
        rebirthBtn.textContent = `REBIRTH (LVL ${reqLvl}+)`;
        rebirthBtn.title = `Elérted a(z) ${reqLvl}. szintet! Bármikor újjászülethetsz a bónuszokért!`;
      } else {
        rebirthBtn.classList.add('locked');
        rebirthBtn.textContent = `REBIRTH (LVL ${reqLvl})`;
        rebirthBtn.title = `Az újjászületés a(z) ${reqLvl}. szint után válik elérhetővé!`;
      }
    }

    // Böngésző fül címének frissítése (másik lapon is látható, hogy fut a játék!)
    document.title = `LVL ${this.level} | $${this.formatNumber(Math.floor(this.money))} - Idle Breakout`;
  }

  formatNumber(num) {
    if (num < 1000) return num.toString();
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    if (num < 1000000000) return (num / 1000000).toFixed(1) + 'M';
    return (num / 1000000000).toFixed(1) + 'B';
  }

  // --- Upgrades Menu Rendering ---
  renderUpgradesMenu() {
    const container = document.getElementById('upgrades-content-grid');
    if (!container) return;
    container.innerHTML = '';

    for (const key in this.ballTypes) {
      const b = this.ballTypes[key];
      if (b.count === 0) continue;

      const col = document.createElement('div');
      col.className = 'ball-upgrade-section';

      const spdCost = this.getSpeedUpgradeCost(key);
      const pwrCost = this.getPowerUpgradeCost(key);
      const canAffordSpeed = this.money >= spdCost;
      const canAffordPower = this.money >= pwrCost;

      col.innerHTML = `
        <div class="ball-title-label">
          <span style="font-size: 14px; color: #555;">(x${b.count})</span>
          <span>${b.name}</span>
          <div class="ball-dot" style="background: ${b.color}; margin-top: 4px;"></div>
        </div>

        <button class="ball-upgrade-btn ${canAffordSpeed ? 'affordable' : ''}" id="btn-upg-spd-${key}">
          <div class="btn-top-info">Speed ${b.speedLevel} >> ${b.speedLevel + 1}</div>
          <div class="btn-cost-bottom">$${this.formatNumber(spdCost)}</div>
        </button>

        <button class="ball-upgrade-btn ${canAffordPower ? 'affordable' : ''}" id="btn-upg-pwr-${key}">
          <div class="btn-top-info">Power ${b.powerLevel} >> ${b.powerLevel + 1}</div>
          <div class="btn-cost-bottom">$${this.formatNumber(pwrCost)}</div>
        </button>

        <button class="delete-ball-btn" id="btn-del-ball-${key}">DELETE x1</button>
      `;

      container.appendChild(col);

      col.querySelector(`#btn-upg-spd-${key}`).addEventListener('click', () => this.upgradeBallSpeed(key));
      col.querySelector(`#btn-upg-pwr-${key}`).addEventListener('click', () => this.upgradeBallPower(key));
      col.querySelector(`#btn-del-ball-${key}`).addEventListener('click', () => this.deleteBall(key));
    }

    const clickCost = this.getClickUpgradeCost();
    const canAffordClick = this.money >= clickCost;

    const clickCol = document.createElement('div');
    clickCol.className = 'ball-upgrade-section';
    clickCol.innerHTML = `
      <div class="ball-title-label">
        <span style="font-size: 14px; color: #555;">MANUAL</span>
        <span>CLICK POWER</span>
        <div style="font-size: 20px; margin-top: 4px;">👆</div>
      </div>

      <button class="ball-upgrade-btn ${canAffordClick ? 'affordable' : ''}" id="btn-upg-click">
        <div class="btn-top-info">Click X ${this.clickUpgradeLevel} >> ${this.clickUpgradeLevel + 1}</div>
        <div class="btn-cost-bottom">$${this.formatNumber(clickCost)}</div>
      </button>
    `;

    container.appendChild(clickCol);
    clickCol.querySelector('#btn-upg-click').addEventListener('click', () => this.upgradeClick());
  }

  // --- Bind All Events ---
  bindEvents() {
    const handleCanvasClick = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      // 1. Check if clicking on the shrinking bonus orb
      if (this.clickBonusOrb(clickX, clickY)) {
        return;
      }

      // 2. Check bricks click
      for (let i = this.bricks.length - 1; i >= 0; i--) {
        const b = this.bricks[i];
        if (b.hp <= 0) continue;

        if (
          clickX >= b.x &&
          clickX <= b.x + b.w &&
          clickY >= b.y &&
          clickY <= b.y + b.h
        ) {
          // Chance of Lucky Strike (5% base + 1% per rebirth!)
          let dmg = this.clickPower;
          const luckyChance = 0.05 + (this.rebirthCount * 0.01);
          if (Math.random() < luckyChance) {
            dmg *= 5;
            this.addFloatingText('💥 LUCKY STRIKE!', clickX, clickY - 15);
          }

          this.damageBrick(b, dmg, 'click');
          break;
        }
      }
    };

    this.canvas.addEventListener('mousedown', (e) => handleCanvasClick(e.clientX, e.clientY));
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches[0]) {
        handleCanvasClick(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    // Ball Buy Slots
    for (const key in this.ballTypes) {
      const slot = document.getElementById(`ball-slot-${key}`);
      if (slot) {
        slot.addEventListener('click', () => this.buyBall(key));
      }
    }

    // Upgrades Modal
    const upgradesBtn = document.getElementById('btn-open-upgrades');
    const upgradesModal = document.getElementById('upgrades-modal');
    const closeUpgradesBtn = document.getElementById('btn-close-upgrades');

    if (upgradesBtn && upgradesModal) {
      upgradesBtn.addEventListener('click', () => {
        this.renderUpgradesMenu();
        upgradesModal.classList.add('open');
        if (window.soundEngine) window.soundEngine.playClickHit();
      });
    }

    if (closeUpgradesBtn && upgradesModal) {
      closeUpgradesBtn.addEventListener('click', () => {
        upgradesModal.classList.remove('open');
        if (window.soundEngine) window.soundEngine.playClickHit();
      });
    }

    // Rebirth Modal
    const rebirthTrigger = document.getElementById('btn-rebirth-trigger');
    const rebirthModal = document.getElementById('rebirth-modal');
    const confirmRebirthBtn = document.getElementById('btn-confirm-rebirth');
    const cancelRebirthBtn = document.getElementById('btn-cancel-rebirth');

    if (rebirthTrigger && rebirthModal) {
      rebirthTrigger.addEventListener('click', () => {
        const reqLvl = this.getRequiredRebirthLevel();
        if (!this.canRebirth()) {
          alert(`Az újjászületéshez el kell érned legalább a(z) ${reqLvl}. szintet!\nJelenlegi szinted: ${this.level}\n(1. rebirth: lvl 20, 2. rebirth: lvl 40, 3. rebirth: lvl 60...)`);
          return;
        }

        document.getElementById('rebirth-current-lvl').textContent = this.level;
        document.getElementById('rebirth-required-lvl').textContent = reqLvl;
        document.getElementById('rebirth-current-mult').textContent = this.rebirthMultiplier.toFixed(2) + 'x';
        document.getElementById('rebirth-next-mult').textContent = (this.rebirthMultiplier * 1.5).toFixed(2) + 'x';

        const curChance = (0.31 + this.rebirthCount * 0.03).toFixed(2);
        const nextChance = (0.31 + (this.rebirthCount + 1) * 0.03).toFixed(2);
        document.getElementById('rebirth-chance-info').textContent = `${curChance}% ➔ ${nextChance}%`;
        document.getElementById('rebirth-crit-info').textContent = `${5 + this.rebirthCount}% ➔ ${5 + this.rebirthCount + 1}%`;

        rebirthModal.classList.add('open');
      });
    }

    if (confirmRebirthBtn && rebirthModal) {
      confirmRebirthBtn.addEventListener('click', () => {
        rebirthModal.classList.remove('open');
        this.executeRebirth();
      });
    }

    if (cancelRebirthBtn && rebirthModal) {
      cancelRebirthBtn.addEventListener('click', () => {
        rebirthModal.classList.remove('open');
      });
    }

    // Sound Toggle
    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const isEnabled = window.soundEngine ? window.soundEngine.toggleMute() : true;
        soundBtn.classList.toggle('muted', !isEnabled);
        soundBtn.textContent = isEnabled ? '🔊' : '🔇';
      });
    }

    // Settings / Reset
    const settingsBtn = document.getElementById('btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        if (confirm('Biztosan újraindítod a játékot elölről (Hard Reset)?')) {
          this.isResetting = true;
          if (this.bgWorker) this.bgWorker.terminate();
          if (this.bgInterval) clearInterval(this.bgInterval);
          localStorage.removeItem(this.SAVE_KEY);
          window.location.reload();
        }
      });
    }
  }

  // --- Save & Load ---
  save() {
    if (this.isResetting) return;
    const data = {
      money: this.money,
      level: this.level,
      bb: this.bb,
      rebirthCount: this.rebirthCount,
      clickUpgradeLevel: this.clickUpgradeLevel,
      lastSavedAt: Date.now(),
      balls: {}
    };

    for (const key in this.ballTypes) {
      data.balls[key] = {
        count: this.ballTypes[key].count,
        speedLevel: this.ballTypes[key].speedLevel,
        powerLevel: this.ballTypes[key].powerLevel
      };
    }

    try {
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Save failed:', e);
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      this.money = data.money ?? 0;
      this.level = data.level ?? 1;
      this.bb = data.bb ?? 0;
      this.rebirthCount = data.rebirthCount ?? 0;
      this.rebirthMultiplier = Math.pow(1.5, this.rebirthCount);
      this.clickUpgradeLevel = data.clickUpgradeLevel ?? 1;
      this.clickPower = this.clickUpgradeLevel;

      if (data.lastSavedAt) {
        const elapsedSec = (Date.now() - data.lastSavedAt) / 1000;
        if (elapsedSec >= 5) {
          this.pendingOfflineSeconds = elapsedSec;
        }
      }

      if (data.balls) {
        for (const key in data.balls) {
          if (this.ballTypes[key]) {
            this.ballTypes[key].count = data.balls[key].count ?? 0;
            this.ballTypes[key].speedLevel = data.balls[key].speedLevel ?? 1;
            this.ballTypes[key].powerLevel = data.balls[key].powerLevel ?? 1;

            for (let i = 0; i < this.ballTypes[key].count; i++) {
              this.spawnBall(key);
            }
          }
        }
      }
    } catch (e) {
      console.error('Load failed:', e);
    }
  }
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.game = new IdleBreakoutGame();
  window.game.init();
});

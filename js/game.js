/* SOUL LINK — THE SEAM. An original little pixel prologue drawn on a 480×320 canvas. */
(function () {
  'use strict';

  const W = 480;
  const H = 320;
  const ROOM = { x: 28, y: 52, w: 424, h: 238 };
  const GATE = { x: 210, y: 46, w: 60, h: 38 };
  const SAVE_POS = { x: 420, y: 86 };
  const PIP_POS = { x: 112, y: 152 };

  const DIRS = {
    up: { x: 0, y: -1, face: 'up' },
    down: { x: 0, y: 1, face: 'down' },
    left: { x: -1, y: 0, face: 'left' },
    right: { x: 1, y: 0, face: 'right' }
  };

  const DECOR = {
    crystals: [
      { x: 48, y: 84, s: 4, c: 1 }, { x: 72, y: 68, s: 3, c: 2 },
      { x: 406, y: 68, s: 5, c: 1 }, { x: 430, y: 102, s: 3, c: 2 },
      { x: 394, y: 276, s: 3, c: 1 }, { x: 64, y: 276, s: 4, c: 2 }
    ],
    grass: [
      { x: 86, y: 262 }, { x: 196, y: 92 }, { x: 302, y: 278 },
      { x: 374, y: 198 }, { x: 158, y: 222 }, { x: 252, y: 246 },
      { x: 408, y: 144 }, { x: 130, y: 96 }
    ],
    roots: [42, 96, 144, 356, 408, 438]
  };

  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function rnd(min, max) { return min + Math.random() * (max - min); }
  function t(key, vars) { return SL.i18n.t(key, vars); }

  class SeamGame {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.raf = null;
      this.running = false;
      this.paused = false;
      this.loaded = false;
      this.keys = { up: false, down: false, left: false, right: false };
      this.last = 0;
      this.dialogTimer = null;
      this.toastTimer = null;
      this.loadRaf = null;
      this.time = 0;
      this.state = this.freshState();
      this.lastHud = {};
      this.assetsReady = true;
      this.boundLoop = this.loop.bind(this);
    }

    freshState() {
      return {
        mode: 'idle',
        player: {
          x: 240, y: 252, dir: 'down', hp: 20, maxHp: 20,
          speed: 78, invuln: 0, walk: 0, moving: false, blink: 0
        },
        petals: [
          { x: 370, y: 106, taken: false, phase: 0.4 },
          { x: 330, y: 246, taken: false, phase: 2.1 },
          { x: 80, y: 238, taken: false, phase: 4.2 }
        ],
        hazards: [
          { x: 188, y: 112, axis: 'x', min: 160, max: 300, phase: 0.4, speed: 0.55, dir: 1 },
          { x: 282, y: 190, axis: 'y', min: 126, max: 252, phase: 1.8, speed: 0.42, dir: -1 },
          { x: 140, y: 208, axis: 'x', min: 104, max: 170, phase: 3.4, speed: 0.7, dir: 1 }
        ],
        collected: 0,
        gateOpen: false,
        battleDone: false,
        dialogue: null,
        battle: null,
        stats: { hits: 0, elapsed: 0 },
        shake: 0,
        dust: [],
        saveCooldown: 0,
        ambient: 0,
        prompt: '',
        promptKind: ''
      };
    }

    mount(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.ctx.imageSmoothingEnabled = false;
      this.seedDust();
    }

    seedDust() {
      const dust = [];
      for (let i = 0; i < 44; i++) {
        dust.push({
          x: rnd(0, W), y: rnd(0, H), s: Math.random() < 0.7 ? 1 : 2,
          vy: rnd(-4, -12), vx: rnd(-2, 2), a: rnd(0.12, 0.42),
          gold: Math.random() < 0.28, phase: rnd(0, Math.PI * 2)
        });
      }
      this.state.dust = dust;
    }

    start(opts) {
      if (!this.ctx) return;
      const options = opts || {};
      this.stopTimers();
      this.state = this.freshState();
      this.seedDust();
      this.paused = false;
      this.running = true;
      this.loaded = false;
      this.keys = { up: false, down: false, left: false, right: false };
      this.hideOverlays();
      this.hideDialog();
      this.setPrompt('');
      this.showLoading(true);
      this.runLoader(function () {
        this.loaded = true;
        this.showLoading(false);
        this.state.mode = 'explore';
        this.refreshHud(true);
        if (options.skipIntro) {
          this.afterIntro();
        } else {
          const self = this;
          window.setTimeout(function () {
            if (!self.running) return;
            self.startDialogue(SL.data.DIALOGUES[SL.i18n.lang].intro, function () { self.afterIntro(); });
          }, 260);
        }
      }.bind(this));
      if (!this.raf) {
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.boundLoop);
      }
    }

    afterIntro() {
      this.state.mode = 'explore';
      this.setStatus(t('game.statusExplore'));
      this.setObjective(t('game.objectivePetal'));
      this.refreshHud(true);
    }

    runLoader(done) {
      const reduce = SL.store.settings.reduceMotion;
      const duration = reduce ? 220 : 1280;
      const start = performance.now();
      const fill = document.getElementById('loading-fill');
      const log = document.getElementById('loading-log');
      const stages = ['DETERMINATION', 'ROOTS', 'ECHO', 'SOUL'];
      const self = this;
      if (this.loadRaf) cancelAnimationFrame(this.loadRaf);
      function tick(now) {
        const p = clamp((now - start) / duration, 0, 1);
        if (fill) fill.style.width = Math.round(p * 100) + '%';
        if (log) log.textContent = stages[Math.min(stages.length - 1, Math.floor(p * stages.length))];
        if (p < 1 && self.running) {
          self.loadRaf = requestAnimationFrame(tick);
        } else if (self.running) {
          self.loadRaf = null;
          done();
        }
      }
      if (fill) fill.style.width = '0%';
      this.loadRaf = requestAnimationFrame(tick);
    }

    showLoading(show) {
      const el = document.getElementById('game-loading');
      if (!el) return;
      if (show) el.classList.remove('is-done');
      else el.classList.add('is-done');
    }

    stopTimers() {
      if (this.dialogTimer) { clearTimeout(this.dialogTimer); this.dialogTimer = null; }
      if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
      if (this.loadRaf) { cancelAnimationFrame(this.loadRaf); this.loadRaf = null; }
    }

    stop() {
      this.running = false;
      this.paused = false;
      this.stopTimers();
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
      this.hideDialog();
      this.setPrompt('');
      this.hideOverlays();
      this.showLoading(false);
    }

    pause() {
      if (!this.running || this.state.mode === 'dead' || this.state.mode === 'complete') return;
      this.paused = true;
      this.setPrompt('');
      this.refreshPause();
      const el = document.getElementById('pause-overlay');
      if (el) el.hidden = false;
    }

    resume() {
      this.paused = false;
      const el = document.getElementById('pause-overlay');
      if (el) el.hidden = true;
      this.last = performance.now();
    }

    isPaused() { return this.paused; }
    isRunning() { return this.running; }
    mode() { return this.state.mode; }

    setDirection(dir, pressed) {
      if (!DIRS[dir]) return;
      this.keys[dir] = !!pressed;
      if (pressed && this.state.mode === 'explore') {
        this.state.player.dir = dir;
      }
    }

    clearKeys() {
      this.keys = { up: false, down: false, left: false, right: false };
    }

    action() {
      if (!this.running || this.paused) return;
      const s = this.state;
      if (s.mode === 'dialogue') { this.advanceDialogue(); return; }
      if (s.mode === 'explore') {
        const near = this.nearbyInteractable();
        if (!near) return;
        if (near.kind === 'pip') this.talkToPip();
        else if (near.kind === 'save') this.touchSave();
        else if (near.kind === 'gate') this.touchGate();
        return;
      }
      if (s.mode === 'battle') {
        this.showGameToast(t('game.battleTitle'), 500);
      }
    }

    cancel() {
      if (!this.running) return;
      if (this.state.mode === 'dialogue') {
        if (this.dialogTyping) this.completeDialogueLine();
        else this.advanceDialogue();
        return;
      }
      if (this.paused) { this.resume(); return; }
      if (this.state.mode === 'explore' || this.state.mode === 'battle') {
        this.pause();
        if (SL.audio) SL.audio.sfx('back');
      }
    }

    nearbyInteractable() {
      const p = this.state.player;
      if (!this.state.battleDone && dist2(p.x, p.y, PIP_POS.x, PIP_POS.y) < 42 * 42) return { kind: 'pip' };
      if (this.state.gateOpen && Math.abs(p.x - 240) < 46 && p.y < 100) return { kind: 'gate' };
      if (dist2(p.x, p.y, SAVE_POS.x, SAVE_POS.y) < 34 * 34) return { kind: 'save' };
      if (Math.abs(p.x - 240) < 44 && p.y < 108) return { kind: 'gate' };
      return null;
    }

    talkToPip() {
      const s = this.state;
      const lang = SL.i18n.lang;
      if (s.collected < 3) {
        this.startDialogue(SL.data.DIALOGUES[lang].pipHint);
        if (SL.audio) SL.audio.sfx('confirm');
      } else if (!s.battleDone) {
        const self = this;
        this.startDialogue(SL.data.DIALOGUES[lang].pipDone, function () {
          self.startBattle();
        });
        if (SL.audio) SL.audio.sfx('confirm');
      } else {
        this.startDialogue([{ name: 'PIP', text: SL.i18n.lang === 'ru' ? 'Врата открыты. Я буду здесь, если решишь вернуться.' : 'The gate is open. I will be here if you decide to come back.' }]);
      }
    }

    touchSave() {
      const s = this.state;
      if (s.saveCooldown > 0) {
        this.startDialogue(SL.data.DIALOGUES[SL.i18n.lang].fullHp);
        return;
      }
      if (s.player.hp >= s.player.maxHp) {
        this.startDialogue(SL.data.DIALOGUES[SL.i18n.lang].fullHp);
        s.saveCooldown = 1.5;
        return;
      }
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 6);
      s.saveCooldown = 2.4;
      if (SL.audio) SL.audio.sfx('heal');
      this.startDialogue(SL.data.DIALOGUES[SL.i18n.lang].saved);
      this.showToast(t('game.saved'), 1200);
      this.refreshHud(true);
    }

    touchGate() {
      if (this.state.gateOpen) {
        this.complete();
      } else {
        this.startDialogue(SL.data.DIALOGUES[SL.i18n.lang].gateLocked);
      }
    }

    startDialogue(lines, onEnd) {
      if (!lines || !lines.length) { if (onEnd) onEnd(); return; }
      const s = this.state;
      s.mode = 'dialogue';
      s.dialogue = { lines: lines.slice(), index: 0, onEnd: onEnd || null };
      this.setPrompt('');
      this.showDialogLine();
    }

    showDialogLine() {
      const s = this.state;
      if (!s.dialogue) return;
      const line = s.dialogue.lines[s.dialogue.index];
      const box = document.getElementById('dialog-box');
      const nameEl = document.getElementById('dialog-name');
      const textEl = document.getElementById('dialog-text');
      if (!box || !textEl) return;
      if (nameEl) nameEl.textContent = line.name || '...';
      box.hidden = false;
      this.dialogFull = line.text;
      this.dialogShown = 0;
      this.dialogTyping = true;
      textEl.textContent = '';
      const self = this;
      const chars = Array.from(line.text);
      if (this.dialogTimer) clearTimeout(this.dialogTimer);
      const step = function () {
        if (!self.running || !self.state.dialogue) return;
        self.dialogShown += 1;
        textEl.textContent = chars.slice(0, self.dialogShown).join('');
        if (self.dialogShown >= chars.length) {
          self.dialogTyping = false;
          self.dialogTimer = null;
          if (SL.audio) SL.audio.sfx('move');
          return;
        }
        self.dialogTimer = setTimeout(step, 17);
      };
      step();
    }

    completeDialogueLine() {
      if (this.dialogTimer) { clearTimeout(this.dialogTimer); this.dialogTimer = null; }
      const textEl = document.getElementById('dialog-text');
      if (textEl) textEl.textContent = this.dialogFull || '';
      this.dialogTyping = false;
    }

    advanceDialogue() {
      const s = this.state;
      if (!s.dialogue) return;
      if (this.dialogTyping) { this.completeDialogueLine(); return; }
      if (SL.audio) SL.audio.sfx('move');
      s.dialogue.index += 1;
      if (s.dialogue.index >= s.dialogue.lines.length) {
        const onEnd = s.dialogue.onEnd;
        s.dialogue = null;
        this.hideDialog();
        if (onEnd) onEnd();
        else s.mode = 'explore';
        return;
      }
      this.showDialogLine();
    }

    hideDialog() {
      if (this.dialogTimer) { clearTimeout(this.dialogTimer); this.dialogTimer = null; }
      this.dialogTyping = false;
      const box = document.getElementById('dialog-box');
      if (box) box.hidden = true;
    }

    startBattle() {
      const s = this.state;
      s.mode = 'battle';
      s.battle = {
        duration: 15,
        left: 15,
        elapsed: 0,
        spawn: 0,
        bullets: [],
        box: { x: 138, y: 152, w: 204, h: 116 },
        soul: { x: 240, y: 210, r: 3 }
      };
      s.player.invuln = 0.8;
      this.setStatus(t('game.statusBattle'));
      this.setObjective(t('game.objectiveBattle'));
      this.setPrompt('');
      const banner = document.getElementById('battle-banner');
      if (banner) banner.hidden = false;
      this.refreshBattleHud();
      this.showToast(t('game.battleStart'), 1800);
      if (SL.audio) SL.audio.sfx('battle');
    }

    endBattle() {
      const s = this.state;
      s.battle = null;
      s.battleDone = true;
      s.gateOpen = true;
      s.mode = 'explore';
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 4);
      const banner = document.getElementById('battle-banner');
      if (banner) banner.hidden = true;
      this.setStatus(t('game.statusGate'));
      this.setObjective(t('game.objectiveGate'));
      if (SL.audio) SL.audio.sfx('gate');
      const self = this;
      this.startDialogue(SL.data.DIALOGUES[SL.i18n.lang].battleSurvived, function () {
        self.state.mode = 'explore';
      });
      this.refreshHud(true);
    }

    complete() {
      const s = this.state;
      if (s.mode === 'complete') return;
      s.mode = 'complete';
      this.setPrompt('');
      this.setStatus(t('game.statusComplete'));
      this.setObjective('');
      if (SL.audio) SL.audio.sfx('gate');
      this.refreshHud(true);
      const overlay = document.getElementById('complete-overlay');
      if (overlay) overlay.hidden = false;
      const timeEl = document.getElementById('complete-time');
      const hitsEl = document.getElementById('complete-hits');
      const modEl = document.getElementById('complete-mod');
      if (timeEl) timeEl.textContent = this.formatTime(s.stats.elapsed);
      if (hitsEl) hitsEl.textContent = String(s.stats.hits);
      if (modEl) modEl.textContent = SL.store.themeName();
      this.showToast(t('game.completedToast'), 2200);
    }

    die() {
      const s = this.state;
      s.mode = 'dead';
      this.setPrompt('');
      this.clearKeys();
      this.setStatus(t('game.deathToast'));
      const banner = document.getElementById('battle-banner');
      if (banner) banner.hidden = true;
      if (SL.audio) SL.audio.sfx('hurt');
      const overlay = document.getElementById('death-overlay');
      if (overlay) overlay.hidden = false;
      this.showToast(t('game.deathToast'), 1400);
    }

    retry() {
      const overlay = document.getElementById('death-overlay');
      if (overlay) overlay.hidden = true;
      this.start({ skipIntro: true });
    }

    hideOverlays() {
      ['pause-overlay', 'complete-overlay', 'death-overlay'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.hidden = true;
      });
      const banner = document.getElementById('battle-banner');
      if (banner) banner.hidden = true;
    }

    refreshPause() {
      const s = this.state;
      const petals = document.getElementById('pause-petals');
      const hp = document.getElementById('pause-hp');
      const time = document.getElementById('pause-time');
      if (petals) petals.textContent = String(s.collected);
      if (hp) hp.textContent = String(s.player.hp);
      if (time) time.textContent = this.formatTime(s.stats.elapsed);
    }

    loop(now) {
      this.raf = requestAnimationFrame(this.boundLoop);
      const dt = Math.min(0.04, Math.max(0, (now - this.last) / 1000 || 0));
      this.last = now;
      if (!this.running) return;
      if (!this.paused) this.update(dt);
      this.draw(now / 1000);
    }

    update(dt) {
      const s = this.state;
      this.time += dt;
      const p = s.player;
      if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
      if (s.saveCooldown > 0) s.saveCooldown = Math.max(0, s.saveCooldown - dt);
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 7);

      // dust always drifts
      s.dust.forEach(function (d) {
        d.y += d.vy * dt;
        d.x += d.vx * dt;
        if (d.y < -4) { d.y = H + 4; d.x = rnd(0, W); }
        if (d.x < -4) d.x = W + 4;
        if (d.x > W + 4) d.x = -4;
      });

      if (s.mode === 'explore' || s.mode === 'battle') s.stats.elapsed += dt;
      if (s.mode === 'dead' || s.mode === 'complete' || s.mode === 'dialogue') {
        this.updatePrompt();
        this.refreshHud();
        return;
      }

      if (s.mode === 'explore') {
        this.updateExplore(dt);
        this.updatePrompt();
      } else if (s.mode === 'battle') {
        this.updateBattle(dt);
      }
      this.refreshHud();
    }

    updateExplore(dt) {
      const s = this.state;
      const p = s.player;
      let dx = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      let dy = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
      p.moving = !!(dx || dy);
      if (p.moving) {
        const len = Math.hypot(dx, dy) || 1;
        dx /= len; dy /= len;
        p.x += dx * p.speed * dt;
        p.y += dy * p.speed * dt;
        p.walk += dt;
        if (Math.abs(dx) > Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left';
        else p.dir = dy > 0 ? 'down' : 'up';
        if (Math.random() < dt * 4 && SL.audio) SL.audio.sfx('move');
      } else {
        p.walk += dt * 0.2;
      }
      const minX = ROOM.x + 12, maxX = ROOM.x + ROOM.w - 12;
      let minY = ROOM.y + 14;
      const maxY = ROOM.y + ROOM.h - 12;
      if (s.gateOpen && p.x > GATE.x + 10 && p.x < GATE.x + GATE.w - 10) minY = 70;
      p.x = clamp(p.x, minX, maxX);
      p.y = clamp(p.y, minY, maxY);
      if (s.gateOpen && p.y < 72 && p.x > GATE.x - 10 && p.x < GATE.x + GATE.w + 10) {
        this.complete();
        return;
      }

      // hazards move
      s.hazards.forEach(function (h) {
        const t = s.stats.elapsed * h.speed + h.phase;
        if (h.axis === 'x') h.x = (h.min + h.max) / 2 + Math.sin(t) * (h.max - h.min) / 2;
        else h.y = (h.min + h.max) / 2 + Math.sin(t) * (h.max - h.min) / 2;
      });

      // petal pickups
      for (let i = 0; i < s.petals.length; i++) {
        const petal = s.petals[i];
        if (petal.taken) continue;
        if (dist2(p.x, p.y, petal.x, petal.y) < 19 * 19) {
          petal.taken = true;
          s.collected += 1;
          s.stats.score = s.collected;
          if (SL.audio) SL.audio.sfx('pickup');
          this.showToast(t('game.pickupToast', { n: s.collected }), 1100);
          if (s.collected >= 3) {
            this.setStatus(t('game.statusReturn'));
            this.setObjective(t('game.objectiveReturn'));
          } else {
            this.setStatus(t('game.statusPetal'));
            this.setObjective(t('game.objectivePetal'));
          }
          this.refreshHud(true);
        }
      }

      // hazard collision
      if (p.invuln <= 0) {
        for (let i = 0; i < s.hazards.length; i++) {
          const h = s.hazards[i];
          if (dist2(p.x, p.y, h.x, h.y) < 17 * 17) {
            p.hp = Math.max(0, p.hp - 2);
            p.invuln = 1.15;
            s.stats.hits += 1;
            s.shake = 1;
            if (SL.audio) SL.audio.sfx('hurt');
            this.showToast(t('game.hurtToast'), 450);
            this.refreshHud(true);
            if (p.hp <= 0) { this.die(); return; }
            break;
          }
        }
      }

      // if all petals and battle not done, maybe pip prompt
      if (s.collected >= 3 && !s.battleDone) {
        this.setObjective(t('game.objectiveReturn'));
      }
    }

    updateBattle(dt) {
      const s = this.state;
      const b = s.battle;
      if (!b) return;
      const p = s.player;
      b.elapsed += dt;
      b.left = Math.max(0, b.duration - b.elapsed);
      let dx = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
      let dy = (this.keys.down ? 1 : 0) - (this.keys.up ? 1 : 0);
      if (dx || dy) {
        const len = Math.hypot(dx, dy) || 1;
        b.soul.x = clamp(b.soul.x + (dx / len) * 92 * dt, b.box.x + 7, b.box.x + b.box.w - 7);
        b.soul.y = clamp(b.soul.y + (dy / len) * 92 * dt, b.box.y + 7, b.box.y + b.box.h - 7);
      }
      b.spawn -= dt;
      const stage = b.elapsed < 5 ? 0 : b.elapsed < 10 ? 1 : 2;
      const interval = stage === 0 ? 0.58 : stage === 1 ? 0.44 : 0.34;
      if (b.spawn <= 0) {
        b.spawn = interval;
        if (stage === 0) {
          b.bullets.push({
            x: rnd(b.box.x + 10, b.box.x + b.box.w - 10), y: b.box.y + 2,
            vx: rnd(-8, 8), vy: rnd(52, 76), r: 3, kind: 'shard', spin: rnd(0, 6)
          });
        } else if (stage === 1) {
          const fromLeft = Math.random() < 0.5;
          b.bullets.push({
            x: fromLeft ? b.box.x + 2 : b.box.x + b.box.w - 2,
            y: rnd(b.box.y + 10, b.box.y + b.box.h - 10),
            vx: (fromLeft ? 1 : -1) * rnd(58, 82), vy: rnd(-6, 6),
            r: 3, kind: 'shard', spin: rnd(0, 6)
          });
        } else {
          const fromLeft = Math.random() < 0.5;
          if (Math.random() < 0.55) {
            b.bullets.push({
              x: rnd(b.box.x + 10, b.box.x + b.box.w - 10), y: b.box.y + b.box.h - 2,
              vx: rnd(-10, 10), vy: -rnd(62, 90), r: 3, kind: 'shard', spin: rnd(0, 6)
            });
          } else {
            b.bullets.push({
              x: fromLeft ? b.box.x + 2 : b.box.x + b.box.w - 2,
              y: rnd(b.box.y + 10, b.box.y + b.box.h - 10),
              vx: (fromLeft ? 1 : -1) * rnd(70, 92), vy: rnd(-12, 12),
              r: 3, kind: 'shard', spin: rnd(0, 6)
            });
          }
        }
        if (b.elapsed > 10 && Math.random() < 0.35) {
          b.bullets.push({
            x: rnd(b.box.x + 20, b.box.x + b.box.w - 20), y: b.box.y + 3,
            vx: 0, vy: rnd(70, 95), r: 2, kind: 'orb', spin: 0
          });
        }
      }
      for (let i = b.bullets.length - 1; i >= 0; i--) {
        const bullet = b.bullets[i];
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        if (bullet.x < b.box.x - 20 || bullet.x > b.box.x + b.box.w + 20 ||
            bullet.y < b.box.y - 20 || bullet.y > b.box.y + b.box.h + 20) {
          b.bullets.splice(i, 1);
          continue;
        }
        if (p.invuln <= 0 && dist2(b.soul.x, b.soul.y, bullet.x, bullet.y) < (bullet.r + 4) * (bullet.r + 4)) {
          p.hp = Math.max(0, p.hp - 2);
          p.invuln = 1.05;
          s.stats.hits += 1;
          s.shake = 1;
          b.bullets.splice(i, 1);
          if (SL.audio) SL.audio.sfx('hurt');
          this.refreshHud(true);
          if (p.hp <= 0) { this.die(); return; }
        }
      }
      this.refreshBattleHud();
      if (b.elapsed >= b.duration) {
        const banner = document.getElementById('battle-banner');
        if (banner) banner.hidden = true;
        this.endBattle();
      }
    }

    updatePrompt() {
      const s = this.state;
      if (s.mode !== 'explore') { this.setPrompt(''); return; }
      const near = this.nearbyInteractable();
      if (near) {
        if (near.kind === 'pip') this.setPrompt(t('game.hintTalk'));
        else if (near.kind === 'save') this.setPrompt(t('game.hintSave'));
        else if (near.kind === 'gate') this.setPrompt(t('game.hintGate'));
      } else {
        this.setPrompt('');
      }
    }

    setPrompt(text) {
      const value = text || '';
      this.state.prompt = value;
      const el = document.getElementById('game-prompt');
      const label = document.getElementById('game-prompt-text');
      if (!el || !label) return;
      if (value) {
        label.textContent = value;
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    }

    showToast(text, duration) {
      if (!text) return;
      const el = document.getElementById('game-toast');
      if (!el) return;
      el.textContent = text;
      el.hidden = false;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      const self = this;
      this.toastTimer = setTimeout(function () {
        el.hidden = true;
        self.toastTimer = null;
      }, duration || 1000);
    }

    showGameToast(text, duration) { this.showToast(text, duration); }

    setStatus(text) {
      const el = document.getElementById('game-status');
      if (el) el.textContent = text;
    }

    setObjective(text) {
      const el = document.getElementById('game-objective');
      if (el) el.textContent = text;
    }

    refreshHud(force) {
      const s = this.state;
      const p = s.player;
      const petals = document.getElementById('hud-petals');
      const hp = document.getElementById('hud-hp');
      const fill = document.getElementById('hud-hp-fill');
      if (petals) petals.textContent = String(s.collected);
      if (hp) hp.textContent = String(p.hp);
      if (fill) fill.style.width = Math.max(0, (p.hp / p.maxHp) * 100) + '%';
      if (force) {
        const mod = document.getElementById('hud-mod');
        const chip = document.getElementById('game-mod-chip');
        const name = SL.store.themeName();
        if (mod) mod.textContent = name === 'VANILLA' ? 'VANILLA' : name;
        if (chip) chip.textContent = name === 'VANILLA' ? 'VANILLA' : name;
      }
      this.lastHud = { petals: s.collected, hp: p.hp, mode: s.mode };
    }

    refreshBattleHud() {
      const s = this.state;
      if (!s.battle) return;
      const fill = document.getElementById('battle-timer-fill');
      const timer = document.getElementById('battle-timer');
      const pct = Math.max(0, s.battle.left / s.battle.duration);
      if (fill) fill.style.width = (pct * 100) + '%';
      if (timer) timer.textContent = s.battle.left.toFixed(1);
    }

    formatTime(seconds) {
      const total = Math.max(0, Math.floor(seconds || 0));
      const m = Math.floor(total / 60);
      const sec = total % 60;
      return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }

    draw(now) {
      const ctx = this.ctx;
      if (!ctx) return;
      const p = SL.store.currentPalette() || { accent: '#ff3355' };
      const s = this.state;
      ctx.save();
      if (SL.store.settings.shake && s.shake > 0) {
        const mag = s.shake * 3;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }
      this.drawRoom(ctx, p, now);
      this.drawGate(ctx, p, now);
      this.drawDecor(ctx, p, now);
      this.drawHazards(ctx, p, now);
      this.drawPetals(ctx, p, now);
      this.drawSave(ctx, p, now);
      this.drawPip(ctx, p, now);
      if (s.mode !== 'battle') this.drawPlayer(ctx, p, now);
      this.drawDust(ctx, p, now);
      if (s.mode === 'battle') this.drawBattle(ctx, p, now);
      if (s.mode === 'dead') {
        ctx.fillStyle = 'rgba(25,0,8,0.4)';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    drawRoom(ctx, p, now) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, p.bg0);
      g.addColorStop(0.5, p.bg1);
      g.addColorStop(1, p.bg2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // walls
      ctx.fillStyle = p.wall;
      ctx.fillRect(0, 0, W, ROOM.y);
      ctx.fillRect(0, 0, ROOM.x, H);
      ctx.fillRect(ROOM.x + ROOM.w, 0, W - (ROOM.x + ROOM.w), H);
      ctx.fillRect(0, ROOM.y + ROOM.h, W, H - (ROOM.y + ROOM.h));

      // wall bricks
      ctx.fillStyle = p.wallAlt;
      for (let y = 4; y < ROOM.y; y += 12) {
        for (let x = 0; x < W; x += 28) {
          const off = (Math.floor(y / 12) % 2) * 14;
          ctx.fillRect(x + off, y, 25, 1);
          ctx.fillRect(x + off, y + 1, 1, 10);
        }
      }
      for (let x = 0; x < ROOM.x; x += 14) {
        for (let y = ROOM.y; y < H; y += 18) ctx.fillRect(x, y, 11, 1);
      }
      for (let x = ROOM.x + ROOM.w; x < W; x += 14) {
        for (let y = ROOM.y; y < H; y += 18) ctx.fillRect(x, y, 11, 1);
      }
      for (let y = ROOM.y + ROOM.h; y < H; y += 12) {
        for (let x = 0; x < W; x += 24) ctx.fillRect(x + (y % 24 ? 10 : 0), y, 19, 1);
      }

      // inner edge
      ctx.fillStyle = p.wallEdge;
      ctx.fillRect(ROOM.x - 2, ROOM.y, 2, ROOM.h);
      ctx.fillRect(ROOM.x + ROOM.w, ROOM.y, 2, ROOM.h);
      ctx.fillRect(ROOM.x - 2, ROOM.y - 2, ROOM.w + 4, 2);
      ctx.fillRect(ROOM.x - 2, ROOM.y + ROOM.h, ROOM.w + 4, 2);

      // floor checker
      for (let y = ROOM.y; y < ROOM.y + ROOM.h; y += 28) {
        for (let x = ROOM.x; x < ROOM.x + ROOM.w; x += 28) {
          const odd = ((x / 28) + (y / 28)) % 2 === 0;
          ctx.fillStyle = odd ? p.floor : p.floorAlt;
          ctx.fillRect(x, y, 28, 28);
        }
      }
      // floor noise
      ctx.fillStyle = p.wall;
      for (let i = 0; i < 60; i++) {
        const x = ROOM.x + ((i * 83) % ROOM.w);
        const y = ROOM.y + ((i * 47) % ROOM.h);
        ctx.globalAlpha = 0.18;
        ctx.fillRect(x, y, 2, 1);
      }
      ctx.globalAlpha = 1;

      // roots from the top
      ctx.fillStyle = p.wallAlt;
      DECOR.roots.forEach(function (rx, idx) {
        let x = rx;
        const depth = 20 + (idx * 7) % 30;
        for (let y = 0; y < depth; y += 4) {
          ctx.fillRect(x, y, 2, 4);
          x += Math.sin(y * 0.22 + idx) * 2;
        }
      });

      // water puddle
      ctx.fillStyle = p.gateGlow;
      ctx.globalAlpha = 0.06;
      ctx.fillRect(318, 268, 58, 10);
      ctx.fillRect(326, 264, 40, 4);
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.gateGlow;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(330, 270, 18, 1);
      ctx.fillRect(356, 272, 10, 1);
      ctx.globalAlpha = 1;

      // vignette
      const v = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 290);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }

    drawDecor(ctx, p, now) {
      DECOR.crystals.forEach(function (c, i) {
        const col = c.c === 1 ? p.gateGlow : p.accent2;
        ctx.globalAlpha = 0.55 + Math.sin(now * 1.6 + i) * 0.18;
        ctx.fillStyle = col;
        ctx.fillRect(c.x, c.y, c.s, c.s * 2);
        ctx.fillRect(c.x - c.s, c.y + c.s, c.s * 3, c.s);
        ctx.globalAlpha = 1;
      });
      ctx.strokeStyle = p.grassAlt;
      ctx.fillStyle = p.grass;
      DECOR.grass.forEach(function (g, i) {
        ctx.fillRect(g.x, g.y, 2, 5);
        ctx.fillRect(g.x + 3, g.y - 3, 2, 8);
        ctx.fillRect(g.x + 6, g.y + 1, 2, 4);
        if (i % 2) ctx.fillRect(g.x - 2, g.y + 2, 2, 3);
      });
    }

    drawGate(ctx, p, now) {
      const x = GATE.x, y = 18, w = GATE.w, h = 66;
      ctx.fillStyle = p.wallAlt;
      ctx.fillRect(x - 8, y + 8, 8, h);
      ctx.fillRect(x + w, y + 8, 8, h);
      ctx.fillStyle = p.wallEdge;
      ctx.fillRect(x - 10, y + 6, 10, 3);
      ctx.fillRect(x + w, y + 6, 10, 3);
      ctx.fillStyle = '#05040a';
      ctx.fillRect(x, y + 18, w, h - 18);
      // arch
      ctx.fillStyle = p.wall;
      ctx.fillRect(x - 4, y + 6, w + 8, 14);
      ctx.fillStyle = p.wallEdge;
      for (let i = 0; i < 7; i++) {
        const bx = x - 2 + i * 9;
        const by = y + 7 + Math.abs(3 - i) * 2;
        ctx.fillRect(bx, by, 7, 2);
      }
      if (this.state.gateOpen) {
        const glow = ctx.createLinearGradient(0, y + 18, 0, y + h);
        glow.addColorStop(0, p.gate);
        glow.addColorStop(0.35, p.gateGlow);
        glow.addColorStop(1, p.bg2);
        ctx.fillStyle = glow;
        ctx.fillRect(x, y + 18, w, h - 18);
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 5; i++) {
          const px = x + 8 + ((i * 13 + now * 12) % (w - 16));
          const py = y + 28 + ((i * 19 + now * 8) % 34);
          ctx.fillStyle = '#fff';
          ctx.fillRect(Math.floor(px), Math.floor(py), 2, 2);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = p.gate;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(x + 12, y + 30, w - 24, 2);
        ctx.fillRect(x + 20, y + 40, w - 40, 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.wallEdge;
        ctx.fillRect(x + 8, y + 28, 4, 4);
        ctx.fillRect(x + w - 12, y + 28, 4, 4);
      }
      // gate floor threshold
      ctx.fillStyle = p.wallEdge;
      ctx.fillRect(x - 2, 82, w + 4, 2);
    }

    drawHazards(ctx, p, now) {
      const s = this.state;
      if (s.mode === 'battle' || s.mode === 'dead' || s.mode === 'complete') return;
      s.hazards.forEach(function (h, i) {
        const bob = Math.sin(now * 3 + i) * 2;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = p.danger;
        ctx.fillRect(h.x - 8, h.y + 4, 5, 3);
        ctx.fillRect(h.x + 4, h.y + 7, 4, 2);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.danger;
        ctx.fillRect(h.x - 3, h.y - 5 + bob, 6, 10);
        ctx.fillRect(h.x - 5, h.y - 3 + bob, 10, 6);
        ctx.fillStyle = '#fff';
        ctx.fillRect(h.x - 1, h.y - 2 + bob, 2, 4);
        ctx.globalAlpha = 1;
      });
    }

    drawPetals(ctx, p, now) {
      const s = this.state;
      s.petals.forEach(function (petal) {
        if (petal.taken) return;
        const pulse = 1 + Math.sin(now * 2.4 + petal.phase) * 0.12;
        const y = petal.y + Math.sin(now * 1.8 + petal.phase) * 2;
        ctx.save();
        ctx.translate(petal.x, y);
        ctx.scale(pulse, pulse);
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = p.gold;
        ctx.fillRect(-10, -10, 20, 20);
        ctx.globalAlpha = 1;
        ctx.fillStyle = p.grassAlt;
        ctx.fillRect(-1, 3, 2, 7);
        ctx.fillStyle = p.gold;
        ctx.fillRect(-2, -7, 4, 4);
        ctx.fillRect(-7, -4, 4, 4);
        ctx.fillRect(3, -4, 4, 4);
        ctx.fillRect(-5, 0, 4, 4);
        ctx.fillRect(1, 0, 4, 4);
        ctx.fillStyle = p.gold;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(-9, -9, 18, 1);
        ctx.fillRect(-9, 8, 18, 1);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff3b0';
        ctx.fillRect(-1, -5, 2, 2);
        ctx.restore();
      });
    }

    drawSave(ctx, p, now) {
      const s = this.state;
      const pulse = 1 + Math.sin(now * 2.7) * 0.1;
      const cooldown = s.saveCooldown > 0;
      ctx.save();
      ctx.translate(SAVE_POS.x, SAVE_POS.y);
      ctx.scale(pulse, pulse);
      ctx.globalAlpha = cooldown ? 0.35 : 0.85;
      ctx.fillStyle = p.gold;
      ctx.fillRect(-1, -11, 2, 22);
      ctx.fillRect(-11, -1, 22, 2);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.fillStyle = '#fff8cf';
      ctx.fillRect(-1, -1, 2, 2);
      ctx.globalAlpha = 0.25;
      ctx.fillRect(-7, -7, 14, 14);
      ctx.globalAlpha = 1;
      if (!cooldown) {
        ctx.fillStyle = p.gold;
        for (let i = 0; i < 4; i++) {
          const a = now * 0.8 + i * Math.PI / 2;
          ctx.fillRect(Math.cos(a) * 15 - 1, Math.sin(a) * 15 - 1, 2, 2);
        }
      }
      ctx.restore();
    }

    drawPip(ctx, p, now) {
      const s = this.state;
      if (s.battleDone) {
        // Pip is gone after the battle, but leaves a little light.
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = p.npc;
        ctx.fillRect(PIP_POS.x - 1, PIP_POS.y - 12, 2, 2);
        ctx.globalAlpha = 1;
        return;
      }
      const bob = Math.sin(now * 2.1) * 2;
      const x = PIP_POS.x, y = PIP_POS.y + bob;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = p.npcShade;
      ctx.fillRect(x - 5, y + 13, 10, 2);
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.npc;
      ctx.fillRect(x - 5, y - 8, 10, 8);
      ctx.fillRect(x - 7, y - 4, 14, 10);
      ctx.fillRect(x - 5, y + 6, 10, 2);
      ctx.fillRect(x - 6, y + 8, 3, 2);
      ctx.fillRect(x + 3, y + 7, 3, 3);
      ctx.fillStyle = p.npcShade;
      ctx.fillRect(x - 3, y - 2, 2, 2);
      ctx.fillRect(x + 2, y - 2, 2, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 3, y - 2, 1, 1);
      ctx.fillRect(x + 2, y - 2, 1, 1);
      ctx.fillStyle = p.accent;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x - 2, y + 3, 4, 1);
      ctx.globalAlpha = 1;
      if (dist2(s.player.x, s.player.y, PIP_POS.x, PIP_POS.y) < 48 * 48) {
        ctx.fillStyle = p.gold;
        ctx.fillRect(x - 1, y - 18, 2, 5);
        ctx.fillRect(x - 1, y - 11, 2, 2);
      }
    }

    drawPlayer(ctx, p, now) {
      const s = this.state;
      const pl = s.player;
      if (pl.invuln > 0 && Math.floor(now * 14) % 2 === 0) return;
      const bob = pl.moving ? Math.round(Math.sin(pl.walk * 11) * 1) : 0;
      const x = Math.round(pl.x) - 6;
      const y = Math.round(pl.y) - 14 + bob;
      // shadow
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = '#000';
      ctx.fillRect(x + 1, y + 17, 10, 2);
      ctx.globalAlpha = 1;
      // legs
      const step = pl.moving ? (Math.floor(pl.walk * 11) % 2) : 0;
      ctx.fillStyle = '#241a2d';
      ctx.fillRect(x + 2, y + 13, 3, 4 - step);
      ctx.fillRect(x + 7, y + 13 + step, 3, 4 - step);
      // body
      ctx.fillStyle = p.playerAlt;
      ctx.fillRect(x + 1, y + 6, 10, 9);
      ctx.fillStyle = p.player;
      ctx.fillRect(x + 2, y + 7, 8, 7);
      // scarf
      ctx.fillStyle = p.scarf;
      ctx.fillRect(x + 1, y + 7, 10, 2);
      ctx.fillRect(x + 9, y + 8, 3, 5);
      ctx.fillStyle = p.scarf;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x + 10, y + 12, 2, 2);
      ctx.globalAlpha = 1;
      // head
      ctx.fillStyle = p.skin;
      ctx.fillRect(x + 2, y + 1, 8, 6);
      ctx.fillStyle = '#2b1f33';
      ctx.fillRect(x + 2, y, 8, 3);
      ctx.fillRect(x + 1, y + 1, 2, 3);
      ctx.fillRect(x + 9, y + 1, 2, 3);
      // face
      ctx.fillStyle = '#2b1f33';
      if (pl.dir === 'left') {
        ctx.fillRect(x + 3, y + 4, 1, 1);
        ctx.fillRect(x + 6, y + 4, 1, 1);
      } else if (pl.dir === 'right') {
        ctx.fillRect(x + 4, y + 4, 1, 1);
        ctx.fillRect(x + 8, y + 4, 1, 1);
      } else if (pl.dir === 'up') {
        ctx.fillRect(x + 3, y + 3, 2, 1);
        ctx.fillRect(x + 7, y + 3, 2, 1);
      } else {
        ctx.fillRect(x + 4, y + 4, 1, 1);
        ctx.fillRect(x + 7, y + 4, 1, 1);
      }
    }

    drawDust(ctx, p, now) {
      const s = this.state;
      s.dust.forEach(function (d) {
        const alpha = d.a * (0.65 + Math.sin(now * 1.7 + d.phase) * 0.35);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = d.gold ? p.gold : p.gateGlow;
        ctx.fillRect(Math.floor(d.x), Math.floor(d.y), d.s, d.s);
      });
      ctx.globalAlpha = 1;
    }

    drawBattle(ctx, p, now) {
      const s = this.state;
      const b = s.battle;
      if (!b) return;
      ctx.fillStyle = 'rgba(4,3,9,0.62)';
      ctx.fillRect(0, 0, W, H);

      // echo creature
      const ex = W / 2;
      const ey = 92 + Math.sin(now * 1.7) * 4;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = p.gateGlow;
      ctx.fillRect(ex - 48, ey - 26, 96, 56);
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.wall;
      ctx.fillRect(ex - 26, ey - 12, 52, 26);
      ctx.fillStyle = p.wallAlt;
      ctx.fillRect(ex - 40, ey - 4, 15, 13);
      ctx.fillRect(ex + 25, ey - 4, 15, 13);
      ctx.fillStyle = p.wallEdge;
      ctx.fillRect(ex - 36, ey + 8, 10, 8);
      ctx.fillRect(ex + 26, ey + 8, 10, 8);
      ctx.fillStyle = '#f8f2ff';
      ctx.fillRect(ex - 12, ey - 9, 24, 14);
      ctx.fillStyle = p.accent;
      ctx.fillRect(ex - 5, ey - 6, 10, 8);
      ctx.fillStyle = '#0b0710';
      ctx.fillRect(ex - 1, ey - 5, 2, 6);
      // glitch pixels
      for (let i = 0; i < 6; i++) {
        const gx = ex - 32 + ((i * 19 + now * 30) % 64);
        const gy = ey - 18 + ((i * 13) % 34);
        ctx.fillStyle = i % 2 ? p.accent : p.gateGlow;
        ctx.globalAlpha = 0.65;
        ctx.fillRect(Math.floor(gx), Math.floor(gy), 4, 1);
      }
      ctx.globalAlpha = 1;

      // battle box
      ctx.fillStyle = 'rgba(4,3,9,0.86)';
      ctx.fillRect(b.box.x, b.box.y, b.box.w, b.box.h);
      ctx.strokeStyle = '#f8f2ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.box.x + 0.5, b.box.y + 0.5, b.box.w - 1, b.box.h - 1);
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.box.x + 4.5, b.box.y + 4.5, b.box.w - 9, b.box.h - 9);

      // bullets
      b.bullets.forEach(function (bullet) {
        if (bullet.kind === 'orb') {
          ctx.fillStyle = p.gold;
          ctx.fillRect(bullet.x - 2, bullet.y - 2, 4, 4);
          ctx.globalAlpha = 0.3;
          ctx.fillRect(bullet.x - 4, bullet.y - 4, 8, 8);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = p.danger;
          ctx.fillRect(bullet.x - 3, bullet.y - 1, 6, 2);
          ctx.fillRect(bullet.x - 1, bullet.y - 3, 2, 6);
          ctx.fillStyle = '#fff';
          ctx.fillRect(bullet.x - 1, bullet.y - 1, 2, 2);
        }
      });

      // soul
      const blinking = s.player.invuln > 0 && Math.floor(now * 14) % 2 === 0;
      if (!blinking) {
        ctx.fillStyle = p.accent;
        ctx.fillRect(b.soul.x - 2, b.soul.y - 2, 4, 4);
        ctx.fillRect(b.soul.x - 4, b.soul.y - 1, 8, 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(b.soul.x - 1, b.soul.y - 1, 1, 1);
      }
      // soul glow
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = p.accent;
      ctx.fillRect(b.soul.x - 6, b.soul.y - 6, 12, 12);
      ctx.globalAlpha = 1;
    }
  }

  const game = new SeamGame();

  window.SL = window.SL || {};
  SL.game = {
    mount: function (canvas) { game.mount(canvas); },
    start: function (opts) { game.start(opts); },
    stop: function () { game.stop(); },
    pause: function () { game.pause(); },
    resume: function () { game.resume(); },
    retry: function () { game.retry(); },
    action: function () { game.action(); },
    cancel: function () { game.cancel(); },
    setDirection: function (dir, pressed) { game.setDirection(dir, pressed); },
    clearKeys: function () { game.clearKeys(); },
    refreshHud: function () { game.refreshHud(true); },
    refreshPause: function () { game.refreshPause(); },
    isRunning: function () { return game.isRunning(); },
    isPaused: function () { return game.isPaused(); },
    mode: function () { return game.mode(); },
    showToast: function (text, duration) { game.showGameToast(text, duration); },
    formatTime: function (seconds) { return game.formatTime(seconds); }
  };
})();

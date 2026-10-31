import { getLang } from './i18n.js';
import { getSettings, setSetting } from './settings.js';
import { audio } from './audio.js';
import { DEFAULT_PACK, packLines, packText } from './packs.js';
import { t } from './i18n.js';

const SOUL_COLORS = {
  red: '#ff3b47',
  cyan: '#5ce1e6',
  lime: '#9bff6b',
  gold: '#ffd75e'
};

const BATTLE_BOX = { x: 116, y: 158, w: 248, h: 88 };
const BATTLE_INNER = { x: BATTLE_BOX.x + 6, y: BATTLE_BOX.y + 6, w: BATTLE_BOX.w - 12, h: BATTLE_BOX.h - 12 };
const ROOM_BOUNDS = { x1: 46, x2: 432, y1: 166, y2: 250 };

export class SoulTrial {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = options;
    this.width = 480;
    this.height = 270;
    this.running = false;
    this.paused = false;
    this.time = 0;
    this.last = 0;
    this.mode = 'explore';
    this.pack = DEFAULT_PACK;
    this.palette = DEFAULT_PACK.palette;
    this.lines = packLines(DEFAULT_PACK, getLang());
    this.npcName = 'MIMO';
    this.roomName = 'RUINS // ROOM 01';
    this.input = { up: false, down: false, left: false, right: false };
    this.keys = new Set();
    this.player = { x: 366, y: 210, facing: 'left', walk: 0, moving: false };
    this.npc = { x: 168, y: 192, bob: 0 };
    this.hp = 20;
    this.maxHp = 20;
    this.projectiles = [];
    this.sparkles = [];
    this.dust = [];
    this.leaves = [];
    this.dialogueQueue = [];
    this.dialogueFull = '';
    this.dialogueShown = 0;
    this.dialogueSpeaker = '';
    this.dialogueDone = null;
    this.dialogueActive = false;
    this.cleared = Boolean(getSettings().cleared);
    this.shake = 0;
    this.hitFlash = 0;
    this.invuln = 0;
    this.dash = 0;
    this.dashCooldown = 0;
    this.battleTimer = 15;
    this.spawnTimer = 0;
    this.spawnInterval = 0.42;
    this.battleActive = false;
    this.raf = null;
    this.timeoutIds = [];
    this.soulColor = SOUL_COLORS[getSettings().soul] || SOUL_COLORS.red;
    this.bound = false;

    this.dom = {
      dialogueBox: document.getElementById('dialogueBox'),
      dialogueName: document.getElementById('dialogueName'),
      dialogueText: document.getElementById('dialogueText'),
      dialogueNext: document.getElementById('dialogueNext'),
      battleBanner: document.getElementById('battleBanner'),
      battleTimer: document.getElementById('battleTimer'),
      hpFill: document.getElementById('hpFill'),
      hpText: document.getElementById('hpText'),
      hudPackName: document.getElementById('hudPackName'),
      pauseOverlay: document.getElementById('pauseOverlay'),
      demoRoom: document.getElementById('demoRoom'),
      demoStage: document.getElementById('demoStage'),
      gameTouch: document.getElementById('gameTouch'),
      rotateHint: document.getElementById('rotateHint')
    };
    this.bind();
  }

  bind() {
    if (this.bound) return;
    this.bound = true;
    this.onKeyDown = (event) => {
      if (!this.running) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = event.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar'].includes(key)) event.preventDefault();
      if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === 'ц' || key === 'Ц') this.input.up = true;
      else if (key === 'ArrowDown' || key === 's' || key === 'S' || key === 'ы' || key === 'Ы') this.input.down = true;
      else if (key === 'ArrowLeft' || key === 'a' || key === 'A' || key === 'ф' || key === 'Ф') this.input.left = true;
      else if (key === 'ArrowRight' || key === 'd' || key === 'D' || key === 'в' || key === 'В') this.input.right = true;
      else if (key === 'z' || key === 'Z' || key === 'Enter' || key === ' ') {
        if (!event.repeat) this.press('a');
      } else if (key === 'x' || key === 'X' || key === 'Escape' || key === 'я' || key === 'Я' || key === 'ч' || key === 'Ч') {
        if (!event.repeat) this.press('b');
      }
    };
    this.onKeyUp = (event) => {
      const key = event.key;
      if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === 'ц' || key === 'Ц') this.input.up = false;
      else if (key === 'ArrowDown' || key === 's' || key === 'S' || key === 'ы' || key === 'Ы') this.input.down = false;
      else if (key === 'ArrowLeft' || key === 'a' || key === 'A' || key === 'ф' || key === 'Ф') this.input.left = false;
      else if (key === 'ArrowRight' || key === 'd' || key === 'D' || key === 'в' || key === 'В') this.input.right = false;
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => { this.input.up = this.input.down = this.input.left = this.input.right = false; });

    if (this.dom.gameTouch) {
      this.dom.gameTouch.querySelectorAll('[data-dir]').forEach((button) => {
        const dir = button.dataset.dir;
        const press = (event) => {
          event.preventDefault();
          this.input[dir] = true;
          button.classList.add('is-down');
          if (navigator.vibrate) navigator.vibrate(6);
        };
        const release = () => {
          this.input[dir] = false;
          button.classList.remove('is-down');
        };
        button.addEventListener('pointerdown', press);
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('pointerleave', release);
        button.addEventListener('contextmenu', (event) => event.preventDefault());
      });
      this.dom.gameTouch.querySelectorAll('[data-act]').forEach((button) => {
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          button.classList.add('is-down');
          this.press(button.dataset.act);
          if (navigator.vibrate) navigator.vibrate(8);
        });
        const release = () => button.classList.remove('is-down');
        button.addEventListener('pointerup', release);
        button.addEventListener('pointercancel', release);
        button.addEventListener('pointerleave', release);
      });
    }

    document.getElementById('resumeBtn')?.addEventListener('click', () => { audio.play('select'); this.resume(); });
    document.getElementById('pauseQuit')?.addEventListener('click', () => { audio.play('select'); this.options.onQuit?.(); });
    document.getElementById('pauseSettings')?.addEventListener('click', () => {
      audio.play('select');
      this.hidePauseOverlay();
      this.options.onSettings?.();
    });

    this.onResize = () => this.updateRotateHint();
    window.addEventListener('resize', this.onResize);
    this.updateRotateHint();
  }

  updateRotateHint() {
    if (!this.dom.rotateHint) return;
    const portrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
    this.dom.rotateHint.classList.toggle('is-portrait', portrait);
  }

  start(pack = DEFAULT_PACK) {
    this.pack = pack || DEFAULT_PACK;
    this.palette = { ...DEFAULT_PACK.palette, ...(pack.palette || {}) };
    this.lines = packLines(this.pack, getLang());
    this.npcName = packText(pack.npcName, getLang()) || 'MIMO';
    this.roomName = packText(pack.roomName, getLang()) || 'RUINS // ROOM 01';
    this.soulColor = SOUL_COLORS[getSettings().soul] || SOUL_COLORS.red;
    this.cleared = Boolean(getSettings().cleared);
    this.mode = 'explore';
    this.paused = false;
    this.hp = 20;
    this.maxHp = 20;
    this.player = { x: 366, y: 210, facing: 'left', walk: 0, moving: false };
    this.npc = { x: 168, y: 192, bob: 0 };
    this.projectiles = [];
    this.sparkles = [];
    this.battleActive = false;
    this.dialogueQueue = [];
    this.dialogueActive = false;
    this.shake = 0;
    this.hitFlash = 0;
    this.invuln = 0;
    this.dash = 0;
    this.dashCooldown = 0;
    this.input.up = this.input.down = this.input.left = this.input.right = false;
    this.time = 0;
    this.spawnTimer = 0;
    this.running = true;
    this.hideDialogue();
    this.hidePauseOverlay();
    this.dom.battleBanner?.classList.add('is-hidden');
    this.updateHud();
    if (this.dom.hudPackName) this.dom.hudPackName.textContent = this.pack.name || 'DEFAULT SOUL';
    if (this.dom.demoRoom) this.dom.demoRoom.textContent = this.roomName;
    this.seedAmbient();
    audio.setTheme('game', this.pack.tempo || 1);

    this.timeoutIds.forEach(clearTimeout);
    this.timeoutIds = [];
    this.timeoutIds.push(setTimeout(() => {
      if (!this.running) return;
      this.showDialogue(this.lines.intro, {
        speaker: 'RUINS',
        onDone: () => { this.mode = 'explore'; }
      });
    }, 420));

    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame((now) => this.loop(now));
    }
  }

  stop() {
    this.running = false;
    this.paused = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.timeoutIds.forEach(clearTimeout);
    this.timeoutIds = [];
    this.hideDialogue();
    this.hidePauseOverlay();
    this.dom.battleBanner?.classList.add('is-hidden');
    this.input.up = this.input.down = this.input.left = this.input.right = false;
    this.mode = 'explore';
  }

  pause() {
    if (!this.running || this.paused) return;
    this.paused = true;
    this.input.up = this.input.down = this.input.left = this.input.right = false;
    document.body.classList.add('is-paused');
    this.dom.pauseOverlay?.classList.remove('is-hidden');
  }

  resume() {
    if (!this.running) return;
    this.paused = false;
    document.body.classList.remove('is-paused');
    this.dom.pauseOverlay?.classList.add('is-hidden');
    this.last = performance.now();
  }

  hidePauseOverlay() {
    document.body.classList.remove('is-paused');
    this.dom.pauseOverlay?.classList.add('is-hidden');
  }

  hideDialogue() {
    this.dialogueActive = false;
    this.dom.dialogueBox?.classList.add('is-hidden');
  }

  loop(now) {
    if (!this.running) { this.raf = null; return; }
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (!this.paused) {
      this.time += dt;
      this.update(dt);
    }
    this.draw();
    this.raf = requestAnimationFrame((next) => this.loop(next));
  }

  update(dt) {
    this.updateDialogue(dt);
    this.updateSparkles(dt);
    this.updateAmbient(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.6);
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt * 3);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.dash > 0) this.dash = Math.max(0, this.dash - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.npc.bob = Math.sin(this.time * 2.1) * 2;

    if (this.mode === 'dialogue') return;
    if (this.mode === 'battle') this.updateBattle(dt);
    else this.updateExplore(dt);
  }

  updateExplore(dt) {
    let dx = 0;
    let dy = 0;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;
    if (this.input.up) dy -= 1;
    if (this.input.down) dy += 1;
    const moving = dx !== 0 || dy !== 0;
    this.player.moving = moving;
    if (moving) {
      const length = Math.hypot(dx, dy) || 1;
      const speed = 82 * (this.pack.speed || 1);
      this.player.x += (dx / length) * speed * dt;
      this.player.y += (dy / length) * speed * dt;
      this.player.x = Math.max(ROOM_BOUNDS.x1, Math.min(ROOM_BOUNDS.x2, this.player.x));
      this.player.y = Math.max(ROOM_BOUNDS.y1, Math.min(ROOM_BOUNDS.y2, this.player.y));
      this.player.walk += dt * 11;
      if (Math.abs(dx) > Math.abs(dy)) this.player.facing = dx > 0 ? 'right' : 'left';
      else this.player.facing = dy > 0 ? 'down' : 'up';
    } else {
      this.player.walk = 0;
    }
  }

  updateBattle(dt) {
    this.battleTimer = Math.max(0, this.battleTimer - dt);
    if (this.dom.battleTimer) this.dom.battleTimer.textContent = this.battleTimer.toFixed(1);
    if (this.battleTimer <= 0) { this.winBattle(); return; }

    const progress = 1 - this.battleTimer / 15;
    this.spawnInterval = 0.44 - progress * 0.2;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval;
      this.spawnStar(progress);
    }

    let dx = 0;
    let dy = 0;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;
    if (this.input.up) dy -= 1;
    if (this.input.down) dy += 1;
    if (dx || dy) {
      const length = Math.hypot(dx, dy) || 1;
      const speed = (112 + (this.dash > 0 ? 130 : 0)) * (this.pack.speed || 1);
      this.soulX = Math.max(BATTLE_INNER.x + 4, Math.min(BATTLE_INNER.x + BATTLE_INNER.w - 4, (this.soulX ?? 236) + (dx / length) * speed * dt));
      this.soulY = Math.max(BATTLE_INNER.y + 4, Math.min(BATTLE_INNER.y + BATTLE_INNER.h - 4, (this.soulY ?? 200) + (dy / length) * speed * dt));
    }
    this.soulX ??= 236;
    this.soulY ??= 200;

    const soul = { x: this.soulX - 4, y: this.soulY - 4, w: 8, h: 8 };
    for (const star of this.projectiles) {
      star.x += star.vx * dt;
      star.y += star.vy * dt;
      star.phase += dt * 5;
      if (star.wave) star.x += Math.sin(star.phase) * star.wave * dt;
      star.life -= dt;
      if (this.overlaps(soul, { x: star.x - 2, y: star.y - 2, w: 5, h: 5 }) && this.invuln <= 0) {
        this.takeHit(star);
      }
    }
    this.projectiles = this.projectiles.filter((star) => star.life > 0 && star.y < BATTLE_BOX.y + BATTLE_BOX.h + 12 && star.y > BATTLE_BOX.y - 14 && star.x > BATTLE_BOX.x - 16 && star.x < BATTLE_BOX.x + BATTLE_BOX.w + 16);
  }

  overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  spawnStar(progress) {
    const side = progress > 0.45 && Math.random() > 0.62;
    if (side) {
      const fromLeft = Math.random() > 0.5;
      this.projectiles.push({
        x: fromLeft ? BATTLE_BOX.x - 8 : BATTLE_BOX.x + BATTLE_BOX.w + 8,
        y: BATTLE_INNER.y + 8 + Math.random() * (BATTLE_INNER.h - 16),
        vx: (fromLeft ? 1 : -1) * (44 + Math.random() * 30),
        vy: (Math.random() - 0.5) * 18,
        wave: 0,
        phase: Math.random() * 6,
        life: 6,
        color: Math.random() > 0.5 ? '#6fe7e8' : '#ffd75e'
      });
    } else {
      this.projectiles.push({
        x: BATTLE_INNER.x + 8 + Math.random() * (BATTLE_INNER.w - 16),
        y: BATTLE_BOX.y - 6,
        vx: (Math.random() - 0.5) * 10,
        vy: 54 + Math.random() * 58 + progress * 15,
        wave: 8 + Math.random() * 12,
        phase: Math.random() * 6,
        life: 6,
        color: Math.random() > 0.55 ? '#6fe7e8' : '#ffd75e'
      });
    }
  }

  takeHit(star) {
    this.hp = Math.max(0, this.hp - 2);
    this.invuln = 1.1;
    this.shake = 0.38;
    this.hitFlash = 0.6;
    this.updateHud();
    audio.play('hit');
    if (navigator.vibrate) navigator.vibrate([25, 30, 25]);
    this.sparkles.push(...Array.from({ length: 6 }, () => ({
      x: this.soulX + (Math.random() - 0.5) * 10,
      y: this.soulY + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 60,
      vy: (Math.random() - 0.5) * 60,
      life: 0.4,
      max: 0.4,
      color: '#ff3b47',
      size: 2
    })));
    if (this.hp <= 0) this.loseBattle();
  }

  winBattle() {
    if (!this.battleActive) return;
    this.battleActive = false;
    this.mode = 'dialogue';
    this.projectiles = [];
    this.dom.battleBanner?.classList.add('is-hidden');
    audio.play('clear');
    this.spawnBurst(240, 130, 26, '#ffd75e');
    this.showDialogue(this.lines.win, {
      speaker: this.npcName,
      onDone: () => {
        this.cleared = true;
        setSetting('cleared', true);
        this.soulColor = SOUL_COLORS[getSettings().soul] || SOUL_COLORS.red;
        this.mode = 'explore';
        this.options.onClear?.();
      }
    });
  }

  loseBattle() {
    this.battleActive = false;
    this.mode = 'dialogue';
    this.projectiles = [];
    this.dom.battleBanner?.classList.add('is-hidden');
    this.showDialogue(this.lines.lose, {
      speaker: this.npcName,
      onDone: () => {
        this.hp = this.maxHp;
        this.updateHud();
        this.mode = 'explore';
        this.player.x = this.npc.x + 36;
        this.player.y = this.npc.y + 4;
      }
    });
  }

  startBattle() {
    this.mode = 'battle';
    this.battleActive = true;
    this.battleTimer = 15;
    this.spawnTimer = 0.5;
    this.projectiles = [];
    this.soulX = BATTLE_BOX.x + BATTLE_BOX.w / 2;
    this.soulY = BATTLE_BOX.y + BATTLE_BOX.h - 18;
    this.hp = this.maxHp;
    this.invuln = 1.2;
    this.dashCooldown = 0;
    this.updateHud();
    this.dom.battleBanner?.classList.remove('is-hidden');
    if (this.dom.battleTimer) this.dom.battleTimer.textContent = '15.0';
    audio.play('select');
  }

  interact() {
    const dx = this.player.x - this.npc.x;
    const dy = this.player.y - this.npc.y;
    if (Math.hypot(dx, dy) < 36) {
      const opener = this.cleared ? this.lines.cleared : this.lines.npc;
      this.showDialogue(opener, {
        speaker: this.npcName,
        onDone: () => this.startBattle()
      });
      return;
    }
    if (Math.hypot(this.player.x - 82, this.player.y - 216) < 32) {
      this.hp = this.maxHp;
      this.updateHud();
      audio.play('heal');
      this.spawnBurst(82, 208, 14, '#ffd75e');
      this.showDialogue(this.lines.flower, { speaker: 'RUINS' });
      return;
    }
    if (this.player.x > 404 && this.player.y < 198) {
      this.showDialogue(this.lines.door, { speaker: 'RUINS' });
      return;
    }
    audio.play('move');
  }

  press(action) {
    if (!this.running) return;
    audio.unlock();
    if (this.paused) {
      if (action === 'a') this.resume();
      return;
    }
    if (action === 'b') {
      audio.play('back');
      if (this.mode === 'dialogue') {
        this.hideDialogue();
        this.dialogueQueue = [];
        const done = this.dialogueDone;
        this.dialogueDone = null;
        this.mode = 'explore';
        done?.();
      } else {
        this.pause();
      }
      return;
    }
    if (this.mode === 'dialogue') {
      this.advanceDialogue();
      return;
    }
    if (this.mode === 'battle') {
      audio.play('select');
      if (this.dashCooldown <= 0) {
        this.dash = 0.16;
        this.dashCooldown = 1.4;
        this.invuln = Math.max(this.invuln, 0.25);
      }
      return;
    }
    if (this.mode === 'explore') {
      audio.play('select');
      this.interact();
    }
  }

  showDialogue(lines, { speaker = this.npcName, onDone = null } = {}) {
    if (!Array.isArray(lines) || lines.length === 0) { onDone?.(); return; }
    this.mode = 'dialogue';
    this.dialogueQueue = [...lines];
    this.dialogueSpeaker = speaker;
    this.dialogueDone = onDone;
    this.dialogueActive = true;
    this.dom.dialogueBox?.classList.remove('is-hidden');
    if (this.dom.dialogueName) this.dom.dialogueName.textContent = speaker;
    this.nextDialogue();
  }

  nextDialogue() {
    if (this.dialogueQueue.length === 0) {
      this.hideDialogue();
      const done = this.dialogueDone;
      this.dialogueDone = null;
      if (this.mode === 'dialogue') this.mode = 'explore';
      done?.();
      return;
    }
    this.dialogueFull = this.dialogueQueue.shift();
    this.dialogueShown = 0;
    if (this.dom.dialogueText) this.dom.dialogueText.textContent = '';
    if (this.dom.dialogueNext) this.dom.dialogueNext.classList.add('is-hidden');
  }

  updateDialogue(dt) {
    if (!this.dialogueActive || this.mode !== 'dialogue') return;
    if (this.dialogueShown < this.dialogueFull.length) {
      const before = Math.floor(this.dialogueShown);
      this.dialogueShown = Math.min(this.dialogueFull.length, this.dialogueShown + dt * 52);
      const after = Math.floor(this.dialogueShown);
      if (after !== before && this.dom.dialogueText) {
        this.dom.dialogueText.textContent = this.dialogueFull.slice(0, after);
        if (after % 3 === 0) audio.play('type');
      }
      if (this.dialogueShown >= this.dialogueFull.length) this.dom.dialogueNext?.classList.remove('is-hidden');
    }
  }

  advanceDialogue() {
    if (!this.dialogueActive) return;
    if (this.dialogueShown < this.dialogueFull.length) {
      this.dialogueShown = this.dialogueFull.length;
      if (this.dom.dialogueText) this.dom.dialogueText.textContent = this.dialogueFull;
      this.dom.dialogueNext?.classList.remove('is-hidden');
      return;
    }
    audio.play('select');
    this.nextDialogue();
  }

  updateHud() {
    const pct = Math.max(0, Math.min(100, (this.hp / this.maxHp) * 100));
    if (this.dom.hpFill) {
      this.dom.hpFill.style.width = `${pct}%`;
      this.dom.hpFill.style.background = pct > 45 ? 'var(--gold)' : 'var(--red)';
    }
    if (this.dom.hpText) this.dom.hpText.textContent = `${this.hp} / ${this.maxHp}`;
  }

  seedAmbient() {
    const rand = () => Math.random();
    this.dust = Array.from({ length: 22 }, () => ({
      x: 30 + rand() * 420,
      y: 120 + rand() * 140,
      speed: 4 + rand() * 10,
      drift: (rand() - 0.5) * 4,
      phase: rand() * Math.PI * 2,
      size: rand() > 0.75 ? 2 : 1,
      alpha: 0.15 + rand() * 0.35
    }));
    this.leaves = Array.from({ length: 7 }, () => ({
      x: rand() * 480,
      y: 30 + rand() * 210,
      speed: 8 + rand() * 14,
      drift: (rand() - 0.5) * 7,
      phase: rand() * Math.PI * 2,
      size: 2 + Math.floor(rand() * 2),
      alpha: 0.3 + rand() * 0.4
    }));
  }

  updateAmbient(dt) {
    for (const dot of this.dust) {
      dot.y -= dot.speed * dt;
      dot.x += Math.sin(this.time * 0.5 + dot.phase) * dot.drift * dt;
      if (dot.y < 120) { dot.y = 262; dot.x = 30 + Math.random() * 420; }
    }
    for (const leaf of this.leaves) {
      leaf.x += leaf.speed * dt;
      leaf.y += Math.sin(this.time + leaf.phase) * 5 * dt;
      if (leaf.x > 492) { leaf.x = -12; leaf.y = 30 + Math.random() * 210; }
    }
  }

  spawnBurst(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = 18 + Math.random() * 46;
      this.sparkles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 8,
        life: 0.7 + Math.random() * 0.5,
        max: 1.2,
        color,
        size: Math.random() > 0.5 ? 2 : 1
      });
    }
  }

  updateSparkles(dt) {
    for (const spark of this.sparkles) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 40 * dt;
      spark.life -= dt;
    }
    this.sparkles = this.sparkles.filter((spark) => spark.life > 0);
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  draw() {
    const ctx = this.ctx;
    const p = this.palette;
    const settings = getSettings();
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    if (settings.shake && this.shake > 0) {
      ctx.translate(Math.round((Math.random() - 0.5) * 6 * this.shake), Math.round((Math.random() - 0.5) * 6 * this.shake));
    }

    this.drawRoom(ctx, p);

    if (this.mode === 'battle') {
      this.drawBattle(ctx, p);
    } else {
      this.drawEntities(ctx, p);
    }

    for (const spark of this.sparkles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, spark.life / (spark.max || 1)));
      ctx.fillStyle = spark.color;
      ctx.fillRect(Math.round(spark.x), Math.round(spark.y), spark.size, spark.size);
    }
    ctx.globalAlpha = 1;

    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,45,60,${this.hitFlash * 0.28})`;
      ctx.fillRect(0, 0, 480, 270);
    }

    ctx.restore();
  }

  drawRoom(ctx, p) {
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, 480, 270);

    /* back wall */
    ctx.fillStyle = p.wallDark;
    ctx.fillRect(0, 38, 480, 118);
    ctx.fillStyle = p.wall;
    ctx.fillRect(0, 52, 480, 100);
    ctx.fillStyle = p.wallLight;
    ctx.fillRect(0, 52, 480, 2);

    /* bricks */
    ctx.fillStyle = p.brick;
    for (let row = 0; row < 7; row++) {
      const y = 56 + row * 14;
      ctx.fillRect(0, y, 480, 1);
      const offset = row % 2 === 0 ? 0 : 17;
      for (let x = -offset; x < 480; x += 34) ctx.fillRect(x, y, 1, 14);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let row = 0; row < 7; row += 2) {
      for (let x = 5; x < 480; x += 34) ctx.fillRect(x + (row % 2) * 17, 62 + row * 14, 12, 3);
    }

    /* window with moonlight */
    ctx.fillStyle = '#070510';
    ctx.fillRect(322, 66, 58, 58);
    const moon = ctx.createLinearGradient(0, 68, 0, 122);
    moon.addColorStop(0, 'rgba(205,188,255,0.28)');
    moon.addColorStop(1, 'rgba(120,94,180,0.03)');
    ctx.fillStyle = moon;
    ctx.fillRect(326, 70, 50, 50);
    ctx.fillStyle = 'rgba(7,5,13,0.8)';
    for (let x = 336; x < 376; x += 12) ctx.fillRect(x, 70, 2, 50);
    for (let y = 80; y < 120; y += 13) ctx.fillRect(326, y, 50, 2);

    /* pillars */
    this.drawPillar(ctx, p, 28, 36, 30, 120);
    this.drawPillar(ctx, p, 424, 36, 28, 120);

    /* door */
    ctx.fillStyle = p.door;
    ctx.fillRect(418, 110, 44, 58);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(422, 114, 36, 54);
    ctx.fillStyle = p.doorGlow;
    ctx.globalAlpha = 0.35 + Math.sin(this.time * 2) * 0.1;
    ctx.fillRect(424, 116, 2, 52);
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.brick;
    ctx.fillRect(412, 104, 56, 8);

    /* floor */
    const floor = ctx.createLinearGradient(0, 154, 0, 270);
    floor.addColorStop(0, p.floor);
    floor.addColorStop(1, p.floorDark);
    ctx.fillStyle = floor;
    ctx.fillRect(0, 154, 480, 116);
    ctx.fillStyle = p.floorLine;
    ctx.fillRect(0, 154, 480, 2);
    ctx.globalAlpha = 0.45;
    for (let i = 0; i <= 12; i++) {
      const x = i * 40;
      ctx.fillRect(x, 156, 1, 114);
    }
    for (let y = 170; y < 270; y += 18) ctx.fillRect(0, y, 480, 1);
    ctx.globalAlpha = 1;

    /* rug */
    ctx.fillStyle = 'rgba(255,215,94,0.06)';
    ctx.fillRect(140, 184, 200, 42);
    ctx.fillStyle = 'rgba(255,215,94,0.12)';
    ctx.fillRect(140, 184, 200, 2);
    ctx.fillRect(140, 224, 200, 2);

    /* flowers */
    this.drawFlower(ctx, p, 80, 224, 1.15);
    this.drawFlower(ctx, p, 96, 236, 0.8);
    this.drawFlower(ctx, p, 62, 238, 0.72);
    this.drawFlower(ctx, p, 406, 240, 0.55);

    /* ambient */
    for (const dot of this.dust) {
      ctx.globalAlpha = dot.alpha * (0.55 + 0.45 * Math.sin(this.time * 0.8 + dot.phase));
      ctx.fillStyle = p.ambient;
      ctx.fillRect(Math.round(dot.x), Math.round(dot.y), dot.size, dot.size);
    }
    ctx.globalAlpha = 1;
    for (const leaf of this.leaves) {
      ctx.fillStyle = `rgba(190,60,76,${leaf.alpha})`;
      ctx.fillRect(Math.round(leaf.x), Math.round(leaf.y), leaf.size, leaf.size);
    }

    /* bottom fade */
    const fade = ctx.createLinearGradient(0, 238, 0, 270);
    fade.addColorStop(0, 'rgba(4,3,8,0)');
    fade.addColorStop(1, 'rgba(4,3,8,0.5)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 238, 480, 32);
  }

  drawPillar(ctx, p, x, y, w, h) {
    ctx.fillStyle = p.wallDark;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = p.wallLight;
    ctx.fillRect(x + 3, y, w - 6, h);
    ctx.fillStyle = p.wall;
    ctx.fillRect(x + 6, y + 4, w - 12, h - 8);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 6, y + 4, 3, h - 8);
    ctx.fillStyle = p.brick;
    ctx.fillRect(x - 3, y, w + 6, 5);
    ctx.fillRect(x - 4, y + h - 5, w + 8, 5);
  }

  drawEntities(ctx, p) {
    /* NPC shadow */
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(this.npc.x - 9, 213, 20, 3);
    this.drawNpc(ctx, p, this.npc.x, this.npc.y + this.npc.bob);

    /* player shadow */
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(this.player.x - 6, this.player.y + 10, 13, 3);
    this.drawPlayer(ctx, p, this.player);

    /* interaction hint */
    const nearNpc = Math.hypot(this.player.x - this.npc.x, this.player.y - this.npc.y) < 36;
    if (nearNpc && this.mode === 'explore') {
      const bob = Math.sin(this.time * 3) * 1.5;
      ctx.fillStyle = 'rgba(255,215,94,0.9)';
      ctx.fillRect(this.npc.x - 1, this.npc.y - 32 + bob, 6, 2);
      ctx.fillRect(this.npc.x + 1, this.npc.y - 29 + bob, 2, 2);
    }
  }

  drawNpc(ctx, p, x, y) {
    const bob = Math.sin(this.time * 2.1) * 1.4;
    const cy = y + bob;
    const glow = ctx.createRadialGradient(x, cy - 4, 0, x, cy - 4, 26);
    glow.addColorStop(0, 'rgba(240,234,255,0.12)');
    glow.addColorStop(1, 'rgba(240,234,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 26, cy - 30, 52, 52);

    /* body */
    ctx.fillStyle = p.npc;
    ctx.fillRect(x - 9, cy - 14, 18, 18);
    ctx.fillRect(x - 7, cy + 4, 14, 3);
    ctx.fillRect(x - 5, cy + 7, 4, 2);
    ctx.fillRect(x + 2, cy + 7, 3, 2);
    /* wavy bottom */
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x - 7, cy + 4, 14, 1);
    /* eyes */
    ctx.fillStyle = '#241b33';
    ctx.fillRect(x - 5, cy - 8, 3, 3);
    ctx.fillRect(x + 3, cy - 8, 3, 3);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 4, cy - 7, 1, 1);
    ctx.fillRect(x + 4, cy - 7, 1, 1);
    /* scarf */
    ctx.fillStyle = p.npcAccent;
    ctx.fillRect(x - 9, cy - 2, 18, 3);
    ctx.fillRect(x + 5, cy + 1, 4, 5);
    /* mouth */
    ctx.fillStyle = 'rgba(36,27,51,0.7)';
    ctx.fillRect(x - 1, cy - 3, 3, 1);
  }

  drawPlayer(ctx, p, player) {
    const x = Math.round(player.x);
    const y = Math.round(player.y);
    const moving = player.moving;
    const frame = Math.floor(player.walk) % 2;
    const legOffset = moving ? frame : 0;

    /* legs */
    ctx.fillStyle = '#1d1528';
    ctx.fillRect(x - 4, y + 5 + legOffset, 3, 5 - legOffset);
    ctx.fillRect(x + 1, y + 5 + (moving ? 1 - legOffset : 0), 3, 4);
    /* body */
    ctx.fillStyle = p.player;
    ctx.fillRect(x - 5, y - 3, 10, 9);
    /* scarf */
    ctx.fillStyle = p.playerAccent;
    ctx.fillRect(x - 5, y - 3, 10, 2);
    ctx.fillRect(x + 4, y - 1, 2, 5);
    /* head */
    ctx.fillStyle = '#f1c9a5';
    ctx.fillRect(x - 5, y - 12, 10, 8);
    /* hair */
    ctx.fillStyle = '#241b2b';
    ctx.fillRect(x - 5, y - 14, 10, 5);
    ctx.fillRect(x - 6, y - 11, 2, 3);
    ctx.fillRect(x + 4, y - 11, 1, 2);
    /* face */
    if (player.facing === 'up') {
      ctx.fillStyle = '#241b2b';
      ctx.fillRect(x - 5, y - 9, 10, 4);
    } else {
      const eyeX = player.facing === 'left' ? x - 3 : player.facing === 'right' ? x + 2 : x - 3;
      ctx.fillStyle = '#241b2b';
      ctx.fillRect(eyeX, y - 9, 1, 2);
      if (player.facing === 'down') ctx.fillRect(x + 2, y - 9, 1, 2);
      ctx.fillStyle = 'rgba(180,80,80,0.55)';
      ctx.fillRect(x - 2, y - 6, 3, 1);
    }
  }

  drawBattle(ctx, p) {
    ctx.fillStyle = 'rgba(4,3,8,0.58)';
    ctx.fillRect(0, 0, 480, 270);

    /* small NPC above the box */
    const bob = Math.sin(this.time * 2) * 1.5;
    this.drawNpc(ctx, p, 240, 128 + bob);

    /* battle box */
    ctx.fillStyle = 'rgba(5,4,10,0.95)';
    ctx.fillRect(BATTLE_BOX.x, BATTLE_BOX.y, BATTLE_BOX.w, BATTLE_BOX.h);
    ctx.strokeStyle = '#f4f1e8';
    ctx.lineWidth = 2;
    ctx.strokeRect(BATTLE_BOX.x + 1, BATTLE_BOX.y + 1, BATTLE_BOX.w - 2, BATTLE_BOX.h - 2);
    ctx.strokeStyle = 'rgba(169,139,255,0.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(BATTLE_BOX.x + 4.5, BATTLE_BOX.y + 4.5, BATTLE_BOX.w - 9, BATTLE_BOX.h - 9);

    /* projectiles */
    for (const star of this.projectiles) {
      const x = Math.round(star.x);
      const y = Math.round(star.y);
      ctx.fillStyle = star.color;
      ctx.fillRect(x - 2, y, 5, 1);
      ctx.fillRect(x, y - 2, 1, 5);
      ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(x, y, 1, 1);
    }

    /* soul */
    const sx = Math.round(this.soulX ?? 236);
    const sy = Math.round(this.soulY ?? 200);
    if (this.invuln <= 0 || Math.floor(this.time * 14) % 2 === 0) {
      ctx.fillStyle = this.soulColor;
      ctx.fillRect(sx - 4, sy - 3, 2, 2);
      ctx.fillRect(sx + 2, sy - 3, 2, 2);
      ctx.fillRect(sx - 5, sy - 1, 10, 3);
      ctx.fillRect(sx - 4, sy + 2, 8, 2);
      ctx.fillRect(sx - 2, sy + 4, 4, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(sx - 3, sy - 2, 1, 1);
    }
  }

  drawFlower(ctx, p, x, y, scale) {
    const sway = Math.sin(this.time * 1.2 + x) * 1.2;
    const cx = Math.round(x + sway);
    const h = Math.round(18 * scale);
    const glow = ctx.createRadialGradient(cx, y - h, 0, cx, y - h, 24 * scale);
    glow.addColorStop(0, 'rgba(255,215,94,0.22)');
    glow.addColorStop(1, 'rgba(255,215,94,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - 24 * scale, y - h - 24 * scale, 48 * scale, 48 * scale);
    ctx.fillStyle = '#4c7a3b';
    ctx.fillRect(cx, y - h, 1, h);
    ctx.fillRect(cx - Math.round(4 * scale), y - Math.round(h * 0.55), Math.round(4 * scale), 1);
    ctx.fillStyle = p.flower;
    ctx.fillRect(cx - Math.round(4 * scale), y - h - Math.round(2 * scale), Math.round(8 * scale), Math.round(4 * scale));
    ctx.fillRect(cx - Math.round(2 * scale), y - h - Math.round(4 * scale), Math.round(4 * scale), Math.round(8 * scale));
    ctx.fillStyle = p.flowerGlow;
    ctx.fillRect(cx - Math.round(2 * scale), y - h - Math.round(2 * scale), Math.round(3 * scale), Math.round(3 * scale));
  }

  clearLine() {
    if (this.dom.dialogueText) this.dom.dialogueText.textContent = '';
  }
}

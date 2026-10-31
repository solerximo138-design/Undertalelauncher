function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RuinsScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = 480;
    this.height = 270;
    canvas.width = this.width;
    canvas.height = this.height;
    this.ctx.imageSmoothingEnabled = false;

    this.running = false;
    this.last = 0;
    this.time = 0;
    this.motion = true;
    this.px = 0;
    this.py = 0;
    this.tx = 0;
    this.ty = 0;

    const rand = mulberry32(1337);
    this.dust = Array.from({ length: 34 }, () => ({
      x: rand() * this.width,
      y: rand() * this.height,
      speed: 3 + rand() * 9,
      drift: (rand() - 0.5) * 5,
      size: rand() > 0.72 ? 2 : 1,
      phase: rand() * Math.PI * 2,
      alpha: 0.18 + rand() * 0.42
    }));
    this.leaves = Array.from({ length: 13 }, () => ({
      x: rand() * this.width,
      y: 20 + rand() * 225,
      speed: 6 + rand() * 13,
      drift: (rand() - 0.5) * 6,
      size: 2 + Math.floor(rand() * 2),
      phase: rand() * Math.PI * 2,
      alpha: 0.35 + rand() * 0.45
    }));
    this.fireflies = Array.from({ length: 7 }, () => ({
      x: 250 + rand() * 210,
      y: 140 + rand() * 90,
      phase: rand() * Math.PI * 2,
      speed: 0.2 + rand() * 0.4,
      radius: 6 + rand() * 10
    }));

    this.onPointer = (event) => {
      if (!this.motion) return;
      this.tx = (event.clientX / window.innerWidth - 0.5) * 2;
      this.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    this.onLeave = () => { this.tx = 0; this.ty = 0; };
    this.onVisibility = () => {
      if (document.hidden) this.stop();
      else this.start();
    };
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('pointerleave', this.onLeave, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setMotion(motion) {
    this.motion = Boolean(motion);
    if (!this.motion) { this.tx = 0; this.ty = 0; this.px = 0; this.py = 0; }
    this.draw(this.time);
  }

  start() {
    if (this.running || !this.ctx) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.running = false;
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!document.hidden) {
      this.time += dt;
      this.update(dt);
      this.draw(this.time);
    }
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const ease = this.motion ? 1 - Math.pow(0.002, dt) : 1;
    this.px += (this.tx - this.px) * ease;
    this.py += (this.ty - this.py) * ease;
    if (!this.motion) return;
    for (const leaf of this.leaves) {
      leaf.x += (leaf.speed + Math.sin(this.time * 0.7 + leaf.phase) * 3) * dt;
      leaf.y += (leaf.drift + Math.cos(this.time * 0.5 + leaf.phase) * 3) * dt;
      if (leaf.x > this.width + 8) { leaf.x = -8; leaf.y = 20 + Math.random() * 225; }
      if (leaf.y > this.height + 8) leaf.y = -8;
      if (leaf.y < -8) leaf.y = this.height + 8;
    }
    for (const dot of this.dust) {
      dot.y -= dot.speed * dt;
      dot.x += Math.sin(this.time * 0.35 + dot.phase) * dot.drift * dt;
      if (dot.y < -4) { dot.y = this.height + 4; dot.x = Math.random() * this.width; }
      if (dot.x < -4) dot.x = this.width + 4;
      if (dot.x > this.width + 4) dot.x = -4;
    }
  }

  draw(time) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    const px = this.px * 4;
    const py = this.py * 2;
    ctx.imageSmoothingEnabled = false;

    /* sky */
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#07060d');
    sky.addColorStop(0.38, '#160d24');
    sky.addColorStop(0.72, '#1c1029');
    sky.addColorStop(1, '#08060d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    /* distant stars / dust in the dark */
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 26; i++) {
      const x = (i * 73 + 31) % w;
      const y = (i * 37 + 11) % 122;
      const flicker = 0.35 + 0.65 * Math.abs(Math.sin(time * 0.7 + i * 1.7));
      ctx.fillStyle = `rgba(196,173,255,${0.12 + flicker * 0.28})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.globalAlpha = 1;

    /* far arches */
    ctx.save();
    ctx.translate(px * 0.35, py * 0.3);
    this.arch(38, 30, 76, 158, '#160f23', '#241735');
    this.arch(188, 18, 104, 172, '#120c1d', '#2a1a3e');
    this.arch(346, 34, 82, 156, '#140e20', '#241735');
    ctx.restore();

    /* moon window */
    ctx.save();
    ctx.translate(px * 0.55, py * 0.4);
    const wx = 214;
    const wy = 38;
    const ww = 52;
    const wh = 84;
    ctx.fillStyle = '#0b0813';
    ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
    const moon = ctx.createLinearGradient(0, wy, 0, wy + wh);
    moon.addColorStop(0, 'rgba(210,193,255,0.34)');
    moon.addColorStop(0.55, 'rgba(136,106,196,0.16)');
    moon.addColorStop(1, 'rgba(72,49,115,0.03)');
    ctx.fillStyle = moon;
    ctx.fillRect(wx, wy, ww, wh);
    ctx.fillStyle = 'rgba(7,5,13,0.82)';
    for (let x = wx + 8; x < wx + ww; x += 10) ctx.fillRect(x, wy, 2, wh);
    for (let y = wy + 9; y < wy + wh; y += 14) ctx.fillRect(wx, y, ww, 2);
    ctx.fillStyle = 'rgba(188,160,255,0.12)';
    ctx.fillRect(wx + 9, wy + 10, 9, 5);
    ctx.fillRect(wx + 30, wy + 33, 8, 4);
    ctx.restore();

    /* moon shafts */
    const shaft = ctx.createLinearGradient(wx, wy, wx + 18, 240);
    shaft.addColorStop(0, 'rgba(190,164,255,0.075)');
    shaft.addColorStop(0.55, 'rgba(160,130,230,0.035)');
    shaft.addColorStop(1, 'rgba(160,130,230,0)');
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(wx + 2, wy + 6);
    ctx.lineTo(wx + ww - 2, wy + 6);
    ctx.lineTo(wx + ww + 54, 238);
    ctx.lineTo(wx - 34, 238);
    ctx.closePath();
    ctx.fill();

    /* back wall bricks */
    ctx.save();
    ctx.translate(px * 0.5, py * 0.45);
    this.brickWall(0, 46, w, 154, '#1c1028', '#241531');
    ctx.fillStyle = 'rgba(8,6,13,0.45)';
    ctx.fillRect(0, 46, w, 18);
    ctx.restore();

    /* columns */
    ctx.save();
    ctx.translate(px * 0.75, py * 0.55);
    this.column(56, 34, 202, 26);
    this.column(398, 42, 204, 24);
    this.column(132, 92, 202, 13, true);
    this.column(334, 92, 202, 13, true);
    ctx.restore();

    /* hanging vines */
    ctx.save();
    ctx.translate(px * 0.8, 0);
    ctx.fillStyle = 'rgba(63,46,85,0.8)';
    for (const [x, len] of [[22, 44], [30, 28], [151, 52], [161, 36], [372, 47], [383, 25], [452, 62]]) {
      ctx.fillRect(x, 0, 2, len);
      for (let y = 12; y < len; y += 13) {
        ctx.fillRect(x - 2, y, 2, 3);
        ctx.fillRect(x + 2, y + 6, 2, 3);
      }
    }
    ctx.restore();

    /* floor */
    const floor = ctx.createLinearGradient(0, 198, 0, h);
    floor.addColorStop(0, '#221428');
    floor.addColorStop(0.35, '#1a0f20');
    floor.addColorStop(1, '#07050b');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 198, w, h - 198);

    ctx.save();
    ctx.translate(px * 0.25, 0);
    ctx.strokeStyle = 'rgba(94,66,120,0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = i * 48;
      ctx.beginPath();
      ctx.moveTo(x, 198);
      ctx.lineTo(x - 26 + i * 5, h);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const y = 206 + i * 12;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(7,5,11,0.6)';
    for (let i = 0; i < 8; i++) {
      const x = (i * 59 + 17) % w;
      const y = 202 + ((i * 31) % 55);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8, y + 5);
      ctx.lineTo(x + 4, y + 9);
      ctx.stroke();
    }
    ctx.restore();

    /* rubble silhouettes at the bottom */
    ctx.fillStyle = '#0a0710';
    ctx.fillRect(0, 250, w, 20);
    ctx.fillRect(10, 244, 36, 8);
    ctx.fillRect(56, 247, 22, 5);
    ctx.fillRect(300, 246, 44, 6);
    ctx.fillRect(444, 242, 26, 10);

    /* glowing flowers */
    ctx.save();
    ctx.translate(px * 0.18, 0);
    this.flower(356, 224, 1.15, time);
    this.flower(382, 236, 0.85, time + 1.1);
    this.flower(338, 242, 0.7, time + 2.3);
    this.flower(414, 228, 0.65, time + 0.6);
    this.flower(103, 238, 0.55, time + 1.8);
    ctx.restore();

    /* dust motes */
    for (const dot of this.dust) {
      const flicker = 0.55 + 0.45 * Math.sin(time * 0.9 + dot.phase);
      ctx.fillStyle = `rgba(203,187,255,${dot.alpha * flicker})`;
      ctx.fillRect(Math.round(dot.x), Math.round(dot.y), dot.size, dot.size);
    }

    /* fireflies near flowers */
    for (const fly of this.fireflies) {
      const x = fly.x + Math.sin(time * fly.speed + fly.phase) * fly.radius;
      const y = fly.y + Math.cos(time * fly.speed * 0.8 + fly.phase) * (fly.radius * 0.5);
      const alpha = 0.35 + 0.35 * Math.sin(time * 1.4 + fly.phase);
      ctx.fillStyle = `rgba(255,215,94,${Math.max(0, alpha)})`;
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }

    /* leaves */
    for (const leaf of this.leaves) {
      const wobble = Math.sin(time * 1.3 + leaf.phase) * 2;
      ctx.fillStyle = `rgba(166,43,62,${leaf.alpha})`;
      ctx.fillRect(Math.round(leaf.x), Math.round(leaf.y + wobble), leaf.size, leaf.size);
      ctx.fillStyle = `rgba(224,81,94,${leaf.alpha * 0.55})`;
      ctx.fillRect(Math.round(leaf.x) + 1, Math.round(leaf.y + wobble) - 1, 1, 1);
    }

    /* darkness at the edges */
    const bottomFade = ctx.createLinearGradient(0, 226, 0, h);
    bottomFade.addColorStop(0, 'rgba(5,4,9,0)');
    bottomFade.addColorStop(1, 'rgba(5,4,9,0.88)');
    ctx.fillStyle = bottomFade;
    ctx.fillRect(0, 226, w, h - 226);
  }

  brickWall(x, y, w, h, base, line) {
    const ctx = this.ctx;
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = line;
    for (let row = 0; row < Math.ceil(h / 12); row++) {
      const by = y + row * 12;
      ctx.fillRect(x, by, w, 1);
      const offset = row % 2 === 0 ? 0 : 15;
      for (let bx = x - offset; bx < x + w; bx += 30) ctx.fillRect(bx, by, 1, 12);
    }
    ctx.fillStyle = 'rgba(9,6,15,0.3)';
    for (let row = 1; row < Math.ceil(h / 12); row += 2) {
      for (let bx = 0; bx < w; bx += 60) ctx.fillRect(x + bx + 7, y + row * 12 + 4, 12, 3);
    }
  }

  arch(x, y, w, h, base, edge) {
    const ctx = this.ctx;
    ctx.fillStyle = base;
    ctx.fillRect(x, y + 16, w, h - 16);
    ctx.fillStyle = edge;
    ctx.fillRect(x + 6, y + 10, w - 12, h - 10);
    ctx.fillStyle = base;
    ctx.fillRect(x + 13, y + 18, w - 26, h - 20);
    ctx.fillStyle = 'rgba(6,4,10,0.78)';
    ctx.fillRect(x + 17, y + 24, w - 34, h - 28);
    ctx.fillStyle = 'rgba(169,139,255,0.06)';
    ctx.fillRect(x + 17, y + 24, 2, h - 28);
  }

  column(x, y, bottom, w, small = false) {
    const ctx = this.ctx;
    ctx.fillStyle = '#120c1d';
    ctx.fillRect(x, y, w, bottom - y);
    ctx.fillStyle = '#2a1a3e';
    ctx.fillRect(x + 3, y, w - 6, bottom - y);
    ctx.fillStyle = '#1a1028';
    ctx.fillRect(x + 6, y + 4, 3, bottom - y - 8);
    ctx.fillStyle = '#362248';
    ctx.fillRect(x + 10, y + 4, 1, bottom - y - 9);
    if (!small) {
      ctx.fillStyle = '#3a2750';
      ctx.fillRect(x - 3, y, w + 6, 5);
      ctx.fillRect(x - 4, bottom - 5, w + 8, 5);
      ctx.fillStyle = '#150d20';
      ctx.fillRect(x - 3, y + 5, w + 6, 2);
    }
  }

  flower(x, y, scale, time) {
    const ctx = this.ctx;
    const sway = Math.sin(time * 1.1 + x) * 1.2;
    const h = 16 * scale;
    const stemX = Math.round(x + sway);
    const baseY = Math.round(y);
    const glow = ctx.createRadialGradient(stemX, baseY - h, 0, stemX, baseY - h, 22 * scale);
    glow.addColorStop(0, 'rgba(255,215,94,0.22)');
    glow.addColorStop(0.45, 'rgba(255,179,71,0.08)');
    glow.addColorStop(1, 'rgba(255,179,71,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(stemX - 24 * scale, baseY - h - 24 * scale, 48 * scale, 48 * scale);

    ctx.fillStyle = '#4c7a3b';
    ctx.fillRect(stemX, Math.round(baseY - h), 1, Math.round(h));
    ctx.fillRect(stemX - Math.round(4 * scale), Math.round(baseY - h * 0.55), Math.round(4 * scale), 1);
    ctx.fillStyle = '#3d6330';
    ctx.fillRect(stemX + 1, Math.round(baseY - h * 0.35), Math.round(3 * scale), 1);

    const cy = Math.round(baseY - h);
    const cx = stemX;
    ctx.fillStyle = '#ffcf5e';
    ctx.fillRect(cx - Math.round(4 * scale), cy - Math.round(2 * scale), Math.round(8 * scale), Math.round(4 * scale));
    ctx.fillRect(cx - Math.round(2 * scale), cy - Math.round(4 * scale), Math.round(4 * scale), Math.round(8 * scale));
    ctx.fillStyle = '#ffe89a';
    ctx.fillRect(cx - Math.round(2 * scale), cy - Math.round(2 * scale), Math.round(3 * scale), Math.round(3 * scale));
    ctx.fillStyle = '#b57a1c';
    ctx.fillRect(cx, cy, 1, 1);
  }
}

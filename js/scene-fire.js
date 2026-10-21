/* Golden Age Meadery — Hearth & Fire photo scene (realistic).
   Layers (all photographic): re-composed background (fireplace moved left) → real fire video masked
   into the firebox → candle flicker / smoke / sparks canvas → table with fruit (apples smaller) →
   the client's Hearth & Fire bottles with firelight wrap → spices in front → warm room light + grain.
   GAM.photoScenes.fire = { mount(frame, ctx) -> { destroy(), setPaused(bool) } } */
(function () {
  const GAM = (window.GAM = window.GAM || {});
  GAM.photoScenes = GAM.photoScenes || {};

  /* Composition data in base-image pixels (see scratch build scripts). */
  const SETS = {
    desk: {
      w: 1376, h: 768,
      bg: 'scene/hf-bg-desk.webp', fg: 'scene/hf-fg-desk.webp', bottles: 'scene/hf-bottles-desk.webp',
      front: 'scene/hf-front-desk.webp', mask: 'scene/hf-firemask-desk.png', video: 'hf-loop.webm',
      vid: { x: -308, y: -20, w: 960 * 1.44, h: 540 * 1.44 },
      bottlesBox: [465, 147, 311, 496], frontBox: [497, 575, 267, 79],
      candles: [{ x: 41, y: 118, wick: 130, r: 12 }, { x: 1231, y: 95, wick: 105, r: 10 }],
      fire: { x: 345, y: 205, rx: 230, ry: 190 }, spark: { x: 345, y: 300, spread: 120, rise: 300 },
      wrap: 'linear-gradient(100deg, rgba(255,150,70,.62) 0%, rgba(255,128,48,.22) 32%, rgba(255,110,40,0) 58%)',
    },
    mob: {
      w: 768, h: 1376,
      bg: 'scene/hf-bg-m.webp', fg: 'scene/hf-fg-m.webp', bottles: 'scene/hf-bottles-m.webp',
      front: 'scene/hf-front-m.webp', mask: 'scene/hf-firemask-m.png', video: 'hf-loop-m.webm',
      vid: { x: -130, y: 11, w: 960 * 0.79, h: 1706 * 0.79 },
      bottlesBox: [207, 537, 353, 565], frontBox: [202, 1064, 366, 227],
      candles: [{ x: 19, y: 452, wick: 466, r: 11 }],
      fire: { x: 350, y: 420, rx: 230, ry: 260 }, spark: { x: 350, y: 600, spread: 130, rise: 360 },
      wrap: 'linear-gradient(170deg, rgba(255,150,70,.55) 0%, rgba(255,128,48,.2) 30%, rgba(255,110,40,0) 55%)',
    },
  };

  /* small value-noise for organic flicker */
  function makeNoise(seed) {
    const p = new Float32Array(512);
    let s = seed || 1;
    for (let i = 0; i < 512; i++) { s = (s * 16807) % 2147483647; p[i] = (s / 2147483647) * 2 - 1; }
    return (t) => {
      const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
      return p[i & 511] * (1 - u) + p[(i + 1) & 511] * u;
    };
  }
  const n1 = makeNoise(7), n2 = makeNoise(91), n3 = makeNoise(313), n4 = makeNoise(4441);
  const fbm = (n, t) => n(t) * 0.6 + n(t * 2.3 + 17) * 0.28 + n(t * 5.1 + 41) * 0.12;

  function el(tag, css, parent) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (parent) parent.appendChild(e);
    return e;
  }
  const pct = (v, total) => (v / total) * 100 + '%';

  GAM.photoScenes.fire = {
    mount(frame, ctx) {
      const reduced = !!ctx.reducedMotion;
      let set = null, root = null, video = null, fx = null, g = null, wrapEl = null, roomEl = null, bgImg = null;
      let raf = 0, paused = false, visible = true, alive = true, last = performance.now(), t = 0;
      let W = 1, H = 1, dpr = 1, kx = 1, ky = 1;
      let intensity = 0.7, targetI = 0.7;
      const smoke = [], sparks = [];
      let nextBurst = 2.5 + Math.random() * 3;
      let sampleCv = null, sampleG = null, sampleT = 0;
      let soundPop = null;

      function choose() {
        const r = frame.getBoundingClientRect();
        return r.width < r.height ? SETS.mob : SETS.desk;
      }

      function build() {
        if (root) teardownLayers();
        set = choose();
        root = el('div', 'position:absolute;inset:0;overflow:hidden;background:#120a06;contain:strict', frame);
        root.className = 'hf-photo';
        const imgCss = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block;user-select:none;pointer-events:none';
        bgImg = el('img', imgCss, root); bgImg.alt = ''; bgImg.decoding = 'async'; bgImg.src = ctx.img(set.bg);
        // real fire: video masked into the fireplace opening
        const fire = el('div', 'position:absolute;inset:0;pointer-events:none;' +
          `-webkit-mask-image:url(${ctx.img(set.mask)});mask-image:url(${ctx.img(set.mask)});` +
          '-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat', root);
        if (!reduced) {
          video = el('video', `position:absolute;left:${pct(set.vid.x, set.w)};top:${pct(set.vid.y, set.h)};` +
            `width:${pct(set.vid.w, set.w)};height:${pct(set.vid.h, set.h)};object-fit:fill;filter:brightness(.93) saturate(1.04)`, fire);
          video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto';
          video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true');
          video.src = ctx.media(set.video);
          video.addEventListener('loadeddata', () => { try { video.playbackRate = 0.85; } catch (e) {} if (!paused && visible) video.play().catch(() => {}); });
        }
        // warm light from the fire breathing over the room (screen, very soft)
        roomEl = el('div', 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;opacity:.5;' +
          `background:radial-gradient(ellipse ${pct(set.fire.rx * 2.6, set.w)} ${pct(set.fire.ry * 2.4, set.h)} at ${pct(set.fire.x, set.w)} ${pct(set.fire.y, set.h)}, rgba(255,130,50,.16), rgba(255,110,40,.05) 45%, rgba(0,0,0,0) 70%)`, root);
        // candles, smoke, sparks (behind the table)
        fx = el('canvas', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none', root);
        g = fx.getContext('2d');
        el('img', imgCss, root).src = ctx.img(set.fg);
        // bottles + firelight wrap clipped to the bottle shapes
        const [bx, by, bw, bh] = set.bottlesBox;
        const bwrap = el('div', `position:absolute;left:${pct(bx, set.w)};top:${pct(by, set.h)};width:${pct(bw, set.w)};height:${pct(bh, set.h)};pointer-events:none`, root);
        const bimg = el('img', 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;filter:contrast(1.03) saturate(1.06)', bwrap);
        bimg.alt = ''; bimg.src = ctx.img(set.bottles);
        wrapEl = el('div', `position:absolute;inset:0;mix-blend-mode:screen;opacity:.6;background:${set.wrap};` +
          `-webkit-mask-image:url(${ctx.img(set.bottles)});mask-image:url(${ctx.img(set.bottles)});-webkit-mask-size:100% 100%;mask-size:100% 100%`, bwrap);
        const [fx0, fy0, fw, fh] = set.frontBox;
        const fimg = el('img', `position:absolute;left:${pct(fx0, set.w)};top:${pct(fy0, set.h)};width:${pct(fw, set.w)};height:${pct(fh, set.h)};object-fit:fill;pointer-events:none`, root);
        fimg.alt = ''; fimg.src = ctx.img(set.front);
        // vignette + fine grain to unify everything photographically
        el('div', 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 85% 80% at 45% 45%, rgba(0,0,0,0) 55%, rgba(8,4,2,.42) 100%)', root);
        const grain = el('div', 'position:absolute;inset:-20px;pointer-events:none;opacity:.07;mix-blend-mode:overlay;background-size:160px 160px', root);
        grain.style.backgroundImage = `url(${grainURL()})`;
        resize();
        if (reduced) drawStill();
      }

      let _grain = null;
      function grainURL() {
        if (_grain) return _grain;
        const c = document.createElement('canvas'); c.width = c.height = 160;
        const x = c.getContext('2d'); const id = x.createImageData(160, 160);
        for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 120; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
        x.putImageData(id, 0, 0); _grain = c.toDataURL('image/png'); return _grain;
      }

      function resize() {
        if (!fx) return;
        const r = frame.getBoundingClientRect();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = Math.max(1, r.width); H = Math.max(1, r.height);
        fx.width = Math.round(W * dpr); fx.height = Math.round(H * dpr);
        kx = W / set.w; ky = H / set.h;
      }

      /* ---------- candle: re-draw the real flame pixels with flicker + glow + smoke ---------- */
      function drawCandle(c, i, time, still) {
        if (!bgImg || !bgImg.complete || !bgImg.naturalWidth) return;
        const sxImg = bgImg.naturalWidth / set.w, syImg = bgImg.naturalHeight / set.h;
        const r = c.r;
        // flicker parameters (stronger than before, per the client)
        const f1 = still ? 0 : fbm(n1, time * 3.1 + i * 13), f2 = still ? 0 : fbm(n2, time * 4.7 + i * 7);
        const gust = still ? 0 : Math.max(0, fbm(n3, time * 0.6 + i * 3) - 0.35) * 1.6;
        const scaleY = 1 + f1 * 0.22 - gust * 0.25;
        const sway = f2 * 0.22 + (still ? 0 : fbm(n4, time * 1.3 + i) * 0.12);
        const bright = 1 + f1 * 0.25 - gust * 0.2;
        // patch around the flame (base px)
        const pw = r * 3.2, ph = r * 4.6;
        const px = c.x - pw / 2, py = c.wick - ph;
        g.save();
        g.translate(c.x * kx * dpr, c.wick * ky * dpr);
        g.transform(1, 0, -sway, scaleY, 0, 0); // skew from the wick, stretch upward
        g.globalAlpha = 0.95;
        // feathered draw: draw patch to a temp canvas with radial mask
        const tmp = drawCandle.tmp || (drawCandle.tmp = document.createElement('canvas'));
        const tw = Math.ceil(pw * kx * dpr), th = Math.ceil(ph * ky * dpr);
        if (tmp.width !== tw || tmp.height !== th) { tmp.width = tw; tmp.height = th; }
        const tg = tmp.getContext('2d');
        tg.globalCompositeOperation = 'source-over';
        tg.clearRect(0, 0, tw, th);
        tg.drawImage(bgImg, px * sxImg, py * syImg, pw * sxImg, ph * syImg, 0, 0, tw, th);
        tg.globalCompositeOperation = 'destination-in';
        const rg = tg.createRadialGradient(tw / 2, th * 0.7, 0, tw / 2, th * 0.7, Math.max(0.001, Math.max(tw, th) * 0.55));
        rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.55, 'rgba(0,0,0,.85)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        tg.fillStyle = rg; tg.fillRect(0, 0, tw, th);
        g.filter = `brightness(${bright.toFixed(3)})`;
        g.drawImage(tmp, -tw / 2, -th);
        g.filter = 'none';
        g.restore();
        // glow halo around the flame
        const gx = (c.x + sway * r * 1.2) * kx * dpr, gy = (c.wick - r * 1.4 * scaleY) * ky * dpr;
        const gr = r * 6.5 * Math.min(kx, ky) * dpr;
        g.save();
        g.globalCompositeOperation = 'lighter';
        const halo = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(0.001, gr));
        const a = 0.2 * bright;
        halo.addColorStop(0, `rgba(255,190,110,${a.toFixed(3)})`);
        halo.addColorStop(0.35, `rgba(255,140,60,${(a * 0.4).toFixed(3)})`);
        halo.addColorStop(1, 'rgba(255,120,40,0)');
        g.fillStyle = halo; g.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
        g.restore();
        // smoke: emit thin wisps from the flame tip
        if (!still && Math.random() < 0.55) {
          smoke.push({ x: c.x + sway * r, y: c.wick - r * 2.2 * scaleY, vx: (Math.random() - 0.5) * 2, vy: -(14 + Math.random() * 10), age: 0, life: 4 + Math.random() * 2.5, s: r * 0.16, seed: Math.random() * 100, c: i });
        }
      }

      function drawSmoke(dt) {
        g.save();
        g.globalCompositeOperation = 'screen';
        for (let i = smoke.length - 1; i >= 0; i--) {
          const p = smoke[i];
          p.age += dt;
          if (p.age > p.life) { smoke.splice(i, 1); continue; }
          const k = p.age / p.life;
          const curl = fbm(n4, p.seed + p.age * 0.9) * 22 + fbm(n2, p.seed * 1.7 + p.age * 2.1) * 6;
          p.x += (p.vx + curl * 0.6) * dt; p.y += p.vy * dt;
          p.vy *= 1 - 0.12 * dt;
          const size = (p.s + k * 3.2) * Math.min(kx, ky) * dpr;
          const alpha = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.09;
          const x = p.x * kx * dpr, y = p.y * ky * dpr;
          const grd = g.createRadialGradient(x, y, 0, x, y, Math.max(0.001, size * 3));
          grd.addColorStop(0, `rgba(205,195,185,${alpha.toFixed(3)})`);
          grd.addColorStop(1, 'rgba(205,195,185,0)');
          g.fillStyle = grd;
          g.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
        }
        g.restore();
        if (smoke.length > 220) smoke.splice(0, smoke.length - 220);
      }

      /* ---------- sparks from the fire ---------- */
      function emitSpark(burst) {
        const s = set.spark;
        sparks.push({
          x: s.x + (Math.random() - 0.5) * s.spread * (burst ? 0.6 : 1), y: s.y - Math.random() * 40,
          vx: (Math.random() - 0.5) * (burst ? 90 : 40), vy: -(burst ? 150 + Math.random() * 160 : 70 + Math.random() * 90),
          age: 0, life: burst ? 1.1 + Math.random() * 1.2 : 1.4 + Math.random() * 1.6, size: 0.8 + Math.random() * (burst ? 1.6 : 1.1), seed: Math.random() * 100,
        });
      }
      function drawSparks(dt) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (let i = sparks.length - 1; i >= 0; i--) {
          const p = sparks[i];
          p.age += dt;
          if (p.age > p.life) { sparks.splice(i, 1); continue; }
          const k = p.age / p.life;
          p.vx += fbm(n1, p.seed + p.age * 3) * 160 * dt;
          p.vy += 40 * dt; // slows as it rises
          p.x += p.vx * dt; p.y += p.vy * dt;
          const fl = 0.6 + 0.4 * Math.abs(n3(p.seed + p.age * 18));
          const a = (1 - k) * fl;
          const x = p.x * kx * dpr, y = p.y * ky * dpr, rr = p.size * Math.min(kx, ky) * dpr * 1.6;
          const grd = g.createRadialGradient(x, y, 0, x, y, Math.max(0.001, rr * 4));
          grd.addColorStop(0, `rgba(255,236,170,${a.toFixed(3)})`);
          grd.addColorStop(0.25, `rgba(255,160,60,${(a * 0.6).toFixed(3)})`);
          grd.addColorStop(1, 'rgba(255,90,20,0)');
          g.fillStyle = grd;
          g.fillRect(x - rr * 4, y - rr * 4, rr * 8, rr * 8);
        }
        g.restore();
      }

      /* ---------- fire brightness from the real video (drives all the warm light) ---------- */
      function sampleFire(now) {
        if (!video || video.readyState < 2 || now - sampleT < 110) return;
        sampleT = now;
        try {
          if (!sampleCv) { sampleCv = document.createElement('canvas'); sampleCv.width = 24; sampleCv.height = 14; sampleG = sampleCv.getContext('2d', { willReadFrequently: true }); }
          sampleG.drawImage(video, 0, 0, 24, 14);
          const d = sampleG.getImageData(4, 0, 14, 8).data;
          let s = 0;
          for (let i = 0; i < d.length; i += 4) s += d[i] * 0.5 + d[i + 1] * 0.4 + d[i + 2] * 0.1;
          targetI = Math.min(1, Math.max(0.3, (s / (d.length / 4)) / 120));
        } catch (e) { sampleT = now + 1e9; }
      }

      function frameStep(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
        sampleFire(now);
        if (sampleT > 1e12 || !video) targetI = 0.65 + fbm(n1, t * 1.7) * 0.25;
        intensity += (targetI - intensity) * Math.min(1, dt * 6);
        const flick = intensity + fbm(n2, t * 7) * 0.05;
        if (wrapEl) wrapEl.style.opacity = (0.38 + flick * 0.42).toFixed(3);
        if (roomEl) roomEl.style.opacity = (0.32 + flick * 0.4).toFixed(3);
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, fx.width, fx.height);
        set.candles.forEach((c, i) => drawCandle(c, i, t, false));
        drawSmoke(dt);
        // trickle of sparks + occasional bursts with a pop
        if (Math.random() < dt * 2.2) emitSpark(false);
        nextBurst -= dt;
        if (nextBurst <= 0) {
          nextBurst = 3.5 + Math.random() * 5;
          const n = 6 + Math.floor(Math.random() * 9);
          for (let i = 0; i < n; i++) emitSpark(true);
          if (soundPop) soundPop();
        }
        drawSparks(dt);
      }

      function drawStill() {
        if (!fx) return;
        const go = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, fx.width, fx.height); set.candles.forEach((c, i) => drawCandle(c, i, 0, true)); };
        if (bgImg.complete) go(); else bgImg.addEventListener('load', go, { once: true });
      }

      function loop(now) {
        if (!alive) return;
        raf = 0;
        if (paused || !visible || document.hidden) { last = now; return; }
        frameStep(now);
        raf = requestAnimationFrame(loop);
      }
      function start() { if (!raf && !reduced && alive && !paused && visible && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); } }
      function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
      function syncVideo() {
        if (!video) return;
        if (paused || !visible || document.hidden) video.pause(); else video.play().catch(() => {});
      }

      function teardownLayers() {
        if (video) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {} video = null; }
        if (root) root.remove();
        root = fx = g = wrapEl = roomEl = bgImg = null;
        smoke.length = 0; sparks.length = 0;
      }

      build();
      start();

      let lastKind = set;
      const ro = new ResizeObserver(() => {
        const s = choose();
        if (s !== lastKind) { lastKind = s; build(); syncVideo(); } else resize();
        if (reduced) drawStill();
      });
      ro.observe(frame);
      const io = new IntersectionObserver((ents) => {
        visible = ents.some((e) => e.isIntersecting);
        syncVideo();
        if (visible) start(); else stop();
      });
      io.observe(frame);
      const onVis = () => { syncVideo(); if (!document.hidden) start(); };
      document.addEventListener('visibilitychange', onVis);

      /* ---------- sound: crackle, low roar, pops with spark bursts ---------- */
      ctx.onSound((ac, out) => {
        const nodes = [];
        const roar = ac.createBufferSource(); roar.buffer = GAM.noiseBuffer(ac, 'brown', 6); roar.loop = true;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
        const rg = ac.createGain(); rg.gain.value = 0.32;
        roar.connect(lp).connect(rg).connect(out); roar.start(); nodes.push(roar, lp, rg);
        const lfo = ac.createOscillator(); lfo.frequency.value = 0.23; const lg = ac.createGain(); lg.gain.value = 0.12;
        lfo.connect(lg).connect(rg.gain); lfo.start(); nodes.push(lfo, lg);
        const hiss = ac.createBufferSource(); hiss.buffer = GAM.noiseBuffer(ac, 'pink', 5); hiss.loop = true;
        const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
        const hg = ac.createGain(); hg.gain.value = 0.025;
        hiss.connect(hp).connect(hg).connect(out); hiss.start(); nodes.push(hiss, hp, hg);
        const white = GAM.noiseBuffer(ac, 'white', 1);
        function crack(vol, len, freq) {
          const s = ac.createBufferSource(); s.buffer = white;
          const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 0.9;
          const gg = ac.createGain(); const t0 = ac.currentTime;
          gg.gain.setValueAtTime(vol, t0); gg.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
          s.connect(bp).connect(gg).connect(out); s.start(t0, Math.random() * 0.8, len + 0.02);
        }
        let timer = 0, dead = false;
        (function tick() {
          if (dead) return;
          if (!paused && visible) {
            const n = Math.random() < 0.3 ? 2 + Math.floor(Math.random() * 3) : 1;
            for (let i = 0; i < n; i++) setTimeout(() => !dead && crack(0.05 + Math.random() * 0.14, 0.012 + Math.random() * 0.03, 1500 + Math.random() * 3500), i * (15 + Math.random() * 40));
          }
          timer = setTimeout(tick, 60 + Math.random() * 420);
        })();
        soundPop = () => { crack(0.35, 0.06, 900 + Math.random() * 600); setTimeout(() => !dead && crack(0.18, 0.03, 2600), 40); };
        return () => {
          dead = true; clearTimeout(timer); soundPop = null;
          nodes.forEach((n) => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
        };
      });

      return {
        setPaused(p) {
          paused = !!p;
          syncVideo();
          if (paused) stop(); else start();
        },
        destroy() {
          alive = false;
          stop();
          ro.disconnect(); io.disconnect();
          document.removeEventListener('visibilitychange', onVis);
          teardownLayers();
          frame.replaceChildren();
        },
      };
    },
  };
})();

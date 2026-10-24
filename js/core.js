/* Golden Age Meadery — shared core: namespace, audio manager, scene context.
   Photo-scene contract (realistic rebuild):
     GAM.photoScenes['fire'|'garden'|'library'] = { mount(frame, ctx) -> { destroy(), setPaused(bool) } }
   - `frame` is the .mead-setting element (16:9 on desktop, 9:16 at <=760px, overflow hidden).
   - Draw ONLY inside `frame`. Never append to document.body, never position:fixed, no global listeners left.
   - Register every rAF / listener / timer / video teardown in destroy() (or ctx.addCleanup).
*/
(function () {
  const GAM = (window.GAM = window.GAM || {});
  GAM.scenes = GAM.scenes || {};
  GAM.photoScenes = GAM.photoScenes || {};
  GAM.mediaBase = GAM.mediaBase || 'media/';
  GAM.base = GAM.base || 'img/';
  GAM.reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Audio manager (one AudioContext for the whole site) ---------- */
  const audio = (GAM.audio = {
    ac: null,
    out: null,
    enabled: false,
    listeners: new Set(),
    ensure() {
      if (this.ac) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ac = new AC();
      this.out = this.ac.createGain();
      this.out.gain.value = 0;
      // gentle master compression so crackles never clip
      const comp = this.ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
      this.out.connect(comp); comp.connect(this.ac.destination);
      return true;
    },
    enable() {
      if (!this.ensure()) return false;
      try { this.ac.resume(); } catch (e) {}
      this.enabled = true;
      this.out.gain.cancelScheduledValues(this.ac.currentTime);
      this.out.gain.setTargetAtTime(0.9, this.ac.currentTime, 0.4);
      this.listeners.forEach((f) => f(true));
      try { localStorage.setItem('gam-sound', '1'); } catch (e) {}
      return true;
    },
    disable() {
      this.enabled = false;
      if (this.ac) {
        this.out.gain.cancelScheduledValues(this.ac.currentTime);
        this.out.gain.setTargetAtTime(0, this.ac.currentTime, 0.12);
      }
      this.listeners.forEach((f) => f(false));
      try { localStorage.setItem('gam-sound', '0'); } catch (e) {}
    },
    toggle() { if (this.enabled) { this.disable(); return false; } return this.enable(); },
    subscribe(f) { this.listeners.add(f); return () => this.listeners.delete(f); },
  });

  /* Shared noise buffers so scenes don't each allocate seconds of audio */
  GAM.noiseBuffer = function (ac, kind, seconds) {
    const key = '_nb_' + kind + seconds;
    if (ac[key]) return ac[key];
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      } else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5;
      } else d[i] = w;
    }
    ac[key] = buf;
    return buf;
  };

  /* Shared fire ambience (client 24 Oct): the Ancient Lore fire, used on both fire pages, kept quiet in the background.
     A low simmer, soft pops and small crackles. Returns a cleanup fn. */
  GAM.fireAmbience = function (ac, out, level) {
    const timers = [];
    let stopped = false;
    const bus = ac.createGain(); bus.gain.value = level == null ? 0.55 : level; bus.connect(out);
    const rum = ac.createBufferSource(); rum.buffer = GAM.noiseBuffer(ac, 'brown', 6); rum.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const rg = ac.createGain(); rg.gain.value = 0.09;
    rum.connect(lp).connect(rg).connect(bus); rum.start();
    const pop = () => {
      if (stopped) return;
      const t = ac.currentTime + 0.01;
      const o = ac.createOscillator(); o.type = 'sine';
      const f0 = 180 + Math.random() * 220;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (1.6 + Math.random() * 0.8), t + 0.07);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.04, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + 0.15);
      timers.push(setTimeout(pop, 120 + Math.random() * (Math.random() < 0.2 ? 900 : 380)));
    };
    const crackle = () => {
      if (stopped) return;
      const t = ac.currentTime + 0.01;
      const s = ac.createBufferSource(); s.buffer = GAM.noiseBuffer(ac, 'white', 2);
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800 + Math.random() * 2000;
      const g = ac.createGain(); const d = 0.01 + Math.random() * 0.025;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.04, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(hp).connect(g).connect(bus); s.start(t, Math.random()); s.stop(t + d + 0.02);
      timers.push(setTimeout(crackle, 180 + Math.random() * 1100));
    };
    pop(); crackle();
    return () => {
      stopped = true; timers.forEach(clearTimeout);
      try { rum.stop(); } catch (e) {}
      try { bus.disconnect(); } catch (e) {}
    };
  };

  /* Light birdsong for the garden (client 24 Oct): a few birds singing softly at different distances. */
  GAM.birdsong = function (ac, out, level) {
    const timers = [];
    let stopped = false;
    const bus = ac.createGain(); bus.gain.value = level == null ? 0.5 : level; bus.connect(out);
    // a little open-air space: soft, short echo off the garden walls
    const dl = ac.createDelay(1); dl.delayTime.value = 0.13;
    const fb = ac.createGain(); fb.gain.value = 0.22;
    const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3800;
    const wet = ac.createGain(); wet.gain.value = 0.2;
    dl.connect(dlp).connect(fb).connect(dl); dlp.connect(wet).connect(bus);
    const R = (a, b) => a + Math.random() * (b - a);
    const later = (fn, ms) => timers.push(setTimeout(() => { if (!stopped) fn(); }, ms));
    function voice(pan, gain, tone) {
      let dest = bus;
      try { const p = ac.createStereoPanner(); p.pan.value = pan; p.connect(bus); dest = p; } catch (e) {}
      const g = ac.createGain(); g.gain.value = gain; g.connect(dest);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = tone; lp.connect(g);
      lp.connect(dl);
      return lp;
    }
    // one note: a sine glide with a soft attack and a quiet second harmonic
    function note(dest, t, dur, f0, f1, amp) {
      const o = ac.createOscillator(); o.type = 'sine';
      const o2 = ac.createOscillator(); o2.type = 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      o2.frequency.setValueAtTime(f0 * 2, t); o2.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur);
      const g = ac.createGain(); const g2 = ac.createGain(); g2.gain.value = 0.07;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + Math.min(0.012, dur * 0.3));
      g.gain.setValueAtTime(amp, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); o2.connect(g2).connect(g); g.connect(dest);
      o.start(t); o2.start(t); o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02);
    }
    // warbler nearby: a varied run of short sweeping notes
    const vA = voice(-0.25, 0.9, 7000);
    function warble() {
      let t = ac.currentTime + 0.05;
      const n = 4 + ((Math.random() * 6) | 0);
      let base = R(2400, 3400);
      for (let i = 0; i < n; i++) {
        const d = R(0.05, 0.14);
        const up = Math.random() < 0.5;
        const f0 = base * R(0.9, 1.15), f1 = f0 * (up ? R(1.15, 1.5) : R(0.65, 0.88));
        note(vA, t, d, f0, f1, R(0.05, 0.09));
        t += d + R(0.03, 0.09);
        base *= R(0.94, 1.06);
      }
      later(warble, R(4500, 9500));
    }
    // a whistled two-note call further away
    const vB = voice(0.55, 0.55, 5500);
    function whistle() {
      const t = ac.currentTime + 0.05;
      const f = R(3300, 4000);
      note(vB, t, R(0.28, 0.38), f, f * 0.97, 0.06);
      note(vB, t + R(0.42, 0.5), R(0.3, 0.4), f * R(0.8, 0.86), f * R(0.78, 0.84), 0.055);
      later(whistle, R(7000, 14000));
    }
    // a small trill in the far trees
    const vC = voice(-0.65, 0.4, 6500);
    function trill() {
      let t = ac.currentTime + 0.05;
      const n = 10 + ((Math.random() * 14) | 0);
      let f = R(4300, 5200);
      for (let i = 0; i < n; i++) { note(vC, t, 0.03, f, f * 0.78, 0.04); t += R(0.045, 0.06); f *= 0.995; }
      later(trill, R(9000, 17000));
    }
    // occasional single chirps from anywhere
    const vD = voice(0.2, 0.35, 8000);
    function chirp() {
      const t = ac.currentTime + 0.03;
      const f = R(4800, 6500);
      note(vD, t, R(0.04, 0.07), f, f * R(0.7, 0.85), 0.05);
      if (Math.random() < 0.4) note(vD, t + R(0.1, 0.16), R(0.04, 0.07), f * 1.05, f * 0.8, 0.04);
      later(chirp, R(1500, 4500));
    }
    later(warble, 300); later(whistle, 2600); later(trill, 5200); later(chirp, 1200);
    return () => {
      stopped = true; timers.forEach(clearTimeout);
      try { bus.disconnect(); } catch (e) {}
      try { dl.disconnect(); } catch (e) {}
    };
  };

  /* ---------- Scene context ---------- */
  GAM.makeContext = function (stage) {
    const cleanups = [];
    const soundBuilders = []; // {fn, cleanup}
    let bus = null;
    let destroyed = false;

    function getBus() {
      if (!audio.ac) return null;
      if (!bus) {
        bus = audio.ac.createGain();
        bus.gain.value = 0;
        bus.connect(audio.out);
        bus.gain.setTargetAtTime(1, audio.ac.currentTime, 0.5);
      }
      return bus;
    }
    function runBuilders() {
      if (destroyed || !audio.enabled || !audio.ac) return;
      const b = getBus();
      soundBuilders.forEach((s) => {
        if (s.started) return;
        s.started = true;
        try { s.cleanup = s.fn(audio.ac, b) || null; } catch (e) { console.warn('sound', e); }
      });
    }
    const unsub = audio.subscribe((on) => { if (on) runBuilders(); });

    const ctx = {
      stage,
      base: GAM.base,
      reducedMotion: GAM.reducedMotion,
      img: (name) => GAM.base + name + (window.GAM_BUILD ? '?v=' + window.GAM_BUILD : ''),
      media: (name) => GAM.mediaBase + name + (window.GAM_BUILD ? '?v=' + window.GAM_BUILD : ''),
      /** Register an ambient sound graph. fn(ac, out) builds nodes into `out` and returns a cleanup fn.
          Called immediately if sound is on, otherwise the first time the visitor turns sound on. */
      onSound(fn) { soundBuilders.push({ fn, started: false, cleanup: null }); runBuilders(); },
      /** Fire a one-shot sound now if sound is on. fn(ac, out). */
      sfx(fn) { if (!destroyed && audio.enabled && audio.ac) { try { fn(audio.ac, getBus()); } catch (e) {} } },
      get soundOn() { return audio.enabled; },
      addCleanup(fn) { cleanups.push(fn); },
      get destroyed() { return destroyed; },
      /** Called by the shell after scene.destroy(). Fades this scene's audio and runs cleanups. */
      _teardown() {
        destroyed = true;
        unsub();
        cleanups.splice(0).forEach((f) => { try { f(); } catch (e) {} });
        const b = bus;
        const ac = audio.ac;
        if (b && ac) {
          b.gain.cancelScheduledValues(ac.currentTime);
          b.gain.setTargetAtTime(0, ac.currentTime, 0.12);
          setTimeout(() => {
            soundBuilders.forEach((s) => { try { s.cleanup && s.cleanup(); } catch (e) {} });
            try { b.disconnect(); } catch (e) {}
          }, 700);
        } else {
          soundBuilders.forEach((s) => { try { s.cleanup && s.cleanup(); } catch (e) {} });
        }
      },
    };
    return ctx;
  };

  /* Utility: release a WebGL context's GPU memory on teardown */
  GAM.loseGL = function (gl) {
    try { const ext = gl && gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext(); } catch (e) {}
  };

  /* Utility: device-pixel-ratio capped for performance */
  GAM.dpr = function (cap) { return Math.min(window.devicePixelRatio || 1, cap || 2); };
})();

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
      img: (name) => GAM.base + name,
      media: (name) => GAM.mediaBase + name,
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

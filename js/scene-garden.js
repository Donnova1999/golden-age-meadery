/* Golden Age Meadery — Midnight Dream: the photoreal spring-garden scene.
   GAM.photoScenes.garden = { mount(frame, ctx) -> { destroy(), setPaused(bool) } }

   Layers inside the .mead-setting frame:
   1. <img> the baked photo (bottles composited in Python with shadows + glass-top reflection) — also the still/fallback.
   2. WebGL canvas: the same photo with motion applied to its real pixels —
        • top-right vines, leaves and flowers sway in the breeze (displacement, anchored where they hang/grow),
        • fountain water runs (flow-map animation on the water columns only) and the basin surface ripples,
        • the bottom-left flowers have no motion at all.
   3. 2D canvas: a few big real rose petals (cut from the photo) tumbling all the way down past the bottom edge.
*/
(function () {
  const GAM = (window.GAM = window.GAM || {});
  GAM.photoScenes = GAM.photoScenes || {};

  const COMP = {
    d: { base: 'scene/md-base.webp', mask: 'scene/md-mask.png', w: 1376, h: 768, amp: 7.5 },
    m: { base: 'scene/md-base-m.webp', mask: 'scene/md-mask-m.png', w: 768, h: 1376, amp: 6.5 },
  };
  // content rects of each petal in md-petals.webp (x, y, w, h)
  const PETALS = [[18, 4, 283, 192], [346, 4, 267, 192], [661, 4, 278, 192], [978, 4, 283, 192], [1301, 4, 278, 192]];

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const FS = [
    'precision highp float;',
    'varying vec2 v;',
    'uniform sampler2D uImg,uMask;',
    'uniform vec2 uSize;',       // image size in px
    'uniform vec4 uCrop;',       // uv offset.xy, uv scale.zw (cover crop)
    'uniform float uT,uGust,uAmp;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'void main(){',
    ' vec2 uv=uCrop.xy+v*uCrop.zw;',
    ' vec3 m=texture2D(uMask,uv).rgb;',
    ' vec2 px=1./uSize;',
    // breeze: low-frequency spatial phase so motion travels through the foliage like wind
    ' float ph=n(uv*vec2(4.,3.2))*6.2831+uv.y*2.4-uv.x*1.3;',
    ' float t=uT;',
    ' float s=sin(t*1.05+ph)*.52+sin(t*1.83+ph*1.62)*.27+sin(t*.43+ph*.71)*.38+sin(t*3.1+ph*2.3)*.07*uGust;',
    ' float a=m.r*uAmp*(.5+.95*uGust);',
    ' vec2 d=vec2(s+.35*uGust, .24*cos(t*1.52+ph*1.27))*a*px;',
    ' vec2 q=uv-d;',
    ' vec3 c=texture2D(uImg,q).rgb;',
    // fountain streams: two-phase flow along +y (content moves down), with a glint that rides the water
    ' if(m.g>.004){',
    '  float r=t*2.6; float f1=fract(r), f2=fract(r+.5); float L=26.*px.y;',
    '  vec3 a1=texture2D(uImg,q-vec2(0.,f1*L)).rgb, a2=texture2D(uImg,q-vec2(0.,f2*L)).rgb;',
    '  vec3 fl=mix(a1,a2,abs(2.*f1-1.));',
    '  float g=n(vec2(q.x*uSize.x*.55,q.y*uSize.y*.09-t*11.));',
    '  fl*=1.+.28*smoothstep(.62,.98,g);',
    '  c=mix(c,fl,clamp(m.g*1.05,0.,1.));',
    ' }',
    // basin surface: small travelling ripples and shimmer
    ' if(m.b>.004){',
    '  float w=sin(q.y*uSize.y*.85-t*2.7+q.x*uSize.x*.045)*.6+sin(q.x*uSize.x*.11+t*1.9)*.4;',
    '  vec3 rc=texture2D(uImg,q+vec2(w*1.4,w*.5)*px).rgb;',
    '  rc*=1.+.07*w;',
    '  c=mix(c,rc,m.b);',
    ' }',
    ' gl_FragColor=vec4(c,1.);',
    '}',
  ].join('\n');

  function loadImg(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      i.decoding = 'async';
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  GAM.photoScenes.garden = {
    mount(frame, ctx) {
      const reduced = !!ctx.reducedMotion;
      let comp = null, W = 1, H = 1, raf = 0, alive = true, paused = false, hidden = document.hidden;
      let simT = 0, last = performance.now();
      let gust = 0.2, nextGust = rnd(3, 6), gustStart = -100, gustPeak = 0.9;
      const cache = {}; // per composition: { base, mask, texBase, texMask }

      frame.style.background = '#e9e2d8';
      const still = document.createElement('img');
      still.alt = '';
      still.setAttribute('aria-hidden', 'true');
      still.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;';
      const glc = document.createElement('canvas');
      glc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .5s ease;';
      const pc = document.createElement('canvas');
      pc.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
      pc.setAttribute('aria-hidden', 'true');
      glc.setAttribute('aria-hidden', 'true');
      frame.append(still, glc, pc);

      /* ---------- WebGL ---------- */
      let gl = null, prog = null, U = {};
      if (!reduced) {
        try {
          gl = glc.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
        } catch (e) { gl = null; }
      }
      if (gl) {
        const sh = (type, src) => {
          const s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
          return s;
        };
        try {
          prog = gl.createProgram();
          gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
          gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
          gl.linkProgram(prog);
          gl.useProgram(prog);
          const b = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, b);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
          const loc = gl.getAttribLocation(prog, 'p');
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          ['uImg', 'uMask', 'uSize', 'uCrop', 'uT', 'uGust', 'uAmp'].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
          gl.uniform1i(U.uImg, 0);
          gl.uniform1i(U.uMask, 1);
        } catch (e) {
          console.warn('garden scene: WebGL unavailable', e);
          GAM.loseGL(gl);
          gl = null;
        }
      }
      function tex(img) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      }
      function ensure(key) {
        if (cache[key]) return cache[key].ready;
        const c = (cache[key] = {});
        const C = COMP[key];
        c.ready = Promise.all([loadImg(ctx.img(C.base)), gl ? loadImg(ctx.img(C.mask)) : Promise.resolve(null)]).then(([b, m]) => {
          if (!alive) return c;
          c.base = b;
          c.mask = m;
          if (gl && m) {
            c.texBase = tex(b);
            c.texMask = tex(m);
          }
          return c;
        });
        return c.ready;
      }

      /* ---------- cover crop ---------- */
      let crop = [0, 0, 1, 1];
      function computeCrop() {
        const C = COMP[comp];
        const fa = W / H, ia = C.w / C.h;
        if (fa > ia) { const sy = ia / fa; crop = [0, (1 - sy) / 2, 1, sy]; }
        else { const sx = fa / ia; crop = [(1 - sx) / 2, 0, sx, 1]; }
      }

      /* ---------- petals ---------- */
      const pctx = pc.getContext('2d');
      let sheet = null;
      const petals = [];
      loadImg(ctx.img('scene/md-petals.webp')).then((i) => { sheet = i; }).catch(() => {});
      function spawn(p, initial) {
        const mob = comp === 'm';
        const base = mob ? W * rnd(0.11, 0.15) : W * rnd(0.04, 0.056);
        p.size = base;
        p.near = Math.random() < 0.18;
        if (p.near) p.size *= 1.35;
        p.x = rnd(-0.08, 0.92) * W;
        p.y = initial ? rnd(-0.35, 0.85) * H : -p.size * rnd(1.2, 3.5);
        p.vy = (H / rnd(9.5, 14)) * (p.near ? 1.25 : 1);
        p.drift = rnd(8, 22) * (W / 1440) * (mob ? 1.8 : 1);
        p.wobA = rnd(14, 34) * (W / 1440) * (mob ? 1.6 : 1);
        p.wobF = rnd(0.35, 0.8);
        p.ph = rnd(0, 6.28);
        p.rot = rnd(0, 6.28);
        p.spin = rnd(-0.9, 0.9);
        p.flip = rnd(0, 6.28);
        p.flipV = rnd(0.45, 1.1) * (Math.random() < 0.5 ? -1 : 1);
        p.tilt = rnd(0, 6.28);
        p.spr = (Math.random() * PETALS.length) | 0;
      }
      function initPetals() {
        petals.length = 0;
        if (reduced) return;
        const n = comp === 'm' ? 5 : 6;
        for (let i = 0; i < n; i++) { const p = {}; spawn(p, true); petals.push(p); }
      }
      function drawPetals(dt, t) {
        const dpr = pc.width / W;
        pctx.setTransform(1, 0, 0, 1, 0, 0);
        pctx.clearRect(0, 0, pc.width, pc.height);
        if (!sheet) return;
        const wind = 0.6 + gust * 1.4;
        for (const p of petals) {
          p.y += p.vy * dt * (0.9 + gust * 0.25);
          p.x += (p.drift * wind + Math.sin(t * p.wobF + p.ph) * p.wobA) * dt;
          p.rot += p.spin * dt * (0.7 + gust);
          p.flip += p.flipV * dt;
          p.tilt += dt * 0.8;
          if (p.y - p.size > H) spawn(p, false); // only after it has left the bottom edge
          const r = PETALS[p.spr];
          const w = p.size, h = (p.size * r[3]) / r[2];
          let sx = Math.cos(p.flip);
          sx = Math.sign(sx || 1) * Math.max(0.58, Math.abs(sx)); // always broad: no sliver-sized petals
          const sy = 0.84 + 0.16 * Math.cos(p.tilt);
          pctx.setTransform(dpr, 0, 0, dpr, p.x * dpr, p.y * dpr);
          pctx.rotate(p.rot);
          pctx.scale(sx, sy);
          pctx.globalAlpha = sx < 0 ? 0.9 : 0.97;
          if (p.near) pctx.filter = 'blur(0.8px)';
          pctx.drawImage(sheet, r[0], r[1], r[2], r[3], -w / 2, -h / 2, w, h);
          if (p.near) pctx.filter = 'none';
        }
        pctx.globalAlpha = 1;
      }

      /* ---------- layout ---------- */
      let ready = false;
      function layout() {
        const r = frame.getBoundingClientRect();
        W = Math.max(1, r.width);
        H = Math.max(1, r.height);
        const key = W < H ? 'm' : 'd';
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        pc.width = Math.round(W * dpr);
        pc.height = Math.round(H * dpr);
        if (key !== comp) {
          comp = key;
          ready = false;
          still.src = ctx.img(COMP[key].base);
          glc.style.opacity = '0';
          initPetals();
          ensure(key).then((c) => {
            if (!alive || comp !== key) return;
            ready = true;
            if (gl && c.texBase) {
              gl.activeTexture(gl.TEXTURE0);
              gl.bindTexture(gl.TEXTURE_2D, c.texBase);
              gl.activeTexture(gl.TEXTURE1);
              gl.bindTexture(gl.TEXTURE_2D, c.texMask);
              gl.uniform2f(U.uSize, COMP[key].w, COMP[key].h);
              gl.uniform1f(U.uAmp, COMP[key].amp);
              draw(simT);
              glc.style.opacity = '1';
            }
          }).catch((e) => console.warn('garden scene: image load failed', e));
        }
        computeCrop();
        if (gl) {
          const C = COMP[comp];
          const maxW = C.w * 1.35;
          const cw = Math.round(Math.min(W * dpr, maxW));
          glc.width = cw;
          glc.height = Math.round((cw * H) / W);
          gl.viewport(0, 0, glc.width, glc.height);
          if (ready) draw(simT);
        }
      }

      function draw(t) {
        if (!gl || !ready) return;
        gl.uniform4f(U.uCrop, crop[0], crop[1], crop[2], crop[3]);
        gl.uniform1f(U.uT, t);
        gl.uniform1f(U.uGust, gust);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      function updateGust(t) {
        if (t > nextGust) {
          gustStart = t;
          gustPeak = rnd(0.7, 1.0);
          nextGust = t + rnd(6, 12);
        }
        const g = t - gustStart;
        let e = 0;
        if (g >= 0 && g < 6.2) {
          const at = 1.6, hold = 1.3, rel = 3.3;
          e = g < at ? (g / at) * (g / at) * (3 - 2 * (g / at)) : g < at + hold ? 1 : 1 - Math.min(1, (g - at - hold) / rel);
          e = e * e * (3 - 2 * e);
        }
        const breathe = 0.18 + 0.06 * Math.sin(t * 0.31) + 0.04 * Math.sin(t * 0.77 + 1.3);
        gust = breathe + e * gustPeak * 0.85;
      }

      /* ---------- sound: fountain trickle + breeze ---------- */
      let breezeGain = null;
      ctx.onSound((ac, out) => {
        const nodes = [];
        const pink = GAM.noiseBuffer(ac, 'pink', 6);
        const brown = GAM.noiseBuffer(ac, 'brown', 6);
        // water falling into the basin: bright band of noise with a bubbling tremolo
        const s1 = ac.createBufferSource(); s1.buffer = pink; s1.loop = true;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.55;
        const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
        const g1 = ac.createGain(); g1.gain.value = 0.17;
        const trem = ac.createGain(); trem.gain.value = 0.75;
        const lfo = ac.createOscillator(); lfo.frequency.value = 6.3;
        const lfoG = ac.createGain(); lfoG.gain.value = 0.22;
        lfo.connect(lfoG); lfoG.connect(trem.gain);
        const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.83;
        const lfo2G = ac.createGain(); lfo2G.gain.value = 0.12;
        lfo2.connect(lfo2G); lfo2G.connect(trem.gain);
        s1.connect(bp); bp.connect(hp); hp.connect(trem); trem.connect(g1); g1.connect(out);
        // soft splash body
        const s2 = ac.createBufferSource(); s2.buffer = pink; s2.loop = true; s2.playbackRate.value = 0.83;
        const lp2 = ac.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 900;
        const g2 = ac.createGain(); g2.gain.value = 0.07;
        s2.connect(lp2); lp2.connect(g2); g2.connect(out);
        // breeze: brown noise through a lowpass that opens with the gusts
        const s3 = ac.createBufferSource(); s3.buffer = brown; s3.loop = true;
        const lp3 = ac.createBiquadFilter(); lp3.type = 'lowpass'; lp3.frequency.value = 520; lp3.Q.value = 0.4;
        const g3 = ac.createGain(); g3.gain.value = 0.05;
        s3.connect(lp3); lp3.connect(g3); g3.connect(out);
        breezeGain = { g: g3, f: lp3, ac };
        [s1, s2, s3, lfo, lfo2].forEach((n) => n.start());
        nodes.push(s1, s2, s3, lfo, lfo2, bp, hp, g1, trem, lfoG, lfo2G, lp2, g2, lp3, g3);
        return () => {
          breezeGain = null;
          nodes.forEach((n) => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} });
        };
      });
      let lastSound = 0;
      function soundTick(t) {
        if (!breezeGain || t - lastSound < 0.25) return;
        lastSound = t;
        const now = breezeGain.ac.currentTime;
        breezeGain.g.gain.setTargetAtTime(0.035 + gust * 0.11, now, 0.4);
        breezeGain.f.frequency.setTargetAtTime(380 + gust * 900, now, 0.5);
      }

      /* ---------- loop ---------- */
      function frameLoop(now) {
        if (!alive) return;
        raf = requestAnimationFrame(frameLoop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (paused || hidden) return;
        simT += dt;
        updateGust(simT);
        draw(simT);
        drawPetals(dt, simT);
        soundTick(simT);
      }
      const onVis = () => { hidden = document.hidden; last = performance.now(); };
      document.addEventListener('visibilitychange', onVis);

      const ro = new ResizeObserver(() => layout());
      ro.observe(frame);
      layout();
      if (!reduced) raf = requestAnimationFrame(frameLoop);

      return {
        setPaused(p) {
          paused = !!p;
          last = performance.now();
        },
        destroy() {
          alive = false;
          cancelAnimationFrame(raf);
          ro.disconnect();
          document.removeEventListener('visibilitychange', onVis);
          if (gl) {
            Object.values(cache).forEach((c) => { try { c.texBase && gl.deleteTexture(c.texBase); c.texMask && gl.deleteTexture(c.texMask); } catch (e) {} });
            GAM.loseGL(gl);
          }
          gl = null;
          sheet = null;
          petals.length = 0;
          still.removeAttribute('src');
          frame.style.background = '';
          frame.replaceChildren();
        },
      };
    },
  };
})();

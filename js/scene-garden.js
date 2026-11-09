/* Golden Age Meadery — Midnight Dream: the photoreal spring-garden scene.
   GAM.photoScenes.garden = { mount(frame, ctx) -> { destroy(), setPaused(bool) } }

   Layers inside the .mead-setting frame:
   1. <img> the baked photo (bottles composited in Python with shadows + glass-top reflection) — also the still/fallback.
   2. WebGL canvas: the same photo with motion applied to its real pixels —
        • top-right vines, leaves and flowers move in the wind leaf by leaf: every leaf / flower (pre-segmented)
          has its own flutter phases + a light branch sway and gusts that travel across the plants,
        • fountain water runs (flow-map animation on the water columns only) and the basin surface ripples,
        • the bottom-left flowers have no motion at all.
   3. 2D canvas: real rose petals letting go of the rose bushes and tumbling down through the scene (client 9 Nov).
*/
(function () {
  const GAM = (window.GAM = window.GAM || {});
  GAM.photoScenes = GAM.photoScenes || {};

  const COMP = {
    d: { base: 'scene/md-base.webp', mask: 'scene/md-mask.png', la: 'scene/md-leaf-a.png', lb: 'scene/md-leaf-b.png', w: 1376, h: 768, sway: 1.5, leaf: 3.1 },
    // tall (phone, and desktop beside the story): Miki's realistic garden picture with the real bottles (client 23 Oct)
    m: { base: 'scene/md-real-m.webp', mask: 'scene/md-real-mask-m.png', la: 'scene/md-real-leaf-a-m.png', lb: 'scene/md-real-leaf-b-m.png', w: 1068, h: 1472, sway: 1.6, leaf: 4.4,
         water: 1, dry: 'scene/md-real-dry-m.webp', dryBox: [830, 248, 232, 374] },
  };
  // the real rose petals lying on the table in Miki's picture, cut out (x, y, w, h in md-real-petals.webp); phone 24 Oct, computers 3 Nov
  const PETALS_M = [[6, 6, 112, 57], [130, 6, 108, 64], [250, 6, 146, 80]];

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  const FS = [
    'precision highp float;',
    'varying vec2 v;',
    'uniform sampler2D uImg,uMask,uLeafA,uLeafB,uDry;',
    'uniform vec4 uDryR;',
    'uniform vec2 uSize;',       // image size in px
    'uniform vec4 uCrop;',       // uv offset.xy, uv scale.zw (cover crop)
    'uniform float uT,uGust,uSway,uLeaf,uWM;',
    'uniform vec3 uW;',          // the three flutter frequencies (rad/s)
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'void main(){',
    ' vec2 uv=uCrop.xy+v*uCrop.zw;',
    ' vec3 m=texture2D(uMask,uv).rgb;',
    ' vec2 px=1./uSize;',
    ' float t=uT;',
    ' vec2 d=vec2(0.);',
    ' float fx=0.;',
    ' if(m.r>.002){',
    // gusts travel across the plants: only the strength varies with position, not the direction of motion
    '  float gl=uGust*(.72+.28*sin(t*.8-uv.x*5.5+uv.y*2.3));',
    // light branch sway (small, slow) + the plants leaning a little into each gust
    '  float ph=n(uv*vec2(4.,3.2))*6.2831+uv.y*2.4-uv.x*1.3;',
    '  float s=sin(t*1.05+ph)*.5+sin(t*.43+ph*.71)*.35;',
    '  d+=vec2(s*(.45+.7*gl)+.8*gl,.18*cos(t*1.3+ph))*uSway;',
    // every leaf / flower flutters on its own: per-leaf phases baked into two smooth coefficient fields
    '  vec4 A=texture2D(uLeafA,uv)*2.-1.; vec4 B=texture2D(uLeafB,uv)*2.-1.;',
    '  vec3 w=uW*t;',
    '  float s1=sin(w.x),c1=cos(w.x),s2=sin(w.y),c2=cos(w.y),s3=sin(w.z),c3=cos(w.z);',
    '  fx=A.r*s1+A.g*c1+A.b*s2+A.a*c2+B.r*s3+B.g*c3;',
    '  float fy=B.b*s2+B.a*c2;',
    '  d+=vec2(fx,fy*.75)*uLeaf*1.6*(.32+1.25*gl);',
    '  d*=m.r;',
    ' }',
    ' vec2 q=uv-d*px;',
    ' vec3 c=texture2D(uImg,q).rgb;',
    // leaves catch the light differently as they turn
    ' c*=1.+.07*fx*m.r*(.5+uGust);',
    // fountain streams: two-phase flow along +y (content moves down), with a glint that rides the water
    // phone picture (client 24 Oct): the water itself (B = its opacity) is lifted off the photo and falls; the stone stays still
    ' if(uWM>.5&&m.g>.004){',
    '  vec3 Wc=vec3(.925,.937,.925);',
    '  float a0=texture2D(uMask,q).b;',
    '  vec3 dry=texture2D(uDry,clamp((q-uDryR.xy)/uDryR.zw,0.,1.)).rgb;',
    '  float r=t*2.3; float f1=fract(r), f2=fract(r+.5); float L=40.*px.y;',
    '  vec3 s1=texture2D(uMask,q-vec2(0.,f1*L)).gbr, s2=texture2D(uMask,q-vec2(0.,f2*L)).gbr;',
    '  float b1=s1.x>.02?s1.y:a0, b2=s2.x>.02?s2.y:a0;',
    '  float aw=mix(b1,b2,abs(2.*f1-1.));',
    '  float gl2=n(vec2(q.x*uSize.x*.5,q.y*uSize.y*.06-t*14.));',
    '  aw=clamp(aw*1.22*(1.+.35*smoothstep(.6,.95,gl2)),0.,.85);',
    '  c=mix(c,dry*(1.-aw)+Wc*aw,clamp(m.g,0.,1.));',
    ' }',
    ' if(uWM<.5&&m.g>.004){',
    '  float r=t*2.6; float f1=fract(r), f2=fract(r+.5); float L=26.*px.y;',
    '  vec3 a1=texture2D(uImg,q-vec2(0.,f1*L)).rgb, a2=texture2D(uImg,q-vec2(0.,f2*L)).rgb;',
    '  vec3 fl=mix(a1,a2,abs(2.*f1-1.));',
    '  float g=n(vec2(q.x*uSize.x*.55,q.y*uSize.y*.09-t*11.));',
    '  fl*=1.+.28*smoothstep(.62,.98,g);',
    '  c=mix(c,fl,clamp(m.g*1.05,0.,1.));',
    ' }',
    // basin surface: small travelling ripples and shimmer
    ' if(uWM<.5&&m.b>.004){',
    '  float w2=sin(q.y*uSize.y*.85-t*2.7+q.x*uSize.x*.045)*.6+sin(q.x*uSize.x*.11+t*1.9)*.4;',
    '  vec3 rc=texture2D(uImg,q+vec2(w2*1.4,w2*.5)*px).rgb;',
    '  rc*=1.+.07*w2;',
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
          ['uImg', 'uMask', 'uLeafA', 'uLeafB', 'uSize', 'uCrop', 'uT', 'uGust', 'uSway', 'uLeaf', 'uW', 'uWM', 'uDry', 'uDryR'].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
          gl.uniform1i(U.uImg, 0);
          gl.uniform1i(U.uMask, 1);
          gl.uniform1i(U.uLeafA, 2);
          gl.uniform1i(U.uLeafB, 3);
          gl.uniform1i(U.uDry, 4);
          gl.uniform3f(U.uW, 2.1, 3.4, 5.3);
        } catch (e) {
          console.warn('garden scene: WebGL unavailable', e);
          GAM.loseGL(gl);
          gl = null;
        }
      }
      function tex(img, rgba) {
        const t = gl.createTexture();
        const f = rgba ? gl.RGBA : gl.RGB;
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        gl.texImage2D(gl.TEXTURE_2D, 0, f, f, gl.UNSIGNED_BYTE, img);
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
        const opt = (src) => (gl ? loadImg(ctx.img(src)) : Promise.resolve(null));
        const optDry = C.dry ? opt(C.dry) : Promise.resolve(null);
        c.ready = Promise.all([loadImg(ctx.img(C.base)), opt(C.mask), opt(C.la), opt(C.lb), optDry]).then(([b, m, la, lb, dry]) => {
          if (!alive) return c;
          c.base = b;
          c.mask = m;
          if (gl && m && la && lb) {
            c.texBase = tex(b);
            c.texMask = tex(m);
            c.texLA = tex(la, true);
            c.texLB = tex(lb, true);
            if (dry) c.texDry = tex(dry);
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

      /* ---------- petals (client 9 Nov: "real looking petals falling", like his example) ----------
         Real rose petals from Miki's picture, graded into the scene's pinks (md-petals-fall.webp: 3 petals in
         rows rose / deep / blush / back side, then the same four rows in soft focus). Each petal lets go from the
         rose bushes, tumbles over (showing its paler back), glides sideways when it tilts, drops faster when it is
         edge-on and is carried by the same gusts that move the roses. Three depths: far (small, soft, slower),
         middle (sharp) and near (bigger, soft, faster). */
      const PCW = 176, PCH = 112, PSRC = [[112, 57], [108, 64], [146, 80]];
      const pctx = pc.getContext('2d');
      let sheetP = null;
      const petals = [];
      loadImg(ctx.img('scene/md-petals-fall.webp')).then((i) => { sheetP = i; }).catch(() => {});
      // where petals let go, as fractions of the frame [x0, x1, y0, y1, weight]: the rose bushes of each picture
      const SOURCES = {
        d: [[0.0, 0.17, 0.02, 0.4, 3], [0.6, 0.71, 0.0, 0.42, 3], [0.62, 0.98, 0.42, 0.62, 2], [0.05, 0.95, -0.06, -0.02, 2]],
        m: [[0.0, 0.42, 0.0, 0.3, 5], [0.86, 1.0, 0.36, 0.5, 2], [0.1, 0.9, -0.05, -0.02, 2]],
      };
      // per depth: count, width (fraction of frame width), fall speed (frame heights per second), soft focus, opacity, wind
      const LAYERS = {
        d: [{ n: 6, size: [0.016, 0.022], v: [0.1, 0.14], blur: 1, alpha: 0.82, wind: 0.7 },
            { n: 8, size: [0.025, 0.034], v: [0.14, 0.2], blur: 0, alpha: 0.98, wind: 1 },
            { n: 3, size: [0.042, 0.054], v: [0.2, 0.27], blur: 1, alpha: 0.95, wind: 1.3 }],
        m: [{ n: 3, size: [0.042, 0.052], v: [0.075, 0.1], blur: 1, alpha: 0.82, wind: 0.7 },
            { n: 5, size: [0.062, 0.08], v: [0.1, 0.14], blur: 0, alpha: 0.98, wind: 1 },
            { n: 2, size: [0.1, 0.12], v: [0.14, 0.19], blur: 1, alpha: 0.95, wind: 1.3 }],
      };
      function pickSource(key) {
        const list = SOURCES[key]; let t = Math.random() * list.reduce((a, s) => a + s[4], 0);
        for (const s of list) { t -= s[4]; if (t <= 0) return s; }
        return list[0];
      }
      function spawn(p, initial) {
        const key = comp === 'm' ? 'm' : 'd', L = LAYERS[key][p.layer];
        p.k = (Math.random() * 3) | 0;
        p.tint = Math.random() < 0.45 ? 0 : Math.random() < 0.55 ? 1 : 2;
        p.blur = L.blur; p.alpha = L.alpha; p.wind = L.wind;
        p.size = W * rnd(L.size[0], L.size[1]);
        p.v = rnd(L.v[0], L.v[1]);
        const src = pickSource(key);
        p.x = rnd(src[0], src[1]) * W;
        p.y = initial ? rnd(-0.05, 0.85) * H : rnd(src[2], src[3]) * H;
        if (p.y < 0) p.y -= p.size;
        p.fade = initial || p.y < 0 ? 1 : 0;   // a petal letting go of a rose fades in
        p.wait = initial ? rnd(0, 1.2) : rnd(0.2, comp === 'm' ? 2.2 : 1.6);
        p.th = rnd(0, 6.283); p.om = rnd(1.6, 4.2) * (Math.random() < 0.5 ? -1 : 1); p.oph = rnd(0, 6.283);
        p.th2 = rnd(0, 6.283); p.om2 = rnd(0.6, 1.6);
        p.phi = rnd(0, 6.283); p.spin = rnd(-0.9, 0.9); p.spinJ = rnd(0.4, 1.2);
        p.glide = rnd(0.6, 1.2) * (Math.random() < 0.5 ? -1 : 1);
        p.swA = W * rnd(0.004, 0.012); p.sw = rnd(0.7, 1.4); p.ph = rnd(0, 6.283);
        p.age = 0;
      }
      function initPetals() {
        petals.length = 0;
        if (reduced) return;
        const key = comp === 'm' ? 'm' : 'd';
        LAYERS[key].forEach((L, li) => { for (let i = 0; i < L.n; i++) { const p = { layer: li }; spawn(p, true); petals.push(p); } });
        petals.sort((a, b) => a.layer - b.layer); // far ones first, near ones on top
      }
      function drawPetals(dt) {
        const dpr = pc.width / W;
        pctx.setTransform(1, 0, 0, 1, 0, 0);
        pctx.clearRect(0, 0, pc.width, pc.height);
        if (!sheetP) return;
        const windX = (6 + gust * 70) * (W / 1440);
        for (const p of petals) {
          if (p.wait > 0) { p.wait -= dt; continue; }
          p.age += dt;
          p.th += p.om * dt * (0.8 + 0.4 * Math.sin(p.age * 0.9 + p.oph));
          p.th2 += p.om2 * dt;
          const fl = Math.cos(p.th), broad = Math.abs(fl);
          const v = p.v * H;
          // flat to the air it floats and glides, edge-on it drops
          p.y += v * dt * (0.62 + 0.7 * (1 - broad)) * (0.9 + gust * 0.3);
          p.x += (p.glide * Math.sin(2 * p.th) * v * 0.3 + windX * p.wind) * dt;
          p.phi += (p.spin + p.spinJ * 0.6 * Math.cos(2 * p.th)) * dt;
          if (p.fade < 1) p.fade = Math.min(1, p.fade + dt / 0.6);
          if (p.y - p.size > H || p.x - p.size > W || p.x + p.size < 0) { spawn(p, false); continue; }
          const x = p.x + Math.sin(p.age * p.sw + p.ph) * p.swA;
          const sc = p.size / PSRC[p.k][0];
          const fx = Math.max(0.1, broad) * (fl < 0 ? -1 : 1);
          const fy = 0.72 + 0.28 * Math.cos(p.th2);
          const row = (fl < 0 ? 3 : p.tint) + (p.blur ? 4 : 0);
          pctx.setTransform(dpr, 0, 0, dpr, x * dpr, p.y * dpr);
          pctx.rotate(p.phi);
          pctx.scale(fx * sc, fy * sc);
          pctx.globalAlpha = p.alpha * p.fade;
          pctx.drawImage(sheetP, p.k * PCW, row * PCH, PCW, PCH, -PCW / 2, -PCH / 2, PCW, PCH);
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
              gl.activeTexture(gl.TEXTURE2);
              gl.bindTexture(gl.TEXTURE_2D, c.texLA);
              gl.activeTexture(gl.TEXTURE3);
              gl.bindTexture(gl.TEXTURE_2D, c.texLB);
              gl.uniform2f(U.uSize, COMP[key].w, COMP[key].h);
              gl.uniform1f(U.uSway, COMP[key].sway);
              gl.uniform1f(U.uLeaf, COMP[key].leaf);
              const C2 = COMP[key];
              gl.uniform1f(U.uWM, C2.water && c.texDry ? 1 : 0);
              if (c.texDry) {
                gl.activeTexture(gl.TEXTURE4);
                gl.bindTexture(gl.TEXTURE_2D, c.texDry);
                const b = C2.dryBox;
                gl.uniform4f(U.uDryR, b[0] / C2.w, b[1] / C2.h, b[2] / C2.w, b[3] / C2.h);
              }
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

      /* ---------- sound (client 24 Oct): birds singing lightly in the background ---------- */
      let breezeGain = null;
      ctx.onSound((ac, out) => GAM.birdsong(ac, out, 1.0));
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
        drawPetals(dt);
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
            Object.values(cache).forEach((c) => { try { ['texBase', 'texMask', 'texLA', 'texLB', 'texDry'].forEach((k) => c[k] && gl.deleteTexture(c[k])); } catch (e) {} });
            GAM.loseGL(gl);
          }
          gl = null;
          sheetP = null;
          petals.length = 0;
          still.removeAttribute('src');
          frame.style.background = '';
          frame.replaceChildren();
        },
      };
    },
  };
})();

/* Golden Age Meadery — Midnight Dream: the photoreal spring-garden scene.
   GAM.photoScenes.garden = { mount(frame, ctx) -> { destroy(), setPaused(bool) } }

   Layers inside the .mead-setting frame:
   1. <img> the baked photo (bottles composited in Python with shadows + glass-top reflection) — also the still/fallback.
   2. WebGL canvas: the same photo with motion applied to its real pixels —
        • top-right vines, leaves and flowers move in the wind leaf by leaf: every leaf / flower (pre-segmented)
          has its own flutter phases + a light branch sway and gusts that travel across the plants,
        • fountain water runs (flow-map animation on the water columns only) and the basin surface ripples,
        • the bottom-left flowers have no motion at all.
   3. 2D canvas: a few big real rose petals (cut from the photo) tumbling all the way down past the bottom edge.
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
  // content rects of each petal in md-petals.webp (x, y, w, h)
  const PETALS = [[18, 4, 283, 192], [346, 4, 267, 192], [661, 4, 278, 192], [978, 4, 283, 192], [1301, 4, 278, 192]];
  // phone (client 24 Oct): the real rose petals lying on the table in Miki's picture, cut out (x, y, w, h in md-real-petals.webp)
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

      /* ---------- petals ---------- */
      const pctx = pc.getContext('2d');
      let sheet = null, sheetM = null;
      const petals = [];
      loadImg(ctx.img('scene/md-petals.webp')).then((i) => { sheet = i; }).catch(() => {});
      loadImg(ctx.img('scene/md-real-petals.webp')).then((i) => { sheetM = i; }).catch(() => {});
      function spawn(p, initial) {
        const mob = comp === 'm';
        p.near = Math.random() < 0.18;
        p.size = (mob ? W * rnd(0.065, 0.09) : W * rnd(0.04, 0.056)) * (p.near ? (mob ? 1.2 : 1.35) : 1);
        // phone: a pause before each petal drifts in again, so only a few fall at a time
        p.wait = mob && !initial ? rnd(1.5, 5.5) : 0;
        p.x0 = rnd(-0.05, 0.95) * W;
        p.y = initial ? rnd(-0.3, 0.9) * H : -p.size * rnd(1.0, 2.6);
        p.vy = (H / rnd(10, 14)) * (p.near ? 1.2 : 1); // px per second
        p.swayA = rnd(0.018, 0.045) * W * (mob ? 1.5 : 1); // side-to-side swing of a falling petal
        p.swayW = rnd(0.9, 1.5);
        p.ph = rnd(0, 6.28);
        p.drift = rnd(6, 18) * (W / 1440) * (mob ? 1.8 : 1);
        p.rot0 = rnd(0, 6.28);
        p.spin = rnd(-0.22, 0.22);
        p.tiltA = rnd(0.3, 0.55); // gentle 3D rocking: width never drops below ~85%
        p.tiltW = rnd(1.3, 2.2);
        p.tph = rnd(0, 6.28);
        p.age = 0;
        p.spr = (Math.random() * (mob ? PETALS_M.length : PETALS.length)) | 0;
      }
      function initPetals() {
        petals.length = 0;
        if (reduced) return;
        const n = comp === 'm' ? 3 : 6;
        for (let i = 0; i < n; i++) { const p = {}; spawn(p, true); petals.push(p); }
      }
      function drawPetals(dt) {
        const dpr = pc.width / W;
        pctx.setTransform(1, 0, 0, 1, 0, 0);
        pctx.clearRect(0, 0, pc.width, pc.height);
        const mob = comp === 'm';
        const sh = mob ? sheetM : sheet, rects = mob ? PETALS_M : PETALS;
        if (!sh) return;
        const wind = 0.6 + gust * 1.4;
        for (const p of petals) {
          if (p.wait > 0) { p.wait -= dt; continue; }
          p.age += dt;
          const sw = p.swayW * p.age + p.ph;
          // falls a touch slower at the ends of each swing, never stops
          p.y += p.vy * dt * (0.9 + 0.14 * Math.cos(sw) * Math.cos(sw)) * (0.92 + gust * 0.2);
          p.x0 += p.drift * wind * dt;
          if (p.y - p.size > H) { spawn(p, false); continue; } // only after it has left the bottom edge
          const x = p.x0 + Math.sin(sw) * p.swayA;
          const rot = p.rot0 + p.spin * p.age + 0.32 * Math.cos(sw); // tilts into the direction of the swing
          const sx = Math.cos(p.tiltA * Math.sin(p.tiltW * p.age + p.tph));
          const sy = 0.9 + 0.1 * Math.cos(p.tiltW * 0.63 * p.age + p.tph);
          const r = rects[p.spr % rects.length];
          const w = p.size, h = (p.size * r[3]) / r[2];
          pctx.setTransform(dpr, 0, 0, dpr, x * dpr, p.y * dpr);
          pctx.rotate(rot);
          pctx.scale(sx, sy);
          pctx.globalAlpha = 0.97;
          pctx.drawImage(sh, r[0], r[1], r[2], r[3], -w / 2, -h / 2, w, h);
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
          sheet = null; sheetM = null;
          petals.length = 0;
          still.removeAttribute('src');
          frame.style.background = '';
          frame.replaceChildren();
        },
      };
    },
  };
})();

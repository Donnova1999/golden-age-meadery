/* Golden Age Meadery — Ancient Lore (realistic photo scene).
   The photograph itself is animated in WebGL: candle flames sway and flicker, the fire under the
   cauldron licks slowly, steam drifts, and every ~10–14 s a real page of the book curls over
   (a bent mesh textured with the book's own pages). The client bottles stand on an enlarged stone top.
   GAM.photoScenes.library = { mount(frame, ctx) -> { destroy(), setPaused(bool) } } */
(function () {
  'use strict';
  const GAM = (window.GAM = window.GAM || {});
  GAM.photoScenes = GAM.photoScenes || {};

  /* ---------------- composition data (image pixel coordinates) ---------------- */
  const LAYOUT = {
    desk: {
      img: 'scene/al-bg.webp', nf: 'scene/al-nf.webp', mask: 'scene/al-mask.png', w: 1376, h: 768,
      front: { src: 'scene/al-front.webp', box: [799, 555, 269, 87] },
      bottles: [
        { src: 'scene/al-200.webp', cx: 846, base: 590, h: 345.9, ar: 233 / 1526, lit: 0.9 },
        { src: 'scene/al-750.webp', cx: 925, base: 575, h: 400, ar: 319 / 1500, lit: 1 },
      ],
      fire: { x: 286, y: 482, rx: 84, ry: 64 },
      steam: [{ x: 282, y: 172, rx: 88, ry: 84 }],
      glows: [{ x: 290, y: 468, r: 290, k: 0.08 }, { x: 302, y: 628, r: 125, k: 0.16 }, { x: 1131, y: 60, r: 170, k: 0.07 }],
      candles: [
        { x: 1131, tip: 32, base: 73, w: 7 },
        { x: 140.5, tip: 114, base: 137, w: 8 },
        { x: 479, tip: 40, base: 60, w: 7 },
      ],
      // [spine-top, outer-top, outer-bottom, spine-bottom]
      book: { right: [[707, 350], [906, 375], [829, 454], [597, 447]], left: [[707, 350], [470, 367], [397, 428], [597, 447]], lift: 0.86 },
    },
    mob: {
      img: 'scene/al-bg-m.webp', nf: 'scene/al-nf-m.webp', mask: 'scene/al-mask-m.png', w: 1088, h: 1920,
      front: { src: 'scene/al-front-m.webp', box: [214, 1433, 331, 132] },
      bottles: [
        { src: 'scene/al-750.webp', cx: 150, base: 1508, h: 666, ar: 319 / 1500, lit: 1 },
        { src: 'scene/al-200.webp', cx: 292, base: 1524, h: 575.8, ar: 233 / 1526, lit: 0.9 },
      ],
      fire: { x: 936, y: 905, rx: 104, ry: 68 },
      steam: [{ x: 955, y: 520, rx: 95, ry: 170 }, { x: 152, y: 168, rx: 42, ry: 62 }, { x: 236, y: 430, rx: 44, ry: 62 }],
      glows: [{ x: 935, y: 900, r: 330, k: 0.08 }, { x: 935, y: 1010, r: 160, k: 0.12 }, { x: 60, y: 790, r: 210, k: 0.07 }],
      candles: [
        { x: 60, tip: 747, base: 812, w: 12 },
        { x: 843, tip: 94, base: 122, w: 9 },
        { x: 875, tip: 121, base: 147, w: 8 },
        { x: 809, tip: 124, base: 146, w: 8 },
        { x: 1033, tip: 262, base: 282, w: 7 },
        { x: 690, tip: 585, base: 606, w: 7 },
        { x: 779, tip: 504, base: 524, w: 7 },
        { x: 638, tip: 761, base: 780, w: 7 },
        { x: 610, tip: 730, base: 748, w: 6 },
        { x: 668, tip: 603, base: 618, w: 6 },
      ],
      book: { right: [[250, 1088], [484, 1053], [625, 1213], [384, 1256]], left: [[250, 1088], [-19, 1113], [96, 1298], [384, 1256]], lift: 0.8 },
    },
  };

  /* ---------------- helpers ---------------- */
  function sq2quad(q) {
    // homography mapping unit square (0,0),(1,0),(1,1),(0,1) -> quad q[0..3]
    const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    let g = 0, h = 0;
    if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
      const den = dx1 * dy2 - dx2 * dy1;
      g = (sx * dy2 - dx2 * sy) / den;
      h = (dx1 * sy - sx * dy1) / den;
    }
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
    const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (t) => t * t * (3 - 2 * t);
  function rnd(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  /* ---------------- shaders ---------------- */
  const VS_FULL = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FS_BASE = `
precision highp float;
uniform sampler2D uTex; uniform sampler2D uNF; uniform sampler2D uMsk; uniform vec2 uRes; uniform vec4 uMap; uniform vec2 uImg; uniform float uTime;
uniform vec4 uC[10]; uniform vec4 uCA[10]; uniform int uNC;
uniform vec4 uF; uniform vec3 uFA;
uniform vec4 uS[3]; uniform int uNS;
uniform vec4 uG[3]; uniform float uGI;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
vec3 tex(vec2 px){return texture2D(uTex,clamp(px/uImg,vec2(0.0005),vec2(0.9995))).rgb;}
vec3 texNF(vec2 px){return texture2D(uNF,clamp(px/uImg,vec2(0.0005),vec2(0.9995))).rgb;}
float flameA(vec2 px){return texture2D(uMsk,clamp(px/uImg,vec2(0.0005),vec2(0.9995))).r;}
void main(){
  vec2 frag=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);
  vec2 p=(frag-uMap.yz)/uMap.x;
  // candles: only the flame itself sways/stretches; it is composited over a flameless photo, so nothing behind it moves
  float flA=0.; vec2 qc=p; vec3 add=vec3(0.); float bright=0.;
  for(int i=0;i<10;i++){
    if(i>=uNC) break;
    vec4 c=uC[i]; vec4 a=uCA[i];
    float h=c.z-c.y; vec2 base=vec2(c.x,c.z);
    vec2 d=p-base;
    float yy=clamp(-d.y/h,0.,1.6);
    float mx=1.-smoothstep(c.w*1.6,c.w*3.2,abs(d.x));
    float my=smoothstep(-h*0.12,h*0.05,-d.y)*(1.-smoothstep(h*1.25,h*2.0,-d.y));
    float m=mx*my;
    if(m>0.){
      vec2 q=p;
      q.x-=a.x*c.w*0.95*pow(yy,1.5)*m;
      q.y=mix(q.y,base.y+d.y/(1.+a.y),m);
      float fa=flameA(q)*m;
      if(fa>flA){ flA=fa; qc=q; bright=a.z; }
    }
    vec2 dd=(p-vec2(c.x,(c.y+c.z)*0.5))/vec2(h*1.6,h*2.1);
    add+=vec3(1.,.6,.26)*a.w*exp(-dot(dd,dd)*1.6);
  }
  // slow fire + drifting steam: two-phase flow (cross-faded) so nothing ever jumps
  vec2 fd=(p-uF.xy)/uF.zw;
  float mF=(1.-smoothstep(0.55,1.,length(fd)))*(1.-smoothstep(0.2,1.05,fd.y));
  float ph=uTime*0.32; float a1=fract(ph), a2=fract(ph+0.5);
  float w1=1.-abs(2.*a1-1.);
  float n1=noise(p*0.045+vec2(0.,-uTime*0.55))-0.5;
  vec2 fv=vec2(n1*0.7,1.)*13.;
  vec2 o1=fv*(a1-0.5)*mF, o2=fv*(a2-0.5)*mF;
  float fireA=mF*flameA(p);
  vec2 s1o=vec2(0.), s2o=vec2(0.); float sw=0.5;
  float mS=0.;
  for(int i=0;i<3;i++){
    if(i>=uNS) break;
    vec2 sd=(p-uS[i].xy)/uS[i].zw;
    float m=1.-smoothstep(0.45,1.,length(sd));
    float n2=noise(p*0.02+vec2(uTime*0.05,-uTime*0.12))-0.5;
    float s1=fract(uTime*0.07+float(i)*0.31), s2=fract(uTime*0.07+float(i)*0.31+0.5);
    vec2 sv=vec2(n2*1.4,1.)*24.;
    s1o+=sv*(s1-0.5)*m; s2o+=sv*(s2-0.5)*m;
    if(m>mS){ mS=m; sw=1.-abs(2.*s1-1.); }
  }
  vec3 col=texNF(p);
  if(mS>0.001){ col=texNF(p+s1o)*sw+texNF(p+s2o)*(1.-sw); }
  if(fireA>0.001){ vec3 fl=tex(p+o1)*w1+tex(p+o2)*(1.-w1); col=mix(col,fl,clamp(fireA,0.,1.)); }
  if(flA>0.001){ vec3 fc=tex(qc)*(1.+bright*0.35); col=mix(col,fc,clamp(flA,0.,1.)); }
  col*=1.+uFA.x*mF*0.12;
  col+=vec3(1.,.55,.2)*mF*max(uFA.x,0.)*0.04;
  for(int i=0;i<3;i++){
    vec2 gd=(p-uG[i].xy)/uG[i].z;
    float gm=exp(-dot(gd,gd)*2.2);
    col*=1.+uG[i].w*gm*(i==2?uFA.y:uGI);
  }
  col+=add*0.16;
  gl_FragColor=vec4(col,1.);
}`;
  const VS_PAGE = `
attribute vec2 aPos; attribute vec2 aUvF; attribute vec2 aUvB; attribute vec2 aShade; attribute float aAlpha;
uniform vec2 uRes; varying vec2 vF; varying vec2 vB; varying vec2 vS; varying float vA;
void main(){ vF=aUvF; vB=aUvB; vS=aShade; vA=aAlpha;
  gl_Position=vec4(aPos.x/uRes.x*2.-1., 1.-aPos.y/uRes.y*2., 0., 1.); }`;
  const FS_PAGE = `
precision highp float;
uniform sampler2D uTex; uniform sampler2D uMsk; uniform float uMode; uniform float uFront;
varying vec2 vF; varying vec2 vB; varying vec2 vS; varying float vA;
void main(){
  float pm=texture2D(uMsk,vF).g;
  if(uMode>0.5){ gl_FragColor=vec4(0.06,0.03,0.01,vA*pm); return; }
  bool fr = gl_FrontFacing == (uFront>0.5);
  // front face = the right page; back face = what lands on the left (masked by the left page's shape)
  float a = fr ? pm : texture2D(uMsk,vB).b;
  if(a<0.01) discard;
  vec3 c = fr ? texture2D(uTex,vF).rgb*vS.x : texture2D(uTex,vB).rgb*vS.y*vec3(1.04,0.97,0.86);
  gl_FragColor=vec4(c,vA*a);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  /* ---------------- scene ---------------- */
  GAM.photoScenes.library = {
    mount(frame, ctx) {
      const q = new URLSearchParams(location.search);
      const freeze = q.has('alFreeze') ? clamp(parseFloat(q.get('alFreeze')) || 0, 0, 1) : null;
      const firstTurn = q.has('alTurn') ? parseFloat(q.get('alTurn')) : q.has('turnNow') ? 0.8 : 4.5;
      const reduced = !!ctx.reducedMotion;
      const fixedT = q.has('alT') ? parseFloat(q.get('alT')) : null; // test hook: render a fixed moment

      const root = document.createElement('div');
      root.className = 'al-scene';
      root.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#0d0a07';
      const cv = document.createElement('canvas');
      cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      cv.setAttribute('aria-hidden', 'true');
      root.appendChild(cv);
      const bottleLayer = document.createElement('div');
      bottleLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      root.appendChild(bottleLayer);
      const fx = document.createElement('canvas');
      fx.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      root.appendChild(fx);
      frame.appendChild(root);
      const fxc = fx.getContext('2d');

      const gl = cv.getContext('webgl', { antialias: true, premultipliedAlpha: false, alpha: false, preserveDrawingBuffer: false });
      let alive = true, paused = false, raf = 0, t0 = performance.now(), tNow = 0, lastFrame = 0;
      let mode = null, L = null, tex = null, texNF = null, texM = null, texReady = false, imgCache = {};
      let map = { s: 1, ox: 0, oy: 0 }, fw = 1, fh = 1, dpr = 1;
      let progBase, progPage, bufFull, pageBuf = {}, idxBuf, idxCount = 0;
      const R = rnd(7);
      const candlePh = Array.from({ length: 12 }, () => [R() * 6.28, R() * 6.28, R() * 6.28, R() * 6.28]);
      const timers = [];

      if (!gl) { // no WebGL: show the still photograph, still with bottles
        cv.style.display = 'none';
        root.style.backgroundSize = 'cover';
        root.style.backgroundPosition = 'center';
      } else {
        try {
          progBase = program(gl, VS_FULL, FS_BASE);
          progPage = program(gl, VS_PAGE, FS_PAGE);
        } catch (e) { console.warn('[ancient-lore]', e); }
        bufFull = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, bufFull);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      }

      /* ---- page mesh topology ---- */
      const NS = 40, NV = 12;
      const NVERT = (NS + 1) * (NV + 1);
      const aPos = new Float32Array(NVERT * 2), aUvF = new Float32Array(NVERT * 2), aUvB = new Float32Array(NVERT * 2);
      const aShade = new Float32Array(NVERT * 2), aAlpha = new Float32Array(NVERT);
      const sPos = new Float32Array(NVERT * 2), sAlpha = new Float32Array(NVERT);
      if (gl) {
        const idx = [];
        for (let j = 0; j < NV; j++) for (let i = 0; i < NS; i++) {
          const a = j * (NS + 1) + i, b = a + 1, c = a + NS + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
        idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
        idxCount = idx.length;
        ['pos', 'uvF', 'uvB', 'shade', 'alpha', 'spos', 'salpha'].forEach((k) => (pageBuf[k] = gl.createBuffer()));
      }

      /* ---- bottles (DOM, above the photo; the page turns behind them) ---- */
      let bottleEls = [], frontEl = null;
      function buildBottles() {
        bottleLayer.replaceChildren();
        bottleEls = L.bottles.map((b) => {
          const wrap = document.createElement('div');
          wrap.style.cssText = 'position:absolute;';
          const im = document.createElement('img');
          im.src = ctx.img(b.src);
          im.alt = '';
          im.decoding = 'async';
          im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;filter:saturate(1.06) contrast(1.03)';
          const lightEl = document.createElement('div');
          const url = 'url("' + ctx.img(b.src) + '")';
          lightEl.style.cssText = 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;' +
            '-webkit-mask-image:' + url + ';mask-image:' + url + ';-webkit-mask-size:100% 100%;mask-size:100% 100%;' +
            'background:linear-gradient(100deg,rgba(255,160,85,.42) 0%,rgba(255,175,95,.14) 38%,rgba(0,0,0,0) 62%,rgba(255,195,125,.1) 100%);opacity:.5';
          wrap.append(im, lightEl);
          bottleLayer.appendChild(wrap);
          return { b, wrap, lightEl };
        });
        frontEl = null;
        if (L.front) {
          frontEl = document.createElement('img');
          frontEl.src = ctx.img(L.front.src);
          frontEl.alt = '';
          frontEl.decoding = 'async';
          frontEl.style.cssText = 'position:absolute;display:block;pointer-events:none';
          bottleLayer.appendChild(frontEl);
        }
        placeBottles();
      }
      function placeBottles() {
        bottleEls.forEach(({ b, wrap }) => {
          const h = b.h * map.s, w = h * b.ar;
          wrap.style.left = (map.ox + b.cx * map.s - w / 2).toFixed(2) + 'px';
          wrap.style.top = (map.oy + (b.base - b.h) * map.s).toFixed(2) + 'px';
          wrap.style.width = w.toFixed(2) + 'px';
          wrap.style.height = h.toFixed(2) + 'px';
        });
        if (frontEl && L.front) {
          const [x, y, w, h] = L.front.box;
          frontEl.style.left = (map.ox + x * map.s).toFixed(2) + 'px';
          frontEl.style.top = (map.oy + y * map.s).toFixed(2) + 'px';
          frontEl.style.width = (w * map.s).toFixed(2) + 'px';
          frontEl.style.height = (h * map.s).toFixed(2) + 'px';
        }
      }

      /* ---- layout / texture ---- */
      function loadImage(src) {
        if (!imgCache[src]) imgCache[src] = new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
        return imgCache[src];
      }
      function chooseMode() {
        const r = frame.getBoundingClientRect();
        fw = Math.max(1, r.width); fh = Math.max(1, r.height);
        return fw < fh ? 'mob' : 'desk';
      }
      function computeMap() {
        const s = Math.max(fw / L.w, fh / L.h);
        map = { s, ox: (fw - L.w * s) / 2, oy: (fh - L.h * s) / 2 };
      }
      function setMode(m) {
        mode = m; L = LAYOUT[m];
        texReady = false;
        computeMap();
        buildBottles();
        const src = ctx.img(L.img);
        if (!gl) { root.style.backgroundImage = 'url("' + src + '")'; return; }
        const want = m;
        const up = (t, im) => {
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        };
        Promise.all([loadImage(src), loadImage(ctx.img(L.nf)), loadImage(ctx.img(L.mask))]).then(([im, nf, mk]) => {
          if (!alive || mode !== want) return;
          if (!tex) { tex = gl.createTexture(); texNF = gl.createTexture(); texM = gl.createTexture(); }
          up(tex, im); up(texNF, nf); up(texM, mk);
          texReady = true;
          Hr = sq2quad(L.book.right); Hl = sq2quad(L.book.left);
          render(tNow);
        }).catch(() => {});
      }
      function resize() {
        const m = chooseMode();
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.round(fw * dpr), H = Math.round(fh * dpr);
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        const fW = Math.round(fw * Math.min(dpr, 1.5)), fH = Math.round(fh * Math.min(dpr, 1.5));
        if (fx.width !== fW || fx.height !== fH) { fx.width = fW; fx.height = fH; }
        if (m !== mode) setMode(m); else { computeMap(); placeBottles(); }
        if (gl) gl.viewport(0, 0, cv.width, cv.height);
        render(tNow);
      }

      /* ---- animation state ---- */
      let Hr = null, Hl = null;
      let turnStart = freeze != null ? -1 : firstTurn, turnDur = 2.5, turning = false, turnSounded = false;
      function candleState(i, t) {
        const p = candlePh[i % candlePh.length];
        const gust = Math.max(0, Math.sin(t * 0.37 + p[3]) - 0.55) * 2.2;
        const sway = 0.55 * Math.sin(t * 2.3 + p[0]) + 0.3 * Math.sin(t * 5.7 + p[1]) + 0.18 * Math.sin(t * 11.1 + p[2]) + gust * Math.sin(t * 9 + p[0]);
        const flick = 0.42 * Math.sin(t * 7.3 + p[1]) + 0.28 * Math.sin(t * 12.7 + p[2]) + 0.2 * Math.sin(t * 19.3 + p[0]) - gust * 0.35;
        const stretch = 0.11 * Math.sin(t * 6.1 + p[2]) + 0.07 * Math.sin(t * 13.9 + p[1]) - gust * 0.08;
        const glow = 0.55 + 0.4 * flick;
        return [sway, clamp(stretch, -0.16, 0.22), flick, glow];
      }
      function fireState(t) {
        // lazy flicker, a little livelier than before (client: same size, slightly faster)
        return 0.55 * Math.sin(t * 1.4) + 0.3 * Math.sin(t * 2.6 + 1.3) + 0.15 * Math.sin(t * 4.7 + 0.4);
      }

      /* ---- page turn geometry ---- */
      function pageGeometry(tt) {
        const e = tt < 0.5 ? 4 * tt * tt * tt : 1 - Math.pow(-2 * tt + 2, 3) / 2;
        const theta = Math.PI * e;
        const kap = 1.35 * Math.sin(Math.PI * tt) * Math.cos(Math.PI * tt);
        const fadeIn = smooth(clamp(tt / 0.04, 0, 1)), fadeOut = 1 - smooth(clamp((tt - 0.93) / 0.07, 0, 1));
        const A = fadeIn * fadeOut;
        const Lx = -0.42, Lz = 0.9; // light from the candles on the left, above
        const d0 = Lz;
        const lift = L.book.lift;
        for (let j = 0; j <= NV; j++) {
          const v = j / NV;
          const kv = kap * (1 + 0.5 * (0.5 - v)) + 0.18 * Math.sin(Math.PI * tt) * (0.5 - v);
          // page width on screen at this v (for vertical lift scale)
          const r0 = Hr(0, v), r1 = Hr(1, v);
          const wpx = Math.hypot(r1[0] - r0[0], r1[1] - r0[1]);
          let X = 0, Z = 0;
          for (let i = 0; i <= NS; i++) {
            const s = i / NS;
            if (i > 0) {
              const sm = (i - 0.5) / NS;
              const al = clamp(theta + kv * Math.pow(sm, 1.35), 0.0, Math.PI);
              X += Math.cos(al) / NS; Z += Math.sin(al) / NS;
            }
            const al = clamp(theta + kv * Math.pow(s, 1.35), 0, Math.PI);
            const k = j * (NS + 1) + i;
            const P = X >= 0 ? Hr(X, v) : Hl(-X, v);
            const sx = map.ox + P[0] * map.s, sy = map.oy + (P[1] - Z * wpx * lift) * map.s;
            aPos[k * 2] = sx * dpr; aPos[k * 2 + 1] = sy * dpr;
            const uf = Hr(s, v), ub = Hl(s, v);
            aUvF[k * 2] = uf[0] / L.w; aUvF[k * 2 + 1] = uf[1] / L.h;
            aUvB[k * 2] = ub[0] / L.w; aUvB[k * 2 + 1] = ub[1] / L.h;
            const nx = -Math.sin(al), nz = Math.cos(al);
            const df = nx * Lx + nz * Lz;
            aShade[k * 2] = clamp(0.62 + 0.4 * df / d0, 0.35, 1.18);
            // back of the sheet: parchment glows a little when candlelight shines through it
            aShade[k * 2 + 1] = clamp(0.74 + 0.22 * (-df) / d0 + 0.22 * Math.max(0, df), 0.55, 1.1);
            // gentle darkening toward the gutter and the free edge while in the air
            const air = clamp(Z * 3, 0, 1);
            aShade[k * 2] *= 1 - 0.12 * air * (1 - s);
            aAlpha[k] = A;
            // shadow cast onto the pages below (light from the left -> shadow falls to the right)
            const Xs = X + Z * 0.55;
            const Ps = Xs >= 0 ? Hr(Math.min(Xs, 1.15), Math.min(1.1, v + Z * 0.08)) : Hl(Math.min(-Xs, 1.15), Math.min(1.1, v + Z * 0.08));
            sPos[k * 2] = (map.ox + Ps[0] * map.s) * dpr; sPos[k * 2 + 1] = (map.oy + Ps[1] * map.s) * dpr;
            const edge = Math.min(1, Math.min(s, 1 - s, v, 1 - v) * 6 + 0.25);
            sAlpha[k] = 0.42 * clamp(Z * 2.2, 0, 1) * edge * A;
          }
        }
        return { theta, A };
      }

      function bindAttr(prog, name, buf, data, size) {
        const loc = gl.getAttribLocation(prog, name);
        if (loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      }

      /* ---- render ---- */
      const uniC = new Float32Array(40), uniCA = new Float32Array(40), uniS = new Float32Array(12), uniG = new Float32Array(12);
      function render(t) {
        if (!gl || !texReady || !progBase) return;
        const motion = !reduced;
        const tt = motion ? t : 3.1;
        gl.useProgram(progBase);
        gl.bindBuffer(gl.ARRAY_BUFFER, bufFull);
        const lp = gl.getAttribLocation(progBase, 'p');
        gl.enableVertexAttribArray(lp);
        gl.vertexAttribPointer(lp, 2, gl.FLOAT, false, 0, 0);
        const U = (n) => gl.getUniformLocation(progBase, n);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, texNF);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, texM);
        gl.uniform1i(U('uTex'), 0);
        gl.uniform1i(U('uNF'), 1);
        gl.uniform1i(U('uMsk'), 2);
        gl.uniform2f(U('uRes'), cv.width, cv.height);
        gl.uniform4f(U('uMap'), map.s * dpr, map.ox * dpr, map.oy * dpr, 0);
        gl.uniform2f(U('uImg'), L.w, L.h);
        gl.uniform1f(U('uTime'), motion ? t : 0);
        const nc = Math.min(10, L.candles.length);
        for (let i = 0; i < nc; i++) {
          const c = L.candles[i];
          uniC.set([c.x, c.tip, c.base, c.w], i * 4);
          uniCA.set(motion ? candleState(i, tt) : [0, 0, 0, 0.5], i * 4);
        }
        gl.uniform4fv(U('uC'), uniC);
        gl.uniform4fv(U('uCA'), uniCA);
        gl.uniform1i(U('uNC'), nc);
        const f = L.fire;
        gl.uniform4f(U('uF'), f.x, f.y, f.rx, f.ry);
        const fs = motion ? fireState(tt) : 0;
        const cs = motion ? candleState(0, tt)[2] : 0;
        gl.uniform3f(U('uFA'), fs, cs, 0);
        const ns = Math.min(3, L.steam.length);
        for (let i = 0; i < 3; i++) { const s = L.steam[i] || { x: -999, y: -999, rx: 1, ry: 1 }; uniS.set([s.x, s.y, s.rx, s.ry], i * 4); }
        gl.uniform4fv(U('uS'), uniS);
        gl.uniform1i(U('uNS'), motion ? ns : 0);
        for (let i = 0; i < 3; i++) { const g = L.glows[i] || { x: -999, y: -999, r: 1, k: 0 }; uniG.set([g.x, g.y, g.r, g.k], i * 4); }
        gl.uniform4fv(U('uG'), uniG);
        gl.uniform1f(U('uGI'), fs);
        gl.disable(gl.BLEND);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // page turn
        let tp = null;
        if (freeze != null) tp = freeze;
        else if (motion && turnStart >= 0 && t >= turnStart && t <= turnStart + turnDur) tp = (t - turnStart) / turnDur;
        if (tp != null && Hr && progPage) {
          pageGeometry(tp);
          gl.useProgram(progPage);
          const P = (n) => gl.getUniformLocation(progPage, n);
          gl.uniform2f(P('uRes'), cv.width, cv.height);
          gl.uniform1i(P('uTex'), 0);
          gl.uniform1i(P('uMsk'), 2);
          gl.uniform1f(P('uFront'), 1);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
          // shadow pass
          gl.uniform1f(P('uMode'), 1);
          bindAttr(progPage, 'aPos', pageBuf.spos, sPos, 2);
          bindAttr(progPage, 'aAlpha', pageBuf.salpha, sAlpha, 1);
          bindAttr(progPage, 'aUvF', pageBuf.uvF, aUvF, 2);
          bindAttr(progPage, 'aUvB', pageBuf.uvB, aUvB, 2);
          bindAttr(progPage, 'aShade', pageBuf.shade, aShade, 2);
          gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0);
          // page pass
          gl.uniform1f(P('uMode'), 0);
          bindAttr(progPage, 'aPos', pageBuf.pos, aPos, 2);
          bindAttr(progPage, 'aAlpha', pageBuf.alpha, aAlpha, 1);
          gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0);
          gl.disable(gl.BLEND);
        }
        // bottles catch the firelight / candlelight
        const li = 0.48 + 0.16 * fs + 0.1 * cs;
        bottleEls.forEach(({ b, lightEl }) => { lightEl.style.opacity = (li * b.lit).toFixed(3); });
      }

      /* ---- candle smoke (2D overlay) ---- */
      const smoke = [];
      function drawSmoke(t, dt) {
        const W = fx.width, H = fx.height, k = W / fw;
        fxc.clearRect(0, 0, W, H);
        if (reduced || !L) return;
        L.candles.forEach((c, i) => {
          if (i > 3) return; // only the nearer candles smoke visibly
          if (Math.random() < dt * 2.2) smoke.push({ i, x: c.x, y: c.tip - 2, age: 0, life: 3.2 + Math.random() * 2, ph: Math.random() * 6.28, w: c.w });
        });
        for (let n = smoke.length - 1; n >= 0; n--) {
          const s = smoke[n];
          s.age += dt;
          if (s.age > s.life || smoke.length > 70) { smoke.splice(n, 1); continue; }
          const a = s.age / s.life;
          const rise = s.age * 16 * (L === LAYOUT.mob ? 1.4 : 1);
          const x = s.x + Math.sin(s.age * 1.7 + s.ph) * (2 + a * 9) + a * a * 6;
          const y = s.y - rise;
          const px = (map.ox + x * map.s) * k, py = (map.oy + y * map.s) * k;
          const r = (s.w * 0.5 + a * s.w * 2.2) * map.s * k;
          const al = 0.11 * Math.sin(Math.PI * Math.min(1, a * 1.15)) * (1 - a);
          const g = fxc.createRadialGradient(px, py, 0, px, py, Math.max(0.001, r));
          g.addColorStop(0, 'rgba(225,215,200,' + al.toFixed(3) + ')');
          g.addColorStop(1, 'rgba(225,215,200,0)');
          fxc.fillStyle = g;
          fxc.beginPath(); fxc.arc(px, py, r, 0, 6.283); fxc.fill();
        }
      }

      /* ---- loop ---- */
      function frameLoop(now) {
        if (!alive) return;
        raf = requestAnimationFrame(frameLoop);
        if (paused || document.hidden) { lastFrame = now; return; }
        const dt = Math.min(0.05, lastFrame ? (now - lastFrame) / 1000 : 0.016);
        lastFrame = now;
        tNow += dt;
        if (fixedT != null) tNow = fixedT;
        if (freeze == null && turnStart >= 0 && tNow > turnStart + turnDur) {
          turnStart = tNow + 10 + Math.random() * 4;
          turnSounded = false;
        }
        if (freeze == null && !turnSounded && tNow >= turnStart && turnStart >= 0) {
          turnSounded = true;
          ctx.sfx(pageSound);
        }
        render(tNow);
        drawSmoke(tNow, dt);
      }

      /* ---- sound ---- */
      function pageSound(ac, out) {
        const t = ac.currentTime + 0.02;
        const nb = GAM.noiseBuffer(ac, 'white', 2);
        const src = ac.createBufferSource(); src.buffer = nb;
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
        bp.frequency.setValueAtTime(900, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.6); bp.frequency.exponentialRampToValueAtTime(1400, t + 1.3);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.16, t + 0.18); g.gain.setValueAtTime(0.16, t + 0.5);
        g.gain.exponentialRampToValueAtTime(0.05, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        // flutter: amplitude-modulated crinkle near the end of the swing
        const am = ac.createGain(); am.gain.value = 0.6;
        const lfo = ac.createOscillator(); lfo.frequency.value = 23; const lfoG = ac.createGain(); lfoG.gain.value = 0.4;
        lfo.connect(lfoG).connect(am.gain);
        src.connect(bp).connect(am).connect(g).connect(out);
        src.start(t, Math.random()); src.stop(t + 1.6); lfo.start(t); lfo.stop(t + 1.6);
        // soft landing tap
        const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t + 1.75); o.frequency.exponentialRampToValueAtTime(70, t + 1.95);
        const og = ac.createGain(); og.gain.setValueAtTime(0.0001, t + 1.74); og.gain.exponentialRampToValueAtTime(0.06, t + 1.77); og.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
        o.connect(og).connect(out); o.start(t + 1.74); o.stop(t + 2.05);
      }
      ctx.onSound((ac, out) => {
        const nodes = [];
        let stopped = false;
        // low simmer
        const rum = ac.createBufferSource(); rum.buffer = GAM.noiseBuffer(ac, 'brown', 6); rum.loop = true;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
        const rg = ac.createGain(); rg.gain.value = 0.09;
        rum.connect(lp).connect(rg).connect(out); rum.start();
        nodes.push(rum);
        const bubble = () => {
          if (stopped) return;
          const t = ac.currentTime + 0.01;
          const o = ac.createOscillator(); o.type = 'sine';
          const f0 = 180 + Math.random() * 220;
          o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (1.6 + Math.random() * 0.8), t + 0.07);
          const bp = ac.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 900;
          const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.04, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
          o.connect(bp).connect(g).connect(out); o.start(t); o.stop(t + 0.15);
          timers.push(setTimeout(bubble, 120 + Math.random() * (Math.random() < 0.2 ? 900 : 380)));
        };
        const crackle = () => {
          if (stopped) return;
          const t = ac.currentTime + 0.01;
          const s = ac.createBufferSource(); s.buffer = GAM.noiseBuffer(ac, 'white', 2);
          const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800 + Math.random() * 2000;
          const g = ac.createGain(); const d = 0.01 + Math.random() * 0.025;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.04, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
          s.connect(hp).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + d + 0.02);
          timers.push(setTimeout(crackle, 180 + Math.random() * 1100));
        };
        bubble(); crackle();
        return () => { stopped = true; nodes.forEach((n) => { try { n.stop(); } catch (e) {} }); };
      });

      /* ---- start ---- */
      const ro = new ResizeObserver(() => resize());
      ro.observe(frame);
      resize();
      if (!reduced) raf = requestAnimationFrame(frameLoop);
      else { const id = setTimeout(() => render(0), 60); timers.push(id); }

      return {
        setPaused(p) { paused = !!p; if (!paused) lastFrame = 0; },
        destroy() {
          alive = false;
          cancelAnimationFrame(raf);
          ro.disconnect();
          timers.forEach(clearTimeout);
          if (gl) {
            try { [tex, texNF, texM].forEach((t) => t && gl.deleteTexture(t)); } catch (e) {}
            GAM.loseGL(gl);
          }
          frame.replaceChildren();
        },
      };
    },
  };
})();

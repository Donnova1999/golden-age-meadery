/* Golden Age Meadery — static rebuild of wellnwomen.site: router, header, pages, cart, scenes. */
(function () {
  const GAM = window.GAM;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduced = GAM.reducedMotion;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const money = (n) => 'C$' + n.toFixed(2);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const SVG = (inner) => `<svg aria-hidden="true" fill="none" height="24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  const ICON = {
    pause: SVG('<rect height="18" rx="1" width="5" x="14" y="3"></rect><rect height="18" rx="1" width="5" x="5" y="3"></rect>'),
    play: SVG('<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"></path>'),
    vol: SVG('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><path d="M16 9a5 5 0 0 1 0 6"></path><path d="M19.364 18.364a9 9 0 0 0 0-12.728"></path>'),
    volx: SVG('<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"></path><line x1="22" x2="16" y1="9" y2="15"></line><line x1="16" x2="22" y1="9" y2="15"></line>'),
  };

  // each mead comes in two sizes (client, 21 Oct): 750 ml C$39, 200 ml C$19
  const SIZES = { 750: { label: '750 ml', price: 39 }, 200: { label: '200 ml', price: 19 } };
  const PRODUCTS = {
    'hearth-and-fire': { name: 'Hearth and Fire', img: { 750: 'img/bottle-hf750.webp', 200: 'img/bottle-hf200.webp' } },
    'midnight-dream': { name: 'Midnight Dream', img: { 750: 'img/bottle-md750.webp', 200: 'img/bottle-md200.webp' } },
    'ancient-lore': { name: 'Ancient Lore', img: { 750: 'img/bottle-al750.webp', 200: 'img/bottle-al200.webp' } },
  };
  // cart keys look like "hearth-and-fire|750"
  const skuOf = (key) => { const [slug, size] = String(key).split('|'); return PRODUCTS[slug] && SIZES[size] ? { slug, size, p: PRODUCTS[slug], s: SIZES[size] } : null; };
  const KIND = { 'hearth-and-fire': 'fire', 'midnight-dream': 'garden', 'ancient-lore': 'library' };
  const SCENE_FILES = { fire: 'js/scene-fire.js', garden: 'js/scene-garden.js', library: 'js/scene-library.js' };
  const ROUTES = ['home', 'store', 'hearth-and-fire', 'midnight-dream', 'ancient-lore', 'building-the-farm', 'life-on-salt-spring', 'our-story', 'where-to-buy', 'contact', 'cart'];
  const NAV_OF = { 'hearth-and-fire': 'Meads', 'midnight-dream': 'Meads', 'ancient-lore': 'Meads', 'building-the-farm': 'About Us', 'life-on-salt-spring': 'About Us', 'our-story': 'About Us', home: 'Home', store: 'Store', contact: 'Contact', 'where-to-buy': 'Store', cart: 'Store' };

  const FARM = [
    { d: '25', m: 'March 2017', t: 'The field before', s: [['farm-01', 'w', 'The field as we found it, looking across to the water.'], ['farm-02', '', 'Clearing the brush piles with a mini excavator.'], ['farm-03', '', 'The upper field, still bare and stony.']] },
    { d: '6', m: 'May 2017', t: 'Clearing and fencing', s: [['farm-04', '', 'Standing in the middle of what would become the rows.'], ['farm-05', '', 'Digging the trench for the fence line.']] },
    { d: '8', m: 'May 2017', t: 'Evening over the bay', s: [['farm-06', 'w', 'An evening view from the top of the field.']] },
    { d: '22', m: 'May 2017', t: 'Posts in the ground', s: [['farm-07', 'w', 'Fence posts set and the first rows turned, with the hill across the water.']] },
    { d: '6', m: 'June 2017', t: 'Planting day', s: [['farm-09', 'w', 'Fresh rows running down the slope, staked and ready.'], ['farm-08', 'p', 'A row ready for planting.'], ['farm-10', 'p', 'Planting by hand, one hole at a time.'], ['farm-11', 'p', 'Watering in each new plant.'], ['farm-12', 'p', 'Bucket after bucket from the top of the field.'], ['farm-13', 'w', 'The finished rows at the end of the day.']] },
  ];

  const root = $('#root'), veil = $('#gamVeil'), toastEl = $('#gamToast');
  const tpl = (id) => document.getElementById(id);
  const HEADER = tpl('tpl-header').innerHTML, FOOTER = tpl('tpl-footer').innerHTML;

  /* ---------------- cart ---------------- */
  let cart = store.get('gam2-cart', {});
  if (typeof cart !== 'object' || !cart) cart = {};
  // carts saved before sizes existed held 750 ml bottles under the bare mead name
  Object.keys(cart).forEach((k) => { if (!k.includes('|') && PRODUCTS[k]) { cart[k + '|750'] = (cart[k + '|750'] || 0) + cart[k]; delete cart[k]; } });
  const cartCount = () => Object.values(cart).reduce((s, n) => s + n, 0);
  function saveCart() { store.set('gam2-cart', cart); paintBadge(); }
  function paintBadge() {
    const a = $('.ga-cart');
    if (!a) return;
    let b = $('span', a);
    if (!b) { b = document.createElement('span'); a.appendChild(b); }
    const n = cartCount();
    b.textContent = n;
    b.hidden = n === 0;
  }
  function addToCart(slug, qty, size) {
    size = SIZES[size] ? String(size) : '750';
    const key = slug + '|' + size;
    cart[key] = Math.min(24, (cart[key] || 0) + qty);
    saveCart();
    toast(`${qty} × ${PRODUCTS[slug].name}, ${SIZES[size].label} added`, true);
  }
  const sizeIn = (scope) => { const r = $('.gam-size input:checked', scope); return r ? r.value : '750'; };

  /* ---------------- toast ---------------- */
  let toastT = 0;
  function toast(msg, withCart) {
    toastEl.innerHTML = esc(msg) + (withCart ? ' <a href="#cart">View cart</a>' : '');
    toastEl.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('on'), 3200);
  }

  /* ---------------- lightbox (farm photos) ---------------- */
  const lb = $('#gamLb');
  let lbList = [], lbI = 0;
  function lbShow(i) { lbI = (i + lbList.length) % lbList.length; const s = lbList[lbI]; $('img', lb).src = `img/${s[0]}.webp`; $('img', lb).alt = s[2]; $('.gam-lb-bar p', lb).textContent = s[2]; }
  function lbOpen(list, i) { lbList = list; lbShow(i); lb.classList.add('open'); $('.gam-lb-close', lb).focus(); }
  function lbClose() { lb.classList.remove('open'); }
  $('.gam-lb-close', lb).onclick = lbClose;
  $('[data-lb="prev"]', lb).onclick = () => lbShow(lbI - 1);
  $('[data-lb="next"]', lb).onclick = () => lbShow(lbI + 1);
  lb.addEventListener('click', (e) => { if (e.target === lb) lbClose(); });

  /* ---------------- script loader ---------------- */
  const loaded = {};
  const loadScript = (src) => loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }));

  /* ---------------- home: photographic fire canvas (ported from wellnwomen.site) ---------------- */
  function heroFire(canvas, isPaused) {
    const ctx = canvas.getContext('2d');
    const S = 1264, C = 848;
    const img = new Image();
    img.src = 'img/fire-ref.jpg';
    const off = document.createElement('canvas'); off.width = S; off.height = C;
    const o = off.getContext('2d');
    const core = (getComputedStyle(canvas).getPropertyValue('--mead-fire-core').trim() || '#fff0c8').replace('#', '');
    const col = core.length >= 6 ? [parseInt(core.slice(0, 2), 16), parseInt(core.slice(2, 4), 16), parseInt(core.slice(4, 6), 16)] : [255, 240, 200];
    const rgba = (a) => `rgba(${col[0]},${col[1]},${col[2]},${Math.max(0, Math.min(1, a))})`;
    let visible = true, raf = 0, last = 0, alive = true;
    const size = () => { const r = canvas.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.max(1, Math.round(r.width * d)); canvas.height = Math.max(1, Math.round(r.height * d)); };
    size();
    const ro = new ResizeObserver(() => { size(); if (isPaused() || reduced) frame(performance.now(), true); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = !!(e && e.isIntersecting); });
    io.observe(canvas);
    function draw(t) {
      if (!img.complete || !img.naturalWidth) return;
      o.clearRect(0, 0, S, C); o.globalCompositeOperation = 'source-over';
      for (let y = 0; y < 928; y += 3) {
        const k = 1 - y / 928;
        const dx = (Math.sin(y * 0.018 - t * 2.1) * 15 + Math.sin(y * 0.037 + t * 1.4) * 8) * k;
        const sy = Math.max(0, Math.min(img.naturalHeight - 4, (y / 928) * img.naturalHeight + Math.sin(t * 2.4 + y * 0.015) * 9 * k));
        o.drawImage(img, 0, sy, img.naturalWidth, (3 * img.naturalHeight) / 928, dx - 25, -40 + y, 1314, 4);
      }
      o.globalCompositeOperation = 'destination-in';
      const g = o.createLinearGradient(0, -40, 0, 888);
      g.addColorStop(0, rgba(0.8)); g.addColorStop(0.13, rgba(1)); g.addColorStop(0.65, rgba(1)); g.addColorStop(1, rgba(0.65));
      o.fillStyle = g; o.fillRect(0, 0, S, C);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.94 + Math.sin(t * 1.8) * 0.04;
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1;
    }
    function frame(now, once) {
      if (!alive) return;
      const still = isPaused() || reduced;
      if (!once && !still && (!visible || document.hidden || now - last < 30)) { raf = requestAnimationFrame(frame); return; }
      last = now;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(canvas.width / S, 0, 0, canvas.height / C, 0, 0);
      draw(still ? 3.2 : now / 1000);
      ctx.globalCompositeOperation = 'source-over';
      if (!once && !still) raf = requestAnimationFrame(frame);
    }
    img.onload = () => frame(performance.now(), true);
    raf = requestAnimationFrame(frame);
    return {
      kick() { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
      destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); img.onload = null; },
    };
  }

  /* ---------------- page initialisers ---------------- */
  function initReveal(cleanups) {
    const els = $$('.mead-reveal', root);
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('mead-revealed')); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('mead-revealed'); io.unobserve(e.target); } }), { threshold: 0.1 });
    els.forEach((e) => io.observe(e));
    cleanups.push(() => io.disconnect());
  }
  const scrollToId = (id) => { const el = document.getElementById(id); el && el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); };

  function initHome(cleanups) {
    const home = $('.mead-home', root);
    let paused = false;
    // the hero now shows the farm photograph (client, 21 Oct) instead of the animated fire
    const fire = { destroy() {}, kick() {} };
    $$('button', $('.mead-hero', root)).forEach((b) => {
      const t = b.textContent.trim();
      if (/Explore our meads/.test(t)) b.onclick = () => scrollToId('collection');
      else if (/Discover the tradition/.test(t)) b.onclick = () => scrollToId('spirit');
      else if (b.classList.contains('mead-motion-toggle')) b.onclick = () => {
        paused = !paused;
        home.dataset.motion = paused ? 'paused' : 'playing';
        b.innerHTML = paused ? ICON.play : ICON.pause;
        b.setAttribute('aria-label', paused ? 'Play fire animation' : 'Pause fire animation');
        b.title = b.getAttribute('aria-label');
        fire.kick();
      };
    });
  }

  function initStore() {
    $$('.mead-product', root).forEach((card) => {
      const link = $('a.mead-product-image', card);
      const slug = link && link.getAttribute('href').slice(1);
      const add = $('[data-add]', card);
      if (!PRODUCTS[slug] || !add) return;
      const paint = () => {
        const size = sizeIn(card);
        link.dataset.size = size;
        add.textContent = `Add to cart · ${money(SIZES[size].price)}`;
      };
      $$('.gam-size input', card).forEach((r) => r.addEventListener('change', paint));
      add.onclick = () => addToCart(slug, 1, sizeIn(card));
      paint();
    });
  }

  function initMead(route, cleanups) {
    const kind = KIND[route];
    const frame = $('.mead-setting', root);
    const crawl = $('.mead-setting-crawl', root);
    const soundBtn = $('[aria-label="Turn scene sound on"]', root);
    const pauseBtn = $('[aria-label="Pause scene animation"]', root);
    let paused = reduced, scene = null;
    const syncSound = () => {
      if (!soundBtn) return;
      const on = GAM.audio.enabled;
      soundBtn.innerHTML = on ? ICON.vol : ICON.volx;
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.setAttribute('aria-label', on ? 'Turn scene sound off' : 'Turn scene sound on');
    };
    const syncPause = () => {
      frame.dataset.paused = String(paused);
      if (crawl) crawl.dataset.paused = String(paused);
      if (pauseBtn) { pauseBtn.innerHTML = paused ? ICON.play : ICON.pause; pauseBtn.setAttribute('aria-pressed', String(paused)); pauseBtn.setAttribute('aria-label', paused ? 'Play scene animation' : 'Pause scene animation'); }
      scene && scene.setPaused && scene.setPaused(paused);
    };
    if (soundBtn) { soundBtn.onclick = () => { GAM.audio.toggle(); syncSound(); }; syncSound(); }
    if (pauseBtn) pauseBtn.onclick = () => { paused = !paused; syncPause(); };
    const unsub = GAM.audio.subscribe(syncSound);
    cleanups.push(unsub);
    syncPause();

    // gallery: main photo, counter, thumbnails (+ Miki's new Midnight Dream photo)
    const thumbsWrap = $('.mead-photo-thumbnails', root), main = $('.mead-photo-original', root), counter = $('.mead-photo-navigation span', root);
    if (thumbsWrap && main) {
      if (route === 'midnight-dream') {
        const b = thumbsWrap.firstElementChild.cloneNode(true);
        $('img', b).src = 'img/client-md-new.webp';
        thumbsWrap.insertBefore(b, thumbsWrap.firstElementChild);
      }
      const thumbs = $$('button', thumbsWrap);
      const list = thumbs.map((b, i) => ({ src: $('img', b).getAttribute('src'), alt: i === 0 && route === 'midnight-dream' ? 'Both Midnight Dream bottles, 200 ml and 750 ml, in warm light' : (b.dataset.alt || main.alt) }));
      if (route !== 'midnight-dream') list[0].alt = main.alt;
      thumbs.forEach((b, i) => b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/\d+$/, String(i + 1))));
      let gi = 0;
      const show = (i) => {
        gi = (i + list.length) % list.length;
        main.src = list[gi].src;
        if (list[gi].alt) main.alt = list[gi].alt;
        if (counter) counter.textContent = `${gi + 1} / ${list.length}`;
        thumbs.forEach((b, k) => b.setAttribute('aria-pressed', String(k === gi)));
      };
      thumbs.forEach((b, i) => (b.onclick = () => show(i)));
      const prev = $('[aria-label="Previous product photo"]', root), next = $('[aria-label="Next product photo"]', root);
      if (prev) prev.onclick = () => show(gi - 1);
      if (next) next.onclick = () => show(gi + 1);
      show(0);
    }

    // product details: quantity + add to cart
    const qtyWrap = $('.mead-qty', root);
    if (qtyWrap) {
      let q = 1;
      const out = $('span', qtyWrap);
      const addBtn = $$('.mead-pdp-info button', root).find((b) => /Add to cart/.test(b.textContent));
      const info = qtyWrap.closest('.mead-pdp-info') || root;
      const amt = $('.gam-pdp-amt', info), sizeLbl = $('.gam-pdp-size', info);
      const paint = () => {
        const size = sizeIn(info), price = SIZES[size].price;
        out.textContent = q;
        if (amt) amt.textContent = money(price);
        if (sizeLbl) sizeLbl.textContent = SIZES[size].label.toUpperCase();
        if (addBtn) addBtn.textContent = `Add to cart · ${money(price * q)}`;
      };
      $$('.gam-size input', info).forEach((r) => r.addEventListener('change', paint));
      $('[aria-label="Decrease quantity"]', qtyWrap).onclick = () => { q = Math.max(1, q - 1); paint(); };
      $('[aria-label="Increase quantity"]', qtyWrap).onclick = () => { q = Math.min(12, q + 1); paint(); };
      if (addBtn) addBtn.onclick = () => addToCart(route, q, sizeIn(info));
      paint();
    }

    // realistic scene
    loadScript(SCENE_FILES[kind] + '?v=' + (window.GAM_BUILD || '1')).then(() => {
      if (!frame.isConnected || !GAM.photoScenes[kind]) return;
      const ctx = GAM.makeContext(frame);
      try { scene = GAM.photoScenes[kind].mount(frame, ctx); } catch (e) { console.error(e); }
      if (paused && scene && scene.setPaused) scene.setPaused(true);
      cleanups.push(() => {
        try { scene && scene.destroy(); } catch (e) { console.warn(e); }
        ctx._teardown();
        frame.replaceChildren();
        scene = null;
      });
    }).catch((e) => console.warn('scene failed to load', e));
  }

  function initFarm() {
    const hero = $('.mead-page-hero', root);
    const lede = $('.mead-page-lede', root);
    if (lede) lede.textContent = 'A family making mead by hand from old-world recipes. In spring 2017 we began turning an open, stony field on Salt Spring Island into our farm. These photos follow the first three months, from clearing the ground to planting the first rows.';
    const all = [];
    const html = FARM.map((day) => {
      const shots = day.s.map((s) => { const i = all.push(s) - 1; return `<figure class="${s[1]}"><button type="button" data-shot="${i}" aria-label="Enlarge photo: ${esc(s[2])}"><img src="img/${s[0]}.webp" alt="${esc(s[2])}" loading="lazy"></button><figcaption>${esc(s[2])}</figcaption></figure>`; }).join('');
      return `<div class="gam-farm-day"><div class="gam-farm-date"><b>${day.d}</b><span>${day.m}</span><em>${day.t}</em></div><div class="gam-farm-shots">${shots}</div></div>`;
    }).join('');
    const sec = document.createElement('section');
    sec.className = 'gam-farm';
    sec.setAttribute('aria-label', 'Building the farm, spring 2017');
    sec.innerHTML = html;
    hero.after(sec);
    sec.addEventListener('click', (e) => { const b = e.target.closest('[data-shot]'); if (b) lbOpen(all, +b.dataset.shot); });
  }

  function initWhereToBuy() {
    const input = $('.mead-search input', root);
    if (!input) return;
    const groups = $$('.mead-stockists > div', root);
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      groups.forEach((g) => {
        let n = 0;
        $$('li', g).forEach((li) => { const hit = li.textContent.toLowerCase().includes(q); li.hidden = !hit; if (hit) n++; });
        const c = $('h2 span', g); if (c) c.textContent = n;
        g.hidden = n === 0;
      });
    });
  }

  function initContact() {
    const form = $('form.mead-form', root);
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const [name, email, , msg] = $$('input, select, textarea', form);
      if (!name.value.trim() || !msg.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        toast('Please add your name, a valid email and a message.');
        return;
      }
      form.closest('section').innerHTML = `<div class="gam-thanks"><h2>Thank you, ${esc(name.value.trim().split(' ')[0])}.</h2><p>We read every message and usually reply within a couple of days. You can also write to goldenagemeads@gmail.com.</p><p style="font-size:13px">This is a design preview, so the message was not actually sent.</p></div>`;
    });
  }

  function renderCart() {
    const box = $('#gamCart', root);
    if (!box) return;
    const items = Object.entries(cart).filter(([k, n]) => n > 0 && skuOf(k));
    if (!items.length) {
      box.innerHTML = `<p class="gam-cart-empty">Your cart is empty.</p><div class="gam-cart-actions" style="justify-content:center"><a class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors bg-primary text-primary-foreground shadow h-9 px-4 py-2 mead-primary" href="#store">Shop the meads</a></div>`;
      return;
    }
    const total = items.reduce((s, [k, n]) => s + n * skuOf(k).s.price, 0);
    box.innerHTML = `<ul>${items.map(([k, n]) => { const x = skuOf(k), nm = `${x.p.name}, ${x.s.label}`; return `<li><img src="${x.p.img[x.size]}" alt=""><div><h3>${x.p.name}</h3><div class="gam-line">${x.s.label} · ${money(x.s.price)}</div><div class="gam-qty"><button type="button" data-q="-1" data-s="${k}" aria-label="One fewer ${nm}">−</button><output>${n}</output><button type="button" data-q="1" data-s="${k}" aria-label="One more ${nm}">+</button></div></div><div class="gam-price">${money(n * x.s.price)}<button type="button" class="gam-remove" data-rm="${k}">Remove</button></div></li>`; }).join('')}</ul>
      <div class="gam-cart-total"><span>Subtotal</span><span>${money(total)}</span></div>
      <p class="gam-cart-note">Ships within Canada. You must be of legal drinking age to order. Taxes and delivery are worked out at checkout.</p>
      <div class="gam-cart-actions"><a class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors text-primary underline-offset-4 hover:underline h-9 px-4 py-2 mead-product-link" href="#store">Keep shopping</a><button type="button" class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors bg-primary text-primary-foreground shadow h-9 px-4 py-2 mead-primary" id="gamCheckout">Checkout</button></div>
      <p class="gam-cart-note" id="gamCheckoutNote" hidden>Checkout will open here once the online store is connected.</p>`;
    box.onclick = (e) => {
      const q = e.target.closest('[data-q]'), rm = e.target.closest('[data-rm]');
      if (q) { cart[q.dataset.s] = Math.max(0, Math.min(24, (cart[q.dataset.s] || 0) + +q.dataset.q)); if (!cart[q.dataset.s]) delete cart[q.dataset.s]; saveCart(); renderCart(); }
      if (rm) { delete cart[rm.dataset.rm]; saveCart(); renderCart(); }
      if (e.target.id === 'gamCheckout') $('#gamCheckoutNote', root).hidden = false;
    };
  }

  /* ---------------- header behaviour (delegated) ---------------- */
  function closeMenus(except) {
    $$('.ga-has-sub[data-open]', root).forEach((li) => { if (li !== except) { li.removeAttribute('data-open'); const b = $('button', li); b && b.setAttribute('aria-expanded', 'false'); } });
  }
  root.addEventListener('click', (e) => {
    const toggle = e.target.closest('.ga-toggle');
    if (toggle) {
      const nav = $('.ga-nav', root);
      const open = !nav.classList.contains('ga-nav-open');
      nav.classList.toggle('ga-nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      return;
    }
    const sub = e.target.closest('.ga-has-sub > button');
    if (sub) {
      const li = sub.parentElement;
      const open = !li.hasAttribute('data-open');
      closeMenus(li);
      li.toggleAttribute('data-open', open);
      sub.setAttribute('aria-expanded', String(open));
    }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.ga-nav')) closeMenus(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenus(); lbClose(); }
    if (lb.classList.contains('open')) { if (e.key === 'ArrowLeft') lbShow(lbI - 1); if (e.key === 'ArrowRight') lbShow(lbI + 1); }
  });

  function markNav(route) {
    const label = NAV_OF[route];
    $$('.ga-nav > ul > li', root).forEach((li) => {
      const el = li.firstElementChild;
      const on = el && el.textContent.trim() === label;
      el && el.classList.toggle('mead-nav-active', on);
    });
    $$('.ga-nav a, .ga-badge, .mead-footer a', root).forEach((a) => {
      const h = a.getAttribute('href');
      if (h === '#' + route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ---------------- router ---------------- */
  let current = null, token = 0;
  function teardown() {
    if (!current) return;
    current.cleanups.splice(0).forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
    root.replaceChildren();
    current = null;
  }
  async function go(route, first) {
    if (!ROUTES.includes(route)) route = 'home';
    if (current && current.route === route) return;
    const my = ++token;
    if (!first) { veil.classList.add('on'); await wait(330); if (my !== token) return; }
    teardown();
    window.scrollTo(0, 0);
    const t = tpl('t-' + route);
    const meta = JSON.parse(t.dataset.meta || '{}');
    const attrs = Object.entries(meta.attrs || {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
    const inner = `<div class="mead-home" data-motion="playing" data-route="${route}"${attrs}>${HEADER}<main>${t.innerHTML}</main>${FOOTER}</div>`;
    root.innerHTML = meta.luxury ? `<div class="mead-luxury">${inner}</div>` : inner;
    const cleanups = [];
    current = { route, cleanups };
    document.title = meta.title || 'Golden Age Meadery';
    markNav(route);
    paintBadge();
    initReveal(cleanups);
    if (route === 'home') initHome(cleanups);
    if (route === 'store') initStore();
    if (KIND[route]) initMead(route, cleanups);
    if (route === 'building-the-farm') initFarm();
    if (route === 'where-to-buy') initWhereToBuy();
    if (route === 'contact') initContact();
    if (route === 'cart') renderCart();
    if (location.hash.slice(1) !== route && !(route === 'home' && !location.hash)) { try { history.replaceState(null, '', '#' + route); } catch (e) {} }
    requestAnimationFrame(() => veil.classList.remove('on'));
    setTimeout(() => { if (my === token) veil.classList.remove('on'); }, 160);
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.metaKey || e.ctrlKey) return;
    const r = a.getAttribute('href').slice(1);
    if (!ROUTES.includes(r)) return;
    e.preventDefault();
    const nav = $('.ga-nav', root); nav && nav.classList.remove('ga-nav-open');
    toastEl.classList.remove('on');
    go(r);
  });
  window.addEventListener('hashchange', () => go(location.hash.slice(1)));
  if (store.get('gam-sound', 0) === 1) document.addEventListener('pointerdown', () => { if (!GAM.audio.enabled) GAM.audio.enable(); }, { once: true, capture: true });
  go(location.hash.slice(1) || 'home', true);
})();

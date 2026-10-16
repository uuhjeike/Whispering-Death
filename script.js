/* Whispering Death — profile feed.
   Everything on the page comes from Post.txt. Posts are separated by a line containing only $.
   The post at the TOP of the file is the newest. */
(() => {
  'use strict';

  const CONFIG = {
    name: 'Whispering Death',
    tagline: 'Quiet until it isn’t.',          // set to '' to hide
    user: 'mdimrankhanalpha',
    repo: 'Whispering-Death',
    branch: 'main',
    photo: 'https://github.com/mdimrankhanalpha/Whispering-Death/blob/main/1792164327845.jpg',
    postFile: 'Post.txt',
    siteUrl: 'https://mdimrankhanalpha.github.io/Whispering-Death/',
    newestFirst: true,                          // true: top of file = newest post
    avatar: { zoom: 1.65, x: 0.6, y: 0.42 },   // which part of the photo fills the round avatar
    batch: 8,                                   // posts rendered per step while scrolling
    previewChars: 2400                          // very long posts render only this much until "Read more"
  };

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };

  /* ---------------- Links: normal link -> raw/direct link ---------------- */

  function toRaw(input) {
    const s = String(input).trim();
    let u;
    try { u = new URL(s); } catch { return s; }
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'github.com') {
      const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
      if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
    }
    if (host.endsWith('dropbox.com')) {
      u.searchParams.delete('dl');
      u.searchParams.set('raw', '1');
      return u.toString();
    }
    return s;
  }

  const IMG_RE = /\.(jpe?g|jfif|png|gif|webp|avif|bmp|svg)$/i;
  const VID_RE = /\.(mp4|m4v|webm|mov|ogv)$/i;
  const AUD_RE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/i;

  function parseTime(v) {
    if (!v) return 0;
    if (/^\d+$/.test(v)) return +v;
    const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i);
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }

  function parseYouTube(u) {
    const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
    let id = null, short = false;
    if (host === 'youtu.be') {
      id = u.pathname.split('/')[1];
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else {
        const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
        if (m) { id = m[2]; short = m[1] === 'shorts'; }
      }
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    return { id, short, start: parseTime(u.searchParams.get('t') || u.searchParams.get('start')) };
  }

  // Returns a media descriptor, or null when the link is an ordinary link.
  function classify(raw) {
    let u;
    try { u = new URL(raw); } catch { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const yt = parseYouTube(u);
    if (yt) return { kind: 'youtube', orig: raw, ...yt };
    const src = toRaw(raw);
    let path;
    try { path = new URL(src).pathname; } catch { path = u.pathname; }
    if (IMG_RE.test(path)) return { kind: 'image', src, orig: raw };
    if (VID_RE.test(path)) return { kind: 'video', src, orig: raw };
    if (AUD_RE.test(path)) return { kind: 'audio', src, orig: raw };
    return null;
  }

  /* ---------------- Post.txt parsing ---------------- */

  const isUrl = (t) => /^https?:\/\/\S+$/i.test(t);

  function parsePost(chunk) {
    const lines = chunk.split('\n');
    const blocks = [];
    let textBuf = [];
    let media = [];

    const flushText = () => {
      const t = textBuf.join('\n').replace(/^\n+|\s+$/g, '');
      if (t) blocks.push({ type: 'text', text: t });
      textBuf = [];
    };
    const flushMedia = () => {
      if (media.length) blocks.push({ type: 'media', items: media });
      media = [];
    };

    for (const line of lines) {
      const t = line.trim();
      if (!t) { if (textBuf.length) textBuf.push(''); continue; }
      const toks = t.split(/\s+/);
      if (toks.every(isUrl)) {
        for (const tok of toks) {
          const c = classify(tok);
          if (c) { flushText(); media.push(c); }
          else { flushMedia(); textBuf.push(tok); }
        }
      } else {
        flushMedia();
        textBuf.push(line.replace(/\s+$/, ''));
      }
    }
    flushText();
    flushMedia();
    return blocks;
  }

  function parseFile(text) {
    const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
    const posts = [];
    let cur = [];
    const push = () => {
      const blocks = parsePost(cur.join('\n'));
      if (blocks.length) posts.push(blocks);
      cur = [];
    };
    for (const line of lines) {
      if (/^\$+$/.test(line.trim())) push();
      else cur.push(line);
    }
    push();
    return CONFIG.newestFirst ? posts : posts.reverse();
  }

  /* ---------------- Text rendering ---------------- */

  const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

  function shorten(url) {
    try {
      const u = new URL(url);
      const s = u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname) + u.search;
      return s.length > 56 ? s.slice(0, 55) + '…' : s;
    } catch { return url.length > 56 ? url.slice(0, 55) + '…' : url; }
  }

  function fillText(node, str) {
    node.textContent = '';
    const frag = document.createDocumentFragment();
    let last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(str))) {
      let url = m[0], trail = '';
      const mt = url.match(/[.,;:!?)\]}»”’]+$/);
      if (mt) { trail = mt[0]; url = url.slice(0, -trail.length); }
      if (m.index > last) frag.appendChild(document.createTextNode(str.slice(last, m.index)));
      const a = el('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      a.textContent = shorten(url);
      frag.appendChild(a);
      if (trail) frag.appendChild(document.createTextNode(trail));
      last = m.index + m[0].length;
    }
    if (last < str.length) frag.appendChild(document.createTextNode(str.slice(last)));
    node.appendChild(frag);
  }

  const textEntries = [];

  function renderText(text) {
    const wrap = el('div', 'body');
    const t = el('div', 'txt clamp');
    const long = text.length > CONFIG.previewChars;
    let preview = text;
    if (long) {
      preview = text.slice(0, CONFIG.previewChars);
      const cut = preview.search(/\s\S*$/);
      if (cut > CONFIG.previewChars * 0.6) preview = preview.slice(0, cut);
      preview = preview.replace(/\s+$/, '') + '…';
    }
    fillText(t, preview);

    const btn = el('button', 'more');
    btn.type = 'button';
    btn.textContent = 'Read more';
    btn.hidden = true;
    btn.setAttribute('aria-expanded', 'false');

    const entry = { t, btn, long, expanded: false };
    btn.addEventListener('click', () => {
      if (!entry.expanded) {
        if (long) fillText(t, text);
        t.classList.remove('clamp');
        entry.expanded = true;
        btn.textContent = 'Show less';
        btn.setAttribute('aria-expanded', 'true');
      } else {
        if (long) fillText(t, preview);
        t.classList.add('clamp');
        entry.expanded = false;
        btn.textContent = 'Read more';
        btn.setAttribute('aria-expanded', 'false');
        if (wrap.getBoundingClientRect().top < 0) wrap.scrollIntoView({ block: 'start' });
      }
    });

    textEntries.push(entry);
    wrap.append(t, btn);
    return wrap;
  }

  function checkClamps() {
    for (const e of textEntries) {
      if (e.expanded || !e.t.isConnected) continue;
      e.btn.hidden = !(e.long || e.t.scrollHeight > e.t.clientHeight + 1);
    }
  }

  /* ---------------- Media rendering ---------------- */

  const ytPlayers = new Set();

  function pauseOthers(except) {
    document.querySelectorAll('video, audio').forEach((m) => m.pause());
    ytPlayers.forEach((p) => {
      if (p !== except) { try { p.pauseVideo(); } catch { /* player not ready */ } }
    });
  }
  document.addEventListener('play', (e) => {
    const t = e.target;
    document.querySelectorAll('video, audio').forEach((m) => { if (m !== t) m.pause(); });
    ytPlayers.forEach((p) => { try { p.pauseVideo(); } catch { /* not ready */ } });
  }, true);

  function failBox(url, label) {
    const a = el('a', 'fail');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `This ${label} could not be loaded. Open the link instead.`;
    return a;
  }

  function photoButton(item, photos) {
    const index = photos.length;
    photos.push(item);
    const b = el('button', 'ph');
    b.type = 'button';
    b.setAttribute('aria-label', 'Open photo');
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.addEventListener('load', () => b.classList.add('ok'));
    img.addEventListener('error', () => b.replaceWith(failBox(item.orig, 'photo')));
    img.src = item.src;
    b.appendChild(img);
    b.addEventListener('click', () => openLightbox(photos, index));
    return b;
  }

  function photoRun(run, photos) {
    if (run.length === 1) {
      const fig = el('div', 'one');
      fig.appendChild(photoButton(run[0], photos));
      return fig;
    }
    const grid = el('div', 'grid');
    const cols = [el('div', 'col'), el('div', 'col')];
    run.forEach((it, i) => cols[i % 2].appendChild(photoButton(it, photos)));
    grid.append(cols[0], cols[1]);
    return grid;
  }

  function skipRow(onSkip) {
    const row = el('div', 'skip');
    [[-10, '−10s', 'Back 10 seconds'], [10, '+10s', 'Forward 10 seconds']].forEach(([d, label, aria]) => {
      const b = el('button', 'sk');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', () => onSkip(d));
      row.appendChild(b);
    });
    return row;
  }

  function videoBlock(item) {
    const w = el('div', 'vid');
    const v = document.createElement('video');
    v.controls = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.addEventListener('error', () => w.replaceWith(failBox(item.orig, 'video')));
    v.src = item.src;
    w.appendChild(v);
    w.appendChild(skipRow((d) => {
      const dur = isFinite(v.duration) ? v.duration : Infinity;
      v.currentTime = Math.max(0, Math.min(dur, v.currentTime + d));
    }));
    return w;
  }

  function audioBlock(item) {
    const w = el('div', 'aud');
    const a = document.createElement('audio');
    a.controls = true;
    a.preload = 'metadata';
    a.addEventListener('error', () => w.replaceWith(failBox(item.orig, 'audio')));
    a.src = item.src;
    w.appendChild(a);
    return w;
  }

  let ytApi;
  function loadYT() {
    if (ytApi) return ytApi;
    ytApi = new Promise((resolve, reject) => {
      if (window.YT && window.YT.Player) return resolve();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = reject;
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('timeout')), 10000);
    });
    ytApi.catch(() => { ytApi = null; });
    return ytApi;
  }

  function youtubeBlock(item) {
    const outer = el('div', 'vid');
    const box = el('div', 'yt' + (item.short ? ' short' : ''));
    const face = el('button', 'yt-face');
    face.type = 'button';
    face.setAttribute('aria-label', 'Play video');
    face.style.backgroundImage = `url("https://i.ytimg.com/vi/${item.id}/hqdefault.jpg")`;
    face.appendChild(el('span', 'play'));
    box.appendChild(face);

    let player = null;
    const skip = skipRow((d) => {
      if (!player || typeof player.getCurrentTime !== 'function') return;
      player.seekTo(Math.max(0, player.getCurrentTime() + d), true);
    });
    skip.hidden = true;
    outer.append(box, skip);

    face.addEventListener('click', async () => {
      face.disabled = true;
      face.classList.add('busy');
      const target = el('div', 'yt-target');
      box.appendChild(target);
      try {
        await loadYT();
        const vars = { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 };
        if (item.start) vars.start = item.start;
        if (/^https?:$/.test(location.protocol)) vars.origin = location.origin;
        player = new window.YT.Player(target, {
          videoId: item.id,
          width: '100%',
          height: '100%',
          playerVars: vars,
          events: {
            onReady: (e) => {
              face.remove();
              skip.hidden = false;
              ytPlayers.add(player);
              pauseOthers(player);
              e.target.playVideo();
            },
            onStateChange: (e) => { if (e.data === 1) pauseOthers(player); },
            onError: () => outer.replaceWith(failBox(item.orig, 'video'))
          }
        });
      } catch {
        target.remove();
        const f = document.createElement('iframe');
        f.src = `https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&playsinline=1&rel=0` + (item.start ? `&start=${item.start}` : '');
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.title = 'YouTube video';
        box.appendChild(f);
        face.remove();
      }
    });
    return outer;
  }

  function renderMedia(items, photos) {
    const wrap = el('div', 'media');
    let run = [];
    const flushRun = () => { if (run.length) { wrap.appendChild(photoRun(run, photos)); run = []; } };
    for (const it of items) {
      if (it.kind === 'image') { run.push(it); continue; }
      flushRun();
      if (it.kind === 'video') wrap.appendChild(videoBlock(it));
      else if (it.kind === 'audio') wrap.appendChild(audioBlock(it));
      else if (it.kind === 'youtube') wrap.appendChild(youtubeBlock(it));
    }
    flushRun();
    return wrap;
  }

  /* ---------------- Post + divider ---------------- */

  function renderPost(blocks) {
    const art = el('article', 'post');
    const photos = [];
    if (blocks.length === 1 && blocks[0].type === 'text') {
      const t = blocks[0].text;
      if (t.length <= 160 && t.split('\n').length <= 3) art.classList.add('statement');
    }
    for (const b of blocks) {
      art.appendChild(b.type === 'text' ? renderText(b.text) : renderMedia(b.items, photos));
    }
    return art;
  }

  const FANGS =
    '<i></i><svg viewBox="0 0 46 17" aria-hidden="true">' +
    '<path d="M3 2h8c0 5-1.8 10-4 13C4.8 12 3 7 3 2z"/>' +
    '<path d="M17 0h12c0 7-2.4 13-6 17-3.6-4-6-10-6-17z"/>' +
    '<path d="M35 2h8c0 5-1.8 10-4 13-2.2-3-4-8-4-13z"/></svg><i></i>';

  function divider(extra) {
    const d = el('div', 'sep' + (extra ? ' ' + extra : ''));
    d.setAttribute('role', 'separator');
    d.setAttribute('aria-hidden', 'true');
    d.innerHTML = FANGS;
    return d;
  }

  /* ---------------- Photo viewer ---------------- */

  const lb = $('#lb'), lbImg = $('#lb-img'), lbStage = $('#lb-stage');
  const lbCount = $('#lb-count'), lbOrig = $('#lb-orig');
  const lbPrev = $('#lb-prev'), lbNext = $('#lb-next'), lbClose = $('#lb-close');
  let lbList = [], lbIndex = 0, lbOpener = null;

  function showPhoto() {
    const it = lbList[lbIndex];
    lb.classList.remove('actual');
    lbImg.src = it.src;
    lbOrig.href = it.src;
    const multi = lbList.length > 1;
    lbCount.textContent = multi ? `${lbIndex + 1} / ${lbList.length}` : '';
    lbPrev.hidden = lbNext.hidden = !multi;
    if (multi) {
      [1, -1].forEach((d) => { new Image().src = lbList[(lbIndex + d + lbList.length) % lbList.length].src; });
    }
  }
  function openLightbox(list, i) {
    lbList = list;
    lbIndex = i;
    lbOpener = document.activeElement;
    lb.hidden = false;
    document.body.classList.add('noscroll');
    showPhoto();
    lbClose.focus();
  }
  function closeLightbox() {
    lb.hidden = true;
    lbImg.removeAttribute('src');
    document.body.classList.remove('noscroll');
    if (lbOpener && lbOpener.focus) lbOpener.focus();
  }
  function step(d) {
    if (lbList.length < 2) return;
    lbIndex = (lbIndex + d + lbList.length) % lbList.length;
    showPhoto();
  }

  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', () => step(-1));
  lbNext.addEventListener('click', () => step(1));
  lbImg.addEventListener('click', () => lb.classList.toggle('actual'));
  lbStage.addEventListener('click', (e) => { if (e.target === lbStage) closeLightbox(); });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });
  let touchX = null;
  lbStage.addEventListener('touchstart', (e) => { touchX = e.touches.length === 1 ? e.touches[0].clientX : null; }, { passive: true });
  lbStage.addEventListener('touchend', (e) => {
    if (touchX == null || lb.classList.contains('actual')) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* ---------------- Profile header ---------------- */

  const photoRaw = toRaw(CONFIG.photo);

  function setupProfile() {
    document.title = CONFIG.name;
    $('#name').textContent = CONFIG.name;
    if (CONFIG.tagline) { const t = $('#tag'); t.textContent = CONFIG.tagline; t.hidden = false; }

    document.documentElement.style.setProperty('--photo', `url("${photoRaw}")`);
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = photoRaw;
    document.head.appendChild(icon);

    const img = $('#avatar-img');
    const { zoom, x, y } = CONFIG.avatar;
    img.style.width = img.style.height = `${zoom * 100}%`;
    img.style.left = `${(0.5 - x * zoom) * 100}%`;
    img.style.top = `${(0.5 - y * zoom) * 100}%`;
    img.addEventListener('error', () => {
      const local = decodeURIComponent(CONFIG.photo.split('?')[0].split('/').pop());
      if (img.getAttribute('src') !== local) img.src = local;
    });
    img.src = photoRaw;
    $('#avatar').addEventListener('click', () => openLightbox([{ src: photoRaw, orig: CONFIG.photo }], 0));

    $('#share').addEventListener('click', shareProfile);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1800);
  }

  async function shareProfile() {
    const url = CONFIG.siteUrl || location.href.split('#')[0];
    try {
      if (navigator.share) { await navigator.share({ title: CONFIG.name, url }); return; }
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Link copied'); } catch { toast(url); }
      ta.remove();
    }
  }

  /* ---------------- Loading + infinite feed ---------------- */

  async function fetchPostFile() {
    const bust = '?v=' + Date.now();
    const remote = `https://raw.githubusercontent.com/${CONFIG.user}/${CONFIG.repo}/${CONFIG.branch}/${CONFIG.postFile}`;
    for (const u of [encodeURI(CONFIG.postFile) + bust, remote + bust]) {
      try {
        const r = await fetch(u, { cache: 'no-store' });
        if (r.ok) return await r.text();
      } catch { /* try the next source */ }
    }
    throw new Error('Post file not found');
  }

  const feed = $('#feed'), sentinel = $('#sentinel'), statusEl = $('#status');
  let posts = [], rendered = 0;

  function renderMore() {
    const end = Math.min(rendered + CONFIG.batch, posts.length);
    const frag = document.createDocumentFragment();
    for (; rendered < end; rendered++) {
      if (rendered > 0) frag.appendChild(divider());
      frag.appendChild(renderPost(posts[rendered]));
    }
    feed.appendChild(frag);
    requestAnimationFrame(checkClamps);
    if (rendered >= posts.length) {
      io.disconnect();
      feed.appendChild(divider('end'));
    }
  }

  function pump() {
    while (rendered < posts.length && sentinel.getBoundingClientRect().top < window.innerHeight + 1200) renderMore();
  }

  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) pump();
  }, { rootMargin: '1200px 0px' });

  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(checkClamps, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(checkClamps);

  async function init() {
    setupProfile();
    try {
      posts = parseFile(await fetchPostFile());
    } catch {
      statusEl.textContent = `Could not load ${CONFIG.postFile}. Check that it is in the repository.`;
      return;
    }
    $('#count').textContent = posts.length === 1 ? '1 post' : `${posts.length} posts`;
    if (!posts.length) {
      statusEl.textContent = `No posts yet. Add text to ${CONFIG.postFile}.`;
      return;
    }
    statusEl.textContent = '';
    io.observe(sentinel);
    pump();
  }

  init();
})();

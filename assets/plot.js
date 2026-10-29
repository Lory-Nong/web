(() => {
  const site = window.SITE || {};
  const slug = document.body.dataset.plot;
  const plot = (site.plots || []).find((p) => p.slug === slug);
  const PALETTE = ['#2f6fd6', '#e0567f', '#2fa37a', '#d08a1e', '#7a5cd6', '#0a0a0a'];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paras = (text) => String(text || '')
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const ink = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.62 ? '#111111' : '#ffffff';
  };

  if (!plot) {
    document.body.insertAdjacentHTML('afterbegin', `<main class="intro wrap"><h1 class="reveal">404</h1><p class="missing reveal">이 페이지는 아직 없어요.</p></main><footer class="wrap"><a href="../">← 처음으로</a></footer>`);
    return;
  }

  const cast = Array.isArray(plot.characters) && plot.characters.length
    ? plot.characters
    : [{ name: plot.title, caption: plot.caption, image: plot.image, v: plot.v, about: plot.about, info: plot.info, quote: plot.quote }];
  const colorOf = (i) => cast[i].color || PALETTE[i % PALETTE.length];
  const many = cast.length > 1;

  const view = (c) => {
    let n = 0;
    const head = (heading) => `<div class="section-head reveal"><span class="num">${String(++n).padStart(2, '0')}</span>${heading ? `<h2>${esc(heading)}</h2>` : ''}</div>`;
    const parts = [];
    const about = c.about || {};
    if (about.heading || about.text) {
      parts.push(`<section class="section wrap split">${head(about.heading)}<div class="about-text reveal">${paras(about.text)}</div></section>`);
    }
    const info = c.info || {};
    const rows = (info.rows || []).filter((r) => r[0] || r[1]);
    if (info.heading || rows.length) {
      parts.push(`<section class="section wrap split">${head(info.heading)}<dl class="info">${rows.map((r) => `<div class="row reveal"><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl></section>`);
    }
    const quote = c.quote || {};
    if (quote.heading || quote.text) {
      parts.push(`<section class="section wrap split">${head(quote.heading)}<blockquote class="quote reveal">${paras(quote.text)}</blockquote></section>`);
    }
    const photo = c.image ? `<div class="hero-photo reveal"><img src="${esc(c.image)}?v=${esc(c.v || 0)}" alt=""></div>` : '';
    const caption = c.caption ? `<p class="caption reveal">${esc(c.caption)}</p>` : '';
    const hero = photo || caption ? `<header class="hero">${photo}${caption}</header>` : '';
    const name = c.name || plot.title;
    const eyebrow = name !== plot.title ? `<p class="story reveal">${esc(plot.title)}</p>` : '';
    return `${hero}<main><section class="intro wrap">${eyebrow}<h1 class="reveal">${esc(name)}</h1></section>${parts.join('')}</main>`;
  };

  const nav = many
    ? `<nav class="cast" aria-label="캐릭터"><div class="cast-track" role="tablist"><span class="cast-glow" aria-hidden="true"></span>${cast.map((c, i) => `<button class="cast-pill" type="button" role="tab" data-i="${i}">${esc(c.name || `캐릭터 ${i + 1}`)}</button>`).join('')}</div></nav>`
    : '';
  document.body.insertAdjacentHTML('afterbegin', `${nav}<div class="stage"></div><footer class="wrap"><a href="../">← 처음으로</a><span>© 2026 ${esc(plot.title)}</span></footer>`);

  const stage = document.querySelector('.stage');
  const track = document.querySelector('.cast-track');
  const glow = document.querySelector('.cast-glow');
  const pills = [...document.querySelectorAll('.cast-pill')];
  let theme = document.querySelector('meta[name="theme-color"]');
  if (!theme) {
    theme = document.createElement('meta');
    theme.name = 'theme-color';
    document.head.appendChild(theme);
  }
  let current = -1;
  let busy = false;

  const place = () => {
    const pill = pills[current];
    if (!pill || !glow) return;
    glow.style.width = pill.offsetWidth + 'px';
    glow.style.transform = `translateX(${pill.offsetLeft}px)`;
    if (track.scrollWidth > track.clientWidth) {
      track.scrollTo({ left: pill.offsetLeft - (track.clientWidth - pill.offsetWidth) / 2, behavior: 'smooth' });
    }
  };

  const paint = (i) => {
    const color = colorOf(i);
    document.body.style.setProperty('--c', color);
    document.body.style.setProperty('--ink', ink(color));
    theme.content = color;
    pills.forEach((p, k) => {
      p.classList.toggle('on', k === i);
      p.setAttribute('aria-selected', String(k === i));
    });
    place();
  };

  const render = (i) => {
    current = i;
    stage.innerHTML = view(cast[i]);
    const name = cast[i].name || plot.title;
    document.title = many ? `${name} · ${plot.title}` : plot.title || slug;
    paint(i);
    document.dispatchEvent(new Event('dream:refresh'));
  };

  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const go = (i) => {
    if (busy || i === current || i < 0 || i >= cast.length) return;
    const dir = i > current ? -1 : 1;
    history.replaceState(null, '', '#' + encodeURIComponent(cast[i].name || String(i + 1)));
    if (calm.matches) {
      render(i);
      return;
    }
    busy = true;
    paint(i);
    stage.style.setProperty('--shift', `${dir * 28}px`);
    stage.classList.add('out');
    setTimeout(() => {
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
      render(i);
      stage.style.transition = 'none';
      stage.classList.remove('out');
      stage.offsetWidth;
      stage.style.transition = '';
      busy = false;
    }, 320);
  };

  const fromHash = () => {
    const key = decodeURIComponent(location.hash.slice(1));
    const found = cast.findIndex((c, i) => (c.name || String(i + 1)) === key);
    return found >= 0 ? found : 0;
  };

  render(fromHash());

  if (many) {
    track.addEventListener('click', (e) => {
      const pill = e.target.closest('.cast-pill');
      if (pill) go(Number(pill.dataset.i));
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') go(current + 1);
      if (e.key === 'ArrowLeft') go(current - 1);
    });
    let sx = 0;
    let sy = 0;
    stage.addEventListener('touchstart', (e) => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) go(current + (dx < 0 ? 1 : -1));
    }, { passive: true });
    window.addEventListener('resize', place);
    if (document.fonts) document.fonts.ready.then(place);
    window.addEventListener('hashchange', () => go(fromHash()));
  }
})();

(() => {
  const site = window.SITE || {};
  const slug = document.body.dataset.plot;
  const plot = (site.plots || []).find((p) => p.slug === slug);
  const PALETTE = ['#2f6fd6', '#e0567f', '#2fa37a', '#d08a1e', '#7a5cd6', '#0a0a0a'];
  const { esc, rich, favs, recent, theme: siteTheme, icons, share } = window.UI;
  const paras = (text) => String(text || '')
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<p>${rich(t).replace(/\n/g, '<br>')}</p>`)
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
      parts.push(`<section class="section wrap split">${head(info.heading)}<dl class="info">${rows.map((r) => `<div class="row reveal"><dt>${esc(r[0])}</dt><dd>${rich(r[1])}</dd></div>`).join('')}</dl></section>`);
    }
    const quote = c.quote || {};
    if (quote.heading || quote.text) {
      parts.push(`<section class="section wrap split">${head(quote.heading)}<blockquote class="quote reveal">${paras(quote.text)}</blockquote></section>`);
    }
    const photo = c.image ? `<div class="hero-photo reveal" role="button" tabindex="0" aria-label="그림 크게 보기"><img src="${esc(c.image)}?v=${esc(c.v || 0)}" alt=""></div>` : '';
    const caption = c.caption ? `<p class="caption reveal">${esc(c.caption)}</p>` : '';
    const hero = photo || caption ? `<header class="hero">${photo}${caption}</header>` : '';
    const name = c.name || plot.title;
    const eyebrow = name !== plot.title ? `<p class="story reveal">${esc(plot.title)}</p>` : '';
    return `${hero}<main><section class="intro wrap">${eyebrow}<h1 class="reveal">${esc(name)}</h1></section>${parts.join('')}</main>`;
  };

  const nav = many
    ? `<nav class="cast" aria-label="캐릭터"><div class="cast-track" role="tablist"><span class="cast-glow" aria-hidden="true"></span>${cast.map((c, i) => `<button class="cast-pill" type="button" role="tab" data-i="${i}">${esc(c.name || `캐릭터 ${i + 1}`)}</button>`).join('')}</div></nav>`
    : '';
  const open = (site.plots || []).filter((p) => p.slug && !p.soon);
  const at = open.findIndex((p) => p.slug === slug);
  const pageLink = (p, cls, label) => (p ? `<a class="${cls}" href="../${esc(p.slug)}/"><small>${label}</small><b>${esc(p.listTitle || p.title)}</b></a>` : '<span></span>');
  const pager = open.length > 1 && at >= 0
    ? `<nav class="pager wrap" aria-label="다른 플롯">${pageLink(open[at - 1], 'prev', '← 이전 플롯')}${pageLink(open[at + 1], 'next', '다음 플롯 →')}</nav>`
    : '';
  const dock = `<div class="dock"><button class="dock-btn dock-top" type="button" aria-label="맨 위로">${icons.up}</button><button class="dock-btn dock-theme" type="button" aria-label="화면 색 바꾸기"></button><button class="dock-btn dock-share" type="button" aria-label="링크 공유">${icons.share}</button><button class="dock-btn dock-fav" type="button" aria-label="즐겨찾기">${icons.heart}</button></div>`;
  document.body.insertAdjacentHTML('afterbegin', `<div class="progress" aria-hidden="true"></div>${nav}<div class="stage"></div>${pager}<footer class="wrap"><a href="../">← 처음으로</a><span>© 2026 ${esc(plot.title)}</span></footer>${dock}<div class="lightbox" aria-hidden="true"><img alt=""></div>`);
  recent.add(slug);

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

  const progress = document.querySelector('.progress');
  const topBtn = document.querySelector('.dock-top');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    topBtn.classList.toggle('on', scrollY > 500);
  };
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScroll);
  }, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
  topBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  const favBtn = document.querySelector('.dock-fav');
  const paintFav = (on) => {
    favBtn.classList.toggle('on', on);
    favBtn.setAttribute('aria-pressed', String(on));
  };
  paintFav(favs.has(slug));
  favBtn.addEventListener('click', () => {
    const on = favs.toggle(slug);
    paintFav(on);
    window.UI.toast(on ? '즐겨찾기에 넣었어요.' : '즐겨찾기에서 뺐어요.');
  });

  document.querySelector('.dock-share').addEventListener('click', () => share(document.title));

  const themeBtn = document.querySelector('.dock-theme');
  const paintTheme = () => {
    themeBtn.innerHTML = siteTheme.current() === 'dark' ? icons.sun : icons.moon;
  };
  paintTheme();
  themeBtn.addEventListener('click', () => {
    siteTheme.toggle();
    paintTheme();
  });

  const box = document.querySelector('.lightbox');
  const boxImg = box.querySelector('img');
  const closeBox = () => box.classList.remove('on');
  const openBox = (src) => {
    boxImg.src = src;
    box.classList.add('on');
  };
  box.addEventListener('click', closeBox);
  const toggleSpoiler = (el) => el.classList.toggle('open');
  stage.addEventListener('click', (e) => {
    const spoiler = e.target.closest('.spoiler');
    if (spoiler) {
      toggleSpoiler(spoiler);
      return;
    }
    const photo = e.target.closest('.hero-photo');
    if (photo) openBox(photo.querySelector('img').src);
  });
  stage.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const spoiler = e.target.closest('.spoiler');
    const photo = e.target.closest('.hero-photo');
    if (!spoiler && !photo) return;
    e.preventDefault();
    if (spoiler) toggleSpoiler(spoiler);
    else openBox(photo.querySelector('img').src);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBox();
  });

  if (many) {
    track.addEventListener('click', (e) => {
      const pill = e.target.closest('.cast-pill');
      if (pill) go(Number(pill.dataset.i));
    });
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select') || e.altKey || e.ctrlKey || e.metaKey || box.classList.contains('on')) return;
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

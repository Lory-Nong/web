(() => {
  const site = window.SITE || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const title = document.querySelector('[data-site-title]');
  const sub = document.querySelector('[data-site-sub]');
  if (site.title && title) {
    title.textContent = site.title;
    document.title = site.title;
  }
  if (site.subtitle && sub) sub.textContent = site.subtitle;

  const list = document.getElementById('plots');
  if (list && Array.isArray(site.plots)) {
    list.innerHTML = site.plots.map((p) => {
      const thumb = p.slug && p.image ? `<img src="${esc(p.slug)}/${esc(p.image)}?v=${esc(p.v || 0)}" alt="" loading="lazy">` : '';
      const names = Array.isArray(p.characters) && p.characters.length > 1
        ? `<p class="cast-names">${p.characters.map((c) => esc(c.name)).filter(Boolean).join(' · ')}</p>`
        : '';
      const body = `<div class="thumb">${thumb}</div><div><h2>${esc(p.listTitle || p.title)}</h2>${names}</div>`;
      return p.slug && !p.soon
        ? `<li class="reveal"><a class="item" href="${esc(p.slug)}/">${body}<span class="arrow">→</span></a></li>`
        : `<li class="reveal"><div class="item soon">${body}</div></li>`;
    }).join('');
  }

  const href = (url) => {
    const v = String(url).trim();
    if (/^(https?:|mailto:)/i.test(v)) return v;
    if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return 'mailto:' + v;
    return 'https://' + v.replace(/^[a-z]+:\/*/i, '').replace(/^\/+/, '');
  };
  const links = document.getElementById('menu-links');
  if (links) {
    links.innerHTML = (site.links || [])
      .filter((l) => l && l.label && l.url)
      .map((l, i) => {
        const h = href(l.url);
        const external = !h.startsWith('mailto:');
        return `<a href="${esc(h)}" style="--i:${i}"${external ? ' target="_blank" rel="noopener"' : ''}><span>${esc(l.label)}</span><span class="arrow">→</span></a>`;
      })
      .join('');
  }

  const btn = document.querySelector('.menu-btn');
  const panel = document.getElementById('menu');
  const backdrop = document.querySelector('.menu-backdrop');
  if (!btn || !panel) return;
  const isOpen = () => document.body.classList.contains('menu-open');
  const setOpen = (open) => {
    document.body.classList.toggle('menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    if (open) panel.focus({ preventScroll: true });
    else btn.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => setOpen(!isOpen()));
  if (backdrop) backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) setOpen(false);
  });
})();

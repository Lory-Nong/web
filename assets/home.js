(() => {
  const site = window.SITE || {};
  const { esc, store, favs, recent, theme, icons } = window.UI;
  const NEW_DAYS = 14;
  const title = document.querySelector('[data-site-title]');
  const sub = document.querySelector('[data-site-sub]');
  if (site.title && title) {
    title.textContent = site.title;
    document.title = site.title;
  }
  if (site.subtitle && sub) sub.textContent = site.subtitle;

  const list = document.getElementById('plots');
  const plots = Array.isArray(site.plots) ? site.plots : [];
  const isOpenPlot = (p) => Boolean(p.slug && !p.soon);
  const castOf = (p) => (Array.isArray(p.characters) ? p.characters : []);
  const tagsOf = (p) => (Array.isArray(p.tags) ? p.tags.filter(Boolean) : []);
  const fresh = (p) => p.createdAt && Date.now() - p.createdAt < NEW_DAYS * 86400000;

  list.innerHTML = plots.map((p, i) => {
    const badge = isOpenPlot(p) && fresh(p) ? '<span class="new">NEW</span>' : '';
    const thumb = p.slug && p.image ? `<img src="${esc(p.slug)}/${esc(p.image)}?v=${esc(p.v || 0)}" alt="" loading="lazy">${badge}` : '';
    const names = castOf(p).length > 1
      ? `<p class="cast-names">${castOf(p).map((c) => esc(c.name)).filter(Boolean).join(' · ')}</p>`
      : '';
    const tags = tagsOf(p).length ? `<p class="tags">${tagsOf(p).map((t) => `#${esc(t)}`).join(' ')}</p>` : '';
    const body = `<div class="thumb">${thumb}</div><div><h2>${esc(p.listTitle || p.title)}</h2>${names}${tags}</div>`;
    return isOpenPlot(p)
      ? `<li class="reveal" data-i="${i}"><a class="item" href="${esc(p.slug)}/">${body}<span class="arrow">→</span></a><button class="fav${favs.has(p.slug) ? ' on' : ''}" type="button" aria-label="즐겨찾기" aria-pressed="${favs.has(p.slug)}">${icons.heart}</button></li>`
      : `<li class="reveal" data-i="${i}"><div class="item soon">${body}</div></li>`;
  }).join('');

  const rows = [...list.children].map((li) => {
    const p = plots[Number(li.dataset.i)];
    const hay = [p.title, p.listTitle, ...tagsOf(p), ...castOf(p).flatMap((c) => [c.name, c.caption]), p.caption].filter(Boolean).join(' ').toLowerCase();
    return { li, p, i: Number(li.dataset.i), hay };
  });
  const input = document.getElementById('q');
  const filters = document.getElementById('filters');
  const sorts = document.getElementById('sorts');
  const count = document.getElementById('count');
  const empty = document.getElementById('empty');
  const allTags = [...new Set(plots.flatMap(tagsOf))];
  let filter = '';
  let sort = store.get('lul-sort', '');

  filters.innerHTML = [
    ['', '전체'],
    ['fav', '♥ 즐겨찾기'],
    ['recent', '최근 본'],
    ...allTags.map((t) => [`#${t}`, `#${t}`])
  ].map(([key, label]) => `<button class="filter" type="button" data-filter="${esc(key)}">${esc(label)}</button>`).join('');

  const matches = (r) => {
    if (filter === 'fav') return favs.has(r.p.slug);
    if (filter === 'recent') return recent.all().includes(r.p.slug);
    if (filter.startsWith('#')) return tagsOf(r.p).includes(filter.slice(1));
    return true;
  };

  const compare = (a, b) => {
    if (filter === 'recent') return recent.all().indexOf(a.p.slug) - recent.all().indexOf(b.p.slug);
    if (sort === 'latest') return (b.p.updatedAt || 0) - (a.p.updatedAt || 0) || a.i - b.i;
    if (sort === 'name') return String(a.p.listTitle || a.p.title).localeCompare(String(b.p.listTitle || b.p.title), 'ko');
    return a.i - b.i;
  };

  const apply = (reorder) => {
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    rows.forEach((r) => {
      const ok = matches(r) && (!q || r.hay.includes(q));
      r.li.hidden = !ok;
      if (ok) shown += 1;
    });
    if (reorder) [...rows].sort(compare).forEach((r) => list.appendChild(r.li));
    empty.hidden = shown > 0;
    list.style.display = shown ? '' : 'none';
    count.textContent = `${shown}개`;
    filters.querySelectorAll('.filter').forEach((b) => b.classList.toggle('on', b.dataset.filter === filter));
    sorts.querySelectorAll('.sort').forEach((b) => b.classList.toggle('on', b.dataset.sort === sort));
  };

  input.addEventListener('input', () => apply(false));
  filters.addEventListener('click', (e) => {
    const b = e.target.closest('.filter');
    if (!b) return;
    filter = b.dataset.filter;
    apply(true);
  });
  sorts.addEventListener('click', (e) => {
    const b = e.target.closest('.sort');
    if (!b) return;
    sort = b.dataset.sort;
    store.set('lul-sort', sort);
    apply(true);
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.fav');
    if (!b) return;
    const r = rows.find((x) => x.li === b.closest('li'));
    const on = favs.toggle(r.p.slug);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
    if (filter === 'fav') apply(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.target.closest('input, textarea')) {
      e.preventDefault();
      input.focus();
    }
  });
  apply(true);

  document.getElementById('search-icon').innerHTML = icons.search;
  const random = document.getElementById('random');
  random.innerHTML = `${icons.dice}<span>아무거나</span>`;
  random.addEventListener('click', () => {
    const open = plots.filter(isOpenPlot);
    if (!open.length) return;
    const pick = open[Math.floor(Math.random() * open.length)];
    location.href = `${pick.slug}/${location.protocol === 'file:' ? 'index.html' : ''}`;
  });

  const notice = document.getElementById('notice');
  document.getElementById('notice-close').innerHTML = icons.close;
  if (site.notice && store.get('lul-notice', '') !== site.notice) {
    document.getElementById('notice-text').textContent = site.notice;
    notice.hidden = false;
  }
  document.getElementById('notice-close').addEventListener('click', () => {
    store.set('lul-notice', site.notice);
    notice.hidden = true;
  });

  const themeBtn = document.getElementById('theme-btn');
  const paintTheme = () => {
    themeBtn.innerHTML = theme.current() === 'dark' ? `${icons.sun}라이트 모드` : `${icons.moon}다크 모드`;
  };
  paintTheme();
  themeBtn.addEventListener('click', () => {
    theme.toggle();
    paintTheme();
  });

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

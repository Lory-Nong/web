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
  if (!list || !Array.isArray(site.plots)) return;
  list.innerHTML = site.plots.map((p) => {
    const thumb = p.slug && p.image ? `<img src="${esc(p.slug)}/${esc(p.image)}?v=${esc(p.v || 0)}" alt="" loading="lazy">` : '';
    const open = p.slug && !p.soon;
    const body = `<div class="thumb">${thumb}</div><div><span class="path">/${open ? esc(p.slug) : '???'}</span><h2>${esc(p.listTitle || p.title)}</h2></div>`;
    return open
      ? `<li class="reveal"><a class="item" href="${esc(p.slug)}/">${body}<span class="arrow">→</span></a></li>`
      : `<li class="reveal"><div class="item soon">${body}</div></li>`;
  }).join('');
})();

(() => {
  const site = window.SITE || {};
  const slug = document.body.dataset.plot;
  const plot = (site.plots || []).find((p) => p.slug === slug);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paras = (text) => String(text || '')
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`)
    .join('');

  if (!plot) {
    document.body.insertAdjacentHTML('afterbegin', `<main class="intro wrap"><h1 class="reveal">404</h1><p class="missing reveal">이 페이지는 아직 없어요.</p></main><footer class="wrap"><a href="../">← 처음으로</a></footer>`);
    return;
  }

  document.title = plot.title || slug;
  let n = 0;
  const head = (heading) => `<div class="section-head reveal"><span class="num">${String(++n).padStart(2, '0')}</span>${heading ? `<h2>${esc(heading)}</h2>` : ''}</div>`;
  const parts = [];

  const about = plot.about || {};
  if (about.heading || about.text) {
    parts.push(`<section class="section wrap split">${head(about.heading)}<div class="about-text reveal">${paras(about.text)}</div></section>`);
  }

  const info = plot.info || {};
  const rows = (info.rows || []).filter((r) => r[0] || r[1]);
  if (info.heading || rows.length) {
    parts.push(`<section class="section wrap split">${head(info.heading)}<dl class="info">${rows.map((r) => `<div class="row reveal"><dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl></section>`);
  }

  const quote = plot.quote || {};
  if (quote.heading || quote.text) {
    parts.push(`<section class="section wrap split">${head(quote.heading)}<blockquote class="quote reveal">${paras(quote.text)}</blockquote></section>`);
  }

  const photo = plot.image ? `<div class="hero-photo reveal"><img src="${esc(plot.image)}?v=${esc(plot.v || 0)}" alt=""></div>` : '';
  const caption = plot.caption ? `<p class="caption reveal">${esc(plot.caption)}</p>` : '';
  const hero = photo || caption ? `<header class="hero">${photo}${caption}</header>` : '';

  document.body.insertAdjacentHTML('afterbegin', `${hero}<main><section class="intro wrap"><h1 class="reveal">${esc(plot.title)}</h1></section>${parts.join('')}</main><footer class="wrap"><a href="../">← 처음으로</a><span>© 2026 ${esc(plot.title)}</span></footer>`);
})();

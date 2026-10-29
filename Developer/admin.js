const SERVER = 'https://lul-admin.igm12345678a.workers.dev';
const KEY = 'lul-admin-session';
const DEFAULT_WHISPERS = ['깨어나', '여기는 꿈이 아니야', '누가 보고 있어', '돌아갈 수 없어', '아직 거기 있니', '문을 열지 마', '너를 기억하고 있어', '눈을 감아'];
const LINK_PH = ['이름', '주소'];

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = new TextEncoder();
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let session = null;
let site = null;
let editing = null;
let newImage = null;
let toastTimer = null;

const show = (name) => {
  document.querySelectorAll('[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  window.scrollTo(0, 0);
};

const toast = (msg, error = false) => {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, error ? 7000 : 4000);
};

const run = async (button, label, fn) => {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    await fn();
  } catch (e) {
    toast(e.message || String(e), true);
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
};

const bytesToB64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const textToB64 = (text) => bytesToB64(enc.encode(text));
const blobToB64 = async (blob) => bytesToB64(new Uint8Array(await blob.arrayBuffer()));

const remember = (t) => {
  session = t;
  try { sessionStorage.setItem(KEY, t); } catch {}
};

const forget = () => {
  session = null;
  try { sessionStorage.removeItem(KEY); } catch {}
};

const api = async (path, { method = 'GET', body, raw = false } = {}) => {
  let res;
  try {
    res = await fetch(SERVER + path, {
      method,
      cache: 'no-store',
      headers: {
        ...(session ? { Authorization: `Bearer ${session}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
    });
  } catch {
    throw new Error('서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
  }
  if (res.status === 401 && path !== '/login') {
    forget();
    site = null;
    show('login');
  }
  if (raw && (res.ok || res.status === 404)) return res;
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error((data && data.error) || `서버 오류 ${res.status}`);
  return data;
};

const commit = async (message, files) => {
  const list = [];
  for (const f of files) {
    if (f.content == null) {
      list.push({ path: f.path, sha: null });
    } else {
      const blob = await api('/blob', { method: 'POST', body: JSON.stringify({ content: f.content, encoding: 'base64' }) });
      list.push({ path: f.path, sha: blob.sha });
    }
  }
  await api('/commit', { method: 'POST', body: { message, files: list } });
};

const readSite = async () => {
  const res = await api('/site', { raw: true });
  const text = res.status === 404 ? '' : await res.text();
  const data = text.trim() ? JSON.parse(text.replace(/^\s*window\.SITE\s*=\s*/, '').replace(/;\s*$/, '')) : {};
  data.title = data.title || '';
  data.subtitle = data.subtitle || '';
  data.whispers = Array.isArray(data.whispers) ? data.whispers : [];
  data.plots = Array.isArray(data.plots) ? data.plots : [];
  data.links = Array.isArray(data.links) ? data.links : [];
  data.plots.forEach((p, i) => { p.id = p.id || p.slug || `item-${i}`; });
  return data;
};

const siteFile = (data) => ({ path: 'data/site.js', content: textToB64('window.SITE = ' + JSON.stringify(data, null, 2) + ';\n') });

const save = async (message, change) => {
  const fresh = await readSite();
  const files = (await change(fresh)) || [];
  await commit(message, [siteFile(fresh), ...files]);
  site = fresh;
  renderDash();
  toast('저장했어요. 사이트에는 1~2분 뒤에 반영돼요.');
};

const stub = (slug, title) => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="../assets/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="../assets/common.css">
<link rel="stylesheet" href="../assets/plot.css">
<script>document.documentElement.classList.add('js')</script>
</head>
<body data-view="plot" data-plot="${esc(slug)}">
<script src="../assets/boot.js" data-root="../"></script>
</body>
</html>
`;

const toJpeg = async (file) => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  let quality = 0.92;
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  while (blob.size > 950000 && quality > 0.5) {
    quality -= 0.08;
    blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  }
  return blob;
};

const thumbSrc = (p) => (p.slug && p.image ? `../${encodeURIComponent(p.slug)}/${encodeURIComponent(p.image)}?v=${p.v || 0}` : '');

const addRow = (box, k = '', v = '', ph = ['항목', '내용']) => {
  $(box).insertAdjacentHTML('beforeend', `<div class="pair"><input type="text" class="k" placeholder="${ph[0]}" value="${esc(k)}"><input type="text" class="v" placeholder="${ph[1]}" value="${esc(v)}"><button class="icon" type="button" data-act="row-del" aria-label="항목 삭제">×</button></div>`);
};

const renderDash = () => {
  $('#plot-list').innerHTML = site.plots.length
    ? site.plots.map((p) => `
      <li data-id="${esc(p.id)}">
        <div class="mini">${thumbSrc(p) ? `<img src="${esc(thumbSrc(p))}" alt="">` : ''}</div>
        <div class="meta"><strong>${esc(p.listTitle || p.title || '(제목 없음)')}</strong><span>/${esc(p.slug || '???')}${p.soon ? ' · 미완성' : ''}</span></div>
        <div class="tools">
          <button class="icon" type="button" data-act="up" aria-label="위로">↑</button>
          <button class="icon" type="button" data-act="down" aria-label="아래로">↓</button>
          <button class="btn small" type="button" data-act="edit">수정</button>
          <button class="btn small" type="button" data-act="del">삭제</button>
        </div>
      </li>`).join('')
    : '<li class="empty">아직 플롯이 없어요.</li>';
  $('#order-save').hidden = true;
  $('#set-title').value = site.title;
  $('#set-sub').value = site.subtitle;
  $('#set-whispers').value = (site.whispers.length ? site.whispers : DEFAULT_WHISPERS).join('\n');
  $('#set-links').innerHTML = '';
  site.links.forEach((l) => addRow('#set-links', l.label, l.url, LINK_PH));
};

const openEditor = (plot) => {
  editing = plot || null;
  newImage = null;
  const p = plot || {
    slug: '', title: '', listTitle: '', caption: '', image: '',
    about: { heading: '소개', text: '' },
    info: { heading: '정보', rows: [['이름', ''], ['나이', ''], ['키', '']] },
    quote: { heading: '한마디', text: '' },
    soon: false
  };
  $('#edit-title').textContent = plot ? '플롯 수정' : '새 플롯';
  $('#f-slug').value = p.slug || '';
  $('#f-slug').readOnly = Boolean(plot && plot.slug);
  $('#f-title').value = p.title || '';
  $('#f-list').value = p.listTitle || '';
  $('#f-caption').value = p.caption || '';
  $('#f-about-h').value = (p.about && p.about.heading) || '';
  $('#f-about').value = (p.about && p.about.text) || '';
  $('#f-info-h').value = (p.info && p.info.heading) || '';
  $('#f-quote-h').value = (p.quote && p.quote.heading) || '';
  $('#f-quote').value = (p.quote && p.quote.text) || '';
  $('#f-soon').checked = Boolean(p.soon);
  $('#f-image').value = '';
  $('#f-image-info').textContent = '';
  $('#f-preview').innerHTML = thumbSrc(p) ? `<img src="${esc(thumbSrc(p))}" alt="">` : '';
  $('#f-rows').innerHTML = '';
  ((p.info && p.info.rows) || []).forEach((r) => addRow('#f-rows', r[0], r[1]));
  show('edit');
};

const collect = () => ({
  slug: $('#f-slug').value.trim(),
  title: $('#f-title').value.trim(),
  listTitle: $('#f-list').value.trim(),
  caption: $('#f-caption').value.trim(),
  about: { heading: $('#f-about-h').value.trim(), text: $('#f-about').value.trim() },
  info: {
    heading: $('#f-info-h').value.trim(),
    rows: [...document.querySelectorAll('#f-rows .pair')]
      .map((r) => [r.querySelector('.k').value.trim(), r.querySelector('.v').value.trim()])
      .filter((r) => r[0] || r[1])
  },
  quote: { heading: $('#f-quote-h').value.trim(), text: $('#f-quote').value.trim() },
  soon: $('#f-soon').checked
});

const enter = async () => {
  await api('/me');
  site = await readSite();
  renderDash();
  show('dash');
};

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(e.submitter || $('#login-form button'), '확인 중…', async () => {
    const data = await api('/login', { method: 'POST', body: { id: $('#login-id').value.trim(), password: $('#login-pw').value } });
    $('#login-pw').value = '';
    remember(data.token);
    try {
      await enter();
    } catch (err) {
      forget();
      throw err;
    }
  });
});

$('#settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(e.submitter || $('#settings-form button'), '저장 중…', () => save('사이트 설정 변경', (fresh) => {
    fresh.title = $('#set-title').value.trim();
    fresh.subtitle = $('#set-sub').value.trim();
    fresh.whispers = $('#set-whispers').value.split('\n').map((s) => s.trim()).filter(Boolean);
    fresh.links = [...document.querySelectorAll('#set-links .pair')]
      .map((r) => ({ label: r.querySelector('.k').value.trim(), url: r.querySelector('.v').value.trim() }))
      .filter((l) => l.label || l.url);
  }));
});

$('#f-image').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    newImage = await toJpeg(file);
    $('#f-preview').innerHTML = `<img src="${URL.createObjectURL(newImage)}" alt="">`;
    $('#f-image-info').textContent = `${Math.round(newImage.size / 1024)}KB로 줄여서 올려요.`;
  } catch {
    newImage = null;
    toast('그림을 읽을 수 없어요. 다른 파일로 해 주세요.', true);
  }
});

$('#edit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = collect();
  const id = editing ? editing.id : rid();
  if (!data.title) return toast('제목을 적어 주세요.', true);
  if (!data.slug && !data.soon) return toast('주소를 적어 주세요. 미완성일 때만 비워 둘 수 있어요.', true);
  if (data.slug && !/^[A-Za-z0-9_-]+$/.test(data.slug)) return toast('주소는 영문, 숫자, -, _ 만 쓸 수 있어요.', true);
  if (/^(assets|data|developer)$/i.test(data.slug)) return toast('이 주소는 사이트가 쓰고 있어서 쓸 수 없어요.', true);
  if (newImage && !data.slug) return toast('그림을 올리려면 주소가 있어야 해요.', true);
  run(e.submitter || $('#edit-form button[type="submit"]'), '저장 중…', async () => {
    await save(`${editing ? '플롯 수정' : '플롯 추가'}: ${data.title}`, async (fresh) => {
      if (data.slug && fresh.plots.some((p) => p.id !== id && p.slug && p.slug.toLowerCase() === data.slug.toLowerCase())) {
        throw new Error('이미 같은 주소의 플롯이 있어요.');
      }
      const index = fresh.plots.findIndex((p) => p.id === id);
      const before = index >= 0 ? fresh.plots[index] : null;
      const plot = { id, ...data, image: before ? before.image || '' : '', v: before ? before.v || 0 : 0 };
      const files = [];
      if (data.slug && (!before || before.slug !== data.slug)) {
        files.push({ path: `${data.slug}/index.html`, content: textToB64(stub(data.slug, data.title)) });
      }
      if (newImage) {
        files.push({ path: `${data.slug}/photo.jpg`, content: await blobToB64(newImage) });
        plot.image = 'photo.jpg';
        plot.v = Date.now();
      }
      if (index >= 0) fresh.plots[index] = plot;
      else fresh.plots.push(plot);
      return files;
    });
    show('dash');
  });
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const li = el.closest('li[data-id]');
  const plot = li && site ? site.plots.find((p) => p.id === li.dataset.id) : null;

  if (act === 'logout') {
    forget();
    site = null;
    show('login');
  }
  if (act === 'new') openEditor(null);
  if (act === 'back') show('dash');
  if (act === 'edit' && plot) openEditor(plot);
  if (act === 'row-add') addRow('#f-rows');
  if (act === 'link-add') addRow('#set-links', '', '', LINK_PH);
  if (act === 'row-del') el.closest('.pair').remove();

  if ((act === 'up' || act === 'down') && li) {
    const other = act === 'up' ? li.previousElementSibling : li.nextElementSibling;
    if (!other) return;
    if (act === 'up') other.before(li);
    else other.after(li);
    $('#order-save').hidden = false;
  }

  if (act === 'order-save') {
    const ids = [...document.querySelectorAll('#plot-list li[data-id]')].map((x) => x.dataset.id);
    const rank = (p) => (ids.includes(p.id) ? ids.indexOf(p.id) : ids.length);
    run(el, '저장 중…', () => save('플롯 순서 변경', (fresh) => {
      fresh.plots.sort((a, b) => rank(a) - rank(b));
    }));
  }

  if (act === 'del' && plot) {
    const name = plot.listTitle || plot.title || plot.slug;
    if (!confirm(`'${name}' 플롯을 삭제할까요?\n페이지와 그림도 함께 지워져요.`)) return;
    run(el, '삭제 중…', () => save(`플롯 삭제: ${name}`, async (fresh) => {
      const target = fresh.plots.find((p) => p.id === plot.id);
      fresh.plots = fresh.plots.filter((p) => p.id !== plot.id);
      if (!target || !target.slug) return [];
      const list = await api(`/list?dir=${encodeURIComponent(target.slug)}`);
      return list.filter((f) => f.type === 'file').map((f) => ({ path: f.path, content: null }));
    }));
  }
});

(async () => {
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch {}
  if (saved) {
    session = saved;
    try {
      await enter();
      return;
    } catch (e) {
      forget();
      toast(e.message, true);
    }
  }
  show('login');
})();

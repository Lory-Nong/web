const SERVER = 'https://lul-admin.igm12345678a.workers.dev';
const KEY = 'lul-admin-session';
const DEFAULT_WHISPERS = ['깨어나', '여기는 꿈이 아니야', '누가 보고 있어', '돌아갈 수 없어', '아직 거기 있니', '문을 열지 마', '너를 기억하고 있어', '눈을 감아'];
const PALETTE = ['#2f6fd6', '#e0567f', '#2fa37a', '#d08a1e', '#7a5cd6', '#0a0a0a'];
const LINK_PH = ['이름', '주소'];

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = new TextEncoder();
const rid = () => 'c' + Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('');

let session = null;
let site = null;
let editing = null;
let draft = [];
let cur = 0;
let images = new Map();
let dirty = false;
let toastTimer = null;

const show = (name) => {
  document.querySelectorAll('[data-screen]').forEach((s) => { s.hidden = s.dataset.screen !== name; });
  window.scrollTo(0, 0);
};

const screen = () => {
  const s = [...document.querySelectorAll('[data-screen]')].find((x) => !x.hidden);
  return s ? s.dataset.screen : '';
};

const toast = (msg, error = false) => {
  const t = $('#toast');
  const again = t.classList.contains('on');
  t.innerHTML = `<span class="toast-icon">${error ? '!' : '✓'}</span><span>${esc(msg)}</span>`;
  t.classList.toggle('error', error);
  t.setAttribute('role', error ? 'alert' : 'status');
  t.classList.add('on');
  if (again) {
    t.classList.remove('bump');
    t.offsetWidth;
    t.classList.add('bump');
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on', 'bump'), error ? 6000 : 3500);
};

$('#toast').addEventListener('click', () => {
  clearTimeout(toastTimer);
  $('#toast').classList.remove('on', 'bump');
});

const shake = (el) => {
  el.classList.remove('shake');
  el.offsetWidth;
  el.classList.add('shake');
};

const run = async (button, label, fn) => {
  const old = button.textContent;
  button.disabled = true;
  button.classList.add('busy');
  button.textContent = label;
  try {
    await fn();
  } catch (e) {
    toast(e.message || String(e), true);
  } finally {
    button.disabled = false;
    button.classList.remove('busy');
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
    dirty = false;
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

const ink = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? '#111111' : '#ffffff';
};

const castOf = (p) => (Array.isArray(p.characters) && p.characters.length
  ? structuredClone(p.characters)
  : [{
    id: 'main',
    name: p.title || '',
    color: '',
    caption: p.caption || '',
    image: p.image || '',
    v: p.v || 0,
    about: structuredClone(p.about || { heading: '', text: '' }),
    info: structuredClone(p.info || { heading: '', rows: [] }),
    quote: structuredClone(p.quote || { heading: '', text: '' })
  }]);

const newChar = (i) => ({
  id: rid(),
  name: '',
  color: PALETTE[i % PALETTE.length],
  caption: '',
  image: '',
  v: 0,
  about: { heading: '소개', text: '' },
  info: { heading: '정보', rows: [['이름', ''], ['나이', ''], ['키', '']] },
  quote: { heading: '한마디', text: '' }
});

const colorOf = (c, i) => c.color || PALETTE[i % PALETTE.length];

const fileSrc = (slug, image, v) => (slug && image ? `../${encodeURIComponent(slug)}/${encodeURIComponent(image)}?v=${v || 0}` : '');
const thumbSrc = (p) => fileSrc(p.slug, p.image, p.v);

const setPreview = (src) => {
  $('#f-preview').innerHTML = src ? `<img src="${esc(src)}" alt="">` : '';
  $('#f-picker').classList.toggle('has-image', Boolean(src));
};

const addRow = (box, k = '', v = '', ph = ['항목', '내용']) => {
  $(box).insertAdjacentHTML('beforeend', `<div class="pair"><input type="text" class="k" placeholder="${ph[0]}" value="${esc(k)}"><input type="text" class="v" placeholder="${ph[1]}" value="${esc(v)}"><button class="icon" type="button" data-act="row-del" aria-label="항목 삭제">×</button></div>`);
};

const renderDash = () => {
  $('#plot-list').innerHTML = site.plots.length
    ? site.plots.map((p) => {
      const count = Array.isArray(p.characters) && p.characters.length > 1 ? ` · 캐릭터 ${p.characters.length}명` : '';
      return `
      <li data-id="${esc(p.id)}">
        <div class="mini">${thumbSrc(p) ? `<img src="${esc(thumbSrc(p))}" alt="">` : ''}</div>
        <div class="meta"><strong>${esc(p.listTitle || p.title || '(제목 없음)')}</strong><span>/${esc(p.slug || '???')}${count}${p.soon ? ' · 미완성' : ''}</span></div>
        <div class="tools">
          <button class="icon" type="button" data-act="up" aria-label="위로">↑</button>
          <button class="icon" type="button" data-act="down" aria-label="아래로">↓</button>
          <button class="btn small" type="button" data-act="edit">수정</button>
          <button class="btn small" type="button" data-act="del">삭제</button>
        </div>
      </li>`;
    }).join('')
    : '<li class="empty">아직 플롯이 없어요.</li>';
  $('#order-save').hidden = true;
  $('#set-title').value = site.title;
  $('#set-sub').value = site.subtitle;
  $('#set-whispers').value = (site.whispers.length ? site.whispers : DEFAULT_WHISPERS).join('\n');
  $('#set-links').innerHTML = '';
  site.links.forEach((l) => addRow('#set-links', l.label, l.url, LINK_PH));
};

const renderCast = () => {
  $('#f-cast').innerHTML = draft.map((c, i) => {
    const color = colorOf(c, i);
    return `<button class="chip${i === cur ? ' on' : ''}" type="button" role="tab" aria-selected="${i === cur}" data-act="char-pick" data-i="${i}" style="--chip:${esc(color)};--chip-ink:${ink(color)}"><i></i>${esc(c.name || `캐릭터 ${i + 1}`)}</button>`;
  }).join('');
  $('#f-char').style.setProperty('--cur', colorOf(draft[cur], cur));
  $('[data-act="char-left"]').disabled = cur === 0;
  $('[data-act="char-right"]').disabled = cur === draft.length - 1;
  $('[data-act="char-del"]').disabled = draft.length === 1;
};

const renderSwatches = () => {
  const color = colorOf(draft[cur], cur).toLowerCase();
  const preset = PALETTE.includes(color);
  $('#f-swatches').innerHTML = PALETTE.map((p) => `<button class="swatch${p === color ? ' on' : ''}" type="button" style="--sw:${p}" data-act="swatch" data-color="${p}" aria-label="색 ${p}"></button>`).join('')
    + `<label class="swatch custom${preset ? '' : ' on'}" title="직접 고르기"${preset ? '' : ` style="background:${esc(color)}"`}><input type="color" id="f-color" value="${esc(color)}" aria-label="색 직접 고르기"></label>`;
};

const setColor = (color) => {
  draft[cur].color = color;
  dirty = true;
  renderSwatches();
  renderCast();
};

const readChar = () => {
  const c = draft[cur];
  if (!c) return;
  c.name = $('#f-name').value.trim();
  c.caption = $('#f-caption').value.trim();
  c.about = { heading: $('#f-about-h').value.trim(), text: $('#f-about').value.trim() };
  c.info = {
    heading: $('#f-info-h').value.trim(),
    rows: [...document.querySelectorAll('#f-rows .pair')]
      .map((r) => [r.querySelector('.k').value.trim(), r.querySelector('.v').value.trim()])
      .filter((r) => r[0] || r[1])
  };
  c.quote = { heading: $('#f-quote-h').value.trim(), text: $('#f-quote').value.trim() };
};

const fillChar = () => {
  const c = draft[cur];
  $('#f-name').value = c.name || '';
  $('#f-caption').value = c.caption || '';
  $('#f-about-h').value = (c.about && c.about.heading) || '';
  $('#f-about').value = (c.about && c.about.text) || '';
  $('#f-info-h').value = (c.info && c.info.heading) || '';
  $('#f-quote-h').value = (c.quote && c.quote.heading) || '';
  $('#f-quote').value = (c.quote && c.quote.text) || '';
  $('#f-rows').innerHTML = '';
  ((c.info && c.info.rows) || []).forEach((r) => addRow('#f-rows', r[0], r[1]));
  $('#f-image').value = '';
  const fresh = images.get(c.id);
  setPreview(fresh ? fresh.url : fileSrc(editing && editing.slug, c.image, c.v));
  $('#f-image-info').textContent = fresh ? `${Math.round(fresh.blob.size / 1024)}KB로 줄여서 올려요.` : '';
  renderSwatches();
  renderCast();
};

const pickChar = (i) => {
  if (i === cur || i < 0 || i >= draft.length) return;
  readChar();
  const panel = $('#f-char');
  panel.style.setProperty('--dir', `${i > cur ? 16 : -16}px`);
  cur = i;
  fillChar();
  panel.classList.remove('swap');
  panel.offsetWidth;
  panel.classList.add('swap');
};

const openEditor = (plot) => {
  editing = plot || null;
  images = new Map();
  draft = plot ? castOf(plot) : [newChar(0)];
  draft.forEach((c, i) => { c.color = colorOf(c, i); });
  cur = 0;
  $('#edit-title').textContent = plot ? '플롯 수정' : '새 플롯';
  $('#f-slug').value = plot ? plot.slug || '' : '';
  $('#f-slug').readOnly = Boolean(plot && plot.slug);
  $('#f-title').value = plot ? plot.title || '' : '';
  $('#f-list').value = plot ? plot.listTitle || '' : '';
  $('#f-soon').checked = Boolean(plot && plot.soon);
  fillChar();
  dirty = false;
  show('edit');
};

const leaveEditor = () => {
  if (dirty && !confirm('저장하지 않은 내용이 있어요. 그래도 나갈까요?')) return;
  dirty = false;
  show('dash');
};

const enter = async () => {
  await api('/me');
  site = await readSite();
  renderDash();
  show('dash');
};

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(e.submitter || $('#login-form button'), '확인 중', async () => {
    let data;
    try {
      data = await api('/login', { method: 'POST', body: { id: $('#login-id').value.trim(), password: $('#login-pw').value } });
    } catch (err) {
      shake($('#login-form'));
      $('#login-pw').select();
      throw err;
    }
    $('#login-pw').value = '';
    remember(data.token);
    try {
      await enter();
      toast('어서 오세요.');
    } catch (err) {
      forget();
      throw err;
    }
  });
});

$('#settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(e.submitter || $('#settings-form button'), '저장 중', () => save('사이트 설정 변경', (fresh) => {
    fresh.title = $('#set-title').value.trim();
    fresh.subtitle = $('#set-sub').value.trim();
    fresh.whispers = $('#set-whispers').value.split('\n').map((s) => s.trim()).filter(Boolean);
    fresh.links = [...document.querySelectorAll('#set-links .pair')]
      .map((r) => ({ label: r.querySelector('.k').value.trim(), url: r.querySelector('.v').value.trim() }))
      .filter((l) => l.label || l.url);
  }));
});

const useImage = async (file) => {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast('그림 파일만 올릴 수 있어요.', true);
    return;
  }
  try {
    const blob = await toJpeg(file);
    const c = draft[cur];
    const old = images.get(c.id);
    if (old) URL.revokeObjectURL(old.url);
    const url = URL.createObjectURL(blob);
    images.set(c.id, { blob, url });
    setPreview(url);
    $('#f-image-info').textContent = `${Math.round(blob.size / 1024)}KB로 줄여서 올려요.`;
    dirty = true;
  } catch {
    toast('그림을 읽을 수 없어요. 다른 파일로 해 주세요.', true);
  }
};

$('#f-image').addEventListener('change', (e) => useImage(e.target.files[0]));

const picker = $('#f-picker');
picker.addEventListener('dragover', (e) => {
  e.preventDefault();
  picker.classList.add('drag');
});
picker.addEventListener('dragleave', () => picker.classList.remove('drag'));
picker.addEventListener('drop', (e) => {
  e.preventDefault();
  picker.classList.remove('drag');
  useImage(e.dataTransfer.files[0]);
});

$('#edit-form').addEventListener('input', (e) => {
  dirty = true;
  if (e.target.id === 'f-name') {
    draft[cur].name = e.target.value.trim();
    renderCast();
  }
  if (e.target.id === 'f-color') {
    draft[cur].color = e.target.value;
    e.target.parentElement.style.background = e.target.value;
    document.querySelectorAll('#f-swatches .swatch').forEach((s) => s.classList.toggle('on', s === e.target.parentElement));
    renderCast();
  }
});

$('#edit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  readChar();
  const data = {
    slug: $('#f-slug').value.trim(),
    title: $('#f-title').value.trim(),
    listTitle: $('#f-list').value.trim(),
    soon: $('#f-soon').checked
  };
  const id = editing ? editing.id : rid();
  const fail = (msg, el) => {
    toast(msg, true);
    if (el) {
      el.focus();
      shake(el);
    }
  };
  if (!data.title) return fail('플롯 제목을 적어 주세요.', $('#f-title'));
  if (!data.slug && !data.soon) return fail('주소를 적어 주세요. 미완성일 때만 비워 둘 수 있어요.', $('#f-slug'));
  if (data.slug && !/^[A-Za-z0-9_-]+$/.test(data.slug)) return fail('주소는 영문, 숫자, -, _ 만 쓸 수 있어요.', $('#f-slug'));
  if (/^(assets|data|developer)$/i.test(data.slug)) return fail('이 주소는 사이트가 쓰고 있어서 쓸 수 없어요.', $('#f-slug'));
  const nameless = draft.findIndex((c) => !c.name);
  if (nameless >= 0) {
    pickChar(nameless);
    return fail('캐릭터 이름을 적어 주세요.', $('#f-name'));
  }
  const names = draft.map((c) => c.name);
  if (new Set(names).size !== names.length) return fail('캐릭터 이름이 겹쳐요. 이름을 다르게 해 주세요.');
  if (images.size && !data.slug) return fail('그림을 올리려면 주소가 있어야 해요.', $('#f-slug'));

  run(e.submitter || $('#edit-form button[type="submit"]'), '저장 중', async () => {
    await save(`${editing ? '플롯 수정' : '플롯 추가'}: ${data.title}`, async (fresh) => {
      if (data.slug && fresh.plots.some((p) => p.id !== id && p.slug && p.slug.toLowerCase() === data.slug.toLowerCase())) {
        throw new Error('이미 같은 주소의 플롯이 있어요.');
      }
      const index = fresh.plots.findIndex((p) => p.id === id);
      const before = index >= 0 ? fresh.plots[index] : null;
      const files = [];
      if (data.slug && (!before || before.slug !== data.slug)) {
        files.push({ path: `${data.slug}/index.html`, content: textToB64(stub(data.slug, data.title)) });
      }
      const cast = draft.map((c, i) => ({
        id: c.id,
        name: c.name,
        color: colorOf(c, i),
        caption: c.caption,
        image: c.image || '',
        v: c.v || 0,
        about: c.about,
        info: c.info,
        quote: c.quote
      }));
      for (const c of cast) {
        const upload = images.get(c.id);
        if (!upload) continue;
        const name = c.image || `${c.id}.jpg`;
        files.push({ path: `${data.slug}/${name}`, content: await blobToB64(upload.blob) });
        c.image = name;
        c.v = Date.now();
      }
      if (before && before.slug) {
        const keep = new Set(cast.map((c) => c.image).filter(Boolean));
        for (const c of castOf(before)) {
          if (c.image && !keep.has(c.image)) files.push({ path: `${before.slug}/${c.image}`, content: null });
        }
      }
      const plot = { id, ...data, image: cast[0].image, v: cast[0].v, characters: cast };
      if (index >= 0) fresh.plots[index] = plot;
      else fresh.plots.push(plot);
      return files;
    });
    dirty = false;
    show('dash');
  });
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && screen() === 'edit') {
    e.preventDefault();
    $('#edit-form').requestSubmit();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (dirty && screen() === 'edit') e.preventDefault();
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
  if (act === 'back') leaveEditor();
  if (act === 'edit' && plot) openEditor(plot);
  if (act === 'row-add') {
    addRow('#f-rows');
    dirty = true;
  }
  if (act === 'link-add') addRow('#set-links', '', '', LINK_PH);
  if (act === 'row-del') {
    el.closest('.pair').remove();
    dirty = true;
  }

  if (act === 'char-pick') pickChar(Number(el.dataset.i));
  if (act === 'swatch') setColor(el.dataset.color);
  if (act === 'char-add') {
    readChar();
    draft.push(newChar(draft.length));
    dirty = true;
    pickChar(draft.length - 1);
    $('#f-name').focus();
  }
  if (act === 'char-left' || act === 'char-right') {
    readChar();
    const to = cur + (act === 'char-left' ? -1 : 1);
    if (to < 0 || to >= draft.length) return;
    [draft[cur], draft[to]] = [draft[to], draft[cur]];
    cur = to;
    dirty = true;
    renderCast();
    renderSwatches();
  }
  if (act === 'char-del' && draft.length > 1) {
    const name = draft[cur].name || `캐릭터 ${cur + 1}`;
    if (!confirm(`'${name}' 캐릭터를 지울까요?\n저장하면 그림도 함께 지워져요.`)) return;
    const gone = draft.splice(cur, 1)[0];
    const img = images.get(gone.id);
    if (img) URL.revokeObjectURL(img.url);
    images.delete(gone.id);
    cur = Math.min(cur, draft.length - 1);
    dirty = true;
    fillChar();
  }

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
    run(el, '저장 중', () => save('플롯 순서 변경', (fresh) => {
      fresh.plots.sort((a, b) => rank(a) - rank(b));
    }));
  }

  if (act === 'del' && plot) {
    const name = plot.listTitle || plot.title || plot.slug;
    if (!confirm(`'${name}' 플롯을 삭제할까요?\n페이지와 그림도 함께 지워져요.`)) return;
    run(el, '삭제 중', () => save(`플롯 삭제: ${name}`, async (fresh) => {
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

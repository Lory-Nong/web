const OWNER = 'Lory-Nong';
const REPO = 'web';
const BRANCH = 'main';
const ITER = 600000;
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const KEY = 'lul-admin-token';
const DEFAULT_WHISPERS = ['깨어나', '여기는 꿈이 아니야', '누가 보고 있어', '돌아갈 수 없어', '아직 거기 있니', '문을 열지 마', '너를 기억하고 있어', '눈을 감아'];

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = new TextEncoder();
const dec = new TextDecoder();
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

let token = null;
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
const b64ToBytes = (s) => Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0));
const textToB64 = (text) => bytesToB64(enc.encode(text));
const blobToB64 = async (blob) => bytesToB64(new Uint8Array(await blob.arrayBuffer()));

const derive = async (id, pw, salt, iter) => {
  const base = await crypto.subtle.importKey('raw', enc.encode(id + '\n' + pw), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
};

const seal = async (id, pw, secret) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(id, pw, salt, ITER);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret));
  return { v: 1, iter: ITER, salt: bytesToB64(salt), iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(data)) };
};

const unseal = async (id, pw, vault) => {
  const key = await derive(id, pw, b64ToBytes(vault.salt), vault.iter);
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(vault.iv) }, key, b64ToBytes(vault.data));
  return dec.decode(out);
};

const loadVault = async () => {
  try {
    const res = await fetch(`${API}/contents/Developer/vault.json?ref=${BRANCH}&t=${Date.now()}`, { headers: { Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (res.ok) return await res.json();
    if (res.status === 404) return null;
  } catch {}
  try {
    const res = await fetch(`vault.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  return null;
};

const remember = (t) => {
  token = t;
  try { sessionStorage.setItem(KEY, t); } catch {}
};

const forget = () => {
  token = null;
  try { sessionStorage.removeItem(KEY); } catch {}
};

const gh = async (path, method = 'GET', body) => {
  const res = await fetch(path ? `${API}/${path}` : API, {
    method,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 404 && method === 'GET') return null;
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch {}
    if (res.status === 401) throw new Error('토큰이 만료됐거나 잘못됐어요. 계정에서 토큰을 바꿔 주세요.');
    if (res.status === 403) throw new Error('토큰 권한이 부족해요. Contents 권한을 Read and write로 해 주세요.');
    if (res.status === 409 || res.status === 422) throw new Error(`저장 중 충돌이 났어요. 새로고침 후 다시 해 주세요. (${detail})`);
    throw new Error(`GitHub 오류 ${res.status} ${detail}`);
  }
  return res.status === 204 ? null : res.json();
};

const commit = async (message, files) => {
  const ref = await gh(`git/ref/heads/${BRANCH}`);
  const head = await gh(`git/commits/${ref.object.sha}`);
  const tree = [];
  for (const f of files) {
    if (f.content == null) {
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
    } else {
      const blob = await gh('git/blobs', 'POST', { content: f.content, encoding: 'base64' });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
  }
  const next = await gh('git/trees', 'POST', { base_tree: head.tree.sha, tree });
  const made = await gh('git/commits', 'POST', { message, tree: next.sha, parents: [ref.object.sha] });
  await gh(`git/refs/heads/${BRANCH}`, 'PATCH', { sha: made.sha });
};

const readSite = async () => {
  const file = await gh(`contents/data/site.js?ref=${BRANCH}`);
  const data = file
    ? JSON.parse(dec.decode(b64ToBytes(file.content)).replace(/^\s*window\.SITE\s*=\s*/, '').replace(/;\s*$/, ''))
    : {};
  data.title = data.title || '';
  data.subtitle = data.subtitle || '';
  data.whispers = Array.isArray(data.whispers) ? data.whispers : [];
  data.plots = Array.isArray(data.plots) ? data.plots : [];
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
};

const addRow = (k = '', v = '') => {
  $('#f-rows').insertAdjacentHTML('beforeend', `<div class="pair"><input type="text" class="k" placeholder="항목" value="${esc(k)}"><input type="text" class="v" placeholder="내용" value="${esc(v)}"><button class="icon" type="button" data-act="row-del" aria-label="항목 삭제">×</button></div>`);
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
  ((p.info && p.info.rows) || []).forEach((r) => addRow(r[0], r[1]));
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
  const repo = await gh('');
  if (!repo) throw new Error('저장소를 찾을 수 없어요. 토큰의 저장소 설정을 확인해 주세요.');
  site = await readSite();
  renderDash();
  show('dash');
};

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(e.submitter || $('#login-form button'), '확인 중…', async () => {
    const vault = await loadVault();
    if (!vault) {
      show('setup');
      throw new Error('아직 관리자 설정이 안 돼 있어요. 먼저 설정해 주세요.');
    }
    let secret;
    try {
      secret = await unseal($('#login-id').value.trim(), $('#login-pw').value, vault);
    } catch {
      throw new Error('아이디 또는 비밀번호가 맞지 않아요.');
    }
    remember(secret);
    $('#login-pw').value = '';
    try {
      await enter();
    } catch (err) {
      forget();
      throw err;
    }
  });
});

$('#setup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(e.submitter || $('#setup-form button'), '저장 중…', async () => {
    const id = $('#setup-id').value.trim();
    const pw = $('#setup-pw').value;
    if (pw !== $('#setup-pw2').value) throw new Error('비밀번호 확인이 달라요.');
    const prev = token;
    const next = $('#setup-token').value.trim() || prev;
    if (!next) throw new Error('GitHub 토큰을 넣어 주세요.');
    remember(next);
    try {
      const repo = await gh('');
      if (!repo) throw new Error('토큰으로 web 저장소에 접근할 수 없어요. 토큰 설정을 확인해 주세요.');
      const vault = await seal(id, pw, token);
      await commit('관리자 계정 설정', [{ path: 'Developer/vault.json', content: textToB64(JSON.stringify(vault, null, 2) + '\n') }]);
      ['#setup-pw', '#setup-pw2', '#setup-token'].forEach((s) => { $(s).value = ''; });
      site = await readSite();
      renderDash();
      show('dash');
      toast('설정을 저장했어요. 다음부터는 아이디·비밀번호로 로그인하면 돼요.');
    } catch (err) {
      if (prev) remember(prev);
      else forget();
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

  if (act === 'to-setup') show('setup');
  if (act === 'to-login') show(token ? 'dash' : 'login');
  if (act === 'logout') {
    forget();
    site = null;
    show('login');
  }
  if (act === 'new') openEditor(null);
  if (act === 'back') show('dash');
  if (act === 'edit' && plot) openEditor(plot);
  if (act === 'row-add') addRow();
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
      const list = await gh(`contents/${encodeURIComponent(target.slug)}?ref=${BRANCH}`);
      return Array.isArray(list) ? list.filter((f) => f.type === 'file').map((f) => ({ path: f.path, content: null })) : [];
    }));
  }
});

(async () => {
  if (!window.crypto || !crypto.subtle) {
    show('login');
    toast('https:// 주소로 접속해야 관리자 기능을 쓸 수 있어요.', true);
    return;
  }
  let saved = null;
  try { saved = sessionStorage.getItem(KEY); } catch {}
  if (saved) {
    token = saved;
    try {
      await enter();
      return;
    } catch (e) {
      forget();
      toast(e.message, true);
    }
  }
  show((await loadVault()) ? 'login' : 'setup');
})();

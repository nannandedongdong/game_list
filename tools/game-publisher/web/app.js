'use strict';

const state = {
  config: null,
  games: [],
  activeType: 'GBA',
  editingId: null,
};

const el = (id) => document.getElementById(id);
const gameForm = el('gameForm');
const existingGame = el('existingGame');
const gameName = el('gameName');
const gameType = el('gameType');
const romFile = el('romFile');
const coverFile = el('coverFile');
const submitButton = el('submitButton');
const syncButton = el('syncButton');
const notice = el('notice');
const progress = el('uploadProgress');
const progressBar = el('progressBar');
const gameList = el('gameList');
const typeTabs = el('typeTabs');
const newGameButton = el('newGameButton');

async function init() {
  bindEvents();
  try {
    const [configResult, gamesResult] = await Promise.all([
      api('/api/config'),
      api('/api/games'),
    ]);
    state.config = configResult;
    state.games = gamesResult.games || [];
    renderConfig();
    renderTypeTabs();
    renderExistingOptions();
    renderGames();
    showNotice('后台已就绪。每次发布只创建一个 Git commit。', 'success', 3500);
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

function bindEvents() {
  gameForm.addEventListener('submit', handleSubmit);
  existingGame.addEventListener('change', () => selectExistingGame(existingGame.value));
  newGameButton.addEventListener('click', clearEditMode);
  gameType.addEventListener('change', updateExtensionHint);
  romFile.addEventListener('change', updateExtensionHint);
  coverFile.addEventListener('change', previewCover);
  syncButton.addEventListener('click', retryPush);
}

function renderConfig() {
  const repo = state.config.repository;
  el('repoLink').textContent = repo.url || `${repo.remote}/${repo.branch}`;
  el('repoLink').href = repo.url || '#';
  el('branchLabel').textContent = `${repo.remote} / ${repo.branch} · ${repo.content_root || repo.contentRoot}`;
  el('romHint').textContent = `最大 ${formatLimit(state.config.limits.rom_bytes)}`;
  el('coverHint').textContent = `JPG / PNG / WebP，最大 ${formatLimit(state.config.limits.cover_bytes)}`;
  updateExtensionHint();
}

function renderTypeTabs() {
  const types = Object.keys(state.config.game_types);
  if (!types.includes(state.activeType) && types.length) state.activeType = types[0];
  typeTabs.replaceChildren();
  for (const type of types) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `type-tab${type === state.activeType ? ' active' : ''}`;
    const count = state.games.filter((game) => game.game_type === type).length;
    button.textContent = `${type} (${count})`;
    button.addEventListener('click', () => {
      state.activeType = type;
      renderTypeTabs();
      renderGames();
    });
    typeTabs.append(button);
  }
}

function renderExistingOptions() {
  const selected = state.editingId || '';
  existingGame.replaceChildren();
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '新游戏';
  existingGame.append(empty);

  for (const game of state.games) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = `[${game.game_type}] ${game.name}`;
    existingGame.append(option);
  }
  existingGame.value = selected;
}

function renderGames() {
  const visible = state.games.filter((game) => game.game_type === state.activeType);
  el('gameCount').textContent = `${visible.length} 个游戏`;
  gameList.replaceChildren();

  if (visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const title = document.createElement('strong');
    title.textContent = '这个类型还没有游戏';
    const body = document.createElement('span');
    body.textContent = '从左侧上传一个 ROM，发布后手机端即可读取。';
    empty.append(title, body);
    gameList.append(empty);
    return;
  }

  for (const game of visible) gameList.append(createGameRow(game));
}

function createGameRow(game) {
  const row = document.createElement('article');
  row.className = 'game-row';

  if (game.public.cover) {
    const image = document.createElement('img');
    image.className = 'game-cover';
    image.src = game.public.cover;
    image.alt = `${game.name} 海报`;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(coverPlaceholder(game)));
    row.append(image);
  } else {
    row.append(coverPlaceholder(game));
  }

  const info = document.createElement('div');
  info.className = 'game-info';
  const name = document.createElement('h3');
  name.className = 'game-name';
  name.textContent = game.name;

  const meta = document.createElement('div');
  meta.className = 'game-meta';
  meta.append(
    metaItem(game.game_type),
    metaItem(formatBytes(game.file_size)),
    metaItem(`v${game.revision}`),
    metaItem(shortHash(game.sha256)),
  );

  const links = document.createElement('div');
  links.className = 'game-links';
  links.append(
    externalLink('ROM', game.public.rom),
    externalLink('海报', game.public.cover),
    externalLink('JSON', game.public.catalog),
  );
  info.append(name, meta, links);

  const actions = document.createElement('div');
  actions.className = 'game-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'secondary';
  edit.textContent = '更新';
  edit.addEventListener('click', () => {
    existingGame.value = game.id;
    selectExistingGame(game.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'danger';
  remove.textContent = '删除';
  remove.addEventListener('click', () => deleteGame(game));
  actions.append(edit, remove);

  row.append(info, actions);
  return row;
}

function coverPlaceholder(game) {
  const placeholder = document.createElement('div');
  placeholder.className = 'cover-placeholder';
  placeholder.textContent = game.game_type.slice(0, 2);
  return placeholder;
}

function metaItem(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function externalLink(label, href) {
  if (!href) return document.createTextNode(`${label}: 无`);
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = label;
  return link;
}

function selectExistingGame(id) {
  const game = state.games.find((item) => item.id === id);
  if (!game) {
    clearEditMode();
    return;
  }
  state.editingId = id;
  existingGame.value = id;
  gameName.value = game.name;
  gameType.value = game.game_type;
  gameType.disabled = true;
  romFile.value = '';
  coverFile.value = '';
  el('coverPreviewWrap').classList.add('hidden');
  romFile.required = false;
  el('romRequired').classList.add('hidden');
  el('romLabel').childNodes[0].nodeValue = '替换 ROM / ZIP 游戏包 ';
  submitButton.textContent = '保存修改';
  newGameButton.classList.remove('hidden');
  el('currentRom').classList.remove('hidden');
  el('currentRomName').textContent = game.file_name;
  el('currentRomMeta').textContent =
    `${formatBytes(game.file_size)} · SHA-256 ${shortHash(game.sha256)}`;
  el('currentRomLink').href = game.public.rom || '#';
  el('selectedCover').classList.remove('hidden');
  el('selectedCover').textContent = game.cover_path
    ? `当前海报会保留；选择新海报后替换。`
    : '当前没有海报；可以选择一个。';
  el('romHint').textContent = '不选择新文件则保留当前 ROM。';
  updateExtensionHint();
}

function clearEditMode() {
  state.editingId = null;
  gameForm.reset();
  existingGame.value = '';
  gameType.disabled = false;
  romFile.required = true;
  el('romRequired').classList.remove('hidden');
  el('romLabel').childNodes[0].nodeValue = 'ROM / ZIP 游戏包 ';
  submitButton.textContent = '上传并发布';
  newGameButton.classList.add('hidden');
  el('currentRom').classList.add('hidden');
  el('selectedCover').classList.add('hidden');
  el('coverPreviewWrap').classList.add('hidden');
  el('romHint').textContent = state.config
    ? `最大 ${formatLimit(state.config.limits.rom_bytes)}`
    : '最大 10MB';
  updateExtensionHint();
}

function updateExtensionHint() {
  if (!state.config) return;
  const type = gameType.value;
  const extensions = state.config.game_types[type]?.extensions || [];
  el('extensionHint').textContent = `允许扩展名：${extensions.join('、')}`;
  if (romFile.files?.[0]) {
    const name = romFile.files[0].name;
    const extension = `.${name.split('.').pop().toLowerCase()}`;
    if (!extensions.includes(extension)) {
      el('romHint').textContent = `当前文件 ${extension} 与 ${type} 不匹配`;
    } else {
      el('romHint').textContent = `${formatBytes(romFile.files[0].size)}，最大 ${formatLimit(state.config.limits.rom_bytes)}`;
    }
  }
}

function previewCover() {
  const file = coverFile.files?.[0];
  if (!file) {
    el('coverPreviewWrap').classList.add('hidden');
    return;
  }
  const imageUrl = URL.createObjectURL(file);
  el('coverPreview').src = imageUrl;
  el('coverPreviewMeta').textContent = `${file.name} · ${formatBytes(file.size)}`;
  el('coverPreviewWrap').classList.remove('hidden');
}

async function handleSubmit(event) {
  event.preventDefault();
  clearMessage();
  const rom = romFile.files?.[0];
  if (!rom && !state.editingId) {
    showNotice('新游戏必须选择 ROM 或 ZIP 游戏包。', 'error');
    return;
  }

  const maxRom = state.config.limits.rom_bytes;
  const maxCover = state.config.limits.cover_bytes;
  if (rom && rom.size > maxRom) {
    showNotice(`游戏包超过 ${formatLimit(maxRom)}。`, 'error');
    return;
  }
  if (coverFile.files?.[0] && coverFile.files[0].size > maxCover) {
    showNotice(`海报超过 ${formatLimit(maxCover)}。`, 'error');
    return;
  }

  const form = new FormData();
  form.append('name', gameName.value.trim());
  form.append('game_type', gameType.value);
  if (rom) form.append('rom', rom, rom.name);
  if (state.editingId) form.append('id', state.editingId);
  if (coverFile.files?.[0]) form.append('cover', coverFile.files[0], coverFile.files[0].name);

  setBusy(true);
  try {
    const result = await upload('/api/games', form);
    const packageSummary = result.package?.preserved
      ? `已保留原有 ${result.package.format.toUpperCase()} 游戏包。`
      : result.package?.format === 'zip'
        ? `ZIP 内容识别为 ${result.package.detected_type}，共 ${result.package.entry_count} 个文件。`
        : `游戏包格式：${result.package?.format || 'unknown'}。`;
    showNotice(
      `发布成功，commit ${result.commit}。\n${packageSummary}\n手机端列表：${result.public.catalog}`,
      'success',
    );
    await reloadGames();
    clearEditMode();
  } catch (error) {
    showNotice(error.message, 'error');
    if (error.code === 'PUSH_FAILED') syncButton.classList.remove('hidden');
  } finally {
    setBusy(false);
  }
}

function upload(url, body) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(2, Math.round((event.loaded / event.total) * 100));
      progressBar.style.width = `${percent}%`;
    });
    request.addEventListener('load', () => {
      let payload = {};
      try { payload = JSON.parse(request.responseText || '{}'); } catch {}
      if (request.status >= 200 && request.status < 300) resolve(payload);
      else {
        const error = new Error(payload.error || `上传失败 (HTTP ${request.status})`);
        error.code = payload.code;
        error.commit = payload.commit;
        reject(error);
      }
    });
    request.addEventListener('error', () => reject(new Error('无法连接本地发布服务')));
    request.send(body);
  });
}

async function reloadGames() {
  const result = await api('/api/games');
  state.games = result.games || [];
  renderTypeTabs();
  renderExistingOptions();
  renderGames();
}

async function deleteGame(game) {
  const confirmed = window.confirm(`确定删除“${game.name}”吗？ROM、海报告和 JSON 记录会在同一个 commit 中删除。`);
  if (!confirmed) return;
  clearMessage();
  try {
    const result = await api(`/api/games/${encodeURIComponent(game.id)}`, { method: 'DELETE' });
    showNotice(`删除成功，commit ${result.commit}。`, 'success');
    if (state.editingId === game.id) clearEditMode();
    await reloadGames();
  } catch (error) {
    showNotice(error.message, 'error');
    if (error.code === 'PUSH_FAILED') syncButton.classList.remove('hidden');
  }
}

async function retryPush() {
  clearMessage();
  try {
    await api('/api/sync', { method: 'POST' });
    syncButton.classList.add('hidden');
    showNotice('推送成功，GitHub 上的文件已更新。', 'success');
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `请求失败 (HTTP ${response.status})`);
    error.code = payload.code;
    error.commit = payload.commit;
    throw error;
  }
  return payload;
}

function setBusy(busy) {
  submitButton.disabled = busy;
  submitButton.textContent = busy
    ? '正在保存并推送...'
    : state.editingId
      ? '保存修改'
      : '上传并发布';
  progress.classList.toggle('hidden', !busy);
  if (!busy) progressBar.style.width = '0%';
}

function showNotice(message, kind = 'info', timeout = 0) {
  notice.textContent = message;
  notice.className = `notice ${kind}`;
  if (timeout) {
    window.clearTimeout(showNotice.timer);
    showNotice.timer = window.setTimeout(clearMessage, timeout);
  }
}

function clearMessage() {
  window.clearTimeout(showNotice.timer);
  notice.className = 'notice hidden';
  notice.textContent = '';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes >= 1024 * 1024) return `${Number((bytes / 1024 / 1024).toFixed(1))}MB`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function formatLimit(bytes) {
  return formatBytes(bytes).replace('.0', '');
}

function shortHash(hash) {
  return hash ? `${hash.slice(0, 8)}…` : '';
}

init();

/* app.js — Utánpótlás Kezelő fő alkalmazás logika. */

/* ===================== Segédfüggvények ===================== */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];

function formatDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}. ${m}. ${day}.`;
}

function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

function formatDateTime(ts) {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

function formatDayLabel(ts) {
  const d = new Date(ts);
  return `${formatDate(ts)} ${WEEKDAYS[d.getDay()]}`;
}

function emptyHint(text) {
  return `<div class="empty-hint">${escapeHTML(text)}</div>`;
}

function resizeImage(file, maxDim = 1000, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Kép betöltése sikertelen.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Fájl olvasása sikertelen.'));
    reader.readAsDataURL(file);
  });
}

/* ===================== Toast, Modal, Megerősítés ===================== */

function toast(msg, ms = 2400) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, ms);
}

function openModal(html, opts = {}) {
  closeModal();
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'active-modal';
  overlay.innerHTML = `<div class="modal-sheet">${html}</div>`;
  root.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && opts.closeOnOverlay !== false) closeModal();
  });
  if (opts.onMount) opts.onMount(overlay);
  return overlay;
}

function closeModal() {
  const overlay = document.getElementById('active-modal');
  if (!overlay) return;
  overlay.classList.remove('show');
  setTimeout(() => overlay.remove(), 200);
}

function confirmDialog(message, opts = {}) {
  const { title = 'Megerősítés', okText = 'Igen', cancelText = 'Mégse', danger = false } = opts;
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay-center';
    overlay.innerHTML = `
      <div class="modal-sheet modal-sheet-small">
        <div class="modal-header"><h3>${escapeHTML(title)}</h3></div>
        <div class="modal-body"><p>${escapeHTML(message)}</p></div>
        <div class="modal-footer">
          <button class="btn secondary" data-act="cancel">${escapeHTML(cancelText)}</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-act="ok">${escapeHTML(okText)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    function cleanup(result) {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }
    overlay.querySelector('[data-act="cancel"]').onclick = () => cleanup(false);
    overlay.querySelector('[data-act="ok"]').onclick = () => cleanup(true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
  });
}

function pickReplacementWarehouse(excludeId) {
  return new Promise((resolve) => {
    const options = state.warehouses.filter((w) => w.id !== excludeId);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay-center';
    overlay.innerHTML = `
      <div class="modal-sheet modal-sheet-small">
        <div class="modal-header"><h3>Termékek áthelyezése</h3></div>
        <div class="modal-body">
          <p>Ehhez a raktárhoz termékek tartoznak. Válaszd ki, hova kerüljenek át törlés előtt:</p>
          <select id="replacement-select" class="select">
            ${options.map((w) => `<option value="${w.id}">${escapeHTML(w.name)}</option>`).join('')}
          </select>
        </div>
        <div class="modal-footer">
          <button class="btn secondary" data-act="cancel">Mégse</button>
          <button class="btn primary" data-act="ok">Áthelyezés és törlés</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    function cleanup(result) {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    }
    overlay.querySelector('[data-act="cancel"]').onclick = () => cleanup(null);
    overlay.querySelector('[data-act="ok"]').onclick = () => cleanup(overlay.querySelector('#replacement-select').value);
  });
}

/* ===================== Állapot ===================== */

const state = {
  warehouses: [],
  products: [],
  dailyItems: [],
  history: [],
  notes: [],
  meta: {},
};

async function loadState() {
  const [warehouses, products, dailyItems, history, notes, metaList] = await Promise.all([
    DB.getAll('warehouses'),
    DB.getAll('products'),
    DB.getAll('dailyItems'),
    DB.getAll('history'),
    DB.getAll('notes'),
    DB.getAll('meta'),
  ]);
  state.warehouses = warehouses;
  state.products = products;
  state.dailyItems = dailyItems;
  state.history = history.sort((a, b) => b.closedAt - a.closedAt);
  state.notes = notes.sort((a, b) => b.createdAt - a.createdAt);
  state.meta = {};
  metaList.forEach((m) => { state.meta[m.key] = m.value; });
  if (!state.meta.dayStartedAt) {
    state.meta.dayStartedAt = Date.now();
    await DB.put('meta', { key: 'dayStartedAt', value: state.meta.dayStartedAt });
  }
}

async function ensureDefaultWarehouse() {
  if (state.warehouses.length === 0) {
    const wh = { id: uid(), name: 'Raktár', createdAt: Date.now() };
    await DB.put('warehouses', wh);
    state.warehouses.push(wh);
  }
}

function getProduct(id) { return state.products.find((p) => p.id === id); }
function getWarehouse(id) { return state.warehouses.find((w) => w.id === id); }
function getWarehouseName(id) {
  if (!id) return 'Nincs raktár';
  const w = getWarehouse(id);
  return w ? w.name : 'Törölt raktár';
}
function activeProducts() { return state.products.filter((p) => p.status === 'active'); }
function getDailyItem(productId) { return state.dailyItems.find((d) => d.productId === productId); }
function todayTotalQty() { return state.dailyItems.reduce((s, d) => s + d.quantity, 0); }

function refreshBadges() {
  const badge = document.getElementById('nav-badge-hianylista');
  if (!badge) return;
  const count = state.dailyItems.length;
  badge.textContent = count > 0 ? String(count) : '';
  badge.classList.toggle('hidden', count === 0);
}

/* ===================== Router ===================== */

const VIEWS = ['dashboard', 'hianylista', 'kiszedes', 'elozmenyek', 'statisztikak', 'termekek', 'beallitasok'];

function navigate(view) {
  if (!VIEWS.includes(view)) view = 'dashboard';
  location.hash = '#/' + view;
}

function router() {
  const hash = location.hash.replace('#/', '') || 'dashboard';
  const view = VIEWS.includes(hash) ? hash : 'dashboard';
  VIEWS.forEach((v) => {
    const el = document.getElementById('view-' + v);
    if (el) el.classList.toggle('hidden', v !== view);
  });
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  renderView(view);
  const main = document.getElementById('views');
  if (main) main.scrollTop = 0;
}

function renderView(view) {
  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'hianylista': renderHianylista(); break;
    case 'kiszedes': renderKiszedes(); break;
    case 'elozmenyek': renderElozmenyek(); break;
    case 'statisztikak': renderStatisztikak(); break;
    case 'termekek': renderTermekek(); break;
    case 'beallitasok': renderBeallitasok(); break;
    default: break;
  }
}

/* ===================== Dashboard + Keresés ===================== */

function renderDashboard() {
  const el = document.getElementById('view-dashboard');
  const totalItems = state.dailyItems.length;
  const totalQty = todayTotalQty();
  el.innerHTML = `
    <div class="search-wrap">
      <input type="search" id="search-input" class="search-input" placeholder="Keresés név vagy kulcsszó alapján…" autocomplete="off" />
    </div>
    <div id="search-results" class="search-results"></div>
    <div class="dashboard-summary">
      <div class="summary-card">
        <div class="summary-value">${totalItems}</div>
        <div class="summary-label">Tétel a mai listán</div>
      </div>
      <div class="summary-card">
        <div class="summary-value">${totalQty}</div>
        <div class="summary-label">Összes darabszám</div>
      </div>
    </div>
    <div class="tile-grid">
      <button class="tile" data-nav="hianylista"><span class="tile-icon">📋</span><span>Mai hiánylista</span></button>
      <button class="tile" data-nav="kiszedes"><span class="tile-icon">📦</span><span>Napi áru kiszedése</span></button>
      <button class="tile" data-nav="elozmenyek"><span class="tile-icon">🗓️</span><span>Előzmények</span></button>
      <button class="tile" data-nav="statisztikak"><span class="tile-icon">📊</span><span>Statisztikák</span></button>
      <button class="tile" data-nav="termekek"><span class="tile-icon">🏷️</span><span>Termékkezelő</span></button>
      <button class="tile" data-nav="beallitasok"><span class="tile-icon">⚙️</span><span>Beállítások</span></button>
    </div>
  `;
  el.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
  });
  const input = document.getElementById('search-input');
  input.addEventListener('input', debounce(() => renderSearchResults(input.value), 120));
  renderSearchResults('');
}

function searchRowHTML(p) {
  const item = getDailyItem(p.id);
  const qty = item ? item.quantity : 0;
  const img = p.images && p.images[0] ? p.images[0] : null;
  return `
    <div class="search-row" data-id="${p.id}">
      <div class="search-thumb">${img ? `<img src="${img}" alt="">` : '<span class="thumb-fallback">🎁</span>'}</div>
      <div class="search-info">
        <div class="search-name">${escapeHTML(p.name)}</div>
        <div class="search-sub">${escapeHTML(p.category || '')}${p.category ? ' · ' : ''}${escapeHTML(getWarehouseName(p.warehouseId))}</div>
      </div>
      <div class="qty-control">
        <button type="button" class="qty-btn qty-minus" ${qty <= 0 ? 'disabled' : ''}>−</button>
        <span class="qty-value">${qty}</span>
        <button type="button" class="qty-btn qty-plus">+</button>
      </div>
    </div>`;
}

function renderSearchResults(query) {
  const container = document.getElementById('search-results');
  if (!container) return;
  const q = query.trim().toLowerCase();
  if (!q) {
    container.innerHTML = emptyHint('Kezdj el gépelni a kereséshez…');
    return;
  }
  const results = activeProducts().filter((p) => {
    if (p.name.toLowerCase().includes(q)) return true;
    if (p.keywords && p.keywords.some((k) => k.toLowerCase().includes(q))) return true;
    return false;
  }).slice(0, 40);
  if (results.length === 0) {
    container.innerHTML = emptyHint(`Nincs találat a(z) „${query}” kifejezésre.`);
    return;
  }
  container.innerHTML = results.map(searchRowHTML).join('');
  container.querySelectorAll('.search-row').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('.qty-minus').addEventListener('click', () => changeDailyQty(id, -1).then(() => renderSearchResults(query)));
    row.querySelector('.qty-plus').addEventListener('click', () => changeDailyQty(id, 1).then(() => renderSearchResults(query)));
  });
}

async function changeDailyQty(productId, delta) {
  const item = getDailyItem(productId);
  let newQty = (item ? item.quantity : 0) + delta;
  if (newQty < 0) newQty = 0;
  if (newQty === 0) {
    if (item) {
      state.dailyItems = state.dailyItems.filter((d) => d.productId !== productId);
      await DB.delete('dailyItems', productId);
    }
  } else if (item) {
    item.quantity = newQty;
    await DB.put('dailyItems', item);
  } else {
    const record = { productId, quantity: newQty, checked: false };
    state.dailyItems.push(record);
    await DB.put('dailyItems', record);
  }
  refreshBadges();
}

/* ===================== Mai hiánylista ===================== */

function hianyRowHTML(item) {
  const p = getProduct(item.productId);
  if (!p) return '';
  const img = p.images && p.images[0] ? p.images[0] : null;
  return `
    <div class="hiany-row" data-id="${item.productId}">
      <div class="search-thumb">${img ? `<img src="${img}" alt="">` : '<span class="thumb-fallback">🎁</span>'}</div>
      <div class="search-info">
        <div class="search-name">${escapeHTML(p.name)}</div>
        <div class="search-sub">${escapeHTML(getWarehouseName(p.warehouseId))}</div>
      </div>
      <div class="qty-control">
        <button type="button" class="qty-btn qty-minus">−</button>
        <span class="qty-value">${item.quantity}</span>
        <button type="button" class="qty-btn qty-plus">+</button>
      </div>
      <button type="button" class="remove-btn" title="Eltávolítás">✕</button>
    </div>`;
}

function renderHianylista() {
  const el = document.getElementById('view-hianylista');
  const items = state.dailyItems.slice().sort((a, b) => {
    const pa = getProduct(a.productId);
    const pb = getProduct(b.productId);
    return (pa ? pa.name : '').localeCompare(pb ? pb.name : '', 'hu');
  });
  const dailyNote = state.meta.dailyNote || '';
  el.innerHTML = `
    <h2 class="view-title">Mai hiánylista</h2>
    <div class="daily-note-wrap">
      <label class="field-label" for="daily-note-input">Napi jegyzet</label>
      <textarea id="daily-note-input" class="textarea" placeholder="Pl. Sok turista volt.">${escapeHTML(dailyNote)}</textarea>
    </div>
    <div class="list-header">${items.length} tétel · ${items.reduce((s, i) => s + i.quantity, 0)} db összesen</div>
    <div id="hianylista-list" class="hianylista-list">
      ${items.length === 0 ? emptyHint('A mai lista még üres. Keress rá termékekre a főoldalon, vagy adj hozzá egyet lent.') : items.map(hianyRowHTML).join('')}
    </div>
    <button type="button" id="add-item-btn" class="btn secondary full-width">+ Termék hozzáadása</button>
  `;
  el.querySelectorAll('.hiany-row').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('.qty-minus').addEventListener('click', () => changeDailyQty(id, -1).then(renderHianylista));
    row.querySelector('.qty-plus').addEventListener('click', () => changeDailyQty(id, 1).then(renderHianylista));
    row.querySelector('.remove-btn').addEventListener('click', async () => {
      const ok = await confirmDialog('Biztosan eltávolítod ezt a terméket a mai listáról?');
      if (!ok) return;
      state.dailyItems = state.dailyItems.filter((d) => d.productId !== id);
      await DB.delete('dailyItems', id);
      renderHianylista();
      refreshBadges();
    });
  });
  document.getElementById('add-item-btn').addEventListener('click', openAddItemModal);
  const noteInput = document.getElementById('daily-note-input');
  noteInput.addEventListener('input', debounce(async () => {
    state.meta.dailyNote = noteInput.value;
    await DB.put('meta', { key: 'dailyNote', value: noteInput.value });
  }, 400));
}

function openAddItemModal() {
  openModal(`
    <div class="modal-header"><h3>Termék hozzáadása</h3><button type="button" class="modal-close" data-act="close">✕</button></div>
    <div class="modal-body">
      <input type="search" id="modal-search-input" class="search-input" placeholder="Keresés…" autocomplete="off" />
      <div id="modal-search-results" class="search-results"></div>
    </div>
  `, {
    onMount: (overlay) => {
      overlay.querySelector('[data-act="close"]').addEventListener('click', () => { closeModal(); renderHianylista(); });
      const input = overlay.querySelector('#modal-search-input');
      const box = overlay.querySelector('#modal-search-results');
      const renderModalResults = (q) => {
        const query = q.trim().toLowerCase();
        const results = (query
          ? activeProducts().filter((p) => p.name.toLowerCase().includes(query) || (p.keywords || []).some((k) => k.toLowerCase().includes(query)))
          : activeProducts().slice().sort((a, b) => a.name.localeCompare(b.name, 'hu'))
        ).slice(0, 40);
        box.innerHTML = results.length ? results.map(searchRowHTML).join('') : emptyHint('Nincs találat.');
        box.querySelectorAll('.search-row').forEach((row) => {
          const id = row.dataset.id;
          row.querySelector('.qty-minus').addEventListener('click', () => changeDailyQty(id, -1).then(() => renderModalResults(input.value)));
          row.querySelector('.qty-plus').addEventListener('click', () => changeDailyQty(id, 1).then(() => renderModalResults(input.value)));
        });
      };
      input.addEventListener('input', debounce(() => renderModalResults(input.value), 120));
      renderModalResults('');
      setTimeout(() => input.focus(), 250);
    },
  });
}

/* ===================== Napi áru kiszedése ===================== */

function renderKiszedes() {
  const el = document.getElementById('view-kiszedes');
  if (state.dailyItems.length === 0) {
    el.innerHTML = `<h2 class="view-title">Napi áru kiszedése</h2>${emptyHint('A mai lista üres, nincs mit kiszedni.')}`;
    return;
  }
  const groups = {};
  state.dailyItems.forEach((item) => {
    const p = getProduct(item.productId);
    if (!p) return;
    const wId = p.warehouseId || '__none__';
    if (!groups[wId]) groups[wId] = [];
    groups[wId].push({ item, product: p });
  });
  const warehouseIds = Object.keys(groups).sort((a, b) => getWarehouseName(a === '__none__' ? null : a).localeCompare(getWarehouseName(b === '__none__' ? null : b), 'hu'));
  const totalChecked = state.dailyItems.filter((i) => i.checked).length;
  el.innerHTML = `
    <h2 class="view-title">Napi áru kiszedése</h2>
    <div class="progress-hint">${totalChecked} / ${state.dailyItems.length} tétel kész</div>
    ${warehouseIds.map((wId) => `
      <div class="warehouse-group">
        <h3 class="warehouse-title">${escapeHTML(getWarehouseName(wId === '__none__' ? null : wId))}</h3>
        ${groups[wId].sort((a, b) => a.product.name.localeCompare(b.product.name, 'hu')).map(({ item, product }) => `
          <label class="pick-row ${item.checked ? 'checked' : ''}">
            <input type="checkbox" class="pick-checkbox" data-id="${item.productId}" ${item.checked ? 'checked' : ''} />
            <span class="pick-name">${escapeHTML(product.name)}</span>
            <span class="pick-qty">${item.quantity} db</span>
          </label>
        `).join('')}
      </div>
    `).join('')}
    <button type="button" id="close-day-btn" class="btn primary full-width">Nap lezárása</button>
  `;
  el.querySelectorAll('.pick-checkbox').forEach((cb) => {
    cb.addEventListener('change', async () => {
      const item = getDailyItem(cb.dataset.id);
      if (!item) return;
      item.checked = cb.checked;
      await DB.put('dailyItems', item);
      cb.closest('.pick-row').classList.toggle('checked', cb.checked);
      const checkedCount = state.dailyItems.filter((i) => i.checked).length;
      const hint = el.querySelector('.progress-hint');
      if (hint) hint.textContent = `${checkedCount} / ${state.dailyItems.length} tétel kész`;
    });
  });
  document.getElementById('close-day-btn').addEventListener('click', closeDay);
}

async function closeDay() {
  if (state.dailyItems.length === 0) {
    toast('A mai lista üres, nincs mit lezárni.');
    return;
  }
  const uncheckedCount = state.dailyItems.filter((i) => !i.checked).length;
  let msg = 'Biztosan lezárod a mai napot? A lista bekerül az előzményekbe, és a mai lista kiürül.';
  if (uncheckedCount > 0) {
    msg = `${uncheckedCount} tétel még nincs kipipálva. ` + msg;
  }
  const ok = await confirmDialog(msg, { title: 'Nap lezárása', okText: 'Lezárás' });
  if (!ok) return;

  const now = Date.now();
  const items = state.dailyItems.map((item) => {
    const p = getProduct(item.productId);
    return {
      productId: item.productId,
      name: p ? p.name : 'Ismeretlen termék',
      category: p ? p.category : '',
      warehouseId: p ? p.warehouseId : null,
      warehouseName: getWarehouseName(p ? p.warehouseId : null),
      quantity: item.quantity,
    };
  });
  const entry = {
    id: uid(),
    closedAt: now,
    startedAt: state.meta.dayStartedAt || now,
    items,
    note: state.meta.dailyNote || '',
  };
  await DB.put('history', entry);
  state.history.unshift(entry);

  for (const item of state.dailyItems) {
    await DB.delete('dailyItems', item.productId);
  }
  state.dailyItems = [];
  state.meta.dailyNote = '';
  state.meta.dayStartedAt = now;
  await DB.put('meta', { key: 'dailyNote', value: '' });
  await DB.put('meta', { key: 'dayStartedAt', value: now });

  toast('A nap sikeresen lezárva.');
  refreshBadges();
  navigate('dashboard');
}

/* ===================== Előzmények ===================== */

function historyRowHTML(h) {
  const totalQty = h.items.reduce((s, i) => s + i.quantity, 0);
  return `
    <div class="history-row" data-id="${h.id}">
      <div class="history-date">${formatDayLabel(h.closedAt)}</div>
      <div class="history-meta">${h.items.length} tétel · ${totalQty} db</div>
    </div>`;
}

function renderElozmenyek() {
  const el = document.getElementById('view-elozmenyek');
  const list = state.history.slice().sort((a, b) => b.closedAt - a.closedAt);
  el.innerHTML = `
    <h2 class="view-title">Előzmények</h2>
    ${list.length === 0 ? emptyHint('Még nincs lezárt nap.') : `<div class="history-list">${list.map(historyRowHTML).join('')}</div>`}
  `;
  el.querySelectorAll('.history-row').forEach((row) => {
    row.addEventListener('click', () => openHistoryDetail(row.dataset.id));
  });
}

function openHistoryDetail(id) {
  const h = state.history.find((x) => x.id === id);
  if (!h) return;
  const groups = {};
  h.items.forEach((item) => {
    const key = item.warehouseName || 'Nincs raktár';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  const warehouseNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'hu'));
  openModal(`
    <div class="modal-header"><h3>${formatDayLabel(h.closedAt)}</h3><button type="button" class="modal-close" data-act="close">✕</button></div>
    <div class="modal-body">
      <div class="history-detail-meta">Lezárva: ${formatDateTime(h.closedAt)}</div>
      ${h.note ? `<div class="note-box"><strong>Napi jegyzet:</strong> ${escapeHTML(h.note)}</div>` : ''}
      ${warehouseNames.map((w) => `
        <div class="warehouse-group">
          <h3 class="warehouse-title">${escapeHTML(w)}</h3>
          ${groups[w].sort((a, b) => a.name.localeCompare(b.name, 'hu')).map((i) => `
            <div class="pick-row static">
              <span class="pick-name">${escapeHTML(i.name)}</span>
              <span class="pick-qty">${i.quantity} db</span>
            </div>`).join('')}
        </div>
      `).join('')}
    </div>
  `, { onMount: (overlay) => overlay.querySelector('[data-act="close"]').addEventListener('click', closeModal) });
}

/* ===================== Statisztikák ===================== */

const statsFilter = { type: '7' };
const statsCustom = { from: null, to: null };

function getStatsRangeBounds() {
  const now = Date.now();
  if (statsFilter.type === '7') {
    return { from: now - 7 * 24 * 60 * 60 * 1000, to: now };
  }
  if (statsFilter.type === '30') {
    return { from: now - 30 * 24 * 60 * 60 * 1000, to: now };
  }
  const from = statsCustom.from ? new Date(statsCustom.from + 'T00:00:00').getTime() : 0;
  const to = statsCustom.to ? new Date(statsCustom.to + 'T23:59:59').getTime() : now;
  return { from, to };
}

function renderStatisztikak() {
  const el = document.getElementById('view-statisztikak');
  el.innerHTML = `
    <h2 class="view-title">Statisztikák</h2>
    <div class="filter-row">
      <button type="button" class="chip ${statsFilter.type === '7' ? 'active' : ''}" data-range="7">7 nap</button>
      <button type="button" class="chip ${statsFilter.type === '30' ? 'active' : ''}" data-range="30">30 nap</button>
      <button type="button" class="chip ${statsFilter.type === 'custom' ? 'active' : ''}" data-range="custom">Egyéni</button>
    </div>
    <div id="custom-range-wrap" class="custom-range-wrap ${statsFilter.type === 'custom' ? '' : 'hidden'}">
      <input type="date" id="range-from" class="input" value="${statsCustom.from || ''}" />
      <span>–</span>
      <input type="date" id="range-to" class="input" value="${statsCustom.to || ''}" />
      <button type="button" id="apply-range-btn" class="btn secondary small">Alkalmaz</button>
    </div>
    <div id="stats-content"></div>
  `;
  el.querySelectorAll('[data-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      statsFilter.type = btn.dataset.range;
      renderStatisztikak();
    });
  });
  const applyBtn = document.getElementById('apply-range-btn');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      statsCustom.from = document.getElementById('range-from').value;
      statsCustom.to = document.getElementById('range-to').value;
      renderStatsContent();
    });
  }
  renderStatsContent();
}

function renderStatsContent() {
  const content = document.getElementById('stats-content');
  if (!content) return;
  const { from, to } = getStatsRangeBounds();
  const entries = state.history.filter((h) => h.closedAt >= from && h.closedAt <= to);
  if (entries.length === 0) {
    content.innerHTML = emptyHint('Nincs adat a kiválasztott időszakban.');
    return;
  }

  const perProduct = {};
  entries.forEach((h) => {
    h.items.forEach((i) => {
      if (!perProduct[i.productId]) perProduct[i.productId] = { name: i.name, qty: 0 };
      perProduct[i.productId].qty += i.quantity;
    });
  });
  const sortedProducts = Object.values(perProduct).sort((a, b) => b.qty - a.qty);
  const top10 = sortedProducts.slice(0, 10);
  const maxQty = top10.length ? top10[0].qty : 1;

  const perDay = {};
  entries.forEach((h) => {
    const dayKey = formatDate(h.closedAt);
    if (!perDay[dayKey]) perDay[dayKey] = { qty: 0, tetelek: 0, ts: h.closedAt };
    perDay[dayKey].qty += h.items.reduce((s, i) => s + i.quantity, 0);
    perDay[dayKey].tetelek += h.items.length;
  });
  const dayRows = Object.entries(perDay).sort((a, b) => b[1].ts - a[1].ts);

  content.innerHTML = `
    <section class="stats-section">
      <h3 class="section-title">Legtöbbet kivitt termékek</h3>
      ${top10.map((p) => `
        <div class="bar-row">
          <div class="bar-label">${escapeHTML(p.name)}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(4, (p.qty / maxQty) * 100)}%"></div></div>
          <div class="bar-value">${p.qty}</div>
        </div>
      `).join('')}
    </section>
    <section class="stats-section">
      <h3 class="section-title">Napi összesítés</h3>
      <div class="daily-summary-list">
        ${dayRows.map(([day, data]) => `
          <div class="daily-summary-row">
            <span>${day}</span>
            <span>${data.tetelek} tétel</span>
            <span>${data.qty} db</span>
          </div>
        `).join('')}
      </div>
    </section>
    <section class="stats-section">
      <h3 class="section-title">Termékenkénti összes kivitt mennyiség</h3>
      <div class="product-total-list">
        ${sortedProducts.map((p) => `
          <div class="daily-summary-row">
            <span>${escapeHTML(p.name)}</span>
            <span>${p.qty} db</span>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

/* ===================== Termékkezelő ===================== */

const productFilter = { status: 'active', warehouseId: '', query: '' };

function productRowHTML(p) {
  const img = p.images && p.images[0] ? p.images[0] : null;
  return `
    <div class="product-row" data-id="${p.id}">
      <div class="search-thumb">${img ? `<img src="${img}" alt="">` : '<span class="thumb-fallback">🎁</span>'}</div>
      <div class="search-info">
        <div class="search-name">${escapeHTML(p.name)}</div>
        <div class="search-sub">${escapeHTML(p.category || '')}${p.category ? ' · ' : ''}${escapeHTML(getWarehouseName(p.warehouseId))}</div>
      </div>
      <span class="badge ${p.status === 'active' ? 'badge-active' : 'badge-archived'}">${p.status === 'active' ? 'Aktív' : 'Archivált'}</span>
    </div>`;
}

function renderTermekek() {
  const el = document.getElementById('view-termekek');
  el.innerHTML = `
    <h2 class="view-title">Termékkezelő</h2>
    <div class="filter-row">
      <button type="button" class="chip ${productFilter.status === 'active' ? 'active' : ''}" data-status="active">Aktív</button>
      <button type="button" class="chip ${productFilter.status === 'archived' ? 'active' : ''}" data-status="archived">Archivált</button>
      <button type="button" class="chip ${productFilter.status === 'all' ? 'active' : ''}" data-status="all">Mind</button>
    </div>
    <div class="filter-row">
      <select id="wh-filter" class="select">
        <option value="">Összes raktár</option>
        ${state.warehouses.map((w) => `<option value="${w.id}" ${productFilter.warehouseId === w.id ? 'selected' : ''}>${escapeHTML(w.name)}</option>`).join('')}
      </select>
      <button type="button" id="manage-warehouses-btn" class="btn secondary small">Raktárak</button>
    </div>
    <input type="search" id="product-filter-search" class="search-input" placeholder="Szűrés név szerint…" value="${escapeHTML(productFilter.query)}" />
    <div id="product-list" class="product-list"></div>
    <button type="button" id="new-product-btn" class="fab">+ Új termék</button>
  `;
  el.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => { productFilter.status = btn.dataset.status; renderTermekek(); });
  });
  document.getElementById('wh-filter').addEventListener('change', (e) => {
    productFilter.warehouseId = e.target.value;
    renderProductList();
  });
  document.getElementById('product-filter-search').addEventListener('input', debounce((e) => {
    productFilter.query = e.target.value;
    renderProductList();
  }, 150));
  document.getElementById('manage-warehouses-btn').addEventListener('click', openWarehouseManager);
  document.getElementById('new-product-btn').addEventListener('click', () => openProductForm());
  renderProductList();
}

function renderProductList() {
  const container = document.getElementById('product-list');
  if (!container) return;
  let list = state.products.slice();
  if (productFilter.status !== 'all') list = list.filter((p) => p.status === productFilter.status);
  if (productFilter.warehouseId) list = list.filter((p) => p.warehouseId === productFilter.warehouseId);
  if (productFilter.query.trim()) {
    const q = productFilter.query.trim().toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q) || (p.keywords || []).some((k) => k.toLowerCase().includes(q)));
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'hu'));
  container.innerHTML = list.length ? list.map(productRowHTML).join('') : emptyHint('Nincs a szűrésnek megfelelő termék.');
  container.querySelectorAll('.product-row').forEach((row) => {
    row.addEventListener('click', () => openProductForm(row.dataset.id));
  });
}

function openProductForm(productId) {
  const editing = !!productId;
  const existing = editing ? getProduct(productId) : null;
  const product = existing || {
    id: uid(), name: '', images: [], category: '', warehouseId: state.warehouses[0] ? state.warehouses[0].id : '',
    shelf: '', keywords: [], status: 'active', note: '', outOfStockEvents: [], createdAt: Date.now(),
  };
  let workingImages = product.images ? product.images.slice() : [];
  let workingKeywords = product.keywords ? product.keywords.slice() : [];
  let currentStatus = product.status;
  const categories = Array.from(new Set(state.products.map((p) => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'hu'));

  openModal(`
    <div class="modal-header"><h3>${editing ? 'Termék szerkesztése' : 'Új termék'}</h3><button type="button" class="modal-close" data-act="close">✕</button></div>
    <div class="modal-body">
      <label class="field-label" for="pf-name">Név</label>
      <input type="text" id="pf-name" class="input" value="${escapeHTML(product.name)}" placeholder="Pl. Gipsz óra" />

      <label class="field-label">Képek</label>
      <div id="pf-images" class="image-preview-row"></div>
      <input type="file" id="pf-image-input" accept="image/*" multiple class="file-input" />
      <label for="pf-image-input" class="btn secondary small">+ Kép hozzáadása</label>

      <label class="field-label" for="pf-category">Kategória</label>
      <input type="text" id="pf-category" class="input" list="pf-category-list" value="${escapeHTML(product.category || '')}" placeholder="Pl. Kerámia" />
      <datalist id="pf-category-list">${categories.map((c) => `<option value="${escapeHTML(c)}">`).join('')}</datalist>

      <label class="field-label" for="pf-warehouse">Raktár</label>
      <select id="pf-warehouse" class="select">
        ${state.warehouses.map((w) => `<option value="${w.id}" ${product.warehouseId === w.id ? 'selected' : ''}>${escapeHTML(w.name)}</option>`).join('')}
      </select>
      ${state.warehouses.length === 0 ? '<div class="hint-text">Nincs még raktár. Hozz létre egyet a Raktárak kezelésénél.</div>' : ''}

      <label class="field-label" for="pf-shelf">Polc (opcionális)</label>
      <input type="text" id="pf-shelf" class="input" value="${escapeHTML(product.shelf || '')}" placeholder="Pl. 3. polc" />

      <label class="field-label">Kulcsszavak</label>
      <div id="pf-keywords" class="chip-input-row"></div>
      <input type="text" id="pf-keyword-input" class="input" placeholder="Írj be egy kulcsszót, majd Enter" />

      <label class="field-label" for="pf-note">Jegyzet</label>
      <textarea id="pf-note" class="textarea" placeholder="Pl. Ezt a mintát nagyon keresik.">${escapeHTML(product.note || '')}</textarea>

      ${editing ? `
      <label class="field-label">Elfogyás előzmények</label>
      <div id="pf-oos-list" class="oos-list"></div>
      <button type="button" id="pf-mark-oos" class="btn secondary small">Elfogyott most</button>
      ` : ''}

      ${editing ? `
      <label class="field-label">Állapot</label>
      <div class="filter-row">
        <button type="button" class="chip ${product.status === 'active' ? 'active' : ''}" data-pf-status="active">Aktív</button>
        <button type="button" class="chip ${product.status === 'archived' ? 'active' : ''}" data-pf-status="archived">Archivált</button>
      </div>
      ` : ''}
    </div>
    <div class="modal-footer">
      <button type="button" class="btn secondary" data-act="cancel">Mégse</button>
      <button type="button" class="btn primary" data-act="save">Mentés</button>
    </div>
  `, {
    closeOnOverlay: false,
    onMount: (overlay) => {
      const renderImages = () => {
        const box = overlay.querySelector('#pf-images');
        box.innerHTML = workingImages.map((img, idx) => `
          <div class="image-thumb"><img src="${img}" alt=""><button type="button" class="image-remove" data-idx="${idx}">✕</button></div>
        `).join('');
        box.querySelectorAll('.image-remove').forEach((btn) => {
          btn.addEventListener('click', () => { workingImages.splice(Number(btn.dataset.idx), 1); renderImages(); });
        });
      };
      const renderKeywords = () => {
        const box = overlay.querySelector('#pf-keywords');
        box.innerHTML = workingKeywords.map((k, idx) => `<span class="chip-tag">${escapeHTML(k)}<button type="button" class="chip-remove" data-idx="${idx}">✕</button></span>`).join('');
        box.querySelectorAll('.chip-remove').forEach((btn) => {
          btn.addEventListener('click', () => { workingKeywords.splice(Number(btn.dataset.idx), 1); renderKeywords(); });
        });
      };
      const renderOOS = () => {
        const box = overlay.querySelector('#pf-oos-list');
        if (!box) return;
        const events = product.outOfStockEvents || [];
        box.innerHTML = events.length ? events.slice().sort((a, b) => b.timestamp - a.timestamp).map((ev) => `
          <div class="oos-row"><span>${escapeHTML(ev.date)} ${escapeHTML(ev.time)}</span><button type="button" class="oos-remove" data-ts="${ev.timestamp}">✕</button></div>
        `).join('') : '<div class="hint-text">Még nincs rögzített elfogyás.</div>';
        box.querySelectorAll('.oos-remove').forEach((btn) => {
          btn.addEventListener('click', () => {
            product.outOfStockEvents = (product.outOfStockEvents || []).filter((e) => e.timestamp !== Number(btn.dataset.ts));
            renderOOS();
          });
        });
      };

      renderImages();
      renderKeywords();
      if (editing) renderOOS();

      overlay.querySelector('#pf-image-input').addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
          try {
            const dataUrl = await resizeImage(file);
            workingImages.push(dataUrl);
          } catch (err) {
            console.error(err);
            toast('Egy kép feltöltése sikertelen.');
          }
        }
        renderImages();
        e.target.value = '';
      });

      const kwInput = overlay.querySelector('#pf-keyword-input');
      kwInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const val = kwInput.value.trim().replace(/,$/, '');
          if (val && !workingKeywords.includes(val)) {
            workingKeywords.push(val);
            renderKeywords();
          }
          kwInput.value = '';
        }
      });

      if (editing) {
        overlay.querySelectorAll('[data-pf-status]').forEach((btn) => {
          btn.addEventListener('click', () => {
            currentStatus = btn.dataset.pfStatus;
            overlay.querySelectorAll('[data-pf-status]').forEach((b) => b.classList.toggle('active', b.dataset.pfStatus === currentStatus));
          });
        });
        overlay.querySelector('#pf-mark-oos').addEventListener('click', () => {
          const now = Date.now();
          product.outOfStockEvents = product.outOfStockEvents || [];
          product.outOfStockEvents.push({ date: formatDate(now), time: formatTime(now), timestamp: now });
          renderOOS();
          toast('Elfogyás rögzítve.');
        });
      }

      overlay.querySelector('[data-act="close"]').addEventListener('click', closeModal);
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
      overlay.querySelector('[data-act="save"]').addEventListener('click', async () => {
        const name = overlay.querySelector('#pf-name').value.trim();
        if (!name) { toast('A név megadása kötelező.'); return; }
        const warehouseId = overlay.querySelector('#pf-warehouse').value || null;
        if (!warehouseId) { toast('Válassz raktárat, vagy hozz létre egyet előbb.'); return; }
        const updated = {
          id: product.id,
          name,
          images: workingImages,
          category: overlay.querySelector('#pf-category').value.trim(),
          warehouseId,
          shelf: overlay.querySelector('#pf-shelf').value.trim(),
          keywords: workingKeywords,
          note: overlay.querySelector('#pf-note').value.trim(),
          status: editing ? currentStatus : 'active',
          outOfStockEvents: product.outOfStockEvents || [],
          createdAt: product.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        await DB.put('products', updated);
        const idx = state.products.findIndex((p) => p.id === updated.id);
        if (idx >= 0) state.products[idx] = updated; else state.products.push(updated);
        closeModal();
        toast(editing ? 'Termék frissítve.' : 'Termék létrehozva.');
        renderTermekek();
        refreshBadges();
      });
    },
  });
}

/* ===================== Raktárak ===================== */

function openWarehouseManager() {
  openModal(`
    <div class="modal-header"><h3>Raktárak kezelése</h3><button type="button" class="modal-close" data-act="close">✕</button></div>
    <div class="modal-body">
      <div id="wh-list" class="wh-list"></div>
      <div class="wh-add-row">
        <input type="text" id="wh-new-name" class="input" placeholder="Új raktár neve" />
        <button type="button" id="wh-add-btn" class="btn primary small">Hozzáadás</button>
      </div>
    </div>
  `, {
    onMount: (overlay) => {
      const renderList = () => {
        const box = overlay.querySelector('#wh-list');
        box.innerHTML = state.warehouses.length ? state.warehouses.map((w) => {
          const count = state.products.filter((p) => p.warehouseId === w.id).length;
          return `
          <div class="wh-row" data-id="${w.id}">
            <input type="text" class="input wh-rename" value="${escapeHTML(w.name)}" />
            <span class="wh-count">${count} termék</span>
            <button type="button" class="row-action wh-delete">Törlés</button>
          </div>`;
        }).join('') : emptyHint('Még nincs raktár.');
        box.querySelectorAll('.wh-row').forEach((row) => {
          const id = row.dataset.id;
          row.querySelector('.wh-rename').addEventListener('change', async (e) => {
            const w = getWarehouse(id);
            if (!w) return;
            w.name = e.target.value.trim() || w.name;
            await DB.put('warehouses', w);
            toast('Raktár átnevezve.');
          });
          row.querySelector('.wh-delete').addEventListener('click', () => deleteWarehouse(id, renderList));
        });
      };
      renderList();
      overlay.querySelector('#wh-add-btn').addEventListener('click', async () => {
        const input = overlay.querySelector('#wh-new-name');
        const name = input.value.trim();
        if (!name) return;
        const wh = { id: uid(), name, createdAt: Date.now() };
        await DB.put('warehouses', wh);
        state.warehouses.push(wh);
        input.value = '';
        renderList();
      });
      overlay.querySelector('[data-act="close"]').addEventListener('click', () => {
        closeModal();
        if (!document.getElementById('view-termekek').classList.contains('hidden')) renderTermekek();
      });
    },
  });
}

async function deleteWarehouse(id, refreshList) {
  const productsInWh = state.products.filter((p) => p.warehouseId === id);
  if (productsInWh.length > 0) {
    if (state.warehouses.length < 2) {
      await confirmDialog('Ehhez a raktárhoz termékek tartoznak, és nincs másik raktár, ahova át lehetne helyezni őket. Előbb hozz létre egy másik raktárat.', { okText: 'Rendben', cancelText: 'Bezár' });
      return;
    }
    const target = await pickReplacementWarehouse(id);
    if (!target) return;
    for (const p of productsInWh) {
      p.warehouseId = target;
      await DB.put('products', p);
    }
  } else {
    const ok = await confirmDialog('Biztosan törlöd ezt a raktárat?', { danger: true, okText: 'Törlés' });
    if (!ok) return;
  }
  await DB.delete('warehouses', id);
  state.warehouses = state.warehouses.filter((w) => w.id !== id);
  toast('Raktár törölve.');
  if (refreshList) refreshList();
}

/* ===================== Jegyzetek / Ötletek ===================== */

function openNotesManager() {
  openModal(`
    <div class="modal-header"><h3>Jegyzetek / Ötletek</h3><button type="button" class="modal-close" data-act="close">✕</button></div>
    <div class="modal-body">
      <div id="notes-list" class="notes-list"></div>
      <label class="field-label" for="new-note-input">Új ötlet, teendő</label>
      <textarea id="new-note-input" class="textarea" placeholder="Pl. Rendelni kell új mágnest."></textarea>
      <button type="button" id="add-note-btn" class="btn primary small">Hozzáadás</button>
    </div>
  `, {
    onMount: (overlay) => {
      const renderList = () => {
        const box = overlay.querySelector('#notes-list');
        box.innerHTML = state.notes.length ? state.notes.map((n) => `
          <div class="note-row ${n.done ? 'done' : ''}" data-id="${n.id}">
            <label class="note-check"><input type="checkbox" class="note-done-cb" ${n.done ? 'checked' : ''} /></label>
            <span class="note-text">${escapeHTML(n.text)}</span>
            <button type="button" class="row-action note-delete">✕</button>
          </div>
        `).join('') : emptyHint('Még nincs jegyzet.');
        box.querySelectorAll('.note-row').forEach((row) => {
          const id = row.dataset.id;
          row.querySelector('.note-done-cb').addEventListener('change', async (e) => {
            const n = state.notes.find((x) => x.id === id);
            if (!n) return;
            n.done = e.target.checked;
            await DB.put('notes', n);
            renderList();
          });
          row.querySelector('.note-delete').addEventListener('click', async () => {
            const ok = await confirmDialog('Törlöd ezt a jegyzetet?');
            if (!ok) return;
            state.notes = state.notes.filter((x) => x.id !== id);
            await DB.delete('notes', id);
            renderList();
          });
        });
      };
      renderList();
      overlay.querySelector('#add-note-btn').addEventListener('click', async () => {
        const input = overlay.querySelector('#new-note-input');
        const text = input.value.trim();
        if (!text) return;
        const note = { id: uid(), text, done: false, createdAt: Date.now() };
        await DB.put('notes', note);
        state.notes.unshift(note);
        input.value = '';
        renderList();
      });
      overlay.querySelector('[data-act="close"]').addEventListener('click', closeModal);
    },
  });
}

/* ===================== Beállítások ===================== */

function renderBeallitasok() {
  const el = document.getElementById('view-beallitasok');
  el.innerHTML = `
    <h2 class="view-title">Beállítások</h2>
    <div class="settings-section">
      <button type="button" class="settings-row" id="settings-warehouses"><span>🏬 Raktárak kezelése</span><span class="chevron">›</span></button>
      <button type="button" class="settings-row" id="settings-notes"><span>💡 Jegyzetek / Ötletek</span><span class="chevron">›</span></button>
    </div>
    <div class="settings-section">
      <button type="button" class="settings-row" id="settings-export"><span>⬇️ Adatok exportálása</span><span class="chevron">›</span></button>
      <button type="button" class="settings-row" id="settings-import"><span>⬆️ Adatok importálása</span><span class="chevron">›</span></button>
      <input type="file" id="import-file-input" accept="application/json" class="file-input" />
      <button type="button" class="settings-row danger" id="settings-reset"><span>🗑️ Összes adat törlése</span><span class="chevron">›</span></button>
    </div>
    <div class="app-footer">Utánpótlás Kezelő · v1.0</div>
  `;
  document.getElementById('settings-warehouses').addEventListener('click', openWarehouseManager);
  document.getElementById('settings-notes').addEventListener('click', openNotesManager);
  document.getElementById('settings-export').addEventListener('click', exportData);
  document.getElementById('settings-import').addEventListener('click', () => document.getElementById('import-file-input').click());
  document.getElementById('import-file-input').addEventListener('change', importData);
  document.getElementById('settings-reset').addEventListener('click', resetAllData);
}

async function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    warehouses: state.warehouses,
    products: state.products,
    dailyItems: state.dailyItems,
    history: state.history,
    notes: state.notes,
    meta: state.meta,
  };
  const json = JSON.stringify(payload, null, 2);
  const filename = `utanpotlas-mentes-${formatDate(Date.now()).replace(/[.\s]/g, '')}.json`;
  const blob = new Blob([json], { type: 'application/json' });

  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Utánpótlás mentés' });
        return;
      }
    } catch (err) {
      // ha megszakítja vagy hiba történik, essünk vissza a letöltésre
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const ok = await confirmDialog('Az importálás felülírja a jelenlegi adatokat. Biztosan folytatod?', { danger: true, okText: 'Importálás' });
    if (!ok) return;
    await Promise.all(['warehouses', 'products', 'dailyItems', 'history', 'notes', 'meta'].map((s) => DB.clear(s)));
    for (const w of data.warehouses || []) await DB.put('warehouses', w);
    for (const p of data.products || []) await DB.put('products', p);
    for (const d of data.dailyItems || []) await DB.put('dailyItems', d);
    for (const h of data.history || []) await DB.put('history', h);
    for (const n of data.notes || []) await DB.put('notes', n);
    for (const key of Object.keys(data.meta || {})) await DB.put('meta', { key, value: data.meta[key] });
    await loadState();
    toast('Adatok importálva.');
    refreshBadges();
    router();
  } catch (err) {
    console.error(err);
    toast('Hiba történt az importálás során. Ellenőrizd a fájlt.');
  }
}

async function resetAllData() {
  const first = await confirmDialog('Ez véglegesen törli az összes terméket, raktárat, előzményt és jegyzetet. Ez nem vonható vissza.', { danger: true, okText: 'Törlés' });
  if (!first) return;
  const second = await confirmDialog('Biztosan biztos vagy benne? Ez az utolsó megerősítés.', { danger: true, okText: 'Igen, törlés' });
  if (!second) return;
  await Promise.all(['warehouses', 'products', 'dailyItems', 'history', 'notes', 'meta'].map((s) => DB.clear(s)));
  await loadState();
  await ensureDefaultWarehouse();
  toast('Minden adat törölve.');
  refreshBadges();
  router();
}

/* ===================== Indítás ===================== */

function setupNav() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.view));
  });
  const settingsBtn = document.getElementById('topbar-settings');
  if (settingsBtn) settingsBtn.addEventListener('click', () => navigate('beallitasok'));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch((err) => console.error('SW regisztráció sikertelen', err));
    });
  }
}

async function initApp() {
  try {
    await loadState();
    await ensureDefaultWarehouse();
    setupNav();
    window.addEventListener('hashchange', router);
    router();
    refreshBadges();
    registerServiceWorker();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('view-dashboard');
    if (el) el.innerHTML = emptyHint('Hiba történt az alkalmazás indításakor. Próbáld újratölteni az oldalt.');
  }
}

document.addEventListener('DOMContentLoaded', initApp);

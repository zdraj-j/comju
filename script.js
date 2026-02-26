/**
 * LexGestión — Script Principal v4
 * Nuevos en v4:
 *  1. Temas de color: claro, oscuro, sepia, pizarra
 *  2. Versión móvil: bottom sheet para ordenar y columnas
 *  3. Scroll correcto en móvil (overflow fix)
 *  4. Tarjetas compactas en móvil
 */

// ============================================================
// TEMAS
// ============================================================
const THEMES = [
  {
    id: 'claro',
    nombre: 'Claro',
    swatches: ['#f4f5f7', '#ffffff', '#3b5bdb', '#1a1d23'],
  },
  {
    id: 'oscuro',
    nombre: 'Oscuro',
    swatches: ['#0f1117', '#1a1d27', '#6e8efb', '#e8eaf0'],
  },
  {
    id: 'sepia',
    nombre: 'Sepia',
    swatches: ['#f5f0e8', '#fdf8f0', '#8b6c2e', '#2c2416'],
  },
  {
    id: 'pizarra',
    nombre: 'Pizarra',
    swatches: ['#1e2533', '#26304a', '#58a6f0', '#d4daf0'],
  },
];

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  STATE.config.theme = id;
  // Actualizar botones en config si están visibles
  document.querySelectorAll('.theme-card').forEach(c => {
    c.classList.toggle('active', c.dataset.theme === id);
  });
}

// ============================================================
// DEFAULTS
// ============================================================
const DEFAULT_CONFIG = {
  abogado1: 'Abogado 1',
  abogado2: 'Abogado 2',
  colorAbogado1: '#15803d',
  colorAbogado2: '#1d4ed8',
  colorBar1: '#f59e0b',
  colorBar2: '#3b5bdb',
  colorBar3: '#10b981',
  modulos: [
    { sigla: 'ACT',  nombre: 'Actuaciones administrativas' },
    { sigla: 'CBPR', nombre: 'Cobro prejurídico' },
    { sigla: 'COT',  nombre: 'Conceptos y otros trámites' },
    { sigla: 'CPJ',  nombre: 'Conciliación prejudicial' },
    { sigla: 'CNT',  nombre: 'Contratos' },
    { sigla: 'OTR',  nombre: 'Otros documentos contractuales' },
    { sigla: 'ROD',  nombre: 'Respuesta oficios y derechos de petición' },
    { sigla: 'PRE',  nombre: 'Precontractual' },
    { sigla: 'PRJ',  nombre: 'Procesos judiciales' },
    { sigla: 'TTL',  nombre: 'Tutelas' },
  ],
  columns: 1,
  detailMode: 'expand',
  sortBy: 'vencimiento',
  theme: 'claro',
};

// ============================================================
// ESTADO GLOBAL
// ============================================================
const STATE = {
  tramites: [],
  order: [],
  config: { ...DEFAULT_CONFIG, modulos: [...DEFAULT_CONFIG.modulos] },
};

let currentDetailId = null;
let isEditing = false;
let editingId = null;

// ============================================================
// PERSISTENCIA
// ============================================================
const KEYS = {
  tramites: 'lexgestion_tramites',
  order:    'lexgestion_order',
  config:   'lexgestion_config',
};

function saveAll() {
  localStorage.setItem(KEYS.tramites, JSON.stringify(STATE.tramites));
  localStorage.setItem(KEYS.order,    JSON.stringify(STATE.order));
  localStorage.setItem(KEYS.config,   JSON.stringify(STATE.config));
}

function loadAll() {
  try {
    const t = localStorage.getItem(KEYS.tramites);
    if (t) STATE.tramites = JSON.parse(t);
    const o = localStorage.getItem(KEYS.order);
    if (o) STATE.order = JSON.parse(o);
    const c = localStorage.getItem(KEYS.config);
    if (c) STATE.config = Object.assign(
      { ...DEFAULT_CONFIG, modulos: [...DEFAULT_CONFIG.modulos] },
      JSON.parse(c)
    );
  } catch (e) {
    console.error('Error cargando datos:', e);
  }
}

// ============================================================
// HELPERS
// ============================================================
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/** Fecha local YYYY-MM-DD (evita desfase UTC) */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(s) {
  if (!s) return '—';
  const [y,m,d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function dateClass(s) {
  if (!s) return '';
  const t = today();
  if (s < t) return 'overdue';
  if (s === t) return 'today';
  return 'upcoming';
}

function vencClass(s, tramite) {
  if (!s) return '';
  if (tramite && tramite.gestion && tramite.gestion.cumplimiento) return 'upcoming';
  const t = today();
  if (s < t) return 'overdue';
  if (s === t) return 'today';
  const diff = Math.ceil((new Date(s) - new Date(t)) / 86400000);
  if (diff <= 7) return 'soon';
  return 'upcoming';
}

function abogadoName(key) {
  if (key === 'abogado1') return STATE.config.abogado1;
  if (key === 'abogado2') return STATE.config.abogado2;
  return 'Auxiliar';
}

function abogadoColor(key) {
  if (key === 'abogado1') return STATE.config.colorAbogado1 || '#15803d';
  if (key === 'abogado2') return STATE.config.colorAbogado2 || '#1d4ed8';
  return '#6b7280';
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function computeEtapa(t) {
  return (t.gestion && t.gestion.cumplimiento) ? 'seguimiento' : 'gestion';
}

function purgeExpiredFinished() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const before = STATE.tramites.length;
  STATE.tramites = STATE.tramites.filter(t => !t.terminado || new Date(t.terminadoEn) > cutoff);
  if (STATE.tramites.length !== before) saveAll();
}

function applyCssColors() {
  const s = document.documentElement.style;
  s.setProperty('--color-abogado1', STATE.config.colorAbogado1 || '#15803d');
  s.setProperty('--color-abogado2', STATE.config.colorAbogado2 || '#1d4ed8');
  s.setProperty('--bar-color-1', STATE.config.colorBar1 || '#f59e0b');
  s.setProperty('--bar-color-2', STATE.config.colorBar2 || '#3b5bdb');
  s.setProperty('--bar-color-3', STATE.config.colorBar3 || '#10b981');
}

// ============================================================
// TOAST
// ============================================================
const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ============================================================
// SELECTS
// ============================================================
function populateModuloSelects() {
  ['filterModulo','fModulo'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = id === 'filterModulo' ? '<option value="">Todos</option>' : '';
    STATE.config.modulos.forEach(m => {
      const o = document.createElement('option');
      o.value = m.sigla; o.textContent = `${m.sigla} — ${m.nombre}`;
      sel.appendChild(o);
    });
    sel.value = cur;
  });
}

function updateAbogadoNames() {
  const n1 = STATE.config.abogado1, n2 = STATE.config.abogado2;
  [['filterAbogado1Opt',n1],['filterAbogado2Opt',n2],
   ['filterResp1Opt',n1],['filterResp2Opt',n2],
   ['fAbog1Opt',n1],['fAbog2Opt',n2]
  ].forEach(([id,val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
}

// ============================================================
// COLUMNAS
// ============================================================
function setColumns(n) {
  STATE.config.columns = n;
  ['tramiteList','todayList','finishedList'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = `tramite-list cols-${n}`;
  });
  // Desktop buttons
  document.querySelectorAll('.col-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.cols) === n));
  // Mobile buttons
  document.querySelectorAll('.mob-col-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.cols) === n));
  saveAll();
}

// ============================================================
// MODO DETALLE
// ============================================================
function setDetailMode(mode) {
  STATE.config.detailMode = mode;
  document.getElementById('modeExpand').classList.toggle('active', mode === 'expand');
  document.getElementById('modeModal').classList.toggle('active', mode === 'modal');
  saveAll();
}

// ============================================================
// ORDENAMIENTO
// ============================================================
function setSortBy(val) {
  STATE.config.sortBy = val;
  // Sync both selects
  const ds = document.getElementById('sortSelect');
  const ms = document.getElementById('sortSelectMob');
  if (ds) ds.value = val;
  if (ms) ms.value = val;
  saveAll(); renderAll();
}

function sortActives(list) {
  const manualOrder = getActiveOrder();
  const sortBy = STATE.config.sortBy || 'vencimiento';
  const FAR = '9999-99-99';
  return [...list].sort((a, b) => {
    let cmp = 0;
    if (sortBy === 'vencimiento') {
      cmp = (a.fechaVencimiento||FAR).localeCompare(b.fechaVencimiento||FAR);
    } else if (sortBy === 'proximaAccion') {
      cmp = (a.proximaAccion?.fecha||FAR).localeCompare(b.proximaAccion?.fecha||FAR);
    } else if (sortBy === 'mixto') {
      const ma = [a.fechaVencimiento, a.proximaAccion?.fecha].filter(Boolean).sort()[0] || FAR;
      const mb = [b.fechaVencimiento, b.proximaAccion?.fecha].filter(Boolean).sort()[0] || FAR;
      cmp = ma.localeCompare(mb);
    } else if (sortBy === 'abogado') {
      cmp = abogadoName(a.abogado).toLowerCase().localeCompare(abogadoName(b.abogado).toLowerCase());
    } else if (sortBy === 'numero') {
      cmp = (parseInt(a.numero)||0) - (parseInt(b.numero)||0);
    }
    if (cmp !== 0) return cmp;
    return manualOrder.indexOf(a.id) - manualOrder.indexOf(b.id);
  });
}

// ============================================================
// DETALLE — CONTENIDO COMPARTIDO
// ============================================================
function buildDetailContent(t) {
  const etapa = computeEtapa(t);
  const etapaLabel = etapa === 'seguimiento' ? 'Seguimiento' : 'Gestión';
  const etapaCls   = etapa === 'seguimiento' ? 'seguimiento' : '';
  const p = `det_${t.id}`;

  return `
    <div class="detail-section">
      <h3>Gestión</h3>
      <div class="checks-row">
        <label class="check-label">
          <input type="checkbox" id="${p}_analisis" ${t.gestion.analisis ? 'checked' : ''} />
          <span class="check-custom"></span> Análisis
        </label>
        <label class="check-label">
          <input type="checkbox" id="${p}_cumplimiento" ${t.gestion.cumplimiento ? 'checked' : ''} />
          <span class="check-custom"></span> Cumplimiento
        </label>
      </div>
    </div>

    <div class="detail-section">
      <h3>Seguimiento <span class="etapa-badge ${etapaCls}" id="${p}_etapabadge">${etapaLabel}</span></h3>
      <div id="${p}_actividades"></div>
      <div class="add-actividad-row">
        <input type="text" id="${p}_newActDesc" placeholder="Nueva actividad…" />
        <input type="date" id="${p}_newActFecha" />
        <button class="btn-small" id="${p}_addAct">+ Agregar</button>
      </div>
    </div>

    <div class="detail-section">
      <h3>Próxima acción</h3>
      <div class="form-grid">
        <div class="form-group full">
          <label>Descripción</label>
          <input type="text" id="${p}_accionDesc" value="${escapeAttr(t.proximaAccion?.descripcion||'')}" placeholder="¿Qué se debe hacer?" />
        </div>
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="${p}_accionFecha" value="${t.proximaAccion?.fecha||''}" />
        </div>
        <div class="form-group">
          <label>Responsable</label>
          <select id="${p}_accionResp">
            <option value="${t.abogado}" ${(!t.proximaAccion?.responsable || t.proximaAccion?.responsable === t.abogado) ? 'selected':''}>${abogadoName(t.abogado)}</option>
            <option value="auxiliar" ${t.proximaAccion?.responsable === 'auxiliar' ? 'selected':''}>Auxiliar</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button class="btn-small" id="${p}_saveAccion">Guardar próxima acción</button>
        <button class="btn-small" id="${p}_clearAccion" style="background:var(--surface);color:var(--danger);border:1px solid var(--danger)">✕ Eliminar acción</button>
      </div>
    </div>

    <div class="detail-section">
      <h3>Fecha de vencimiento</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="${p}_vencimiento" value="${t.fechaVencimiento||''}" />
        </div>
      </div>
      <button class="btn-small" id="${p}_saveVenc" style="margin-top:10px">Guardar fecha</button>
    </div>

    <div class="detail-section">
      <h3>Notas</h3>
      <div id="${p}_notas"></div>
      <div class="add-nota-row">
        <textarea id="${p}_newNota" placeholder="Escribe una nota…" rows="2"></textarea>
        <button class="btn-small" id="${p}_addNota">+ Nota</button>
      </div>
    </div>
  `;
}

function bindDetailContent(t, container) {
  const p = `det_${t.id}`;

  container.querySelector(`#${p}_analisis`).addEventListener('change', e => {
    t.gestion.analisis = e.target.checked; saveAll(); renderAll();
  });
  container.querySelector(`#${p}_cumplimiento`).addEventListener('change', e => {
    t.gestion.cumplimiento = e.target.checked;
    const badge = container.querySelector(`#${p}_etapabadge`);
    const etapa = computeEtapa(t);
    if (badge) { badge.textContent = etapa === 'seguimiento' ? 'Seguimiento' : 'Gestión'; badge.className = 'etapa-badge' + (etapa === 'seguimiento' ? ' seguimiento' : ''); }
    saveAll(); renderAll();
  });

  renderActividadesIn(t, container.querySelector(`#${p}_actividades`));
  container.querySelector(`#${p}_addAct`).addEventListener('click', () => {
    const desc  = container.querySelector(`#${p}_newActDesc`).value.trim();
    const fecha = container.querySelector(`#${p}_newActFecha`).value;
    if (!desc) { showToast('Escribe una descripción.'); return; }
    t.seguimiento.push({ descripcion: desc, fecha, estado: 'pendiente' });
    container.querySelector(`#${p}_newActDesc`).value = '';
    container.querySelector(`#${p}_newActFecha`).value = '';
    saveAll(); renderActividadesIn(t, container.querySelector(`#${p}_actividades`));
    showToast('Actividad agregada.');
  });

  container.querySelector(`#${p}_saveAccion`).addEventListener('click', () => {
    const desc = container.querySelector(`#${p}_accionDesc`).value.trim();
    const fecha = container.querySelector(`#${p}_accionFecha`).value;
    const resp  = container.querySelector(`#${p}_accionResp`).value;
    t.proximaAccion = (desc || fecha) ? { descripcion: desc, fecha, responsable: resp } : null;
    saveAll(); renderAll(); showToast('Próxima acción guardada.');
  });

  container.querySelector(`#${p}_clearAccion`).addEventListener('click', () => {
    t.proximaAccion = null;
    container.querySelector(`#${p}_accionDesc`).value = '';
    container.querySelector(`#${p}_accionFecha`).value = '';
    saveAll(); renderAll(); showToast('Próxima acción eliminada.');
  });

  container.querySelector(`#${p}_saveVenc`).addEventListener('click', () => {
    const fecha = container.querySelector(`#${p}_vencimiento`).value;
    if (!fecha) { showToast('Selecciona una fecha.'); return; }
    t.fechaVencimiento = fecha; saveAll(); renderAll();
    showToast('Fecha de vencimiento actualizada.');
  });

  renderNotasIn(t, container.querySelector(`#${p}_notas`));
  container.querySelector(`#${p}_addNota`).addEventListener('click', () => {
    const texto = container.querySelector(`#${p}_newNota`).value.trim();
    if (!texto) { showToast('Escribe el texto de la nota.'); return; }
    t.notas.push({ texto, fecha: new Date().toISOString() });
    container.querySelector(`#${p}_newNota`).value = '';
    saveAll(); renderNotasIn(t, container.querySelector(`#${p}_notas`));
    showToast('Nota agregada.');
  });
}

function renderActividadesIn(t, listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  (t.seguimiento || []).forEach((act, i) => {
    const div = document.createElement('div');
    div.className = 'actividad-item';
    const isDone = act.estado === 'realizado';
    div.innerHTML = `
      <div class="actividad-check-wrap">
        <label class="round-check-wrap">
          <input type="checkbox" ${isDone ? 'checked' : ''} />
          <div class="round-check-box"></div>
        </label>
      </div>
      <div class="actividad-info">
        <div class="actividad-desc ${isDone ? 'done' : ''}">${escapeHtml(act.descripcion)}</div>
        <div class="actividad-fecha">
          <input type="date" value="${act.fecha||''}" />
          <span class="actividad-estado ${act.estado}">${act.estado === 'realizado' ? 'Realizado' : 'Pendiente'}</span>
        </div>
      </div>
      <button class="actividad-delete" title="Eliminar">✕</button>`;
    div.querySelector('input[type="checkbox"]').addEventListener('change', e => {
      t.seguimiento[i].estado = e.target.checked ? 'realizado' : 'pendiente';
      saveAll(); renderActividadesIn(t, listEl);
    });
    div.querySelector('input[type="date"]').addEventListener('change', e => {
      t.seguimiento[i].fecha = e.target.value; saveAll();
    });
    div.querySelector('.actividad-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta actividad?')) { t.seguimiento.splice(i,1); saveAll(); renderActividadesIn(t, listEl); }
    });
    listEl.appendChild(div);
  });
}

function renderNotasIn(t, listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  [...(t.notas||[])].sort((a,b) => a.fecha.localeCompare(b.fecha)).forEach(nota => {
    const idx = t.notas.indexOf(nota);
    const div = document.createElement('div');
    div.className = 'nota-item';
    div.innerHTML = `
      <div class="nota-text">${escapeHtml(nota.texto)}</div>
      <div class="nota-fecha">${formatDatetime(nota.fecha)}</div>
      <button class="nota-delete" title="Eliminar">✕</button>`;
    div.querySelector('.nota-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta nota?')) { t.notas.splice(idx,1); saveAll(); renderNotasIn(t,listEl); }
    });
    listEl.appendChild(div);
  });
}

// ============================================================
// ABRIR DETALLE
// ============================================================
function openDetail(id) {
  const t = getById(id);
  if (!t) return;
  currentDetailId = id;
  if (STATE.config.detailMode === 'modal') openDetailModal(t);
  else openDetailExpand(t);
}

function openDetailModal(t) {
  closeAllExpands();
  document.getElementById('detailTitle').textContent = `Trámite #${t.numero}`;
  document.getElementById('detailSubtitle').textContent =
    `${t.descripcion} · ${abogadoName(t.abogado)} · ${t.modulo}` +
    (t.fechaVencimiento ? ` · Vence: ${formatDate(t.fechaVencimiento)}` : '');
  const body = document.getElementById('detailModalBody');
  body.innerHTML = buildDetailContent(t);
  bindDetailContent(t, body);
  const finBtn = document.getElementById('finishDetailBtn');
  finBtn.textContent = t.terminado ? '↩' : '✓';
  finBtn.title = t.terminado ? 'Deshacer terminar' : 'Marcar como terminado';
  document.getElementById('detailOverlay').classList.add('open');
}

function openDetailExpand(t) {
  const activeSection = document.querySelector('.view.active');
  let wrapper = activeSection ? activeSection.querySelector(`.card-wrapper[data-id="${t.id}"]`) : null;
  if (!wrapper) wrapper = document.querySelector(`.card-wrapper[data-id="${t.id}"]`);
  if (!wrapper) return;

  const alreadyOpen = wrapper.querySelector('.expand-panel.open');
  closeAllExpands();
  if (alreadyOpen) return;

  wrapper.querySelector('.tramite-card').classList.add('card-open');

  let panel = wrapper.querySelector('.expand-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'expand-panel';
    const inner = document.createElement('div');
    inner.className = 'expand-panel-inner';

    const actBar = document.createElement('div');
    actBar.className = 'expand-actions';
    actBar.innerHTML = `
      <button class="btn-icon" title="Editar" data-action="edit">✎</button>
      <button class="btn-icon btn-icon-danger" title="Eliminar" data-action="delete">🗑</button>
      <button class="btn-icon btn-icon-finish" title="${t.terminado?'Deshacer terminar':'Terminar'}" data-action="finish">${t.terminado?'↩':'✓'}</button>
      <button class="btn-icon modal-close" title="Cerrar" data-action="close">✕</button>`;

    actBar.querySelector('[data-action="edit"]').addEventListener('click', () => { closeAllExpands(); openModal(t); });
    actBar.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (confirm('¿Eliminar este trámite?')) {
        STATE.tramites = STATE.tramites.filter(x => x.id !== t.id);
        STATE.order    = STATE.order.filter(id => id !== t.id);
        saveAll(); closeAllExpands(); renderAll(); showToast('Trámite eliminado.');
      }
    });
    actBar.querySelector('[data-action="finish"]').addEventListener('click', () => {
      if (t.terminado) { t.terminado = false; t.terminadoEn = null; showToast('Trámite reactivado.'); }
      else { if (!confirm('¿Marcar como terminado?')) return; t.terminado = true; t.terminadoEn = new Date().toISOString(); showToast('Trámite terminado.'); }
      saveAll(); closeAllExpands(); renderAll();
    });
    actBar.querySelector('[data-action="close"]').addEventListener('click', closeAllExpands);

    inner.appendChild(actBar);
    const content = document.createElement('div');
    content.innerHTML = buildDetailContent(t);
    inner.appendChild(content);
    bindDetailContent(t, content);
    panel.appendChild(inner);
    wrapper.appendChild(panel);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
}

function closeAllExpands() {
  document.querySelectorAll('.expand-panel.open').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.tramite-card.card-open').forEach(c => c.classList.remove('card-open'));
  currentDetailId = null;
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  currentDetailId = null;
}

// ============================================================
// CONSTRUIR CARD
// ============================================================
function buildCard(t) {
  const wrapper = document.createElement('div');
  wrapper.className = 'card-wrapper';
  wrapper.dataset.id = t.id;

  const card = document.createElement('div');
  card.className = 'tramite-card' + (t.terminado ? ' finished-card' : '');
  card.dataset.id = t.id;
  card.draggable = !t.terminado;

  const seg1 = t.gestion?.analisis    ? 'active-1' : '';
  const seg2 = t.gestion?.cumplimiento ? 'active-2' : '';
  const seg3 = t.terminado             ? 'active-3' : '';

  const accion = t.proximaAccion || {};
  const dcls   = dateClass(accion.fecha);
  const etapa  = computeEtapa(t);
  const vcls   = vencClass(t.fechaVencimiento, t);

  const etapaTag = t.terminado
    ? `<span class="tag tag-terminado">Terminado</span>`
    : etapa === 'seguimiento'
      ? `<span class="tag tag-etapa-seguimiento">Seguimiento</span>`
      : `<span class="tag tag-etapa-gestion">Gestión</span>`;

  const abColor = abogadoColor(t.abogado);
  const abBg    = hexToRgba(abColor, 0.12);
  const abogadoTag = `<span class="tag tag-abogado" style="background:${abBg};color:${abColor}">${abogadoName(t.abogado)}</span>`;

  const accionFechaLabel = accion.fecha ? `<span class="accion-fecha ${dcls}">${formatDate(accion.fecha)}</span>` : '';
  const accionDescTxt = accion.descripcion
    ? `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${accion.descripcion.slice(0,48)}${accion.descripcion.length>48?'…':''}</span>`
    : '<span style="color:var(--text-muted)">Sin próxima acción</span>';

  let vencHtml = '';
  if (t.fechaVencimiento) {
    const lbl = vcls==='overdue' ? '⚠ Vencido' : vcls==='today' ? '⚠ Hoy' : vcls==='soon' ? '⏰ Pronto' : '📅 Vence';
    vencHtml = `<span class="venc-fecha ${vcls}">${lbl}: ${formatDate(t.fechaVencimiento)}</span>`;
  }

  const showChecks = !t.terminado;

  card.innerHTML = `
    <div class="card-progress-bar">
      <div class="progress-segment ${seg1}"></div>
      <div class="progress-segment ${seg2}"></div>
      <div class="progress-segment ${seg3}"></div>
    </div>
    <div class="card-body">
      ${showChecks ? `
      <div class="card-checks" id="checks_${t.id}">
        <label class="round-check-wrap" title="Análisis">
          <input type="checkbox" class="card-check-analisis" ${t.gestion?.analisis?'checked':''} />
          <div class="round-check-box"></div>
          <span class="check-label-text">An.</span>
        </label>
        <label class="round-check-wrap" title="Cumplimiento">
          <input type="checkbox" class="card-check-cumplimiento" ${t.gestion?.cumplimiento?'checked':''} />
          <div class="round-check-box"></div>
          <span class="check-label-text">Cu.</span>
        </label>
      </div>` : ''}
      <div class="card-info">
        <div class="card-top-row">
          <span class="card-numero">#${t.numero}</span>
          <span class="tag tag-modulo">${t.modulo}</span>
          ${abogadoTag}
          ${etapaTag}
        </div>
        <div class="card-desc">${escapeHtml(t.descripcion || '(sin descripción)')}</div>
        <div class="card-dates">${vencHtml}</div>
        <div class="card-accion">
          <div class="accion-dot ${dcls}"></div>
          ${accionDescTxt}
          ${accionFechaLabel}
          ${accion.responsable ? `<span style="color:var(--text-muted);font-size:11px">· ${abogadoName(accion.responsable)}</span>` : ''}
        </div>
      </div>
    </div>`;

  card.addEventListener('click', e => {
    if (e.target.closest('.card-checks')) return;
    openDetail(t.id);
  });

  if (showChecks) {
    const cc = card.querySelector(`#checks_${t.id}`);
    cc.addEventListener('click', e => e.stopPropagation());
    card.querySelector('.card-check-analisis').addEventListener('change', e => {
      t.gestion.analisis = e.target.checked; saveAll(); renderAll();
    });
    card.querySelector('.card-check-cumplimiento').addEventListener('change', e => {
      t.gestion.cumplimiento = e.target.checked; saveAll(); renderAll();
    });
  }

  if (!t.terminado) attachDragEvents(card, wrapper);
  wrapper.appendChild(card);
  return wrapper;
}

// ============================================================
// DRAG & DROP
// ============================================================
let dragSrcId = null;

function attachDragEvents(card, wrapper) {
  card.addEventListener('dragstart', e => { dragSrcId = wrapper.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
  card.addEventListener('dragend',   () => { card.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); });
  card.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (wrapper.dataset.id !== dragSrcId) card.classList.add('drag-over'); });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); card.classList.remove('drag-over'); if (dragSrcId && dragSrcId !== wrapper.dataset.id) reorder(dragSrcId, wrapper.dataset.id); });
}

function reorder(srcId, targetId) {
  const order = getActiveOrder();
  const si = order.indexOf(srcId), ti = order.indexOf(targetId);
  if (si === -1 || ti === -1) return;
  order.splice(si,1); order.splice(ti,0,srcId);
  STATE.order = order; saveAll(); renderAll();
}

function getActiveOrder() {
  const activeIds = STATE.tramites.filter(t => !t.terminado).map(t => t.id);
  const existing  = STATE.order.filter(id => activeIds.includes(id));
  const missing   = activeIds.filter(id => !existing.includes(id));
  return [...existing, ...missing];
}

// ============================================================
// RENDER
// ============================================================
function getById(id) { return STATE.tramites.find(t => t.id === id); }

function getFilters() {
  return {
    abogado:     document.getElementById('filterAbogado').value,
    modulo:      document.getElementById('filterModulo').value,
    responsable: document.getElementById('filterResponsable').value,
    etapa:       document.getElementById('filterEtapa').value,
    search:      document.getElementById('searchInput').value.trim().toLowerCase(),
  };
}

function applyFilters(list, f) {
  return list.filter(t => {
    if (f.abogado     && t.abogado !== f.abogado) return false;
    if (f.modulo      && t.modulo !== f.modulo) return false;
    if (f.responsable && t.proximaAccion?.responsable !== f.responsable) return false;
    if (f.etapa       && computeEtapa(t) !== f.etapa) return false;
    if (f.search      && !t.numero.toString().toLowerCase().includes(f.search)) return false;
    return true;
  });
}

function renderList(container, emptyEl, list) {
  container.innerHTML = '';
  if (list.length === 0) { emptyEl.classList.add('visible'); return; }
  emptyEl.classList.remove('visible');
  list.forEach(t => container.appendChild(buildCard(t)));
}

function renderAll() {
  const f       = getFilters();
  const actives = STATE.tramites.filter(t => !t.terminado);
  const sorted  = sortActives(actives);
  renderList(document.getElementById('tramiteList'), document.getElementById('emptyAll'), applyFilters(sorted, f));

  const t = today();
  const hoyVencidos = applyFilters(sorted.filter(tr => tr.proximaAccion?.fecha && tr.proximaAccion.fecha <= t), f);
  renderList(document.getElementById('todayList'), document.getElementById('emptyToday'), hoyVencidos);

  const badge = document.getElementById('todayBadge');
  badge.textContent = hoyVencidos.length;
  badge.classList.toggle('hidden', hoyVencidos.length === 0);

  renderList(document.getElementById('finishedList'), document.getElementById('emptyFinished'), STATE.tramites.filter(t => t.terminado));
  setColumns(STATE.config.columns);
}

// ============================================================
// MODAL TRAMITE
// ============================================================
function openModal(tramite = null) {
  isEditing = !!tramite;
  editingId = tramite ? tramite.id : null;
  document.getElementById('modalTitle').textContent   = isEditing ? 'Editar trámite' : 'Nuevo trámite';
  document.getElementById('fNumero').value            = tramite?.numero || '';
  document.getElementById('fDescripcion').value       = tramite?.descripcion || '';
  document.getElementById('fModulo').value            = tramite?.modulo || STATE.config.modulos[0]?.sigla || '';
  document.getElementById('fAbogado').value           = tramite?.abogado || 'abogado1';
  document.getElementById('fFechaVencimiento').value  = tramite?.fechaVencimiento || '';
  document.getElementById('fAccionDesc').value        = tramite?.proximaAccion?.descripcion || '';
  document.getElementById('fAccionFecha').value       = tramite?.proximaAccion?.fecha || '';
  syncResponsableSelect(document.getElementById('fAbogado').value, tramite?.proximaAccion?.responsable || null);
  document.getElementById('modalOverlay').classList.add('open');
}

function syncResponsableSelect(abogadoKey, currentValue) {
  const sel = document.getElementById('fAccionResp');
  sel.innerHTML = '';
  const optA = document.createElement('option');
  optA.value = abogadoKey; optA.textContent = abogadoName(abogadoKey);
  sel.appendChild(optA);
  const optAux = document.createElement('option');
  optAux.value = 'auxiliar'; optAux.textContent = 'Auxiliar';
  sel.appendChild(optAux);
  if (currentValue && (currentValue === abogadoKey || currentValue === 'auxiliar')) sel.value = currentValue;
  else sel.value = abogadoKey;
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  const m = document.getElementById('tramiteModal');
  m.classList.remove('draggable-active','is-dragging');
  m.style.left = ''; m.style.top = '';
}

function saveTramite() {
  const numero  = document.getElementById('fNumero').value.trim();
  const desc    = document.getElementById('fDescripcion').value.trim();
  const modulo  = document.getElementById('fModulo').value;
  const abogado = document.getElementById('fAbogado').value;
  const venc    = document.getElementById('fFechaVencimiento').value;
  const acDesc  = document.getElementById('fAccionDesc').value.trim();
  const acFecha = document.getElementById('fAccionFecha').value;
  const acResp  = document.getElementById('fAccionResp').value;

  if (!numero || !desc || !modulo || !venc) {
    showToast('Completa: número, descripción, módulo y fecha de vencimiento.'); return;
  }

  const proximaAccion = (acDesc||acFecha)
    ? { descripcion: acDesc, fecha: acFecha, responsable: acResp }
    : null;

  if (isEditing) {
    const t = getById(editingId);
    if (t) Object.assign(t, { numero, descripcion: desc, modulo, abogado, fechaVencimiento: venc, proximaAccion });
    showToast('Trámite actualizado.');
  } else {
    const newT = {
      id: genId(), numero, descripcion: desc, modulo, abogado, fechaVencimiento: venc,
      gestion: { analisis: false, cumplimiento: false }, seguimiento: [], notas: [],
      proximaAccion, terminado: false, terminadoEn: null, creadoEn: new Date().toISOString(),
    };
    STATE.tramites.push(newT); STATE.order.push(newT.id);
    showToast('Trámite creado.');
  }
  saveAll(); renderAll(); closeModal();
}

// ============================================================
// CONFIGURACIÓN
// ============================================================
function renderConfig() {
  // Nombres/colores abogados
  const n1 = document.getElementById('nameAbogado1'); if (n1) n1.value = STATE.config.abogado1;
  const n2 = document.getElementById('nameAbogado2'); if (n2) n2.value = STATE.config.abogado2;
  const c1 = document.getElementById('colorAbogado1'); if (c1) { c1.value = STATE.config.colorAbogado1||'#15803d'; updateColorPreview(1); }
  const c2 = document.getElementById('colorAbogado2'); if (c2) { c2.value = STATE.config.colorAbogado2||'#1d4ed8'; updateColorPreview(2); }

  // Colores barra
  const cb1 = document.getElementById('colorBar1'); if (cb1) cb1.value = STATE.config.colorBar1||'#f59e0b';
  const cb2 = document.getElementById('colorBar2'); if (cb2) cb2.value = STATE.config.colorBar2||'#3b5bdb';
  const cb3 = document.getElementById('colorBar3'); if (cb3) cb3.value = STATE.config.colorBar3||'#10b981';
  updateBarPreviews();

  // Modo detalle
  setDetailMode(STATE.config.detailMode || 'expand');

  // Módulos
  renderModulosList();

  // Temas
  renderThemeGrid();
}

function renderThemeGrid() {
  const grid = document.getElementById('themeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  THEMES.forEach(theme => {
    const card = document.createElement('div');
    card.className = 'theme-card' + (STATE.config.theme === theme.id ? ' active' : '');
    card.dataset.theme = theme.id;
    const swatchHtml = theme.swatches.map(c => `<div class="theme-swatch-part" style="background:${c}"></div>`).join('');
    card.innerHTML = `<div class="theme-swatch">${swatchHtml}</div><div class="theme-name">${theme.nombre}</div>`;
    card.addEventListener('click', () => {
      applyTheme(theme.id);
      saveAll();
      renderThemeGrid(); // re-render to update active state
    });
    grid.appendChild(card);
  });
}

function updateColorPreview(n) {
  const picker  = document.getElementById(`colorAbogado${n}`);
  const preview = document.getElementById(`preview${n}`);
  if (picker && preview) preview.style.background = picker.value;
}

function updateBarPreviews() {
  [1,2,3].forEach(n => {
    const p = document.getElementById(`colorBar${n}`);
    const prev = document.getElementById(`barPreview${n}`);
    if (p && prev) prev.style.background = p.value;
  });
}

function renderModulosList() {
  const list = document.getElementById('modulosList');
  if (!list) return;
  list.innerHTML = '';
  STATE.config.modulos.forEach((m, i) => {
    const row = document.createElement('div');
    row.className = 'modulo-row';
    row.innerHTML = `<span class="modulo-sigla">${m.sigla}</span><span class="modulo-nombre">${m.nombre}</span><button class="modulo-delete">✕</button>`;
    row.querySelector('.modulo-delete').addEventListener('click', () => {
      if (confirm(`¿Eliminar módulo ${m.sigla}?`)) {
        STATE.config.modulos.splice(i,1); saveAll(); populateModuloSelects(); renderModulosList();
      }
    });
    list.appendChild(row);
  });
}

// ============================================================
// EXPORT / IMPORT
// ============================================================
function exportData() {
  const blob = new Blob([JSON.stringify({ tramites: STATE.tramites, order: STATE.order, config: STATE.config }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `lexgestion_${today()}.json`; a.click();
  URL.revokeObjectURL(url); showToast('Datos exportados.');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.tramites) STATE.tramites = data.tramites;
      if (data.order) STATE.order = data.order;
      if (data.config) STATE.config = Object.assign({...DEFAULT_CONFIG, modulos:[...DEFAULT_CONFIG.modulos]}, data.config);
      saveAll(); applyCssColors(); applyTheme(STATE.config.theme||'claro');
      populateModuloSelects(); updateAbogadoNames();
      setColumns(STATE.config.columns||1);
      const ds = document.getElementById('sortSelect'); if(ds) ds.value = STATE.config.sortBy||'vencimiento';
      const ms = document.getElementById('sortSelectMob'); if(ms) ms.value = STATE.config.sortBy||'vencimiento';
      renderAll(); showToast('Datos importados.');
    } catch { showToast('Error al importar. Verifica el archivo JSON.'); }
  };
  reader.readAsText(file);
}

// ============================================================
// SIDEBAR
// ============================================================
function isMobile() { return window.innerWidth <= 768; }

const backdropEl = document.createElement('div');
backdropEl.className = 'sidebar-backdrop';
document.body.appendChild(backdropEl);

function openSidebar() {
  if (isMobile()) { document.getElementById('sidebar').classList.add('open'); backdropEl.classList.add('show'); }
  else { document.getElementById('sidebar').classList.remove('collapsed'); document.querySelector('.app-layout').classList.remove('expanded'); }
}
function closeSidebar() {
  if (isMobile()) { document.getElementById('sidebar').classList.remove('open'); backdropEl.classList.remove('show'); }
  else { document.getElementById('sidebar').classList.add('collapsed'); document.querySelector('.app-layout').classList.add('expanded'); }
}
function toggleSidebar() {
  if (isMobile()) document.getElementById('sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
  else document.getElementById('sidebar').classList.contains('collapsed') ? openSidebar() : closeSidebar();
}

function setupContainerDrop(container) {
  container.addEventListener('dragover', e => e.preventDefault());
  container.addEventListener('drop', e => {
    e.preventDefault();
    if (e.target === container && dragSrcId) {
      const order = getActiveOrder();
      const si = order.indexOf(dragSrcId);
      if (si !== -1) { order.splice(si,1); order.push(dragSrcId); STATE.order = order; saveAll(); renderAll(); }
    }
  });
}

// ============================================================
// BOTTOM SHEET MÓVIL
// ============================================================
function openMobSheet() {
  document.getElementById('mobSheet').classList.add('open');
  document.getElementById('mobSheetOverlay').classList.add('show');
}
function closeMobSheet() {
  document.getElementById('mobSheet').classList.remove('open');
  document.getElementById('mobSheetOverlay').classList.remove('show');
}

// ============================================================
// MODAL DRAGGABLE
// ============================================================
function initDraggableModal(modalEl) {
  const header = modalEl.querySelector('.modal-header');
  if (!header) return;
  let dragging = false, startX, startY, origLeft, origTop;

  header.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    if (isMobile()) return; // no drag en móvil
    dragging = true;
    if (!modalEl.classList.contains('draggable-active')) {
      const rect = modalEl.getBoundingClientRect();
      modalEl.style.left = rect.left + 'px';
      modalEl.style.top  = rect.top  + 'px';
      modalEl.classList.add('draggable-active');
    }
    origLeft = parseFloat(modalEl.style.left)||0;
    origTop  = parseFloat(modalEl.style.top) ||0;
    startX = e.clientX; startY = e.clientY;
    header.classList.add('is-dragging');
    modalEl.classList.add('is-dragging');
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const margin = 8;
    let newLeft = origLeft + (e.clientX - startX);
    let newTop  = origTop  + (e.clientY - startY);
    newLeft = Math.max(margin, Math.min(newLeft, window.innerWidth  - modalEl.offsetWidth  - margin));
    newTop  = Math.max(margin, Math.min(newTop,  window.innerHeight - modalEl.offsetHeight - margin));
    modalEl.style.left = newLeft + 'px';
    modalEl.style.top  = newTop  + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    header.classList.remove('is-dragging');
    modalEl.classList.remove('is-dragging');
  });
}

// ============================================================
// VISTAS
// ============================================================
let currentView = 'all';
function switchView(view) {
  currentView = view;
  closeAllExpands();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  const titles = { all: 'Todos los trámites', today: 'Hoy / Vencidos', finished: 'Terminados', config: 'Configuración' };
  document.getElementById('topbarTitle').textContent = titles[view] || '';
  const isConfig = view === 'config';
  document.getElementById('sidebarFilters').style.display = isConfig ? 'none' : '';
  document.getElementById('colSwitcher').style.display    = isConfig ? 'none' : '';
  document.getElementById('sortWrap').style.display       = isConfig ? 'none' : '';
  document.getElementById('mobOptsBtn').style.display     = isConfig ? 'none' : '';
  if (isConfig) renderConfig();
}

// ============================================================
// ESCAPE HELPERS
// ============================================================
function escapeHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }
function escapeAttr(str) { return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function formatDatetime(iso) { return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }); }

// ============================================================
// INIT
// ============================================================
function init() {
  loadAll();
  purgeExpiredFinished();
  applyCssColors();
  applyTheme(STATE.config.theme || 'claro');
  populateModuloSelects();
  updateAbogadoNames();
  setColumns(STATE.config.columns || 1);
  setDetailMode(STATE.config.detailMode || 'expand');

  // Sync sort selects
  const sortVal = STATE.config.sortBy || 'vencimiento';
  const ds = document.getElementById('sortSelect'); if(ds) ds.value = sortVal;
  const ms = document.getElementById('sortSelectMob'); if(ms) ms.value = sortVal;

  if (isMobile()) closeSidebar();
  renderAll();
  setupContainerDrop(document.getElementById('tramiteList'));

  // Navegación
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => { switchView(btn.dataset.view); if (isMobile()) closeSidebar(); });
  });

  // Sidebar
  document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarToggle').addEventListener('click', closeSidebar);
  backdropEl.addEventListener('click', closeSidebar);

  // Nuevo trámite
  document.getElementById('newTramiteBtn').addEventListener('click', () => openModal());

  // Abogado → sync responsable
  document.getElementById('fAbogado').addEventListener('change', e => syncResponsableSelect(e.target.value, null));

  // Columnas desktop
  document.querySelectorAll('.col-btn').forEach(btn => {
    btn.addEventListener('click', () => setColumns(parseInt(btn.dataset.cols)));
  });

  // Ordenar desktop
  document.getElementById('sortSelect').addEventListener('change', e => setSortBy(e.target.value));

  // Bottom sheet móvil
  document.getElementById('mobOptsBtn').addEventListener('click', openMobSheet);
  document.getElementById('mobSheetOverlay').addEventListener('click', closeMobSheet);
  document.getElementById('sortSelectMob').addEventListener('change', e => { setSortBy(e.target.value); closeMobSheet(); });
  document.querySelectorAll('.mob-col-btn').forEach(btn => {
    btn.addEventListener('click', () => { setColumns(parseInt(btn.dataset.cols)); closeMobSheet(); });
  });

  // Modal tramite — sin cerrar al click fuera
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('saveTramite').addEventListener('click', saveTramite);

  // Modal draggable
  initDraggableModal(document.getElementById('tramiteModal'));

  // Modal detalle
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === document.getElementById('detailOverlay')) closeDetail(); });
  document.getElementById('editDetailBtn').addEventListener('click', () => { const t = getById(currentDetailId); closeDetail(); openModal(t); });
  document.getElementById('deleteDetailBtn').addEventListener('click', () => {
    if (confirm('¿Eliminar este trámite?')) {
      STATE.tramites = STATE.tramites.filter(t => t.id !== currentDetailId);
      STATE.order    = STATE.order.filter(id => id !== currentDetailId);
      saveAll(); renderAll(); closeDetail(); showToast('Trámite eliminado.');
    }
  });
  document.getElementById('finishDetailBtn').addEventListener('click', () => {
    const t = getById(currentDetailId); if (!t) return;
    if (t.terminado) { t.terminado = false; t.terminadoEn = null; showToast('Trámite reactivado.'); }
    else { if (!confirm('¿Marcar como terminado?')) return; t.terminado = true; t.terminadoEn = new Date().toISOString(); showToast('Trámite terminado.'); }
    saveAll(); renderAll(); closeDetail();
  });

  // Filtros
  ['filterAbogado','filterModulo','filterResponsable','filterEtapa'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderAll);
  });
  document.getElementById('searchInput').addEventListener('input', renderAll);
  document.getElementById('clearFilters').addEventListener('click', () => {
    ['filterAbogado','filterModulo','filterResponsable','filterEtapa'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('searchInput').value = '';
    renderAll();
  });

  // Export/Import
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => { if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; } });

  // Config: modo detalle
  document.getElementById('modeExpand').addEventListener('click', () => setDetailMode('expand'));
  document.getElementById('modeModal').addEventListener('click', () => setDetailMode('modal'));

  // Config: colores abogados
  document.getElementById('colorAbogado1').addEventListener('input', () => updateColorPreview(1));
  document.getElementById('colorAbogado2').addEventListener('input', () => updateColorPreview(2));
  document.getElementById('saveNamesBtn').addEventListener('click', () => {
    const n1 = document.getElementById('nameAbogado1').value.trim();
    const n2 = document.getElementById('nameAbogado2').value.trim();
    if (!n1 || !n2) { showToast('Los nombres no pueden estar vacíos.'); return; }
    STATE.config.abogado1 = n1; STATE.config.abogado2 = n2;
    STATE.config.colorAbogado1 = document.getElementById('colorAbogado1').value;
    STATE.config.colorAbogado2 = document.getElementById('colorAbogado2').value;
    saveAll(); applyCssColors(); updateAbogadoNames(); renderAll();
    showToast('Configuración guardada.');
  });

  // Config: colores barra
  document.getElementById('colorBar1').addEventListener('input', updateBarPreviews);
  document.getElementById('colorBar2').addEventListener('input', updateBarPreviews);
  document.getElementById('colorBar3').addEventListener('input', updateBarPreviews);
  document.getElementById('saveBarColorsBtn').addEventListener('click', () => {
    STATE.config.colorBar1 = document.getElementById('colorBar1').value;
    STATE.config.colorBar2 = document.getElementById('colorBar2').value;
    STATE.config.colorBar3 = document.getElementById('colorBar3').value;
    saveAll(); applyCssColors(); showToast('Colores guardados.');
  });
  document.getElementById('resetBarColorsBtn').addEventListener('click', () => {
    STATE.config.colorBar1 = DEFAULT_CONFIG.colorBar1;
    STATE.config.colorBar2 = DEFAULT_CONFIG.colorBar2;
    STATE.config.colorBar3 = DEFAULT_CONFIG.colorBar3;
    saveAll(); applyCssColors(); renderConfig(); showToast('Colores restablecidos.');
  });

  // Config: módulos
  document.getElementById('addModuloBtn').addEventListener('click', () => {
    const sigla  = document.getElementById('newModuloSigla').value.trim().toUpperCase();
    const nombre = document.getElementById('newModuloNombre').value.trim();
    if (!sigla || !nombre) { showToast('Completa sigla y nombre.'); return; }
    if (STATE.config.modulos.find(m => m.sigla === sigla)) { showToast('Ya existe ese módulo.'); return; }
    STATE.config.modulos.push({ sigla, nombre });
    document.getElementById('newModuloSigla').value = '';
    document.getElementById('newModuloNombre').value = '';
    saveAll(); populateModuloSelects(); renderModulosList();
    showToast('Módulo agregado.');
  });

  // Config: borrar todo
  document.getElementById('clearAllBtn').addEventListener('click', () => {
    if (confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')) {
      if (confirm('¿Estás seguro? Se perderán todos los trámites.')) {
        [KEYS.tramites, KEYS.order, KEYS.config].forEach(k => localStorage.removeItem(k));
        STATE.tramites = []; STATE.order = [];
        STATE.config = { ...DEFAULT_CONFIG, modulos: [...DEFAULT_CONFIG.modulos] };
        applyCssColors(); applyTheme('claro');
        populateModuloSelects(); updateAbogadoNames();
        const ds2 = document.getElementById('sortSelect'); if(ds2) ds2.value='vencimiento';
        const ms2 = document.getElementById('sortSelectMob'); if(ms2) ms2.value='vencimiento';
        renderConfig(); renderAll(); showToast('Datos borrados.');
      }
    }
  });

  // Teclado
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('detailOverlay').classList.contains('open')) closeDetail();
      else if (document.getElementById('modalOverlay').classList.contains('open')) closeModal();
      else if (document.getElementById('mobSheet').classList.contains('open')) closeMobSheet();
      else closeAllExpands();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

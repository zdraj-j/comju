/**
 * JuriTask — Script Principal v5
 * Cambios v5:
 *  1. Nombre cambiado de LexGestión a JuriTask
 *  2. Trámites propios (sin abogado, solo check terminar)
 *  3. Próxima acción fusionada con seguimiento (responsable en cada tarea)
 *  4. Nueva tarea oculta en modal y en tarjetas (botón la muestra)
 *  5. Check "terminar" en tarjeta (tercer check, color verde)
 *  6. Fecha de vencimiento oculta en tarjetas con cumplimiento marcado
 *  7. Hoy/Vencidos: considera fechas de seguimiento y vencimiento
 */

// ============================================================
// TEMAS
// ============================================================
const THEMES = [
  { id: 'claro',    nombre: 'Claro',    swatches: ['#f4f5f7','#ffffff','#3b5bdb','#1a1d23'] },
  { id: 'oscuro',   nombre: 'Oscuro',   swatches: ['#0f1117','#1a1d27','#6e8efb','#e8eaf0'] },
  { id: 'sepia',    nombre: 'Sepia',    swatches: ['#f5f0e8','#fdf8f0','#8b6c2e','#2c2416'] },
  { id: 'pizarra',  nombre: 'Pizarra',  swatches: ['#1e2533','#26304a','#58a6f0','#d4daf0'] },
];

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  STATE.config.theme = id;
  document.querySelectorAll('.theme-card').forEach(c => c.classList.toggle('active', c.dataset.theme === id));
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
  tramites: 'juritask_tramites',
  order:    'juritask_order',
  config:   'juritask_config',
};

function saveAll() {
  localStorage.setItem(KEYS.tramites, JSON.stringify(STATE.tramites));
  localStorage.setItem(KEYS.order,    JSON.stringify(STATE.order));
  localStorage.setItem(KEYS.config,   JSON.stringify(STATE.config));
}

function loadAll() {
  // Migración desde claves antiguas de LexGestión
  const OLD = { tramites:'lexgestion_tramites', order:'lexgestion_order', config:'lexgestion_config' };
  try {
    const t = localStorage.getItem(KEYS.tramites) || localStorage.getItem(OLD.tramites);
    if (t) STATE.tramites = JSON.parse(t);
    const o = localStorage.getItem(KEYS.order) || localStorage.getItem(OLD.order);
    if (o) STATE.order = JSON.parse(o);
    const c = localStorage.getItem(KEYS.config) || localStorage.getItem(OLD.config);
    if (c) STATE.config = Object.assign({ ...DEFAULT_CONFIG, modulos: [...DEFAULT_CONFIG.modulos] }, JSON.parse(c));
    // Migración: proximaAccion → primera tarea de seguimiento si no existe
    STATE.tramites.forEach(t => {
      if (!t.tipo) t.tipo = 'abogado'; // retrocompatibilidad
      if (!t.seguimiento) t.seguimiento = [];
      if (!t.notas) t.notas = [];
      if (!t.gestion) t.gestion = { analisis: false, cumplimiento: false };
      // Si tenía proximaAccion y no tiene tareas de seguimiento equivalente, migrarla
      if (t.proximaAccion && t.proximaAccion.descripcion) {
        const yaExiste = t.seguimiento.some(s => s.descripcion === t.proximaAccion.descripcion && s.fecha === t.proximaAccion.fecha);
        if (!yaExiste) {
          t.seguimiento.unshift({
            descripcion: t.proximaAccion.descripcion,
            fecha: t.proximaAccion.fecha || '',
            responsable: t.proximaAccion.responsable || (t.abogado || 'propio'),
            estado: 'pendiente',
          });
        }
        delete t.proximaAccion;
      }
    });
  } catch (e) { console.error('Error cargando datos:', e); }
}

// ============================================================
// HELPERS
// ============================================================
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

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
  // Con cumplimiento marcado, no mostrar alerta
  if (tramite && tramite.gestion && tramite.gestion.cumplimiento) return 'upcoming';
  const t = today();
  if (s < t) return 'overdue';
  if (s === t) return 'today';
  const diff = Math.ceil((new Date(s) - new Date(t)) / 86400000);
  if (diff <= 7) return 'soon';
  return 'upcoming';
}

/** Fecha de la tarea pendiente más urgente del trámite */
function proximaFechaSeguimiento(t) {
  const pendientes = (t.seguimiento || []).filter(s => s.estado === 'pendiente' && s.fecha);
  if (!pendientes.length) return null;
  return pendientes.map(s => s.fecha).sort()[0];
}

function abogadoName(key) {
  if (key === 'abogado1') return STATE.config.abogado1;
  if (key === 'abogado2') return STATE.config.abogado2;
  if (key === 'propio')   return 'Propio';
  return 'Auxiliar';
}

function abogadoColor(key) {
  if (key === 'abogado1') return STATE.config.colorAbogado1 || '#15803d';
  if (key === 'abogado2') return STATE.config.colorAbogado2 || '#1d4ed8';
  if (key === 'propio')   return '#9333ea';
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

function esPropio(t) { return t.tipo === 'propio'; }

/** ¿Aparece este trámite en la vista Hoy/Vencidos? */
function esHoyOVencido(t) {
  const hoy = today();
  // Vencimiento hoy o pasado (si cumplimiento no marcado)
  if (t.fechaVencimiento && !(t.gestion && t.gestion.cumplimiento)) {
    if (t.fechaVencimiento <= hoy) return true;
  }
  // Alguna tarea pendiente de seguimiento hoy o pasada
  const pf = proximaFechaSeguimiento(t);
  if (pf && pf <= hoy) return true;
  return false;
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

/** Opciones de responsable para formularios de tarea según tipo de trámite */
function buildRespOptions(tipoTramite, abogadoKey, selectedValue) {
  const opts = [];
  if (tipoTramite === 'abogado') {
    opts.push({ value: abogadoKey, label: abogadoName(abogadoKey) });
    opts.push({ value: 'auxiliar', label: 'Auxiliar' });
  } else {
    opts.push({ value: 'propio', label: 'Propio' });
    opts.push({ value: 'auxiliar', label: 'Auxiliar' });
  }
  return opts.map(o =>
    `<option value="${o.value}" ${o.value === selectedValue ? 'selected' : ''}>${o.label}</option>`
  ).join('');
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
  document.querySelectorAll('.col-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.cols) === n));
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
  const ds = document.getElementById('sortSelect'); if(ds) ds.value = val;
  const ms = document.getElementById('sortSelectMob'); if(ms) ms.value = val;
  saveAll(); renderAll();
}

function sortActives(list) {
  const manualOrder = getActiveOrder();
  const sortBy = STATE.config.sortBy || 'vencimiento';
  const FAR = '9999-99-99';
  return [...list].sort((a, b) => {
    let cmp = 0;
    const pfa = proximaFechaSeguimiento(a) || FAR;
    const pfb = proximaFechaSeguimiento(b) || FAR;
    if (sortBy === 'vencimiento') {
      cmp = (a.fechaVencimiento||FAR).localeCompare(b.fechaVencimiento||FAR);
    } else if (sortBy === 'seguimiento') {
      cmp = pfa.localeCompare(pfb);
    } else if (sortBy === 'mixto') {
      const ma = [a.fechaVencimiento, pfa].filter(x=>x!==FAR).sort()[0] || FAR;
      const mb = [b.fechaVencimiento, pfb].filter(x=>x!==FAR).sort()[0] || FAR;
      cmp = ma.localeCompare(mb);
    } else if (sortBy === 'abogado') {
      cmp = abogadoName(a.abogado||'propio').localeCompare(abogadoName(b.abogado||'propio'));
    } else if (sortBy === 'numero') {
      cmp = (parseInt(a.numero)||0) - (parseInt(b.numero)||0);
    }
    if (cmp !== 0) return cmp;
    return manualOrder.indexOf(a.id) - manualOrder.indexOf(b.id);
  });
}

// ============================================================
// CONTENIDO DE DETALLE
// ============================================================
function buildDetailContent(t) {
  const esP = esPropio(t);
  const etapa = computeEtapa(t);
  const etapaLabel = etapa === 'seguimiento' ? 'Seguimiento' : 'Gestión';
  const etapaCls   = etapa === 'seguimiento' ? 'seguimiento' : '';
  const p = `det_${t.id}`;
  const vcls = vencClass(t.fechaVencimiento, t);
  const showVenc = t.fechaVencimiento && !(t.gestion && t.gestion.cumplimiento);

  // Sección gestión (solo trámites de abogado)
  const gestionHtml = esP ? '' : `
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
    </div>`;

  // Vencimiento
  const vencHtml = showVenc ? `
    <div class="detail-section">
      <h3>Fecha de vencimiento</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="${p}_vencimiento" value="${t.fechaVencimiento||''}" />
        </div>
      </div>
      <button class="btn-small" id="${p}_saveVenc" style="margin-top:10px">Guardar fecha</button>
    </div>` : `
    <div class="detail-section">
      <h3>Fecha de vencimiento</h3>
      <div class="form-grid">
        <div class="form-group">
          <label>Fecha</label>
          <input type="date" id="${p}_vencimiento" value="${t.fechaVencimiento||''}" />
        </div>
      </div>
      <button class="btn-small" id="${p}_saveVenc" style="margin-top:10px">Guardar fecha</button>
    </div>`;

  return `
    ${gestionHtml}
    <div class="detail-section">
      <h3>Seguimiento <span class="etapa-badge ${etapaCls}" id="${p}_etapabadge">${etapaLabel}</span></h3>
      <div id="${p}_actividades"></div>
      <div class="nueva-tarea-toggle">
        <button class="btn-nueva-tarea" id="${p}_btnNuevaTarea" type="button">＋ Nueva tarea</button>
      </div>
      <div class="add-actividad-form" id="${p}_formNuevaTarea" style="display:none">
        <input type="text" id="${p}_newActDesc" placeholder="¿Qué se debe hacer?" />
        <div class="add-actividad-form-row">
          <input type="date" id="${p}_newActFecha" />
          <select id="${p}_newActResp">${buildRespOptions(t.tipo || 'abogado', t.abogado || 'abogado1', t.abogado || 'propio')}</select>
        </div>
        <div class="add-actividad-btns">
          <button class="btn-small" id="${p}_addAct">+ Agregar</button>
          <button class="btn-small" id="${p}_cancelAct" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">Cancelar</button>
        </div>
      </div>
    </div>
    ${vencHtml}
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
  const esP = esPropio(t);

  if (!esP) {
    container.querySelector(`#${p}_analisis`).addEventListener('change', e => {
      t.gestion.analisis = e.target.checked; saveAll(); renderAll();
    });
    container.querySelector(`#${p}_cumplimiento`).addEventListener('change', e => {
      t.gestion.cumplimiento = e.target.checked;
      const badge = container.querySelector(`#${p}_etapabadge`);
      const etapa = computeEtapa(t);
      if (badge) { badge.textContent = etapa==='seguimiento'?'Seguimiento':'Gestión'; badge.className='etapa-badge'+(etapa==='seguimiento'?' seguimiento':''); }
      saveAll(); renderAll();
    });
  }

  // Seguimiento
  renderActividadesIn(t, container.querySelector(`#${p}_actividades`));

  const btnNueva = container.querySelector(`#${p}_btnNuevaTarea`);
  const formNueva = container.querySelector(`#${p}_formNuevaTarea`);
  btnNueva.addEventListener('click', () => {
    const open = formNueva.style.display !== 'none';
    formNueva.style.display = open ? 'none' : 'block';
  });
  container.querySelector(`#${p}_cancelAct`).addEventListener('click', () => { formNueva.style.display = 'none'; });
  container.querySelector(`#${p}_addAct`).addEventListener('click', () => {
    const desc  = container.querySelector(`#${p}_newActDesc`).value.trim();
    const fecha = container.querySelector(`#${p}_newActFecha`).value;
    const resp  = container.querySelector(`#${p}_newActResp`).value;
    if (!desc) { showToast('Escribe una descripción.'); return; }
    t.seguimiento.push({ descripcion: desc, fecha, responsable: resp, estado: 'pendiente' });
    container.querySelector(`#${p}_newActDesc`).value = '';
    container.querySelector(`#${p}_newActFecha`).value = '';
    formNueva.style.display = 'none';
    saveAll(); renderAll(); renderActividadesIn(t, container.querySelector(`#${p}_actividades`));
    showToast('Tarea agregada.');
  });

  // Vencimiento
  container.querySelector(`#${p}_saveVenc`).addEventListener('click', () => {
    const fecha = container.querySelector(`#${p}_vencimiento`).value;
    if (!fecha) { showToast('Selecciona una fecha.'); return; }
    t.fechaVencimiento = fecha; saveAll(); renderAll();
    showToast('Fecha de vencimiento actualizada.');
  });

  // Notas
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
    const dcls = dateClass(act.fecha);
    div.innerHTML = `
      <div class="actividad-check-wrap">
        <label class="round-check-wrap">
          <input type="checkbox" ${isDone ? 'checked' : ''} />
          <div class="round-check-box"></div>
        </label>
      </div>
      <div class="actividad-info">
        <div class="actividad-desc ${isDone ? 'done' : ''}">${escapeHtml(act.descripcion)}</div>
        <div class="actividad-meta">
          <input type="date" value="${act.fecha||''}" />
          ${act.responsable ? `<span class="actividad-resp">${abogadoName(act.responsable)}</span>` : ''}
          <span class="actividad-estado ${act.estado}">${isDone ? 'Realizado' : 'Pendiente'}</span>
        </div>
      </div>
      <button class="actividad-delete" title="Eliminar">✕</button>`;
    div.querySelector('input[type="checkbox"]').addEventListener('change', e => {
      t.seguimiento[i].estado = e.target.checked ? 'realizado' : 'pendiente';
      saveAll(); renderAll(); renderActividadesIn(t, listEl);
    });
    div.querySelector('input[type="date"]').addEventListener('change', e => {
      t.seguimiento[i].fecha = e.target.value; saveAll(); renderAll();
    });
    div.querySelector('.actividad-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta tarea?')) { t.seguimiento.splice(i,1); saveAll(); renderAll(); renderActividadesIn(t,listEl); }
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
      <button class="nota-delete">✕</button>`;
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
  const esP = esPropio(t);
  document.getElementById('detailSubtitle').textContent =
    `${t.descripcion} · ${esP ? 'Propio' : abogadoName(t.abogado)} · ${t.modulo}` +
    (t.fechaVencimiento ? ` · Vence: ${formatDate(t.fechaVencimiento)}` : '');
  const body = document.getElementById('detailModalBody');
  body.innerHTML = buildDetailContent(t);
  bindDetailContent(t, body);
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
      <button class="btn-icon modal-close" title="Cerrar" data-action="close">✕</button>`;

    actBar.querySelector('[data-action="edit"]').addEventListener('click', () => { closeAllExpands(); openModal(t); });
    actBar.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (confirm('¿Eliminar este trámite?')) {
        STATE.tramites = STATE.tramites.filter(x => x.id !== t.id);
        STATE.order = STATE.order.filter(id => id !== t.id);
        saveAll(); closeAllExpands(); renderAll(); showToast('Trámite eliminado.');
      }
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
  const esP = esPropio(t);
  card.className = 'tramite-card' + (t.terminado ? ' finished-card' : '') + (esP ? ' propio-card' : '');
  card.dataset.id = t.id;
  card.draggable = !t.terminado;

  const seg1 = (!esP && t.gestion?.analisis)    ? 'active-1' : '';
  const seg2 = (!esP && t.gestion?.cumplimiento) ? 'active-2' : '';
  const seg3 = t.terminado                        ? 'active-3' : '';

  const etapa = computeEtapa(t);

  // Vencimiento: ocultar si cumplimiento marcado
  const showVenc = t.fechaVencimiento && !(t.gestion && t.gestion.cumplimiento);
  const vcls = showVenc ? vencClass(t.fechaVencimiento, t) : '';
  let vencHtml = '';
  if (showVenc) {
    const lbl = vcls==='overdue' ? '⚠ Vencido' : vcls==='today' ? '⚠ Hoy' : vcls==='soon' ? '⏰ Pronto' : '📅 Vence';
    vencHtml = `<span class="venc-fecha ${vcls}">${lbl}: ${formatDate(t.fechaVencimiento)}</span>`;
  }

  // Tag abogado/propio
  let responsableTag;
  if (esP) {
    responsableTag = `<span class="tag tag-propio">👤 Propio</span>`;
  } else {
    const abColor = abogadoColor(t.abogado);
    const abBg = hexToRgba(abColor, 0.12);
    responsableTag = `<span class="tag tag-abogado" style="background:${abBg};color:${abColor}">${abogadoName(t.abogado)}</span>`;
  }

  // Etapa tag
  const etapaTag = t.terminado
    ? `<span class="tag tag-terminado">Terminado</span>`
    : esP ? '' // los propios no muestran etapa
    : etapa === 'seguimiento'
      ? `<span class="tag tag-etapa-seguimiento">Seguimiento</span>`
      : `<span class="tag tag-etapa-gestion">Gestión</span>`;

  // Seguimiento: solo tareas PENDIENTES visibles en la tarjeta
  const tareasPendientes = (t.seguimiento || []).filter(s => s.estado === 'pendiente');
  const seguimientoHtml = tareasPendientes.length
    ? `<div class="card-seguimiento">
        ${tareasPendientes.slice(0,2).map(s => {
          const dc = dateClass(s.fecha);
          const fechaTag = s.fecha ? `<span class="seg-fecha ${dc}">${formatDate(s.fecha)}</span>` : '';
          const respTag  = s.responsable ? `<span style="color:var(--text-muted);font-size:10px">· ${abogadoName(s.responsable)}</span>` : '';
          return `<div class="card-seg-item">
            <div class="seg-dot ${dc}"></div>
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.descripcion}</span>
            ${fechaTag}${respTag}
          </div>`;
        }).join('')}
        ${tareasPendientes.length > 2 ? `<div class="card-seg-item" style="color:var(--text-muted);font-size:11px">+${tareasPendientes.length-2} más…</div>` : ''}
      </div>`
    : '';

  // Checks según tipo
  let checksHtml = '';
  if (!t.terminado) {
    if (esP) {
      // Sólo check terminar
      checksHtml = `
        <div class="card-checks" id="checks_${t.id}">
          <label class="round-check-wrap check-terminar" title="Terminar trámite">
            <input type="checkbox" class="card-check-terminar" />
            <div class="round-check-box"></div>
            <span class="check-label-text">Fin</span>
          </label>
        </div>`;
    } else {
      // Análisis, Cumplimiento, Terminar
      checksHtml = `
        <div class="card-checks" id="checks_${t.id}">
          <label class="round-check-wrap" title="Análisis">
            <input type="checkbox" class="card-check-analisis" ${t.gestion?.analisis ? 'checked' : ''} />
            <div class="round-check-box"></div>
            <span class="check-label-text">An.</span>
          </label>
          <label class="round-check-wrap" title="Cumplimiento">
            <input type="checkbox" class="card-check-cumplimiento" ${t.gestion?.cumplimiento ? 'checked' : ''} />
            <div class="round-check-box"></div>
            <span class="check-label-text">Cu.</span>
          </label>
          <label class="round-check-wrap check-terminar" title="Terminar trámite">
            <input type="checkbox" class="card-check-terminar" />
            <div class="round-check-box"></div>
            <span class="check-label-text">Fin</span>
          </label>
        </div>`;
    }
  }

  card.innerHTML = `
    <div class="card-progress-bar">
      <div class="progress-segment ${seg1}"></div>
      <div class="progress-segment ${seg2}"></div>
      <div class="progress-segment ${seg3}"></div>
    </div>
    <div class="card-body">
      ${checksHtml}
      <div class="card-info">
        <div class="card-top-row">
          <span class="card-numero">#${t.numero}</span>
          <span class="tag tag-modulo">${t.modulo}</span>
          ${responsableTag}
          ${etapaTag}
        </div>
        <div class="card-desc">${escapeHtml(t.descripcion || '(sin descripción)')}</div>
        <div class="card-dates">${vencHtml}</div>
        ${seguimientoHtml}
      </div>
    </div>`;

  // Zona nueva tarea en el pie de la tarjeta (siempre visible para activos)
  if (!t.terminado) {
    const tareaRow = document.createElement('div');
    tareaRow.className = 'card-nueva-tarea-row';
    const btnTarea = document.createElement('button');
    btnTarea.className = 'btn-card-tarea';
    btnTarea.textContent = '＋ Nueva tarea';
    tareaRow.appendChild(btnTarea);
    card.appendChild(tareaRow);

    // El formulario de nueva tarea en la tarjeta abre el panel de detalle directamente
    btnTarea.addEventListener('click', e => {
      e.stopPropagation();
      openDetail(t.id);
      // Espera a que se abra el panel y luego muestra el form
      setTimeout(() => {
        const p = `det_${t.id}`;
        const form = document.getElementById(`${p}_formNuevaTarea`);
        if (form) { form.style.display = 'block'; form.querySelector('input')?.focus(); }
      }, 380);
    });
  }

  // Click en card
  card.addEventListener('click', e => {
    if (e.target.closest('.card-checks') || e.target.closest('.card-nueva-tarea-row')) return;
    openDetail(t.id);
  });

  // Checks listeners
  if (!t.terminado) {
    const cc = card.querySelector(`#checks_${t.id}`);
    cc.addEventListener('click', e => e.stopPropagation());

    if (!esP) {
      card.querySelector('.card-check-analisis').addEventListener('change', e => {
        t.gestion.analisis = e.target.checked; saveAll(); renderAll();
      });
      card.querySelector('.card-check-cumplimiento').addEventListener('change', e => {
        t.gestion.cumplimiento = e.target.checked; saveAll(); renderAll();
      });
    }

    // Check terminar
    card.querySelector('.card-check-terminar').addEventListener('change', e => {
      if (!e.target.checked) return;
      e.target.checked = false; // reset visual, confirmamos
      if (!confirm('¿Marcar este trámite como terminado?')) return;
      t.terminado = true; t.terminadoEn = new Date().toISOString();
      saveAll(); renderAll(); showToast('Trámite terminado. ✓');
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
    tipo:        document.getElementById('filterTipo').value,
    abogado:     document.getElementById('filterAbogado').value,
    modulo:      document.getElementById('filterModulo').value,
    responsable: document.getElementById('filterResponsable').value,
    etapa:       document.getElementById('filterEtapa').value,
    search:      document.getElementById('searchInput').value.trim().toLowerCase(),
  };
}

function applyFilters(list, f) {
  return list.filter(t => {
    if (f.tipo       && t.tipo !== f.tipo) return false;
    if (f.abogado    && t.abogado !== f.abogado) return false;
    if (f.modulo     && t.modulo !== f.modulo) return false;
    if (f.responsable) {
      const tieneResp = (t.seguimiento||[]).some(s => s.responsable === f.responsable);
      if (!tieneResp) return false;
    }
    if (f.etapa      && computeEtapa(t) !== f.etapa) return false;
    if (f.search     && !t.numero.toString().toLowerCase().includes(f.search) && !t.descripcion.toLowerCase().includes(f.search)) return false;
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

  // Hoy/Vencidos: tareas de seguimiento vencidas/hoy O fecha de vencimiento vencida/hoy
  const urgentes = applyFilters(sorted.filter(tr => esHoyOVencido(tr)), f);
  renderList(document.getElementById('todayList'), document.getElementById('emptyToday'), urgentes);

  const badge = document.getElementById('todayBadge');
  badge.textContent = urgentes.length;
  badge.classList.toggle('hidden', urgentes.length === 0);

  renderList(document.getElementById('finishedList'), document.getElementById('emptyFinished'), STATE.tramites.filter(t => t.terminado));
  setColumns(STATE.config.columns);
}

// ============================================================
// MODAL TRÁMITE — TIPO TOGGLE
// ============================================================
let modalTipoActual = 'abogado';

function setModalTipo(tipo) {
  modalTipoActual = tipo;
  document.getElementById('tipoBtnAbogado').classList.toggle('active', tipo === 'abogado');
  document.getElementById('tipoBtnPropio').classList.toggle('active', tipo === 'propio');
  document.getElementById('fAbogadoWrap').style.display = tipo === 'abogado' ? '' : 'none';
  // Re-sync responsable select
  syncTareaRespSelect();
}

function syncTareaRespSelect() {
  const sel = document.getElementById('fTareaResp');
  if (!sel) return;
  const abKey = document.getElementById('fAbogado').value || 'abogado1';
  sel.innerHTML = buildRespOptions(modalTipoActual, abKey, null);
}

function openModal(tramite = null) {
  isEditing = !!tramite;
  editingId = tramite ? tramite.id : null;
  document.getElementById('modalTitle').textContent  = isEditing ? 'Editar trámite' : 'Nuevo trámite';
  document.getElementById('fNumero').value           = tramite?.numero || '';
  document.getElementById('fDescripcion').value      = tramite?.descripcion || '';
  document.getElementById('fModulo').value           = tramite?.modulo || STATE.config.modulos[0]?.sigla || '';
  document.getElementById('fAbogado').value          = tramite?.abogado || 'abogado1';
  document.getElementById('fFechaVencimiento').value = tramite?.fechaVencimiento || '';

  // Tipo
  const tipo = tramite?.tipo || 'abogado';
  setModalTipo(tipo);

  // Ocultar form de nueva tarea
  document.getElementById('nuevaTareaFieldsModal').style.display = 'none';
  document.getElementById('fTareaDesc').value  = '';
  document.getElementById('fTareaFecha').value = '';
  syncTareaRespSelect();

  document.getElementById('modalOverlay').classList.add('open');
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
  const tipo    = modalTipoActual;
  const abogado = tipo === 'abogado' ? document.getElementById('fAbogado').value : null;
  const venc    = document.getElementById('fFechaVencimiento').value;

  if (!numero || !desc || !modulo || !venc) {
    showToast('Completa: número, descripción, módulo y fecha de vencimiento.'); return;
  }

  // Tarea inicial opcional
  const tareaDesc  = document.getElementById('fTareaDesc').value.trim();
  const tareaFecha = document.getElementById('fTareaFecha').value;
  const tareaResp  = document.getElementById('fTareaResp').value;
  const tareaInicial = tareaDesc
    ? [{ descripcion: tareaDesc, fecha: tareaFecha, responsable: tareaResp, estado: 'pendiente' }]
    : [];

  if (isEditing) {
    const t = getById(editingId);
    if (t) {
      Object.assign(t, { numero, descripcion: desc, modulo, tipo, fechaVencimiento: venc });
      if (tipo === 'abogado') t.abogado = abogado;
      else delete t.abogado;
      if (tareaInicial.length) t.seguimiento.unshift(...tareaInicial);
    }
    showToast('Trámite actualizado.');
  } else {
    const newT = {
      id: genId(), numero, descripcion: desc, modulo, tipo, fechaVencimiento: venc,
      gestion: { analisis: false, cumplimiento: false },
      seguimiento: tareaInicial, notas: [],
      terminado: false, terminadoEn: null, creadoEn: new Date().toISOString(),
    };
    if (tipo === 'abogado') newT.abogado = abogado;
    STATE.tramites.push(newT); STATE.order.push(newT.id);
    showToast('Trámite creado.');
  }
  saveAll(); renderAll(); closeModal();
}

// ============================================================
// CONFIGURACIÓN
// ============================================================
function renderConfig() {
  const n1 = document.getElementById('nameAbogado1'); if (n1) n1.value = STATE.config.abogado1;
  const n2 = document.getElementById('nameAbogado2'); if (n2) n2.value = STATE.config.abogado2;
  const c1 = document.getElementById('colorAbogado1'); if (c1) { c1.value = STATE.config.colorAbogado1||'#15803d'; updateColorPreview(1); }
  const c2 = document.getElementById('colorAbogado2'); if (c2) { c2.value = STATE.config.colorAbogado2||'#1d4ed8'; updateColorPreview(2); }
  const cb1 = document.getElementById('colorBar1'); if (cb1) cb1.value = STATE.config.colorBar1||'#f59e0b';
  const cb2 = document.getElementById('colorBar2'); if (cb2) cb2.value = STATE.config.colorBar2||'#3b5bdb';
  const cb3 = document.getElementById('colorBar3'); if (cb3) cb3.value = STATE.config.colorBar3||'#10b981';
  updateBarPreviews();
  setDetailMode(STATE.config.detailMode || 'expand');
  renderModulosList();
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
    card.addEventListener('click', () => { applyTheme(theme.id); saveAll(); renderThemeGrid(); });
    grid.appendChild(card);
  });
}

function updateColorPreview(n) {
  const picker = document.getElementById(`colorAbogado${n}`);
  const prev   = document.getElementById(`preview${n}`);
  if (picker && prev) prev.style.background = picker.value;
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
      if (confirm(`¿Eliminar módulo ${m.sigla}?`)) { STATE.config.modulos.splice(i,1); saveAll(); populateModuloSelects(); renderModulosList(); }
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
  const a = document.createElement('a'); a.href = url; a.download = `juritask_${today()}.json`; a.click();
  URL.revokeObjectURL(url); showToast('Datos exportados.');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.tramites) STATE.tramites = data.tramites;
      if (data.order)    STATE.order = data.order;
      if (data.config)   STATE.config = Object.assign({...DEFAULT_CONFIG, modulos:[...DEFAULT_CONFIG.modulos]}, data.config);
      // Migrar si venían con proximaAccion
      STATE.tramites.forEach(t => {
        if (!t.tipo) t.tipo = 'abogado';
        if (!t.seguimiento) t.seguimiento = [];
        if (!t.notas) t.notas = [];
        if (!t.gestion) t.gestion = { analisis: false, cumplimiento: false };
        if (t.proximaAccion && t.proximaAccion.descripcion) {
          t.seguimiento.unshift({ descripcion: t.proximaAccion.descripcion, fecha: t.proximaAccion.fecha||'', responsable: t.proximaAccion.responsable||(t.abogado||'propio'), estado: 'pendiente' });
          delete t.proximaAccion;
        }
      });
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
function openMobSheet() { document.getElementById('mobSheet').classList.add('open'); document.getElementById('mobSheetOverlay').classList.add('show'); }
function closeMobSheet() { document.getElementById('mobSheet').classList.remove('open'); document.getElementById('mobSheetOverlay').classList.remove('show'); }

// ============================================================
// MODAL DRAGGABLE
// ============================================================
function initDraggableModal(modalEl) {
  const header = modalEl.querySelector('.modal-header');
  if (!header) return;
  let dragging = false, startX, startY, origLeft, origTop;
  header.addEventListener('mousedown', e => {
    if (e.target.closest('button') || isMobile()) return;
    dragging = true;
    if (!modalEl.classList.contains('draggable-active')) {
      const rect = modalEl.getBoundingClientRect();
      modalEl.style.left = rect.left + 'px'; modalEl.style.top = rect.top + 'px';
      modalEl.classList.add('draggable-active');
    }
    origLeft = parseFloat(modalEl.style.left)||0;
    origTop  = parseFloat(modalEl.style.top) ||0;
    startX = e.clientX; startY = e.clientY;
    header.classList.add('is-dragging'); modalEl.classList.add('is-dragging');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const m = 8;
    let l = origLeft + (e.clientX - startX), t2 = origTop + (e.clientY - startY);
    l  = Math.max(m, Math.min(l,  window.innerWidth  - modalEl.offsetWidth  - m));
    t2 = Math.max(m, Math.min(t2, window.innerHeight - modalEl.offsetHeight - m));
    modalEl.style.left = l + 'px'; modalEl.style.top = t2 + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    header.classList.remove('is-dragging'); modalEl.classList.remove('is-dragging');
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
function formatDatetime(iso) { try { return new Date(iso).toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' }); } catch { return iso; } }

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

  const sortVal = STATE.config.sortBy || 'vencimiento';
  const ds = document.getElementById('sortSelect'); if(ds) ds.value = sortVal;
  const ms = document.getElementById('sortSelectMob'); if(ms) ms.value = sortVal;

  if (isMobile()) closeSidebar();
  renderAll();
  setupContainerDrop(document.getElementById('tramiteList'));

  // Navegación sidebar
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => { switchView(btn.dataset.view); if (isMobile()) closeSidebar(); });
  });

  // Sidebar
  document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarToggle').addEventListener('click', closeSidebar);
  backdropEl.addEventListener('click', closeSidebar);

  // Nuevo trámite
  document.getElementById('newTramiteBtn').addEventListener('click', () => openModal());

  // Toggle tipo de trámite en modal
  document.getElementById('tipoBtnAbogado').addEventListener('click', () => setModalTipo('abogado'));
  document.getElementById('tipoBtnPropio').addEventListener('click',  () => setModalTipo('propio'));

  // Abogado change → sync responsable
  document.getElementById('fAbogado').addEventListener('change', syncTareaRespSelect);

  // Mostrar/ocultar form de tarea en modal
  document.getElementById('btnMostrarTareaModal').addEventListener('click', () => {
    const fields = document.getElementById('nuevaTareaFieldsModal');
    fields.style.display = fields.style.display === 'none' ? 'block' : 'none';
  });

  // Columnas desktop
  document.querySelectorAll('.col-btn').forEach(btn => btn.addEventListener('click', () => setColumns(parseInt(btn.dataset.cols))));

  // Ordenar desktop
  document.getElementById('sortSelect').addEventListener('change', e => setSortBy(e.target.value));

  // Bottom sheet móvil
  document.getElementById('mobOptsBtn').addEventListener('click', openMobSheet);
  document.getElementById('mobSheetOverlay').addEventListener('click', closeMobSheet);
  document.getElementById('sortSelectMob').addEventListener('change', e => { setSortBy(e.target.value); closeMobSheet(); });
  document.querySelectorAll('.mob-col-btn').forEach(btn => btn.addEventListener('click', () => { setColumns(parseInt(btn.dataset.cols)); closeMobSheet(); }));

  // Modal tramite
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('saveTramite').addEventListener('click', saveTramite);
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

  // Filtros
  ['filterTipo','filterAbogado','filterModulo','filterResponsable','filterEtapa'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderAll);
  });
  document.getElementById('searchInput').addEventListener('input', renderAll);
  document.getElementById('clearFilters').addEventListener('click', () => {
    ['filterTipo','filterAbogado','filterModulo','filterResponsable','filterEtapa'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value = '';
    });
    document.getElementById('searchInput').value = '';
    renderAll();
  });

  // Export/Import
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => { if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; } });

  // Config: modo detalle
  document.getElementById('modeExpand').addEventListener('click', () => setDetailMode('expand'));
  document.getElementById('modeModal').addEventListener('click',  () => setDetailMode('modal'));

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
        Object.values(KEYS).forEach(k => localStorage.removeItem(k));
        STATE.tramites = []; STATE.order = [];
        STATE.config = { ...DEFAULT_CONFIG, modulos: [...DEFAULT_CONFIG.modulos] };
        applyCssColors(); applyTheme('claro');
        populateModuloSelects(); updateAbogadoNames();
        const ds2 = document.getElementById('sortSelect'); if(ds2) ds2.value = 'vencimiento';
        const ms2 = document.getElementById('sortSelectMob'); if(ms2) ms2.value = 'vencimiento';
        renderConfig(); renderAll(); showToast('Datos borrados.');
      }
    }
  });

  // Teclado ESC
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('detailOverlay').classList.contains('open')) closeDetail();
    else if (document.getElementById('modalOverlay').classList.contains('open')) closeModal();
    else if (document.getElementById('mobSheet').classList.contains('open')) closeMobSheet();
    else closeAllExpands();
  });
}

document.addEventListener('DOMContentLoaded', init);

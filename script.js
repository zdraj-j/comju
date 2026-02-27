/**
 * JuriTask — Script v8
 * Nuevas funciones:
 *  1. Editar/eliminar desde modal: usa _detailAction(cmd) con id en data-id del modal
 *  2. Búsqueda global mejorada: busca en número, descripción, tareas y notas
 *  3. Prioridad en tareas: flag urgente (🔴) con orden en reporte
 *  4. Duplicar trámite: botón ⧉ en modal de detalle
 *  5. Vista de calendario: muestra vencimientos y tareas por mes
 *  6. Días restantes en tarjeta: toggle en configuración
 */

// ============================================================
// TEMAS
// ============================================================
const THEMES = [
  { id: 'claro',   nombre: 'Claro',   swatches: ['#f4f5f7','#ffffff','#3b5bdb','#1a1d23'] },
  { id: 'oscuro',  nombre: 'Oscuro',  swatches: ['#0f1117','#1a1d27','#6e8efb','#e8eaf0'] },
  { id: 'sepia',   nombre: 'Sepia',   swatches: ['#f5f0e8','#fdf8f0','#8b6c2e','#2c2416'] },
  { id: 'pizarra', nombre: 'Pizarra', swatches: ['#1e2533','#26304a','#58a6f0','#d4daf0'] },
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
  abogados: [
    { key: 'abogado1', nombre: 'Abogado 1', color: '#15803d' },
    { key: 'abogado2', nombre: 'Abogado 2', color: '#1d4ed8' },
  ],
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
  autoReq: true,
  autoReqTexto: '1er req',
  autoReqDias: 7,
  diasRestantes: false,
};

// ============================================================
// ESTADO
// ============================================================
const STATE = {
  tramites: [],
  order: [],
  config: {
    ...DEFAULT_CONFIG,
    abogados: DEFAULT_CONFIG.abogados.map(a => ({ ...a })),
    modulos: [...DEFAULT_CONFIG.modulos],
  },
};

let currentDetailId = null;
let isEditing = false;
let editingId = null;

// ============================================================
// HISTORIAL (Ctrl+Z)
// ============================================================
const HISTORY_MAX = 30;
const _history = [];
let _undoing = false;

function pushHistory(label) {
  if (_undoing) return;
  _history.push({ label, tramites: JSON.parse(JSON.stringify(STATE.tramites)), order: JSON.parse(JSON.stringify(STATE.order)) });
  if (_history.length > HISTORY_MAX) _history.shift();
}

function undo() {
  if (!_history.length) { showToast('No hay acciones para deshacer.'); return; }
  const openId = currentDetailId;
  const isModal = document.getElementById('detailOverlay').classList.contains('open');
  _undoing = true;
  const snap = _history.pop();
  STATE.tramites = snap.tramites;
  STATE.order    = snap.order;
  saveAll(); renderAll();
  if (openId) { const t = getById(openId); if (t) { if (isModal) openDetailModal(t); else openDetailExpand(t); } }
  showToast(`↩ Deshecho: ${snap.label}`);
  _undoing = false;
}

// ============================================================
// PERSISTENCIA
// ============================================================
const KEYS = { tramites: 'juritask_tramites', order: 'juritask_order', config: 'juritask_config' };

function saveAll() {
  localStorage.setItem(KEYS.tramites, JSON.stringify(STATE.tramites));
  localStorage.setItem(KEYS.order,    JSON.stringify(STATE.order));
  localStorage.setItem(KEYS.config,   JSON.stringify(STATE.config));
}

function migrateTramite(t) {
  if (!t.tipo)      t.tipo = 'abogado';
  if (!t.seguimiento) t.seguimiento = [];
  if (!t.notas)     t.notas = [];
  if (!t.gestion)   t.gestion = { analisis: false, cumplimiento: false };
  t.seguimiento.forEach(s => {
    if (s.responsable === 'auxiliar' || s.responsable === 'propio') s.responsable = 'yo';
    if (s.urgente === undefined) s.urgente = false;
  });
  if (t.proximaAccion && t.proximaAccion.descripcion) {
    const resp = t.proximaAccion.responsable;
    t.seguimiento.unshift({ descripcion: t.proximaAccion.descripcion, fecha: t.proximaAccion.fecha || '', responsable: (resp === 'auxiliar' || resp === 'propio') ? 'yo' : (resp || 'yo'), estado: 'pendiente', urgente: false });
    delete t.proximaAccion;
  }
}

function loadAll() {
  const OLD = { tramites:'lexgestion_tramites', order:'lexgestion_order', config:'lexgestion_config' };
  try {
    const t = localStorage.getItem(KEYS.tramites) || localStorage.getItem(OLD.tramites);
    if (t) STATE.tramites = JSON.parse(t);
    const o = localStorage.getItem(KEYS.order) || localStorage.getItem(OLD.order);
    if (o) STATE.order = JSON.parse(o);
    const c = localStorage.getItem(KEYS.config) || localStorage.getItem(OLD.config);
    if (c) {
      const saved = JSON.parse(c);
      STATE.config = Object.assign({ ...DEFAULT_CONFIG, abogados: DEFAULT_CONFIG.abogados.map(a=>({...a})), modulos: [...DEFAULT_CONFIG.modulos] }, saved);
      if (!STATE.config.abogados?.length) {
        STATE.config.abogados = [
          { key: 'abogado1', nombre: saved.abogado1 || 'Abogado 1', color: saved.colorAbogado1 || '#15803d' },
          { key: 'abogado2', nombre: saved.abogado2 || 'Abogado 2', color: saved.colorAbogado2 || '#1d4ed8' },
        ];
      }
    }
    STATE.tramites.forEach(migrateTramite);
  } catch (e) { console.error('Error cargando datos:', e); }
}

// ============================================================
// HELPERS
// ============================================================
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

let _todayCache = '', _tomorrowCache = '', _cacheTs = 0;
function today() {
  const now = Date.now();
  if (now - _cacheTs < 1000) return _todayCache;
  const d = new Date();
  _todayCache    = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const t2 = new Date(d); t2.setDate(t2.getDate() + 1);
  _tomorrowCache = `${t2.getFullYear()}-${String(t2.getMonth()+1).padStart(2,'0')}-${String(t2.getDate()).padStart(2,'0')}`;
  _cacheTs = now;
  return _todayCache;
}
function tomorrow() { today(); return _tomorrowCache; }

function formatDate(s) { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }
function sentenceCase(str) { if (!str) return str; const s = str.trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s; }

function dateClass(s) {
  if (!s) return '';
  const hoy = today(), man = tomorrow();
  if (s < hoy) return 'overdue';
  if (s === hoy) return 'today';
  if (s === man) return 'soon';
  return 'upcoming';
}

function vencClass(s, tramite) {
  if (!s) return '';
  if (tramite?.gestion?.cumplimiento) return 'upcoming';
  return dateClass(s);
}

/** Diferencia de días entre fecha ISO y hoy: negativo = vencido, 0 = hoy, positivo = futuro */
function diasRestantesNum(fechaISO) {
  if (!fechaISO) return null;
  const hoy = new Date(today());
  const fecha = new Date(fechaISO);
  return Math.round((fecha - hoy) / 86400000);
}

function diasRestantesLabel(dias) {
  if (dias === null) return '';
  if (dias < 0)  return `${Math.abs(dias)}d vencido`;
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Mañana';
  return `${dias}d`;
}

function proximaFechaSeguimiento(t) {
  const pendientes = (t.seguimiento || []).filter(s => s.estado === 'pendiente' && s.fecha);
  if (!pendientes.length) return null;
  return pendientes.map(s => s.fecha).sort()[0];
}

function abogadoName(key) { if (!key || key === 'yo') return 'Yo mismo'; const a = (STATE.config.abogados||[]).find(x => x.key === key); return a ? a.nombre : key; }
function abogadoColor(key) { const a = (STATE.config.abogados||[]).find(x => x.key === key); return a ? a.color : '#9333ea'; }
function hexToRgba(hex, alpha) { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${alpha})`; }
function computeEtapa(t) { return (t.gestion?.cumplimiento) ? 'seguimiento' : 'gestion'; }
function esPropio(t) { return t.tipo === 'propio'; }

function esHoyOVencido(t) {
  const hoy = today();
  if (t.fechaVencimiento && !t.gestion?.cumplimiento && t.fechaVencimiento <= hoy) return true;
  const pf = proximaFechaSeguimiento(t);
  return !!(pf && pf <= hoy);
}

function purgeExpiredFinished() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30);
  const before = STATE.tramites.length;
  STATE.tramites = STATE.tramites.filter(t => !t.terminado || new Date(t.terminadoEn) > cutoff);
  if (STATE.tramites.length !== before) saveAll();
}

function applyCssColors() {
  const s = document.documentElement.style;
  (STATE.config.abogados||[]).forEach((a, i) => s.setProperty(`--color-abogado${i+1}`, a.color));
  s.setProperty('--bar-color-1', STATE.config.colorBar1 || '#f59e0b');
  s.setProperty('--bar-color-2', STATE.config.colorBar2 || '#3b5bdb');
  s.setProperty('--bar-color-3', STATE.config.colorBar3 || '#10b981');
}

// ============================================================
// CONFIRM DIALOG
// ============================================================
let _confirmResolve = null;
function showConfirm(msg) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirmMsg').textContent = msg;
    document.getElementById('confirmOverlay').classList.add('open');
  });
}
function _confirmClose(result) {
  document.getElementById('confirmOverlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
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
    const sel = document.getElementById(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = id === 'filterModulo' ? '<option value="">Todos</option>' : '';
    STATE.config.modulos.forEach(m => { const o = document.createElement('option'); o.value = m.sigla; o.textContent = `${m.sigla} — ${m.nombre}`; sel.appendChild(o); });
    sel.value = cur;
  });
}

function updateAbogadoSelects() {
  const abogados = STATE.config.abogados || [];
  ['filterAbogado','filterResponsable'].forEach((id, idx) => {
    const sel = document.getElementById(id); if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos</option>';
    abogados.forEach(a => { const o = document.createElement('option'); o.value = a.key; o.textContent = a.nombre; sel.appendChild(o); });
    if (idx === 1) { const oYo = document.createElement('option'); oYo.value = 'yo'; oYo.textContent = 'Yo mismo'; sel.appendChild(oYo); }
    if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  });
  const fAbM = document.getElementById('fAbogado');
  if (fAbM) {
    const cur = fAbM.value;
    fAbM.innerHTML = '';
    abogados.forEach(a => { const o = document.createElement('option'); o.value = a.key; o.textContent = a.nombre; fAbM.appendChild(o); });
    fAbM.value = ([...fAbM.options].some(o => o.value === cur)) ? cur : (abogados[0]?.key || '');
  }
  const rg = document.getElementById('reportFilterGroup');
  if (rg) {
    rg.innerHTML = '<button class="toggle-btn active" data-abogado="">Todos</button>';
    abogados.forEach(a => { const btn = document.createElement('button'); btn.className = 'toggle-btn'; btn.dataset.abogado = a.key; btn.textContent = a.nombre; rg.appendChild(btn); });
    const btnYo = document.createElement('button'); btnYo.className = 'toggle-btn'; btnYo.dataset.abogado = 'yo'; btnYo.textContent = 'Yo mismo'; rg.appendChild(btnYo);
    reportFiltroAbogado = '';
  }
  syncTareaRespSelect();
}
const updateAbogadoNames = updateAbogadoSelects;

function buildRespOptions(tipoTramite, abogadoKey, selectedValue) {
  const opts = [];
  if (tipoTramite === 'abogado' && abogadoKey) { const a = (STATE.config.abogados||[]).find(x => x.key === abogadoKey); if (a) opts.push({ value: a.key, label: a.nombre }); }
  opts.push({ value: 'yo', label: 'Yo mismo' });
  return opts.map(o => `<option value="${o.value}" ${o.value === selectedValue ? 'selected' : ''}>${o.label}</option>`).join('');
}

// ============================================================
// COLUMNAS / DETALLE / SORT
// ============================================================
function setColumns(n) {
  STATE.config.columns = n;
  document.querySelectorAll('.col-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.cols) === n));
  document.querySelectorAll('.mob-col-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.cols) === n));
  saveAll(); renderAll();
}
function setDetailMode(mode) {
  STATE.config.detailMode = mode;
  document.getElementById('modeExpand').classList.toggle('active', mode === 'expand');
  document.getElementById('modeModal').classList.toggle('active', mode === 'modal');
  saveAll();
}
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
    const pfa = proximaFechaSeguimiento(a) || FAR, pfb = proximaFechaSeguimiento(b) || FAR;
    let cmp = 0;
    if (sortBy === 'vencimiento') { cmp = (a.fechaVencimiento||FAR).localeCompare(b.fechaVencimiento||FAR); }
    else if (sortBy === 'seguimiento') { cmp = pfa.localeCompare(pfb); }
    else if (sortBy === 'mixto') { const ma = [a.fechaVencimiento,pfa].filter(x=>x!==FAR).sort()[0]||FAR, mb = [b.fechaVencimiento,pfb].filter(x=>x!==FAR).sort()[0]||FAR; cmp = ma.localeCompare(mb); }
    else if (sortBy === 'abogado') { cmp = abogadoName(a.abogado||'yo').localeCompare(abogadoName(b.abogado||'yo')); }
    else if (sortBy === 'numero') { cmp = (parseInt(a.numero)||0) - (parseInt(b.numero)||0); }
    return cmp !== 0 ? cmp : manualOrder.indexOf(a.id) - manualOrder.indexOf(b.id);
  });
}

// ============================================================
// TAREA AUTOMÁTICA
// ============================================================
function nDaysFromToday(n) { const d = new Date(); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

function crearTareaRequerimiento(t) {
  if (!STATE.config.autoReq) return;
  const dias = parseInt(STATE.config.autoReqDias) || 7;
  const texto = (STATE.config.autoReqTexto || '1er req').trim();
  const fecha = nDaysFromToday(dias);
  if (!t.seguimiento.some(s => s.descripcion === texto && s.fecha === fecha && s.estado === 'pendiente')) {
    t.seguimiento.unshift({ descripcion: texto, fecha, responsable: esPropio(t) ? 'yo' : t.abogado, estado: 'pendiente', urgente: false });
  }
}

// ============================================================
// DETALLE — ACCIÓN GLOBAL (fix definitivo editar/eliminar)
// El onclick en el HTML llama esta función. Lee el ID del atributo
// data-id del modal para no depender de currentDetailId en el timing.
// ============================================================
function _detailAction(cmd) {
  const modal = document.getElementById('detailModal');
  const id = modal.dataset.id;
  if (!id) return;
  const t = getById(id);
  if (!t) return;

  if (cmd === 'edit') {
    closeDetail();
    setTimeout(() => openModal(t), 30);

  } else if (cmd === 'delete') {
    const desc = t.descripcion || '';
    const num  = t.numero || id;
    if (!confirm(`¿Eliminar el trámite #${num} "${desc}"?\nEsta acción no se puede deshacer.`)) return;
    pushHistory(`Eliminar trámite #${num}`);
    closeDetail();
    STATE.tramites = STATE.tramites.filter(x => x.id !== id);
    STATE.order    = STATE.order.filter(x => x !== id);
    saveAll(); renderAll(); showToast('Trámite eliminado.');

  } else if (cmd === 'duplicate') {
    const newT = JSON.parse(JSON.stringify(t));
    newT.id = genId();
    newT.numero = t.numero + '-copia';
    newT.terminado = false; newT.terminadoEn = null;
    newT.creadoEn = new Date().toISOString();
    newT.gestion = { analisis: false, cumplimiento: false };
    pushHistory(`Duplicar trámite #${t.numero}`);
    STATE.tramites.push(newT);
    STATE.order.push(newT.id);
    saveAll(); renderAll(); showToast(`Trámite duplicado como #${newT.numero}.`);
  }
}

// ============================================================
// CONTENIDO DE DETALLE
// ============================================================
function buildDetailContent(t) {
  const esP = esPropio(t);
  const etapa = computeEtapa(t);
  const etapaLabel = etapa === 'seguimiento' ? 'Seguimiento' : 'Gestión';
  const etapaCls   = etapa === 'seguimiento' ? ' seguimiento' : '';
  const p = `det_${t.id}`;
  const hiddenVenc = !!(t.gestion?.cumplimiento);

  const gestionHtml = esP ? '' : `
    <div class="detail-section">
      <h3>Gestión</h3>
      <div class="checks-row">
        <label class="check-label"><input type="checkbox" id="${p}_analisis" ${t.gestion.analisis?'checked':''}/><span class="check-custom"></span> Análisis</label>
        <label class="check-label"><input type="checkbox" id="${p}_cumplimiento" ${t.gestion.cumplimiento?'checked':''}/><span class="check-custom"></span> Cumplimiento</label>
      </div>
    </div>`;

  return `
    ${gestionHtml}
    <div class="detail-section">
      <h3>Seguimiento <span class="etapa-badge${etapaCls}" id="${p}_etapabadge">${etapaLabel}</span></h3>
      <div id="${p}_actividades"></div>
      <div class="nueva-tarea-toggle">
        <button class="btn-nueva-tarea" id="${p}_btnNuevaTarea" type="button">＋ Nueva tarea</button>
      </div>
      <div class="add-actividad-form" id="${p}_formNuevaTarea" style="display:none">
        <input type="text" id="${p}_newActDesc" placeholder="¿Qué se debe hacer?" />
        <div class="add-actividad-form-row">
          <input type="date" id="${p}_newActFecha" />
          <select id="${p}_newActResp">${buildRespOptions(t.tipo||'abogado',t.abogado||'abogado1',t.abogado||'yo')}</select>
        </div>
        <div class="add-actividad-btns">
          <button class="btn-small" id="${p}_addAct">+ Agregar</button>
          <button class="btn-small" id="${p}_cancelAct" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">Cancelar</button>
        </div>
      </div>
    </div>
    <div class="detail-section detail-vencimiento-section${hiddenVenc?' hidden-venc':''}" id="${p}_vencSection">
      <h3>Fecha de vencimiento</h3>
      <div class="form-grid"><div class="form-group"><label>Fecha</label><input type="date" id="${p}_vencimiento" value="${t.fechaVencimiento||''}" /></div></div>
      <button class="btn-small" id="${p}_saveVenc" style="margin-top:10px">Guardar fecha</button>
    </div>
    <div class="detail-section">
      <h3>Notas</h3>
      <div id="${p}_notas"></div>
      <div class="add-nota-row">
        <textarea id="${p}_newNota" placeholder="Escribe una nota…" rows="2"></textarea>
        <button class="btn-small" id="${p}_addNota">+ Nota</button>
      </div>
    </div>`;
}

function bindDetailContent(t, container, expandWrapper) {
  const p = `det_${t.id}`;
  const esP = esPropio(t);

  if (!esP) {
    container.querySelector(`#${p}_analisis`).addEventListener('change', e => {
      pushHistory(e.target.checked ? 'Marcar análisis' : 'Desmarcar análisis');
      t.gestion.analisis = e.target.checked; saveAll(); refreshCardOnly(t);
    });
    container.querySelector(`#${p}_cumplimiento`).addEventListener('change', e => {
      pushHistory(e.target.checked ? 'Marcar cumplimiento' : 'Desmarcar cumplimiento');
      t.gestion.cumplimiento = e.target.checked;
      const badge = container.querySelector(`#${p}_etapabadge`);
      const etapa = computeEtapa(t);
      if (badge) { badge.textContent = etapa==='seguimiento'?'Seguimiento':'Gestión'; badge.className = 'etapa-badge'+(etapa==='seguimiento'?' seguimiento':''); }
      const vencSec = container.querySelector(`#${p}_vencSection`);
      if (vencSec) vencSec.classList.toggle('hidden-venc', e.target.checked);
      if (e.target.checked) { crearTareaRequerimiento(t); renderActividadesIn(t, container.querySelector(`#${p}_actividades`), container, expandWrapper); showToast('✓ Cumplimiento marcado. Tarea automática creada.'); }
      saveAll(); refreshCardOnly(t);
    });
  }

  renderActividadesIn(t, container.querySelector(`#${p}_actividades`), container, expandWrapper);

  const btnNueva = container.querySelector(`#${p}_btnNuevaTarea`);
  const formNueva = container.querySelector(`#${p}_formNuevaTarea`);
  btnNueva.addEventListener('click', () => {
    const open = formNueva.style.display !== 'none';
    formNueva.style.display = open ? 'none' : 'block';
    if (!open) setTimeout(() => container.querySelector(`#${p}_newActDesc`)?.focus(), 60);
  });
  container.querySelector(`#${p}_cancelAct`).addEventListener('click', () => { formNueva.style.display = 'none'; });
  container.querySelector(`#${p}_addAct`).addEventListener('click', () => {
    const desc = container.querySelector(`#${p}_newActDesc`).value.trim();
    const fecha = container.querySelector(`#${p}_newActFecha`).value;
    const resp  = container.querySelector(`#${p}_newActResp`).value;
    if (!desc) { showToast('Escribe una descripción.'); return; }
    pushHistory('Agregar tarea');
    t.seguimiento.push({ descripcion: sentenceCase(desc), fecha, responsable: resp, estado: 'pendiente', urgente: false });
    container.querySelector(`#${p}_newActDesc`).value = '';
    container.querySelector(`#${p}_newActFecha`).value = '';
    formNueva.style.display = 'none';
    saveAll(); refreshCardOnly(t);
    renderActividadesIn(t, container.querySelector(`#${p}_actividades`), container, expandWrapper);
    showToast('Tarea agregada.');
  });
  container.querySelector(`#${p}_saveVenc`).addEventListener('click', () => {
    const fecha = container.querySelector(`#${p}_vencimiento`).value;
    if (!fecha) { showToast('Selecciona una fecha.'); return; }
    pushHistory('Cambiar fecha de vencimiento');
    t.fechaVencimiento = fecha; saveAll(); refreshCardOnly(t); showToast('Fecha actualizada.');
  });
  renderNotasIn(t, container.querySelector(`#${p}_notas`));
  container.querySelector(`#${p}_addNota`).addEventListener('click', () => {
    const texto = container.querySelector(`#${p}_newNota`).value.trim();
    if (!texto) { showToast('Escribe el texto de la nota.'); return; }
    pushHistory('Agregar nota');
    t.notas.push({ texto: sentenceCase(texto), fecha: new Date().toISOString() });
    container.querySelector(`#${p}_newNota`).value = '';
    saveAll(); renderNotasIn(t, container.querySelector(`#${p}_notas`)); showToast('Nota agregada.');
  });
}

function refreshCardOnly(t) {
  const cards = document.querySelectorAll(`.tramite-card[data-id="${t.id}"]`);
  cards.forEach(card => {
    const segs = card.querySelectorAll('.progress-segment');
    const esP = esPropio(t);
    if (segs[0]) segs[0].className = 'progress-segment'+((!esP&&t.gestion?.analisis)?' active-1':'');
    if (segs[1]) segs[1].className = 'progress-segment'+((!esP&&t.gestion?.cumplimiento)?' active-2':'');
    if (segs[2]) segs[2].className = 'progress-segment'+(t.terminado?' active-3':'');
    const showVenc = t.fechaVencimiento && !t.gestion?.cumplimiento;
    const datesEl = card.querySelector('.card-dates');
    if (datesEl) {
      if (showVenc) {
        const vcls = vencClass(t.fechaVencimiento, t);
        const lbl = vcls==='overdue'?'⚠ Vencido':vcls==='today'?'⚠ Hoy':vcls==='soon'?'⏰ Mañana':'📅 Vence';
        const dias = STATE.config.diasRestantes ? diasRestantesNum(t.fechaVencimiento) : null;
        const diasTag = dias !== null ? ` <span class="dias-restantes ${vcls}">${diasRestantesLabel(dias)}</span>` : '';
        datesEl.innerHTML = `<span class="venc-fecha ${vcls}">${lbl}: ${formatDate(t.fechaVencimiento)}</span>${diasTag}`;
      } else { datesEl.innerHTML = ''; }
    }
    const segEl = card.querySelector('.card-seguimiento');
    const tareasPendientes = (t.seguimiento||[]).filter(s => s.estado === 'pendiente');
    const newSegHtml = buildSeguimientoHtml(tareasPendientes);
    if (segEl) { const parent = segEl.parentNode; segEl.remove(); if (newSegHtml && parent) { const tmp = document.createElement('div'); tmp.innerHTML = newSegHtml; parent.appendChild(tmp.firstElementChild); } }
    else if (newSegHtml) { const infoEl = card.querySelector('.card-info'); if (infoEl) { const tmp = document.createElement('div'); tmp.innerHTML = newSegHtml; infoEl.appendChild(tmp.firstElementChild); } }
  });
}

function buildSeguimientoHtml(tareasPendientes) {
  if (!tareasPendientes.length) return '';
  return `<div class="card-seguimiento">
    ${tareasPendientes.slice(0,2).map(s => {
      const dc = dateClass(s.fecha);
      const urgTag = s.urgente ? '<span class="seg-urg">🔴</span>' : '';
      const fechaTag = s.fecha ? `<span class="seg-fecha ${dc}">${formatDate(s.fecha)}</span>` : '';
      const respTag  = s.responsable ? `<span style="color:var(--text-muted);font-size:10px">· ${abogadoName(s.responsable)}</span>` : '';
      return `<div class="card-seg-item"><div class="seg-dot ${dc}"></div>${urgTag}<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.descripcion}</span>${fechaTag}${respTag}</div>`;
    }).join('')}
    ${tareasPendientes.length > 2 ? `<div class="card-seg-item" style="color:var(--text-muted);font-size:11px">+${tareasPendientes.length-2} más…</div>` : ''}
  </div>`;
}

function renderActividadesIn(t, listEl, container, expandWrapper) {
  if (!listEl) return;
  listEl.innerHTML = '';
  // Ordenar: urgentes primero, luego por fecha
  const sorted = [...t.seguimiento].map((act, origIdx) => ({ act, origIdx }))
    .sort((a, b) => {
      if (a.act.urgente && !b.act.urgente) return -1;
      if (!a.act.urgente && b.act.urgente) return 1;
      const fa = a.act.fecha || '9999', fb = b.act.fecha || '9999';
      return fa.localeCompare(fb);
    });

  sorted.forEach(({ act, origIdx: i }) => {
    const div = document.createElement('div');
    div.className = 'actividad-item' + (act.urgente ? ' act-urgente' : '');
    const isDone = act.estado === 'realizado';
    const dcls = dateClass(act.fecha);
    div.innerHTML = `
      <div class="actividad-check-wrap"><label class="round-check-wrap"><input type="checkbox" ${isDone?'checked':''}/><div class="round-check-box"></div></label></div>
      <div class="actividad-info">
        <div class="actividad-desc ${isDone?'done':''}" title="Doble clic para editar">${escapeHtml(act.descripcion)}</div>
        <div class="actividad-meta">
          <input type="date" value="${act.fecha||''}" />
          ${act.responsable ? `<span class="actividad-resp">${abogadoName(act.responsable)}</span>` : ''}
          <span class="actividad-estado ${act.estado}">${isDone?'Realizado':'Pendiente'}</span>
        </div>
      </div>
      <button class="act-urg-btn ${act.urgente?'active':''}" title="${act.urgente?'Quitar urgente':'Marcar urgente'}">🔴</button>
      <button class="actividad-delete" title="Eliminar">✕</button>`;

    const descEl = div.querySelector('.actividad-desc');
    descEl.addEventListener('dblclick', () => {
      const input = document.createElement('input'); input.type='text'; input.value=act.descripcion; input.className='actividad-desc-edit';
      descEl.replaceWith(input); input.focus(); input.select();
      const save = () => { const val=sentenceCase(input.value.trim()); if(val&&val!==act.descripcion){pushHistory('Editar descripción de tarea');t.seguimiento[i].descripcion=val;saveAll();refreshCardOnly(t);} renderActividadesIn(t,listEl,container,expandWrapper); };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();input.blur();} if(e.key==='Escape'){renderActividadesIn(t,listEl,container,expandWrapper);} });
    });
    div.querySelector('input[type="checkbox"]').addEventListener('change', e => {
      pushHistory(e.target.checked?'Marcar tarea realizada':'Desmarcar tarea');
      t.seguimiento[i].estado = e.target.checked?'realizado':'pendiente';
      saveAll(); refreshCardOnly(t); renderActividadesIn(t,listEl,container,expandWrapper);
    });
    div.querySelector('input[type="date"]').addEventListener('change', e => {
      pushHistory('Cambiar fecha de tarea'); t.seguimiento[i].fecha = e.target.value; saveAll(); refreshCardOnly(t);
    });
    div.querySelector('.act-urg-btn').addEventListener('click', () => {
      t.seguimiento[i].urgente = !t.seguimiento[i].urgente;
      saveAll(); refreshCardOnly(t); renderActividadesIn(t,listEl,container,expandWrapper);
    });
    div.querySelector('.actividad-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta tarea?')) { pushHistory('Eliminar tarea'); t.seguimiento.splice(i,1); saveAll(); refreshCardOnly(t); renderActividadesIn(t,listEl,container,expandWrapper); }
    });
    listEl.appendChild(div);
  });
}

function renderNotasIn(t, listEl) {
  if (!listEl) return;
  listEl.innerHTML = '';
  [...(t.notas||[])].sort((a,b) => a.fecha.localeCompare(b.fecha)).forEach(nota => {
    const idx = t.notas.indexOf(nota);
    const div = document.createElement('div'); div.className = 'nota-item';
    div.innerHTML = `<div class="nota-text" title="Doble clic para editar">${escapeHtml(nota.texto)}</div><div class="nota-fecha">${formatDatetime(nota.fecha)}</div><button class="nota-delete">✕</button>`;
    const textoEl = div.querySelector('.nota-text');
    textoEl.addEventListener('dblclick', () => {
      const ta = document.createElement('textarea'); ta.value=nota.texto; ta.className='nota-text-edit'; ta.rows=3;
      textoEl.replaceWith(ta); ta.focus(); ta.select();
      const save = () => { const val=sentenceCase(ta.value.trim()); if(val&&val!==nota.texto){pushHistory('Editar texto de nota');t.notas[idx].texto=val;saveAll();} renderNotasIn(t,listEl); };
      ta.addEventListener('blur', save);
      ta.addEventListener('keydown', e => { if(e.key==='Escape'){renderNotasIn(t,listEl);} if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();ta.blur();} });
    });
    div.querySelector('.nota-delete').addEventListener('click', () => { if(confirm('¿Eliminar esta nota?')){pushHistory('Eliminar nota');t.notas.splice(idx,1);saveAll();renderNotasIn(t,listEl);} });
    listEl.appendChild(div);
  });
}

// ============================================================
// ABRIR DETALLE
// ============================================================
function openDetail(id) {
  const t = getById(id); if (!t) return;
  currentDetailId = id;
  if (STATE.config.detailMode === 'modal') openDetailModal(t);
  else openDetailExpand(t);
}

function openDetailModal(t) {
  closeAllExpands();
  document.getElementById('detailTitle').textContent = `Trámite #${t.numero}`;
  const esP = esPropio(t);
  document.getElementById('detailSubtitle').textContent = `${t.descripcion} · ${esP?'Propio':abogadoName(t.abogado)} · ${t.modulo}${t.fechaVencimiento?` · Vence: ${formatDate(t.fechaVencimiento)}`:''}`;
  // Guardar el ID en el modal para que _detailAction pueda leerlo aunque currentDetailId cambie
  document.getElementById('detailModal').dataset.id = t.id;
  const body = document.getElementById('detailModalBody');
  body.innerHTML = buildDetailContent(t);
  bindDetailContent(t, body, null);
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
    panel = document.createElement('div'); panel.className = 'expand-panel';
    const inner = document.createElement('div'); inner.className = 'expand-panel-inner';
    const actBar = document.createElement('div'); actBar.className = 'expand-actions';
    actBar.innerHTML = `
      <button class="btn-icon" title="Duplicar" data-action="dup">⧉</button>
      <button class="btn-icon" title="Editar" data-action="edit">✎</button>
      <button class="btn-icon btn-icon-danger" title="Eliminar" data-action="delete">🗑</button>
      <button class="btn-icon modal-close" title="Cerrar" data-action="close">✕</button>`;

    actBar.querySelector('[data-action="dup"]').addEventListener('click', () => {
      const newT = JSON.parse(JSON.stringify(t)); newT.id=genId(); newT.numero=t.numero+'-copia';
      newT.terminado=false; newT.terminadoEn=null; newT.creadoEn=new Date().toISOString(); newT.gestion={analisis:false,cumplimiento:false};
      pushHistory(`Duplicar trámite #${t.numero}`);
      STATE.tramites.push(newT); STATE.order.push(newT.id);
      saveAll(); renderAll(); showToast(`Trámite duplicado como #${newT.numero}.`);
    });
    actBar.querySelector('[data-action="edit"]').addEventListener('click', () => { closeAllExpands(); openModal(t); });
    actBar.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (confirm('¿Eliminar este trámite?')) {
        pushHistory(`Eliminar trámite #${t.numero}`);
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
    bindDetailContent(t, content, wrapper);
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
  document.getElementById('detailModal').dataset.id = '';
  currentDetailId = null;
}

// ============================================================
// CONSTRUIR CARD
// ============================================================
function buildCard(t) {
  const wrapper = document.createElement('div'); wrapper.className = 'card-wrapper'; wrapper.dataset.id = t.id;
  const card = document.createElement('div');
  const esP = esPropio(t);
  card.className = 'tramite-card'+(t.terminado?' finished-card':'')+(esP?' propio-card':'');
  card.dataset.id = t.id; card.draggable = !t.terminado;

  const seg1 = (!esP&&t.gestion?.analisis)?'active-1':'';
  const seg2 = (!esP&&t.gestion?.cumplimiento)?'active-2':'';
  const seg3 = t.terminado?'active-3':'';

  const showVenc = t.fechaVencimiento && !t.gestion?.cumplimiento;
  let vencHtml = '';
  if (showVenc) {
    const vcls = vencClass(t.fechaVencimiento, t);
    const lbl = vcls==='overdue'?'⚠ Vencido':vcls==='today'?'⚠ Hoy':vcls==='soon'?'⏰ Mañana':'📅 Vence';
    const dias = STATE.config.diasRestantes ? diasRestantesNum(t.fechaVencimiento) : null;
    const diasTag = dias !== null ? ` <span class="dias-restantes ${vcls}">${diasRestantesLabel(dias)}</span>` : '';
    vencHtml = `<span class="venc-fecha ${vcls}">${lbl}: ${formatDate(t.fechaVencimiento)}</span>${diasTag}`;
  }

  let responsableTag;
  if (esP) { responsableTag = `<span class="tag tag-propio">👤 Propio</span>`; }
  else { const abColor=abogadoColor(t.abogado),abBg=hexToRgba(abColor,0.12); responsableTag=`<span class="tag tag-abogado" style="background:${abBg};color:${abColor}">${abogadoName(t.abogado)}</span>`; }

  const etapaTag = t.terminado ? `<span class="tag tag-terminado">Terminado</span>` : '';
  const tareasPendientes = (t.seguimiento||[]).filter(s => s.estado==='pendiente');
  // Marcar si tiene tareas urgentes
  const tieneUrgente = tareasPendientes.some(s => s.urgente);
  const urgenteTag = tieneUrgente ? `<span class="tag tag-urgente">🔴 Urgente</span>` : '';
  const seguimientoHtml = buildSeguimientoHtml(tareasPendientes);

  let checksHtml = '';
  if (!t.terminado) {
    if (esP) {
      checksHtml = `<div class="card-checks" id="checks_${t.id}"><label class="round-check-wrap check-terminar" title="Terminar"><input type="checkbox" class="card-check-terminar"/><div class="round-check-box"></div><span class="check-label-text">Fin</span></label></div>`;
    } else {
      checksHtml = `<div class="card-checks" id="checks_${t.id}">
        <label class="round-check-wrap" title="Análisis"><input type="checkbox" class="card-check-analisis" ${t.gestion?.analisis?'checked':''}/><div class="round-check-box"></div><span class="check-label-text">An.</span></label>
        <label class="round-check-wrap" title="Cumplimiento"><input type="checkbox" class="card-check-cumplimiento" ${t.gestion?.cumplimiento?'checked':''}/><div class="round-check-box"></div><span class="check-label-text">Cu.</span></label>
        <label class="round-check-wrap check-terminar" title="Terminar"><input type="checkbox" class="card-check-terminar"/><div class="round-check-box"></div><span class="check-label-text">Fin</span></label>
      </div>`;
    }
  }

  card.innerHTML = `
    <div class="card-progress-bar"><div class="progress-segment ${seg1}"></div><div class="progress-segment ${seg2}"></div><div class="progress-segment ${seg3}"></div></div>
    <div class="card-body">
      ${checksHtml}
      <div class="card-info">
        <div class="card-top-row">
          <span class="card-numero">#${t.numero}</span>
          <span class="tag tag-modulo">${t.modulo}</span>
          ${responsableTag}${etapaTag}${urgenteTag}
        </div>
        <div class="card-desc">${escapeHtml(t.descripcion||'(sin descripción)')}</div>
        <div class="card-dates">${vencHtml}</div>
        ${seguimientoHtml}
      </div>
    </div>`;

  if (!t.terminado) {
    const tareaRow = document.createElement('div'); tareaRow.className = 'card-nueva-tarea-row';
    const btnTarea = document.createElement('button'); btnTarea.className = 'btn-card-tarea'; btnTarea.textContent = '＋ Nueva tarea';
    tareaRow.appendChild(btnTarea); card.appendChild(tareaRow);
    btnTarea.addEventListener('click', e => {
      e.stopPropagation(); openDetail(t.id);
      setTimeout(() => { const pid=`det_${t.id}`; const form=document.getElementById(`${pid}_formNuevaTarea`); if(form){form.style.display='block';setTimeout(()=>document.getElementById(`${pid}_newActDesc`)?.focus(),80);} }, 380);
    });
  }

  card.addEventListener('click', e => { if (e.target.closest('.card-checks')||e.target.closest('.card-nueva-tarea-row')) return; openDetail(t.id); });

  if (!t.terminado) {
    const cc = card.querySelector(`#checks_${t.id}`);
    cc.addEventListener('click', e => e.stopPropagation());
    if (!esP) {
      card.querySelector('.card-check-analisis').addEventListener('change', e => { pushHistory(e.target.checked?'Marcar análisis':'Desmarcar análisis'); t.gestion.analisis=e.target.checked; saveAll(); renderAll(); });
      card.querySelector('.card-check-cumplimiento').addEventListener('change', e => { pushHistory(e.target.checked?'Marcar cumplimiento':'Desmarcar cumplimiento'); t.gestion.cumplimiento=e.target.checked; if(e.target.checked){crearTareaRequerimiento(t);showToast('✓ Cumplimiento marcado. Tarea automática creada.');} saveAll(); renderAll(); });
    }
    card.querySelector('.card-check-terminar').addEventListener('change', e => {
      if (!e.target.checked) return; e.target.checked=false;
      if (!confirm('¿Marcar este trámite como terminado?')) return;
      pushHistory('Terminar trámite'); t.terminado=true; t.terminadoEn=new Date().toISOString(); saveAll(); renderAll(); showToast('Trámite terminado. ✓');
    });
    attachDragEvents(card, wrapper);
  }
  wrapper.appendChild(card);
  return wrapper;
}

// ============================================================
// DRAG & DROP
// ============================================================
let dragSrcId = null;
function attachDragEvents(card, wrapper) {
  card.addEventListener('dragstart', e => { dragSrcId=wrapper.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
  card.addEventListener('dragend',   () => { card.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over')); });
  card.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; if(wrapper.dataset.id!==dragSrcId)card.classList.add('drag-over'); });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); card.classList.remove('drag-over'); if(dragSrcId&&dragSrcId!==wrapper.dataset.id)reorder(dragSrcId,wrapper.dataset.id); });
}
function reorder(srcId, targetId) {
  const order=getActiveOrder(); const si=order.indexOf(srcId),ti=order.indexOf(targetId); if(si===-1||ti===-1)return;
  pushHistory('Reordenar tarjetas'); order.splice(si,1); order.splice(ti,0,srcId); STATE.order=order; saveAll(); renderAll();
}
function getActiveOrder() {
  const activeIds=STATE.tramites.filter(t=>!t.terminado).map(t=>t.id);
  return [...STATE.order.filter(id=>activeIds.includes(id)), ...activeIds.filter(id=>!STATE.order.includes(id))];
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
    if (f.tipo      && t.tipo !== f.tipo) return false;
    if (f.abogado   && t.abogado !== f.abogado) return false;
    if (f.modulo    && t.modulo !== f.modulo) return false;
    if (f.responsable) { if (!(t.seguimiento||[]).some(s => s.responsable === f.responsable)) return false; }
    if (f.etapa && computeEtapa(t) !== f.etapa) return false;
    if (f.search) {
      const q = f.search;
      const enNumero = (t.numero||'').toString().toLowerCase().includes(q);
      const enDesc   = (t.descripcion||'').toLowerCase().includes(q);
      const enTareas = (t.seguimiento||[]).some(s => (s.descripcion||'').toLowerCase().includes(q));
      const enNotas  = (t.notas||[]).some(n => (n.texto||'').toLowerCase().includes(q));
      if (!enNumero && !enDesc && !enTareas && !enNotas) return false;
    }
    return true;
  });
}

function renderList(container, emptyEl, list) {
  container.innerHTML = '';
  if (!list.length) { emptyEl.classList.add('visible'); return; }
  emptyEl.classList.remove('visible');
  const cols = STATE.config.columns || 1;
  const colDivs = Array.from({ length: cols }, () => { const col=document.createElement('div'); col.className='tramite-col'; container.appendChild(col); return col; });
  list.forEach((t, i) => colDivs[i % cols].appendChild(buildCard(t)));
}

function renderAll() {
  const f = getFilters();
  const actives = STATE.tramites.filter(t => !t.terminado);
  const sorted  = sortActives(actives);
  renderList(document.getElementById('tramiteList'), document.getElementById('emptyAll'), applyFilters(sorted, f));
  const urgentes = applyFilters(sorted.filter(tr => esHoyOVencido(tr)), f);
  renderList(document.getElementById('todayList'), document.getElementById('emptyToday'), urgentes);
  const badge = document.getElementById('todayBadge'); badge.textContent = urgentes.length; badge.classList.toggle('hidden', urgentes.length === 0);
  renderList(document.getElementById('finishedList'), document.getElementById('emptyFinished'), STATE.tramites.filter(t => t.terminado));
  if (currentView === 'calendar') renderCalendar();
}

// ============================================================
// VISTA CALENDARIO
// ============================================================
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth(); // 0-based

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DIAS_SEM = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function renderCalendar() {
  document.getElementById('calMonthTitle').textContent = `${MESES[calMonth]} ${calYear}`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = '';

  const primerDia = new Date(calYear, calMonth, 1);
  const ultimoDia = new Date(calYear, calMonth + 1, 0);
  // ISO: lunes=0 … domingo=6
  let startDow = primerDia.getDay() - 1; if (startDow < 0) startDow = 6;
  const totalCells = startDow + ultimoDia.getDate();
  const rows = Math.ceil(totalCells / 7);

  // Construir mapa de eventos por fecha
  const eventMap = {}; // 'YYYY-MM-DD' → [{tipo, t, desc}]
  const hoy = today();
  STATE.tramites.filter(t => !t.terminado).forEach(t => {
    if (t.fechaVencimiento && !t.gestion?.cumplimiento) {
      const k = t.fechaVencimiento;
      if (!eventMap[k]) eventMap[k] = [];
      eventMap[k].push({ tipo: 'venc', t, desc: `#${t.numero} ${t.descripcion}` });
    }
    (t.seguimiento||[]).filter(s => s.estado==='pendiente' && s.fecha).forEach(s => {
      const k = s.fecha;
      if (!eventMap[k]) eventMap[k] = [];
      eventMap[k].push({ tipo: 'tarea', t, desc: `#${t.numero} ${s.descripcion}`, urgente: s.urgente });
    });
  });

  for (let r = 0; r < rows; r++) {
    const row = document.createElement('div'); row.className = 'cal-row';
    for (let c = 0; c < 7; c++) {
      const cellIdx = r * 7 + c;
      const dayNum  = cellIdx - startDow + 1;
      const cell = document.createElement('div');
      if (dayNum < 1 || dayNum > ultimoDia.getDate()) {
        cell.className = 'cal-cell cal-cell-empty'; row.appendChild(cell); continue;
      }
      const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      const isHoy = dateStr === hoy;
      cell.className = 'cal-cell' + (isHoy ? ' cal-today' : '');
      const dayLabel = document.createElement('div'); dayLabel.className = 'cal-day-num' + (isHoy?' cal-day-today':''); dayLabel.textContent = dayNum;
      cell.appendChild(dayLabel);

      const events = eventMap[dateStr] || [];
      const maxShow = 3;
      events.slice(0, maxShow).forEach(ev => {
        const dot = document.createElement('div');
        const dc = dateClass(dateStr);
        const cls = ev.tipo === 'venc' ? (dc || 'upcoming') : 'tarea';
        dot.className = 'cal-event-dot ' + cls + (ev.urgente?' cal-urg':'');
        dot.textContent = ev.desc.length > 22 ? ev.desc.slice(0,21)+'…' : ev.desc;
        dot.title = ev.desc;
        dot.addEventListener('click', e => { e.stopPropagation(); openDetail(ev.t.id); });
        cell.appendChild(dot);
      });
      if (events.length > maxShow) {
        const more = document.createElement('div'); more.className = 'cal-event-more'; more.textContent = `+${events.length - maxShow} más`;
        cell.appendChild(more);
      }
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
}

// ============================================================
// REPORTE
// ============================================================
let reportFiltroAbogado = '';

function openReport() {
  document.getElementById('reportSubtitle').textContent = `Generado el ${formatDate(today())}`;
  updateAbogadoNames(); renderReport();
  document.getElementById('reportOverlay').classList.add('open');
}
function closeReport() { document.getElementById('reportOverlay').classList.remove('open'); }

function renderReport() {
  const hoy = today();
  const contenido = document.getElementById('reportContent'); contenido.innerHTML = '';
  const filtro = reportFiltroAbogado;
  const items = [];

  STATE.tramites.filter(t => !t.terminado).forEach(t => {
    const abTramite = t.abogado || null, esP = esPropio(t);
    if (t.fechaVencimiento && !t.gestion?.cumplimiento && t.fechaVencimiento <= hoy) {
      const dueño = esP?'yo':abTramite;
      if (!filtro || filtro === dueño) items.push({ t, tipo:'vencimiento', fecha:t.fechaVencimiento, cls:t.fechaVencimiento<hoy?'overdue':'today', tarea:`Fecha de vencimiento: ${formatDate(t.fechaVencimiento)}`, resp:dueño, urgente:false });
    }
    if (!esP && !t.gestion?.analisis) {
      const dueño = abTramite;
      if (!filtro || filtro === dueño) items.push({ t, tipo:'analisis', fecha:t.fechaVencimiento||'', cls:'today', tarea:'Falta realizar análisis', resp:dueño, urgente:false });
    }
    (t.seguimiento||[]).filter(s => s.estado==='pendiente' && s.fecha && s.fecha<=hoy).forEach(s => {
      const respTarea = s.responsable||'yo', esYo=(respTarea==='yo');
      const mostrar = !filtro || (esYo&&filtro==='yo') || (!esYo&&filtro===respTarea);
      if (mostrar) items.push({ t, tipo:'tarea', fecha:s.fecha, cls:s.fecha<hoy?'overdue':'today', tarea:s.descripcion, resp:respTarea, urgente:!!(s.urgente) });
    });
  });

  if (!items.length) { contenido.innerHTML = '<div class="report-empty">🎉 ¡Sin novedades para hoy!</div>'; return; }

  // Ordenar: urgentes primero, luego vencidos, luego por fecha
  items.sort((a,b) => {
    if (a.urgente && !b.urgente) return -1;
    if (!a.urgente && b.urgente) return 1;
    if (a.cls !== b.cls) return a.cls==='overdue'?-1:1;
    return (a.fecha||'').localeCompare(b.fecha||'');
  });

  const tipoLabel = { vencimiento:'📅 Vencimiento', tarea:'📌 Tarea', analisis:'🔍 Análisis pendiente' };
  const renderGroup = (titulo, groupItems, titleCls) => {
    if (!groupItems.length) return;
    const sec = document.createElement('div'); sec.className = 'report-section';
    sec.innerHTML = `<div class="report-section-title ${titleCls}">${titulo} (${groupItems.length})</div>`;
    groupItems.forEach(item => {
      const el = document.createElement('div'); el.className = `report-item ${item.cls}${item.urgente?' report-urgente':''}`;
      el.innerHTML = `<div class="report-item-num">${item.urgente?'🔴 ':''}#${item.t.numero}</div>
        <div class="report-item-body">
          <div class="report-item-desc">${escapeHtml(item.t.descripcion)}</div>
          <div class="report-item-tarea"><span class="tarea-label">${tipoLabel[item.tipo]||'📌'} — ${escapeHtml(item.tarea)}</span></div>
          <div class="report-item-meta"><span class="report-item-resp">${item.t.modulo||''}</span>${item.resp?`<span class="report-item-resp">${abogadoName(item.resp)}</span>`:''}</div>
        </div>`;
      sec.appendChild(el);
    });
    contenido.appendChild(sec);
  };

  const urgentes  = items.filter(i => i.urgente);
  const vencidos  = items.filter(i => !i.urgente && i.cls==='overdue');
  const deHoy     = items.filter(i => !i.urgente && i.cls!=='overdue');
  if (urgentes.length) renderGroup('🔴 Urgentes', urgentes, 'danger');
  renderGroup('⚠ Vencidos / Atrasados', vencidos, 'danger');
  renderGroup('📅 Para hoy', deHoy, 'warning');
}

function buildReportTextPlain() {
  let text = `TAREAS PARA HOY — ${formatDate(today())}\n${'='.repeat(25)}\n\n`;
  const items = document.querySelectorAll('#reportContent .report-item');
  if (!items.length) { text += 'Sin novedades para hoy.\n'; return text; }
  items.forEach(el => {
    const num=el.querySelector('.report-item-num')?.textContent||'', desc=el.querySelector('.report-item-desc')?.textContent||'', tarea=el.querySelector('.tarea-label')?.textContent||'';
    text += `${num} — ${desc}\n  ${tarea}\n\n`;
  });
  return text;
}

// ============================================================
// MODAL TRÁMITE
// ============================================================
let modalTipoActual = 'abogado';
function setModalTipo(tipo) {
  modalTipoActual = tipo;
  document.getElementById('tipoBtnAbogado').classList.toggle('active', tipo==='abogado');
  document.getElementById('tipoBtnPropio').classList.toggle('active', tipo==='propio');
  document.getElementById('fAbogadoWrap').style.display = tipo==='abogado' ? '' : 'none';
  syncTareaRespSelect();
}
function syncTareaRespSelect() {
  const sel = document.getElementById('fTareaResp'); if (!sel) return;
  sel.innerHTML = buildRespOptions(modalTipoActual, document.getElementById('fAbogado').value||'abogado1', null);
}
function openModal(tramite = null) {
  isEditing = !!tramite; editingId = tramite ? tramite.id : null;
  document.getElementById('modalTitle').textContent  = isEditing ? 'Editar trámite' : 'Nuevo trámite';
  document.getElementById('fNumero').value           = tramite?.numero || '';
  document.getElementById('fDescripcion').value      = tramite?.descripcion || '';
  document.getElementById('fModulo').value           = tramite?.modulo || STATE.config.modulos[0]?.sigla || '';
  const abogadoSelect = document.getElementById('fAbogado');
  const abKey = tramite?.abogado || (STATE.config.abogados[0]?.key || 'abogado1');
  abogadoSelect.value = ([...abogadoSelect.options].some(o=>o.value===abKey)) ? abKey : (abogadoSelect.options[0]?.value||'');
  document.getElementById('fFechaVencimiento').value = tramite?.fechaVencimiento || '';
  setModalTipo(tramite?.tipo || 'abogado');
  document.getElementById('nuevaTareaFieldsModal').style.display = 'none';
  document.getElementById('nuevaNotaFieldsModal').style.display  = 'none';
  document.getElementById('fTareaDesc').value = '';
  document.getElementById('fTareaFecha').value = '';
  document.getElementById('fNota').value = '';
  syncTareaRespSelect();
  document.getElementById('modalOverlay').classList.add('open');
  setTimeout(() => document.getElementById('fNumero')?.focus(), 120);
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  const m = document.getElementById('tramiteModal'); m.classList.remove('draggable-active','is-dragging'); m.style.left=''; m.style.top='';
}
function saveTramite() {
  const numero  = document.getElementById('fNumero').value.trim();
  const desc    = sentenceCase(document.getElementById('fDescripcion').value.trim());
  const modulo  = document.getElementById('fModulo').value;
  const tipo    = modalTipoActual;
  const abogado = tipo==='abogado' ? document.getElementById('fAbogado').value : null;
  const venc    = document.getElementById('fFechaVencimiento').value;
  if (!numero||!desc||!modulo) { showToast('Completa: número, descripción y módulo.'); return; }
  if (tipo==='abogado'&&!venc) { showToast('Completa la fecha de vencimiento.'); return; }
  const tareaDesc=document.getElementById('fTareaDesc').value.trim(), tareaFecha=document.getElementById('fTareaFecha').value, tareaResp=document.getElementById('fTareaResp').value;
  const notaTexto=document.getElementById('fNota').value.trim();
  const tareaInicial = tareaDesc ? [{descripcion:sentenceCase(tareaDesc),fecha:tareaFecha,responsable:tareaResp,estado:'pendiente',urgente:false}] : [];
  const notaInicial  = notaTexto ? [{texto:sentenceCase(notaTexto),fecha:new Date().toISOString()}] : [];
  if (isEditing) {
    const t = getById(editingId);
    if (!t) { showToast('Error: no se encontró el trámite a editar.'); return; }
    pushHistory(`Editar trámite #${numero}`);
    Object.assign(t, { numero, descripcion:desc, modulo, tipo, fechaVencimiento:venc });
    if (tipo==='abogado') t.abogado=abogado; else delete t.abogado;
    if (tareaInicial.length) t.seguimiento.unshift(...tareaInicial);
    if (notaInicial.length)  t.notas.push(...notaInicial);
    showToast('Trámite actualizado.');
  } else {
    pushHistory(`Crear trámite #${numero}`);
    const newT = { id:genId(), numero, descripcion:desc, modulo, tipo, fechaVencimiento:venc, gestion:{analisis:false,cumplimiento:false}, seguimiento:tareaInicial, notas:notaInicial, terminado:false, terminadoEn:null, creadoEn:new Date().toISOString() };
    if (tipo==='abogado') newT.abogado=abogado;
    STATE.tramites.push(newT); STATE.order.push(newT.id);
    showToast('Trámite creado.');
  }
  saveAll(); renderAll(); closeModal();
}

// ============================================================
// CONFIGURACIÓN
// ============================================================
function renderConfig() {
  renderAbogadosList();
  const cb1=document.getElementById('colorBar1'); if(cb1) cb1.value=STATE.config.colorBar1||'#f59e0b';
  const cb2=document.getElementById('colorBar2'); if(cb2) cb2.value=STATE.config.colorBar2||'#3b5bdb';
  const cb3=document.getElementById('colorBar3'); if(cb3) cb3.value=STATE.config.colorBar3||'#10b981';
  updateBarPreviews(); setDetailMode(STATE.config.detailMode||'expand'); renderModulosList(); renderThemeGrid();
  const arToggle=document.getElementById('autoReqToggle'); if(arToggle) arToggle.checked=STATE.config.autoReq!==false;
  const arTexto=document.getElementById('autoReqTexto');   if(arTexto) arTexto.value=STATE.config.autoReqTexto||'1er req';
  const arDias=document.getElementById('autoReqDias');     if(arDias)  arDias.value=STATE.config.autoReqDias??7;
  syncAutoReqFields();
  const drToggle = document.getElementById('diasRestantesToggle'); if(drToggle) drToggle.checked = !!(STATE.config.diasRestantes);
}

function renderAbogadosList() {
  const list=document.getElementById('abogadosList'); if(!list) return; list.innerHTML='';
  (STATE.config.abogados||[]).forEach((a,i) => {
    const row=document.createElement('div'); row.className='abogado-config-row';
    const canDelete=(STATE.config.abogados||[]).length>1;
    row.innerHTML=`<span class="abogado-num">${i+1}.</span><input type="text" class="ab-nombre" value="${escapeAttr(a.nombre)}" placeholder="Nombre"/><input type="color" class="color-picker ab-color" value="${a.color}" title="Color"/><span class="color-preview ab-preview" style="background:${a.color}"></span><button class="btn-icon btn-icon-danger ab-delete" title="Eliminar" ${canDelete?'':'disabled style="opacity:.3;cursor:default"'}>✕</button>`;
    row.querySelector('.ab-color').addEventListener('input', e => row.querySelector('.ab-preview').style.background=e.target.value);
    if (canDelete) row.querySelector('.ab-delete').addEventListener('click', async () => {
      const ok=await showConfirm(`¿Eliminar al abogado "${a.nombre}"?\nLos trámites asignados quedarán sin abogado.`);
      if(ok){STATE.config.abogados.splice(i,1);saveAll();applyCssColors();updateAbogadoSelects();renderAbogadosList();renderAll();showToast('Abogado eliminado.');}
    });
    list.appendChild(row);
  });
}
function syncAutoReqFields() {
  const on=document.getElementById('autoReqToggle')?.checked, fields=document.getElementById('autoReqFields');
  if(fields){fields.style.opacity=on?'1':'0.4';fields.style.pointerEvents=on?'':'none';}
}
function renderThemeGrid() {
  const grid=document.getElementById('themeGrid'); if(!grid) return; grid.innerHTML='';
  THEMES.forEach(theme => {
    const card=document.createElement('div'); card.className='theme-card'+(STATE.config.theme===theme.id?' active':''); card.dataset.theme=theme.id;
    card.innerHTML=`<div class="theme-swatch">${theme.swatches.map(c=>`<div class="theme-swatch-part" style="background:${c}"></div>`).join('')}</div><div class="theme-name">${theme.nombre}</div>`;
    card.addEventListener('click', () => { applyTheme(theme.id); saveAll(); renderThemeGrid(); });
    grid.appendChild(card);
  });
}
function updateBarPreviews() { [1,2,3].forEach(n=>{const p=document.getElementById(`colorBar${n}`),prev=document.getElementById(`barPreview${n}`);if(p&&prev)prev.style.background=p.value;}); }
function renderModulosList() {
  const list=document.getElementById('modulosList'); if(!list) return; list.innerHTML='';
  STATE.config.modulos.forEach((m,i)=>{
    const row=document.createElement('div');row.className='modulo-row';row.innerHTML=`<span class="modulo-sigla">${m.sigla}</span><span class="modulo-nombre">${m.nombre}</span><button class="modulo-delete">✕</button>`;
    row.querySelector('.modulo-delete').addEventListener('click',()=>{if(confirm(`¿Eliminar módulo ${m.sigla}?`)){STATE.config.modulos.splice(i,1);saveAll();populateModuloSelects();renderModulosList();}});
    list.appendChild(row);
  });
}

// ============================================================
// EXPORT / IMPORT
// ============================================================
function exportData() {
  const blob=new Blob([JSON.stringify({tramites:STATE.tramites,order:STATE.order,config:STATE.config},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`juritask_${today()}.json`;a.click();URL.revokeObjectURL(url);showToast('Datos exportados.');
}
function importData(file) {
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const data=JSON.parse(e.target.result);
      if(data.tramites) STATE.tramites=data.tramites;
      if(data.order)    STATE.order=data.order;
      if(data.config){
        STATE.config=Object.assign({...DEFAULT_CONFIG,abogados:DEFAULT_CONFIG.abogados.map(a=>({...a})),modulos:[...DEFAULT_CONFIG.modulos]},data.config);
        if(!STATE.config.abogados?.length) STATE.config.abogados=[{key:'abogado1',nombre:data.config.abogado1||'Abogado 1',color:data.config.colorAbogado1||'#15803d'},{key:'abogado2',nombre:data.config.abogado2||'Abogado 2',color:data.config.colorAbogado2||'#1d4ed8'}];
      }
      STATE.tramites.forEach(migrateTramite);
      saveAll();applyCssColors();applyTheme(STATE.config.theme||'claro');
      populateModuloSelects();updateAbogadoSelects();
      const ds=document.getElementById('sortSelect');if(ds)ds.value=STATE.config.sortBy||'vencimiento';
      renderAll();showToast('Datos importados.');
    } catch { showToast('Error al importar. Verifica el archivo JSON.'); }
  };
  reader.readAsText(file);
}

// ============================================================
// SIDEBAR
// ============================================================
function isMobile() { return window.innerWidth <= 768; }
const backdropEl=document.createElement('div'); backdropEl.className='sidebar-backdrop'; document.body.appendChild(backdropEl);
function openSidebar()  { if(isMobile()){document.getElementById('sidebar').classList.add('open');backdropEl.classList.add('show');} else {document.getElementById('sidebar').classList.remove('collapsed');document.querySelector('.app-layout').classList.remove('expanded');} }
function closeSidebar() { if(isMobile()){document.getElementById('sidebar').classList.remove('open');backdropEl.classList.remove('show');} else {document.getElementById('sidebar').classList.add('collapsed');document.querySelector('.app-layout').classList.add('expanded');} }
function toggleSidebar() { if(isMobile())document.getElementById('sidebar').classList.contains('open')?closeSidebar():openSidebar(); else document.getElementById('sidebar').classList.contains('collapsed')?openSidebar():closeSidebar(); }
function setupContainerDrop(container) {
  container.addEventListener('dragover',e=>e.preventDefault());
  container.addEventListener('drop',e=>{e.preventDefault();if(e.target===container&&dragSrcId){const order=getActiveOrder();const si=order.indexOf(dragSrcId);if(si!==-1){order.splice(si,1);order.push(dragSrcId);STATE.order=order;saveAll();renderAll();}}});
}
function openMobSheet()  { document.getElementById('mobSheet').classList.add('open');document.getElementById('mobSheetOverlay').classList.add('show'); }
function closeMobSheet() { document.getElementById('mobSheet').classList.remove('open');document.getElementById('mobSheetOverlay').classList.remove('show'); }

// ============================================================
// MODAL DRAGGABLE
// ============================================================
function initDraggableModal(modalEl) {
  const header=modalEl.querySelector('.modal-header'); if(!header) return;
  let dragging=false,startX,startY,origLeft,origTop;
  header.addEventListener('mousedown',e=>{
    if(e.target.closest('button')||isMobile()) return;
    dragging=true;
    if(!modalEl.classList.contains('draggable-active')){const rect=modalEl.getBoundingClientRect();modalEl.style.left=rect.left+'px';modalEl.style.top=rect.top+'px';modalEl.classList.add('draggable-active');}
    origLeft=parseFloat(modalEl.style.left)||0;origTop=parseFloat(modalEl.style.top)||0;startX=e.clientX;startY=e.clientY;
    header.classList.add('is-dragging');modalEl.classList.add('is-dragging');e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{if(!dragging)return;const m=8;let l=origLeft+(e.clientX-startX),t2=origTop+(e.clientY-startY);l=Math.max(m,Math.min(l,window.innerWidth-modalEl.offsetWidth-m));t2=Math.max(m,Math.min(t2,window.innerHeight-modalEl.offsetHeight-m));modalEl.style.left=l+'px';modalEl.style.top=t2+'px';});
  document.addEventListener('mouseup',()=>{if(!dragging)return;dragging=false;header.classList.remove('is-dragging');modalEl.classList.remove('is-dragging');});
}

// ============================================================
// VISTAS
// ============================================================
let currentView = 'all';
function switchView(view) {
  currentView = view;
  closeAllExpands();
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById(`view-${view}`)?.classList.add('active');
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  const titles={all:'Todos los trámites',today:'Hoy / Vencidos',calendar:'Calendario',finished:'Terminados',config:'Configuración'};
  document.getElementById('topbarTitle').textContent = titles[view]||'';
  const isConfig = view==='config', isCal = view==='calendar';
  document.getElementById('sidebarFilters').style.display = isConfig?'none':'';
  document.getElementById('colSwitcher').style.display    = (isConfig||isCal)?'none':'';
  document.getElementById('sortWrap').style.display       = (isConfig||isCal)?'none':'';
  document.getElementById('mobOptsBtn').style.display     = (isConfig||isCal)?'none':'';
  document.getElementById('reportBtn').style.display      = isConfig?'none':'';
  if (isConfig) renderConfig();
  else if (isCal) renderCalendar();
  else renderAll();
}

// ============================================================
// ESCAPE HELPERS
// ============================================================
function escapeHtml(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }
function escapeAttr(str) { return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function formatDatetime(iso) { try { return new Date(iso).toLocaleString('es-CO',{dateStyle:'short',timeStyle:'short'}); } catch { return iso; } }

// ============================================================
// INIT
// ============================================================
function init() {
  loadAll(); purgeExpiredFinished(); applyCssColors(); applyTheme(STATE.config.theme||'claro');
  populateModuloSelects(); updateAbogadoNames();
  const sortVal=STATE.config.sortBy||'vencimiento';
  const ds=document.getElementById('sortSelect');if(ds)ds.value=sortVal;
  const ms=document.getElementById('sortSelectMob');if(ms)ms.value=sortVal;
  const initCols=STATE.config.columns||1;
  document.querySelectorAll('.col-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.cols)===initCols));
  document.querySelectorAll('.mob-col-btn').forEach(b=>b.classList.toggle('active',parseInt(b.dataset.cols)===initCols));
  setDetailMode(STATE.config.detailMode||'expand');
  if (isMobile()) closeSidebar();
  renderAll();
  setupContainerDrop(document.getElementById('tramiteList'));

  // Confirm dialog
  document.getElementById('confirmOk').addEventListener('click', ()=>_confirmClose(true));
  document.getElementById('confirmCancel').addEventListener('click', ()=>_confirmClose(false));
  document.getElementById('confirmOverlay').addEventListener('click', e=>{if(e.target===document.getElementById('confirmOverlay'))_confirmClose(false);});

  // Navegación
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{switchView(btn.dataset.view);if(isMobile())closeSidebar();}));

  // Sidebar
  document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarToggle').addEventListener('click', closeSidebar);
  backdropEl.addEventListener('click', closeSidebar);

  // Nuevo trámite
  document.getElementById('newTramiteBtn').addEventListener('click', ()=>openModal());
  document.getElementById('tipoBtnAbogado').addEventListener('click', ()=>setModalTipo('abogado'));
  document.getElementById('tipoBtnPropio').addEventListener('click',  ()=>setModalTipo('propio'));
  document.getElementById('fAbogado').addEventListener('change', syncTareaRespSelect);
  document.getElementById('btnMostrarTareaModal').addEventListener('click', ()=>{const f=document.getElementById('nuevaTareaFieldsModal');const o=f.style.display!=='none';f.style.display=o?'none':'block';if(!o)setTimeout(()=>document.getElementById('fTareaDesc')?.focus(),60);});
  document.getElementById('btnMostrarNotaModal').addEventListener('click', ()=>{const f=document.getElementById('nuevaNotaFieldsModal');const o=f.style.display!=='none';f.style.display=o?'none':'block';if(!o)setTimeout(()=>document.getElementById('fNota')?.focus(),60);});

  // Columnas / sort
  document.querySelectorAll('.col-btn').forEach(btn=>btn.addEventListener('click',()=>setColumns(parseInt(btn.dataset.cols))));
  document.getElementById('sortSelect').addEventListener('change',e=>setSortBy(e.target.value));

  // Bottom sheet
  document.getElementById('mobOptsBtn').addEventListener('click', openMobSheet);
  document.getElementById('mobSheetOverlay').addEventListener('click', closeMobSheet);
  document.getElementById('sortSelectMob').addEventListener('change',e=>{setSortBy(e.target.value);closeMobSheet();});
  document.querySelectorAll('.mob-col-btn').forEach(btn=>btn.addEventListener('click',()=>{setColumns(parseInt(btn.dataset.cols));closeMobSheet();}));

  // Modal trámite
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('saveTramite').addEventListener('click', saveTramite);
  document.getElementById('modalOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('modalOverlay'))closeModal();});
  initDraggableModal(document.getElementById('tramiteModal'));

  // Modal detalle — el overlay cierra al click en fondo
  // Los botones editar/eliminar usan onclick directo (_detailAction) en el HTML
  document.getElementById('detailOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('detailOverlay'))closeDetail();});

  // Filtros
  ['filterTipo','filterAbogado','filterModulo','filterResponsable','filterEtapa'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderAll));
  document.getElementById('searchInput').addEventListener('input', renderAll);
  document.getElementById('clearFilters').addEventListener('click',()=>{
    ['filterTipo','filterAbogado','filterModulo','filterResponsable','filterEtapa'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    document.getElementById('searchInput').value=''; renderAll();
  });

  // Export/Import
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', ()=>document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change',e=>{if(e.target.files[0]){importData(e.target.files[0]);e.target.value='';}});

  // Config: modo detalle
  document.getElementById('modeExpand').addEventListener('click', ()=>setDetailMode('expand'));
  document.getElementById('modeModal').addEventListener('click',  ()=>setDetailMode('modal'));

  // Config: días restantes
  document.getElementById('diasRestantesToggle').addEventListener('change',e=>{STATE.config.diasRestantes=e.target.checked;saveAll();renderAll();});

  // Config: abogados
  document.getElementById('saveAbogadosBtn').addEventListener('click',()=>{
    const rows=document.querySelectorAll('#abogadosList .abogado-config-row'); let valid=true;
    rows.forEach((row,i)=>{const nombre=row.querySelector('.ab-nombre').value.trim(),color=row.querySelector('.ab-color').value;if(!nombre){valid=false;return;}if(STATE.config.abogados[i]){STATE.config.abogados[i].nombre=sentenceCase(nombre);STATE.config.abogados[i].color=color;}});
    if(!valid){showToast('Los nombres no pueden estar vacíos.');return;}
    saveAll();applyCssColors();updateAbogadoSelects();renderAbogadosList();renderAll();showToast('Abogados guardados.');
  });
  document.getElementById('addAbogadoBtn').addEventListener('click',()=>{
    const inp=document.getElementById('newAbNombre'),nombre=inp.value.trim();if(!nombre){showToast('Escribe el nombre del nuevo abogado.');return;}
    const colors=['#15803d','#1d4ed8','#9333ea','#c2410c','#0891b2','#be123c','#854d0e'],color=colors[(STATE.config.abogados||[]).length%colors.length];
    STATE.config.abogados=STATE.config.abogados||[];STATE.config.abogados.push({key:'abogado_'+Date.now(),nombre:sentenceCase(nombre),color});inp.value='';
    saveAll();applyCssColors();updateAbogadoSelects();renderAbogadosList();showToast(`"${nombre}" añadido.`);
  });

  // Config: colores barra
  [1,2,3].forEach(n=>document.getElementById(`colorBar${n}`).addEventListener('input',updateBarPreviews));
  document.getElementById('saveBarColorsBtn').addEventListener('click',()=>{STATE.config.colorBar1=document.getElementById('colorBar1').value;STATE.config.colorBar2=document.getElementById('colorBar2').value;STATE.config.colorBar3=document.getElementById('colorBar3').value;saveAll();applyCssColors();showToast('Colores guardados.');});
  document.getElementById('resetBarColorsBtn').addEventListener('click',()=>{STATE.config.colorBar1=DEFAULT_CONFIG.colorBar1;STATE.config.colorBar2=DEFAULT_CONFIG.colorBar2;STATE.config.colorBar3=DEFAULT_CONFIG.colorBar3;saveAll();applyCssColors();renderConfig();showToast('Colores restablecidos.');});

  // Config: tarea automática
  document.getElementById('autoReqToggle').addEventListener('change',e=>{STATE.config.autoReq=e.target.checked;syncAutoReqFields();saveAll();});
  document.getElementById('saveAutoReqBtn').addEventListener('click',()=>{
    const texto=document.getElementById('autoReqTexto').value.trim(),dias=parseInt(document.getElementById('autoReqDias').value);
    if(!texto){showToast('El texto no puede estar vacío.');return;}if(isNaN(dias)||dias<1||dias>365){showToast('Los días deben estar entre 1 y 365.');return;}
    STATE.config.autoReqTexto=texto;STATE.config.autoReqDias=dias;saveAll();showToast('Configuración guardada.');
  });

  // Config: módulos
  document.getElementById('addModuloBtn').addEventListener('click',()=>{
    const sigla=document.getElementById('newModuloSigla').value.trim().toUpperCase(),nombre=document.getElementById('newModuloNombre').value.trim();
    if(!sigla||!nombre){showToast('Completa sigla y nombre.');return;}if(STATE.config.modulos.find(m=>m.sigla===sigla)){showToast('Ya existe ese módulo.');return;}
    STATE.config.modulos.push({sigla,nombre});document.getElementById('newModuloSigla').value='';document.getElementById('newModuloNombre').value='';
    saveAll();populateModuloSelects();renderModulosList();showToast('Módulo agregado.');
  });

  // Config: borrar todo
  document.getElementById('clearAllBtn').addEventListener('click',()=>{
    if(confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')){
      if(confirm('¿Estás seguro? Se perderán todos los trámites.')){
        Object.values(KEYS).forEach(k=>localStorage.removeItem(k));STATE.tramites=[];STATE.order=[];
        STATE.config={...DEFAULT_CONFIG,abogados:DEFAULT_CONFIG.abogados.map(a=>({...a})),modulos:[...DEFAULT_CONFIG.modulos]};
        applyCssColors();applyTheme('claro');populateModuloSelects();updateAbogadoNames();
        const ds2=document.getElementById('sortSelect');if(ds2)ds2.value='vencimiento';
        renderConfig();renderAll();showToast('Datos borrados.');
      }
    }
  });

  // Reporte
  document.getElementById('reportBtn').addEventListener('click', openReport);
  document.getElementById('reportClose').addEventListener('click', closeReport);
  document.getElementById('reportOverlay').addEventListener('click',e=>{if(e.target===document.getElementById('reportOverlay'))closeReport();});
  document.getElementById('reportFilterGroup').addEventListener('click',e=>{
    const btn=e.target.closest('[data-abogado]');if(!btn)return;
    reportFiltroAbogado=btn.dataset.abogado;
    document.querySelectorAll('#reportFilterGroup .toggle-btn').forEach(b=>b.classList.toggle('active',b===btn));
    renderReport();
  });
  document.getElementById('reportPrintBtn').addEventListener('click',()=>{
    const area=document.getElementById('reportContent');
    const printDiv=document.createElement('div');printDiv.id='reportPrintArea';
    printDiv.innerHTML=`<h2 style="font-size:18px;margin-bottom:4px">Reporte JuriTask — ${formatDate(today())}</h2>`+area.innerHTML;
    document.body.appendChild(printDiv);window.print();document.body.removeChild(printDiv);
  });
  document.getElementById('reportCopyBtn').addEventListener('click',()=>{navigator.clipboard.writeText(buildReportTextPlain()).then(()=>showToast('Reporte copiado.')).catch(()=>showToast('No se pudo copiar.'));});

  // Calendario
  document.getElementById('calPrev').addEventListener('click',()=>{ calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCalendar(); });
  document.getElementById('calNext').addEventListener('click',()=>{ calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCalendar(); });
  document.getElementById('calTodayBtn').addEventListener('click',()=>{ calYear=new Date().getFullYear();calMonth=new Date().getMonth(); renderCalendar(); });

  // ESC + Ctrl+Z
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){
      const active=document.activeElement;
      if(!active||(active.tagName!=='INPUT'&&active.tagName!=='TEXTAREA'&&!active.isContentEditable)){e.preventDefault();undo();return;}
    }
    if(e.key!=='Escape')return;
    if(document.getElementById('confirmOverlay').classList.contains('open')){_confirmClose(false);return;}
    if(document.getElementById('reportOverlay').classList.contains('open'))closeReport();
    else if(document.getElementById('detailOverlay').classList.contains('open'))closeDetail();
    else if(document.getElementById('modalOverlay').classList.contains('open'))closeModal();
    else if(document.getElementById('mobSheet').classList.contains('open'))closeMobSheet();
    else closeAllExpands();
  });
}

document.addEventListener('DOMContentLoaded', init);

/**
 * JuriTask — Script Principal v6
 * Ajustes v6:
 *  1.  Reporte del día (PDF/print, filtro por abogado)
 *  2.  Importar/Exportar movidos a Configuración
 *  3.  Nota inicial en modal de nuevo trámite
 *  4.  Cumplimiento: oculta sección vencimiento en panel, no borra la fecha
 *  5.  Cambiar vista limpia barra de búsqueda
 *  6.  "Auxiliar" y "Propio" unificados como "Yo mismo"
 *  7.  Botón eliminar funciona en modo modal
 *  8.  Nuevo trámite: focus automático en campo número
 *  9.  Nueva tarea: focus automático en campo descripción
 *  10. "Pronto" = mañana solamente (no semana)
 *  11. Marcar tarea realizada no cierra el panel expandido
 *  12. Al marcar cumplimiento: crea tarea "1er req" para misma semana siguiente
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
  autoReq: true,          // Crear tarea automática al marcar cumplimiento
  autoReqTexto: '1er req',
  autoReqDias: 7,
};

// ============================================================
// ESTADO
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

function migrateTramite(t) {
  if (!t.tipo) t.tipo = 'abogado';
  if (!t.seguimiento) t.seguimiento = [];
  if (!t.notas) t.notas = [];
  if (!t.gestion) t.gestion = { analisis: false, cumplimiento: false };
  // Unificar "auxiliar"/"propio" → "yo"
  t.seguimiento.forEach(s => {
    if (s.responsable === 'auxiliar' || s.responsable === 'propio') s.responsable = 'yo';
  });
  // Migrar proximaAccion
  if (t.proximaAccion && t.proximaAccion.descripcion) {
    const resp = t.proximaAccion.responsable;
    t.seguimiento.unshift({
      descripcion: t.proximaAccion.descripcion,
      fecha: t.proximaAccion.fecha || '',
      responsable: (resp === 'auxiliar' || resp === 'propio') ? 'yo' : (resp || 'yo'),
      estado: 'pendiente',
    });
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
    if (c) STATE.config = Object.assign({ ...DEFAULT_CONFIG, modulos: [...DEFAULT_CONFIG.modulos] }, JSON.parse(c));
    STATE.tramites.forEach(migrateTramite);
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

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Clase CSS para coloreado de fechas:
 *  overdue = pasada, today = hoy, soon = MAÑANA exactamente, upcoming = resto */
function dateClass(s) {
  if (!s) return '';
  const hoy = today();
  const man = tomorrow();
  if (s < hoy) return 'overdue';
  if (s === hoy) return 'today';
  if (s === man) return 'soon';
  return 'upcoming';
}

function vencClass(s, tramite) {
  if (!s) return '';
  if (tramite && tramite.gestion && tramite.gestion.cumplimiento) return 'upcoming';
  return dateClass(s);
}

function proximaFechaSeguimiento(t) {
  const pendientes = (t.seguimiento || []).filter(s => s.estado === 'pendiente' && s.fecha);
  if (!pendientes.length) return null;
  return pendientes.map(s => s.fecha).sort()[0];
}

function abogadoName(key) {
  if (key === 'abogado1') return STATE.config.abogado1;
  if (key === 'abogado2') return STATE.config.abogado2;
  // "yo", "auxiliar", "propio" → todos son "Yo mismo"
  return 'Yo mismo';
}

function abogadoColor(key) {
  if (key === 'abogado1') return STATE.config.colorAbogado1 || '#15803d';
  if (key === 'abogado2') return STATE.config.colorAbogado2 || '#1d4ed8';
  return '#9333ea';
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function computeEtapa(t) {
  return (t.gestion && t.gestion.cumplimiento) ? 'seguimiento' : 'gestion';
}

function esPropio(t) { return t.tipo === 'propio'; }

function esHoyOVencido(t) {
  const hoy = today();
  if (t.fechaVencimiento && !(t.gestion && t.gestion.cumplimiento)) {
    if (t.fechaVencimiento <= hoy) return true;
  }
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
// CONFIRM DIALOG PROPIO (evita problemas con backdrop-filter)
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
  ['filterModulo', 'fModulo'].forEach(id => {
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
   ['fAbog1Opt',n1],['fAbog2Opt',n2],
   ['reportBtn1',n1],['reportBtn2',n2]
  ].forEach(([elId, val]) => { const el = document.getElementById(elId); if (el) el.textContent = val; });
}

/** Opciones de responsable: abogadoX + "Yo mismo" */
function buildRespOptions(tipoTramite, abogadoKey, selectedValue) {
  const opts = [];
  if (tipoTramite === 'abogado') {
    opts.push({ value: abogadoKey, label: abogadoName(abogadoKey) });
  }
  opts.push({ value: 'yo', label: 'Yo mismo' });
  return opts.map(o =>
    `<option value="${o.value}" ${o.value === selectedValue ? 'selected' : ''}>${o.label}</option>`
  ).join('');
}

// ============================================================
// COLUMNAS / DETALLE / SORT
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
    const pfa = proximaFechaSeguimiento(a) || FAR;
    const pfb = proximaFechaSeguimiento(b) || FAR;
    let cmp = 0;
    if (sortBy === 'vencimiento') {
      cmp = (a.fechaVencimiento||FAR).localeCompare(b.fechaVencimiento||FAR);
    } else if (sortBy === 'seguimiento') {
      cmp = pfa.localeCompare(pfb);
    } else if (sortBy === 'mixto') {
      const ma = [a.fechaVencimiento, pfa].filter(x=>x!==FAR).sort()[0] || FAR;
      const mb = [b.fechaVencimiento, pfb].filter(x=>x!==FAR).sort()[0] || FAR;
      cmp = ma.localeCompare(mb);
    } else if (sortBy === 'abogado') {
      cmp = abogadoName(a.abogado||'yo').localeCompare(abogadoName(b.abogado||'yo'));
    } else if (sortBy === 'numero') {
      cmp = (parseInt(a.numero)||0) - (parseInt(b.numero)||0);
    }
    if (cmp !== 0) return cmp;
    return manualOrder.indexOf(a.id) - manualOrder.indexOf(b.id);
  });
}

// ============================================================
// TAREA AUTOMÁTICA AL MARCAR CUMPLIMIENTO
// ============================================================
function nDaysFromToday(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function crearTareaRequerimiento(t) {
  if (!STATE.config.autoReq) return;
  const dias  = parseInt(STATE.config.autoReqDias) || 7;
  const texto = (STATE.config.autoReqTexto || '1er req').trim();
  const fecha = nDaysFromToday(dias);
  const yaExiste = t.seguimiento.some(s => s.descripcion === texto && s.fecha === fecha && s.estado === 'pendiente');
  if (!yaExiste) {
    const resp = esPropio(t) ? 'yo' : t.abogado;
    t.seguimiento.unshift({ descripcion: texto, fecha, responsable: resp, estado: 'pendiente' });
  }
}

// ============================================================
// CONTENIDO DE DETALLE (panel expandido y modal)
// ============================================================
function buildDetailContent(t) {
  const esP = esPropio(t);
  const etapa = computeEtapa(t);
  const etapaLabel = etapa === 'seguimiento' ? 'Seguimiento' : 'Gestión';
  const etapaCls   = etapa === 'seguimiento' ? 'seguimiento' : '';
  const p = `det_${t.id}`;
  const hiddenVenc = t.gestion && t.gestion.cumplimiento;

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
          <select id="${p}_newActResp">${buildRespOptions(t.tipo || 'abogado', t.abogado || 'abogado1', t.abogado || 'yo')}</select>
        </div>
        <div class="add-actividad-btns">
          <button class="btn-small" id="${p}_addAct">+ Agregar</button>
          <button class="btn-small" id="${p}_cancelAct" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">Cancelar</button>
        </div>
      </div>
    </div>
    <div class="detail-section detail-vencimiento-section${hiddenVenc ? ' hidden-venc' : ''}" id="${p}_vencSection">
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

function bindDetailContent(t, container, expandWrapper) {
  const p = `det_${t.id}`;
  const esP = esPropio(t);

  if (!esP) {
    container.querySelector(`#${p}_analisis`).addEventListener('change', e => {
      t.gestion.analisis = e.target.checked;
      saveAll();
      // Re-render solo la card (no cierra el panel)
      refreshCardOnly(t);
    });

    container.querySelector(`#${p}_cumplimiento`).addEventListener('change', e => {
      t.gestion.cumplimiento = e.target.checked;
      // Actualizar badge etapa
      const badge = container.querySelector(`#${p}_etapabadge`);
      const etapa = computeEtapa(t);
      if (badge) {
        badge.textContent = etapa==='seguimiento' ? 'Seguimiento' : 'Gestión';
        badge.className = 'etapa-badge' + (etapa==='seguimiento' ? ' seguimiento' : '');
      }
      // Mostrar/ocultar sección vencimiento SIN borrar la fecha
      const vencSec = container.querySelector(`#${p}_vencSection`);
      if (vencSec) vencSec.classList.toggle('hidden-venc', e.target.checked);

      // Ajuste 12: crear tarea "1er req" al marcar cumplimiento
      if (e.target.checked) {
        crearTareaRequerimiento(t);
        // Re-renderizar lista de actividades
        renderActividadesIn(t, container.querySelector(`#${p}_actividades`), container, expandWrapper);
        showToast('✓ Cumplimiento marcado. Tarea "1er req" creada.');
      }

      saveAll();
      refreshCardOnly(t);
    });
  }

  // Seguimiento
  renderActividadesIn(t, container.querySelector(`#${p}_actividades`), container, expandWrapper);

  const btnNueva = container.querySelector(`#${p}_btnNuevaTarea`);
  const formNueva = container.querySelector(`#${p}_formNuevaTarea`);
  btnNueva.addEventListener('click', () => {
    const open = formNueva.style.display !== 'none';
    formNueva.style.display = open ? 'none' : 'block';
    if (!open) {
      // Ajuste 9: focus en campo descripción
      setTimeout(() => container.querySelector(`#${p}_newActDesc`)?.focus(), 60);
    }
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
    saveAll();
    refreshCardOnly(t);
    renderActividadesIn(t, container.querySelector(`#${p}_actividades`), container, expandWrapper);
    showToast('Tarea agregada.');
  });

  // Vencimiento (la fecha NO se borra al ocultar)
  container.querySelector(`#${p}_saveVenc`).addEventListener('click', () => {
    const fecha = container.querySelector(`#${p}_vencimiento`).value;
    if (!fecha) { showToast('Selecciona una fecha.'); return; }
    t.fechaVencimiento = fecha;
    saveAll(); refreshCardOnly(t);
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

/** Refresca solo la tarjeta en el DOM sin cerrar paneles abiertos */
function refreshCardOnly(t) {
  // Actualizar barras de progreso y fechas en la tarjeta visible
  const cards = document.querySelectorAll(`.tramite-card[data-id="${t.id}"]`);
  cards.forEach(card => {
    const segs = card.querySelectorAll('.progress-segment');
    const esP = esPropio(t);
    if (segs[0]) segs[0].className = 'progress-segment' + ((!esP && t.gestion?.analisis) ? ' active-1' : '');
    if (segs[1]) segs[1].className = 'progress-segment' + ((!esP && t.gestion?.cumplimiento) ? ' active-2' : '');
    if (segs[2]) segs[2].className = 'progress-segment' + (t.terminado ? ' active-3' : '');

    // Actualizar fecha vencimiento en tarjeta
    const showVenc = t.fechaVencimiento && !(t.gestion && t.gestion.cumplimiento);
    const datesEl = card.querySelector('.card-dates');
    if (datesEl) {
      if (showVenc) {
        const vcls = vencClass(t.fechaVencimiento, t);
        const lbl = vcls==='overdue' ? '⚠ Vencido' : vcls==='today' ? '⚠ Hoy' : vcls==='soon' ? '⏰ Mañana' : '📅 Vence';
        datesEl.innerHTML = `<span class="venc-fecha ${vcls}">${lbl}: ${formatDate(t.fechaVencimiento)}</span>`;
      } else {
        datesEl.innerHTML = '';
      }
    }

    // Actualizar tareas pendientes en tarjeta
    const segEl = card.querySelector('.card-seguimiento');
    const tareasPendientes = (t.seguimiento || []).filter(s => s.estado === 'pendiente');
    const newSegHtml = buildSeguimientoHtml(tareasPendientes);
    if (segEl) {
      const parent = segEl.parentNode;
      segEl.remove();
      if (newSegHtml && parent) {
        const tmp = document.createElement('div');
        tmp.innerHTML = newSegHtml;
        parent.appendChild(tmp.firstElementChild);
      }
    } else if (newSegHtml) {
      const infoEl = card.querySelector('.card-info');
      if (infoEl) {
        const tmp = document.createElement('div');
        tmp.innerHTML = newSegHtml;
        infoEl.appendChild(tmp.firstElementChild);
      }
    }
  });
}

function buildSeguimientoHtml(tareasPendientes) {
  if (!tareasPendientes.length) return '';
  return `<div class="card-seguimiento">
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
  </div>`;
}

function renderActividadesIn(t, listEl, container, expandWrapper) {
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
      saveAll();
      // Ajuste 11: NO cerrar el panel, solo re-renderizar la lista
      refreshCardOnly(t);
      renderActividadesIn(t, listEl, container, expandWrapper);
    });

    div.querySelector('input[type="date"]').addEventListener('change', e => {
      t.seguimiento[i].fecha = e.target.value;
      saveAll(); refreshCardOnly(t);
    });

    div.querySelector('.actividad-delete').addEventListener('click', () => {
      if (confirm('¿Eliminar esta tarea?')) {
        t.seguimiento.splice(i, 1);
        saveAll(); refreshCardOnly(t);
        renderActividadesIn(t, listEl, container, expandWrapper);
      }
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
      if (confirm('¿Eliminar esta nota?')) { t.notas.splice(idx, 1); saveAll(); renderNotasIn(t, listEl); }
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

  // Vencimiento: ocultar si cumplimiento
  const showVenc = t.fechaVencimiento && !(t.gestion && t.gestion.cumplimiento);
  let vencHtml = '';
  if (showVenc) {
    const vcls = vencClass(t.fechaVencimiento, t);
    const lbl = vcls==='overdue' ? '⚠ Vencido' : vcls==='today' ? '⚠ Hoy' : vcls==='soon' ? '⏰ Mañana' : '📅 Vence';
    vencHtml = `<span class="venc-fecha ${vcls}">${lbl}: ${formatDate(t.fechaVencimiento)}</span>`;
  }

  // Tag responsable
  let responsableTag;
  if (esP) {
    responsableTag = `<span class="tag tag-propio">👤 Propio</span>`;
  } else {
    const abColor = abogadoColor(t.abogado);
    const abBg = hexToRgba(abColor, 0.12);
    responsableTag = `<span class="tag tag-abogado" style="background:${abBg};color:${abColor}">${abogadoName(t.abogado)}</span>`;
  }

  const etapaTag = t.terminado
    ? `<span class="tag tag-terminado">Terminado</span>`
    : esP ? ''
    : etapa === 'seguimiento'
      ? `<span class="tag tag-etapa-seguimiento">Seguimiento</span>`
      : `<span class="tag tag-etapa-gestion">Gestión</span>`;

  const tareasPendientes = (t.seguimiento || []).filter(s => s.estado === 'pendiente');
  const seguimientoHtml = buildSeguimientoHtml(tareasPendientes);

  // Checks
  let checksHtml = '';
  if (!t.terminado) {
    if (esP) {
      checksHtml = `
        <div class="card-checks" id="checks_${t.id}">
          <label class="round-check-wrap check-terminar" title="Terminar trámite">
            <input type="checkbox" class="card-check-terminar" />
            <div class="round-check-box"></div>
            <span class="check-label-text">Fin</span>
          </label>
        </div>`;
    } else {
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

  // Botón nueva tarea en pie
  if (!t.terminado) {
    const tareaRow = document.createElement('div');
    tareaRow.className = 'card-nueva-tarea-row';
    const btnTarea = document.createElement('button');
    btnTarea.className = 'btn-card-tarea';
    btnTarea.textContent = '＋ Nueva tarea';
    tareaRow.appendChild(btnTarea);
    card.appendChild(tareaRow);

    btnTarea.addEventListener('click', e => {
      e.stopPropagation();
      openDetail(t.id);
      setTimeout(() => {
        const pid = `det_${t.id}`;
        const form = document.getElementById(`${pid}_formNuevaTarea`);
        if (form) {
          form.style.display = 'block';
          setTimeout(() => document.getElementById(`${pid}_newActDesc`)?.focus(), 80);
        }
      }, 380);
    });
  }

  card.addEventListener('click', e => {
    if (e.target.closest('.card-checks') || e.target.closest('.card-nueva-tarea-row')) return;
    openDetail(t.id);
  });

  if (!t.terminado) {
    const cc = card.querySelector(`#checks_${t.id}`);
    cc.addEventListener('click', e => e.stopPropagation());

    if (!esP) {
      card.querySelector('.card-check-analisis').addEventListener('change', e => {
        t.gestion.analisis = e.target.checked; saveAll(); renderAll();
      });
      card.querySelector('.card-check-cumplimiento').addEventListener('change', e => {
        t.gestion.cumplimiento = e.target.checked;
        if (e.target.checked) {
          crearTareaRequerimiento(t);
          showToast('✓ Cumplimiento marcado. Tarea "1er req" creada.');
        }
        saveAll(); renderAll();
      });
    }

    card.querySelector('.card-check-terminar').addEventListener('change', e => {
      if (!e.target.checked) return;
      e.target.checked = false;
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
  card.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect='move'; if(wrapper.dataset.id!==dragSrcId) card.classList.add('drag-over'); });
  card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
  card.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); card.classList.remove('drag-over'); if(dragSrcId&&dragSrcId!==wrapper.dataset.id) reorder(dragSrcId,wrapper.dataset.id); });
}

function reorder(srcId, targetId) {
  const order = getActiveOrder();
  const si = order.indexOf(srcId), ti = order.indexOf(targetId);
  if (si===-1||ti===-1) return;
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
    if (f.etapa && computeEtapa(t) !== f.etapa) return false;
    if (f.search) {
      const hay = t.numero.toString().includes(f.search) || (t.descripcion||'').toLowerCase().includes(f.search);
      if (!hay) return false;
    }
    return true;
  });
}

function renderList(container, emptyEl, list) {
  container.innerHTML = '';
  if (!list.length) { emptyEl.classList.add('visible'); return; }
  emptyEl.classList.remove('visible');
  list.forEach(t => container.appendChild(buildCard(t)));
}

function renderAll() {
  const f       = getFilters();
  const actives = STATE.tramites.filter(t => !t.terminado);
  const sorted  = sortActives(actives);
  renderList(document.getElementById('tramiteList'), document.getElementById('emptyAll'), applyFilters(sorted, f));

  const urgentes = applyFilters(sorted.filter(tr => esHoyOVencido(tr)), f);
  renderList(document.getElementById('todayList'), document.getElementById('emptyToday'), urgentes);

  const badge = document.getElementById('todayBadge');
  badge.textContent = urgentes.length;
  badge.classList.toggle('hidden', urgentes.length === 0);

  renderList(document.getElementById('finishedList'), document.getElementById('emptyFinished'), STATE.tramites.filter(t => t.terminado));
  setColumns(STATE.config.columns);
}

// ============================================================
// REPORTE DEL DÍA
// ============================================================
let reportFiltroAbogado = '';

function openReport() {
  document.getElementById('reportSubtitle').textContent = `Generado el ${formatDate(today())}`;
  // Actualizar texto de los botones con nombres actuales
  updateAbogadoNames();
  renderReport();
  document.getElementById('reportOverlay').classList.add('open');
}

function closeReport() {
  document.getElementById('reportOverlay').classList.remove('open');
}

function renderReport() {
  const hoy = today();
  const contenido = document.getElementById('reportContent');
  contenido.innerHTML = '';

  // Filtrar trámites según abogado seleccionado
  let tramites = STATE.tramites.filter(t => !t.terminado);
  if (reportFiltroAbogado) {
    if (reportFiltroAbogado === 'yo') {
      tramites = tramites.filter(t =>
        (t.seguimiento||[]).some(s => s.responsable === 'yo')
      );
    } else {
      tramites = tramites.filter(t => t.abogado === reportFiltroAbogado ||
        (t.seguimiento||[]).some(s => s.responsable === reportFiltroAbogado));
    }
  }

  // Recolectar items del reporte
  const items = [];

  tramites.forEach(t => {
    // Vencimiento vencido o hoy (si cumplimiento no marcado)
    if (t.fechaVencimiento && !(t.gestion && t.gestion.cumplimiento) && t.fechaVencimiento <= hoy) {
      const cls = t.fechaVencimiento < hoy ? 'overdue' : 'today';
      items.push({
        t, tipo: 'vencimiento', fecha: t.fechaVencimiento, cls,
        tarea: `📅 Fecha de vencimiento: ${formatDate(t.fechaVencimiento)}`,
      });
    }
    // Tareas pendientes con fecha vencida o hoy
    (t.seguimiento || []).filter(s => s.estado === 'pendiente' && s.fecha && s.fecha <= hoy).forEach(s => {
      const cls = s.fecha < hoy ? 'overdue' : 'today';
      // Si ya hay un item de vencimiento para el mismo trámite en la misma fecha, no duplicar
      items.push({
        t, tipo: 'tarea', fecha: s.fecha, cls,
        tarea: s.descripcion,
        resp: s.responsable,
      });
    });
  });

  if (!items.length) {
    contenido.innerHTML = '<div class="report-empty">🎉 ¡No hay vencimientos ni tareas pendientes para hoy!</div>';
    return;
  }

  // Ordenar: primero vencidos, luego hoy
  items.sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Separar en grupos
  const vencidos = items.filter(i => i.cls === 'overdue');
  const deHoy    = items.filter(i => i.cls === 'today');

  const renderGroup = (titulo, groupItems, titleCls) => {
    if (!groupItems.length) return;
    const sec = document.createElement('div');
    sec.className = 'report-section';
    sec.innerHTML = `<div class="report-section-title ${titleCls}">${titulo} (${groupItems.length})</div>`;
    groupItems.forEach(item => {
      const el = document.createElement('div');
      el.className = `report-item ${item.cls}`;
      const modulo = item.t.modulo || '';
      const tipo = item.tipo === 'vencimiento' ? '📅 Vencimiento' : '📌 Tarea';
      const respTag = item.resp
        ? `<span class="report-item-resp">${abogadoName(item.resp)}</span>`
        : '';
      el.innerHTML = `
        <div class="report-item-num">#${item.t.numero}</div>
        <div class="report-item-body">
          <div class="report-item-desc">${escapeHtml(item.t.descripcion)}</div>
          <div class="report-item-tarea"><span class="tarea-label">${tipo} — ${escapeHtml(item.tarea)}</span></div>
          <div class="report-item-meta">
            <span class="report-item-resp">${modulo}</span>
            ${respTag}
          </div>
        </div>`;
      sec.appendChild(el);
    });
    contenido.appendChild(sec);
  };

  renderGroup('⚠ Vencidos / Atrasados', vencidos, 'danger');
  renderGroup('📅 Para hoy', deHoy, 'warning');
}

function buildReportTextPlain() {
  const hoy = today();
  let text = `REPORTE JURITASK — ${formatDate(hoy)}\n`;
  text += '='.repeat(50) + '\n\n';

  const items = document.querySelectorAll('#reportContent .report-item');
  if (!items.length) { text += 'No hay vencimientos ni tareas para hoy.\n'; return text; }

  items.forEach(el => {
    const num  = el.querySelector('.report-item-num')?.textContent || '';
    const desc = el.querySelector('.report-item-desc')?.textContent || '';
    const tarea = el.querySelector('.tarea-label')?.textContent || '';
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
  document.getElementById('tipoBtnAbogado').classList.toggle('active', tipo === 'abogado');
  document.getElementById('tipoBtnPropio').classList.toggle('active', tipo === 'propio');
  document.getElementById('fAbogadoWrap').style.display = tipo === 'abogado' ? '' : 'none';
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

  const tipo = tramite?.tipo || 'abogado';
  setModalTipo(tipo);

  document.getElementById('nuevaTareaFieldsModal').style.display = 'none';
  document.getElementById('nuevaNotaFieldsModal').style.display  = 'none';
  document.getElementById('fTareaDesc').value  = '';
  document.getElementById('fTareaFecha').value = '';
  document.getElementById('fNota').value       = '';
  syncTareaRespSelect();

  document.getElementById('modalOverlay').classList.add('open');
  // Ajuste 8: focus en número
  setTimeout(() => document.getElementById('fNumero')?.focus(), 120);
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

  const tareaDesc  = document.getElementById('fTareaDesc').value.trim();
  const tareaFecha = document.getElementById('fTareaFecha').value;
  const tareaResp  = document.getElementById('fTareaResp').value;
  const notaTexto  = document.getElementById('fNota').value.trim();

  const tareaInicial = tareaDesc
    ? [{ descripcion: tareaDesc, fecha: tareaFecha, responsable: tareaResp, estado: 'pendiente' }]
    : [];
  const notaInicial = notaTexto
    ? [{ texto: notaTexto, fecha: new Date().toISOString() }]
    : [];

  if (isEditing) {
    const t = getById(editingId);
    if (t) {
      Object.assign(t, { numero, descripcion: desc, modulo, tipo, fechaVencimiento: venc });
      if (tipo === 'abogado') t.abogado = abogado; else delete t.abogado;
      if (tareaInicial.length) t.seguimiento.unshift(...tareaInicial);
      if (notaInicial.length)  t.notas.push(...notaInicial);
    }
    showToast('Trámite actualizado.');
  } else {
    const newT = {
      id: genId(), numero, descripcion: desc, modulo, tipo, fechaVencimiento: venc,
      gestion: { analisis: false, cumplimiento: false },
      seguimiento: tareaInicial, notas: notaInicial,
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
  // AutoReq
  const arToggle = document.getElementById('autoReqToggle'); if (arToggle) arToggle.checked = STATE.config.autoReq !== false;
  const arTexto = document.getElementById('autoReqTexto'); if (arTexto) arTexto.value = STATE.config.autoReqTexto || '1er req';
  const arDias  = document.getElementById('autoReqDias');  if (arDias)  arDias.value  = STATE.config.autoReqDias  ?? 7;
  syncAutoReqFields();
}

function syncAutoReqFields() {
  const on = document.getElementById('autoReqToggle')?.checked;
  const fields = document.getElementById('autoReqFields');
  if (fields) fields.style.opacity = on ? '1' : '0.4';
  if (fields) fields.style.pointerEvents = on ? '' : 'none';
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
      STATE.tramites.forEach(migrateTramite);
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

  // Ajuste 5: limpiar búsqueda al cambiar de vista
  const searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.value = '';

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
  document.getElementById('reportBtn').style.display      = isConfig ? 'none' : '';
  if (isConfig) renderConfig();
  else renderAll();
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

  // Confirm dialog propio
  document.getElementById('confirmOk').addEventListener('click', () => _confirmClose(true));
  document.getElementById('confirmCancel').addEventListener('click', () => _confirmClose(false));
  document.getElementById('confirmOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('confirmOverlay')) _confirmClose(false);
  });

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

  // Toggle tipo
  document.getElementById('tipoBtnAbogado').addEventListener('click', () => setModalTipo('abogado'));
  document.getElementById('tipoBtnPropio').addEventListener('click',  () => setModalTipo('propio'));

  // Abogado → sync resp
  document.getElementById('fAbogado').addEventListener('change', syncTareaRespSelect);

  // Mostrar tarea en modal
  document.getElementById('btnMostrarTareaModal').addEventListener('click', () => {
    const fields = document.getElementById('nuevaTareaFieldsModal');
    const open = fields.style.display !== 'none';
    fields.style.display = open ? 'none' : 'block';
    if (!open) setTimeout(() => document.getElementById('fTareaDesc')?.focus(), 60);
  });

  // Mostrar nota en modal
  document.getElementById('btnMostrarNotaModal').addEventListener('click', () => {
    const fields = document.getElementById('nuevaNotaFieldsModal');
    const open = fields.style.display !== 'none';
    fields.style.display = open ? 'none' : 'block';
    if (!open) setTimeout(() => document.getElementById('fNota')?.focus(), 60);
  });

  // Columnas
  document.querySelectorAll('.col-btn').forEach(btn => btn.addEventListener('click', () => setColumns(parseInt(btn.dataset.cols))));
  document.getElementById('sortSelect').addEventListener('change', e => setSortBy(e.target.value));

  // Bottom sheet
  document.getElementById('mobOptsBtn').addEventListener('click', openMobSheet);
  document.getElementById('mobSheetOverlay').addEventListener('click', closeMobSheet);
  document.getElementById('sortSelectMob').addEventListener('change', e => { setSortBy(e.target.value); closeMobSheet(); });
  document.querySelectorAll('.mob-col-btn').forEach(btn => btn.addEventListener('click', () => { setColumns(parseInt(btn.dataset.cols)); closeMobSheet(); }));

  // Modal trámite
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('cancelModal').addEventListener('click', closeModal);
  document.getElementById('saveTramite').addEventListener('click', saveTramite);
  initDraggableModal(document.getElementById('tramiteModal'));

  // Modal detalle — eliminar funciona cerrando primero el overlay
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === document.getElementById('detailOverlay')) closeDetail(); });
  document.getElementById('editDetailBtn').addEventListener('click', () => {
    const t = getById(currentDetailId); closeDetail(); openModal(t);
  });
  document.getElementById('deleteDetailBtn').addEventListener('click', async () => {
    const idToDelete = currentDetailId;
    if (!idToDelete) return;
    // Cerrar el overlay de detalle PRIMERO para que el confirm dialog sea visible y funcional
    closeDetail();
    await new Promise(r => setTimeout(r, 50)); // esperar transición CSS
    const ok = await showConfirm('¿Eliminar este trámite? Esta acción no se puede deshacer.');
    if (ok) {
      STATE.tramites = STATE.tramites.filter(t => t.id !== idToDelete);
      STATE.order    = STATE.order.filter(id => id !== idToDelete);
      saveAll(); renderAll(); showToast('Trámite eliminado.');
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

  // Export/Import (ahora en Config pero también en sidebar antiguo — ya eliminados del sidebar)
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', e => { if (e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; } });

  // Config
  document.getElementById('modeExpand').addEventListener('click', () => setDetailMode('expand'));
  document.getElementById('modeModal').addEventListener('click',  () => setDetailMode('modal'));

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

  // Config: tarea automática al cumplimiento
  document.getElementById('autoReqToggle').addEventListener('change', e => {
    STATE.config.autoReq = e.target.checked;
    syncAutoReqFields(); saveAll();
  });
  document.getElementById('saveAutoReqBtn').addEventListener('click', () => {
    const texto = document.getElementById('autoReqTexto').value.trim();
    const dias  = parseInt(document.getElementById('autoReqDias').value);
    if (!texto) { showToast('El texto no puede estar vacío.'); return; }
    if (isNaN(dias) || dias < 1 || dias > 365) { showToast('Los días deben estar entre 1 y 365.'); return; }
    STATE.config.autoReqTexto = texto;
    STATE.config.autoReqDias  = dias;
    saveAll(); showToast('Configuración de tarea automática guardada.');
  });

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

  // Reporte
  document.getElementById('reportBtn').addEventListener('click', openReport);
  document.getElementById('reportClose').addEventListener('click', closeReport);
  document.getElementById('reportOverlay').addEventListener('click', e => { if (e.target === document.getElementById('reportOverlay')) closeReport(); });

  // Filtro de abogado en reporte
  document.getElementById('reportFilterGroup').addEventListener('click', e => {
    const btn = e.target.closest('[data-abogado]');
    if (!btn) return;
    reportFiltroAbogado = btn.dataset.abogado;
    document.querySelectorAll('#reportFilterGroup .toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderReport();
  });

  // Imprimir reporte
  document.getElementById('reportPrintBtn').addEventListener('click', () => {
    // Marcar área a imprimir
    const area = document.getElementById('reportContent');
    const header = `<h2 style="font-size:18px;margin-bottom:4px">Reporte JuriTask — ${formatDate(today())}</h2>`;
    const printDiv = document.createElement('div');
    printDiv.id = 'reportPrintArea';
    printDiv.innerHTML = header + area.innerHTML;
    document.body.appendChild(printDiv);
    window.print();
    document.body.removeChild(printDiv);
  });

  // Copiar reporte como texto
  document.getElementById('reportCopyBtn').addEventListener('click', () => {
    const text = buildReportTextPlain();
    navigator.clipboard.writeText(text).then(() => showToast('Reporte copiado al portapapeles.')).catch(() => showToast('No se pudo copiar.'));
  });

  // ESC
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('confirmOverlay').classList.contains('open')) { _confirmClose(false); return; }
    if (document.getElementById('reportOverlay').classList.contains('open')) closeReport();
    else if (document.getElementById('detailOverlay').classList.contains('open')) closeDetail();
    else if (document.getElementById('modalOverlay').classList.contains('open')) closeModal();
    else if (document.getElementById('mobSheet').classList.contains('open')) closeMobSheet();
    else closeAllExpands();
  });
}

document.addEventListener('DOMContentLoaded', init);

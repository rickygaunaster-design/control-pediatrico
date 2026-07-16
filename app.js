// ==================== Base de datos local (IndexedDB) ====================
const DB_NAME = 'pediatria-db';
const DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('patients')) {
        database.createObjectStore('patients', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e);
  });
}

function txStore(mode = 'readonly') {
  return db.transaction('patients', mode).objectStore('patients');
}

function getAllPatients() {
  return new Promise((resolve, reject) => {
    const req = txStore().getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e);
  });
}

function putPatient(patient) {
  return new Promise((resolve, reject) => {
    const req = txStore('readwrite').put(patient);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

function deletePatientDB(id) {
  return new Promise((resolve, reject) => {
    const req = txStore('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e);
  });
}

// ==================== Utilidades ====================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function nowISO() { return new Date().toISOString(); }
function todayInput() { return new Date().toISOString().slice(0, 10); }

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function calcEdad(fechaNacISO) {
  if (!fechaNacISO) return '—';
  const nac = new Date(fechaNacISO + 'T00:00:00');
  const hoy = new Date();
  let years = hoy.getFullYear() - nac.getFullYear();
  let months = hoy.getMonth() - nac.getMonth();
  if (hoy.getDate() < nac.getDate()) months--;
  if (months < 0) { years--; months += 12; }
  if (years < 1) return `${months} m`;
  if (years < 2 && months > 0) return `${years} a ${months} m`;
  return `${years} años`;
}

function addMonths(dateISO, months) {
  if (!dateISO) return null;
  const d = new Date(dateISO + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function diasEntre(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00'), b = new Date(isoB + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

function initials(nombre, apellido) {
  return ((nombre?.[0] || '') + (apellido?.[0] || '')).toUpperCase();
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ==================== Plantilla de vacunación (calendario AR, editable) ====================
function vacunasDefault() {
  // [vacuna, dosis, offsetMeses desde nacimiento, recurrente]
  const items = [
    ['BCG', 'Nacimiento', 0], ['Hepatitis B', 'Nacimiento', 0],
    ['Pentavalente', '2 meses', 2], ['Pentavalente', '4 meses', 4], ['Pentavalente', '6 meses', 6],
    ['Neumococo conjugada', '2 meses', 2], ['Neumococo conjugada', '4 meses', 4], ['Neumococo conjugada', '12 meses', 12],
    ['Polio (IPV)', '2 meses', 2], ['Polio (IPV)', '4 meses', 4], ['Polio (IPV/OPV)', '6 meses', 6],
    ['Rotavirus', '2 meses', 2], ['Rotavirus', '4 meses', 4],
    ['Meningococo', '3 meses', 3], ['Meningococo', '5 meses', 5], ['Meningococo', '15 meses', 15],
    ['Triple viral (SRP)', '12 meses', 12], ['Hepatitis A', '12 meses', 12], ['Varicela', '15 meses', 15],
    ['Refuerzo Cuádruple/DTP', '15-18 meses', 18], ['Refuerzo Polio', '15-18 meses', 18],
    ['Refuerzo Triple viral', 'Ingreso escolar (5-6 años)', 60], ['Refuerzo DTP', 'Ingreso escolar (5-6 años)', 60],
    ['VPH', '11 años', 132], ['Triple bacteriana (dTpa)', '11 años', 132],
    ['Gripe', 'Anual desde 6 meses', 6, true],
  ];
  return items.map(([vacuna, dosis, offsetMeses, recurrente]) => ({
    id: uid(), vacuna, dosis, offsetMeses, recurrente: !!recurrente, aplicada: false, fecha: null,
  }));
}

// Calcula el estado de una dosis: si está vencida y hace cuántos días
function estadoVacuna(paciente, v) {
  if (!paciente.fechaNacimiento) return { vencida: false };
  const hoy = todayInput();
  if (!v.aplicada) {
    const esperada = addMonths(paciente.fechaNacimiento, v.offsetMeses || 0);
    if (esperada && esperada < hoy) return { vencida: true, dias: diasEntre(esperada, hoy), tipo: 'pendiente' };
    return { vencida: false };
  }
  if (v.recurrente && v.fecha) {
    const proxima = addMonths(v.fecha, 12);
    if (proxima < hoy) return { vencida: true, dias: diasEntre(proxima, hoy), tipo: 'refuerzo' };
  }
  return { vencida: false };
}

function vacunasVencidas(paciente) {
  return paciente.vacunas.filter(v => estadoVacuna(paciente, v).vencida);
}

// ==================== Modelo de paciente nuevo ====================
function nuevoPaciente() {
  return {
    id: uid(),
    nombre: '', apellido: '', fechaNacimiento: '',
    tutores: [{ nombre: '', telefono: '' }],
    obraSocial: { tiene: false, nombre: '' },
    grupoSanguineo: '', alergias: '',
    antecedentes: { tipoParto: '', pesoNacer: '' },
    vacunas: vacunasDefault(),
    historia: [],
    updatedAt: nowISO(),
  };
}

// ==================== Estado global ====================
let state = { patients: [], view: 'list', currentId: null, tab: 'datos', search: '' };

async function refreshPatients() {
  state.patients = await getAllPatients();
  state.patients.sort((a, b) => (a.apellido + a.nombre).localeCompare(b.apellido + b.nombre));
}

// ==================== Render: lista de pacientes ====================
const app = document.getElementById('app');
const topbar = document.getElementById('topbar');
const main = document.getElementById('main');

function render() {
  if (state.view === 'list') renderList();
  else if (state.view === 'detail') renderDetail();
}

function renderList() {
  topbar.innerHTML = `
    <div class="brand">
      <svg width="34" height="34" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#2F6F62"/><path d="M34 138 C 60 138, 60 96, 86 96 S 112 54, 138 54" stroke="#F6F5F0" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="138" cy="54" r="9" fill="#D98C4A"/></svg>
      <div class="brand-text"><div class="display">Control Pediátrico</div><div class="eyebrow">${state.patients.length} paciente${state.patients.length === 1 ? '' : 's'}</div></div>
    </div>
    <button class="back-btn" id="btn-sync" title="Exportar / Importar">⇅</button>
  `;
  document.getElementById('btn-sync').onclick = openSyncModal;

  const filtered = state.patients.filter(p => {
    const q = state.search.toLowerCase();
    return !q || `${p.nombre} ${p.apellido}`.toLowerCase().includes(q);
  });

  const totalVencidas = state.patients.reduce((sum, p) => sum + vacunasVencidas(p).length, 0);

  main.innerHTML = `
    ${totalVencidas ? `<div class="reminder-banner">⚠ ${totalVencidas} dosis de vacuna vencida${totalVencidas === 1 ? '' : 's'} entre tus pacientes</div>` : ''}
    <div class="searchbar">
      <span>🔍</span>
      <input id="search-input" type="text" placeholder="Buscar paciente..." value="${escapeAttr(state.search)}" />
    </div>
    <div id="list-container"></div>
  `;
  document.getElementById('search-input').oninput = (e) => { state.search = e.target.value; renderSearchOnly(); };

  renderListItemsInto(filtered);

  main.insertAdjacentHTML('beforeend', `<button class="fab" id="btn-add" title="Agregar paciente">+</button>`);
  document.getElementById('btn-add').onclick = () => openPatientForm(null);
}

function renderSearchOnly() {
  const filtered = state.patients.filter(p => {
    const q = state.search.toLowerCase();
    return !q || `${p.nombre} ${p.apellido}`.toLowerCase().includes(q);
  });
  renderListItemsInto(filtered);
}

function renderListItemsInto(list) {
  const container = document.getElementById('list-container');
  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#EEEDE6"/><path d="M34 138 C 60 138, 60 96, 86 96 S 112 54, 138 54" stroke="#2F6F62" stroke-width="9" fill="none" stroke-linecap="round"/></svg>
        <div class="display">${state.search ? 'Sin resultados' : 'Todavía no hay pacientes'}</div>
        <div>${state.search ? 'Probá con otro nombre' : 'Tocá el botón + para cargar el primero'}</div>
      </div>`;
    return;
  }
  container.innerHTML = list.map(p => {
    const vencidas = vacunasVencidas(p).length;
    return `
    <div class="patient-card" data-id="${p.id}">
      <div class="avatar">${initials(p.nombre, p.apellido)}</div>
      <div class="info">
        <div class="name">${escapeHtml(p.nombre)} ${escapeHtml(p.apellido)}</div>
        <div class="meta">${calcEdad(p.fechaNacimiento)} · ${p.historia.length} registro${p.historia.length === 1 ? '' : 's'}
          ${vencidas ? `<span class="meta-warn">⚠ ${vencidas} vacuna${vencidas === 1 ? '' : 's'} vencida${vencidas === 1 ? '' : 's'}</span>` : ''}
        </div>
      </div>
      <div class="chev">›</div>
    </div>
  `;
  }).join('');
  container.querySelectorAll('.patient-card').forEach(el => {
    el.onclick = () => { state.currentId = el.dataset.id; state.view = 'detail'; state.tab = 'datos'; render(); window.scrollTo(0, 0); };
  });
}

// ==================== Render: detalle de paciente ====================
function currentPatient() { return state.patients.find(p => p.id === state.currentId); }

function renderDetail() {
  const p = currentPatient();
  if (!p) { state.view = 'list'; render(); return; }

  topbar.innerHTML = `
    <button class="back-btn" id="btn-back">←</button>
    <div class="brand-text"><div class="display" style="font-size:18px">${escapeHtml(p.nombre)} ${escapeHtml(p.apellido)}</div><div class="eyebrow">${calcEdad(p.fechaNacimiento)}</div></div>
  `;
  document.getElementById('btn-back').onclick = () => { state.view = 'list'; render(); };

  main.innerHTML = `
    <div class="tabs">
      <button data-tab="datos" class="${state.tab === 'datos' ? 'active' : ''}">Datos</button>
      <button data-tab="crecimiento" class="${state.tab === 'crecimiento' ? 'active' : ''}">Crecimiento</button>
      <button data-tab="vacunas" class="${state.tab === 'vacunas' ? 'active' : ''}">Vacunación</button>
      <button data-tab="historia" class="${state.tab === 'historia' ? 'active' : ''}">Historia clínica</button>
    </div>
    <div id="tab-content"></div>
  `;
  main.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { state.tab = b.dataset.tab; render(); });

  const content = document.getElementById('tab-content');
  if (state.tab === 'datos') content.innerHTML = renderDatosTab(p);
  else if (state.tab === 'crecimiento') content.innerHTML = renderCrecimientoTab(p);
  else if (state.tab === 'vacunas') content.innerHTML = renderVacunasTab(p);
  else content.innerHTML = renderHistoriaTab(p);

  if (state.tab === 'datos') {
    content.insertAdjacentHTML('beforeend', `<button class="fab" id="btn-edit" title="Editar datos">✎</button>`);
    document.getElementById('btn-edit').onclick = () => openPatientForm(p.id);
    document.getElementById('btn-pdf').onclick = () => exportarFichaPDF(p);
  } else if (state.tab === 'vacunas') {
    content.querySelectorAll('.vax-item').forEach(el => {
      el.onclick = () => toggleVacuna(p.id, el.dataset.id);
    });
  } else if (state.tab === 'historia') {
    content.insertAdjacentHTML('beforeend', `<button class="fab" id="btn-entry" title="Nueva entrada">+</button>`);
    document.getElementById('btn-entry').onclick = () => openEntryForm(p.id);
  }
}

function renderDatosTab(p) {
  return `
    <div class="card">
      <h3>Datos generales</h3>
      <div class="field-row"><span class="label">Fecha de nacimiento</span><span class="value">${fmtDate(p.fechaNacimiento)}</span></div>
      <div class="field-row"><span class="label">Edad</span><span class="value">${calcEdad(p.fechaNacimiento)}</span></div>
      <div class="field-row"><span class="label">Grupo sanguíneo</span><span class="value">${p.grupoSanguineo || '—'}</span></div>
      <div class="field-row"><span class="label">Obra social</span><span class="value">${p.obraSocial.tiene ? escapeHtml(p.obraSocial.nombre || 'Sí') : 'No'}</span></div>
    </div>
    <div class="card">
      <h3>Alergias</h3>
      ${p.alergias ? `<span class="tag warn">⚠ ${escapeHtml(p.alergias)}</span>` : `<span class="tag ok">Sin alergias registradas</span>`}
    </div>
    <div class="card">
      <h3>Tutor/es</h3>
      ${p.tutores.map(t => `<div class="field-row"><span class="label">${escapeHtml(t.nombre) || '—'}</span><span class="value">${escapeHtml(t.telefono) || '—'}</span></div>`).join('')}
    </div>
    <div class="card">
      <h3>Antecedentes de nacimiento</h3>
      <div class="field-row"><span class="label">Tipo de parto</span><span class="value">${p.antecedentes.tipoParto || '—'}</span></div>
      <div class="field-row"><span class="label">Peso al nacer</span><span class="value">${p.antecedentes.pesoNacer ? p.antecedentes.pesoNacer + ' g' : '—'}</span></div>
    </div>
    <button class="btn ghost" id="btn-pdf">📄 Exportar ficha en PDF</button>
  `;
}

function renderVacunasTab(p) {
  const conEstado = p.vacunas.map(v => ({ v, estado: estadoVacuna(p, v) }));
  conEstado.sort((a, b) => (b.estado.vencida - a.estado.vencida));

  const rows = conEstado.map(({ v, estado }) => `
    <div class="vax-item" data-id="${v.id}">
      <div class="vax-check ${v.aplicada ? 'done' : ''} ${estado.vencida ? 'overdue' : ''}">${v.aplicada ? '✓' : (estado.vencida ? '!' : '')}</div>
      <div class="vax-info">
        <div class="name">${escapeHtml(v.vacuna)}</div>
        <div class="dose">${escapeHtml(v.dosis)}${estado.vencida ? ` · <span class="overdue-text">${estado.tipo === 'refuerzo' ? 'Refuerzo pendiente' : 'Vencida'} hace ${estado.dias} día${estado.dias === 1 ? '' : 's'}</span>` : ''}</div>
      </div>
      <div class="vax-date">${v.aplicada ? fmtDate(v.fecha) : ''}</div>
    </div>
  `).join('');
  return `<div class="card"><h3>Calendario de vacunación</h3>${rows}</div>
    <p style="text-align:center;color:var(--ink-soft);font-size:12.5px">Tocá una vacuna para marcarla como aplicada. Las fechas esperadas se calculan a partir de la fecha de nacimiento.</p>`;
}

// ==================== Curva de crecimiento ====================
function buildChart(points, opts) {
  const W = 300, H = 130, padL = 36, padR = 12, padT = 14, padB = 22;
  const times = points.map(p => new Date(p.fecha + 'T00:00:00').getTime());
  const values = points.map(p => p.valor);
  const minT = Math.min(...times), maxT = Math.max(...times);
  const minV = Math.min(...values), maxV = Math.max(...values);
  const padV = (maxV - minV) * 0.2 || Math.max(maxV * 0.1, 1);
  const yMin = minV - padV, yMax = maxV + padV;
  const xScale = (t) => padL + (maxT === minT ? (W - padL - padR) / 2 : ((t - minT) / (maxT - minT)) * (W - padL - padR));
  const yScale = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

  const coords = points.map((p, i) => [xScale(times[i]), yScale(values[i])]);
  const line = coords.map((c) => c.join(',')).join(' ');
  const area = `${padL},${H - padB} ${line} ${coords[coords.length - 1][0]},${H - padB}`;
  const dots = coords.map((c, i) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3.2" fill="${opts.color}"><title>${fmtDate(points[i].fecha)}: ${points[i].valor}${opts.unit}</title></circle>`).join('');

  return `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="150" preserveAspectRatio="xMidYMid meet">
      <text x="${padL}" y="${padT + 4}" font-size="9" fill="#5B6B65" font-family="IBM Plex Mono, monospace">${yMax.toFixed(1)}${opts.unit}</text>
      <text x="${padL}" y="${H - padB}" font-size="9" fill="#5B6B65" font-family="IBM Plex Mono, monospace">${yMin.toFixed(1)}${opts.unit}</text>
      <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#DEDBD0" stroke-width="1"/>
      <polygon points="${area}" fill="${opts.color}" fill-opacity="0.12"/>
      <polyline points="${line}" fill="none" stroke="${opts.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      <text x="${padL}" y="${H - 5}" font-size="9" fill="#5B6B65" font-family="IBM Plex Mono, monospace">${fmtDate(points[0].fecha)}</text>
      <text x="${W - padR}" y="${H - 5}" font-size="9" fill="#5B6B65" font-family="IBM Plex Mono, monospace" text-anchor="end">${fmtDate(points[points.length - 1].fecha)}</text>
    </svg>`;
}

function renderCrecimientoTab(p) {
  const entries = [...p.historia].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pesos = entries.filter(e => e.peso).map(e => ({ fecha: e.fecha, valor: parseFloat(e.peso) }));
  const tallas = entries.filter(e => e.talla).map(e => ({ fecha: e.fecha, valor: parseFloat(e.talla) }));

  const pesoBlock = pesos.length >= 2
    ? `<div class="card"><h3>Peso (kg)</h3>${buildChart(pesos, { color: '#2F6F62', unit: 'kg' })}</div>`
    : `<div class="card"><h3>Peso (kg)</h3><p class="chart-empty">Cargá peso en al menos 2 registros de la historia clínica para ver la curva.</p></div>`;

  const tallaBlock = tallas.length >= 2
    ? `<div class="card"><h3>Talla (cm)</h3>${buildChart(tallas, { color: '#D98C4A', unit: 'cm' })}</div>`
    : `<div class="card"><h3>Talla (cm)</h3><p class="chart-empty">Cargá talla en al menos 2 registros de la historia clínica para ver la curva.</p></div>`;

  return pesoBlock + tallaBlock;
}

function renderHistoriaTab(p) {
  const entries = [...p.historia].sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!entries.length) {
    return `<div class="empty-state"><div class="display">Sin registros todavía</div><div>Tocá + para cargar el primer control</div></div>`;
  }
  return entries.map(e => `
    <div class="timeline-item">
      <div class="top"><span class="pill ${e.tipo}">${tipoLabel(e.tipo)}</span><span class="date">${fmtDate(e.fecha)}</span></div>
      <div class="text">${escapeHtml(e.texto)}</div>
      ${(e.peso || e.talla) ? `<div class="vitals">${e.peso ? `<span>⚖ ${e.peso} kg</span>` : ''}${e.talla ? `<span>📏 ${e.talla} cm</span>` : ''}</div>` : ''}
    </div>
  `).join('');
}

function tipoLabel(t) {
  return { control: 'Control de rutina', enfermedad: 'Enfermedad', tratamiento: 'Tratamiento', urgencia: 'Urgencia' }[t] || t;
}

async function toggleVacuna(patientId, vaxId) {
  const p = state.patients.find(x => x.id === patientId);
  const v = p.vacunas.find(x => x.id === vaxId);
  if (!v.aplicada) {
    v.aplicada = true;
    v.fecha = todayInput();
  } else if (v.recurrente && estadoVacuna(p, v).vencida) {
    // Refuerzo anual pendiente: registrar la nueva dosis en vez de desmarcar
    v.fecha = todayInput();
    toast('Refuerzo registrado');
  } else {
    v.aplicada = false;
    v.fecha = null;
  }
  p.updatedAt = nowISO();
  await putPatient(p);
  render();
}

// ==================== Modal genérico ====================
function openModal(title, bodyHtml, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal">
      <div class="modal-header"><div class="display">${title}</div><button class="close-btn" id="modal-close">✕</button></div>
      <div id="modal-body">${bodyHtml}</div>
    </div>
  `;
  document.body.appendChild(wrap);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(wrap); });
  wrap.querySelector('#modal-close').onclick = () => closeModal(wrap);
  if (onMount) onMount(wrap);
  return wrap;
}
function closeModal(wrap) { wrap.remove(); }

// ==================== Formulario: paciente ====================
function openPatientForm(patientId) {
  const editing = !!patientId;
  const p = editing ? JSON.parse(JSON.stringify(currentPatient())) : nuevoPaciente();

  const bodyHtml = `
    <div class="form-group"><label>Nombre</label><input type="text" id="f-nombre" value="${escapeAttr(p.nombre)}"></div>
    <div class="form-group"><label>Apellido</label><input type="text" id="f-apellido" value="${escapeAttr(p.apellido)}"></div>
    <div class="form-group"><label>Fecha de nacimiento</label><input type="date" id="f-fnac" value="${p.fechaNacimiento}"></div>
    <div class="row2">
      <div class="form-group"><label>Grupo sanguíneo</label>
        <select id="f-grupo">
          ${['', 'O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(g => `<option value="${g}" ${p.grupoSanguineo === g ? 'selected' : ''}>${g || 'No sabe / sin dato'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Peso al nacer (g)</label><input type="number" id="f-pesonacer" value="${p.antecedentes.pesoNacer || ''}"></div>
    </div>
    <div class="form-group"><label>Tipo de parto</label>
      <select id="f-parto">
        ${['', 'Vaginal', 'Cesárea'].map(g => `<option value="${g}" ${p.antecedentes.tipoParto === g ? 'selected' : ''}>${g || 'Sin dato'}</option>`).join('')}
      </select>
    </div>
    <div class="form-group"><label>Alergias</label><input type="text" id="f-alergias" placeholder="Ej: penicilina, maní..." value="${escapeAttr(p.alergias)}"></div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:8px;font-weight:600">
        <input type="checkbox" id="f-obratiene" ${p.obraSocial.tiene ? 'checked' : ''} style="width:18px;height:18px"> Tiene obra social
      </label>
    </div>
    <div class="form-group" id="f-obranombre-wrap" style="${p.obraSocial.tiene ? '' : 'display:none'}">
      <label>Nombre de la obra social</label><input type="text" id="f-obranombre" value="${escapeAttr(p.obraSocial.nombre)}">
    </div>
    <div class="form-group"><label>Tutor/es</label><div id="tutores-list"></div>
      <button type="button" class="link-btn" id="btn-add-tutor">+ Agregar otro tutor</button>
    </div>
    <div class="btn-row">
      ${editing ? `<button class="btn danger" id="btn-delete">Eliminar</button>` : ''}
      <button class="btn primary" id="btn-save">${editing ? 'Guardar cambios' : 'Crear paciente'}</button>
    </div>
  `;

  const wrap = openModal(editing ? 'Editar paciente' : 'Nuevo paciente', bodyHtml, (modal) => {
    const tutoresList = modal.querySelector('#tutores-list');
    let tutores = JSON.parse(JSON.stringify(p.tutores.length ? p.tutores : [{ nombre: '', telefono: '' }]));

    function renderTutores() {
      tutoresList.innerHTML = tutores.map((t, i) => `
        <div class="tutor-row">
          <div class="form-group"><label>Nombre</label><input type="text" class="t-nombre" data-i="${i}" value="${escapeAttr(t.nombre)}"></div>
          <div class="form-group"><label>Teléfono</label><input type="tel" class="t-tel" data-i="${i}" value="${escapeAttr(t.telefono)}"></div>
          ${tutores.length > 1 ? `<button type="button" class="icon-btn" data-i="${i}">✕</button>` : ''}
        </div>
      `).join('');
      tutoresList.querySelectorAll('.t-nombre').forEach(inp => inp.oninput = () => tutores[inp.dataset.i].nombre = inp.value);
      tutoresList.querySelectorAll('.t-tel').forEach(inp => inp.oninput = () => tutores[inp.dataset.i].telefono = inp.value);
      tutoresList.querySelectorAll('.icon-btn').forEach(btn => btn.onclick = () => { tutores.splice(btn.dataset.i, 1); renderTutores(); });
    }
    renderTutores();
    modal.querySelector('#btn-add-tutor').onclick = () => { tutores.push({ nombre: '', telefono: '' }); renderTutores(); };

    modal.querySelector('#f-obratiene').onchange = (e) => {
      modal.querySelector('#f-obranombre-wrap').style.display = e.target.checked ? '' : 'none';
    };

    if (editing) {
      modal.querySelector('#btn-delete').onclick = async () => {
        if (confirm(`¿Eliminar a ${p.nombre} ${p.apellido}? Esta acción no se puede deshacer.`)) {
          await deletePatientDB(p.id);
          await refreshPatients();
          closeModal(wrap);
          state.view = 'list';
          render();
          toast('Paciente eliminado');
        }
      };
    }

    modal.querySelector('#btn-save').onclick = async () => {
      const nombre = modal.querySelector('#f-nombre').value.trim();
      const apellido = modal.querySelector('#f-apellido').value.trim();
      if (!nombre || !apellido) { toast('Completá nombre y apellido'); return; }
      p.nombre = nombre;
      p.apellido = apellido;
      p.fechaNacimiento = modal.querySelector('#f-fnac').value;
      p.grupoSanguineo = modal.querySelector('#f-grupo').value;
      p.antecedentes.pesoNacer = modal.querySelector('#f-pesonacer').value;
      p.antecedentes.tipoParto = modal.querySelector('#f-parto').value;
      p.alergias = modal.querySelector('#f-alergias').value.trim();
      p.obraSocial.tiene = modal.querySelector('#f-obratiene').checked;
      p.obraSocial.nombre = modal.querySelector('#f-obranombre') ? modal.querySelector('#f-obranombre').value.trim() : '';
      p.tutores = tutores.filter(t => t.nombre || t.telefono);
      if (!p.tutores.length) p.tutores = [{ nombre: '', telefono: '' }];
      p.updatedAt = nowISO();
      await putPatient(p);
      await refreshPatients();
      closeModal(wrap);
      state.currentId = p.id;
      state.view = 'detail';
      state.tab = 'datos';
      render();
      toast(editing ? 'Cambios guardados' : 'Paciente creado');
    };
  });
}

// ==================== Formulario: entrada de historia clínica ====================
function openEntryForm(patientId) {
  const bodyHtml = `
    <div class="form-group"><label>Fecha</label><input type="date" id="e-fecha" value="${todayInput()}"></div>
    <div class="form-group"><label>Tipo</label>
      <select id="e-tipo">
        <option value="control">Control de rutina</option>
        <option value="enfermedad">Enfermedad</option>
        <option value="tratamiento">Tratamiento</option>
        <option value="urgencia">Urgencia</option>
      </select>
    </div>
    <div class="row2">
      <div class="form-group"><label>Peso (kg)</label><input type="number" step="0.01" id="e-peso"></div>
      <div class="form-group"><label>Talla (cm)</label><input type="number" step="0.1" id="e-talla"></div>
    </div>
    <div class="form-group">
      <label>Evolución / notas</label>
      <div class="dictate-wrap">
        <textarea id="e-texto" placeholder="Escribí o dictá la evolución..."></textarea>
        <button type="button" class="dictate-btn" id="e-dictar" title="Dictar por voz">🎤</button>
      </div>
    </div>
    <div class="btn-row"><button class="btn primary" id="e-save">Guardar registro</button></div>
  `;
  const wrap = openModal('Nueva entrada', bodyHtml, (modal) => {
    setupDictado(modal.querySelector('#e-dictar'), modal.querySelector('#e-texto'));
    modal.querySelector('#e-save').onclick = async () => {
      const fecha = modal.querySelector('#e-fecha').value;
      const texto = modal.querySelector('#e-texto').value.trim();
      if (!fecha || !texto) { toast('Completá fecha y evolución'); return; }
      const p = state.patients.find(x => x.id === patientId);
      p.historia.push({
        id: uid(),
        fecha,
        tipo: modal.querySelector('#e-tipo').value,
        texto,
        peso: modal.querySelector('#e-peso').value,
        talla: modal.querySelector('#e-talla').value,
        updatedAt: nowISO(),
      });
      p.updatedAt = nowISO();
      await putPatient(p);
      await refreshPatients();
      closeModal(wrap);
      render();
      toast('Registro agregado');
    };
  });
}

// ==================== Dictado por voz ====================
function setupDictado(btn, textarea) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.style.display = 'none'; return; }
  const rec = new SR();
  rec.lang = 'es-AR';
  rec.continuous = true;
  rec.interimResults = true;
  let listening = false;
  let baseText = '';

  rec.onresult = (e) => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    textarea.value = (baseText + ' ' + final + ' ' + interim).trim();
    if (final) baseText = (baseText + ' ' + final).trim();
  };
  rec.onerror = () => { listening = false; btn.classList.remove('listening'); };
  rec.onend = () => { listening = false; btn.classList.remove('listening'); };

  btn.onclick = () => {
    if (listening) { rec.stop(); listening = false; btn.classList.remove('listening'); return; }
    baseText = textarea.value;
    try { rec.start(); listening = true; btn.classList.add('listening'); }
    catch (err) { toast('No se pudo iniciar el dictado'); }
  };
}

// ==================== Exportar / Importar (sincronización vía Drive) ====================
function openSyncModal() {
  const bodyHtml = `
    <div class="sync-box">
      <p>Exportá un archivo con todos tus pacientes y subilo a tu Google Drive desde la app de Drive de tu celular. En otro dispositivo, descargá ese archivo desde Drive e importalo acá para tener todo sincronizado.</p>
      <button class="btn primary" id="btn-export">⬇ Exportar copia (.json)</button>
    </div>
    <div class="card">
      <h3>Importar copia</h3>
      <p style="font-size:13px;color:var(--ink-soft);margin:0 0 12px">Los pacientes nuevos se agregan y los existentes se actualizan con la versión más reciente. No se borra nada.</p>
      <input type="file" id="import-file" accept="application/json" style="margin-bottom:12px">
      <button class="btn ghost" id="btn-import">⬆ Importar archivo</button>
    </div>
  `;
  openModal('Exportar / Importar', bodyHtml, (modal) => {
    modal.querySelector('#btn-export').onclick = exportarDatos;
    modal.querySelector('#btn-import').onclick = () => {
      const file = modal.querySelector('#import-file').files[0];
      if (!file) { toast('Elegí un archivo primero'); return; }
      importarDatos(file, modal);
    };
  });
}

async function exportarDatos() {
  const data = { app: 'control-pediatrico', version: 1, exportedAt: nowISO(), patients: state.patients };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fecha = todayInput();
  a.href = url;
  a.download = `control-pediatrico-${fecha}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('Archivo exportado — ahora subilo a tu Drive');
}

function importarDatos(file, modal) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    let data;
    try { data = JSON.parse(e.target.result); }
    catch { toast('El archivo no es válido'); return; }
    const incoming = data.patients || data;
    if (!Array.isArray(incoming)) { toast('El archivo no tiene el formato esperado'); return; }

    let nuevos = 0, actualizados = 0;
    for (const inc of incoming) {
      const local = state.patients.find(p => p.id === inc.id);
      if (!local) {
        await putPatient(inc);
        nuevos++;
      } else if (new Date(inc.updatedAt || 0) > new Date(local.updatedAt || 0)) {
        // fusiona historia: unión por id, sin perder entradas locales
        const historiaMap = new Map();
        [...local.historia, ...(inc.historia || [])].forEach(h => historiaMap.set(h.id, h));
        inc.historia = Array.from(historiaMap.values());
        await putPatient(inc);
        actualizados++;
      } else {
        // local más nuevo: igual fusiona historia por si el import trae entradas que no están local
        const historiaMap = new Map();
        [...local.historia, ...(inc.historia || [])].forEach(h => historiaMap.set(h.id, h));
        local.historia = Array.from(historiaMap.values());
        await putPatient(local);
      }
    }
    await refreshPatients();
    closeModal(modal);
    render();
    toast(`Importado: ${nuevos} nuevo/s, ${actualizados} actualizado/s`);
  };
  reader.readAsText(file);
}

// ==================== Exportar ficha en PDF (vía impresión del navegador) ====================
function exportarFichaPDF(p) {
  const entries = [...p.historia].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const vacunasHtml = p.vacunas.map(v => {
    const estado = estadoVacuna(p, v);
    let estadoTxt = v.aplicada ? `Aplicada ${fmtDate(v.fecha)}` : 'Pendiente';
    if (estado.vencida) estadoTxt = (estado.tipo === 'refuerzo' ? 'Refuerzo pendiente' : 'Vencida') + ` (hace ${estado.dias} días)`;
    return `<tr><td>${escapeHtml(v.vacuna)}</td><td>${escapeHtml(v.dosis)}</td><td>${estadoTxt}</td></tr>`;
  }).join('');

  const historiaHtml = entries.length ? entries.map(e => `
    <div class="p-entry">
      <div class="p-entry-top"><strong>${fmtDate(e.fecha)}</strong> — ${tipoLabel(e.tipo)}${(e.peso || e.talla) ? ` (${e.peso ? e.peso + ' kg' : ''}${e.peso && e.talla ? ', ' : ''}${e.talla ? e.talla + ' cm' : ''})` : ''}</div>
      <div>${escapeHtml(e.texto)}</div>
    </div>`).join('') : '<p>Sin registros.</p>';

  const html = `
    <h1>${escapeHtml(p.nombre)} ${escapeHtml(p.apellido)}</h1>
    <p class="p-sub">Fecha de nacimiento: ${fmtDate(p.fechaNacimiento)} · Edad: ${calcEdad(p.fechaNacimiento)} · Grupo sanguíneo: ${p.grupoSanguineo || '—'}</p>
    <p class="p-sub">Alergias: ${p.alergias ? escapeHtml(p.alergias) : 'Sin alergias registradas'}</p>
    <p class="p-sub">Obra social: ${p.obraSocial.tiene ? escapeHtml(p.obraSocial.nombre || 'Sí') : 'No'}</p>
    <p class="p-sub">Tutor/es: ${p.tutores.map(t => `${escapeHtml(t.nombre)} (${escapeHtml(t.telefono)})`).join(' · ')}</p>
    <p class="p-sub">Antecedentes de nacimiento: ${p.antecedentes.tipoParto || '—'}${p.antecedentes.pesoNacer ? ', ' + p.antecedentes.pesoNacer + ' g al nacer' : ''}</p>
    <h2>Calendario de vacunación</h2>
    <table class="p-table"><thead><tr><th>Vacuna</th><th>Dosis</th><th>Estado</th></tr></thead><tbody>${vacunasHtml}</tbody></table>
    <h2>Historia clínica</h2>
    ${historiaHtml}
    <p class="p-footer">Ficha generada el ${fmtDate(todayInput())} — Control Pediátrico</p>
  `;
  document.getElementById('print-area').innerHTML = html;
  setTimeout(() => window.print(), 80);
}

// ==================== Helpers de escape ====================
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }

// ==================== Init ====================
window.addEventListener('scroll', () => topbar.classList.toggle('scrolled', window.scrollY > 4));

(async function init() {
  await openDB();
  await refreshPatients();
  render();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();

/**
 * Procesa los Excel históricos de SLIM_UCH y genera SLIM_UCH_HISTORICO.xlsx
 * Una fila por fecha con: Fecha, Advanced, Core, Self-Service, Sin Clasificar, Total Usuarios, FUE Total
 *
 * Uso: node generar_historico.js
 */

const XLSX = require('xlsx');
const path = require('path');
const fs   = require('fs');

const INPUT_DIR  = path.join(__dirname, 'PRD 100');
const OUTPUT     = path.join(__dirname, 'SLIM_UCH_HISTORICO.xlsx');

const FUE = { advanced: 1, core: 0.2, selfservice: 0.033 };

// Extraer fecha del nombre: EXPORT_YYYYMMDD_HHMMSS...
function parseDateFromFilename(name) {
  const m = name.match(/EXPORT_(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// Clasificar tipo de licencia desde texto
function classifyType(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('advanced'))  return 'advanced';
  if (s.includes('core'))      return 'core';
  if (s.includes('self'))      return 'selfservice';
  return 'sinclasificar';
}

// Procesar un archivo con datos por usuario (la mayoría de formatos)
function processUserFile(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length < 2) return null;

  // Buscar la fila de headers — la que tenga "Usuar" o "Usuario" o "Nombre completo"
  let headerIdx = -1;
  let typeColIdx = -1;

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i].map(c => String(c).toLowerCase().trim());
    // Buscar columna de clasificación de destino o tipo licencia
    const tIdx = row.findIndex(c => c.includes('clasificación de destino') || c.includes('clasificacion de destino'));
    if (tIdx >= 0) { headerIdx = i; typeColIdx = tIdx; break; }
    // Formato con FUES ya calculadas
    const fIdx = row.findIndex(c => c === 'fues' || c === 'fue');
    if (fIdx >= 0) { headerIdx = i; typeColIdx = row.findIndex(c => c.includes('clasificación') || c.includes('clasificacion')); break; }
  }

  if (headerIdx < 0 || typeColIdx < 0) return null;

  const counts = { advanced: 0, core: 0, selfservice: 0, sinclasificar: 0 };
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue; // fila vacía
    const typeRaw = row[typeColIdx];
    if (!typeRaw) continue;
    const type = classifyType(typeRaw);
    counts[type]++;
  }

  return counts;
}

// Procesar archivo tipo resumen (2 filas: headers + totales)
function processSummaryFile(ws) {
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length < 2) return null;

  const headers = data[0].map(c => String(c).toLowerCase().trim());
  // Verificar que sea un resumen
  if (!headers.some(h => h.includes('total'))) return null;

  const vals = data[1]; // fila con los totales
  const counts = { advanced: 0, core: 0, selfservice: 0, sinclasificar: 0 };

  headers.forEach((h, i) => {
    const v = Number(vals[i]) || 0;
    if (h.includes('advanced'))       counts.advanced = v;
    else if (h.includes('core'))      counts.core = v;
    else if (h.includes('self'))      counts.selfservice = v;
    else if (h.includes('sin clas'))  counts.sinclasificar = v;
  });

  return counts;
}

// ── MAIN ──────────────────────────────────────────────────
const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.xlsx')).sort();
const snapshots = new Map(); // fecha ISO → counts (último gana si hay duplicados por día)

// Archivos a excluir (reportes de funciones/roles, no de licencias)
const exclude = ['EXPORT_20251126_161021.xlsx']; // reporte de funciones (292 filas)

console.log(`Procesando ${files.length} archivos...\n`);

for (const file of files) {
  if (exclude.includes(file)) {
    console.log(`  SKIP  ${file} (excluido)`);
    continue;
  }

  const date = parseDateFromFilename(file);
  if (!date) { console.log(`  SKIP  ${file} (sin fecha)`); continue; }

  const wb = XLSX.readFile(path.join(INPUT_DIR, file));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  let counts = null;

  // Si tiene pocas filas, puede ser resumen
  if (data.length <= 5) {
    counts = processSummaryFile(ws);
  }

  // Si no fue resumen, intentar como archivo de usuarios
  if (!counts) {
    counts = processUserFile(ws);
  }

  if (!counts) {
    console.log(`  FAIL  ${file} (formato no reconocido)`);
    continue;
  }

  const dateKey = date.toISOString().split('T')[0];
  const totalUsers = counts.advanced + counts.core + counts.selfservice + counts.sinclasificar;
  const fueTotal = +(counts.advanced * FUE.advanced + counts.core * FUE.core + counts.selfservice * FUE.selfservice).toFixed(3);

  console.log(`  OK    ${file} → ${dateKey} | Adv:${counts.advanced} Core:${counts.core} SS:${counts.selfservice} SC:${counts.sinclasificar} | Users:${totalUsers} FUE:${fueTotal}`);

  // Si ya hay un registro para esta fecha, quedarse con el de más usuarios (más completo)
  if (snapshots.has(dateKey)) {
    const prev = snapshots.get(dateKey);
    if (totalUsers <= prev.totalUsers) continue;
  }

  snapshots.set(dateKey, { date: dateKey, ...counts, totalUsers, fueTotal });
}

// Ordenar por fecha
const sorted = [...snapshots.values()].sort((a, b) => a.date.localeCompare(b.date));

console.log(`\n${sorted.length} snapshots únicos generados.\n`);

// Generar Excel
const outData = [
  ['Fecha', 'Advanced', 'Core', 'Self-Service', 'Sin Clasificar', 'Total Usuarios', 'FUE Total']
];

for (const s of sorted) {
  outData.push([s.date, s.advanced, s.core, s.selfservice, s.sinclasificar, s.totalUsers, s.fueTotal]);
}

const outWb = XLSX.utils.book_new();
const outWs = XLSX.utils.aoa_to_sheet(outData);

// Dar formato de tabla
outWs['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: outData.length - 1, c: 6 } });
outWs['!cols'] = [
  { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 12 }
];

XLSX.utils.book_append_sheet(outWb, outWs, 'Historico');

// Agregar tabla formateada (ListObject) para que Graph API la pueda leer
outWb.Sheets['Historico']['!autofilter'] = { ref: outWs['!ref'] };

XLSX.writeFile(outWb, OUTPUT);
console.log(`Archivo generado: ${OUTPUT}`);
console.log('\nSube este archivo a SharePoint en la misma carpeta que SLIM_UCH_FUE.xlsx');

import { ConfidentialClientApplication } from '@azure/msal-node';
import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const CLIENT_ID     = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const TENANT_ID     = process.env.AZURE_TENANT_ID;
const SITE_URL      = process.env.SHAREPOINT_SITE_URL || 'https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles';

const MANDANTES = {
  PRD100: { label: 'Produccion 100', folder: 'Licencias/Entrada/SLIM_UCH_PRD100', budget: 60 },
  DEV200: { label: 'Desarrollo 200', folder: 'Licencias/Entrada/SLIM_UCH_DEV200', budget: 0 },
  DEV100: { label: 'Desarrollo 100', folder: 'Licencias/Entrada/SLIM_UCH_DEV100', budget: 0 },
};

const EXCLUDE_FILES = ['EXPORT_20251126_161021.xlsx'];
const FUE_MAP  = { Developer: 2, Advanced: 1, Core: 0.2, 'Self-Service': 0.033 };
const FUE_VALS = { developer: 2, advanced: 1, core: 0.2, selfservice: 0.033 };

// ── Auth ────────────────────────────────────────────────────────────────────

const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${TENANT_ID}`,
  },
});

async function getToken() {
  const result = await msalApp.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  return result.accessToken;
}

// ── Graph helpers ───────────────────────────────────────────────────────────

async function graphFetch(url, token) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Graph API ${resp.status} for ${url}: ${body}`);
  }
  return resp.json();
}

async function graphDownload(url, token) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    throw new Error(`Download failed ${resp.status} for ${url}`);
  }
  return resp.arrayBuffer();
}

// ── File listing ────────────────────────────────────────────────────────────

function parseDateFromFilename(name) {
  const m = name.match(/EXPORT_(\d{4})(\d{2})(\d{2})_(\d{6})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

async function listExportFiles(token, siteId, folderPath) {
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}:/children?$filter=name ne 'placeholder'&$orderby=name desc`;
  const result = await graphFetch(url, token);

  return result.value
    .filter(item => item.name.endsWith('.xlsx') && !EXCLUDE_FILES.includes(item.name))
    .map(item => ({
      id: item.id,
      name: item.name,
      driveId: item.parentReference.driveId,
      date: parseDateFromFilename(item.name),
      size: item.size,
    }))
    .filter(f => f.date !== null)
    .sort((a, b) => b.date - a.date);
}

async function downloadExcel(token, siteId, fileInfo) {
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${fileInfo.driveId}/items/${fileInfo.id}/content`;
  const buffer = await graphDownload(url, token);
  return XLSX.read(new Uint8Array(buffer), { type: 'array' });
}

// ── Transform ───────────────────────────────────────────────────────────────

function transformarArchivoCrudo(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length < 2) return [];

  let headerIdx = -1;
  let colUser = -1, colName = -1, colLic = -1, colStatus = -1, colLogin = -1;

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i].map(c => String(c).toLowerCase().trim());
    const userIdx = row.findIndex(c => c.includes('usuario') || c === 'user' || c.includes('usuar'));
    const licIdx = row.findIndex(c =>
      c.includes('clasificación de destino') || c.includes('clasificacion de destino') ||
      c.includes('clasificación destino') || c === 'tipo licencia' || c === 'tipo de licencia'
    );
    if (userIdx >= 0 && licIdx >= 0) {
      headerIdx = i;
      colUser = userIdx;
      colName = row.findIndex(c => c.includes('nombre completo') || c.includes('nombre'));
      colLic = licIdx;
      colStatus = row.findIndex(c => c.includes('estado') || c === 'status');
      colLogin = row.findIndex(c => c.includes('último login') || c.includes('ultimo login') || c.includes('last login'));
      if (colStatus < 0 && data[1] && data[1].length > 7) {
        colStatus = 7;
        colLogin = 8;
      }
      break;
    }
  }

  if (headerIdx < 0) {
    headerIdx = 0; colUser = 0; colName = 1; colLic = 2; colStatus = 4; colLogin = 5;
  }

  function parseType(raw) {
    const s = String(raw).toLowerCase();
    if (s.includes('developer') || /\bga\b/.test(s)) return 'Developer';
    if (s.includes('advanced')) return 'Advanced';
    if (s.includes('core'))     return 'Core';
    if (s.includes('self'))     return 'Self-Service';
    return String(raw) || 'Sin clasificar';
  }

  function parseStatus(raw) {
    const s = String(raw).toLowerCase();
    if (s.includes('activo')) return 'Activo';
    if (s.includes('externo')) return 'Externo';
    if (s.includes('tecnico') || s.includes('técnico')) return 'Técnico';
    return 'Inactivo';
  }

  function parseDate(raw) {
    if (!raw) return null;
    if (typeof raw === 'number') {
      const d = new Date(Date.UTC(1899, 11, 30 + Math.floor(raw)));
      return isNaN(d) ? null : d;
    }
    const s = String(raw).trim();
    if (!s) return null;
    const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  const users = [];
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[colUser]) continue;

    const typeKey = parseType(colLic >= 0 ? row[colLic] : '');
    const loginD = parseDate(colLogin >= 0 ? row[colLogin] : null);
    const days = loginD ? Math.floor((Date.now() - loginD) / 86400000) : 999;

    users.push({
      user:        String(row[colUser] || ''),
      name:        String(colName >= 0 ? row[colName] || '' : ''),
      licenseType: typeKey,
      status:      parseStatus(colStatus >= 0 ? row[colStatus] : ''),
      fue:         FUE_MAP[typeKey] ?? 0,
      lastLogin:   loginD ? loginD.toISOString().split('T')[0] : '—',
      daysInactive: days,
    });
  }

  return users;
}

// ── Historical builder ──────────────────────────────────────────────────────

function construirHistorico(allWorkbooks) {
  const snapshots = new Map();

  for (const { workbook, date } of allWorkbooks) {
    try {
      const ws = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 2) continue;

      const dateKey = date.toISOString().split('T')[0];
      let counts = null;

      if (data.length <= 5) {
        const headersRow = data[0].map(c => String(c).toLowerCase().trim());
        if (headersRow.some(h => h.includes('total'))) {
          const vals = data[1];
          counts = { developer: 0, advanced: 0, core: 0, selfservice: 0, sinclasificar: 0 };
          headersRow.forEach((h, i) => {
            const v = Number(vals[i]) || 0;
            if (h.includes('developer') || /\bga\b/.test(h)) counts.developer = v;
            else if (h.includes('advanced')) counts.advanced = v;
            else if (h.includes('core'))     counts.core = v;
            else if (h.includes('self'))     counts.selfservice = v;
            else if (h.includes('sin clas')) counts.sinclasificar = v;
          });
        }
      }

      if (!counts) {
        let headerIdx = -1, typeColIdx = -1;
        for (let i = 0; i < Math.min(5, data.length); i++) {
          const row = data[i].map(c => String(c).toLowerCase().trim());
          const tIdx = row.findIndex(c =>
            c.includes('clasificación de destino') || c.includes('clasificacion de destino') ||
            c.includes('clasificación destino') || c === 'tipo licencia' || c === 'tipo de licencia'
          );
          if (tIdx >= 0) { headerIdx = i; typeColIdx = tIdx; break; }
          const fIdx = row.findIndex(c => c === 'fues' || c === 'fue');
          if (fIdx >= 0) {
            headerIdx = i;
            typeColIdx = row.findIndex(c => c.includes('clasificación') || c.includes('clasificacion') || c === 'tipo licencia');
            break;
          }
        }

        if (headerIdx < 0) { headerIdx = 0; typeColIdx = 2; }

        if (typeColIdx >= 0) {
          counts = { developer: 0, advanced: 0, core: 0, selfservice: 0, sinclasificar: 0 };
          for (let i = headerIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0]) continue;
            const typeRaw = row[typeColIdx];
            if (!typeRaw) continue;
            const s = String(typeRaw).toLowerCase();
            if (s.includes('developer') || /\bga\b/.test(s)) counts.developer++;
            else if (s.includes('advanced')) counts.advanced++;
            else if (s.includes('core'))     counts.core++;
            else if (s.includes('self'))     counts.selfservice++;
            else                             counts.sinclasificar++;
          }
        }
      }

      if (!counts) continue;

      const totalUsers = counts.developer + counts.advanced + counts.core + counts.selfservice + counts.sinclasificar;
      const fueTotal = +(counts.developer * FUE_VALS.developer + counts.advanced * FUE_VALS.advanced + counts.core * FUE_VALS.core + counts.selfservice * FUE_VALS.selfservice).toFixed(3);

      if (snapshots.has(dateKey)) {
        const prev = snapshots.get(dateKey);
        if (totalUsers <= prev.users) continue;
      }

      snapshots.set(dateKey, { date: dateKey, fue: fueTotal, users: totalUsers });
    } catch (e) {
      console.warn(`Error procesando archivo:`, e.message);
      continue;
    }
  }

  return [...snapshots.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({ date: s.date, fue: s.fue }));
}

// ── Main orchestrator ───────────────────────────────────────────────────────

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
    console.error('Missing env vars: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID');
    process.exit(1);
  }

  console.log('Authenticating...');
  const token = await getToken();

  const siteUrlObj = new URL(SITE_URL);
  const siteData = await graphFetch(
    `https://graph.microsoft.com/v1.0/sites/${siteUrlObj.hostname}:${siteUrlObj.pathname}`,
    token
  );
  const siteId = siteData.id;
  console.log(`Site resolved: ${siteId}`);

  const snapshot = {
    generatedAt: new Date().toISOString(),
    mandantes: {},
  };

  for (const [id, mandante] of Object.entries(MANDANTES)) {
    console.log(`\nProcessing ${id} (${mandante.label})...`);
    try {
      const archivos = await listExportFiles(token, siteId, mandante.folder);
      if (!archivos.length) {
        console.warn(`  No EXPORT files found in ${mandante.folder}`);
        snapshot.mandantes[id] = {
          label: mandante.label,
          budget: mandante.budget,
          users: [],
          historical: [],
        };
        continue;
      }

      console.log(`  Found ${archivos.length} files, latest: ${archivos[0].name}`);

      const latestWb = await downloadExcel(token, siteId, archivos[0]);
      const users = transformarArchivoCrudo(latestWb);
      console.log(`  Parsed ${users.length} users from ${archivos[0].name}`);

      const allWorkbooks = [];
      for (const archivo of archivos) {
        try {
          const wb = await downloadExcel(token, siteId, archivo);
          allWorkbooks.push({ workbook: wb, date: archivo.date });
        } catch (e) {
          console.warn(`  Skipping ${archivo.name}: ${e.message}`);
        }
      }
      const historical = construirHistorico(allWorkbooks);
      console.log(`  Built ${historical.length} historical data points`);

      if (users.length) {
        const today = new Date().toISOString().split('T')[0];
        const totalFue = +users.reduce((s, r) => s + r.fue, 0).toFixed(3);
        const last = historical[historical.length - 1];
        if (!last || last.date !== today) {
          historical.push({ date: today, fue: totalFue });
        }
      }

      snapshot.mandantes[id] = {
        label: mandante.label,
        budget: mandante.budget,
        users,
        historical,
      };
    } catch (e) {
      console.error(`  Error processing ${id}: ${e.message}`);
      snapshot.mandantes[id] = {
        label: mandante.label,
        budget: mandante.budget,
        users: [],
        historical: [],
      };
    }
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outPath = resolve(__dirname, '..', 'snapshot.json');
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot written to ${outPath}`);
  console.log(`Generated at: ${snapshot.generatedAt}`);
  for (const [id, m] of Object.entries(snapshot.mandantes)) {
    console.log(`  ${id}: ${m.users.length} users, ${m.historical.length} historical points`);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

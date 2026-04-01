# Dashboard con Transformacion Integrada - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate Power Automate, Office Script, and the intermediate SharePoint folder by having the dashboard read raw SLIM_UCH exports directly and transform them in-browser.

**Architecture:** The dashboard will use Graph API to list files in the Entrada folder, download raw Excel files as ArrayBuffer, parse them with SheetJS (XLSX.js) in the browser, and apply the same transformation logic that the Office Script currently handles. Historical data is built by processing all files in the folder instead of reading a pre-generated SLIM_UCH_HISTORICO.xlsx.

**Tech Stack:** HTML/JS (vanilla), SheetJS/XLSX.js (browser CDN), MSAL.js, Chart.js, Microsoft Graph API

---

### Task 1: Add SheetJS browser dependency

Currently XLSX.js is only used in Node.js (`generar_historico.js`). The dashboard needs it in the browser to parse raw Excel files.

**Files:**
- Modify: `sap_license_dashboard.html:9` (add script tag after Chart.js)

- [ ] **Step 1: Add XLSX.js CDN script tag**

In `sap_license_dashboard.html`, after line 8 (the Chart.js script tag), add:

```html
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
```

The file should look like:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.27.0/lib/msal-browser.min.js"></script>
```

- [ ] **Step 2: Verify it loads**

Open `http://localhost:5500/sap_license_dashboard.html` in the browser, open DevTools console, and type `XLSX.version`. It should return `"0.20.3"`.

- [ ] **Step 3: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: add SheetJS browser dependency for client-side Excel parsing"
```

---

### Task 2: Add function to list files in the Entrada folder

The dashboard needs to list all Excel files in the SharePoint Entrada folder via Graph API, and sort them by date extracted from the filename.

**Files:**
- Modify: `sap_license_dashboard.html` (add new function in the `// ── GRAPH HELPERS` section, around line 367)

- [ ] **Step 1: Add `parseDateFromFilename` helper**

After the `graphFetch` function (after line 381), add:

```javascript
// ── FILE LISTING ─────────────────────────────────────────
function parseDateFromFilename(name) {
  const m = name.match(/EXPORT_(\d{4})(\d{2})(\d{2})_(\d{6})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
```

- [ ] **Step 2: Add `listarArchivosEntrada` function**

Right after `parseDateFromFilename`, add:

```javascript
async function listarArchivosEntrada(headers, siteId, folderPath) {
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${folderPath}:/children?$filter=name ne 'placeholder'&$orderby=name desc`;
  const result = await graphFetch(url, headers, 'list-files');
  
  const excludeFiles = ['EXPORT_20251126_161021.xlsx'];
  
  return result.value
    .filter(item => item.name.endsWith('.xlsx') && !excludeFiles.includes(item.name))
    .map(item => ({
      id: item.id,
      name: item.name,
      driveId: item.parentReference.driveId,
      date: parseDateFromFilename(item.name),
      size: item.size
    }))
    .filter(f => f.date !== null)
    .sort((a, b) => b.date - a.date);
}
```

This function:
- Lists all children of the Entrada folder
- Filters to .xlsx files only, excluding known bad files
- Extracts date from filename
- Sorts newest first (so index 0 = most recent)

- [ ] **Step 3: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: add function to list Excel files from SharePoint Entrada folder"
```

---

### Task 3: Add function to download and parse raw Excel files

The dashboard needs to download raw Excel files from SharePoint as binary and parse them with SheetJS.

**Files:**
- Modify: `sap_license_dashboard.html` (add after `listarArchivosEntrada`)

- [ ] **Step 1: Add `descargarExcel` function**

After `listarArchivosEntrada`, add:

```javascript
async function descargarExcel(headers, siteId, fileInfo) {
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${fileInfo.driveId}/items/${fileInfo.id}/content`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    throw { step: 'download', code: resp.status, detail: `No se pudo descargar ${fileInfo.name}` };
  }
  const buffer = await resp.arrayBuffer();
  return XLSX.read(buffer, { type: 'array' });
}
```

- [ ] **Step 2: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: add function to download and parse raw Excel files from SharePoint"
```

---

### Task 4: Add function to transform raw Excel data

Port the Office Script logic to JavaScript. This function takes a SheetJS workbook (raw SLIM_UCH export) and returns the same user array format that `fetchFromSharePoint` currently returns.

**Files:**
- Modify: `sap_license_dashboard.html` (add after `descargarExcel`)

- [ ] **Step 1: Add `transformarArchivoCrudo` function**

After `descargarExcel`, add:

```javascript
function transformarArchivoCrudo(workbook) {
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (data.length < 2) return [];

  // Find header row (within first 5 rows)
  let headerIdx = -1;
  let colUser = -1, colName = -1, colLic = -1, colStatus = -1, colLogin = -1;

  for (let i = 0; i < Math.min(5, data.length); i++) {
    const row = data[i].map(c => String(c).toLowerCase().trim());
    const userIdx = row.findIndex(c => c.includes('usuario') || c === 'user');
    const licIdx = row.findIndex(c => c.includes('clasificación de destino') || c.includes('clasificacion de destino') || c.includes('clasificación destino'));
    if (userIdx >= 0 && licIdx >= 0) {
      headerIdx = i;
      colUser = userIdx;
      colName = row.findIndex(c => c.includes('nombre completo') || c.includes('nombre'));
      colLic = licIdx;
      colStatus = row.findIndex(c => c.includes('estado') || c === 'status');
      colLogin = row.findIndex(c => c.includes('último login') || c.includes('ultimo login') || c.includes('last login'));
      break;
    }
  }

  // Fallback to Office Script column positions (A=0, B=1, E=4, H=7, I=8)
  if (headerIdx < 0) {
    headerIdx = 0;
    colUser = 0;
    colName = 1;
    colLic = 4;
    colStatus = 7;
    colLogin = 8;
  }

  function parseType(raw) {
    const s = String(raw).toLowerCase();
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
    // SheetJS numeric date (Excel serial number)
    if (typeof raw === 'number') {
      const d = new Date(Date.UTC(1899, 11, 30 + Math.floor(raw)));
      return isNaN(d) ? null : d;
    }
    const s = String(raw).trim();
    if (!s) return null;
    // dd-MM-yyyy or dd/MM/yyyy
    const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
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
      user:         String(row[colUser] || ''),
      name:         String(colName >= 0 ? row[colName] || '' : ''),
      licenseType:  typeKey,
      status:       parseStatus(colStatus >= 0 ? row[colStatus] : ''),
      fue:          FUE_MAP[typeKey] ?? 0,
      lastLogin:    loginD ? loginD.toISOString().split('T')[0] : '—',
      daysInactive: days
    });
  }

  return users;
}
```

- [ ] **Step 2: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: add raw Excel transformation function (ports Office Script logic to JS)"
```

---

### Task 5: Add function to build historical data from all files

Port the `generar_historico.js` logic to run in the browser. This function processes all files from the Entrada folder and returns the historical dataset.

**Files:**
- Modify: `sap_license_dashboard.html` (add after `transformarArchivoCrudo`)

- [ ] **Step 1: Add `construirHistorico` function**

After `transformarArchivoCrudo`, add:

```javascript
async function construirHistorico(headers, siteId, archivos) {
  const FUE_VALS = { advanced: 1, core: 0.2, selfservice: 0.033 };
  const snapshots = new Map();

  for (const archivo of archivos) {
    try {
      const wb = await descargarExcel(headers, siteId, archivo);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 2) continue;

      const dateKey = archivo.date.toISOString().split('T')[0];
      let counts = null;

      // Try summary format first (2-5 rows)
      if (data.length <= 5) {
        const headers_row = data[0].map(c => String(c).toLowerCase().trim());
        if (headers_row.some(h => h.includes('total'))) {
          const vals = data[1];
          counts = { advanced: 0, core: 0, selfservice: 0, sinclasificar: 0 };
          headers_row.forEach((h, i) => {
            const v = Number(vals[i]) || 0;
            if (h.includes('advanced'))      counts.advanced = v;
            else if (h.includes('core'))     counts.core = v;
            else if (h.includes('self'))     counts.selfservice = v;
            else if (h.includes('sin clas')) counts.sinclasificar = v;
          });
        }
      }

      // Try user-level format
      if (!counts) {
        let headerIdx = -1, typeColIdx = -1;
        for (let i = 0; i < Math.min(5, data.length); i++) {
          const row = data[i].map(c => String(c).toLowerCase().trim());
          const tIdx = row.findIndex(c => c.includes('clasificación de destino') || c.includes('clasificacion de destino') || c.includes('clasificación destino'));
          if (tIdx >= 0) { headerIdx = i; typeColIdx = tIdx; break; }
          const fIdx = row.findIndex(c => c === 'fues' || c === 'fue');
          if (fIdx >= 0) { headerIdx = i; typeColIdx = row.findIndex(c => c.includes('clasificación') || c.includes('clasificacion')); break; }
        }

        // Fallback to column E (index 4)
        if (headerIdx < 0) { headerIdx = 0; typeColIdx = 4; }

        if (typeColIdx >= 0) {
          counts = { advanced: 0, core: 0, selfservice: 0, sinclasificar: 0 };
          for (let i = headerIdx + 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0]) continue;
            const typeRaw = row[typeColIdx];
            if (!typeRaw) continue;
            const s = String(typeRaw).toLowerCase();
            if (s.includes('advanced'))      counts.advanced++;
            else if (s.includes('core'))     counts.core++;
            else if (s.includes('self'))     counts.selfservice++;
            else                             counts.sinclasificar++;
          }
        }
      }

      if (!counts) continue;

      const totalUsers = counts.advanced + counts.core + counts.selfservice + counts.sinclasificar;
      const fueTotal = +(counts.advanced * FUE_VALS.advanced + counts.core * FUE_VALS.core + counts.selfservice * FUE_VALS.selfservice).toFixed(3);

      // Deduplicate by date: keep the one with more users
      if (snapshots.has(dateKey)) {
        const prev = snapshots.get(dateKey);
        if (totalUsers <= prev.users) continue;
      }

      snapshots.set(dateKey, { date: dateKey, fue: fueTotal, users: totalUsers });
    } catch (e) {
      console.warn(`Error procesando ${archivo.name}:`, e);
      continue;
    }
  }

  return [...snapshots.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({ month: formatHistDate(s.date), fue: s.fue }));
}
```

- [ ] **Step 2: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: add historical data builder from raw files (replaces generar_historico.js)"
```

---

### Task 6: Update modal config defaults

Change the file path label and placeholder to point to the Entrada folder instead of a single file.

**Files:**
- Modify: `sap_license_dashboard.html:193-196` (modal HTML)

- [ ] **Step 1: Update label and placeholder**

Change the label from "Ruta del archivo Excel" to "Carpeta de archivos Excel" and update the placeholder:

Find this block (lines 192-196):
```html
    <label class="field-label">Ruta del archivo Excel</label>
    <div class="step"><div class="step-num">→</div><div class="step">Relativa a la raíz del drive. Haz clic en <strong>Explorar</strong> para buscar el archivo.</div></div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input class="field-input" id="cfgFilePath" placeholder="Licencias/Salida/SLIM_UCH_FUE.xlsx" style="margin-bottom:0;flex:1"/>
```

Replace with:
```html
    <label class="field-label">Carpeta de archivos SLIM_UCH</label>
    <div class="step"><div class="step-num">→</div><div class="step">Carpeta donde caen los exports de SAP. El dashboard lee todos los archivos <code>EXPORT_*.xlsx</code> automáticamente.</div></div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input class="field-input" id="cfgFilePath" placeholder="Licencias/Entrada/SLIM_UCH" style="margin-bottom:0;flex:1"/>
```

- [ ] **Step 2: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: update modal config to reference Entrada folder instead of single file"
```

---

### Task 7: Replace `fetchFromSharePoint` and `fetchHistorical` with new flow

This is the core change: replace the current data loading logic to use the new functions.

**Files:**
- Modify: `sap_license_dashboard.html` — replace `fetchFromSharePoint` (lines 407-502) and `fetchHistorical` (lines 505-563)

- [ ] **Step 1: Replace `fetchFromSharePoint` function**

Replace the entire `fetchFromSharePoint` function (lines 407-502) with:

```javascript
async function fetchFromSharePoint() {
  const headers = spHeaders;
  const siteId = spSiteId;
  const folderPath = CFG.filePath.replace(/^\//, '');

  // Paso 3: Listar archivos en la carpeta
  setLoading('Paso 3/5 · Listando archivos en carpeta...');
  const archivos = await listarArchivosEntrada(headers, siteId, folderPath);

  if (!archivos.length) {
    throw { step: 'file', code: 'EMPTY', detail: `No se encontraron archivos EXPORT_*.xlsx en la carpeta ${folderPath}` };
  }

  // Paso 4: Descargar y transformar el mas reciente
  const masReciente = archivos[0];
  setLoading(`Paso 4/5 · Procesando ${masReciente.name}...`);
  const wb = await descargarExcel(headers, siteId, masReciente);
  const users = transformarArchivoCrudo(wb);

  if (!users.length) {
    throw { step: 'rows', code: 'EMPTY', detail: `El archivo ${masReciente.name} no contiene datos de usuarios válidos.` };
  }

  // Store archivos list for historical processing
  window._spArchivos = archivos;

  return users;
}
```

- [ ] **Step 2: Replace `fetchHistorical` function**

Replace the entire `fetchHistorical` function (lines 505-563) with:

```javascript
async function fetchHistorical(headers, siteId) {
  const archivos = window._spArchivos;
  if (!archivos || archivos.length < 2) return null;
  return await construirHistorico(headers, siteId, archivos);
}
```

- [ ] **Step 3: Update error messages in `loadData`**

In the `loadData` function, find the `stepFixes` object (around line 931) and update the `file` and `tables` entries:

Replace the `file` entry:
```javascript
      file: `<li>Carpeta configurada: <code>${CFG.filePath||'(vacía)'}</code></li>
             <li>Verifica que la carpeta exista en SharePoint y contenga archivos EXPORT_*.xlsx</li>
             <li>Si ejecutaste SLIM_UCH recientemente, el archivo puede estar subiendo — espera unos segundos y recarga</li>
             <li>El permiso <code>Files.Read.All</code> delegado debe tener <strong>admin consent</strong></li>`,
```

Replace the `tables` entry:
```javascript
      tables:`<li>No se encontraron archivos válidos en la carpeta</li>
              <li>Los archivos deben llamarse <code>EXPORT_YYYYMMDD_HHMMSS.xlsx</code></li>`,
```

Also add `'list-files'` to the `retryableSteps` array (around line 904):
```javascript
    const retryableSteps = ['file','tables','columns','rows','list-files','download'];
```

- [ ] **Step 4: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: replace SharePoint data flow to read raw files from Entrada folder

Eliminates dependency on Power Automate, Office Script, and Salida folder.
Dashboard now reads raw SLIM_UCH exports directly and transforms in-browser."
```

---

### Task 8: Update loading steps text in `loadData`

The loading steps should reflect the new flow (no longer mentions "tabla de licencias" or "archivo histórico").

**Files:**
- Modify: `sap_license_dashboard.html` — `loadData` function

- [ ] **Step 1: Update step 5 loading text**

In the `loadData` function, find (around line 876):
```javascript
      setLoading('Paso 5/5 · Cargando datos históricos...');
```

Replace with:
```javascript
      setLoading('Paso 5/5 · Construyendo datos históricos...');
```

- [ ] **Step 2: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "chore: update loading step text to reflect new data flow"
```

---

### Task 9: Manual end-to-end test

Verify the complete flow works with real SharePoint data.

**Files:** None (testing only)

- [ ] **Step 1: Update config in the dashboard**

Open the dashboard, click "Configurar", and set:
- Client ID: (existing value)
- Tenant ID: (existing value)
- SharePoint Site URL: `https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles`
- Carpeta: `Licencias/Entrada/SLIM_UCH`
- FUEs Contratadas: (existing value)

Click "Guardar y conectar".

- [ ] **Step 2: Verify dashboard loads**

Check:
- Loading steps show: "Listando archivos..." then "Procesando EXPORT_*.xlsx..."
- KPI cards populate with real data
- User table shows all users with correct columns
- No console errors

- [ ] **Step 3: Verify historical chart**

Check:
- Historical line chart shows multiple data points (one per export file date)
- FUE values look reasonable
- Trend line renders correctly

- [ ] **Step 4: Verify demo mode still works**

Clear localStorage (`localStorage.removeItem('sap_fue_cfg2')`) and reload. Demo mode should work as before.

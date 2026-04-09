# Multi-Mandante Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-mandante support (PRD100, DEV200, DEV100) to the SAP FUE license dashboard with a header dropdown selector, per-mandante config, and budget-differentiated rendering.

**Architecture:** Single-file modification to `sap_license_dashboard.html`. New config structure in localStorage (`sap_fue_cfg3`) with auto-migration from old format. Header dropdown triggers full data reload from the selected mandante's SharePoint folder. Gauge/KPI rendering adapts based on whether the mandante has a budget > 0.

**Tech Stack:** HTML/CSS/JS (vanilla), Chart.js, SheetJS, MSAL.js — all unchanged, no new dependencies.

**Spec:** `docs/specs/2026-04-09-multi-mandante-design.md`

---

### Task 1: Update constants, defaults, and config migration

**Files:**
- Modify: `sap_license_dashboard.html:329-337` (constants and state)

- [ ] **Step 1: Update FUE_MAP and add MANDANTE_DEFAULTS**

Replace lines 329-337:

```js
// ── CONSTANTS ─────────────────────────────────────────────
const FUE_MAP = { 'Developer':2, 'Advanced':1, 'Core':0.2, 'Self-Service':0.033 };
const SCOPES  = ['https://graph.microsoft.com/Sites.Read.All','https://graph.microsoft.com/Files.Read.All'];
const MANDANTE_DEFAULTS = {
  PRD100: { label:'Producción 100', folder:'Licencias/Entrada/SLIM_UCH_PRD100', budget:60 },
  DEV200: { label:'Desarrollo 200', folder:'Licencias/Entrada/SLIM_UCH_DEV200', budget:0 },
  DEV100: { label:'Desarrollo 100', folder:'Licencias/Entrada/SLIM_UCH_DEV100', budget:0 }
};
```

- [ ] **Step 2: Add migration function and update CFG initialization**

Replace lines 333-337 (the old state section) with:

```js
// ── STATE ─────────────────────────────────────────────────
function migrateConfig() {
  const old = JSON.parse(localStorage.getItem('sap_fue_cfg2') || 'null');
  if (!old) return null;
  const cfg = {
    clientId: old.clientId || '',
    tenantId: old.tenantId || '',
    siteUrl:  old.siteUrl  || '',
    activeMandante: 'PRD100',
    mandantes: {
      PRD100: { label:'Producción 100', folder: old.filePath || MANDANTE_DEFAULTS.PRD100.folder, budget: old.budget || 60 },
      DEV200: { ...MANDANTE_DEFAULTS.DEV200 },
      DEV100: { ...MANDANTE_DEFAULTS.DEV100 }
    }
  };
  localStorage.setItem('sap_fue_cfg3', JSON.stringify(cfg));
  localStorage.removeItem('sap_fue_cfg2');
  return cfg;
}

let CFG = JSON.parse(localStorage.getItem('sap_fue_cfg3') || 'null') || migrateConfig() || {};
let msalApp = null;
let allData = [], activeFilter = 'all', sortCol = 'user', sortDir = 1;
let lineChart, gaugeChart, donutChart;
```

- [ ] **Step 3: Add helper to get active mandante config**

Add right after the state section:

```js
function getActiveMandante() {
  const id = CFG.activeMandante || 'PRD100';
  return CFG.mandantes?.[id] || MANDANTE_DEFAULTS[id];
}
```

- [ ] **Step 4: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: add FUE_MAP Developer type, mandante defaults, and config migration"
```

---

### Task 2: Add CSS for dropdown and collapsible mandante blocks

**Files:**
- Modify: `sap_license_dashboard.html:10-149` (style section)

- [ ] **Step 1: Add dropdown styles**

Insert before the closing `</style>` tag (before line 149), after the media queries on line 148:

```css
  .mandante-select{background:var(--surface2);border:1px solid var(--border);color:var(--accent);font-family:var(--fm);font-size:12px;padding:6px 12px;border-radius:6px;cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2300e5ff'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;padding-right:28px;transition:border-color .2s}
  .mandante-select:hover,.mandante-select:focus{border-color:var(--accent)}
  .mandante-select option{background:var(--surface);color:var(--text)}

  .mandante-block{border:1px solid var(--border);border-radius:8px;margin-bottom:12px;overflow:hidden}
  .mandante-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;font-family:var(--fh);font-size:13px;font-weight:600;background:var(--surface2);transition:background .2s;user-select:none}
  .mandante-header:hover{background:rgba(0,229,255,.06)}
  .mandante-header .chevron{font-size:10px;color:var(--muted);transition:transform .2s}
  .mandante-header.open .chevron{transform:rotate(180deg)}
  .mandante-body{padding:14px;display:none}
  .mandante-body.open{display:block}

  .b-dev{background:rgba(160,120,255,.12);color:#a078ff}
```

- [ ] **Step 2: Add CSS variable for Developer color**

In the `:root` block (line 11-16), append `--dev:#a078ff;` after `--ss:#ff6b35;`:

Change line 15 from:
```css
    --adv:#00e5ff;--cor:#7bed9f;--ss:#ff6b35;
```
to:
```css
    --adv:#00e5ff;--cor:#7bed9f;--ss:#ff6b35;--dev:#a078ff;
```

- [ ] **Step 3: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "style: add dropdown, collapsible blocks, and Developer badge CSS"
```

---

### Task 3: Add mandante dropdown to header

**Files:**
- Modify: `sap_license_dashboard.html:158-165` (header HTML)

- [ ] **Step 1: Add dropdown between logo and header-right**

Replace lines 158-165:

```html
<header>
  <div class="logo"><span class="logo-badge">SAP</span>License Monitor</div>
  <select class="mandante-select" id="mandanteSelect" onchange="switchMandante(this.value)">
    <option value="PRD100">PRD 100 · Producción</option>
    <option value="DEV200">DEV 200 · Desarrollo</option>
    <option value="DEV100">DEV 100 · Desarrollo</option>
  </select>
  <div class="header-right">
    <div class="status-dot"></div>
    <span class="last-update" id="lastUpdate">—</span>
    <button class="btn-hd" id="btnSession" onclick="handleSessionBtn()">⚙ Configurar</button>
  </div>
</header>
```

- [ ] **Step 2: Add switchMandante function**

Add in the `<script>` section, after the `getActiveMandante()` function:

```js
function switchMandante(id) {
  if (!CFG.mandantes?.[id]) return;
  CFG.activeMandante = id;
  localStorage.setItem('sap_fue_cfg3', JSON.stringify(CFG));
  loadData();
}

function syncMandanteSelect() {
  const sel = document.getElementById('mandanteSelect');
  if (sel) sel.value = CFG.activeMandante || 'PRD100';
}
```

- [ ] **Step 3: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: add mandante selector dropdown in header"
```

---

### Task 4: Restructure modal for multi-mandante config

**Files:**
- Modify: `sap_license_dashboard.html:167-215` (modal HTML)

- [ ] **Step 1: Replace modal HTML**

Replace lines 167-215 (the entire modal-overlay div) with:

```html
<!-- MODAL -->
<div class="modal-overlay" id="modalOverlay">
  <div class="modal">
    <div class="modal-title">Conectar a SharePoint</div>
    <div class="modal-sub">Configuración compartida para todos los mandantes. Cada mandante tiene su propia carpeta de datos.</div>

    <div class="banner banner-info" style="margin-bottom:16px">
      <span class="banner-icon">ℹ</span>
      <div><strong>Configuración única en Azure AD:</strong><br>
      Registra una app → agrega permisos <code>Sites.Read.All</code> y <code>Files.Read.All</code> (delegados, con admin consent) → en <em>Authentication</em> agrega la URL de este archivo como <strong>Redirect URI</strong> de tipo <strong>Single-page application (SPA)</strong>.</div>
    </div>

    <label class="field-label">Client ID (Application ID)</label>
    <input class="field-input" id="cfgClientId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>

    <label class="field-label">Tenant ID (Directory ID)</label>
    <input class="field-input" id="cfgTenantId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>

    <div class="divider"></div>

    <label class="field-label">SharePoint Site URL</label>
    <input class="field-input" id="cfgSiteUrl" placeholder="https://tuempresa.sharepoint.com/sites/nombre-sitio"/>

    <div class="divider"></div>
    <label class="field-label" style="margin-bottom:12px">Mandantes SAP</label>

    <div class="mandante-block">
      <div class="mandante-header open" onclick="toggleMandanteBlock(this)">
        <span>PRD 100 · Producción</span><span class="chevron">▼</span>
      </div>
      <div class="mandante-body open">
        <label class="field-label">Carpeta SharePoint</label>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input class="field-input" id="cfgFolderPRD100" placeholder="Licencias/Entrada/SLIM_UCH_PRD100" style="margin-bottom:0;flex:1"/>
          <button class="btn-secondary" onclick="browseFiles(null,'cfgFolderPRD100')" style="white-space:nowrap;height:42px">📂</button>
        </div>
        <label class="field-label">FUEs Contratadas (presupuesto)</label>
        <input class="field-input" id="cfgBudgetPRD100" type="number" placeholder="60"/>
      </div>
    </div>

    <div class="mandante-block">
      <div class="mandante-header" onclick="toggleMandanteBlock(this)">
        <span>DEV 200 · Desarrollo</span><span class="chevron">▼</span>
      </div>
      <div class="mandante-body">
        <label class="field-label">Carpeta SharePoint</label>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input class="field-input" id="cfgFolderDEV200" placeholder="Licencias/Entrada/SLIM_UCH_DEV200" style="margin-bottom:0;flex:1"/>
          <button class="btn-secondary" onclick="browseFiles(null,'cfgFolderDEV200')" style="white-space:nowrap;height:42px">📂</button>
        </div>
        <label class="field-label">FUEs Contratadas (presupuesto)</label>
        <input class="field-input" id="cfgBudgetDEV200" type="number" placeholder="0"/>
      </div>
    </div>

    <div class="mandante-block">
      <div class="mandante-header" onclick="toggleMandanteBlock(this)">
        <span>DEV 100 · Desarrollo</span><span class="chevron">▼</span>
      </div>
      <div class="mandante-body">
        <label class="field-label">Carpeta SharePoint</label>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input class="field-input" id="cfgFolderDEV100" placeholder="Licencias/Entrada/SLIM_UCH_DEV100" style="margin-bottom:0;flex:1"/>
          <button class="btn-secondary" onclick="browseFiles(null,'cfgFolderDEV100')" style="white-space:nowrap;height:42px">📂</button>
        </div>
        <label class="field-label">FUEs Contratadas (presupuesto)</label>
        <input class="field-input" id="cfgBudgetDEV100" type="number" placeholder="0"/>
      </div>
    </div>

    <div id="fileBrowser" style="display:none;max-height:250px;overflow-y:auto;background:var(--surface2);border:1px solid var(--border);border-radius:6px;margin-bottom:16px">
      <div id="fileBrowserPath" style="padding:8px 12px;font-family:var(--fm);font-size:11px;color:var(--accent);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:6px">
        <span id="fileBrowserCrumb">/</span>
      </div>
      <div id="fileBrowserList" style="padding:4px 0"></div>
      <div id="fileBrowserLoading" style="padding:12px;text-align:center;font-size:12px;color:var(--muted);display:none">Cargando...</div>
    </div>

    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancelar</button>
      <button class="btn-primary" onclick="saveAndConnect()">Guardar y conectar</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add toggleMandanteBlock function**

Add in the `<script>` section near the modal functions:

```js
function toggleMandanteBlock(header) {
  header.classList.toggle('open');
  header.nextElementSibling.classList.toggle('open');
}
```

- [ ] **Step 3: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: restructure modal with per-mandante config blocks"
```

---

### Task 5: Update parseType() for Developer license

**Files:**
- Modify: `sap_license_dashboard.html` — `parseType()` function inside `transformarArchivoCrudo()` (around line 455-461)

- [ ] **Step 1: Add Developer/GA detection to parseType()**

Replace the existing `parseType` function:

```js
  function parseType(raw) {
    const s = String(raw).toLowerCase();
    if (s.includes('developer') || /\bga\b/.test(s)) return 'Developer';
    if (s.includes('advanced')) return 'Advanced';
    if (s.includes('core'))     return 'Core';
    if (s.includes('self'))     return 'Self-Service';
    return String(raw) || 'Sin clasificar';
  }
```

- [ ] **Step 2: Update badge class mapping in renderTable()**

In `renderTable()`, update the badge class mapping (around line 762):

Change:
```js
  const bCls=t=>({'Advanced':'b-adv','Core':'b-cor','Self-Service':'b-ss'}[t]||'');
```
To:
```js
  const bCls=t=>({'Developer':'b-dev','Advanced':'b-adv','Core':'b-cor','Self-Service':'b-ss'}[t]||'');
```

- [ ] **Step 3: Update color mapping in renderDashboard()**

In `renderDashboard()`, update the type-color maps. The `tc` object (around line 705):

Change:
```js
  const tc={'Advanced':'var(--adv)','Core':'var(--cor)','Self-Service':'var(--ss)'};
```
To:
```js
  const tc={'Developer':'var(--dev)','Advanced':'var(--adv)','Core':'var(--cor)','Self-Service':'var(--ss)'};
```

And the donut colors object (around line 718):

Change:
```js
  const dC=dL.map(t=>({'Advanced':'#00e5ff','Core':'#7bed9f','Self-Service':'#ff6b35'}[t]||'#888'));
```
To:
```js
  const dC=dL.map(t=>({'Developer':'#a078ff','Advanced':'#00e5ff','Core':'#7bed9f','Self-Service':'#ff6b35'}[t]||'#888'));
```

- [ ] **Step 4: Add Developer filter chip**

In the HTML filter row (around line 307), add a Developer chip after the Advanced chip:

Change:
```html
        <span class="chip" onclick="setFilter('Advanced',this)">Advanced</span>
```
To:
```html
        <span class="chip" onclick="setFilter('Developer',this)">Developer</span>
        <span class="chip" onclick="setFilter('Advanced',this)">Advanced</span>
```

- [ ] **Step 5: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: add Developer (GA) license type detection and UI support"
```

---

### Task 6: Update openModal() and saveAndConnect() for multi-mandante

**Files:**
- Modify: `sap_license_dashboard.html` — modal functions (around lines 889-910)

- [ ] **Step 1: Rewrite openModal()**

Replace the existing `openModal()`:

```js
function openModal() {
  if (CFG.clientId) document.getElementById('cfgClientId').value = CFG.clientId;
  if (CFG.tenantId) document.getElementById('cfgTenantId').value = CFG.tenantId;
  if (CFG.siteUrl)  document.getElementById('cfgSiteUrl').value  = CFG.siteUrl;

  const mandantes = CFG.mandantes || MANDANTE_DEFAULTS;
  for (const [id, def] of Object.entries(MANDANTE_DEFAULTS)) {
    const m = mandantes[id] || def;
    const folderInput = document.getElementById('cfgFolder' + id);
    const budgetInput = document.getElementById('cfgBudget' + id);
    if (folderInput) folderInput.value = m.folder || def.folder;
    if (budgetInput) budgetInput.value = m.budget ?? def.budget;
  }

  document.getElementById('modalOverlay').classList.add('open');
}
```

- [ ] **Step 2: Rewrite saveAndConnect()**

Replace the existing `saveAndConnect()`:

```js
async function saveAndConnect() {
  const mandantes = {};
  for (const [id, def] of Object.entries(MANDANTE_DEFAULTS)) {
    mandantes[id] = {
      label:  def.label,
      folder: document.getElementById('cfgFolder' + id)?.value.trim() || def.folder,
      budget: parseFloat(document.getElementById('cfgBudget' + id)?.value) || 0
    };
  }

  CFG = {
    clientId: document.getElementById('cfgClientId').value.trim(),
    tenantId: document.getElementById('cfgTenantId').value.trim(),
    siteUrl:  document.getElementById('cfgSiteUrl').value.trim(),
    activeMandante: CFG.activeMandante || 'PRD100',
    mandantes
  };
  localStorage.setItem('sap_fue_cfg3', JSON.stringify(CFG));
  syncMandanteSelect();
  closeModal();
  await loadData();
}
```

- [ ] **Step 3: Update browseFiles() to accept target input ID**

The `browseFiles()` function signature (around line 782) changes. Update the function signature and the `selectBrowsedFile` function:

Change `async function browseFiles(folderPath)` to:
```js
let browseTargetInput = 'cfgFolderPRD100';

async function browseFiles(folderPath, targetInputId) {
  if (targetInputId) browseTargetInput = targetInputId;
```

And update `selectBrowsedFile()`:

```js
function selectBrowsedFile(path) {
  // Set the folder value — extract just the folder path (remove filename if a file was clicked)
  const folder = path.includes('.') ? path.substring(0, path.lastIndexOf('/')) : path;
  document.getElementById(browseTargetInput).value = folder;
  document.getElementById('fileBrowser').style.display = 'none';
  browseToken = null;
  browseSiteId = null;
}
```

- [ ] **Step 4: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: update modal save/load for multi-mandante config"
```

---

### Task 7: Update loadData() and fetchFromSharePoint() for active mandante

**Files:**
- Modify: `sap_license_dashboard.html` — `loadData()` (around line 943) and `fetchFromSharePoint()` (around line 615)

- [ ] **Step 1: Update fetchFromSharePoint() to accept folder parameter**

Change `async function fetchFromSharePoint()` to:

```js
async function fetchFromSharePoint(folderPath) {
  const headers = spHeaders;
  const siteId = spSiteId;

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

- [ ] **Step 2: Update loadData() to use active mandante**

Replace the `loadData()` function:

```js
async function loadData(retryCount = 0) {
  showOverlay(true); hideBanners();
  const mandante = getActiveMandante();
  const folderPath = mandante.folder?.replace(/^\//, '');
  const isDemo = !CFG.clientId || !CFG.tenantId || !CFG.siteUrl || !folderPath;
  const budget = mandante.budget || 0;
  const mandanteLabel = mandante.label || CFG.activeMandante || 'PRD100';

  syncMandanteSelect();

  try {
    let data, hist;
    if (isDemo) {
      setLoading('Cargando datos de demostración...');
      await new Promise(r=>setTimeout(r,600));
      data = demoData(); hist = demoHistorical(budget || 60);
      showBanner('bannerDemo');
      setSessionBtn(false);
    } else {
      setLoading(`Cargando ${mandanteLabel}...`);
      await initMsal();
      await spConnect();
      data = await fetchFromSharePoint(folderPath);
      // Paso 5: Leer histórico
      setLoading('Paso 5/5 · Construyendo datos históricos...');
      const histData = await fetchHistorical(spHeaders, spSiteId);
      if (histData && histData.length) {
        const today = new Date().toISOString().split('T')[0];
        const totalFue = +data.reduce((s,r)=>s+r.fue,0).toFixed(3);
        const last = histData[histData.length-1];
        if (last.date !== today) {
          histData.push({ date:today, fue:totalFue });
        }
        hist = histData.map(h => ({
          month: formatHistDate(h.date),
          fue: h.fue
        }));
      } else {
        hist = demoHistorical(budget || 60);
      }
      const acct = msalApp.getAllAccounts()[0];
      setSessionBtn(true, acct?.username);
      showBanner('bannerOk', `Conectado como <strong>${acct?.username||'usuario'}</strong> · <strong>${mandanteLabel}</strong> · ${data.length} usuarios cargados.`);
    }
    renderDashboard(data, budget, hist);
  } catch(err) {
    console.error('Dashboard error:', err);
    const e = err.step ? err : { step:'unknown', code:'ERR', detail:err.message||String(err) };

    const retryableSteps = ['file','tables','columns','rows','list-files','download'];
    const retryableCodes = ['NETWORK', 404, 423, 500, 502, 503, 504];
    const canRetry = retryCount < MAX_RETRIES
      && (retryableSteps.includes(e.step) || retryableCodes.includes(e.code));

    if (canRetry) {
      const delay = RETRY_DELAYS[retryCount] || 20000;
      const secs  = Math.round(delay/1000);
      console.log(`Retry ${retryCount+1}/${MAX_RETRIES} en ${secs}s...`);
      showBanner('bannerErr', `
        <strong>Archivo no disponible</strong> — es posible que se esté regenerando desde SAP.<br>
        <span style="color:var(--muted)">Reintentando automáticamente en <strong id="retryCountdown">${secs}</strong> segundos (intento ${retryCount+1}/${MAX_RETRIES})...</span>`);
      let remaining = secs;
      const cdInterval = setInterval(()=>{
        remaining--;
        const el = document.getElementById('retryCountdown');
        if (el) el.textContent = remaining;
        if (remaining <= 0) clearInterval(cdInterval);
      }, 1000);
      await new Promise(r=>setTimeout(r, delay));
      clearInterval(cdInterval);
      showOverlay(false);
      return loadData(retryCount + 1);
    }

    const stepLabels = { auth:'Autenticación', site:'Sitio SharePoint', file:'Archivo Excel', 'list-files':'Listado de archivos', download:'Descarga de archivo', tables:'Archivos válidos', columns:'Columnas', rows:'Datos de usuarios' };
    const currentFolder = folderPath || '(vacía)';
    const stepFixes  = {
      auth: `<li>Verifica que el <strong>Client ID</strong> y <strong>Tenant ID</strong> sean correctos</li>
             <li>El <strong>Redirect URI</strong> en Azure (tipo SPA) debe ser exactamente: <code>${location.href.split('?')[0].split('#')[0]}</code></li>
             <li>Si se cerró un popup, intenta de nuevo</li>`,
      site: `<li>URL configurada: <code>${CFG.siteUrl||'(vacía)'}</code></li>
             <li>Verifica que el sitio exista y tu cuenta tenga acceso</li>
             <li>El permiso <code>Sites.Read.All</code> delegado debe tener <strong>admin consent</strong></li>`,
      file: `<li>Carpeta configurada para <strong>${mandanteLabel}</strong>: <code>${currentFolder}</code></li>
             <li>Verifica que la carpeta exista en SharePoint y contenga archivos EXPORT_*.xlsx</li>
             <li>Si ejecutaste SLIM_UCH recientemente, el archivo puede estar subiendo — espera unos segundos y recarga</li>`,
      tables:`<li>No se encontraron archivos válidos en la carpeta</li>
              <li>Los archivos deben llamarse <code>EXPORT_YYYYMMDD_HHMMSS.xlsx</code></li>`,
      'list-files':`<li>Verifica que la carpeta <code>${currentFolder}</code> exista en SharePoint</li><li>El permiso <code>Files.Read.All</code> delegado debe tener <strong>admin consent</strong></li>`,
      download:'<li>No se pudo descargar el archivo. Verifica permisos y conectividad.</li>',
      columns:'<li>No se pudieron leer las columnas del archivo. Verifica el formato del Excel.</li>',
      rows:   '<li>El archivo más reciente no contiene datos de usuarios válidos. Verifica que el export de SLIM_UCH se haya completado correctamente.</li>'
    };
    const icon  = e.step==='auth' ? '🔐' : e.step==='site' ? '🌐' : e.step==='file' ? '📄' : e.step==='tables' ? '📊' : '⚠';
    const label = stepLabels[e.step] || 'Error desconocido';
    const fixes = stepFixes[e.step]  || '<li>Revisa la configuración y vuelve a intentar</li>';
    const retryNote = retryCount > 0 ? `<br><span style="color:var(--muted);font-size:11px">Se reintentó ${retryCount} ${retryCount===1?'vez':'veces'} sin éxito.</span>` : '';
    showBanner('bannerErr', `
      <strong>${icon} Falló en: ${label}</strong> (${mandanteLabel})<br>
      <span style="color:var(--muted)">${e.code==='NETWORK'?'Sin conexión':e.code==='AUTH'?'Error de autenticación':`HTTP ${e.code}`}</span>
      ${e.detail?`<br><code style="font-size:10px;word-break:break-all;display:block;margin:8px 0;padding:6px;background:rgba(0,0,0,.3);border-radius:4px">${e.detail}</code>`:''}
      <strong>¿Cómo solucionarlo?</strong><ul>${fixes}</ul>${retryNote}`);
    renderDashboard(demoData(), budget || 60, demoHistorical(budget || 60));
  } finally {
    showOverlay(false);
  }
}
```

- [ ] **Step 3: Update auto-refresh to use mandante check**

Replace line 1050:
```js
setInterval(()=>{ if(CFG.clientId) loadData(); }, 30*60*1000);
```
With:
```js
setInterval(()=>{ if(CFG.clientId && CFG.mandantes) loadData(); }, 30*60*1000);
```

- [ ] **Step 4: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: wire loadData and fetchFromSharePoint to active mandante folder"
```

---

### Task 8: Budget-differentiated rendering in renderDashboard()

**Files:**
- Modify: `sap_license_dashboard.html` — `renderDashboard()` function (around line 670)

- [ ] **Step 1: Update KPI rendering for budget=0 case**

In `renderDashboard()`, replace the KPI section (lines ~678-690):

```js
  // KPIs
  document.getElementById('kFue').textContent = tot.toFixed(1);
  const kd = document.getElementById('kFueDelta');
  if (budget > 0) {
    document.getElementById('kFueSub').textContent = `de ${budget} contratadas`;
    const rem = (budget-tot).toFixed(1);
    kd.className = 'kpi-delta '+(rem<0?'dd':pct>85?'dw':'du');
    kd.textContent = (rem>=0?'+':'')+rem+' libres';
  } else {
    document.getElementById('kFueSub').textContent = 'consumidas (sin presupuesto)';
    kd.className = '';
    kd.textContent = '';
  }
  document.getElementById('kUsers').textContent = data.length;
  document.getElementById('kUsersSub').textContent = `${data.filter(r=>r.status==='Activo').length} activos / ${data.filter(r=>r.status==='Inactivo').length} inactivos`;
  document.getElementById('kInactive').textContent = ina.length;
  document.getElementById('kInactivePct').textContent = data.length ? (ina.length/data.length*100).toFixed(0)+'% del total' : '';
  document.getElementById('kRecoverable').textContent = rec;
```

- [ ] **Step 2: Update gauge for budget=0 case**

Replace the gauge rendering section:

```js
  // Gauge
  if (budget > 0) {
    document.getElementById('gaugePct').textContent = pct.toFixed(0)+'%';
    const gc = pct<70?'#7bed9f':pct<90?'#ffd32a':'#ff4757';
    if (gaugeChart) gaugeChart.destroy();
    gaugeChart = new Chart(document.getElementById('gaugeChart'),{
      type:'doughnut',
      data:{datasets:[{data:[Math.min(pct,100),Math.max(0,100-Math.min(pct,100))],backgroundColor:[gc,'#1f2535'],borderWidth:0,borderRadius:4}]},
      options:{cutout:'75%',rotation:-90,circumference:180,plugins:{legend:{display:false},tooltip:{enabled:false}},animation:{duration:1200,easing:'easeOutQuart'}}
    });
  } else {
    document.getElementById('gaugePct').textContent = tot.toFixed(1);
    document.getElementById('gaugeLbl').textContent = 'FUE total';
    if (gaugeChart) gaugeChart.destroy();
    gaugeChart = new Chart(document.getElementById('gaugeChart'),{
      type:'doughnut',
      data:{datasets:[{data:[100],backgroundColor:['#00e5ff'],borderWidth:0,borderRadius:4}]},
      options:{cutout:'75%',rotation:-90,circumference:180,plugins:{legend:{display:false},tooltip:{enabled:false}},animation:{duration:1200,easing:'easeOutQuart'}}
    });
  }
```

- [ ] **Step 3: Add id to gauge label for dynamic update**

In the HTML (around line 70), change:
```html
            <div class="gauge-lbl">utilización</div>
```
To:
```html
            <div class="gauge-lbl" id="gaugeLbl">utilización</div>
```

And in Step 2 above, add a reset for the budget>0 case:
After `document.getElementById('gaugePct').textContent = pct.toFixed(0)+'%';` add:
```js
    document.getElementById('gaugeLbl').textContent = 'utilización';
```

- [ ] **Step 4: Update line chart for budget=0 case**

Replace the line chart dataset section in `renderDashboard()`:

```js
  // Line
  Chart.defaults.color='#5a6480'; Chart.defaults.font.family="'DM Sans',sans-serif";
  if (lineChart) lineChart.destroy();
  const lineDatasets = [
    {label:'FUE consumidas',data:hist.map(h=>h.fue),borderColor:'#00e5ff',backgroundColor:'rgba(0,229,255,.08)',borderWidth:2,pointRadius:4,pointBackgroundColor:'#00e5ff',fill:true,tension:0.4}
  ];
  if (budget > 0) {
    lineDatasets.push({label:'Presupuesto',data:hist.map(()=>budget),borderColor:'rgba(255,71,87,.5)',borderWidth:1.5,borderDash:[6,4],pointRadius:0,fill:false});
  }
  const maxY = budget > 0 ? Math.max(budget * 1.15, Math.max(...hist.map(h=>h.fue)) * 1.1) : Math.max(...hist.map(h=>h.fue)) * 1.3;
  lineChart=new Chart(document.getElementById('lineChart'),{
    type:'line',
    data:{ labels:hist.map(h=>h.month), datasets:lineDatasets },
    options:{responsive:true,maintainAspectRatio:true,scales:{x:{grid:{color:'#1f2535'},ticks:{font:{size:11}}},y:{grid:{color:'#1f2535'},ticks:{font:{size:11}},min:0,max:Math.ceil(maxY)}},plugins:{legend:{labels:{font:{size:12},boxWidth:12,padding:16}}},animation:{duration:1200,easing:'easeOutQuart'}}
  });
```

- [ ] **Step 5: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: budget-differentiated rendering for gauge, KPIs, and line chart"
```

---

### Task 9: Manual verification and final commit

- [ ] **Step 1: Open dashboard locally and verify demo mode**

Open `sap_license_dashboard.html` in a browser. Expected:
- Mandante dropdown visible in header (PRD 100, DEV 200, DEV 100)
- Demo mode banner shows
- Switching mandantes reloads demo data
- Modal shows 3 collapsible mandante blocks

- [ ] **Step 2: Verify modal config**

Click "Configurar". Expected:
- Shared fields at top (Client ID, Tenant ID, Site URL)
- 3 collapsible blocks (PRD 100 expanded by default, DEV 200/100 collapsed)
- Each block has folder input + browse button + budget input
- Pre-filled default values

- [ ] **Step 3: Verify budget=0 rendering**

Switch to DEV 200 in dropdown (demo mode). Expected:
- Gauge shows total FUE number instead of percentage
- No budget reference line in historical chart
- KPI shows "consumidas (sin presupuesto)"
- No "libres" delta badge

- [ ] **Step 4: Final commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: complete multi-mandante support for SAP FUE dashboard"
```

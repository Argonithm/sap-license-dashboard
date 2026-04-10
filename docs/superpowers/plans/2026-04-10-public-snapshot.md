# Public Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow unauthenticated users to view the SAP FUE dashboard with auto-updated data from SharePoint, via a `snapshot.json` generated hourly by GitHub Actions.

**Architecture:** A Node.js script authenticates against Microsoft Graph using MSAL client credentials, downloads EXPORT Excel files from SharePoint, transforms them using the same logic as the browser dashboard, and writes `snapshot.json`. A GitHub Actions workflow runs this hourly and commits the result. The dashboard HTML loads the snapshot on page load for visitors who aren't authenticated.

**Tech Stack:** Node.js 20, @azure/msal-node, xlsx (SheetJS), GitHub Actions

**Spec:** `docs/superpowers/specs/2026-04-09-public-snapshot-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `scripts/package.json` | Dependencies for the snapshot script |
| Create | `scripts/update-snapshot.js` | Auth, fetch, transform, write snapshot.json |
| Create | `.github/workflows/update-snapshot.yml` | Hourly cron + manual trigger |
| Modify | `sap_license_dashboard.html` | Load snapshot.json on page load, new banner, mandante switching from snapshot |
| Modify | `.gitignore` | Ensure snapshot.json is NOT ignored |

---

### Task 1: Create the snapshot script — package.json

**Files:**
- Create: `scripts/package.json`

- [ ] **Step 1: Create `scripts/package.json`**

```json
{
  "name": "sap-snapshot",
  "private": true,
  "type": "module",
  "dependencies": {
    "@azure/msal-node": "^2.16.0",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  }
}
```

Note: SheetJS 0.20.3 matches the CDN version used in the browser dashboard. The `https://cdn.sheetjs.com/` URL is the official distribution channel for SheetJS (it's not on npm).

- [ ] **Step 2: Commit**

```bash
git add scripts/package.json
git commit -m "feat: add scripts/package.json for snapshot dependencies"
```

---

### Task 2: Create the snapshot script — authentication and Graph API helpers

**Files:**
- Create: `scripts/update-snapshot.js`

- [ ] **Step 1: Create `scripts/update-snapshot.js` with config, auth, and Graph helpers**

```js
import { ConfidentialClientApplication } from '@azure/msal-node';
import XLSX from 'xlsx';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── CONFIG ──────────────────────────────────────────────
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

// ── AUTH ─────────────────────────────────────────────────
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

// ── GRAPH HELPERS ────────────────────────────────────────
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/update-snapshot.js
git commit -m "feat: snapshot script — config, auth, and Graph helpers"
```

---

### Task 3: Add file listing and Excel download logic

**Files:**
- Modify: `scripts/update-snapshot.js`

- [ ] **Step 1: Add file listing, date parsing, and Excel download functions**

Append to `scripts/update-snapshot.js` (after the Graph helpers):

```js
// ── FILE LISTING ─────────────────────────────────────────
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/update-snapshot.js
git commit -m "feat: snapshot script — file listing and Excel download"
```

---

### Task 4: Add Excel transformation logic

**Files:**
- Modify: `scripts/update-snapshot.js`

- [ ] **Step 1: Add `transformarArchivoCrudo` — replicated from dashboard HTML**

Append to `scripts/update-snapshot.js`:

```js
// ── TRANSFORM ────────────────────────────────────────────
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
    headerIdx = 0;
    colUser = 0; colName = 1; colLic = 2; colStatus = 4; colLogin = 5;
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/update-snapshot.js
git commit -m "feat: snapshot script — Excel transformation logic"
```

---

### Task 5: Add historical data builder

**Files:**
- Modify: `scripts/update-snapshot.js`

- [ ] **Step 1: Add `construirHistorico` — replicated from dashboard HTML**

Append to `scripts/update-snapshot.js`:

```js
// ── HISTORICAL ───────────────────────────────────────────
function construirHistorico(allWorkbooks) {
  const snapshots = new Map();

  for (const { workbook, date } of allWorkbooks) {
    try {
      const ws = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (data.length < 2) continue;

      const dateKey = date.toISOString().split('T')[0];
      let counts = null;

      // Try summary format first (2-5 rows)
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

      // Try user-level format
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/update-snapshot.js
git commit -m "feat: snapshot script — historical data builder"
```

---

### Task 6: Add main function — orchestrate everything and write snapshot.json

**Files:**
- Modify: `scripts/update-snapshot.js`

- [ ] **Step 1: Add `main()` — iterate mandantes, build snapshot, write file**

Append to `scripts/update-snapshot.js`:

```js
// ── MAIN ─────────────────────────────────────────────────
async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
    console.error('Missing env vars: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID');
    process.exit(1);
  }

  console.log('Authenticating...');
  const token = await getToken();

  // Resolve SharePoint site ID
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

      // Download and transform latest file for current users
      const latestWb = await downloadExcel(token, siteId, archivos[0]);
      const users = transformarArchivoCrudo(latestWb);
      console.log(`  Parsed ${users.length} users from ${archivos[0].name}`);

      // Build historical from all files
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

      // Add today's FUE to historical if not already there
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

  // Write snapshot.json to repo root (next to sap_license_dashboard.html)
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/update-snapshot.js
git commit -m "feat: snapshot script — main orchestrator writes snapshot.json"
```

---

### Task 7: Create GitHub Actions workflow

**Files:**
- Create: `.github/workflows/update-snapshot.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
name: Update Snapshot

on:
  schedule:
    - cron: '0 * * * *'   # Every hour
  workflow_dispatch:        # Manual trigger

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        working-directory: scripts
        run: npm install

      - name: Generate snapshot
        env:
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          SHAREPOINT_SITE_URL: 'https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles'
        working-directory: scripts
        run: node update-snapshot.js

      - name: Commit and push if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add snapshot.json
          git diff --cached --quiet || git commit -m "chore: update snapshot.json [skip ci]"
          git push
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/update-snapshot.yml
git commit -m "feat: GitHub Actions workflow — hourly snapshot update"
```

---

### Task 8: Modify dashboard HTML to load snapshot.json

**Files:**
- Modify: `sap_license_dashboard.html`

- [ ] **Step 1: Add a new banner element for snapshot mode**

In the HTML, after the existing `bannerErr` div (around line 284), add:

```html
  <div class="banner banner-info" id="bannerSnapshot" style="display:none">
    <span class="banner-icon">📊</span>
    <span id="bannerSnapshotText"></span>
  </div>
```

- [ ] **Step 2: Update `hideBanners` to include the new banner**

Change line 1096 from:

```js
function hideBanners(){['bannerDemo','bannerOk','bannerErr'].forEach(id=>document.getElementById(id).style.display='none');}
```

to:

```js
function hideBanners(){['bannerDemo','bannerOk','bannerErr','bannerSnapshot'].forEach(id=>document.getElementById(id).style.display='none');}
```

- [ ] **Step 3: Add `loadSnapshot()` function**

Add before the `loadData` function (before `const MAX_RETRIES`):

```js
// ── SNAPSHOT MODE ────────────────────────────────────────
async function loadSnapshot() {
  try {
    const resp = await fetch('snapshot.json');
    if (!resp.ok) return null;
    const snap = await resp.json();
    if (!snap.mandantes || !snap.generatedAt) return null;
    return snap;
  } catch {
    return null;
  }
}

function renderFromSnapshot(snap) {
  const id = CFG.activeMandante || 'PRD100';
  const mandante = snap.mandantes[id] || snap.mandantes[Object.keys(snap.mandantes)[0]];
  if (!mandante || !mandante.users.length) return false;

  const budget = mandante.budget || 0;
  const hist = mandante.historical.length
    ? mandante.historical.map(h => ({ month: formatHistDate(h.date), fue: h.fue }))
    : demoHistorical(budget || 60);

  renderDashboard(mandante.users, budget, hist);

  const genDate = new Date(snap.generatedAt);
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const dateStr = `${genDate.getDate()} ${months[genDate.getMonth()]} ${genDate.getFullYear()} ${String(genDate.getHours()).padStart(2,'0')}:${String(genDate.getMinutes()).padStart(2,'0')}`;
  showBanner('bannerSnapshot', `Datos actualizados al <strong>${dateStr}</strong> · <strong>${mandante.label}</strong> · ${mandante.users.length} usuarios. Para datos en tiempo real, <a onclick="loadData()">conecta con SharePoint</a>.`);
  setSessionBtn(false);
  return true;
}
```

- [ ] **Step 4: Modify `loadData()` to try snapshot first**

At the beginning of `loadData`, right after `showOverlay(true); hideBanners();`, add:

```js
  // Try snapshot for unauthenticated visitors
  if (retryCount === 0 && isDemo) {
    const snap = await loadSnapshot();
    if (snap) {
      window._snapshot = snap;
      renderFromSnapshot(snap);
      showOverlay(false);
      return;
    }
  }
```

This means: if the user has no SharePoint config (demo mode) AND a snapshot exists, use the snapshot instead of showing demo data. Authenticated users bypass this entirely.

- [ ] **Step 5: Update `switchMandante()` to support snapshot mode**

Modify `switchMandante` (around line 425) from:

```js
function switchMandante(id) {
  if (!CFG.mandantes?.[id]) return;
  CFG.activeMandante = id;
  localStorage.setItem('sap_fue_cfg3', JSON.stringify(CFG));
  loadData();
}
```

to:

```js
function switchMandante(id) {
  CFG.activeMandante = id;
  if (CFG.mandantes?.[id]) {
    localStorage.setItem('sap_fue_cfg3', JSON.stringify(CFG));
  }
  // If we have a snapshot loaded, switch within it without re-fetching
  if (window._snapshot && window._snapshot.mandantes[id]) {
    hideBanners();
    renderFromSnapshot(window._snapshot);
    return;
  }
  loadData();
}
```

- [ ] **Step 6: Commit**

```bash
git add sap_license_dashboard.html
git commit -m "feat: dashboard loads snapshot.json for unauthenticated visitors"
```

---

### Task 9: Push everything to GitHub

- [ ] **Step 1: Push all commits to main**

```bash
git push origin master:main
```

- [ ] **Step 2: Verify GitHub Pages is updated**

Visit `https://argonithm.github.io/sap-license-dashboard/sap_license_dashboard.html` — it should still work (no snapshot.json yet, so falls back to demo mode).

- [ ] **Step 3: Commit the plan**

```bash
git add docs/
git commit -m "docs: add public snapshot spec and implementation plan"
git push origin master:main
```

---

### Task 10: Azure setup (manual — user action required)

These steps must be done by the user in the Azure Portal and GitHub Settings.

- [ ] **Step 1: Create client secret in Azure**

1. Go to Azure Portal → App Registrations → `ed00f4b7-4967-4ffd-9d03-e98bce9a54b9`
2. **Certificates & secrets** → **New client secret**
3. Description: `github-actions-snapshot`, Expiry: 24 months
4. Copy the **Value** (not the Secret ID)

- [ ] **Step 2: Add Application permission**

1. In the same App Registration → **API permissions**
2. **Add a permission** → Microsoft Graph → **Application permissions**
3. Search and add: `Sites.Read.All`
4. Click **Grant admin consent for [tenant]**

- [ ] **Step 3: Add GitHub Secrets**

1. Go to `https://github.com/Argonithm/sap-license-dashboard/settings/secrets/actions`
2. Add these repository secrets:
   - `AZURE_CLIENT_ID` = `ed00f4b7-4967-4ffd-9d03-e98bce9a54b9`
   - `AZURE_TENANT_ID` = `3a9739a2-9cfc-4b5d-8022-fcc048326853`
   - `AZURE_CLIENT_SECRET` = (the value from Step 1)

- [ ] **Step 4: Trigger workflow manually**

1. Go to `https://github.com/Argonithm/sap-license-dashboard/actions`
2. Click **Update Snapshot** → **Run workflow** → **Run workflow**
3. Wait for it to complete — check logs for errors
4. Verify `snapshot.json` appeared in the repo
5. Visit the GitHub Pages URL — should now show real data without login

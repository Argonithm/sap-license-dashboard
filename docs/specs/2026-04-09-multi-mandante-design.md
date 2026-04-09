# Multi-Mandante Dashboard Design

## Overview

Add support for 3 SAP mandantes (PRD 100, DEV 200, DEV 100) to the existing single-mandante FUE license dashboard. Users switch between mandantes via a dropdown in the header. Each mandante has its own SharePoint folder and budget configuration. The dashboard reloads all data from SharePoint on every mandante switch.

## Mandantes

| ID | Label | SharePoint Folder | Budget |
|----|-------|-------------------|--------|
| PRD100 | Produccion 100 | Licencias/Entrada/SLIM_UCH_PRD100 | 60 FUEs |
| DEV200 | Desarrollo 200 | Licencias/Entrada/SLIM_UCH_DEV200 | 0 |
| DEV100 | Desarrollo 100 | Licencias/Entrada/SLIM_UCH_DEV100 | 0 |

All mandantes share the same Azure AD app registration (Client ID, Tenant ID, Site URL).

## FUE License Types

Updated mapping including Developer type:

| SAP Code | Type | FUE Cost |
|----------|------|----------|
| GA | Developer | 2.0 |
| GB | Advanced Use | 1.0 |
| GC | Core Use | 0.2 |
| GD | Self-Service Use | 0.033 |

Developer (GA) may not appear in current SLIM_UCH exports but the dashboard must detect and map it if present. Detection in `parseType()`: match strings containing "developer" or code "GA".

## Configuration (localStorage)

New key `sap_fue_cfg3` (avoids collision with existing `sap_fue_cfg2`):

```json
{
  "clientId": "ed00f4b7-...",
  "tenantId": "3a9739a2-...",
  "siteUrl": "https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles",
  "activeMandante": "PRD100",
  "mandantes": {
    "PRD100": { "label": "Produccion 100", "folder": "Licencias/Entrada/SLIM_UCH_PRD100", "budget": 60 },
    "DEV200": { "label": "Desarrollo 200", "folder": "Licencias/Entrada/SLIM_UCH_DEV200", "budget": 0 },
    "DEV100": { "label": "Desarrollo 100", "folder": "Licencias/Entrada/SLIM_UCH_DEV100", "budget": 0 }
  }
}
```

On first load with no config, these defaults are pre-populated in the modal.

### Migration from sap_fue_cfg2

If `sap_fue_cfg2` exists in localStorage (previous single-mandante config), auto-migrate on first load:
- Copy `clientId`, `tenantId`, `siteUrl` as-is
- Map existing `filePath` to PRD100's folder
- Map existing `budget` to PRD100's budget
- Set `activeMandante` to "PRD100"
- DEV200 and DEV100 get default folder paths and budget 0
- Delete `sap_fue_cfg2` after migration

## UI Changes

### Header — Mandante Selector

Current header:
```
[SAP] License Monitor              ● Act: fecha   [Configurar]
```

New header:
```
[SAP] License Monitor   [▼ PRD 100 · Produccion]   ● Act: fecha   [Configurar]
```

The dropdown is styled with the dashboard aesthetic (dark background, `--border`, `--accent` for active item). Options:
- `PRD 100 · Produccion`
- `DEV 200 · Desarrollo`
- `DEV 100 · Desarrollo`

On change:
1. Show loading overlay ("Cargando Desarrollo 200...")
2. Update `CFG.activeMandante` in localStorage
3. Execute full `loadData()` with the selected mandante's folder
4. Re-render entire dashboard

### Modal — Multi-Mandante Configuration

**Top section (shared):**
- Client ID
- Tenant ID
- SharePoint Site URL

**Bottom section (per mandante) — 3 collapsible blocks:**

Each block has a clickable header with the mandante name and expands to show:
- SharePoint folder path (with Browse button)
- Budget FUEs (numeric input)

Pre-filled defaults match the mandantes table above. "Save and connect" saves all and loads the active mandante.

## Budget-Differentiated Logic

### When budget > 0 (PRD 100):
- Gauge shows utilization percentage vs budget
- Line chart includes budget reference line
- KPI "FUE Consumidas" shows "X de 60 contratadas"
- KPI "FUE Recuperables" shows potential savings from inactive users

### When budget === 0 (DEV environments):
- Gauge shows total FUEs consumed without percentage reference
- No budget reference line in line chart
- KPI "FUE Consumidas" shows "X consumidas (sin presupuesto asignado)"
- KPI "FUE Recuperables" still functions (inactive DEV users are recoverable too)
- If user manually sets a budget > 0 for a DEV mandante, the gauge activates normally

## Data Flow

```
1. Open dashboard → read CFG from localStorage
2. No config → demo mode + open modal
3. Has config → initMsal() → spConnect() (token + siteId, done once)
4. Read CFG.activeMandante (default: PRD100)
5. Get folder from CFG.mandantes[activeMandante].folder
6. loadData():
   a. listarArchivosEntrada(headers, siteId, folder)
   b. descargarExcel() most recent file
   c. transformarArchivoCrudo() — now includes Developer in parseType
   d. construirHistorico() from all files in folder
   e. renderDashboard() with mandante's budget
7. User switches mandante in dropdown →
   a. Update CFG.activeMandante in localStorage
   b. Execute full loadData() (step 6)
   c. Loading overlay shows "Cargando [mandante label]..."
```

## Code Changes

### Constants
- `FUE_MAP`: add `'Developer': 2`
- New `MANDANTE_DEFAULTS` object with the 3 pre-defined mandantes

### Functions modified
- `parseType()`: add detection for "developer" and "GA" strings
- `fetchFromSharePoint()`: receive folder as parameter instead of reading `CFG.filePath`
- `renderDashboard()`: adapt gauge, KPIs, and line chart based on budget (0 vs >0)
- `loadData()`: read active mandante config, pass folder to fetch functions
- `saveAndConnect()`: save multi-mandante config structure
- `openModal()`: populate per-mandante fields

### Functions added
- `switchMandante(id)`: update active mandante, trigger loadData()

### HTML changes
- Header: add mandante dropdown
- Modal: restructure with shared fields + 3 collapsible mandante blocks

### What stays the same
- MSAL authentication (done once, token reused)
- `spConnect()` (siteId is the same for all mandantes)
- Retry logic (3 attempts)
- Auto-refresh every 30 min (reloads active mandante)
- Demo mode when no config
- Table rendering, filtering, sorting
- File browser functionality

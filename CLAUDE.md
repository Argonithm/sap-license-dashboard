# SAP License Dashboard

## Overview

Single-page application (`sap_license_dashboard.html`) that monitors SAP FUE (Functional User Equivalent) license consumption. Built entirely client-side — no backend required.

## Architecture

```
SAP GUI → SharePoint (Entrada/SLIM_UCH) → Dashboard (browser-side Excel parsing)
```

The dashboard authenticates via Azure AD (MSAL.js), reads raw `EXPORT_*.xlsx` files directly from SharePoint using the Microsoft Graph API, parses them in-browser with SheetJS, and renders KPIs/charts/tables with Chart.js.

### Key Libraries (all CDN)
- **MSAL.js 3.27.0** — Azure AD authentication (public client, delegated auth)
- **SheetJS/XLSX 0.20.3** — Excel file parsing
- **Chart.js 4.4.1** — Data visualization

### External Services
- **SharePoint**: `https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles`
- **Data folder**: `Shared Documents/Licencias/Entrada/SLIM_UCH`
- **Graph API scopes**: `Sites.Read.All`, `Files.Read.All`
- **Azure App**: Client ID `ed00f4b7-4967-4ffd-9d03-e98bce9a54b9`, Tenant `3a9739a2-9cfc-4b5d-8022-fcc048326853`

## Data Transformation Logic

### Excel Column Mapping (raw SAP export)
| Column | Field | Description |
|--------|-------|-------------|
| A | usuario | User ID |
| B | nombreCompleto | Full name |
| E | tipoLicencia | License classification |
| H | estado | Status (Active/Inactive/External) |
| I | ultimoLogin | Last login date |

### FUE Mapping
- `"GB Advanced Use"` → 1.0 FUE
- `"GC Core Use"` → 0.2 FUE
- `"GD Self-Service Use"` → 0.033 FUE
- Sin clasificar → 0 FUE

### Business Rules
- Users inactive >90 days are flagged as "recoverable" (potential cost savings)
- Historical deduplication: multiple exports from same day → keep highest user count
- Excluded file: `EXPORT_20251126_161021.xlsx` (function roles report, not license data)

## Project Structure

```
sap_license_dashboard.html   # Main application (single HTML with embedded CSS/JS)
CLAUDE.md                    # This file — project context
.gitignore                   # Ignores node_modules
docs/
  plans/                     # Implementation plans
  specs/                     # Design specifications
data/
  historical-exports/        # Backup copies of EXPORT_*.xlsx from SAP (local only)
  samples/                   # Reference Excel files (processed format examples)
legacy/                      # Deprecated files — NOT used in current architecture
  Office_Script.py           # Was: Excel transformation via Office Script
  config.py                  # Was: Azure credentials (now in browser localStorage)
  generar_historico.js       # Was: Node.js historical aggregator (now in dashboard)
  package.json               # Was: Node.js deps for generar_historico.js
  package-lock.json          # Was: Lock file for above
```

## Dashboard Features

- **KPIs**: FUEs consumed vs budget, total/active/inactive users, recoverable FUEs
- **Charts**: Historical trend (line), utilization gauge, license type distribution (donut)
- **User table**: Filterable/sortable by type, status, search; color-coded badges
- **File browser**: Interactive SharePoint folder navigation in config modal
- **Auto-retry**: 3 attempts on network errors (5s, 10s, 20s delays)
- **Demo mode**: Simulated data when SharePoint credentials not configured

## Configuration (browser localStorage key: `sap_fue_cfg2`)

```json
{
  "clientId": "Azure app client ID",
  "tenantId": "Azure tenant ID",
  "siteUrl": "https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles",
  "filePath": "Shared Documents/Licencias/Entrada/SLIM_UCH",
  "budget": 150
}
```

## Language

The UI is entirely in **Spanish**. Error messages, labels, and remediation steps are all in Spanish.

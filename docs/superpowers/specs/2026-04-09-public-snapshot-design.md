# Public Snapshot: Dashboard sin autenticacion

## Problema

El dashboard SAP FUE requiere login con Azure AD para ver datos. Se necesita que cualquier persona de la empresa pueda acceder sin autenticarse, viendo siempre los datos mas recientes.

## Solucion

Un GitHub Actions workflow que corre cada 1 hora, se autentica contra Microsoft Graph con client credentials (sin usuario), descarga los Excel de SharePoint, los transforma y publica un `snapshot.json` en el repo. El dashboard lo carga automaticamente para visitantes no autenticados.

## Arquitectura

```
SharePoint (EXPORT_*.xlsx)
        |
        v
GitHub Actions (cron cada 1h)
  - MSAL client credentials
  - Graph API -> descarga Excel
  - SheetJS -> parsea datos
  - Genera snapshot.json
        |
        v
GitHub Pages (snapshot.json + dashboard HTML)
        |
        v
Visitante abre la pagina -> fetch('snapshot.json') -> renderiza dashboard
```

## Componentes

### 1. Script de transformacion: `scripts/update-snapshot.js`

Script Node.js que:

- Se autentica con `@azure/msal-node` usando client credentials flow
- Para cada mandante configurado:
  - Lista archivos `EXPORT_*.xlsx` en la carpeta de SharePoint via Graph API
  - Descarga el mas reciente
  - Parsea con SheetJS (misma logica de deteccion de cabeceras raw SAP + Office Script)
  - Construye el historico procesando todos los archivos
- Escribe `snapshot.json` a disco

Config de mandantes hardcodeada en el script:

```js
const MANDANTES = {
  PRD100: { label: 'Produccion 100', folder: 'Licencias/Entrada/SLIM_UCH', budget: 60 },
  DEV200: { label: 'Desarrollo 200', folder: 'Licencias/Entrada/SLIM_UCH_DEV200', budget: 0 },
};
```

Variables de entorno requeridas:
- `AZURE_CLIENT_ID` — App registration client ID
- `AZURE_CLIENT_SECRET` — Client secret generado en Azure
- `AZURE_TENANT_ID` — Tenant ID
- `SHAREPOINT_SITE_URL` — `https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles`

### 2. Workflow: `.github/workflows/update-snapshot.yml`

- **Trigger**: cron cada 1 hora (`0 * * * *`) + `workflow_dispatch` (manual)
- **Steps**:
  1. Checkout repo
  2. Setup Node.js 20
  3. `npm install` dependencias del script
  4. Ejecutar `scripts/update-snapshot.js`
  5. Si `snapshot.json` cambio, commit y push

- **Secrets de GitHub**:
  - `AZURE_CLIENT_ID`
  - `AZURE_CLIENT_SECRET`
  - `AZURE_TENANT_ID`

### 3. Cambios en el dashboard HTML

Nuevo flujo de carga:

1. Al cargar la pagina, hacer `fetch('snapshot.json')`
2. Si existe y es valido:
   - Renderizar dashboard con datos del snapshot
   - Mostrar banner: "Datos actualizados al {fecha}. Para datos en tiempo real, conecta con SharePoint."
   - El selector de mandante filtra entre los mandantes del snapshot
3. Si falla el fetch (404, error de red):
   - Comportamiento actual (demo mode si no hay config, o login si hay config)
4. El boton "Conectar" sigue funcionando para obtener datos en vivo via SharePoint

## Formato de snapshot.json

```json
{
  "generatedAt": "2026-04-09T14:00:00Z",
  "mandantes": {
    "PRD100": {
      "label": "Produccion 100",
      "budget": 60,
      "users": [
        {
          "user": "ACACERES",
          "name": "CACERES ROJAS ALEX FELIPE",
          "licenseType": "Advanced",
          "status": "Activo",
          "fue": 1,
          "lastLogin": "2026-04-01",
          "daysInactive": 8
        }
      ],
      "historical": [
        { "date": "2026-01-15", "fue": 98.5 },
        { "date": "2026-02-10", "fue": 101.2 }
      ]
    },
    "DEV200": {
      "label": "Desarrollo 200",
      "budget": 0,
      "users": [],
      "historical": []
    }
  }
}
```

## Dependencias del script (scripts/package.json)

- `@azure/msal-node` — autenticacion client credentials
- `xlsx` — parseo de Excel (SheetJS)

No se necesita `@microsoft/microsoft-graph-client`; fetch nativo de Node.js 20 es suficiente para las llamadas a Graph API.

## Setup requerido en Azure

1. En el App Registration existente (`ed00f4b7-...`):
   - Ir a **Certificates & secrets** -> **New client secret**
   - Copiar el valor del secret
2. En **API permissions**:
   - Agregar `Sites.Read.All` tipo **Application** (no delegated)
   - Otorgar **Admin consent**
3. En GitHub repo Settings -> Secrets -> Actions:
   - Agregar `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`

## Notas

- El archivo excluido `EXPORT_20251126_161021.xlsx` se mantiene excluido en el script
- `daysInactive` se recalcula en cada ejecucion del workflow (relativo a la fecha de ejecucion)
- Si el workflow falla (SharePoint no disponible, token expirado), el snapshot anterior se mantiene y los visitantes ven los ultimos datos validos
- El client secret de Azure expira (configurable: 6 meses, 1 ano, 2 anos) — se debera renovar antes de su vencimiento

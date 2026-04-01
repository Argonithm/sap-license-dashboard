# Dashboard con Transformacion Integrada

## Problema

El flujo actual para visualizar licencias SAP tiene 5 pasos con 3 piezas intermedias (Power Automate, Office Script, carpeta de salida) que agregan complejidad y puntos de fallo:

SAP GUI -> SharePoint (Entrada) -> Power Automate -> Office Script -> SharePoint (Salida) -> Dashboard

## Solucion

Reducir a 2 pasos: el dashboard lee directamente los archivos crudos de SharePoint, aplica la transformacion en JavaScript y construye el historico en memoria.

SAP GUI -> SharePoint (Entrada) -> Dashboard

## Flujo de datos

1. Usuario abre el dashboard y se autentica via MSAL (sin cambios)
2. Dashboard lista archivos en `Licencias/Entrada/SLIM_UCH` via Graph API
3. Ordena por fecha extraida del nombre (`EXPORT_YYYYMMDD_HHMMSS.xlsx`)
4. Descarga el mas reciente, transforma y muestra KPIs + tabla de usuarios
5. Descarga todos los archivos, agrega por fecha y muestra grafico historico

## Fuente de datos

- **SharePoint site:** `https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles`
- **Ruta de archivos:** `Shared Documents/Licencias/Entrada/SLIM_UCH`
- **Patron de nombre:** `EXPORT_YYYYMMDD_HHMMSS.xlsx`
- **Frecuencia:** semanal, descarga manual desde SAP GUI

## Transformacion del archivo crudo

Portar la logica del Office Script (`Office_Script.py`) a JavaScript. Del archivo crudo se extraen:

| Columna cruda | Campo resultado | Notas |
|---------------|-----------------|-------|
| A | `usuario` | User ID |
| B | `nombreCompleto` | Nombre completo |
| E | `tipoLicencia` | Clasificacion destino |
| H | `estado` | Activo/Inactivo |
| I | `ultimoLogin` | Fecha ultimo login |

Mapeo de clasificacion a FUE:
- "GB Advanced Use" -> 1.0
- "GC Core Use" -> 0.2
- "GD Self-Service Use" -> 0.033
- Sin clasificar -> 0

Campos calculados:
- `fue`: segun mapeo anterior
- `diasInactivo`: dias entre hoy y `ultimoLogin`

## Construccion del historico

Reemplaza `generar_historico.js` y `SLIM_UCH_HISTORICO.xlsx`. El dashboard:

1. Lista todos los archivos de la carpeta via Graph API
2. Extrae fecha del nombre de cada archivo (`EXPORT_YYYYMMDD_HHMMSS.xlsx`)
3. Descarga cada archivo y clasifica usuarios por tipo de licencia
4. Soporta dos formatos de archivo (igual que `generar_historico.js`):
   - **User-level:** filas por usuario con columna de clasificacion
   - **Summary-level:** totales pre-agregados (2-5 filas)
5. Deduplica por fecha (si hay multiples exports del mismo dia, toma el que tenga mas usuarios)
6. Genera dataset con: Fecha, Advanced, Core, Self-Service, Sin Clasificar, Total Usuarios, FUE Total
7. Excluye archivos conocidos como no validos (ej: `EXPORT_20251126_161021.xlsx` que es reporte de funciones)

## Cambios en el codigo

### Funciones nuevas

- `listarArchivosEntrada()` - Lista archivos de la carpeta de entrada via Graph API, retorna array ordenado por fecha
- `transformarArchivoCrudo(workbook)` - Recibe workbook de XLSX.js, extrae columnas A/B/E/H/I, aplica mapeo FUE, retorna array de usuarios
- `construirHistorico(archivos)` - Recibe lista de archivos, descarga cada uno, agrega por fecha, retorna dataset para grafico de tendencias

### Funciones modificadas

- `cargarDatos()` - En vez de leer archivo procesado de Salida, lista carpeta de Entrada, toma el mas reciente, y llama a `transformarArchivoCrudo()`
- `cargarHistorico()` - En vez de leer `SLIM_UCH_HISTORICO.xlsx`, llama a `construirHistorico()` con todos los archivos de la carpeta
- Modal de configuracion - La ruta por defecto cambia a `Shared Documents/Licencias/Entrada/SLIM_UCH`

### Sin cambios

- Autenticacion MSAL
- Graficos (Chart.js)
- KPIs y calculos de dashboard
- Modo demo
- Estilos CSS

## Performance

Con ~20 archivos historicos, el dashboard hara ~20 requests al Graph API para construir el historico. Tiempo estimado: unos segundos. Se mostrara un indicador de carga durante el procesamiento.

Optimizacion futura posible: cachear el historico en localStorage y solo descargar archivos nuevos.

## Que se elimina del pipeline

- Power Automate flow
- Office Script
- Carpeta `Licencias/Salida/` en SharePoint
- Archivo `SLIM_UCH_HISTORICO.xlsx` (ya no se necesita generar)
- Script `generar_historico.js` (logica absorbida por el dashboard)

## Que se mantiene

- `sap_license_dashboard.html` (se modifica)
- Autenticacion MSAL + Graph API (ya existe)
- Carpeta `Licencias/Entrada/SLIM_UCH` como unica fuente de datos
- Archivos historicos de `PRD 100/` local (backup, no se usan en produccion)

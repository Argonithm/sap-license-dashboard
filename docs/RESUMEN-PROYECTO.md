# SAP License Monitor - Resumen del Proyecto

## Que es esto?

Un dashboard web que muestra cuantas licencias SAP FUE esta usando tu empresa. Lo abres en el navegador, se conecta a SharePoint, lee los archivos Excel que exportas desde SAP y te muestra todo en graficos y tablas.

## Como funciona (paso a paso)

```
1. Tu ejecutas SLIM_UCH en SAP GUI
2. SAP genera un archivo Excel (EXPORT_YYYYMMDD_HHMMSS.xlsx)
3. Lo guardas en la carpeta de SharePoint del mandante correspondiente
4. Abres el dashboard en el navegador
5. El dashboard lee el Excel, lo procesa y muestra los datos
```

No necesitas Power Automate ni Office Scripts. El dashboard hace toda la transformacion solo.

## Que mandantes soporta?

| Mandante | Carpeta en SharePoint | Presupuesto |
|----------|----------------------|-------------|
| PRD 100 (Produccion) | Licencias/Entrada/SLIM_UCH_PRD100 | 60 FUEs |
| DEV 200 (Desarrollo) | Licencias/Entrada/SLIM_UCH_DEV200 | Sin presupuesto |
| DEV 100 (Desarrollo) | Licencias/Entrada/SLIM_UCH_DEV100 | Sin presupuesto |

Cambias entre mandantes con un dropdown en la barra superior. Al cambiar, recarga todo desde SharePoint.

## Tipos de licencia y su costo FUE

| Tipo | Costo por usuario |
|------|-------------------|
| Developer (GA) | 2.0 FUEs |
| Advanced Use (GB) | 1.0 FUE |
| Core Use (GC) | 0.2 FUEs |
| Self-Service Use (GD) | 0.033 FUEs |

## Que muestra el dashboard?

- **FUE Consumidas**: cuantas FUEs estas usando vs tu presupuesto (solo PRD 100)
- **Usuarios Totales**: cuantos hay activos e inactivos
- **Usuarios Inactivos**: los que llevan +90 dias sin entrar a SAP
- **FUE Recuperables**: cuanto ahorrarias si desactivas a los inactivos
- **Grafico historico**: como ha cambiado el consumo en el tiempo
- **Gauge**: porcentaje de uso del presupuesto (solo si el mandante tiene presupuesto)
- **Tabla de usuarios**: filtrable por tipo de licencia, estado, busqueda

Para los mandantes DEV (sin presupuesto), el gauge muestra el total de FUEs consumidas sin comparar contra nada.

## Archivos del proyecto

```
sap_license_dashboard.html   <-- EL UNICO ARCHIVO QUE IMPORTA (toda la app)
CLAUDE.md                    <-- Contexto tecnico para Claude
.gitignore                   <-- Ignora node_modules
docs/
  specs/                     <-- Documentos de diseno
  plans/                     <-- Planes de implementacion
  RESUMEN-PROYECTO.md        <-- Este archivo
data/                        <-- Archivos Excel de referencia
legacy/                      <-- Archivos viejos que ya no se usan
```

## Configuracion

La primera vez que abres el dashboard, haz click en "Configurar" y llena:

1. **Client ID** y **Tenant ID** de tu app en Azure AD
2. **URL del sitio SharePoint** (https://labpratercl.sharepoint.com/sites/SAP-RolesyPerfiles)
3. **Carpeta de cada mandante** (puedes usar el boton "explorar" para navegar SharePoint)
4. **Presupuesto FUE** de cada mandante (60 para PRD 100, 0 para los DEV)

Esto se guarda en el navegador (localStorage). No necesitas configurarlo de nuevo a menos que cambies de navegador.

## Requisitos en Azure AD

Tu app registrada en Azure necesita:
- Permisos delegados: `Sites.Read.All` y `Files.Read.All` (con admin consent)
- Redirect URI tipo SPA apuntando a donde tengas el archivo HTML

## Que se hizo en esta sesion (9 abril 2026)

1. **Se reorganizo el proyecto**: archivos legacy a `legacy/`, datos a `data/`, docs aplanados
2. **Se agrego soporte multi-mandante**: dropdown para cambiar entre PRD 100, DEV 200, DEV 100
3. **Se agrego licencia Developer**: deteccion de tipo GA con costo de 2 FUEs
4. **Se diferencio la vista por presupuesto**: PRD muestra gauge con %, DEV muestra solo el total
5. **Se mejoro el modal**: ahora tiene 3 bloques colapsables, uno por mandante
6. **Se agrego migracion de config**: si tenias la config vieja, se migra automaticamente
7. **Se removio node_modules de git**: no deberia haber estado trackeado

## Pendiente

- Crear las carpetas en SharePoint (SLIM_UCH_PRD100, SLIM_UCH_DEV200, SLIM_UCH_DEV100)
- Renombrar la carpeta actual SLIM_UCH a SLIM_UCH_PRD100
- Verificar si SAP GUI Scripting esta habilitado (para automatizar SLIM_UCH en el futuro)
- La licencia Developer (GA) podria no aparecer en los exports actuales de SLIM_UCH

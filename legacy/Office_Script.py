function main(workbook: ExcelScript.Workbook) {

    const sheet = workbook.getActiveWorksheet();

    // Detectar rango usado dinámicamente
    const usedRange = sheet.getUsedRange();
    const values = usedRange.getValues();

    // Encabezados originales
    const headers = values[0];

    // Índices (basado en tu estructura)
    const colUser = 0;        // A Usuario
    const colName = 1;        // B Nombre completo
    const colLic = 4;         // E Clasificación destino
    const colStatus = 7;     // H Estado
    const colLastLogin = 8;  // I Último login

    // Nueva estructura limpia
    let output: (string | number)[][] = [];

    // Header limpio
    output.push([
        "Usuario",
        "Nombre Completo",
        "Tipo Licencia",
        "FUE",
        "Estado",
        "Ultimo Login"
    ]);

    // Procesar filas
    for (let i = 1; i < values.length; i++) {

        let row = values[i];

        let licencia = row[colLic];

        // FUE mapping
        let fue = 0;

        if (licencia === "GB Advanced Use") {
            fue = 1;
        } else if (licencia === "GC Core Use") {
            fue = 0.2;
        } else if (licencia === "GD Self-Service Use") {
            fue = 0.033;
        }

        output.push([
            String(row[colUser]),
            String(row[colName]),
            String(licencia),
            fue,
            String(row[colStatus]),
            row[colLastLogin] as number
        ]);
    }

    // Limpiar hoja
    usedRange.clear();

    // Escribir datos limpios
    let newRange = sheet.getRangeByIndexes(0, 0, output.length, output[0].length);
    newRange.setValues(output);

    // 👉 DEFINIR cantidad de filas
    let lastRow = output.length;

    // Columna "Ultimo Login" (índice 5)
    let dateRange = sheet.getRangeByIndexes(1, 5, lastRow - 1, 1);

    // Formato fecha
    dateRange.setNumberFormat("dd-mm-yyyy");


    // Convertir a tabla (CLAVE para Power BI)
    let table = sheet.addTable(newRange, true);
    table.setName("SLIM_UCH_FUE_TABLE");

}
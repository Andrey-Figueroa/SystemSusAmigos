function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ==========================================
    // FUNCIÓN: Insertar en la primera fila vacía
    // ==========================================
    function insertInFirstGap(sheet, rowData) {
      if (!sheet) return;
      const columnA = sheet.getRange("A:A").getValues();
      let firstEmptyRow = sheet.getLastRow() + 1;
      for (let i = 1; i < columnA.length; i++) {
        if (String(columnA[i][0]).trim() === "") {
          firstEmptyRow = i + 1;
          break;
        }
      }
      sheet.getRange(firstEmptyRow, 1, 1, rowData.length).setValues([rowData]);
    }

    // ==========================================
    // 0. CIERRE DE CAJA
    // ==========================================
    if (data.action === 'cierre_caja') {
      const dailySheet = ss.getSheetByName('Ventas Diarias');
      const masterSheet = ss.getSheetByName('Ventas Maestra');
      if (!dailySheet || !masterSheet) throw new Error("Hojas de ventas no encontradas.");
      
      const lastRow = dailySheet.getLastRow();
      if (lastRow > 1) {
        const range = dailySheet.getRange(2, 1, lastRow - 1, dailySheet.getLastColumn());
        const values = range.getValues();
        masterSheet.getRange(masterSheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
        dailySheet.getRange(2, 1, lastRow - 1, dailySheet.getLastColumn()).clearContent();
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 1. ELIMINACIÓN DE REGISTROS
    // ==========================================
    if (data.action === 'delete' || data.action === 'delete_orden') {
      if (data.id && data.action === 'delete') {
          const dailySheet = ss.getSheetByName('Ventas Diarias');
          if (dailySheet) {
            const dataRange = dailySheet.getDataRange();
            const values = dataRange.getValues();
            for (let i = 1; i < values.length; i++) {
              if (values[i][values[i].length - 1] == data.id) {
                dailySheet.deleteRow(i + 1);
                break;
              }
            }
          }
      } 
      if (data.ordenId || data.orden_id || data.id) {
          const targetId = data.ordenId || data.orden_id || data.id;
          const sheetsToCheck = ['Control General', 'Detallado y Lavado', 'Mecanica', 'Transacciones'];
          sheetsToCheck.forEach(sheetName => {
              const sheet = ss.getSheetByName(sheetName);
              if (sheet) {
                  const dataRange = sheet.getDataRange();
                  const values = dataRange.getValues();
                  for (let i = values.length - 1; i > 0; i--) { 
                      if (String(values[i][0]) === String(targetId)) {
                          sheet.deleteRow(i + 1);
                          break;
                      }
                  }
              }
          });
      }
      if (data.action !== 'update') {
          return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    if (data.action === 'delete_domicilio') {
      const domSheet = ss.getSheetByName('Domicilios');
      if (domSheet) {
          const dataRange = domSheet.getDataRange();
          const values = dataRange.getValues();
          for (let i = values.length - 1; i > 0; i--) { 
              if (String(values[i][0]) === String(data.id)) {
                  domSheet.deleteRow(i + 1);
                  break;
              }
          }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 2. CLIENTE NUEVO
    // ==========================================
    if (data.tipo_hoja === "NUEVO_CLIENTE") {
      const sheet = ss.getSheetByName("Clientes");
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({ error: "Hoja 'Clientes' no existe" })).setMimeType(ContentService.MimeType.JSON);
      insertInFirstGap(sheet, [
        data.created_at || new Date().toLocaleString(),
        data.nombre,
        data.telefono
      ]);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 3. NUEVA ORDEN (PIZARRA LOCAL COMERCIAL)
    // ==========================================
    if (data.tipo_hoja === "NUEVA_ORDEN") {
      const controlSheet = ss.getSheetByName("Control General");
      if (!controlSheet) return ContentService.createTextOutput(JSON.stringify({ error: "Hoja 'Control General' no existe" })).setMimeType(ContentService.MimeType.JSON);

      // Helper function to find a row by ID in a sheet
      function findRowIndex(sheetName, id) {
        const sheet = ss.getSheetByName(sheetName);
        if (!sheet) return -1;
        const values = sheet.getDataRange().getValues();
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]) === String(id)) return i + 1;
        }
        return -1;
      }

      if (data.action === "update") {
        // A. Actualizar Control General
        const rowIndex = findRowIndex("Control General", data.orden_id);
        if (rowIndex > -1) {
          controlSheet.getRange(rowIndex, 8).setValue(data.servicios_maestros);
          controlSheet.getRange(rowIndex, 9).setValue(data.estado);
          controlSheet.getRange(rowIndex, 10).setValue(data.espera);
          controlSheet.getRange(rowIndex, 11).setValue(data.total_monto);
        }

        // B. Actualizar o Insertar/Eliminar en Detallado
        const detalladoSheet = ss.getSheetByName('Detallado y Lavado');
        const hasDetallado = data.servicios_maestros && (data.servicios_maestros.includes('Detallado y lavado') || data.servicios_maestros.includes('Detallados especiales'));
        const detRow = findRowIndex('Detallado y Lavado', data.orden_id);
        if (hasDetallado) {
          const rowData = [
            data.orden_id, data.placa, data.nombre_cliente, 
            data.detallado_tipo || "No aplica", data.extra_interior || "No aplica", 
            data.extra_aroma || "No aplica", data.extra_alfombras || "No aplica", 
            data.servicios_extra || "No aplica", data.detallados_especiales || "No aplica", 
            data.detallado_monto || 0, data.observaciones || "Sin observaciones"
          ];
          if (detRow > -1) detalladoSheet.getRange(detRow, 1, 1, rowData.length).setValues([rowData]);
          else insertInFirstGap(detalladoSheet, rowData);
        } else if (detRow > -1) {
          detalladoSheet.deleteRow(detRow);
        }

        // C. Actualizar o Insertar/Eliminar en Mecanica
        const mecanicaSheet = ss.getSheetByName('Mecanica');
        const hasMecanica = data.servicios_maestros && (data.servicios_maestros.includes('Mecanica') || data.servicios_maestros.includes('Entrada pero servicios pendientes'));
        const mecRow = findRowIndex('Mecanica', data.orden_id);
        if (hasMecanica) {
          const rowData = [
            data.orden_id, data.placa, data.nombre_cliente, 
            data.mecanica_categorias || "Pendiente", data.mecanica_detalles || "Pendiente", 
            data.mecanica_monto || 0, data.observaciones || "Sin observaciones"
          ];
          if (mecRow > -1) mecanicaSheet.getRange(mecRow, 1, 1, rowData.length).setValues([rowData]);
          else insertInFirstGap(mecanicaSheet, rowData);
        } else if (mecRow > -1) {
          mecanicaSheet.deleteRow(mecRow);
        }

        // D. Actualizar Transacciones (solo total_monto)
        const transRow = findRowIndex('Transacciones', data.orden_id);
        if (transRow > -1) {
          const transSheet = ss.getSheetByName('Transacciones');
          transSheet.getRange(transRow, 4).setValue(data.total_monto); // Monto original
          // No tocamos los abonos (columnas 5, 6, 7, 8, 9, 10, 11) para no sobrescribir pagos
        }

      } else {
        // A. Inserción en Control General
        insertInFirstGap(controlSheet, [
          data.orden_id, data.created_at, data.placa, data.nombre_cliente, 
          data.celular_cliente, data.modelo, data.tipo_vehiculo, 
          data.servicios_maestros, data.estado, data.espera, data.total_monto,
          "", `=IF(INDIRECT("L"&ROW())<>"", INT(MOD(INDIRECT("L"&ROW())-INDIRECT("B"&ROW()), 1)*24*60) & " min", "")`, 
          "", `=IF(INDIRECT("N"&ROW())<>"", INT(MOD(INDIRECT("N"&ROW())-INDIRECT("B"&ROW()), 1)*24*60) & " min", "")`, ""
        ]);

        // B. Inserción en Detallado y Lavado
        if (data.servicios_maestros && (data.servicios_maestros.includes('Detallado y lavado') || data.servicios_maestros.includes('Detallados especiales'))) {
          const detalladoSheet = ss.getSheetByName('Detallado y Lavado');
          if (detalladoSheet) insertInFirstGap(detalladoSheet, [
            data.orden_id, data.placa, data.nombre_cliente, 
            data.detallado_tipo || "No aplica", data.extra_interior || "No aplica", 
            data.extra_aroma || "No aplica", data.extra_alfombras || "No aplica", 
            data.servicios_extra || "No aplica", data.detallados_especiales || "No aplica", 
            data.detallado_monto || 0, data.observaciones || "Sin observaciones"
          ]);
        }

        // C. Inserción en Mecanica
        if (data.servicios_maestros && (data.servicios_maestros.includes('Mecanica') || data.servicios_maestros.includes('Entrada pero servicios pendientes'))) {
          const mecanicaSheet = ss.getSheetByName('Mecanica');
          if (mecanicaSheet) insertInFirstGap(mecanicaSheet, [
            data.orden_id, data.placa, data.nombre_cliente, 
            data.mecanica_categorias || "Pendiente", data.mecanica_detalles || "Pendiente", 
            data.mecanica_monto || 0, data.observaciones || "Sin observaciones"
          ]);
        }

        // D. Inserción en Transacciones
        const transaccionesSheet = ss.getSheetByName('Transacciones');
        if (transaccionesSheet) insertInFirstGap(transaccionesSheet, [
          data.orden_id, data.placa, data.nombre_cliente, data.total_monto, 
          "Pendiente", 0, 0, 0, data.total_monto, "Pendiente", "Pendiente"
        ]);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // ==========================================
    // 4. PAGOS (Local Comercial)
    // ==========================================
    if (data.action === "update_pago") {
      const sheet = ss.getSheetByName("Control General");
      if (sheet) {
        const dataRange = sheet.getDataRange();
        const values = dataRange.getValues();
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]) === String(data.orden_id)) {
            sheet.getRange(i + 1, 11).setValue("Pagado");  // Pone Pagado en Columna 11 (Monto)
            sheet.getRange(i + 1, 16).setValue(data.hora_pago || new Date().toLocaleTimeString());
            break;
          }
        }
      }

      const transaccionesSheet = ss.getSheetByName('Transacciones');
      if (transaccionesSheet) {
          const dataRange = transaccionesSheet.getDataRange();
          const values = dataRange.getValues();
          for (let i = values.length - 1; i > 0; i--) { 
              if (String(values[i][0]) === String(data.orden_id)) {
                  transaccionesSheet.getRange(i + 1, 5).setValue(data.metodo_pago);
                  transaccionesSheet.getRange(i + 1, 6).setValue(data.monto_efectivo || 0);
                  transaccionesSheet.getRange(i + 1, 7).setValue(data.monto_tarjeta || 0);
                  transaccionesSheet.getRange(i + 1, 8).setValue(data.monto_sinpe || 0);
                  transaccionesSheet.getRange(i + 1, 9).setValue(data.monto_cxc || 0);
                  transaccionesSheet.getRange(i + 1, 10).setValue(data.responsable_cobro || "Cajero");
                  transaccionesSheet.getRange(i + 1, 11).setValue(data.hora_pago || new Date().toLocaleString());
                  break;
              }
          }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 4.B ACTUALIZAR ESTADO
    // ==========================================
    if (data.action === 'update_estado') {
      const controlSheet = ss.getSheetByName('Control General');
      if (controlSheet) {
          const dataRange = controlSheet.getDataRange();
          const values = dataRange.getValues();
          for (let i = values.length - 1; i > 0; i--) { 
              if (String(values[i][0]) === String(data.orden_id)) {
                  controlSheet.getRange(i + 1, 9).setValue(data.estado); // Columna Estado (9)
                  
                  if (data.estado === 'Terminado' && data.hora_terminado) {
                      controlSheet.getRange(i + 1, 12).setValue(data.hora_terminado); // Col 12 Hora fin
                  } else if (data.estado === 'Retirado' && data.hora_retirado) {
                      if (data.hora_terminado) { 
                          controlSheet.getRange(i + 1, 12).setValue(data.hora_terminado);
                      }
                      controlSheet.getRange(i + 1, 14).setValue(data.hora_retirado); // Col 14 Hora retiro
                  }
                  break;
              }
          }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 5. MANEJO DE DOMICILIOS
    // ==========================================
    const hojaDomicilios = "Domicilios";
    if (data.tipo_hoja === "NUEVA_ORDEN_DOMICILIO") {
      const sheet = ss.getSheetByName(hojaDomicilios);
      if (!sheet) return ContentService.createTextOutput(JSON.stringify({ error: "Hoja 'Domicilios' no existe" })).setMimeType(ContentService.MimeType.JSON);

      if (data.action === "update_domicilio") {
        const values = sheet.getDataRange().getValues();
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]) === String(data.orden_id)) {
            sheet.getRange(i + 1, 2).setValue(data.hora_agendada);
            sheet.getRange(i + 1, 3).setValue(data.nombre_cliente);
            sheet.getRange(i + 1, 4).setValue(data.celular_cliente);
            sheet.getRange(i + 1, 5).setValue(data.direccion);
            sheet.getRange(i + 1, 6).setValue(data.tipo_vehiculo);
            sheet.getRange(i + 1, 7).setValue(data.servicio_detallado);
            sheet.getRange(i + 1, 8).setValue(data.servicios_especiales);
            sheet.getRange(i + 1, 9).setValue(data.metodo_pago || 'Pendiente');
            sheet.getRange(i + 1, 10).setValue(data.total_monto);
            sheet.getRange(i + 1, 11).setValue(data.monto_efectivo || 0);
            sheet.getRange(i + 1, 12).setValue(data.monto_tarjeta || 0);
            sheet.getRange(i + 1, 13).setValue(data.monto_sinpe || 0);
            sheet.getRange(i + 1, 14).setValue(data.monto_cxc || 0);
            break;
          }
        }
      } else {
        insertInFirstGap(sheet, [
          data.orden_id, data.hora_agendada, data.nombre_cliente, data.celular_cliente,
          data.direccion, data.tipo_vehiculo, data.servicio_detallado, data.servicios_especiales,
          data.metodo_pago, data.total_monto, data.monto_efectivo, data.monto_tarjeta,
          data.monto_sinpe, data.monto_cxc
        ]);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "update_pago_domicilio") {
      const sheet = ss.getSheetByName(hojaDomicilios);
      if (sheet) {
        const values = sheet.getDataRange().getValues();
        for (let i = 1; i < values.length; i++) {
          if (String(values[i][0]) === String(data.orden_id)) {
            sheet.getRange(i + 1, 9).setValue(data.metodo_pago);
            sheet.getRange(i + 1, 10).setValue("Pagado"); 
            sheet.getRange(i + 1, 11).setValue(data.monto_efectivo);
            sheet.getRange(i + 1, 12).setValue(data.monto_tarjeta);
            sheet.getRange(i + 1, 13).setValue(data.monto_sinpe);
            sheet.getRange(i + 1, 14).setValue(data.monto_cxc);
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 6. GASTOS (Efectivo)
    // ==========================================
    if (data.action === 'gasto') {
        const sheet = ss.getSheetByName('Gastos');
        if (sheet) {
            const horaGasto = new Date().toLocaleString("es-CR");
            insertInFirstGap(sheet, [
                data.id,
                horaGasto,
                data.descripcion,
                data.monto,
                data.responsable
            ]);
        }
        
        return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === 'delete_gasto') {
        const sheet = ss.getSheetByName('Gastos');
        if (sheet) {
            const dataRange = sheet.getDataRange();
            const values = dataRange.getValues();
            for (let i = values.length - 1; i > 0; i--) { 
                if (String(values[i][0]) === String(data.id)) {
                    sheet.deleteRow(i + 1);
                    break;
                }
            }
        }
        return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // 7. VENTAS DIARIAS (Por defecto)
    // ==========================================
    const ventasSheet = ss.getSheetByName('Ventas Diarias');
    if (ventasSheet) {
      const fecha = new Date().toLocaleString("es-CR"); 
      insertInFirstGap(ventasSheet, [
        fecha, 
        data.responsable || "", 
        data.tipo_producto || "", 
        data.tipo_venta || "", 
        data.total_monto || 0, 
        data.metodo_pago || "", 
        data.monto_efectivo || 0, 
        data.monto_tarjeta || 0, 
        data.monto_sinpe || 0, 
        data.id
      ]);
    }



    return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ error: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    
    // Lista de correos destino separados por coma
    const emailDestino = "andreyfigueroa3@gmail.com, edergarciapalacios@icloud.com, agranadosseguros@gmail.com";
    
    // ==========================================
    // ACCIÓN 1: Alerta de Inicio de Sesión
    // ==========================================
    if (data.action === "login_alert") {
      const asunto = "🚨 Alerta de Inicio de Sesión - NeuraLoom";
      const mensaje = `Estimado(s),\n\nEl miembro del personal "${data.nombre}" (${data.email}) ha iniciado sesión en el sistema el ${data.fecha}.\n\nEste es un correo automático de seguridad.`;
      
      MailApp.sendEmail(emailDestino, asunto, mensaje);
      return ContentService.createTextOutput(JSON.stringify({"status": "success", "msg": "Correo enviado"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ==========================================
    // ACCIÓN 2: Alerta de Eliminación Global
    // ==========================================
    if (data.action === "ALERTA_ELIMINACION") {
      const subject = "⚠️ ALERTA DE SEGURIDAD: Registro Eliminado en " + data.modulo;
      
      const body = "Hola a todos,\n\n" +
                   "El sistema ha registrado la eliminación permanente de un dato.\n\n" +
                   "📍 Módulo afectado: " + data.modulo + "\n" +
                   "👤 Usuario que eliminó: " + (data.usuario || "Desconocido") + "\n" +
                   "📝 Detalle del registro: " + data.detalle + "\n" +
                   "🕒 Fecha y Hora: " + new Date().toLocaleString("es-CR") + "\n\n" +
                   "Este es un mensaje automático del Sistema Sus Amigos.";
                   
      MailApp.sendEmail(emailDestino, subject, body);
      return ContentService.createTextOutput(JSON.stringify({"status": "success", "msg": "Correo de alerta enviado"}))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ==========================================
    // ACCIÓN 3: Alerta de Cambio de Caja Inicial
    // ==========================================
    if (data.action === "alerta_caja") {
      const subject = "💰 AVISO: Modificación de Caja Inicial";
      
      const body = "Hola a todos,\n\n" +
                   "Se ha reportado una modificación en el monto base de la Caja Inicial desde el Dashboard.\n\n" +
                   "👤 Usuario: " + (data.usuario || "Desconocido") + "\n" +
                   "💵 Nuevo Monto en Caja: ₡" + data.nuevo_monto + "\n" +
                   "🕒 Fecha y Hora: " + data.fecha + "\n\n" +
                   "Este es un mensaje automático del Sistema Sus Amigos.";
                   
      MailApp.sendEmail(emailDestino, subject, body);
      return ContentService.createTextOutput(JSON.stringify({"status": "success", "msg": "Correo de caja enviado"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ==========================================
    // ACCIÓN 4: Alerta de Edición Global
    // ==========================================
    if (data.action === "edit_alert") {
      const subject = "⚠️ ALERTA DE SEGURIDAD: Orden Editada en " + data.modulo;
      
      const body = "Hola a todos,\n\n" +
                   "El sistema ha registrado la edición de una orden previamente guardada.\n\n" +
                   "📍 Módulo afectado: " + data.modulo + "\n" +
                   "👤 Usuario que editó: " + (data.usuario || "Desconocido") + "\n" +
                   "📝 Datos de la orden ANTES de ser modificada:\n\n" + data.detalle + "\n\n" +
                   "🕒 Fecha y Hora: " + new Date().toLocaleString("es-CR") + "\n\n" +
                   "La orden original pasará a estado 'Pendiente' con los montos en 0 para que se vuelva a cobrar.\n" +
                   "Este es un mensaje automático del Sistema Sus Amigos.";
                   
      MailApp.sendEmail(emailDestino, subject, body);
      return ContentService.createTextOutput(JSON.stringify({"status": "success", "msg": "Correo de edición enviado"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "msg": "Acción no reconocida"}))
        .setMimeType(ContentService.MimeType.JSON);
        
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

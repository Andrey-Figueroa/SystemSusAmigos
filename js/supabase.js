/**
 * NeuraLoom Auto - Supabase Client Initialization
 * 
 * Para conectar con tu proyecto de Supabase, reemplaza los valores de 
 * 'supabaseUrl' y 'supabaseAnonKey' con los datos de tu proyecto.
 * 
 * Puedes encontrarlos en tu panel de Supabase:
 * Settings (Engranaje) -> API -> Project URL & API Key (anon/public)
 */

// Las credenciales viven en js/config.js (cargado antes que este archivo)
const supabaseUrl = window.APP_CONFIG.supabaseUrl;
const supabaseAnonKey = window.APP_CONFIG.supabaseAnonKey;

if (supabaseUrl === 'YOUR_SUPABASE_URL' || supabaseAnonKey === 'YOUR_SUPABASE_ANON_KEY') {
    console.warn(
        '%c[SUPABASE CONFIG WARNING] %cIngresa tu URL y Anon Key en "js/supabase.js" para conectar tu base de datos.',
        'color: #f59e0b; font-weight: bold;',
        'color: #ffffff;'
    );
}

// Guardar la librería original para poder usar createClient en el futuro
window.supabaseLib = window.supabase;

// Inicializar el cliente globalmente para que esté disponible en app.js
const supabaseClient = window.supabase ? window.supabase.createClient(supabaseUrl, supabaseAnonKey) : null;
window.supabase = supabaseClient || window.supabase;

// ==========================================
// Función global de Alertas de Eliminación
// ==========================================
window.enviarAlertaEliminacion = async function(modulo, detalle) {
    try {
        const webhookUrl = window.APP_CONFIG.alertWebhookUrl;
        
        // Obtener el usuario actual si existe en localStorage
        const activeUser = localStorage.getItem('activeUser') || "Desconocido";

        console.log(`[Alerta Eliminación] Enviando alerta... Módulo: ${modulo}, Detalle: ${detalle}`);

        const response = await fetch(webhookUrl, {
            method: 'POST',
            body: JSON.stringify({
                action: 'ALERTA_ELIMINACION',
                modulo: modulo,
                detalle: detalle,
                usuario: activeUser
            }),
            headers: {
                'Content-Type': 'text/plain;charset=utf-8' // Se usa text/plain por CORS
            }
        });

        const text = await response.text();
        console.log("[Alerta Eliminación] Respuesta recibida:", text);
        
        try {
            const resJson = JSON.parse(text);
            if (resJson.error) {
                console.error("[Alerta Eliminación] Error en Apps Script:", resJson.error);
            }
        } catch (jsonErr) {
            // No es un JSON, puede ser la respuesta HTML por redirección de Google
        }
    } catch (e) {
        console.error("Error enviando alerta de eliminación:", e);
    }
};

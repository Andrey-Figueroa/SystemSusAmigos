/**
 * NeuraLoom Auto - Supabase Client Initialization
 * 
 * Para conectar con tu proyecto de Supabase, reemplaza los valores de 
 * 'supabaseUrl' y 'supabaseAnonKey' con los datos de tu proyecto.
 * 
 * Puedes encontrarlos en tu panel de Supabase:
 * Settings (Engranaje) -> API -> Project URL & API Key (anon/public)
 */

const supabaseUrl = 'https://bsdeqwvyshwswgqpvvqs.supabase.co'; 
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZGVxd3Z5c2h3c3dncXB2dnFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NzA4NjEsImV4cCI6MjA5ODU0Njg2MX0.Nkrc9hb4sX_X8nmua-rva7GM9gnipXCtuascW9yqd7Y';

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
        const webhookUrl = "https://script.google.com/macros/s/AKfycbzk_1S1D3r25jlfnNXHocOuzeQZiL-GpGwgqkuilgpC2ObP-YYdX09CLH5GePMFQ9GQ/exec";
        
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

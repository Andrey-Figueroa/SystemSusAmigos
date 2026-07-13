document.addEventListener('DOMContentLoaded', () => {
    // 1. Authentication Check
    const activeUser = localStorage.getItem('activeUser');
    const activeUserRole = localStorage.getItem('activeUserRole');
    
    if (!activeUser) {
        window.location.href = '../login/index.html';
        return;
    }

    // 2. Set User Displays
    const displayUser = document.getElementById('display-user');
    const displayResponsable = document.getElementById('responsable-text');
    
    if (displayUser) displayUser.textContent = activeUser;
    if (displayResponsable) displayResponsable.textContent = activeUser;

    // 3. Drag & Drop UI Logic
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const dropzoneContent = document.querySelector('.dropzone-content');
    const dropzonePreview = document.getElementById('dropzone-preview');
    const fileNameDisplay = document.getElementById('file-name');
    const btnRemoveFile = document.getElementById('btn-remove-file');
    
    let selectedFile = null;

    // Trigger file input click when dropzone is clicked
    dropzone.addEventListener('click', (e) => {
        // Prevent click if clicking the remove button
        if(e.target.closest('#btn-remove-file')) return;
        fileInput.click();
    });

    // Handle file selection from dialog
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
            dropzone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => {
            dropzone.classList.remove('dragover');
        }, false);
    });

    // Handle dropped file
    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            // Check if it's an image (basic check)
            if(files[0].type.startsWith('image/')) {
                fileInput.files = files; // Sync with hidden input
                handleFile(files[0]);
            } else {
                showToast('Error', 'Solo se permiten imágenes.', 'error');
            }
        }
    }, false);

    // Function to update UI with file info
    function handleFile(file) {
        selectedFile = file;
        fileNameDisplay.textContent = file.name;
        dropzoneContent.style.display = 'none';
        dropzonePreview.style.display = 'flex';
        dropzone.style.borderColor = 'var(--success-color)';
    }

    // Remove file
    btnRemoveFile.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering dropzone click
        selectedFile = null;
        fileInput.value = ''; // Clear input
        dropzonePreview.style.display = 'none';
        dropzoneContent.style.display = 'block';
        dropzone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
    });

    // URL del Google Apps Script (Webhook)
    // El usuario deberá reemplazar esto con la URL obtenida al desplegar el script
    const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwD-GBtbtn5zxXRdUKyb-Wa6jc0o6_z2H2gt7-j_Lnyw1p1mdsWj5hsxnwmOflEHZgg/exec';

    // 4. Form Submit (Actual Implementation)
    const form = document.getElementById('cierre-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if(!selectedFile) {
            showToast('Error', 'Debes adjuntar el comprobante o voucher.', 'error');
            return;
        }

        const btn = document.getElementById('btn-procesar-cierre');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
        btn.disabled = true;

        try {
            // 1. Subir imagen a Supabase Storage (Bucket: comprobantes_cierre)
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `${Date.now()}_cierre.${fileExt}`;
            
            const { data: uploadData, error: uploadError } = await window.supabase
                .storage
                .from('comprobantes_cierre')
                .upload(`vouchers/${fileName}`, selectedFile);

            if (uploadError) throw new Error('Error subiendo comprobante: ' + uploadError.message);

            // Obtener URL pública
            const { data: publicUrlData } = window.supabase.storage
                .from('comprobantes_cierre')
                .getPublicUrl(`vouchers/${fileName}`);
                
            const publicUrl = publicUrlData.publicUrl;

            // 2. Ejecutar RPC para vaciar tablas y reiniciar contadores
            const { error: rpcError } = await window.supabase.rpc('reiniciar_contadores_diarios');
            if (rpcError) throw new Error('Error reiniciando base de datos: ' + rpcError.message);

            // 3. Obtener fecha y hora actual formateada localmente
            const now = new Date();
            const fechaFormateada = now.toLocaleDateString('es-CR');
            const horaFormateada = now.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });

            // 4. Enviar datos al Google Apps Script (Email, Backup Drive, Vaciar Sheets)
            const payload = {
                action: 'cierre_operaciones',
                responsable: activeUser,
                inconvenientes: document.getElementById('comentarios-cierre').value.trim(),
                comprobanteUrl: publicUrl,
                fecha: fechaFormateada,
                hora: horaFormateada
            };

            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                }
            });

            const result = await response.json();
            if(result.error) throw new Error('Error en Apps Script: ' + result.error);

            // Limpiar UI
            btnRemoveFile.click();
            document.getElementById('comentarios-cierre').value = '';
            
            showToast('Éxito', 'El cierre de operaciones se ha completado. Historial guardado y base reseteada a 1.');
            
        } catch (err) {
            console.error(err);
            showToast('Error', err.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
});

// Toast Notifications Helper
function showToast(title, message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-check' : 'fa-triangle-exclamation';
    
    toast.innerHTML = `
        <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="toast-content">
            <h4 class="toast-title">${title}</h4>
            <p class="toast-message">${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}



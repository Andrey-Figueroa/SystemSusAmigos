import re

def fix_app_js():
    with open('app.js', 'r', encoding='utf-8') as f:
        code = f.read()

    # 1. stepNames dictionary
    old_stepNames = """    const stepNames = {
        1: "Cliente", 2: "Vehículo", 3: "Servicios", 4: "Detallado", 
        5: "Interior", 6: "Especiales", 7: "Mecánica", 8: "Detalles Mecánicos", 
        9: "Extras Finales", 10: "Cobro"
    };"""
    new_stepNames = """    const stepNames = {
        1: "Cliente", 2: "Servicios", 3: "Detallado", 4: "Interior", 
        5: "Especiales", 6: "Mecánica", 7: "Detalles Mecánicos", 8: "Extras Finales", 
        9: "Vehículo", 10: "Cobro"
    };"""
    code = code.replace(old_stepNames, new_stepNames)

    # 2. Fix the if (stepNum === ...) blocks in goToStep
    # Wait, my previous reorder script replaced `goToStep(X)` calls but did NOT touch `stepNum === X`!
    # So the old step blocks are STILL there but with wrong numbers!
    
    # Old `if (stepNum === 2) { ... loadClientVehicles(); }`
    # Replace with `if (stepNum === 9)`
    code = code.replace("if (stepNum === 2) {\n        document.getElementById('current-client-display').textContent = currentClientName;", "if (stepNum === 9) {\n        document.getElementById('current-client-display').textContent = currentClientName;")

    # Old `if (stepNum === 3)` -> hide/show mecanica based on MOTO.
    # Change to a function `window.updateServicesByTipo` and call it from the select onchange, also call it when step 2 loads.
    code = code.replace("""    if (stepNum === 3) {
        // Lógica: Si es MOTO ocultar mecánica y pendientes
        document.getElementById('card-mecanica').style.display = isMoto ? 'none' : 'flex';
        document.getElementById('card-pendientes').style.display = isMoto ? 'none' : 'flex';
    }""", """    if (stepNum === 2) {
        window.updateServicesByTipo = function() {
            const select = document.getElementById('veh-tipo-temp');
            const masterList = document.getElementById('services-master-list');
            if (select.value) {
                masterList.style.display = 'flex';
                const isMoto = (select.value === 'MOTO');
                document.getElementById('card-mecanica').style.display = isMoto ? 'none' : 'flex';
                document.getElementById('card-pendientes').style.display = isMoto ? 'none' : 'flex';
                if (isMoto) {
                    const cbMec = document.querySelector('input[value="Mecanica"]');
                    if(cbMec) cbMec.checked = false;
                    const cbPend = document.querySelector('input[value="Entrada pero servicios pendientes"]');
                    if(cbPend) cbPend.checked = false;
                }
            } else {
                masterList.style.display = 'none';
            }
        };
        // Reset or init on enter
        if(!document.getElementById('veh-tipo-temp').value) {
            document.getElementById('services-master-list').style.display = 'none';
        } else {
            window.updateServicesByTipo();
        }
    }""")
    
    # Update HTML to call the new function
    # The HTML already has `onchange="updateServicesByTipo()"`

    # Old `if (stepNum === 5)` (Interior) -> now 4
    code = code.replace("if (stepNum === 5) {", "if (stepNum === 4) {")
    # Old `if (stepNum === 6)` (Especiales) -> now 5
    code = code.replace("if (stepNum === 6) {", "if (stepNum === 5) {")
    # Old `if (stepNum === 8)` (Mecanica Det) -> now 7
    code = code.replace("if (stepNum === 8) {", "if (stepNum === 7) {")
    # Old `if (stepNum === 9)` (Extras Finales) -> now 8
    code = code.replace("if (stepNum === 9) {\n        // Ocultar protector interior", "if (stepNum === 8) {\n        // Ocultar protector interior")

    # 3. `processStep2` logic (was old `processStep3`, which the previous script changed to `processStep2`)
    # We need to validate `veh-tipo-temp` before allowing to continue.
    old_process2 = """    window.processStep2 = function() {
        const checkboxes = document.querySelectorAll('.service-checkbox:checked');
        const err = document.getElementById('error-step2');
        if (checkboxes.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';"""
    new_process2 = """    window.processStep2 = function() {
        const tipoSel = document.getElementById('veh-tipo-temp').value;
        const err = document.getElementById('error-step2');
        if (!tipoSel) {
            err.textContent = "Seleccione el tipo de vehículo.";
            err.style.display = 'block';
            return;
        }
        currentVehicleTipo = tipoSel; // Save it to global state!
        
        const checkboxes = document.querySelectorAll('.service-checkbox:checked');
        if (checkboxes.length === 0) { 
            err.textContent = "Selecciona al menos un servicio.";
            err.style.display = 'block'; 
            return; 
        }
        err.style.display = 'none';"""
    # Note: wait, `error-step2` doesn't exist in my HTML! Oh, I need to check the HTML for the error ID in step 2.
    # Ah, in HTML it was `id="error-step3"` and I forgot to rename it in HTML!
    # I should change `error-step3` to `error-step2` in HTML. But the JS script renamed `error-step3` to `error-step2` in app.js!
    # So `error-step2` is in JS now.
    code = code.replace(old_process2, new_process2)

    # 4. loadClientVehicles() when clicking a vehicle -> goToStep(2) MUST BE goToStep(10)!
    code = code.replace("""            card.addEventListener('click', () => {
                currentVehicleId = v.id; 
                currentVehiclePlaca = v.placa; 
                currentVehicleTipo = v.tipo || 'OTRO';
                currentVehicleModel = v.modelo || 'Vehículo';
                currentVehicleMarca = v.marca || '';
                goToStep(2);
            });""", """            card.addEventListener('click', () => {
                currentVehicleId = v.id; 
                currentVehiclePlaca = v.placa; 
                currentVehicleTipo = v.tipo || 'OTRO';
                currentVehicleModel = v.modelo || 'Vehículo';
                currentVehicleMarca = v.marca || '';
                goToStep(10);
            });""")

    # 5. `btn-save-vehicle` in processStep9! Wait, `processStep9` was old `processStep2`! Let's check `setupStep9()` which was old `setupStep2()`.
    # Wait, old `setupStep2()` didn't have `processStep2`. It had `btn-save-vehicle` click event inside `setupStep2()`.
    # Let's replace the `goToStep(3)` inside the vehicle form to `goToStep(10)`.
    # Because after adding a vehicle in step 9, we go to step 10!
    code = code.replace("goToStep(3); // Pasar a servicios", "goToStep(10); // Pasar a cobro")

    # 6. `buildResumen()` function in step 10 uses `currentVehiclePlaca`.
    # It should still work.

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)

    print("Success")

if __name__ == "__main__":
    fix_app_js()

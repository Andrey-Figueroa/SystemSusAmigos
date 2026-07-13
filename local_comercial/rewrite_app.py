import re

def rewrite_app_js():
    with open('app.js.bak', 'r', encoding='utf-8') as f:
        code = f.read()

    # Step Names
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

    # 1. Update the setupStepX and processStepX definitions.
    # The functions need to be renamed to match their new roles.
    # Old 2 -> 9
    # Old 3 -> 2
    # Old 4 -> 3
    # Old 5 -> 4
    # Old 6 -> 5
    # Old 7 -> 6
    # Old 8 -> 7
    # Old 9 -> 8
    
    # We do a temporary replacement to avoid collisions
    mapping = {
        2: 9,
        3: 2,
        4: 3,
        5: 4,
        6: 5,
        7: 6,
        8: 7,
        9: 8
    }

    for old, new in mapping.items():
        code = re.sub(rf'\bsetupStep{old}\b', f'@@setupStep{new}@@', code)
        code = re.sub(rf'\bprocessStep{old}\b', f'@@processStep{new}@@', code)
        code = re.sub(rf'\berror-step{old}\b', f'@@error-step{new}@@', code)

    code = code.replace('@@', '')

    # 2. Update specific `if (stepNum === X)` in goToStep function
    code = code.replace("if (stepNum === 2) {\n        document.getElementById('current-client-display').textContent = currentClientName;", "if (stepNum === 9) {\n        document.getElementById('current-client-display').textContent = currentClientName;")

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
        if(!document.getElementById('veh-tipo-temp').value) {
            document.getElementById('services-master-list').style.display = 'none';
        } else {
            window.updateServicesByTipo();
        }
    }""")
    
    code = code.replace("if (stepNum === 5) {", "if (stepNum === 4) {")
    code = code.replace("if (stepNum === 6) {", "if (stepNum === 5) {")
    code = code.replace("if (stepNum === 8) {", "if (stepNum === 7) {")
    code = code.replace("if (stepNum === 9) {\n        // Ocultar protector interior", "if (stepNum === 8) {\n        // Ocultar protector interior")

    # 3. Update the `goToStep` calls throughout the code
    # Edit mode: goes to old step 3 (Servicios), which is now 2.
    code = code.replace("goToStep(3); // Pasar a servicios", "goToStep(10); // Pasar a cobro")
    code = code.replace("goToStep(3);\n", "goToStep(2);\n") # for the edit mode one
    
    # Old logic for proceed functions
    code = code.replace("goToStep(6);", "@@goToStep(5);@@") # was Especiales
    code = code.replace("goToStep(7);", "@@goToStep(6);@@") # was Mecanica Cat
    code = code.replace("goToStep(9); // Siempre a extras finales", "@@goToStep(8);@@ // Siempre a extras finales") 
    
    # In proceedFromDetalladosEspeciales
    # goToStep(7) was handled.
    # goToStep(9) was handled.
    
    # In proceedFromMecanicaCategorias
    code = code.replace("goToStep(8);", "@@goToStep(7);@@") # was Mecanica Det
    
    # In proceedFromMecanicaDetalles
    # goToStep(9) was handled.
    code = code.replace("goToStep(10); // Cobro directo", "@@goToStep(10);@@ // Cobro directo")
    
    # In processStep1 (Client search/register)
    code = code.replace("goToStep(2);", "@@goToStep(2);@@") # Step 1 goes to Step 2 (Servicios) now, was Vehiculo (2). Since it's 2 either way, just mark it.
    
    # In vehicle logic (loadClientVehicles & new vehicle form) - Now this is Step 9, so it should go to 10
    code = code.replace("            card.addEventListener('click', () => {\n                currentVehicleId = v.id; \n                currentVehiclePlaca = v.placa; \n                currentVehicleTipo = v.tipo || 'OTRO';\n                currentVehicleModel = v.modelo || 'Vehículo';\n                currentVehicleMarca = v.marca || '';\n                goToStep(3);\n            });", "            card.addEventListener('click', () => {\n                currentVehicleId = v.id; \n                currentVehiclePlaca = v.placa; \n                currentVehicleTipo = v.tipo || 'OTRO';\n                currentVehicleModel = v.modelo || 'Vehículo';\n                currentVehicleMarca = v.marca || '';\n                goToStep(10);\n            });")

    # In Step 3 (Servicios) -> now Step 2
    code = code.replace("goToStep(4);", "@@goToStep(3);@@") # was Detallado
    
    # Step 4 (Detallado) -> now Step 3
    code = code.replace("goToStep(5);", "@@goToStep(4);@@") # was Interior
    
    # Step 9 (Extras Finales) -> now Step 8
    # It used to go to 10. Now it must go to 9 (Vehiculo)
    # The button calls processStep9 (now processStep8).
    # In old code it was window.processStep9 = function() { ... goToStep(10); }
    # So we replace goToStep(10); with goToStep(9); for that specific block
    code = code.replace("""    window.processStep8 = function() {
        const cbs = document.querySelectorAll('.extra-final-cb:checked');
        const err = document.getElementById('error-step8');
        if (cbs.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';

        ordenData.extras_finales = Array.from(cbs).map(c => c.value);
        goToStep(10);
    }""", """    window.processStep8 = function() {
        const cbs = document.querySelectorAll('.extra-final-cb:checked');
        const err = document.getElementById('error-step8');
        if (cbs.length === 0) { err.style.display = 'block'; return; }
        err.style.display = 'none';

        ordenData.extras_finales = Array.from(cbs).map(c => c.value);
        goToStep(9);
    }""")

    # Clean up the @@ marks
    code = code.replace('@@', '')

    # 4. Modify processStep2 to validate the vehicle type first
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
        currentVehicleTipo = tipoSel;
        
        const checkboxes = document.querySelectorAll('.service-checkbox:checked');
        if (checkboxes.length === 0) { 
            err.textContent = "Selecciona al menos un servicio.";
            err.style.display = 'block'; 
            return; 
        }
        err.style.display = 'none';"""
    code = code.replace(old_process2, new_process2)

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print("Done generating app.js!")

if __name__ == "__main__":
    rewrite_app_js()

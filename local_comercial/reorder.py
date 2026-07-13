import re
import sys

def swap_steps():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split content by steps
    steps = []
    
    # Match everything before STEP 1
    pre_match = re.search(r'(.*?)(<!-- STEP 1:)', content, re.DOTALL)
    pre = pre_match.group(1)
    
    rest = content[len(pre):]
    
    # Split the rest by '<!-- STEP '
    parts = re.split(r'(?=<!-- STEP \d+:)', rest)
    
    # parts[0] might be empty
    if parts[0] == '':
        parts.pop(0)
        
    steps_html = parts[:10]
    post_html = "".join(parts[10:])
    
    # We want: 
    # New Step 1: Old Step 1 (Cliente)
    # New Step 2: Old Step 3 (Servicios)
    # New Step 3: Old Step 4 (Tipo Detallado)
    # New Step 4: Old Step 5 (Opciones Interior)
    # New Step 5: Old Step 6 (Detallados Especiales)
    # New Step 6: Old Step 7 (Mecanica Categorias)
    # New Step 7: Old Step 8 (Mecanica Detalles)
    # New Step 8: Old Step 9 (Extras Finales)
    # New Step 9: Old Step 2 (Vehiculo)
    # New Step 10: Old Step 10 (Cobro)
    
    new_order = [0, 2, 3, 4, 5, 6, 7, 8, 1, 9]
    
    new_steps = []
    for new_idx, old_idx in enumerate(new_order):
        step_str = steps_html[old_idx]
        
        # update the STEP comment
        step_str = re.sub(r'<!-- STEP \d+:', f'<!-- STEP {new_idx+1}:', step_str, 1)
        
        # update the id="step-X"
        step_str = re.sub(r'id="step-\d+"', f'id="step-{new_idx+1}"', step_str, 1)
        
        new_steps.append(step_str)
        
    final_content = pre + "".join(new_steps) + post_html
    
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(final_content)

    print("Success")

if __name__ == "__main__":
    swap_steps()

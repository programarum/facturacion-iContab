"""
Script de inicio del backend para Tauri.
Busca el venv de Python y ejecuta uvicorn desde ahi.
"""
import sys
import os
import subprocess
import socket
import time

BACKEND_PORT = 8000
BACKEND_MODULE = "app.main:app"

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.connect(("127.0.0.1", port))
            return True
        except ConnectionRefusedError:
            return False

def find_venv_python(script_dir: str):
    """Busca el python del venv en varias ubicaciones posibles"""
    candidates = [
        os.path.join(script_dir, "backend", "venv", "Scripts", "python.exe"),
        os.path.join(script_dir, "venv", "Scripts", "python.exe"),
        os.path.join(script_dir, "backend", "venv", "bin", "python"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None

def start_backend():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(script_dir, "backend")

    if not os.path.exists(backend_dir):
        print(f"ERROR: No se encontro el directorio backend en: {backend_dir}")
        sys.exit(1)

    if is_port_in_use(BACKEND_PORT):
        print(f"Backend ya esta ejecutando en puerto {BACKEND_PORT}")
        sys.exit(0)

    # Buscar Python del venv
    python_cmd = find_venv_python(script_dir)
    if not python_cmd:
        # Fallback: python del sistema
        for cmd in ["python", "python3", "py"]:
            try:
                result = subprocess.run([cmd, "--version"], capture_output=True, text=True)
                if result.returncode == 0:
                    python_cmd = cmd
                    break
            except FileNotFoundError:
                continue

    if not python_cmd:
        print("ERROR: Python no encontrado")
        sys.exit(1)

    print(f"Usando Python: {python_cmd}")
    print(f"Directorio backend: {backend_dir}")

    # Cambiar al directorio del backend (necesario para los imports)
    os.chdir(backend_dir)

    # Iniciar uvicorn
    cmd = [
        python_cmd, "-m", "uvicorn",
        BACKEND_MODULE,
        "--host", "127.0.0.1",
        "--port", str(BACKEND_PORT),
        "--log-level", "warning"
    ]

    print(f"Ejecutando: {' '.join(cmd)}")
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    )

    # Esperar a que el backend este listo
    for i in range(30):
        time.sleep(1)
        if is_port_in_use(BACKEND_PORT):
            print(f"Backend listo en puerto {BACKEND_PORT} (PID: {process.pid})")
            process.wait()
            sys.exit(0)

    print("ERROR: Backend no inicio en 30 segundos")
    process.kill()
    sys.exit(1)

if __name__ == "__main__":
    start_backend()

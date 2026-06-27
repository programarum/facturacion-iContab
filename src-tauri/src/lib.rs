use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use std::process::{Command, Child};
use std::fs;
use std::path::PathBuf;
use std::net::TcpStream;
use std::io::{Write, Read};
use std::os::windows::process::CommandExt;

// ==================== BACKEND MANAGEMENT ====================

struct BackendState {
    child: std::sync::Mutex<Option<Child>>,
}

const BACKEND_PORT: u16 = 8000;

fn is_port_open(port: u16) -> bool {
    TcpStream::connect(format!("127.0.0.1:{}", port)).is_ok()
}

#[tauri::command]
fn check_backend() -> bool {
    is_port_open(BACKEND_PORT)
}

#[tauri::command]
fn health_check() -> Result<String, String> {
    let mut stream = TcpStream::connect(format!("127.0.0.1:{}", BACKEND_PORT))
        .map_err(|e| format!("No se pudo conectar: {}", e))?;

    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .map_err(|e| format!("Error enviando request: {}", e))?;

    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|e| format!("Error leyendo response: {}", e))?;

    if response.contains("200") {
        Ok("ok".to_string())
    } else {
        Err(format!("Backend respondio con error: {}", response.lines().next().unwrap_or("")))
    }
}

#[tauri::command]
fn start_backend(app_handle: tauri::AppHandle, _state: State<BackendState>) -> Result<String, String> {
    if is_port_open(BACKEND_PORT) {
        return Ok("Backend ya esta ejecutando".to_string());
    }

    start_backend_internal(&app_handle)?;

    Ok("Backend iniciado".to_string())
}

#[tauri::command]
fn stop_backend(state: State<BackendState>) -> Result<String, String> {
    let mut child_ref = state.child.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = *child_ref {
        child.kill().map_err(|e| format!("Error deteniendo backend: {}", e))?;
        *child_ref = None;
        return Ok("Backend detenido".to_string());
    }
    Ok("Backend no estaba ejecutando".to_string())
}

fn find_python() -> Option<String> {
    // Buscar python del sistema
    for cmd in &["python", "python3", "py"] {
        if let Ok(output) = Command::new(cmd).arg("--version").output() {
            if output.status.success() {
                return Some(cmd.to_string());
            }
        }
    }
    None
}

fn find_venv_python(project_root: &PathBuf) -> Option<String> {
    let candidates = vec![
        project_root.join("backend").join("venv").join("Scripts").join("python.exe"),
        project_root.join("venv").join("Scripts").join("python.exe"),
    ];
    for path in candidates {
        if path.exists() {
            log::info!("Python venv encontrado: {:?}", path);
            return Some(path.to_string_lossy().to_string());
        }
    }
    log::warn!("Python venv no encontrado, buscando python del sistema...");
    find_python()
}

// ==================== PRINTER ====================

#[derive(Serialize, Deserialize, Debug, Clone)]
struct TicketData {
    titulo: String,
    fecha: String,
    numero_ticket: String,
    items: Vec<TicketItem>,
    total_cantidad: i32,
    total_valor: f64,
    usuario: String,
    nota: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct TicketItem {
    codigo: String,
    nombre: String,
    cantidad: i32,
    precio_unitario: f64,
    subtotal: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct PrinterConfig {
    nombre: String,
    tipo: String,
    ancho_caracteres: i32,
}

struct PrinterState {
    config: std::sync::Mutex<PrinterConfig>,
}

#[tauri::command]
fn configurar_impresora(config: PrinterConfig, state: State<PrinterState>) -> Result<String, String> {
    let mut printer = state.config.lock().map_err(|e| e.to_string())?;
    *printer = config;
    Ok(format!("Impresora configurada: {}", printer.nombre))
}

#[tauri::command]
fn obtener_impresoras() -> Result<Vec<String>, String> {
    let output = Command::new("powershell")
        .args([
            "-Command",
            "Get-Printer | Select-Object -ExpandProperty Name"
        ])
        .output()
        .map_err(|e| format!("Error ejecutando PowerShell: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let impresoras: Vec<String> = stdout
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    Ok(impresoras)
}

#[tauri::command]
fn imprimir_ticket(
    ticket: TicketData,
    state: State<PrinterState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    let printer = state.config.lock().map_err(|e| e.to_string())?;

    let contenido = formatear_ticket_escpos(&ticket, printer.ancho_caracteres);

    match printer.tipo.as_str() {
        "usb" | "lpt" | "red" => {
            enviar_a_impresora_windows(&contenido, &printer.nombre)?;
            Ok("Ticket enviado a impresora".to_string())
        }
        "pdf" => {
            let path = app_handle.path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            let file_path = path.join(format!("ticket_{}.txt", ticket.numero_ticket));
            fs::write(&file_path, &contenido)
                .map_err(|e| format!("Error guardando archivo: {}", e))?;
            Ok(format!("Ticket guardado en: {:?}", file_path))
        }
        _ => Err("Tipo de impresora no soportado".to_string()),
    }
}

fn formatear_ticket_escpos(ticket: &TicketData, ancho: i32) -> Vec<u8> {
    let mut buffer: Vec<u8> = Vec::new();

    let esc: u8 = 0x1B;
    let gs: u8 = 0x1D;

    buffer.push(esc);
    buffer.push(0x40);

    buffer.push(esc);
    buffer.push(0x61);
    buffer.push(0x01);

    buffer.push(esc);
    buffer.push(0x21);
    buffer.push(0x30);

    buffer.extend(ticket.titulo.as_bytes());
    buffer.push(b'\n');

    buffer.push(esc);
    buffer.push(0x21);
    buffer.push(0x00);

    buffer.push(esc);
    buffer.push(0x61);
    buffer.push(0x01);

    buffer.extend(format!("Ticket: #{}\n", ticket.numero_ticket).as_bytes());
    buffer.extend(format!("Fecha: {}\n", ticket.fecha).as_bytes());
    buffer.extend(format!("Usuario: {}\n", ticket.usuario).as_bytes());
    buffer.extend(b"--------------------------------\n");

    buffer.push(esc);
    buffer.push(0x61);
    buffer.push(0x00);

    if ancho >= 48 {
        buffer.extend(b"CODIGO  PRODUCTO              CANT  P.UNIT  SUBTOTAL\n");
    } else {
        buffer.extend(b"PRODUCTO       CANT  TOTAL\n");
    }
    buffer.extend(b"--------------------------------\n");

    for item in &ticket.items {
        if ancho >= 48 {
            let linea = format!(
                "{:<8}{:<24}{:>4}{:>8}{:>10}\n",
                truncar(&item.codigo, 8),
                truncar(&item.nombre, 24),
                item.cantidad,
                format!("${:.2}", item.precio_unitario),
                format!("${:.2}", item.subtotal)
            );
            buffer.extend(linea.as_bytes());
        } else {
            let linea = format!(
                "{:<16}{:>4}{:>10}\n",
                truncar(&item.nombre, 16),
                item.cantidad,
                format!("${:.2}", item.subtotal)
            );
            buffer.extend(linea.as_bytes());
        }
    }

    buffer.extend(b"--------------------------------\n");

    buffer.push(esc);
    buffer.push(0x61);
    buffer.push(0x02);

    buffer.extend(format!("TOTAL ITEMS: {}\n", ticket.total_cantidad).as_bytes());

    buffer.push(esc);
    buffer.push(0x21);
    buffer.push(0x30);
    buffer.extend(format!("TOTAL: ${:.2}\n", ticket.total_valor).as_bytes());

    buffer.push(esc);
    buffer.push(0x21);
    buffer.push(0x00);

    if let Some(nota) = &ticket.nota {
        buffer.push(esc);
        buffer.push(0x61);
        buffer.push(0x01);
        buffer.extend(b"\n");
        buffer.extend(nota.as_bytes());
        buffer.extend(b"\n");
    }

    buffer.push(esc);
    buffer.push(0x61);
    buffer.push(0x01);
    buffer.extend(b"\n");
    buffer.extend(b"Gracias por su preferencia\n");
    buffer.extend(b"\n\n\n");

    buffer.push(gs);
    buffer.push(0x56);
    buffer.push(0x00);

    buffer
}

fn truncar(s: &str, max_len: usize) -> String {
    if s.len() > max_len {
        format!("{}..", &s[..max_len - 2])
    } else {
        s.to_string()
    }
}

fn enviar_a_impresora_windows(contenido: &[u8], nombre_impresora: &str) -> Result<(), String> {
    let temp_path = std::env::temp_dir().join("ticket_temp.txt");
    fs::write(&temp_path, contenido)
        .map_err(|e| format!("Error escribiendo temporal: {}", e))?;

    let output = Command::new("cmd")
        .args([
            "/C",
            &format!("print /D:\"{}\" \"{}\"", nombre_impresora, temp_path.to_str().unwrap())
        ])
        .output()
        .map_err(|e| format!("Error ejecutando print: {}", e))?;

    if !output.status.success() {
        let _ = Command::new("notepad")
            .args(["/p", temp_path.to_str().unwrap()])
            .spawn();
    }

    Ok(())
}

// ==================== APP ENTRY ====================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(BackendState {
            child: std::sync::Mutex::new(None),
        })
        .manage(PrinterState {
            config: std::sync::Mutex::new(PrinterConfig {
                nombre: "Generic / Text Only".to_string(),
                tipo: "pdf".to_string(),
                ancho_caracteres: 32,
            }),
        })
        .invoke_handler(tauri::generate_handler![
            // Backend management
            check_backend,
            health_check,
            start_backend,
            stop_backend,
            // Printer
            obtener_impresoras,
            configurar_impresora,
            imprimir_ticket
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Intentar iniciar el backend automaticamente (dev y prod)
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(500));
                if !is_port_open(BACKEND_PORT) {
                    log::info!("Backend no detectado, iniciando...");
                    match start_backend_internal(&handle) {
                        Ok(_) => log::info!("Backend iniciado correctamente"),
                        Err(e) => log::error!("Error iniciando backend: {}", e),
                    }
                } else {
                    log::info!("Backend ya esta ejecutando en puerto {}", BACKEND_PORT);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                log::info!("Ventana cerrada, deteniendo backend...");
                let state = window.state::<BackendState>();
                let mut child_ref = state.child.lock().unwrap();
                if let Some(ref mut child) = *child_ref {
                    let _ = child.kill();
                    log::info!("Backend detenido");
                }
                drop(child_ref);
            }
        })
        .run(tauri::generate_context!())
        .expect("Error al iniciar Tauri");
}

fn start_backend_internal(_app_handle: &tauri::AppHandle) -> Result<(), String> {
    // current_dir() es src-tauri, necesitamos subir a la raiz del proyecto
    let current = std::env::current_dir()
        .map_err(|e| format!("Error obteniendo directorio actual: {}", e))?;
    let project_root = current.parent()
        .ok_or("No se pudo obtener la raiz del proyecto")?
        .to_path_buf();

    // Buscar en multiple ubicaciones
    let backend_exe = project_root.join("backend.exe");
    let start_script = project_root.join("start_backend.py");
    let backend_dir = project_root.join("backend");
    let backend_main = backend_dir.join("app").join("main.py");

    if backend_exe.exists() {
        log::info!("Iniciando backend.exe: {:?}", backend_exe);
        Command::new(&backend_exe)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("Error iniciando backend.exe: {}", e))?;
    } else if start_script.exists() {
        log::info!("Iniciando start_backend.py: {:?}", start_script);
        let python = find_venv_python(&project_root).ok_or("Python no encontrado")?;
        Command::new(&python)
            .arg(&start_script)
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("Error iniciando backend: {}", e))?;
    } else if backend_main.exists() {
        let python = find_venv_python(&project_root).ok_or("Python no encontrado")?;
        log::info!("Iniciando uvicorn con {} desde {:?}", python, backend_dir);
        Command::new(&python)
            .current_dir(&backend_dir)
            .args(["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", &BACKEND_PORT.to_string(), "--log-level", "warning"])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| format!("Error iniciando uvicorn: {}", e))?;
    } else {
        return Err(format!("No se encontro el backend en: {:?}", project_root));
    }

    // Esperar a que el backend este listo
    for _ in 0..30 {
        std::thread::sleep(std::time::Duration::from_secs(1));
        if is_port_open(BACKEND_PORT) {
            log::info!("Backend listo en puerto {}", BACKEND_PORT);
            return Ok(());
        }
    }

    Err("Backend no inicio en 30 segundos".to_string())
}

use tauri::{Manager, State};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::fs;
use std::path::PathBuf;

// Módulos del backend Rust
mod commands;
mod backup;
mod db;
#[cfg(feature = "demo")]
mod demo;
mod fiscal;
mod license;
mod security;
mod seed;
mod state;
mod units;

use state::AppState;

// ==================== MÓDULOS DE COMANDOS ====================
use commands::ajustes::{
    crear_respaldo_ahora, guardar_configuracion_negocio, guardar_directorio_respaldos,
    obtener_configuracion_negocio, obtener_configuracion_respaldos,
};
use commands::auth::{login, logout, me, refresh};
use commands::catalogo::{
    listar_categorias, crear_categoria, actualizar_categoria, eliminar_categoria,
    listar_productos, buscar_productos, crear_producto, importar_productos, actualizar_producto,
    eliminar_producto,
};
use commands::movimientos::{listar_movimientos, registrar_movimiento};
use commands::usuarios::{listar_usuarios, crear_usuario, actualizar_usuario, cambiar_password};
use commands::dashboard::dashboard_stats;
use commands::facturacion::{
    listar_clientes, crear_cliente, listar_facturas, listar_facturas_historial, obtener_factura, crear_factura,
    obtener_configuracion,
};
use license::{activar_licencia_online, importar_licencia_offline, obtener_estado_licencia};

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
    #[cfg(target_os = "windows")]
    {
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
    #[cfg(not(target_os = "windows"))]
    {
        // Linux: listar impresoras del sistema de impresion CUPS
        let output = Command::new("lpstat")
            .arg("-e")
            .output()
            .map_err(|e| format!("Error ejecutando lpstat: {}. Asegurate de tener CUPS instalado.", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let impresoras: Vec<String> = stdout
            .lines()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if impresoras.is_empty() {
            Err("No se detectaron impresoras en el sistema (CUPS)".to_string())
        } else {
            Ok(impresoras)
        }
    }
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
            enviar_a_impresora(&contenido, &printer.nombre)?;
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

#[cfg(target_os = "windows")]
fn enviar_a_impresora(contenido: &[u8], nombre_impresora: &str) -> Result<(), String> {
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

#[cfg(not(target_os = "windows"))]
fn enviar_a_impresora(contenido: &[u8], nombre_impresora: &str) -> Result<(), String> {
    // Linux: enviar al sistema de impresion CUPS con el comando lp.
    let temp_path = std::env::temp_dir().join("ticket_temp.txt");
    fs::write(&temp_path, contenido)
        .map_err(|e| format!("Error escribiendo temporal: {}", e))?;

    let output = Command::new("lp")
        .args(["-d", nombre_impresora, temp_path.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Error ejecutando lp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Error imprimiendo via CUPS: {}", stderr.trim()));
    }

    Ok(())
}

// ==================== APP ENTRY ====================

// Comandos expuestos al frontend. El parámetro opcional permite añadir
// comandos que solo existen en el build de demostración (feature `demo`).
macro_rules! manejadores_invoke {
    ($($demo:path),*) => {
        tauri::generate_handler![
            obtener_estado_licencia,
            activar_licencia_online,
            importar_licencia_offline,
            obtener_configuracion_respaldos,
            guardar_directorio_respaldos,
            crear_respaldo_ahora,
            obtener_configuracion_negocio,
            guardar_configuracion_negocio,
            // Autenticación
            login,
            logout,
            me,
            refresh,
            // Catálogo
            listar_categorias,
            crear_categoria,
            actualizar_categoria,
            eliminar_categoria,
            listar_productos,
            buscar_productos,
            crear_producto,
            importar_productos,
            actualizar_producto,
            eliminar_producto,
            // Movimientos
            listar_movimientos,
            registrar_movimiento,
            // Usuarios
            listar_usuarios,
            crear_usuario,
            actualizar_usuario,
            cambiar_password,
            // Dashboard
            dashboard_stats,
            // Facturación
            listar_clientes,
            crear_cliente,
            listar_facturas,
            listar_facturas_historial,
            obtener_factura,
            crear_factura,
            obtener_configuracion,
            // Impresión
            obtener_impresoras,
            configurar_impresora,
            imprimir_ticket
            $(, $demo)*
        ]
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PrinterState {
            config: std::sync::Mutex::new(PrinterConfig {
                nombre: "Generic / Text Only".to_string(),
                tipo: "pdf".to_string(),
                ancho_caracteres: 32,
            }),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Abrir base de datos persistente y sembrar datos iniciales
            let conn = db::abrir_conexion_app(app.handle(), "facticontab.db")
                .map_err(|e| format!("Error abriendo base de datos: {}", e))?;
            let mut conn_mut = conn;
            if let Err(e) = seed::seed_inicial(app.handle(), &mut conn_mut) {
                log::error!("Error en seed inicial: {}", e);
            }

            let backup_status = match backup::directorio_configurado(&conn_mut) {
                Ok(Some(directory)) => match backup::crear_respaldo(&conn_mut, &directory) {
                    Ok(path) => format!("Respaldo creado correctamente: {}", path.display()),
                    Err(error) => {
                        log::warn!("No se pudo crear el respaldo de inicio: {}", error);
                        format!("No se pudo crear el respaldo de inicio: {error}")
                    }
                },
                Ok(None) => "Carpeta de respaldos sin configurar.".to_string(),
                Err(error) => {
                    log::warn!("No se pudo leer la configuración de respaldos: {}", error);
                    format!("No se pudo leer la configuración de respaldos: {error}")
                }
            };

            let app_state = AppState::new(conn_mut, backup_status);
            app.manage(app_state);

            // Build de demostración: registrar el primer arranque para contar
            // los `DEMO_DIAS` días de vigencia (no aplica al build normal).
            #[cfg(feature = "demo")]
            {
                if let Err(e) = demo::registrar_inicio(app.handle()) {
                    log::warn!("No se pudo registrar el inicio del demo: {}", e);
                }
            }

            Ok(())
        });

    // El build normal no compila ni registra nada del demo; el build demo
    // añade además el comando de vencimiento.
    #[cfg(feature = "demo")]
    let builder = builder.invoke_handler(manejadores_invoke![demo::obtener_estado_demo]);

    #[cfg(not(feature = "demo"))]
    let builder = builder.invoke_handler(manejadores_invoke![]);

    builder
        .run(tauri::generate_context!())
        .expect("Error al iniciar Tauri");
}

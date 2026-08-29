// src-tauri/src/db.rs
// Módulo de base de datos: esquema SQLite embebido + conexión persistente + seed inicial.
use rusqlite::{Connection, params};
use std::path::{Path, PathBuf};
use std::fs;
use tauri::Manager;
use thiserror::Error;

// ============================================================
// ERRORES
// ============================================================

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Error de IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("No se pudo determinar la ruta de datos: {0}")]
    Ruta(String),
}

// ============================================================
// CONSTANTES
// ============================================================

const SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

-- ============ ENUMS (guardados como TEXT/VARCHAR) ============

-- ============ USUARIOS ============
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'usuario',
    activo INTEGER NOT NULL DEFAULT 1,
    bloqueado INTEGER NOT NULL DEFAULT 0,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0,
    ultimo_intento TEXT,
    cambio_password_obligatorio TEXT,
    ultimo_cambio_password TEXT,
    creado_en TEXT,
    ultimo_acceso TEXT,
    ip_ultimo_acceso TEXT
);

-- ============ LOGS (básico, relaciones) ============
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id)
);

-- ============ CATEGORÍAS ============
CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    descripcion TEXT
);

-- ============ PRODUCTOS ============
CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id),
    stock_actual INTEGER NOT NULL DEFAULT 0,
    stock_minimo INTEGER NOT NULL DEFAULT 5,
    stock_maximo INTEGER NOT NULL DEFAULT 100,
    precio REAL NOT NULL DEFAULT 0.0
);

-- ============ MOVIMIENTOS ============
CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id),
    tipo TEXT NOT NULL,
    cantidad INTEGER NOT NULL,
    fecha TEXT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    nota TEXT
);

-- ============ REFRESH TOKENS ============
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT UNIQUE NOT NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    creado_en TEXT,
    expira_en TEXT NOT NULL,
    revocado INTEGER NOT NULL DEFAULT 0,
    dispositivo TEXT,
    ip TEXT,
    usado INTEGER NOT NULL DEFAULT 0,
    usado_en TEXT
);

-- ============ LOG AUDITORÍA ============
CREATE TABLE IF NOT EXISTS log_auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
    usuario_username TEXT,
    accion TEXT NOT NULL,
    severidad TEXT NOT NULL DEFAULT 'info',
    entidad_tipo TEXT,
    entidad_id INTEGER,
    entidad_nombre TEXT,
    descripcion TEXT,
    datos_antes TEXT,
    datos_despues TEXT,
    cambios TEXT,
    ip_address TEXT,
    user_agent TEXT,
    dispositivo_fingerprint TEXT,
    timestamp TEXT,
    exito INTEGER NOT NULL DEFAULT 1,
    error_mensaje TEXT
);

-- ============ CLIENTES ============
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_identificacion TEXT NOT NULL DEFAULT '13',
    numero_identificacion TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    razon_social TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    responsable_iva INTEGER NOT NULL DEFAULT 0,
    regimen TEXT NOT NULL DEFAULT 'No responsable de IVA',
    creado_en TEXT
);

-- ============ CONFIGURACIÓN EMPRESA ============
CREATE TABLE IF NOT EXISTS configuracion_empresa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nit TEXT NOT NULL,
    nombre_empresa TEXT NOT NULL,
    razon_social TEXT NOT NULL,
    direccion TEXT NOT NULL,
    telefono TEXT NOT NULL,
    email TEXT NOT NULL,
    software_id TEXT NOT NULL,
    pin TEXT NOT NULL,
    prefijo_factura TEXT NOT NULL DEFAULT 'SET',
    numero_desde INTEGER NOT NULL DEFAULT 1,
    numero_hasta INTEGER NOT NULL DEFAULT 1000000,
    numero_actual INTEGER NOT NULL DEFAULT 1,
    certificado_path TEXT,
    certificado_password TEXT,
    numero_resolucion TEXT,
    fecha_resolucion TEXT,
    fecha_vencimiento_resolucion TEXT
);

-- ============ FACTURAS ============
CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prefijo TEXT NOT NULL,
    numero INTEGER NOT NULL,
    numero_completo TEXT UNIQUE NOT NULL,
    tipo_documento TEXT NOT NULL DEFAULT '01',
    fecha_emision TEXT,
    fecha_vencimiento TEXT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    subtotal REAL NOT NULL DEFAULT 0.0,
    descuento REAL NOT NULL DEFAULT 0.0,
    base_gravable REAL NOT NULL DEFAULT 0.0,
    iva REAL NOT NULL DEFAULT 0.0,
    total REAL NOT NULL DEFAULT 0.0,
    iva_porcentaje REAL NOT NULL DEFAULT 19.0,
    cufe TEXT,
    qr_code TEXT,
    estado_dian TEXT NOT NULL DEFAULT 'PENDIENTE',
    xml_firmado TEXT,
    fecha_envio_dian TEXT,
    track_id TEXT
);

-- ============ FACTURA ITEMS ============
CREATE TABLE IF NOT EXISTS factura_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER NOT NULL REFERENCES facturas(id),
    producto_id INTEGER NOT NULL REFERENCES productos(id),
    cantidad INTEGER NOT NULL,
    descripcion TEXT NOT NULL,
    precio_unitario REAL NOT NULL,
    descuento REAL NOT NULL DEFAULT 0.0,
    subtotal REAL NOT NULL,
    iva REAL NOT NULL,
    total REAL NOT NULL
);
"#;

// ============================================================
// CONEXIÓN
// ============================================================

/// Crea la conexión a una base de datos en `path`, aplicando el esquema.
pub fn abrir_conexion(path: &Path) -> Result<Connection, DbError> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

/// Abre la conexión en el directorio de datos de la app (persistente de usuario).
pub fn abrir_conexion_app(app_handle: &tauri::AppHandle, nombre_db: &str) -> Result<Connection, DbError> {
    let dir = directorio_datos(app_handle)?;
    let path = dir.join(nombre_db);
    abrir_conexion(&path)
}

/// Determina el directorio persistente de datos de la app.
///
/// Windows:  %LOCALAPPDATA%/com.icontab.app  (usable con Tauri app_data_dir)
/// Linux:    ~/.local/share/com.icontab.app
///
/// Se usa `app_data_dir()` de Tauri que ya resuelve la plataforma correctamente.
pub fn directorio_datos(app_handle: &tauri::AppHandle) -> Result<PathBuf, DbError> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| DbError::Ruta(e.to_string()))
}

/// Obtiene la ruta completa del archivo de base de datos.
#[allow(dead_code)]
pub fn ruta_db(app_handle: &tauri::AppHandle) -> Result<PathBuf, DbError> {
    Ok(directorio_datos(app_handle)?.join("facticontab.db"))
}

// ============================================================
// HELPERS GENÉRICOS
// ============================================================

/// Inserta un usuario devolviendo el último id insertado.
pub fn insertar_usuario(
    conn: &Connection,
    username: &str,
    email: &str,
    nombre: &str,
    password_hash: &str,
    salt: &str,
    rol: &str,
) -> Result<i64, DbError> {
    conn.execute(
        "INSERT INTO usuarios
            (username, email, nombre, password_hash, salt, rol, activo, bloqueado,
             intentos_fallidos, cambio_password_obligatorio, ultimo_cambio_password, creado_en)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 0, 0, ?7, ?7, ?7)",
        params![username, email, nombre, password_hash, salt, rol, ahora_iso8601()],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Inserta la configuración de empresa devolviendo el último id insertado.
pub fn insertar_config_empresa(
    conn: &Connection,
    nit: &str,
    nombre_empresa: &str,
    razon_social: &str,
    direccion: &str,
    telefono: &str,
    email: &str,
    software_id: &str,
    pin: &str,
    prefijo_factura: &str,
    numero_desde: i64,
    numero_hasta: i64,
    numero_resolucion: &str,
    fecha_resolucion: &str,
    fecha_vencimiento_resolucion: &str,
) -> Result<i64, DbError> {
    conn.execute(
        "INSERT INTO configuracion_empresa
            (nit, nombre_empresa, razon_social, direccion, telefono, email,
             software_id, pin, prefijo_factura, numero_desde, numero_hasta,
             numero_actual, numero_resolucion, fecha_resolucion, fecha_vencimiento_resolucion)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?10,?12,?13,?14)",
        params![
            nit, nombre_empresa, razon_social, direccion, telefono, email,
            software_id, pin, prefijo_factura, numero_desde, numero_hasta,
            numero_resolucion, fecha_resolucion, fecha_vencimiento_resolucion,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Inserta una categoría devolviendo su id, o el id existente si ya existe por nombre.
pub fn insertar_categoria(
    conn: &Connection,
    nombre: &str,
    descripcion: &str,
) -> Result<i64, DbError> {
    if let Ok(id) = conn.query_row(
        "SELECT id FROM categorias WHERE nombre = ?1",
        params![nombre],
        |r| r.get(0),
    ) {
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO categorias (nombre, descripcion) VALUES (?1, ?2)",
        params![nombre, descripcion],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Inserta un producto por código (ignora si ya existe).
pub fn insertar_producto(
    conn: &Connection,
    codigo: &str,
    nombre: &str,
    categoria_id: i64,
    precio: f64,
    stock_actual: i64,
    stock_minimo: i64,
    stock_maximo: i64,
    descripcion: Option<&str>,
) -> Result<(), DbError> {
    conn.execute(
        "INSERT OR IGNORE INTO productos
            (codigo, nombre, descripcion, categoria_id, stock_actual, stock_minimo, stock_maximo, precio)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            codigo, nombre, descripcion, categoria_id,
            stock_actual, stock_minimo, stock_maximo, precio
        ],
    )?;
    Ok(())
}

/// Timestamp ISO-8601 UTC (tipo texto), equivalente a datetime.utcnow() de Python.
pub fn ahora_iso8601() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Marca de tiempo futura a 90 días (para "cambio de contraseña obligatorio").
pub fn futuro_90_dias_iso8601() -> String {
    (chrono::Utc::now() + chrono::Duration::days(90))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

/// Devuelve el número de usuarios que hay (para detectar si ya hay seed).
pub fn hay_usuarios(conn: &Connection) -> Result<bool, DbError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM usuarios", [], |r| r.get(0))?;
    Ok(count > 0)
}

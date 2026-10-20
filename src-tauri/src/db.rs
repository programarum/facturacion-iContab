// src-tauri/src/db.rs
// Módulo de base de datos: esquema SQLite embebido + conexión persistente + seed inicial.
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
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

-- ============ AJUSTES DE LA APLICACIÓN ==========
CREATE TABLE IF NOT EXISTS ajustes_app (
    clave TEXT PRIMARY KEY,
    valor TEXT NOT NULL
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
    stock_actual REAL NOT NULL DEFAULT 0,
    stock_minimo REAL NOT NULL DEFAULT 5,
    stock_maximo REAL NOT NULL DEFAULT 100,
    precio REAL NOT NULL DEFAULT 0.0,
    costo REAL,
    ubicacion TEXT,
    unidad_medida TEXT NOT NULL DEFAULT 'unidad'
);

-- ============ MOVIMIENTOS ============
CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id),
    tipo TEXT NOT NULL,
    cantidad REAL NOT NULL,
    fecha TEXT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    nota TEXT,
    unidad_medida TEXT NOT NULL DEFAULT 'unidad'
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
    fecha_vencimiento_resolucion TEXT,
    tipo_negocio TEXT NOT NULL DEFAULT 'general',
    aplica_iva INTEGER NOT NULL DEFAULT 0
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
    cantidad REAL NOT NULL,
    descripcion TEXT NOT NULL,
    unidad_medida TEXT NOT NULL DEFAULT 'unidad',
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
    migrar_columnas_productos(&conn)?;
    migrar_columnas_configuracion_empresa(&conn)?;
    migrar_columnas_unidad_medida(&conn)?;
    Ok(conn)
}

/// Añade unidad de medida a registros históricos; SQLite permite valores REAL
/// en columnas INTEGER existentes, por lo que no requiere reconstruir las tablas.
fn migrar_columnas_unidad_medida(conn: &Connection) -> Result<(), rusqlite::Error> {
    for (tabla, columna) in [
        ("productos", "unidad_medida"),
        ("movimientos", "unidad_medida"),
        ("factura_items", "unidad_medida"),
    ] {
        let mut stmt = conn.prepare(&format!("PRAGMA table_info({tabla})"))?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let columnas: HashSet<String> = rows.collect::<Result<_, _>>()?;
        drop(stmt);

        if !columnas.contains(columna) {
            conn.execute(
                &format!(
                    "ALTER TABLE {tabla} ADD COLUMN {columna} TEXT NOT NULL DEFAULT 'unidad'"
                ),
                [],
            )?;
        }
    }
    Ok(())
}

/// Agrega campos de perfil de negocio a bases de datos existentes.
fn migrar_columnas_configuracion_empresa(conn: &Connection) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare("PRAGMA table_info(configuracion_empresa)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let columnas: HashSet<String> = rows.collect::<Result<_, _>>()?;
    drop(stmt);

    if !columnas.contains("tipo_negocio") {
        conn.execute(
            "ALTER TABLE configuracion_empresa ADD COLUMN tipo_negocio TEXT NOT NULL DEFAULT 'general'",
            [],
        )?;
    }
    if !columnas.contains("aplica_iva") {
        conn.execute(
            "ALTER TABLE configuracion_empresa ADD COLUMN aplica_iva INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    Ok(())
}

/// Agrega campos introducidos en versiones nuevas sin afectar datos existentes.
fn migrar_columnas_productos(conn: &Connection) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare("PRAGMA table_info(productos)")?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
    let columnas: HashSet<String> = rows.collect::<Result<_, _>>()?;
    drop(stmt);

    if !columnas.contains("costo") {
        conn.execute("ALTER TABLE productos ADD COLUMN costo REAL", [])?;
    }
    if !columnas.contains("ubicacion") {
        conn.execute("ALTER TABLE productos ADD COLUMN ubicacion TEXT", [])?;
    }
    Ok(())
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

/// Inserta un producto del seed inicial con su unidad de medida, costo y
/// ubicación. Devuelve el id generado e ignora el código si ya existe.
pub fn insertar_producto(
    conn: &Connection,
    codigo: &str,
    nombre: &str,
    categoria_id: i64,
    precio: f64,
    costo: Option<f64>,
    stock_actual: f64,
    stock_minimo: f64,
    stock_maximo: f64,
    unidad_medida: &str,
    ubicacion: Option<&str>,
) -> Result<i64, DbError> {
    conn.execute(
        "INSERT OR IGNORE INTO productos
            (codigo, nombre, descripcion, categoria_id, precio, costo,
             stock_actual, stock_minimo, stock_maximo, ubicacion, unidad_medida)
         VALUES (?1,?2,NULL,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            codigo, nombre, categoria_id, precio, costo,
            stock_actual, stock_minimo, stock_maximo, ubicacion, unidad_medida
        ],
    )?;
    Ok(conn.last_insert_rowid())
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

#[cfg(test)]
mod tests {
    use super::{
        migrar_columnas_configuracion_empresa, migrar_columnas_productos,
        migrar_columnas_unidad_medida,
    };
    use rusqlite::Connection;

    #[test]
    fn migracion_producto_agrega_campos_sin_perder_datos_y_es_repetible() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE productos (id INTEGER PRIMARY KEY, codigo TEXT, precio REAL);
             INSERT INTO productos (codigo, precio) VALUES ('P-001', 1250.0);",
        )
        .unwrap();

        migrar_columnas_productos(&conn).unwrap();
        migrar_columnas_productos(&conn).unwrap();

        let producto: (String, f64, Option<f64>, Option<String>) = conn
            .query_row(
                "SELECT codigo, precio, costo, ubicacion FROM productos WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(producto, ("P-001".to_string(), 1250.0, None, None));
    }

    #[test]
    fn migracion_perfil_negocio_conserva_configuracion_existente_y_es_repetible() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE configuracion_empresa (
                id INTEGER PRIMARY KEY,
                nit TEXT NOT NULL,
                nombre_empresa TEXT NOT NULL
             );
             INSERT INTO configuracion_empresa (nit, nombre_empresa)
             VALUES ('900123456-7', 'Mi negocio');",
        )
        .unwrap();

        migrar_columnas_configuracion_empresa(&conn).unwrap();
        migrar_columnas_configuracion_empresa(&conn).unwrap();

        let config: (String, String, String, i64) = conn
            .query_row(
                "SELECT nit, nombre_empresa, tipo_negocio, aplica_iva FROM configuracion_empresa WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(
            config,
            (
                "900123456-7".to_string(),
                "Mi negocio".to_string(),
                "general".to_string(),
                0
            )
        );
    }

    #[test]
    fn migracion_unidades_conserva_registros_y_admite_stock_decimal_en_bases_existentes() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE productos (id INTEGER PRIMARY KEY, stock_actual INTEGER NOT NULL);
             CREATE TABLE movimientos (id INTEGER PRIMARY KEY, cantidad INTEGER NOT NULL);
             CREATE TABLE factura_items (id INTEGER PRIMARY KEY, cantidad INTEGER NOT NULL);
             INSERT INTO productos (stock_actual) VALUES (2);
             INSERT INTO movimientos (cantidad) VALUES (1);
             INSERT INTO factura_items (cantidad) VALUES (1);",
        )
        .unwrap();
        migrar_columnas_unidad_medida(&conn).unwrap();
        migrar_columnas_unidad_medida(&conn).unwrap();
        conn.execute("UPDATE movimientos SET cantidad = 0.25 WHERE id = 1", [])
            .unwrap();
        conn.execute("UPDATE factura_items SET cantidad = 0.75 WHERE id = 1", [])
            .unwrap();
        conn.execute(
            "UPDATE productos SET stock_actual = ?1 WHERE id = 1",
            [1.75_f64],
        )
        .unwrap();

        let (stock, unidad): (f64, String) = conn
            .query_row(
                "SELECT stock_actual, unidad_medida FROM productos WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!((stock - 1.75).abs() < 0.000001);
        assert_eq!(unidad, "unidad");
        let (cantidad_movimiento, unidad_movimiento): (f64, String) = conn
            .query_row(
                "SELECT cantidad, unidad_medida FROM movimientos WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        let (cantidad_factura, unidad_factura): (f64, String) = conn
            .query_row(
                "SELECT cantidad, unidad_medida FROM factura_items WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert!((cantidad_movimiento - 0.25).abs() < 0.000001);
        assert!((cantidad_factura - 0.75).abs() < 0.000001);
        assert_eq!(unidad_movimiento, "unidad");
        assert_eq!(unidad_factura, "unidad");
    }
}

/// Devuelve el número de usuarios que hay (para detectar si ya hay seed).
pub fn hay_usuarios(conn: &Connection) -> Result<bool, DbError> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM usuarios", [], |r| r.get(0))?;
    Ok(count > 0)
}

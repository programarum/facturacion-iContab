// src-tauri/src/commands/usuarios.rs
// Comandos de administración de usuarios (porta routers/usuarios.py).
use crate::state::AppState;
use crate::security;
use crate::db::{self, ahora_iso8601, insertar_usuario};
use tauri::State;
use rusqlite::{params, OptionalExtension};
use serde::{Serialize, Deserialize};

#[derive(Serialize)]
pub struct UsuarioResponse {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub nombre: String,
    pub rol: String,
    pub activo: bool,
    pub bloqueado: bool,
    pub ultimo_acceso: Option<String>,
    pub creado_en: String,
}

#[derive(Deserialize)]
pub struct UsuarioCreate {
    pub username: String,
    pub email: String,
    pub password: String,
    pub nombre: String,
    pub rol: Option<String>,
}

#[derive(Deserialize)]
pub struct UsuarioUpdate {
    pub nombre: Option<String>,
    pub email: Option<String>,
    pub rol: Option<String>,
    pub activo: Option<bool>,
    pub bloqueado: Option<bool>,
}

fn leer_usuario(conn: &rusqlite::Connection, id: i64) -> Option<UsuarioResponse> {
    conn.query_row(
        "SELECT id, username, email, nombre, rol, activo, bloqueado, ultimo_acceso, creado_en
         FROM usuarios WHERE id = ?1",
        params![id],
        |r| {
            Ok(UsuarioResponse {
                id: r.get(0)?,
                username: r.get(1)?,
                email: r.get(2)?,
                nombre: r.get(3)?,
                rol: r.get(4)?,
                activo: r.get(5)?,
                bloqueado: r.get(6)?,
                ultimo_acceso: r.get(7)?,
                creado_en: r.get(8)?,
            })
        },
    )
    .ok()
}

#[tauri::command]
pub fn listar_usuarios(state: State<AppState>) -> Result<Vec<UsuarioResponse>, String> {
    let sesion = state.requerir_sesion()?;
    if sesion.rol != "admin" {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(
            "SELECT id, username, email, nombre, rol, activo, bloqueado, ultimo_acceso, creado_en
             FROM usuarios ORDER BY username",
        )
        .map_err(|e| format!("Error preparando query: {}", e))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(UsuarioResponse {
                id: r.get(0)?,
                username: r.get(1)?,
                email: r.get(2)?,
                nombre: r.get(3)?,
                rol: r.get(4)?,
                activo: r.get(5)?,
                bloqueado: r.get(6)?,
                ultimo_acceso: r.get(7)?,
                creado_en: r.get(8)?,
            })
        })
        .map_err(|e| format!("Error ejecutando query: {}", e))?;

    let mut resultado = Vec::new();
    for r in rows {
        resultado.push(r.map_err(|e| e.to_string())?);
    }
    Ok(resultado)
}

#[tauri::command]
pub fn crear_usuario(state: State<AppState>, req: UsuarioCreate) -> Result<UsuarioResponse, String> {
    let sesion = state.requerir_sesion()?;
    if sesion.rol != "admin" {
        return Err("No autorizado".to_string());
    }

    let (hash, salt) = security::hash_password(&req.password)?;
    let rol = req.rol.unwrap_or_else(|| "usuario".to_string()).to_lowercase();

    let db = state.db.lock().unwrap();

    // Duplicados
    let dup_username: Option<i64> = db
        .query_row(
            "SELECT id FROM usuarios WHERE LOWER(username) = LOWER(?1)",
            params![req.username],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Error consultando usuario: {}", e))?;
    if dup_username.is_some() {
        return Err(format!("El usuario '{}' ya existe", req.username));
    }
    let dup_email: Option<i64> = db
        .query_row(
            "SELECT id FROM usuarios WHERE LOWER(email) = LOWER(?1)",
            params![req.email],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Error consultando usuario: {}", e))?;
    if dup_email.is_some() {
        return Err(format!("El email '{}' ya está registrado", req.email));
    }

    let id = insertar_usuario(&db, &req.username, &req.email, &req.nombre, &hash, &salt, &rol)
        .map_err(|e| e.to_string())?;

    leer_usuario(&db, id).ok_or("Error leyendo usuario creado".to_string())
}

#[tauri::command]
pub fn actualizar_usuario(state: State<AppState>, id: i64, req: UsuarioUpdate) -> Result<UsuarioResponse, String> {
    let sesion = state.requerir_sesion()?;
    if sesion.rol != "admin" {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();
    let existe: Option<i64> = db
        .query_row("SELECT id FROM usuarios WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(|e| format!("Error consultando usuario: {}", e))?;
    if existe.is_none() {
        return Err("Usuario no encontrado".to_string());
    }

    let mut set_parts: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(v) = &req.nombre {
        set_parts.push("nombre = ?".to_string());
        vals.push(Box::new(v.clone()));
    }
    if let Some(v) = &req.email {
        set_parts.push("email = ?".to_string());
        vals.push(Box::new(v.clone()));
    }
    if let Some(v) = &req.rol {
        set_parts.push("rol = ?".to_string());
        vals.push(Box::new(v.clone()));
    }
    if let Some(v) = req.activo {
        set_parts.push("activo = ?".to_string());
        vals.push(Box::new(v));
    }
    if let Some(v) = req.bloqueado {
        set_parts.push("bloqueado = ?".to_string());
        vals.push(Box::new(v));
    }

    if !set_parts.is_empty() {
        let sql = format!("UPDATE usuarios SET {} WHERE id = ?", set_parts.join(", "));
        let mut stmt = db
            .prepare(&sql)
            .map_err(|e| format!("Error preparando update: {}", e))?;
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vals;
        params.push(Box::new(id));
        let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        stmt.execute(&refs[..])
            .map_err(|e| format!("Error actualizando usuario: {}", e))?;
    }

    leer_usuario(&db, id).ok_or("Error leyendo usuario actualizado".to_string())
}

#[derive(Deserialize)]
pub struct CambiarPasswordReq {
    pub usuario_id: i64,
    pub nueva_password: String,
}

#[tauri::command]
pub fn cambiar_password(state: State<AppState>, req: CambiarPasswordReq) -> Result<(), String> {
    let sesion = state.requerir_sesion()?;
    if sesion.rol != "admin" {
        return Err("No autorizado".to_string());
    }

    let (hash, salt) = security::hash_password(&req.nueva_password)?;
    let ahora = ahora_iso8601();
    let futuro = db::futuro_90_dias_iso8601();

    let db = state.db.lock().unwrap();
    let affected = db
        .execute(
            "UPDATE usuarios SET password_hash = ?1, salt = ?2,
                    ultimo_cambio_password = ?3, cambio_password_obligatorio = ?4
             WHERE id = ?5",
            params![hash, salt, ahora, futuro, req.usuario_id],
        )
        .map_err(|e| format!("Error cambiando contraseña: {}", e))?;
    if affected == 0 {
        return Err("Usuario no encontrado".to_string());
    }
    Ok(())
}

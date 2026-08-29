// src-tauri/src/commands/auth.rs
// Comandos de autenticación (porta routers/auth.py).
use crate::state::AppState;
use crate::security;
use crate::db::{ahora_iso8601};
use tauri::State;
use rusqlite::{params, OptionalExtension};
use serde::{Serialize, Deserialize};
use chrono::{Utc, NaiveDateTime};

// ============================================================
// TIPOS
// ============================================================

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub user: MeData,
}

#[derive(Serialize, Clone)]
pub struct MeData {
    pub id: i64,
    pub username: String,
    pub email: String,
    pub rol: String,
    pub cambio_password_obligatorio: bool,
}

// ============================================================
// LOGIN
// ============================================================

#[tauri::command]
pub fn login(state: State<AppState>, req: LoginRequest) -> Result<LoginResponse, String> {
    let key = format!("local:{}", req.username.to_lowercase());

    // Rate limiting
    if !state.rate_limiter.check(&key) {
        return Err("Cuenta bloqueada temporalmente. Intente más tarde.".to_string());
    }

    // Buscar usuario (case-insensitive)
    let db = state.db.lock().unwrap();
    let usuario = db
        .query_row(
            "SELECT id, username, email, password_hash, rol, activo, bloqueado,
                    cambio_password_obligatorio, ultimo_cambio_password, salt
             FROM usuarios WHERE LOWER(username) = LOWER(?1)",
            params![req.username],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, bool>(5)?,
                    row.get::<_, bool>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, String>(9)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Error consultando usuario: {}", e))?;

    let mut password_valida = false;
    if let Some((_id, _u, _e, hash, _rol, activo, bloqueado, _co, _uc, _salt)) = &usuario {
        if *activo && !*bloqueado {
            password_valida = security::verify_password(&req.password, hash);
        }
    }

    if !password_valida {
        state.rate_limiter.register_attempt(&key, false);
        return Err("Credenciales inválidas".to_string());
    }

    let usuario = usuario.ok_or("Credenciales inválidas")?;
    let (id, username, email, _hash, rol, _activo, _bloqueado, cambio_password_obligatorio, ultimo_cambio_password, _salt) = usuario;

    // Detección de cambio de password obligatorio: si la fecha límite guardada
    // (cambio_password_obligatorio) ya pasó, o si pasaron >90 días desde el último cambio.
    let mut cambio_obligatorio = false;
    if let Some(fecha_limite) = &cambio_password_obligatorio {
        if let Ok(fecha) = NaiveDateTime::parse_from_str(fecha_limite, "%Y-%m-%dT%H:%M:%SZ") {
            if Utc::now().naive_utc() > fecha {
                cambio_obligatorio = true;
            }
        }
    }
    if let Some(fecha_str) = &ultimo_cambio_password {
        if let Ok(fecha) = NaiveDateTime::parse_from_str(fecha_str, "%Y-%m-%dT%H:%M:%SZ") {
            if (Utc::now().naive_utc() - fecha).num_days() > 90 {
                cambio_obligatorio = true;
            }
        }
    }

    // Generar tokens
    let access_token = security::crear_access_token(id, &username, &rol)?;
    let (refresh_token, refresh_hash) = security::crear_refresh_token()?;

    // Guardar refresh token en DB
    let expira = (Utc::now() + chrono::Duration::days(security::REFRESH_TOKEN_EXPIRE_DAYS_PUB))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    db.execute(
        "INSERT INTO refresh_tokens (token_hash, usuario_id, creado_en, expira_en, revocado, usado)
         VALUES (?1, ?2, ?3, ?4, 0, 0)",
        params![refresh_hash, id, ahora_iso8601(), expira],
    )
    .map_err(|e| format!("Error guardando refresh token: {}", e))?;

    // Actualizar último acceso y limpiar intentos
    db.execute(
        "UPDATE usuarios SET ultimo_acceso = ?1, intentos_fallidos = 0 WHERE id = ?2",
        params![ahora_iso8601(), id],
    )
    .map_err(|e| format!("Error actualizando acceso: {}", e))?;

    state.rate_limiter.register_attempt(&key, true);

    // Guardar sesión en estado (el frontend no lleva JWT por llamada)
    *state.sesion.lock().unwrap() = Some(crate::state::Sesion {
        usuario_id: id,
        username: username.clone(),
        rol: rol.clone(),
    });

    Ok(LoginResponse {
        access_token,
        refresh_token,
        token_type: "bearer".to_string(),
        expires_in: security::ACCESS_TOKEN_EXPIRE_MIN_PUB * 60,
        user: MeData {
            id,
            username,
            email,
            rol,
            cambio_password_obligatorio: cambio_obligatorio,
        },
    })
}

// ============================================================
// ME (usuario actual)
// ============================================================

#[tauri::command]
pub fn me(state: State<AppState>) -> Result<MeData, String> {
    let sesion = state.requerir_sesion()?;

    let db = state.db.lock().unwrap();
    let row = db
        .query_row(
            "SELECT id, username, email, rol, cambio_password_obligatorio
             FROM usuarios WHERE id = ?1",
            params![sesion.usuario_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Error consultando usuario: {}", e))?
        .ok_or("Usuario no válido")?;

    let (id, username, email, rol, cambio_password_obligatorio) = row;

    // La columna guarda la fecha límite (TEXT); es obligatorio si ya pasó.
    let mut cambio_obligatorio = false;
    if let Some(fecha_limite) = &cambio_password_obligatorio {
        if let Ok(fecha) = NaiveDateTime::parse_from_str(fecha_limite, "%Y-%m-%dT%H:%M:%SZ") {
            if Utc::now().naive_utc() > fecha {
                cambio_obligatorio = true;
            }
        }
    }

    Ok(MeData {
        id,
        username,
        email,
        rol,
        cambio_password_obligatorio: cambio_obligatorio,
    })
}

// ============================================================
// LOGOUT
// ============================================================

#[tauri::command]
pub fn logout(state: State<AppState>, refresh_token: Option<String>) -> Result<(), String> {
    if let Some(token) = refresh_token {
        let token_hash = security::hash_sha256(&token);
        let db = state.db.lock().unwrap();
        db.execute(
            "UPDATE refresh_tokens SET revocado = 1 WHERE token_hash = ?1",
            params![token_hash],
        )
        .map_err(|e| format!("Error revocando token: {}", e))?;
    }
    // Limpiar la sesión
    *state.sesion.lock().unwrap() = None;
    Ok(())
}

// ============================================================
// REFRESH (rotación de refresh tokens)
// ============================================================

#[derive(Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[tauri::command]
pub fn refresh(state: State<AppState>, req: RefreshRequest) -> Result<LoginResponse, String> {
    let token_hash = security::hash_sha256(&req.refresh_token);

    let db = state.db.lock().unwrap();
    let db_token = db
        .query_row(
            "SELECT id, usuario_id, usado, expira_en FROM refresh_tokens
             WHERE token_hash = ?1 AND revocado = 0",
            params![token_hash],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, bool>(2)?,
                    r.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Error consultando token: {}", e))?
        .ok_or("Token inválido")?;

    let (token_id, usuario_id, usado, expira_en) = db_token;

    // Verificar expiración
    if let Ok(exp) = NaiveDateTime::parse_from_str(&expira_en, "%Y-%m-%dT%H:%M:%SZ") {
        if Utc::now().naive_utc() > exp {
            return Err("Token expirado".to_string());
        }
    }

    // Detectar reuse (robo de token)
    if usado {
        db.execute(
            "UPDATE refresh_tokens SET revocado = 1 WHERE usuario_id = ?1",
            params![usuario_id],
        )
        .map_err(|e| format!("Error revocando tokens: {}", e))?;
        return Err("Sesión comprometida. Contacte al administrador.".to_string());
    }

    // Marcar como usado
    db.execute(
        "UPDATE refresh_tokens SET usado = 1, usado_en = ?1 WHERE id = ?2",
        params![ahora_iso8601(), token_id],
    )
    .map_err(|e| format!("Error marcando token: {}", e))?;

    // Obtener usuario
    let (username, rol) = db
        .query_row(
            "SELECT username, rol FROM usuarios WHERE id = ?1",
            params![usuario_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        )
        .map_err(|e| format!("Error consultando usuario: {}", e))?;

    // Generar NUEVO par (rotación)
    let access_token = security::crear_access_token(usuario_id, &username, &rol)?;
    let (new_refresh, new_refresh_hash) = security::crear_refresh_token()?;
    let expira_nuevo = (Utc::now() + chrono::Duration::days(security::REFRESH_TOKEN_EXPIRE_DAYS_PUB))
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    db.execute(
        "INSERT INTO refresh_tokens (token_hash, usuario_id, creado_en, expira_en, revocado, usado)
         VALUES (?1, ?2, ?3, ?4, 0, 0)",
        params![new_refresh_hash, usuario_id, ahora_iso8601(), expira_nuevo],
    )
    .map_err(|e| format!("Error guardando nuevo refresh: {}", e))?;

    // Actualizar sesión en estado
    *state.sesion.lock().unwrap() = Some(crate::state::Sesion {
        usuario_id,
        username: username.clone(),
        rol: rol.clone(),
    });

    Ok(LoginResponse {
        access_token,
        refresh_token: new_refresh,
        token_type: "bearer".to_string(),
        expires_in: security::ACCESS_TOKEN_EXPIRE_MIN_PUB * 60,
        user: MeData {
            id: usuario_id,
            username,
            email: String::new(),
            rol,
            cambio_password_obligatorio: false,
        },
    })
}

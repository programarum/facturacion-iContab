// src-tauri/src/state.rs
// Estado compartido de la app: sesión activa + acceso a la base de datos.
use rusqlite::Connection;
use std::sync::Mutex;

// ============================================================
// SESIÓN
// ============================================================

#[derive(Debug, Clone)]
pub struct Sesion {
    pub usuario_id: i64,
    pub username: String,
    pub rol: String,
}

/// Estado gestionado por Tauri. La DB se comparte con un Mutex (SQLite no es Send
/// por defecto, pero con `Connection` detrás de Mutex sí es legal).
pub struct AppState {
    pub db: Mutex<Connection>,
    pub sesion: Mutex<Option<Sesion>>,
    // Rate limiter global (por ip:username key)
    pub rate_limiter: crate::security::RateLimiter,
}

impl AppState {
    pub fn new(db: Connection) -> Self {
        Self {
            db: Mutex::new(db),
            sesion: Mutex::new(None),
            rate_limiter: crate::security::RateLimiter::new(),
        }
    }

    /// Obtiene la sesión activa (si hay).
    pub fn obtener_sesion(&self) -> Option<Sesion> {
        self.sesion.lock().unwrap().clone()
    }

    /// Requiere sesión activa; si no la hay devuelve un error controlado.
    pub fn requerir_sesion(&self) -> Result<Sesion, String> {
        self.obtener_sesion().ok_or_else(|| "No autenticado".to_string())
    }
}

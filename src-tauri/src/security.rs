// src-tauri/src/security.rs
// Seguridad: hash de contraseñas (argon2), JWT, refresh tokens rotativos y rate limiting.
use argon2::{Argon2, PasswordHasher, PasswordVerifier, password_hash::{SaltString, rand_core::OsRng, Error as ArgonError, PasswordHash}};
use jsonwebtoken::{encode, decode, Header, EncodingKey, DecodingKey, Validation, Algorithm};
use rand::RngCore;
use rand::rngs::OsRng as RandOsRng;
use sha2::{Sha256, Digest};
use base64::Engine;
use chrono::{Utc, Duration};
use serde::{Serialize, Deserialize};

// ============================================================
// CONSTANTES DE SEGURIDAD (replican config.py)
// ============================================================

const JWT_SECRET: &str = "icontab-secret-local-32bytes-minimo!!";
const JWT_ALGORITHM: Algorithm = Algorithm::HS256;
const ACCESS_TOKEN_EXPIRE_MIN: i64 = 15;      // 15 minutos
const REFRESH_TOKEN_EXPIRE_DAYS: i64 = 7;     // 7 días
pub(crate) const ACCESS_TOKEN_EXPIRE_MIN_PUB: i64 = ACCESS_TOKEN_EXPIRE_MIN;
pub(crate) const REFRESH_TOKEN_EXPIRE_DAYS_PUB: i64 = REFRESH_TOKEN_EXPIRE_DAYS;
const MAX_LOGIN_ATTEMPTS: u32 = 5;
const LOCKOUT_DURATION_MIN: i64 = 30;

// ============================================================
// HASH DE CONTRASEÑAS (sustituye bcrypt por argon2)
// ============================================================

/// Genera un hash argon2id y su salt. Devuelve (hash, salt).
pub fn hash_password(password: &str) -> Result<(String, String), String> {
    let salt = SaltString::generate(&mut OsRng);
    // Guardamos el salt (string codificado) por separado, equivalente a la columna salt.
    let salt_str = salt.as_str().to_string();

    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e: ArgonError| format!("Error hasheando: {}", e))?
        .to_string();

    Ok((hash, salt_str))
}

/// Verifica una contraseña contra un hash argon2.
pub fn verify_password(password: &str, hash: &str) -> bool {
    let parsed = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

// ============================================================
// JWT (access token)
// ============================================================

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub username: String,
    pub rol: String,
    #[serde(rename = "type")]
    pub tipo: String,
    pub iat: i64,
    pub exp: i64,
    pub jti: String,
}

/// Crea un JWT de acceso (payload equivalente al de security.py).
pub fn crear_access_token(usuario_id: i64, username: &str, rol: &str) -> Result<String, String> {
    let now = Utc::now().timestamp();
    let exp = (Utc::now() + Duration::minutes(ACCESS_TOKEN_EXPIRE_MIN)).timestamp();
    let jti = uuid::Uuid::new_v4().to_string();

    let claims = Claims {
        sub: usuario_id.to_string(),
        username: username.to_string(),
        rol: rol.to_string(),
        tipo: "access".to_string(),
        iat: now,
        exp,
        jti,
    };

    encode(
        &Header::new(JWT_ALGORITHM),
        &claims,
        &EncodingKey::from_secret(JWT_SECRET.as_bytes()),
    )
    .map_err(|e| format!("Error generando access token: {}", e))
}

/// Decodifica y valida un access token. Devuelve None si expiró o es inválido.
#[allow(dead_code)]
pub fn decodificar_access_token(token: &str) -> Option<Claims> {
    let mut validation = Validation::new(JWT_ALGORITHM);
    validation.validate_exp = true;

    match decode::<Claims>(
        token,
        &DecodingKey::from_secret(JWT_SECRET.as_bytes()),
        &validation,
    ) {
        Ok(data) => {
            let c = data.claims;
            if c.tipo != "access" {
                return None;
            }
            Some(c)
        }
        Err(_) => None,
    }
}

// ============================================================
// REFRESH TOKENS (opacos, con hash SHA-256)
// ============================================================

/// Genera un refresh token opaco (url-safe de 64 bytes) y su hash SHA-256.
pub fn crear_refresh_token() -> Result<(String, String), String> {
    let mut bytes = [0u8; 64];
    RandOsRng.fill_bytes(&mut bytes);
    let token = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);

    let hash = hash_sha256(&token);
    Ok((token, hash))
}

/// Hash SHA-256 en hex (para guardar el refresh token en DB).
pub fn hash_sha256(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    let result = hasher.finalize();
    result.iter().map(|b| format!("{:02x}", b)).collect()
}

// ============================================================
// RATE LIMITER (en memoria, replica RateLimiter de Python)
// ============================================================

use std::collections::HashMap;
use std::sync::Mutex;

struct Entry {
    intentos: u32,
    bloqueado_hasta: Option<i64>, // timestamp unix
}

pub struct RateLimiter {
    intentos: Mutex<HashMap<String, Entry>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            intentos: Mutex::new(HashMap::new()),
        }
    }

    /// ¿Permite el intento para (ip, username)?
    pub fn check(&self, key: &str) -> bool {
        let guard = self.intentos.lock().unwrap();
        if let Some(e) = guard.get(key) {
            if let Some(hasta) = e.bloqueado_hasta {
                let ahora = Utc::now().timestamp();
                if ahora < hasta {
                    return false; // bloqueado
                }
            }
        }
        true
    }

    /// Registra un intento; si es exitoso limpia; si falla acumula y bloquea.
    pub fn register_attempt(&self, key: &str, exito: bool) {
        let mut guard = self.intentos.lock().unwrap();
        let ahora = Utc::now().timestamp();

        if exito {
            guard.remove(key);
            return;
        }

        let e = guard.entry(key.to_string()).or_insert(Entry {
            intentos: 0,
            bloqueado_hasta: None,
        });
        e.intentos += 1;

        if e.intentos >= MAX_LOGIN_ATTEMPTS {
            e.bloqueado_hasta = Some(ahora + LOCKOUT_DURATION_MIN * 60);
        }
    }
}

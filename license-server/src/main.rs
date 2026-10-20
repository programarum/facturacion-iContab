use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, header::AUTHORIZATION};
use axum::routing::{get, post};
use axum::{Json, Router};
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;
use rand::RngCore;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::env;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const PRODUCT_ID: &str = "icontab-facturacion";

#[derive(Clone)]
struct ServerState {
    db: Arc<Mutex<Connection>>,
    signing_key: Arc<SigningKey>,
    admin_token: Arc<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct LicenseClaims {
    version: u32,
    license_id: String,
    product_id: String,
    device_fingerprint: String,
    issued_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct SignedLicense {
    claims: LicenseClaims,
    signature: String,
}

#[derive(Deserialize)]
struct ActivateRequest {
    license_key: String,
    device_fingerprint: String,
}

#[derive(Deserialize)]
struct ValidateRequest {
    license_id: String,
    device_fingerprint: String,
}

#[derive(Deserialize)]
struct CreateLicenseRequest {
    label: Option<String>,
}

#[derive(Serialize)]
struct CreateLicenseResponse {
    license_id: String,
    license_key: String,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

type ApiResult<T> = Result<Json<T>, (StatusCode, String)>;

fn error(code: StatusCode, message: impl Into<String>) -> (StatusCode, String) {
    (code, message.into())
}

fn sha256_hex(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    format!("{digest:x}")
}

fn now_epoch() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn signed_license_with_key(
    signing_key: &SigningKey,
    license_id: String,
    fingerprint: String,
) -> SignedLicense {
    let claims = LicenseClaims {
        version: 1,
        license_id,
        product_id: PRODUCT_ID.to_string(),
        device_fingerprint: fingerprint,
        issued_at: now_epoch(),
    };
    let payload = serde_json::to_vec(&claims).expect("license claims serialize");
    let signature = signing_key.sign(&payload);
    SignedLicense {
        claims,
        signature: STANDARD.encode(signature.to_bytes()),
    }
}

fn signed_license(state: &ServerState, license_id: String, fingerprint: String) -> SignedLicense {
    signed_license_with_key(&state.signing_key, license_id, fingerprint)
}

fn authorize_admin(headers: &HeaderMap, expected: &str) -> Result<(), (StatusCode, String)> {
    let received = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if received == format!("Bearer {expected}") {
        Ok(())
    } else {
        Err(error(StatusCode::UNAUTHORIZED, "Invalid admin token"))
    }
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

fn bind_license(
    db: &Connection,
    key_hash: &str,
    fingerprint: &str,
) -> Result<String, (StatusCode, String)> {
    let bound = db
        .execute(
            "UPDATE licenses SET device_fingerprint = ?1, last_validated_at = ?2
             WHERE license_key_hash = ?3 AND active = 1
               AND (device_fingerprint IS NULL OR device_fingerprint = ?1)",
            params![fingerprint, now_epoch(), key_hash],
        )
        .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if bound == 0 {
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM licenses WHERE license_key_hash = ?1 AND active = 1)",
                params![key_hash],
                |row| row.get(0),
            )
            .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
        return if exists {
            Err(error(StatusCode::CONFLICT, "License is already bound to another device"))
        } else {
            Err(error(StatusCode::NOT_FOUND, "License key not found or revoked"))
        };
    }
    db.query_row(
        "SELECT id FROM licenses WHERE license_key_hash = ?1 AND active = 1",
        params![key_hash],
        |row| row.get(0),
    )
    .map_err(|e| error(StatusCode::NOT_FOUND, e.to_string()))
}

async fn create_license(
    State(state): State<ServerState>,
    headers: HeaderMap,
    Json(request): Json<CreateLicenseRequest>,
) -> ApiResult<CreateLicenseResponse> {
    authorize_admin(&headers, &state.admin_token)?;

    let mut random_key = [0_u8; 32];
    OsRng.fill_bytes(&mut random_key);
    let license_key = URL_SAFE_NO_PAD.encode(random_key);
    let license_id = Uuid::new_v4().to_string();
    let db = state.db.lock().map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "Database lock failed"))?;
    db.execute(
        "INSERT INTO licenses (id, license_key_hash, label, active, created_at)
         VALUES (?1, ?2, ?3, 1, ?4)",
        params![license_id, sha256_hex(&license_key), request.label, now_epoch()],
    )
    .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(CreateLicenseResponse {
        license_id,
        license_key,
    }))
}

async fn activate(
    State(state): State<ServerState>,
    Json(request): Json<ActivateRequest>,
) -> ApiResult<SignedLicense> {
    if request.device_fingerprint.len() != 64
        || !request.device_fingerprint.chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(error(StatusCode::BAD_REQUEST, "Invalid device fingerprint"));
    }
    let key_hash = sha256_hex(&request.license_key);
    let db = state.db.lock().map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "Database lock failed"))?;
    let license_id = bind_license(&db, &key_hash, &request.device_fingerprint)?;
    Ok(Json(signed_license(
        &state,
        license_id,
        request.device_fingerprint,
    )))
}

async fn validate(
    State(state): State<ServerState>,
    Json(request): Json<ValidateRequest>,
) -> ApiResult<SignedLicense> {
    let db = state.db.lock().map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "Database lock failed"))?;
    let bound_device: Option<String> = db
        .query_row(
            "SELECT device_fingerprint FROM licenses WHERE id = ?1 AND active = 1",
            params![request.license_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map(|value| value.flatten())
        .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if bound_device.as_deref() != Some(request.device_fingerprint.as_str()) {
        return Err(error(StatusCode::FORBIDDEN, "License is inactive or bound to another device"));
    }
    db.execute(
        "UPDATE licenses SET last_validated_at = ?1 WHERE id = ?2",
        params![now_epoch(), request.license_id],
    )
    .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(Json(signed_license(
        &state,
        request.license_id,
        request.device_fingerprint,
    )))
}

async fn reset_device_binding(
    State(state): State<ServerState>,
    Path(license_id): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, String)> {
    authorize_admin(&headers, &state.admin_token)?;
    let db = state.db.lock().map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "Database lock failed"))?;
    let changed = db
        .execute(
            "UPDATE licenses SET device_fingerprint = NULL WHERE id = ?1",
            params![license_id],
        )
        .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if changed == 0 {
        return Err(error(StatusCode::NOT_FOUND, "License not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn revoke_license(
    State(state): State<ServerState>,
    Path(license_id): Path<String>,
    headers: HeaderMap,
) -> Result<StatusCode, (StatusCode, String)> {
    authorize_admin(&headers, &state.admin_token)?;
    let db = state.db.lock().map_err(|_| error(StatusCode::INTERNAL_SERVER_ERROR, "Database lock failed"))?;
    let changed = db
        .execute(
            "UPDATE licenses SET active = 0 WHERE id = ?1",
            params![license_id],
        )
        .map_err(|e| error(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    if changed == 0 {
        return Err(error(StatusCode::NOT_FOUND, "License not found"));
    }
    Ok(StatusCode::NO_CONTENT)
}

fn signing_key_from_env() -> Result<SigningKey, String> {
    let encoded = env::var("ICONTAB_LICENSE_PRIVATE_KEY")
        .map_err(|_| "ICONTAB_LICENSE_PRIVATE_KEY is required".to_string())?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|e| format!("Invalid signing key encoding: {e}"))?;
    let seed: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "Signing key must be exactly 32 bytes".to_string())?;
    Ok(SigningKey::from_bytes(&seed))
}

fn huella_valida(fingerprint: &str) -> bool {
    fingerprint.len() == 64 && fingerprint.chars().all(|character| character.is_ascii_hexdigit())
}

fn emitir_licencia_offline(fingerprint: &str, output_path: &str) -> Result<(), String> {
    if !huella_valida(fingerprint) {
        return Err("The device fingerprint must be 64 hexadecimal characters".to_string());
    }

    let path = std::path::Path::new(output_path);
    if path.exists() {
        return Err(format!("Refusing to overwrite existing file: {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create output directory: {error}"))?;
        }
    }

    let signing_key = signing_key_from_env()?;
    let license = signed_license_with_key(
        &signing_key,
        Uuid::new_v4().to_string(),
        fingerprint.to_string(),
    );
    let contents = serde_json::to_vec_pretty(&license)
        .map_err(|error| format!("Could not serialize signed license: {error}"))?;
    std::fs::write(path, contents)
        .map_err(|error| format!("Could not write signed license file: {error}"))
}

fn generate_keypair() {
    let key = SigningKey::generate(&mut OsRng);
    println!("ICONTAB_LICENSE_PRIVATE_KEY={}", STANDARD.encode(key.to_bytes()));
    print_public_key(&key);
}

fn print_public_key(key: &SigningKey) {
    println!("ICONTAB_LICENSE_PUBLIC_KEY={}", public_key_base64(key));
}

fn public_key_base64(key: &SigningKey) -> String {
    STANDARD.encode(key.verifying_key().to_bytes())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|arg| arg == "--generate-keypair") {
        generate_keypair();
        return Ok(());
    }
    if args.iter().any(|arg| arg == "--print-public-key") {
        let signing_key = signing_key_from_env().map_err(|error| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, error)
        })?;
        print_public_key(&signing_key);
        return Ok(());
    }
    if args.get(1).is_some_and(|arg| arg == "--issue-license") {
        if args.len() != 4 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                "Usage: license-server --issue-license <64-char-device-fingerprint> <output-json>",
            )
            .into());
        }
        emitir_licencia_offline(&args[2], &args[3]).map_err(|error| {
            std::io::Error::new(std::io::ErrorKind::InvalidInput, error)
        })?;
        println!("Signed offline license written to {}", args[3]);
        return Ok(());
    }

    let db_path = env::var("ICONTAB_LICENSE_DB").unwrap_or_else(|_| "licenses.sqlite3".to_string());
    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let db = Connection::open(db_path)?;
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS licenses (
            id TEXT PRIMARY KEY,
            license_key_hash TEXT UNIQUE NOT NULL,
            label TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            device_fingerprint TEXT,
            created_at INTEGER NOT NULL,
            last_validated_at INTEGER
         );",
    )?;

    let signing_key = signing_key_from_env()?;
    let admin_token = env::var("ICONTAB_LICENSE_ADMIN_TOKEN")
        .map_err(|_| "ICONTAB_LICENSE_ADMIN_TOKEN is required".to_string())?;
    if admin_token.len() < 32 {
        return Err("ICONTAB_LICENSE_ADMIN_TOKEN must be at least 32 characters".into());
    }
    let state = ServerState {
        db: Arc::new(Mutex::new(db)),
        signing_key: Arc::new(signing_key.clone()),
        admin_token: Arc::new(admin_token),
    };
    println!("License public key (compile this into the Windows app): {}", STANDARD.encode(signing_key.verifying_key().to_bytes()));

    let app = Router::new()
        .route("/health", get(health))
        .route("/v1/activate", post(activate))
        .route("/v1/validate", post(validate))
        .route("/admin/licenses", post(create_license))
        .route("/admin/licenses/{id}/reset-device", post(reset_device_binding))
        .route("/admin/licenses/{id}/revoke", post(revoke_license))
        .with_state(state);
    let address = env::var("ICONTAB_LICENSE_LISTEN").unwrap_or_else(|_| "127.0.0.1:8787".to_string());
    let listener = tokio::net::TcpListener::bind(&address).await?;
    println!("iContab license service listening on {address}");
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{bind_license, huella_valida, public_key_base64, signed_license_with_key};
    use axum::http::StatusCode;
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use ed25519_dalek::{Signature, SigningKey, Verifier};
    use rusqlite::Connection;

    #[test]
    fn licencia_se_asocia_a_un_solo_equipo_y_permite_revalidar_el_mismo() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE licenses (
                id TEXT PRIMARY KEY,
                license_key_hash TEXT UNIQUE NOT NULL,
                active INTEGER NOT NULL,
                device_fingerprint TEXT,
                last_validated_at INTEGER
            );",
        )
        .unwrap();
        db.execute(
            "INSERT INTO licenses (id, license_key_hash, active) VALUES ('lic-1', 'hash-1', 1)",
            [],
        )
        .unwrap();

        assert_eq!(bind_license(&db, "hash-1", "device-a").unwrap(), "lic-1");
        assert_eq!(bind_license(&db, "hash-1", "device-a").unwrap(), "lic-1");
        let error = bind_license(&db, "hash-1", "device-b").unwrap_err();
        assert_eq!(error.0, StatusCode::CONFLICT);

        let fingerprint: String = db
            .query_row("SELECT device_fingerprint FROM licenses WHERE id = 'lic-1'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(fingerprint, "device-a");
    }

    #[test]
    fn emite_licencia_firmada_para_una_huella_valida() {
        let fingerprint = "a".repeat(64);
        assert!(huella_valida(&fingerprint));
        assert!(!huella_valida("invalid"));

        let signing_key = SigningKey::from_bytes(&[23_u8; 32]);
        let license = signed_license_with_key(
            &signing_key,
            "license-001".to_string(),
            fingerprint.clone(),
        );
        let signature_bytes = STANDARD.decode(&license.signature).unwrap();
        let signature = Signature::from_slice(&signature_bytes).unwrap();
        signing_key
            .verifying_key()
            .verify(&serde_json::to_vec(&license.claims).unwrap(), &signature)
            .unwrap();

        assert_eq!(license.claims.product_id, "icontab-facturacion");
        assert_eq!(license.claims.device_fingerprint, fingerprint);
    }

    #[test]
    fn clave_publica_impresa_corresponde_a_la_clave_privada() {
        let signing_key = SigningKey::from_bytes(&[37_u8; 32]);
        let public_key = STANDARD.encode(signing_key.verifying_key().to_bytes());
        assert_eq!(public_key_base64(&signing_key), public_key);
    }
}

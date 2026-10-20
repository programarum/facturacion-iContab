use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const PRODUCT_ID: &str = "icontab-facturacion";
const LICENSE_FILE: &str = "license.json";
const PUBLIC_KEY_B64: Option<&str> = option_env!("ICONTAB_LICENSE_PUBLIC_KEY");
const LICENSE_SERVER_URL: Option<&str> = option_env!("ICONTAB_LICENSE_SERVER_URL");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseClaims {
    pub version: u32,
    pub license_id: String,
    pub product_id: String,
    pub device_fingerprint: String,
    pub issued_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SignedLicense {
    pub claims: LicenseClaims,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LicenseStatus {
    pub enforced: bool,
    pub licensed: bool,
    pub online_activation_available: bool,
    pub device_fingerprint: String,
    pub message: String,
    pub checked_online: bool,
}

#[derive(Serialize)]
struct ActivationRequest<'a> {
    license_key: &'a str,
    device_fingerprint: &'a str,
}

#[derive(Serialize)]
struct ValidationRequest<'a> {
    license_id: &'a str,
    device_fingerprint: &'a str,
}

fn enforcement_enabled() -> bool {
    // Los builds de demostración (feature `demo`) no piden licencia.
    cfg!(target_os = "windows") && !cfg!(debug_assertions) && !cfg!(feature = "demo")
}

fn license_server_url() -> Option<&'static str> {
    LICENSE_SERVER_URL.filter(|url| !url.trim().is_empty())
}

pub fn huella_equipo() -> Result<String, String> {
    let machine_id = machine_id()?;
    let mut hasher = Sha256::new();
    hasher.update(b"icontab-facturacion/device/v1:");
    hasher.update(machine_id.trim().as_bytes());
    let digest = hasher.finalize();
    Ok(format!("{digest:x}"))
}

#[cfg(target_os = "windows")]
fn machine_id() -> Result<String, String> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\Microsoft\\Cryptography")
        .map_err(|e| format!("No se pudo leer el identificador del equipo: {e}"))?;
    key.get_value("MachineGuid")
        .map_err(|e| format!("No se pudo leer MachineGuid: {e}"))
}

#[cfg(target_os = "linux")]
fn machine_id() -> Result<String, String> {
    fs::read_to_string("/etc/machine-id")
        .or_else(|_| fs::read_to_string("/var/lib/dbus/machine-id"))
        .map_err(|e| format!("No se pudo leer el identificador del equipo: {e}"))
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn machine_id() -> Result<String, String> {
    Err("La licencia por equipo solo está implementada para Windows y Linux".to_string())
}

fn public_key() -> Result<VerifyingKey, String> {
    let encoded = PUBLIC_KEY_B64.ok_or_else(|| {
        "Falta configurar ICONTAB_LICENSE_PUBLIC_KEY al compilar la versión de Windows".to_string()
    })?;
    let bytes = BASE64
        .decode(encoded)
        .map_err(|e| format!("La clave pública de licencias no es válida: {e}"))?;
    let bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "La clave pública debe contener 32 bytes".to_string())?;
    VerifyingKey::from_bytes(&bytes)
        .map_err(|e| format!("La clave pública de licencias no es válida: {e}"))
}

fn verificar_firma(licencia: &SignedLicense, huella: &str) -> Result<(), String> {
    if licencia.claims.version != 1
        || licencia.claims.product_id != PRODUCT_ID
        || licencia.claims.device_fingerprint != huella
    {
        return Err("La licencia no corresponde a este producto o equipo".to_string());
    }
    let key = public_key()?;
    let signature_bytes = BASE64
        .decode(&licencia.signature)
        .map_err(|e| format!("La firma de licencia no es válida: {e}"))?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|e| format!("La firma de licencia no es válida: {e}"))?;
    let payload = serde_json::to_vec(&licencia.claims)
        .map_err(|e| format!("No se pudo validar la licencia: {e}"))?;
    key.verify(&payload, &signature)
        .map_err(|_| "La firma de la licencia no es válida".to_string())
}

fn license_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(LICENSE_FILE))
        .map_err(|e| format!("No se pudo determinar la carpeta de licencia: {e}"))
}

fn guardar_licencia(app: &tauri::AppHandle, licencia: &SignedLicense) -> Result<(), String> {
    let path = license_path(app)?;
    let directory = path
        .parent()
        .ok_or_else(|| "La ruta de licencia no tiene carpeta".to_string())?;
    fs::create_dir_all(directory)
        .map_err(|e| format!("No se pudo crear la carpeta de datos: {e}"))?;
    let temporal = path.with_extension("json.tmp");
    let contents = serde_json::to_vec_pretty(licencia)
        .map_err(|e| format!("No se pudo serializar la licencia: {e}"))?;
    fs::write(&temporal, contents).map_err(|e| format!("No se pudo guardar la licencia: {e}"))?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("No se pudo reemplazar la licencia: {e}"))?;
    }
    fs::rename(&temporal, &path).map_err(|e| format!("No se pudo finalizar la licencia: {e}"))
}

fn leer_licencia(app: &tauri::AppHandle) -> Result<Option<SignedLicense>, String> {
    let path = license_path(app)?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read(&path).map_err(|e| format!("No se pudo leer la licencia: {e}"))?;
    serde_json::from_slice(&contents)
        .map(Some)
        .map_err(|e| format!("El archivo de licencia está dañado: {e}"))
}

fn estado(
    enforced: bool,
    licensed: bool,
    fingerprint: String,
    message: impl Into<String>,
    checked_online: bool,
) -> LicenseStatus {
    LicenseStatus {
        enforced,
        licensed,
        online_activation_available: license_server_url().is_some(),
        device_fingerprint: fingerprint,
        message: message.into(),
        checked_online,
    }
}

#[tauri::command]
pub async fn obtener_estado_licencia(app: tauri::AppHandle) -> Result<LicenseStatus, String> {
    if !enforcement_enabled() {
        return Ok(estado(
            false,
            true,
            huella_equipo().unwrap_or_default(),
            "Licencia omitida en desarrollo y pruebas Linux",
            false,
        ));
    }

    let fingerprint = huella_equipo()?;

    if PUBLIC_KEY_B64.is_none() {
        return Ok(estado(
            true,
            false,
            fingerprint,
            "La activación de licencias no está configurada para esta compilación",
            false,
        ));
    }

    let Some(licencia) = leer_licencia(&app)? else {
        return Ok(estado(
            true,
            false,
            fingerprint,
            "Activa este equipo o importa el archivo de licencia firmado",
            false,
        ));
    };
    if let Err(error) = verificar_firma(&licencia, &fingerprint) {
        return Ok(estado(true, false, fingerprint, error, false));
    }

    let Some(base_url) = license_server_url() else {
        return Ok(estado(
            true,
            true,
            fingerprint,
            "Licencia local válida; servidor de validación no configurado",
            false,
        ));
    };
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .map_err(|e| format!("No se pudo preparar la validación online: {e}"))?
        .post(format!("{}/v1/validate", base_url.trim_end_matches('/')))
        .json(&ValidationRequest {
            license_id: &licencia.claims.license_id,
            device_fingerprint: &fingerprint,
        })
        .send()
        .await;

    match response {
        Ok(response) if response.status().is_success() => {
            match response.json::<SignedLicense>().await {
                Ok(actualizada) if verificar_firma(&actualizada, &fingerprint).is_ok() => {
                    guardar_licencia(&app, &actualizada)?;
                    Ok(estado(
                        true,
                        true,
                        fingerprint,
                        "Licencia validada online",
                        true,
                    ))
                }
                _ => Ok(estado(
                    true,
                    true,
                    fingerprint,
                    "Servidor no verificable; se continúa con la licencia local firmada",
                    false,
                )),
            }
        }
        Ok(response)
            if matches!(
                response.status(),
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::NOT_FOUND | StatusCode::CONFLICT
            ) =>
        {
            Ok(estado(
                true,
                false,
                fingerprint,
                "El servidor rechazó esta activación; contacta al administrador de la licencia",
                true,
            ))
        }
        Ok(_) | Err(_) => Ok(estado(
            true,
            true,
            fingerprint,
            "Sin conexión con el servidor; se continúa con la licencia local del equipo",
            false,
        )),
    }
}

#[tauri::command]
pub async fn activar_licencia_online(
    app: tauri::AppHandle,
    licencia_key: String,
) -> Result<LicenseStatus, String> {
    if !enforcement_enabled() {
        return Ok(estado(
            false,
            true,
            huella_equipo()?,
            "Licencia omitida en desarrollo y pruebas Linux",
            false,
        ));
    }
    if PUBLIC_KEY_B64.is_none() {
        return Err("Esta compilación no tiene configurada la clave pública de licencias".to_string());
    }
    let fingerprint = huella_equipo()?;
    let base_url = license_server_url().ok_or_else(|| {
        "Falta configurar el servidor de licencias al compilar la versión de Windows".to_string()
    })?;
    let response = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?
        .post(format!("{}/v1/activate", base_url.trim_end_matches('/')))
        .json(&ActivationRequest {
            license_key: &licencia_key,
            device_fingerprint: &fingerprint,
        })
        .send()
        .await
        .map_err(|e| format!("No se pudo contactar el servidor de licencias: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("El servidor rechazó la activación ({status}): {body}"));
    }
    let licencia = response
        .json::<SignedLicense>()
        .await
        .map_err(|e| format!("Respuesta de activación inválida: {e}"))?;
    verificar_firma(&licencia, &fingerprint)?;
    guardar_licencia(&app, &licencia)?;
    Ok(estado(
        true,
        true,
        fingerprint,
        "Equipo activado y licencia guardada",
        true,
    ))
}

#[tauri::command]
pub fn importar_licencia_offline(
    app: tauri::AppHandle,
    ruta: String,
) -> Result<LicenseStatus, String> {
    if !enforcement_enabled() {
        return Ok(estado(
            false,
            true,
            huella_equipo()?,
            "Licencia omitida en desarrollo y pruebas Linux",
            false,
        ));
    }
    let fingerprint = huella_equipo()?;
    let contents = fs::read(ruta).map_err(|e| format!("No se pudo leer el archivo: {e}"))?;
    let licencia: SignedLicense = serde_json::from_slice(&contents)
        .map_err(|e| format!("El archivo no contiene una licencia válida: {e}"))?;
    verificar_firma(&licencia, &fingerprint)?;
    guardar_licencia(&app, &licencia)?;
    Ok(estado(
        true,
        true,
        fingerprint,
        "Licencia offline importada para este equipo",
        false,
    ))
}

#[cfg(test)]
mod tests {
    use super::{huella_equipo, LicenseClaims, SignedLicense};
    use base64::engine::general_purpose::STANDARD;
    use base64::Engine;
    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};

    #[test]
    fn huella_equipo_es_hash_sha256_y_no_expone_el_identificador_original() {
        let huella = huella_equipo().unwrap();
        assert_eq!(huella.len(), 64);
        assert!(huella.chars().all(|caracter| caracter.is_ascii_hexdigit()));
    }

    #[test]
    fn formato_de_licencia_firmada_verifica_el_payload_estable() {
        let signing_key = SigningKey::from_bytes(&[11_u8; 32]);
        let claims = LicenseClaims {
            version: 1,
            license_id: "LIC-001".to_string(),
            product_id: "icontab-facturacion".to_string(),
            device_fingerprint: "device-hash".to_string(),
            issued_at: 1_800_000_000,
        };
        let signature = signing_key.sign(&serde_json::to_vec(&claims).unwrap());
        let signed = SignedLicense {
            claims,
            signature: STANDARD.encode(signature.to_bytes()),
        };
        let signature_bytes = STANDARD.decode(signed.signature).unwrap();
        let signature = ed25519_dalek::Signature::from_slice(&signature_bytes).unwrap();
        let payload = serde_json::to_vec(&signed.claims).unwrap();
        signing_key.verifying_key().verify_strict(&payload, &signature).unwrap();

        let digest = Sha256::digest(b"example");
        assert_eq!(format!("{digest:x}").len(), 64);
    }
}

use crate::backup;
use crate::state::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::path::Path;
use tauri::State;

#[derive(Serialize)]
pub struct ConfiguracionRespaldos {
    pub directorio: Option<String>,
    pub estado_ultimo_respaldo: String,
}

#[derive(Serialize)]
pub struct ConfiguracionNegocio {
    pub nit: String,
    pub nombre_empresa: String,
    pub razon_social: String,
    pub direccion: String,
    pub telefono: String,
    pub email: String,
    pub tipo_negocio: String,
    pub aplica_iva: bool,
}

#[derive(Deserialize)]
pub struct ConfiguracionNegocioRequest {
    pub nit: String,
    pub nombre_empresa: String,
    pub razon_social: String,
    pub direccion: String,
    pub telefono: String,
    pub email: String,
    pub tipo_negocio: String,
    pub aplica_iva: bool,
}

const TIPOS_NEGOCIO: &[&str] = &[
    "general",
    "panaderia",
    "legumbreria",
    "farmacia",
    "tienda_agricola",
    "tienda_mixta",
];

fn tipo_negocio_valido(tipo_negocio: &str) -> bool {
    TIPOS_NEGOCIO.contains(&tipo_negocio)
}

fn requerir_admin(state: &AppState) -> Result<(), String> {
    let sesion = state.requerir_sesion()?;
    if sesion.rol != "admin" {
        return Err("No autorizado".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn obtener_configuracion_negocio(
    state: State<AppState>,
) -> Result<ConfiguracionNegocio, String> {
    requerir_admin(&state)?;
    let db = state.db.lock().unwrap();
    db.query_row(
        "SELECT nit, nombre_empresa, razon_social, direccion, telefono, email, tipo_negocio,
                aplica_iva
         FROM configuracion_empresa LIMIT 1",
        [],
        |row| {
            Ok(ConfiguracionNegocio {
                nit: row.get(0)?,
                nombre_empresa: row.get(1)?,
                razon_social: row.get(2)?,
                direccion: row.get(3)?,
                telefono: row.get(4)?,
                email: row.get(5)?,
                tipo_negocio: row.get(6)?,
                aplica_iva: row.get::<_, i64>(7)? != 0,
            })
        },
    )
    .map_err(|error| format!("No se pudo consultar la configuración del negocio: {error}"))
}

#[tauri::command]
pub fn guardar_configuracion_negocio(
    state: State<AppState>,
    req: ConfiguracionNegocioRequest,
) -> Result<ConfiguracionNegocio, String> {
    requerir_admin(&state)?;

    if !tipo_negocio_valido(&req.tipo_negocio) {
        return Err("Selecciona un tipo de negocio válido".to_string());
    }

    let nit = req.nit.trim();
    let nombre_empresa = req.nombre_empresa.trim();
    let razon_social = req.razon_social.trim();
    if nit.is_empty() || nombre_empresa.is_empty() || razon_social.is_empty() {
        return Err("NIT, nombre comercial y razón social son obligatorios".to_string());
    }
    if [
        nit,
        nombre_empresa,
        razon_social,
        req.direccion.trim(),
        req.telefono.trim(),
        req.email.trim(),
    ]
    .iter()
    .any(|value| value.len() > 250)
    {
        return Err("Cada campo debe tener 250 caracteres o menos".to_string());
    }

    let db = state.db.lock().unwrap();
    let actualizados = db
        .execute(
            "UPDATE configuracion_empresa
             SET nit = ?1, nombre_empresa = ?2, razon_social = ?3, direccion = ?4,
                 telefono = ?5, email = ?6, tipo_negocio = ?7, aplica_iva = ?8
             WHERE id = (SELECT id FROM configuracion_empresa ORDER BY id LIMIT 1)",
            params![
                nit,
                nombre_empresa,
                razon_social,
                req.direccion.trim(),
                req.telefono.trim(),
                req.email.trim(),
                req.tipo_negocio,
                req.aplica_iva as i64,
            ],
        )
        .map_err(|error| format!("No se pudo guardar la configuración del negocio: {error}"))?;
    if actualizados == 0 {
        return Err("No existe una configuración de empresa para actualizar".to_string());
    }

    db.query_row(
        "SELECT nit, nombre_empresa, razon_social, direccion, telefono, email, tipo_negocio,
                aplica_iva
         FROM configuracion_empresa ORDER BY id LIMIT 1",
        [],
        |row| {
            Ok(ConfiguracionNegocio {
                nit: row.get(0)?,
                nombre_empresa: row.get(1)?,
                razon_social: row.get(2)?,
                direccion: row.get(3)?,
                telefono: row.get(4)?,
                email: row.get(5)?,
                tipo_negocio: row.get(6)?,
                aplica_iva: row.get::<_, i64>(7)? != 0,
            })
        },
    )
    .map_err(|error| format!("No se pudo leer la configuración guardada: {error}"))
}

#[tauri::command]
pub fn obtener_configuracion_respaldos(
    state: State<AppState>,
) -> Result<ConfiguracionRespaldos, String> {
    requerir_admin(&state)?;
    let db = state.db.lock().unwrap();
    let directorio = backup::directorio_configurado(&db)
        .map_err(|e| format!("Error consultando la carpeta de respaldos: {e}"))?
        .map(|path| path.to_string_lossy().into_owned());
    let estado_ultimo_respaldo = state.backup_status.lock().unwrap().clone();
    Ok(ConfiguracionRespaldos {
        directorio,
        estado_ultimo_respaldo,
    })
}

#[tauri::command]
pub fn guardar_directorio_respaldos(
    state: State<AppState>,
    directorio: Option<String>,
) -> Result<ConfiguracionRespaldos, String> {
    requerir_admin(&state)?;

    let directorio_guardado = if let Some(path) = directorio {
        let path = Path::new(&path);
        if !path.is_dir() {
            return Err("Selecciona una carpeta existente y accesible".to_string());
        }
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("No se pudo validar la carpeta: {e}"))?;
        let prueba = canonical.join(format!(".icontab-write-test-{}", uuid::Uuid::new_v4()));
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&prueba)
            .map_err(|e| format!("No se puede escribir en esa carpeta: {e}"))?;
        fs::remove_file(&prueba)
            .map_err(|e| format!("No se pudo limpiar la prueba de escritura: {e}"))?;
        Some(canonical)
    } else {
        None
    };

    let db = state.db.lock().unwrap();
    if let Some(path) = &directorio_guardado {
        db.execute(
            "INSERT INTO ajustes_app (clave, valor) VALUES ('directorio_respaldos', ?1)
             ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
            params![path.to_string_lossy()],
        )
        .map_err(|e| format!("No se pudo guardar la carpeta de respaldos: {e}"))?;
    } else {
        db.execute(
            "DELETE FROM ajustes_app WHERE clave = 'directorio_respaldos'",
            [],
        )
        .map_err(|e| format!("No se pudo quitar la carpeta de respaldos: {e}"))?;
    }

    let directorio = directorio_guardado.map(|path| path.to_string_lossy().into_owned());
    let estado_ultimo_respaldo = if directorio.is_some() {
        "Carpeta guardada. El respaldo automático se creará al próximo inicio.".to_string()
    } else {
        "Respaldos automáticos desactivados.".to_string()
    };
    *state.backup_status.lock().unwrap() = estado_ultimo_respaldo.clone();
    Ok(ConfiguracionRespaldos {
        directorio,
        estado_ultimo_respaldo,
    })
}

#[tauri::command]
pub fn crear_respaldo_ahora(state: State<AppState>) -> Result<String, String> {
    requerir_admin(&state)?;
    let db = state.db.lock().unwrap();
    let directorio = backup::directorio_configurado(&db)
        .map_err(|e| format!("Error leyendo la carpeta de respaldos: {e}"))?
        .ok_or_else(|| "Primero selecciona una carpeta para los respaldos".to_string())?;
    match backup::crear_respaldo(&db, &directorio) {
        Ok(path) => {
            let status = format!("Respaldo creado correctamente: {}", path.display());
            *state.backup_status.lock().unwrap() = status.clone();
            Ok(status)
        }
        Err(error) => {
            *state.backup_status.lock().unwrap() = error.clone();
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::tipo_negocio_valido;

    #[test]
    fn acepta_rubros_disponibles_y_rechaza_valores_arbitrarios() {
        for rubro in [
            "general",
            "panaderia",
            "legumbreria",
            "farmacia",
            "tienda_agricola",
            "tienda_mixta",
        ] {
            assert!(tipo_negocio_valido(rubro));
        }
        assert!(!tipo_negocio_valido("otro"));
    }
}

// src-tauri/src/demo.rs
// Vencimiento del build de DEMOSTRACIÓN (feature `demo`).
//
// El demo dura `DEMO_DIAS` días contados desde su primer arranque en el equipo.
// La fecha de inicio se guarda en un archivo JSON en varias rutas FIJAS del
// sistema (fuera de la carpeta de datos de la app), para que borrar los datos o
// reinstalar la aplicación no reinicie el conteo:
//
//   Windows:
//     %PROGRAMDATA%\iContab\demo_inicio.json
//     %LOCALAPPDATA%\iContab\demo_inicio.json
//     %APPDATA%\iContab\demo_inicio.json
//   Linux / macOS:
//     $XDG_CONFIG_HOME/icontab/demo_inicio.json
//     ~/.config/icontab/demo_inicio.json
//     ~/.icontab/demo_inicio.json
//   Además (compatibilidad con la primera versión del demo):
//     <carpeta de datos de la app>/demo_inicio.json
//
// En cada arranque se leen todas las marcas y se toma la MÁS ANTIGUA: si el
// usuario borra una, las demás siguen contando el tiempo. Al superar el plazo,
// la interfaz muestra la pantalla de "demostración finalizada" con el contacto.
//
// Es una medida disuasiva (sencilla): no es un DRM. El build NORMAL no se ve
// afectado: `obtener_estado_demo` devuelve demo=false y nunca bloquea.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Duración de la demostración, en días.
pub const DEMO_DIAS: i64 = 15;
const DIA_SEGUNDOS: i64 = 86_400;
const DEMO_FILE: &str = "demo_inicio.json";
const CARPETA_MARCA: &str = "iContab";

#[derive(Serialize, Deserialize)]
struct DemoInicio {
    iniciado_en: i64,
}

#[derive(Serialize)]
pub struct DemoEstado {
    pub demo: bool,
    pub total_dias: i64,
    pub iniciado_en: Option<i64>,
    pub expira_en: Option<i64>,
    pub vencido: bool,
    pub dias_restantes: i64,
}

fn push_unico(rutas: &mut Vec<PathBuf>, ruta: PathBuf) {
    if !rutas.iter().any(|existente| existente == &ruta) {
        rutas.push(ruta);
    }
}

/// Rutas fijas donde se guarda la marca del demo. La primera es la "principal"
/// del sistema; las demás son redundancia (y compatibilidad con versiones
/// anteriores que solo guardaban en la carpeta de datos de la app).
fn marcadores(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut rutas: Vec<PathBuf> = Vec::new();

    if cfg!(target_os = "windows") {
        for variable in ["PROGRAMDATA", "LOCALAPPDATA", "APPDATA"] {
            if let Ok(base) = std::env::var(variable) {
                if !base.trim().is_empty() {
                    push_unico(
                        &mut rutas,
                        PathBuf::from(base).join(CARPETA_MARCA).join(DEMO_FILE),
                    );
                }
            }
        }
    } else {
        if let Ok(base) = std::env::var("XDG_CONFIG_HOME") {
            if !base.trim().is_empty() {
                push_unico(
                    &mut rutas,
                    PathBuf::from(base).join("icontab").join(DEMO_FILE),
                );
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            if !home.trim().is_empty() {
                push_unico(
                    &mut rutas,
                    PathBuf::from(&home)
                        .join(".config")
                        .join("icontab")
                        .join(DEMO_FILE),
                );
                push_unico(
                    &mut rutas,
                    PathBuf::from(&home).join(".icontab").join(DEMO_FILE),
                );
            }
        }
    }

    if let Ok(datos) = app.path().app_data_dir() {
        push_unico(&mut rutas, datos.join(DEMO_FILE));
    }

    rutas
}

fn leer_de(ruta: &Path) -> Option<i64> {
    let contents = fs::read(ruta).ok()?;
    let registro: DemoInicio = serde_json::from_slice(&contents).ok()?;
    Some(registro.iniciado_en)
}

fn guardar_en(ruta: &Path, iniciado_en: i64) -> Result<(), String> {
    let carpeta = ruta
        .parent()
        .ok_or_else(|| "La ruta del demo no tiene carpeta".to_string())?;
    fs::create_dir_all(carpeta)
        .map_err(|e| format!("No se pudo crear {}: {e}", carpeta.display()))?;
    let contents = serde_json::to_vec_pretty(&DemoInicio { iniciado_en })
        .map_err(|e| format!("No se pudo serializar el registro del demo: {e}"))?;
    fs::write(ruta, contents).map_err(|e| format!("No se pudo escribir {}: {e}", ruta.display()))
}

/// Fecha de inicio efectiva: la más antigua de las marcas encontradas. Si no
/// hay ninguna, se usa `ahora` (primer arranque).
fn inicio_efectivo(existentes: &[i64], ahora: i64) -> i64 {
    existentes.iter().copied().min().unwrap_or(ahora)
}

/// Devuelve la fecha de inicio del demo (epoch en segundos). Si es el primer
/// arranque, la crea en todas las rutas posibles.
pub fn registrar_inicio(app: &tauri::AppHandle) -> Result<i64, String> {
    let rutas = marcadores(app);
    let ahora = chrono::Utc::now().timestamp();

    let existentes: Vec<i64> = rutas.iter().filter_map(|ruta| leer_de(ruta)).collect();
    let inicio = inicio_efectivo(&existentes, ahora);

    // Reescribir todas las marcas (incluidas las que falten o estén dañadas),
    // para que borrar una carpeta concreta no sirva de nada.
    let mut escritas = 0usize;
    let mut ultimo_error: Option<String> = None;
    for ruta in &rutas {
        match guardar_en(ruta, inicio) {
            Ok(()) => escritas += 1,
            Err(e) => {
                log::warn!("No se pudo guardar la marca del demo: {e}");
                ultimo_error = Some(e);
            }
        }
    }

    if escritas == 0 {
        let detalle = ultimo_error.unwrap_or_else(|| "no hay rutas disponibles".to_string());
        return Err(format!("No se pudo guardar la marca del demo: {detalle}"));
    }

    Ok(inicio)
}

/// Días completos que quedan de demo para una fecha de inicio y un instante
/// dados. Devuelve 0 cuando ya venció.
pub fn dias_restantes(iniciado_en: i64, ahora: i64) -> i64 {
    let restante = iniciado_en + DEMO_DIAS * DIA_SEGUNDOS - ahora;
    if restante <= 0 {
        0
    } else {
        (restante + DIA_SEGUNDOS - 1) / DIA_SEGUNDOS
    }
}

#[tauri::command]
pub fn obtener_estado_demo(app: tauri::AppHandle) -> Result<DemoEstado, String> {
    // En el build normal (sin el feature `demo`) nunca se aplica el vencimiento.
    if !cfg!(feature = "demo") {
        return Ok(DemoEstado {
            demo: false,
            total_dias: DEMO_DIAS,
            iniciado_en: None,
            expira_en: None,
            vencido: false,
            dias_restantes: 0,
        });
    }

    let iniciado_en = registrar_inicio(&app)?;
    let ahora = chrono::Utc::now().timestamp();
    let expira_en = iniciado_en + DEMO_DIAS * DIA_SEGUNDOS;
    Ok(DemoEstado {
        demo: true,
        total_dias: DEMO_DIAS,
        iniciado_en: Some(iniciado_en),
        expira_en: Some(expira_en),
        vencido: ahora >= expira_en,
        dias_restantes: dias_restantes(iniciado_en, ahora),
    })
}

#[cfg(test)]
mod tests {
    use super::{dias_restantes, inicio_efectivo, DEMO_DIAS, DIA_SEGUNDOS};

    #[test]
    fn calcula_los_dias_restantes_del_demo() {
        let inicio = 1_000_000;
        assert_eq!(dias_restantes(inicio, inicio), DEMO_DIAS);
        assert_eq!(dias_restantes(inicio, inicio + DIA_SEGUNDOS), DEMO_DIAS - 1);
        assert_eq!(
            dias_restantes(inicio, inicio + (DEMO_DIAS - 1) * DIA_SEGUNDOS),
            1
        );
        assert_eq!(dias_restantes(inicio, inicio + DEMO_DIAS * DIA_SEGUNDOS), 0);
        assert_eq!(dias_restantes(inicio, inicio + 100 * DIA_SEGUNDOS), 0);
    }

    #[test]
    fn usa_la_marca_mas_antigua() {
        let ahora = 2_000_000;
        // Sin marcas: primer arranque.
        assert_eq!(inicio_efectivo(&[], ahora), ahora);
        // Varias marcas: se toma la más antigua (borrar una no reinicia nada).
        assert_eq!(inicio_efectivo(&[1_900_000, 1_700_000, 1_800_000], ahora), 1_700_000);
    }
}

use rusqlite::{Connection, DatabaseName, OptionalExtension};
use std::fs;
use std::path::{Path, PathBuf};

const BACKUP_DIRECTORY_KEY: &str = "directorio_respaldos";
const BACKUP_PREFIX: &str = "icontab_backup_";
const MAX_BACKUPS: usize = 30;

pub fn directorio_configurado(conn: &Connection) -> Result<Option<PathBuf>, rusqlite::Error> {
    conn.query_row(
        "SELECT valor FROM ajustes_app WHERE clave = ?1",
        [BACKUP_DIRECTORY_KEY],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map(|path| path.map(PathBuf::from))
}

pub fn crear_respaldo(conn: &Connection, directorio: &Path) -> Result<PathBuf, String> {
    if !directorio.is_dir() {
        return Err(format!(
            "La carpeta de respaldos no está disponible: {}",
            directorio.display()
        ));
    }

    let marca_tiempo = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f");
    let nombre = format!("{BACKUP_PREFIX}{marca_tiempo}.db");
    let destino = directorio.join(nombre);
    let temporal = destino.with_extension("tmp");

    if temporal.exists() {
        fs::remove_file(&temporal)
            .map_err(|e| format!("No se pudo limpiar el respaldo temporal: {e}"))?;
    }

    conn.backup(DatabaseName::Main, &temporal, None)
        .map_err(|e| format!("Falló la copia SQLite: {e}"))?;

    let verificacion = Connection::open(&temporal)
        .and_then(|copia| copia.query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0)))
        .map_err(|e| format!("No se pudo verificar el respaldo: {e}"))?;
    if verificacion != "ok" {
        let _ = fs::remove_file(&temporal);
        return Err(format!("El respaldo no pasó integrity_check: {verificacion}"));
    }

    fs::rename(&temporal, &destino)
        .map_err(|e| format!("No se pudo finalizar el respaldo: {e}"))?;
    rotar_respaldos(directorio)?;
    Ok(destino)
}

fn rotar_respaldos(directorio: &Path) -> Result<(), String> {
    let mut respaldos = fs::read_dir(directorio)
        .map_err(|e| format!("No se pudo leer la carpeta de respaldos: {e}"))?
        .filter_map(Result::ok)
        .filter(|entrada| {
            entrada.file_type().map(|tipo| tipo.is_file()).unwrap_or(false)
                && entrada.file_name().to_string_lossy().starts_with(BACKUP_PREFIX)
                && entrada.path().extension().is_some_and(|extension| extension == "db")
        })
        .map(|entrada| entrada.path())
        .collect::<Vec<_>>();
    respaldos.sort();

    let borrar_hasta = respaldos.len().saturating_sub(MAX_BACKUPS);
    for respaldo in respaldos.into_iter().take(borrar_hasta) {
        fs::remove_file(&respaldo)
            .map_err(|e| format!("No se pudo eliminar el respaldo antiguo: {e}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{crear_respaldo, rotar_respaldos, BACKUP_PREFIX};
    use rusqlite::Connection;
    use std::fs;
    use std::path::PathBuf;

    fn carpeta_temporal() -> PathBuf {
        let path = std::env::temp_dir().join(format!("icontab-backup-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn respaldo_es_consistente_y_rotacion_conserva_las_ultimas_30_copias() {
        let directorio = carpeta_temporal();
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE prueba (valor TEXT); INSERT INTO prueba VALUES ('conservado');")
            .unwrap();

        let copia = crear_respaldo(&conn, &directorio).unwrap();
        let valor: String = Connection::open(&copia)
            .unwrap()
            .query_row("SELECT valor FROM prueba", [], |row| row.get(0))
            .unwrap();
        assert_eq!(valor, "conservado");

        for indice in 0..31 {
            let path = directorio.join(format!("{BACKUP_PREFIX}{indice:03}.db"));
            fs::write(path, b"older backup").unwrap();
        }
        rotar_respaldos(&directorio).unwrap();
        let cantidad = fs::read_dir(&directorio)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|entrada| entrada.path().extension().is_some_and(|extension| extension == "db"))
            .count();
        assert_eq!(cantidad, 30);

        fs::remove_dir_all(directorio).unwrap();
    }
}

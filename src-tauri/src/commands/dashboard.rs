// src-tauri/src/commands/dashboard.rs
// Comando de estadísticas del dashboard (replica get_estadisticas_dashboard de crud.py).
use crate::state::AppState;
use tauri::State;
use serde::Serialize;
use chrono::Datelike;

#[derive(Serialize)]
pub struct DashboardStats {
    pub total_productos: i64,
    pub sin_stock: i64,
    pub stock_bajo: i64,
    pub total_categorias: i64,
    pub total_usuarios: i64,
    pub movimientos_hoy: i64,
    pub facturas_hoy: i64,
    pub ventas_hoy: f64,
}

fn scalar_i64(conn: &rusqlite::Connection, sql: &str) -> Result<i64, String> {
    conn.query_row(sql, [], |r| r.get(0))
        .map_err(|e| format!("Error consultando dashboard: {}", e))
}

#[tauri::command]
pub fn dashboard_stats(state: State<AppState>) -> Result<DashboardStats, String> {
    state.requerir_sesion()?;

    let hoy_inicio = inicio_del_dia_iso8601();

    let db = state.db.lock().unwrap();

    let total_productos = scalar_i64(&db, "SELECT COUNT(*) FROM productos")?;
    let sin_stock = scalar_i64(&db, "SELECT COUNT(*) FROM productos WHERE stock_actual = 0")?;
    let stock_bajo = scalar_i64(
        &db,
        "SELECT COUNT(*) FROM productos WHERE stock_actual < stock_minimo AND stock_actual > 0",
    )?;
    let total_categorias = scalar_i64(&db, "SELECT COUNT(*) FROM categorias")?;
    let total_usuarios = scalar_i64(&db, "SELECT COUNT(*) FROM usuarios WHERE activo = 1")?;
    let movimientos_hoy = scalar_i64(
        &db,
        &format!("SELECT COUNT(*) FROM movimientos WHERE fecha >= '{hoy_inicio}'"),
    )?;
    let facturas_hoy = scalar_i64(
        &db,
        &format!("SELECT COUNT(*) FROM facturas WHERE fecha_emision >= '{hoy_inicio}'"),
    )?;

    let ventas_hoy = db
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(total), 0.0) FROM facturas WHERE fecha_emision >= '{hoy_inicio}'"
            ),
            [],
            |r| r.get::<_, f64>(0),
        )
        .map_err(|e| format!("Error consultando ventas: {}", e))?;

    Ok(DashboardStats {
        total_productos,
        sin_stock,
        stock_bajo,
        total_categorias,
        total_usuarios,
        movimientos_hoy,
        facturas_hoy,
        ventas_hoy,
    })
}

/// Devuelve el timestamp de inicio del día actual (equivalente a hoy_inicio en Python).
fn inicio_del_dia_iso8601() -> String {
    // Python: datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    let now = chrono::Utc::now();
    format!(
        "{:04}-{:02}-{:02}T00:00:00Z",
        now.year(),
        now.month(),
        now.day()
    )
}

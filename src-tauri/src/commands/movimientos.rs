// src-tauri/src/commands/movimientos.rs
// Comandos de movimientos de stock (porta routers/movimientos.py).
use crate::state::AppState;
use crate::db::ahora_iso8601;
use crate::units;
use tauri::State;
use rusqlite::{params, OptionalExtension};
use serde::{Serialize, Deserialize};

#[derive(Serialize)]
pub struct MovimientoResponse {
    pub id: i64,
    pub producto_id: i64,
    pub producto_nombre: String,
    pub producto_codigo: String,
    pub tipo: String,
    pub cantidad: f64,
    pub unidad_medida: String,
    pub fecha: String,
    pub usuario_username: String,
    pub nota: Option<String>,
}

#[derive(Serialize)]
pub struct MovimientoListaPaginada {
    pub movimientos: Vec<MovimientoResponse>,
    pub total: i64,
}

#[derive(Deserialize)]
pub struct MovimientoListarParams {
    pub skip: Option<i64>,
    pub limit: Option<i64>,
    pub tipo: Option<String>,
    pub producto_id: Option<i64>,
    pub hoy: Option<bool>,
}

#[derive(Deserialize)]
pub struct MovimientoCreate {
    pub producto_id: i64,
    pub tipo: String, // "entrada" | "salida"
    pub cantidad: f64,
    pub nota: Option<String>,
}

#[tauri::command]
pub fn listar_movimientos(
    state: State<AppState>,
    params_req: Option<MovimientoListarParams>,
) -> Result<MovimientoListaPaginada, String> {
    state.requerir_sesion()?;

    let p = params_req.unwrap_or(MovimientoListarParams {
        skip: None,
        limit: None,
        tipo: None,
        producto_id: None,
        hoy: None,
    });

    let from_where = String::from(
        " FROM movimientos m
          JOIN productos pr ON pr.id = m.producto_id
          LEFT JOIN usuarios u ON u.id = m.usuario_id
          WHERE 1=1",
    );
    let mut where_sql = from_where;
    let mut valores: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if let Some(tipo) = &p.tipo {
        where_sql.push_str(" AND m.tipo = ?");
        valores.push(Box::new(tipo.clone()));
    }
    if let Some(producto_id) = p.producto_id {
        where_sql.push_str(" AND m.producto_id = ?");
        valores.push(Box::new(producto_id));
    }
    if p.hoy == Some(true) {
        where_sql.push_str(" AND date(m.fecha) = date('now')");
    }

    let count_sql = format!("SELECT COUNT(*){where_sql}");
    let sql = format!(
        "SELECT m.id, m.producto_id, pr.nombre, pr.codigo, m.tipo, m.cantidad, m.fecha,
                COALESCE(u.username, 'Sistema'), m.nota, m.unidad_medida
         {where_sql} ORDER BY m.fecha DESC, m.id DESC LIMIT ? OFFSET ?"
    );
    let limite = p.limit.unwrap_or(100).clamp(1, 1000);
    let salto = p.skip.unwrap_or(0).max(0);

    let db = state.db.lock().unwrap();
    let parametros_conteo: Vec<&dyn rusqlite::ToSql> = valores.iter().map(|value| value.as_ref()).collect();
    let total = db
        .query_row(&count_sql, &parametros_conteo[..], |row| row.get::<_, i64>(0))
        .map_err(|error| format!("Error consultando total de movimientos: {error}"))?;
    let mut stmt = db
        .prepare(&sql)
        .map_err(|e| format!("Error preparando query: {}", e))?;
    valores.push(Box::new(limite));
    valores.push(Box::new(salto));
    let parametros: Vec<&dyn rusqlite::ToSql> = valores.iter().map(|value| value.as_ref()).collect();
    let rows = stmt
        .query_map(&parametros[..], |r| {
            Ok(MovimientoResponse {
                id: r.get(0)?,
                producto_id: r.get(1)?,
                producto_nombre: r.get(2)?,
                producto_codigo: r.get(3)?,
                tipo: r.get(4)?,
                cantidad: r.get(5)?,
                fecha: r.get(6)?,
                usuario_username: r.get(7)?,
                nota: r.get(8)?,
                unidad_medida: r.get(9)?,
            })
        })
        .map_err(|e| format!("Error ejecutando query: {}", e))?;

    let mut movimientos = Vec::new();
    for r in rows {
        movimientos.push(r.map_err(|e| e.to_string())?);
    }
    Ok(MovimientoListaPaginada { movimientos, total })
}

#[tauri::command]
pub fn registrar_movimiento(state: State<AppState>, req: MovimientoCreate) -> Result<MovimientoResponse, String> {
    let sesion = state.requerir_sesion()?;

    if !matches!(req.tipo.as_str(), "entrada" | "salida") {
        return Err("El tipo de movimiento debe ser entrada o salida".to_string());
    }

    let db = state.db.lock().unwrap();

    // Validar producto y stock para salidas
    let producto = db
        .query_row(
            "SELECT id, nombre, codigo, stock_actual, unidad_medida FROM productos WHERE id = ?1",
            params![req.producto_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, f64>(3)?,
                    r.get::<_, String>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Error consultando producto: {}", e))?
        .ok_or_else(|| format!("Producto {} no encontrado", req.producto_id))?;

    let (prod_id, prod_nombre, prod_codigo, prod_stock, unidad_medida) = producto;
    units::validar_cantidad(req.cantidad, &unidad_medida, false)?;

    let nuevo_stock = if req.tipo == "salida" {
        if prod_stock < req.cantidad {
            return Err(format!(
                "Stock insuficiente. Disponible: {prod_stock}, Solicitado: {}",
                req.cantidad
            ));
        }
        prod_stock - req.cantidad
    } else {
        prod_stock + req.cantidad
    };

    // Actualizar stock
    db.execute(
        "UPDATE productos SET stock_actual = MAX(0, ?1) WHERE id = ?2",
        params![nuevo_stock, prod_id],
    )
    .map_err(|e| format!("Error actualizando stock: {}", e))?;

    // Insertar movimiento
    db.execute(
        "INSERT INTO movimientos (producto_id, tipo, cantidad, fecha, usuario_id, nota, unidad_medida)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            prod_id,
            req.tipo,
            req.cantidad,
            ahora_iso8601(),
            sesion.usuario_id,
            req.nota,
            unidad_medida,
        ],
    )
    .map_err(|e| format!("Error creando movimiento: {}", e))?;

    let id = db.last_insert_rowid();

    Ok(MovimientoResponse {
        id,
        producto_id: prod_id,
        producto_nombre: prod_nombre,
        producto_codigo: prod_codigo,
        tipo: req.tipo,
        cantidad: req.cantidad,
        unidad_medida,
        fecha: ahora_iso8601(),
        usuario_username: sesion.username,
        nota: req.nota,
    })
}

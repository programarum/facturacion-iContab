// src-tauri/src/commands/movimientos.rs
// Comandos de movimientos de stock (porta routers/movimientos.py).
use crate::state::AppState;
use crate::db::ahora_iso8601;
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
    pub cantidad: i64,
    pub fecha: String,
    pub usuario_username: String,
    pub nota: Option<String>,
}

#[derive(Deserialize)]
pub struct MovimientoListarParams {
    pub skip: Option<i64>,
    pub limit: Option<i64>,
    pub tipo: Option<String>,
    pub producto_id: Option<i64>,
}

#[derive(Deserialize)]
pub struct MovimientoCreate {
    pub producto_id: i64,
    pub tipo: String, // "entrada" | "salida"
    pub cantidad: i64,
    pub nota: Option<String>,
}

#[tauri::command]
pub fn listar_movimientos(state: State<AppState>, params_req: Option<MovimientoListarParams>) -> Result<Vec<MovimientoResponse>, String> {
    state.requerir_sesion()?;

    let p = params_req.unwrap_or(MovimientoListarParams {
        skip: None,
        limit: None,
        tipo: None,
        producto_id: None,
    });

    let mut sql = String::from(
        "SELECT m.id, m.producto_id, pr.nombre, pr.codigo, m.tipo, m.cantidad, m.fecha,
                COALESCE(u.username, 'Sistema'), m.nota
         FROM movimientos m
         JOIN productos pr ON pr.id = m.producto_id
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE 1=1",
    );
    let mut conds: Vec<String> = Vec::new();
    if let Some(t) = &p.tipo {
        conds.push(format!("m.tipo = '{}'", t));
    }
    if let Some(pid) = p.producto_id {
        conds.push(format!("m.producto_id = {pid}"));
    }
    for c in conds {
        sql.push_str(" AND ");
        sql.push_str(&c);
    }
    sql.push_str(" ORDER BY m.fecha DESC");
    sql.push_str(&format!(" LIMIT {} OFFSET {}", p.limit.unwrap_or(100), p.skip.unwrap_or(0)));

    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(&sql)
        .map_err(|e| format!("Error preparando query: {}", e))?;
    let rows = stmt
        .query_map([], |r| {
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
            })
        })
        .map_err(|e| format!("Error ejecutando query: {}", e))?;

    let mut resultado = Vec::new();
    for r in rows {
        resultado.push(r.map_err(|e| e.to_string())?);
    }
    Ok(resultado)
}

#[tauri::command]
pub fn registrar_movimiento(state: State<AppState>, req: MovimientoCreate) -> Result<MovimientoResponse, String> {
    let sesion = state.requerir_sesion()?;

    if req.cantidad <= 0 {
        return Err("La cantidad debe ser mayor a cero".to_string());
    }

    let db = state.db.lock().unwrap();

    // Validar producto y stock para salidas
    let producto = db
        .query_row(
            "SELECT id, nombre, codigo, stock_actual FROM productos WHERE id = ?1",
            params![req.producto_id],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Error consultando producto: {}", e))?
        .ok_or_else(|| format!("Producto {} no encontrado", req.producto_id))?;

    let (prod_id, prod_nombre, prod_codigo, prod_stock) = producto;

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
        "UPDATE productos SET stock_actual = ?1 WHERE id = ?2",
        params![nuevo_stock, prod_id],
    )
    .map_err(|e| format!("Error actualizando stock: {}", e))?;

    // Insertar movimiento
    db.execute(
        "INSERT INTO movimientos (producto_id, tipo, cantidad, fecha, usuario_id, nota)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            prod_id,
            req.tipo,
            req.cantidad,
            ahora_iso8601(),
            sesion.usuario_id,
            req.nota,
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
        fecha: ahora_iso8601(),
        usuario_username: sesion.username,
        nota: req.nota,
    })
}

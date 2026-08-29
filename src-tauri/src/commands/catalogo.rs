// src-tauri/src/commands/catalogo.rs
// Comandos de catálogo: categorías + productos (porta routers/categorias.py y productos.py).
use crate::state::AppState;
use tauri::State;
use rusqlite::{params, OptionalExtension};
use serde::{Serialize, Deserialize};

// ============================================================
// DTOs
// ============================================================

#[derive(Serialize)]
pub struct CategoriaResponse {
    pub id: i64,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub productos_count: i64,
}

#[derive(Serialize)]
pub struct ProductoResponse {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub categoria_id: i64,
    pub precio: f64,
    pub stock_actual: i64,
    pub stock_minimo: i64,
    pub stock_maximo: i64,
    pub estado_stock: String,
    pub categoria_nombre: Option<String>,
}

/// Calcula el estado de stock (coincide con lo que consume la UI: sin_stock/bajo/normal/exceso).
fn estado_stock(stock_actual: i64, stock_minimo: i64, stock_maximo: i64) -> String {
    if stock_actual <= 0 {
        "sin_stock".to_string()
    } else if stock_actual < stock_minimo {
        "bajo".to_string()
    } else if stock_actual > stock_maximo {
        "exceso".to_string()
    } else {
        "normal".to_string()
    }
}

// ============================================================
// CATEGORÍAS
// ============================================================

#[tauri::command]
pub fn listar_categorias(state: State<AppState>) -> Result<Vec<CategoriaResponse>, String> {
    state.requerir_sesion()?;

    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(
            "SELECT c.id, c.nombre, c.descripcion,
                    (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id) as count
             FROM categorias c ORDER BY c.nombre",
        )
        .map_err(|e| format!("Error preparando query: {}", e))?;

    let rows = stmt
        .query_map([], |r| {
            Ok(CategoriaResponse {
                id: r.get(0)?,
                nombre: r.get(1)?,
                descripcion: r.get(2)?,
                productos_count: r.get(3)?,
            })
        })
        .map_err(|e| format!("Error ejecutando query: {}", e))?;

    let mut resultado = Vec::new();
    for row in rows {
        resultado.push(row.map_err(|e| e.to_string())?);
    }
    Ok(resultado)
}

#[derive(Deserialize)]
pub struct CategoriaRequest {
    pub nombre: String,
    pub descripcion: Option<String>,
}

#[tauri::command]
pub fn crear_categoria(state: State<AppState>, req: CategoriaRequest) -> Result<CategoriaResponse, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();

    // Verificar duplicado (case-insensitive)
    let existe: Option<i64> = db
        .query_row(
            "SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?1)",
            params![req.nombre],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Error consultando categoría: {}", e))?;
    if existe.is_some() {
        return Err(format!("La categoría '{}' ya existe", req.nombre));
    }

    db.execute(
        "INSERT INTO categorias (nombre, descripcion) VALUES (?1, ?2)",
        params![req.nombre, req.descripcion],
    )
    .map_err(|e| format!("Error creando categoría: {}", e))?;

    let id = db.last_insert_rowid();
    Ok(CategoriaResponse {
        id,
        nombre: req.nombre,
        descripcion: req.descripcion,
        productos_count: 0,
    })
}

#[derive(Deserialize)]
pub struct CategoriaUpdate {
    pub nombre: Option<String>,
    pub descripcion: Option<String>,
}

#[tauri::command]
pub fn actualizar_categoria(state: State<AppState>, id: i64, req: CategoriaUpdate) -> Result<CategoriaResponse, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();
    let existe = db_exists_categoria(&db, id)?;
    if !existe {
        return Err("Categoría no encontrada".to_string());
    }

    if let Some(nombre) = &req.nombre {
        db.execute(
            "UPDATE categorias SET nombre = ?1 WHERE id = ?2",
            params![nombre, id],
        )
        .map_err(|e| format!("Error actualizando categoría: {}", e))?;
    }
    if let Some(desc) = &req.descripcion {
        db.execute(
            "UPDATE categorias SET descripcion = ?1 WHERE id = ?2",
            params![desc, id],
        )
        .map_err(|e| format!("Error actualizando categoría: {}", e))?;
    }

    leer_categoria(&db, id).ok_or("Categoría no encontrada".to_string())
}

#[tauri::command]
pub fn eliminar_categoria(state: State<AppState>, id: i64) -> Result<(), String> {
    let sesion = state.requerir_sesion()?;
    if sesion.rol != "admin" {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();

    // Verificar que no tenga productos asociados
    let productos: i64 = db
        .query_row(
            "SELECT COUNT(*) FROM productos WHERE categoria_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Error consultando productos: {}", e))?;
    if productos > 0 {
        return Err("No se puede eliminar: tiene productos asociados".to_string());
    }

    db.execute("DELETE FROM categorias WHERE id = ?1", params![id])
        .map_err(|e| format!("Error eliminando categoría: {}", e))?;
    Ok(())
}

// ============================================================
// PRODUCTOS
// ============================================================

fn db_exists_categoria(conn: &rusqlite::Connection, id: i64) -> Result<bool, String> {
    let r: Option<i64> = conn
        .query_row("SELECT id FROM categorias WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(|e| format!("Error consultando categoría: {}", e))?;
    Ok(r.is_some())
}

fn leer_categoria(conn: &rusqlite::Connection, id: i64) -> Option<CategoriaResponse> {
    conn.query_row(
        "SELECT c.id, c.nombre, c.descripcion,
                (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id)
         FROM categorias c WHERE c.id = ?1",
        params![id],
        |r| {
            Ok(CategoriaResponse {
                id: r.get(0)?,
                nombre: r.get(1)?,
                descripcion: r.get(2)?,
                productos_count: r.get(3)?,
            })
        },
    )
    .ok()
}

#[derive(Deserialize)]
pub struct ProductoListarParams {
    pub skip: Option<i64>,
    pub limit: Option<i64>,
    pub categoria_id: Option<i64>,
    pub stock_bajo: Option<bool>,
    pub sin_stock: Option<bool>,
    pub busqueda: Option<String>,
}

#[derive(Serialize)]
pub struct ProductoBusqueda {
    pub id: i64,
    pub codigo: String,
    pub nombre: String,
    pub precio: f64,
    pub stock_actual: i64,
}

#[tauri::command]
pub fn listar_productos(state: State<AppState>, params_req: Option<ProductoListarParams>) -> Result<Vec<ProductoResponse>, String> {
    state.requerir_sesion()?;

    let p = params_req.unwrap_or(ProductoListarParams {
        skip: None,
        limit: None,
        categoria_id: None,
        stock_bajo: None,
        sin_stock: None,
        busqueda: None,
    });

    let mut sql = String::from(
        "SELECT p.id, p.codigo, p.nombre, p.descripcion, p.categoria_id, p.precio,
                p.stock_actual, p.stock_minimo, p.stock_maximo, c.nombre as cat_nombre
         FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE 1=1",
    );
    // Condiciones con placeholders posicionales (previene inyección SQL).
    let mut conds: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(cat) = p.categoria_id {
        conds.push("p.categoria_id = ?".to_string());
        vals.push(Box::new(cat));
    }
    if p.stock_bajo == Some(true) {
        conds.push("p.stock_actual < p.stock_minimo AND p.stock_actual > 0".to_string());
    }
    if p.sin_stock == Some(true) {
        conds.push("p.stock_actual = 0".to_string());
    }
    if let Some(b) = &p.busqueda {
        if !b.is_empty() {
            conds.push("(p.nombre LIKE ? OR p.codigo LIKE ? OR p.descripcion LIKE ?)".to_string());
            let like = format!("%{b}%");
            vals.push(Box::new(like.clone()));
            vals.push(Box::new(like.clone()));
            vals.push(Box::new(like));
        }
    }

    for c in conds {
        sql.push_str(" AND ");
        sql.push_str(&c);
    }
    sql.push_str(" ORDER BY p.nombre");
    sql.push_str(&format!(
        " LIMIT {} OFFSET {}",
        p.limit.unwrap_or(100),
        p.skip.unwrap_or(0)
    ));

    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(&sql)
        .map_err(|e| format!("Error preparando query: {}", e))?;
    let param_refs: Vec<&dyn rusqlite::ToSql> = vals.iter().map(|b| b.as_ref()).collect();
    let rows = stmt
        .query_map(&param_refs[..], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, f64>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?,
                r.get::<_, i64>(8)?,
                r.get::<_, Option<String>>(9)?,
            ))
        })
        .map_err(|e| format!("Error ejecutando query: {}", e))?;

    let mut resultado = Vec::new();
    for row in rows {
        let (id, codigo, nombre, descripcion, cat_id, precio, sa, smin, smax, cat_nombre) =
            row.map_err(|e| e.to_string())?;
        resultado.push(ProductoResponse {
            id,
            codigo,
            nombre,
            descripcion,
            categoria_id: cat_id,
            precio,
            stock_actual: sa,
            stock_minimo: smin,
            stock_maximo: smax,
            estado_stock: estado_stock(sa, smin, smax),
            categoria_nombre: cat_nombre,
        });
    }
    Ok(resultado)
}

#[tauri::command]
pub fn buscar_productos(state: State<AppState>, q: String) -> Result<Vec<ProductoBusqueda>, String> {
    state.requerir_sesion()?;

    let db = state.db.lock().unwrap();
    let like = format!("%{q}%");
    let mut stmt = db
        .prepare(
            "SELECT id, codigo, nombre, precio, stock_actual FROM productos
             WHERE nombre LIKE ?1 OR codigo LIKE ?1 OR descripcion LIKE ?1 LIMIT 20",
        )
        .map_err(|e| format!("Error preparando query: {}", e))?;
    let rows = stmt
        .query_map(params![like], |r| {
            Ok(ProductoBusqueda {
                id: r.get(0)?,
                codigo: r.get(1)?,
                nombre: r.get(2)?,
                precio: r.get(3)?,
                stock_actual: r.get(4)?,
            })
        })
        .map_err(|e| format!("Error ejecutando query: {}", e))?;

    let mut resultado = Vec::new();
    for r in rows {
        resultado.push(r.map_err(|e| e.to_string())?);
    }
    Ok(resultado)
}

#[derive(Deserialize)]
pub struct ProductoCreate {
    pub codigo: String,
    pub nombre: String,
    pub descripcion: Option<String>,
    pub categoria_id: i64,
    pub precio: f64,
    pub stock_actual: i64,
    pub stock_minimo: Option<i64>,
    pub stock_maximo: Option<i64>,
}

#[tauri::command]
pub fn crear_producto(state: State<AppState>, req: ProductoCreate) -> Result<ProductoResponse, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();

    // Código único
    let existe: Option<i64> = db
        .query_row("SELECT id FROM productos WHERE codigo = ?1", params![req.codigo], |r| r.get(0))
        .optional()
        .map_err(|e| format!("Error consultando producto: {}", e))?;
    if existe.is_some() {
        return Err(format!("El código '{}' ya existe", req.codigo));
    }

    // Categoría existe
    if !db_exists_categoria(&db, req.categoria_id)? {
        return Err(format!("Categoría {} no encontrada", req.categoria_id));
    }

    db.execute(
        "INSERT INTO productos (codigo, nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, stock_maximo)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
        params![
            req.codigo,
            req.nombre,
            req.descripcion,
            req.categoria_id,
            req.precio,
            req.stock_actual,
            req.stock_minimo.unwrap_or(5),
            req.stock_maximo.unwrap_or(100),
        ],
    )
    .map_err(|e| format!("Error creando producto: {}", e))?;

    let id = db.last_insert_rowid();
    leer_producto(&db, id).ok_or("Error leyendo producto creado".to_string())
}

#[derive(Deserialize)]
pub struct ProductoUpdate {
    pub nombre: Option<String>,
    pub descripcion: Option<String>,
    pub categoria_id: Option<i64>,
    pub precio: Option<f64>,
    pub stock_actual: Option<i64>,
    pub stock_minimo: Option<i64>,
    pub stock_maximo: Option<i64>,
}

#[tauri::command]
pub fn actualizar_producto(state: State<AppState>, id: i64, req: ProductoUpdate) -> Result<ProductoResponse, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();
    let existe = db_exists_producto(&db, id)?;
    if !existe {
        return Err("Producto no encontrado".to_string());
    }

    // Construimos el SET de forma dinámica con parámetros posicionales.
    let mut set_parts: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(v) = &req.nombre {
        set_parts.push("nombre = ?".to_string());
        vals.push(Box::new(v.clone()));
    }
    if let Some(v) = &req.descripcion {
        set_parts.push("descripcion = ?".to_string());
        vals.push(Box::new(v.clone()));
    }
    if let Some(v) = req.categoria_id {
        set_parts.push("categoria_id = ?".to_string());
        vals.push(Box::new(v));
    }
    if let Some(v) = req.precio {
        set_parts.push("precio = ?".to_string());
        vals.push(Box::new(v));
    }
    if let Some(v) = req.stock_actual {
        set_parts.push("stock_actual = ?".to_string());
        vals.push(Box::new(v));
    }
    if let Some(v) = req.stock_minimo {
        set_parts.push("stock_minimo = ?".to_string());
        vals.push(Box::new(v));
    }
    if let Some(v) = req.stock_maximo {
        set_parts.push("stock_maximo = ?".to_string());
        vals.push(Box::new(v));
    }

    if !set_parts.is_empty() {
        let sql = format!("UPDATE productos SET {} WHERE id = ?", set_parts.join(", "));
        let mut stmt = db
            .prepare(&sql)
            .map_err(|e| format!("Error preparando update: {}", e))?;
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vals;
        params.push(Box::new(id));
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();
        stmt.execute(&param_refs[..])
            .map_err(|e| format!("Error actualizando producto: {}", e))?;
    }

    leer_producto(&db, id).ok_or("Error leyendo producto actualizado".to_string())
}

#[tauri::command]
pub fn eliminar_producto(state: State<AppState>, id: i64) -> Result<(), String> {
    let sesion = state.requerir_sesion()?;
    if sesion.rol != "admin" {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();

    // Verificar si tiene movimientos
    let movs: i64 = db
        .query_row("SELECT COUNT(*) FROM movimientos WHERE producto_id = ?1", params![id], |r| r.get(0))
        .map_err(|e| format!("Error consultando movimientos: {}", e))?;
    if movs > 0 {
        return Err("No se puede eliminar: tiene movimientos registrados".to_string());
    }

    db.execute("DELETE FROM productos WHERE id = ?1", params![id])
        .map_err(|e| format!("Error eliminando producto: {}", e))?;
    Ok(())
}

// ============================================================
// HELPERS
// ============================================================

fn db_exists_producto(conn: &rusqlite::Connection, id: i64) -> Result<bool, String> {
    let r: Option<i64> = conn
        .query_row("SELECT id FROM productos WHERE id = ?1", params![id], |r| r.get(0))
        .optional()
        .map_err(|e| format!("Error consultando producto: {}", e))?;
    Ok(r.is_some())
}

fn leer_producto(conn: &rusqlite::Connection, id: i64) -> Option<ProductoResponse> {
    conn.query_row(
        "SELECT p.id, p.codigo, p.nombre, p.descripcion, p.categoria_id, p.precio,
                p.stock_actual, p.stock_minimo, p.stock_maximo, c.nombre
         FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
         WHERE p.id = ?1",
        params![id],
        |r| {
            let sa: i64 = r.get(6)?;
            let smin: i64 = r.get(7)?;
            let smax: i64 = r.get(8)?;
            Ok(ProductoResponse {
                id: r.get(0)?,
                codigo: r.get(1)?,
                nombre: r.get(2)?,
                descripcion: r.get(3)?,
                categoria_id: r.get(4)?,
                precio: r.get(5)?,
                stock_actual: sa,
                stock_minimo: smin,
                stock_maximo: smax,
                estado_stock: estado_stock(sa, smin, smax),
                categoria_nombre: r.get(9)?,
            })
        },
    )
    .ok()
}

// src-tauri/src/commands/catalogo.rs
// Comandos de catálogo: categorías + productos (porta routers/categorias.py y productos.py).
use crate::state::AppState;
use crate::units;
use tauri::State;
use rusqlite::{params, OptionalExtension};
use serde::{Serialize, Deserialize};
use std::collections::HashSet;

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
    pub stock_actual: f64,
    pub stock_minimo: f64,
    pub stock_maximo: f64,
    pub unidad_medida: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub costo: Option<f64>,
    pub ubicacion: Option<String>,
    pub estado_stock: String,
    pub categoria_nombre: Option<String>,
    pub movimientos_count: i64,
    pub facturas_count: i64,
}

#[derive(Serialize)]
pub struct ProductoListaPaginada {
    pub productos: Vec<ProductoResponse>,
    pub total: i64,
}

/// Calcula el estado de stock (coincide con lo que consume la UI: sin_stock/bajo/normal/exceso).
fn estado_stock(stock_actual: f64, stock_minimo: f64, stock_maximo: f64) -> String {
    if stock_actual <= 0.0 {
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
    pub stock_actual: f64,
    pub unidad_medida: String,
}

#[tauri::command]
pub fn listar_productos(
    state: State<AppState>,
    params_req: Option<ProductoListarParams>,
) -> Result<ProductoListaPaginada, String> {
    let sesion = state.requerir_sesion()?;
    let puede_ver_costo = matches!(sesion.rol.as_str(), "admin" | "moderador");

    let p = params_req.unwrap_or(ProductoListarParams {
        skip: None,
        limit: None,
        categoria_id: None,
        stock_bajo: None,
        sin_stock: None,
        busqueda: None,
    });

    let mut from_where = String::from(
        " FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE 1=1",
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
        from_where.push_str(" AND ");
        from_where.push_str(&c);
    }
    let sql_count = format!("SELECT COUNT(*){from_where}");
    let sql = format!(
        "SELECT p.id, p.codigo, p.nombre, p.descripcion, p.categoria_id, p.precio,
                p.stock_actual, p.stock_minimo, p.stock_maximo, c.nombre as cat_nombre,
                p.costo, p.ubicacion, p.unidad_medida,
                (SELECT COUNT(*) FROM movimientos m WHERE m.producto_id = p.id),
                (SELECT COUNT(*) FROM factura_items fi WHERE fi.producto_id = p.id)
         {from_where}
         ORDER BY p.codigo COLLATE NOCASE ASC, p.id ASC LIMIT ? OFFSET ?"
    );
    let limite = p.limit.unwrap_or(100).clamp(1, 1000);
    let salto = p.skip.unwrap_or(0).max(0);

    let db = state.db.lock().unwrap();
    let parametros_conteo: Vec<&dyn rusqlite::ToSql> = vals.iter().map(|value| value.as_ref()).collect();
    let total = db
        .query_row(&sql_count, &parametros_conteo[..], |row| row.get::<_, i64>(0))
        .map_err(|e| format!("Error consultando total de productos: {e}"))?;

    let mut stmt = db
        .prepare(&sql)
        .map_err(|e| format!("Error preparando query: {}", e))?;
    let mut valores_consulta = vals;
    valores_consulta.push(Box::new(limite));
    valores_consulta.push(Box::new(salto));
    let param_refs: Vec<&dyn rusqlite::ToSql> = valores_consulta.iter().map(|value| value.as_ref()).collect();
    let rows = stmt
        .query_map(&param_refs[..], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, f64>(5)?,
                r.get::<_, f64>(6)?,
                r.get::<_, f64>(7)?,
                r.get::<_, f64>(8)?,
                r.get::<_, Option<String>>(9)?,
                r.get::<_, Option<f64>>(10)?,
                r.get::<_, Option<String>>(11)?,
                r.get::<_, String>(12)?,
                r.get::<_, i64>(13)?,
                r.get::<_, i64>(14)?,
            ))
        })
        .map_err(|e| format!("Error ejecutando query: {}", e))?;

    let mut resultado = Vec::new();
    for row in rows {
        let (
            id,
            codigo,
            nombre,
            descripcion,
            cat_id,
            precio,
            sa,
            smin,
            smax,
            cat_nombre,
            costo,
            ubicacion,
            unidad_medida,
            movimientos_count,
            facturas_count,
        ) = row.map_err(|e| e.to_string())?;
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
            unidad_medida,
            costo: if puede_ver_costo { costo } else { None },
            ubicacion,
            estado_stock: estado_stock(sa, smin, smax),
            categoria_nombre: cat_nombre,
            movimientos_count,
            facturas_count,
        });
    }
    Ok(ProductoListaPaginada {
        productos: resultado,
        total,
    })
}

#[tauri::command]
pub fn buscar_productos(state: State<AppState>, q: String) -> Result<Vec<ProductoBusqueda>, String> {
    state.requerir_sesion()?;

    let db = state.db.lock().unwrap();
    let like = format!("%{q}%");
    let mut stmt = db
        .prepare(
            "SELECT id, codigo, nombre, precio, stock_actual, unidad_medida FROM productos
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
                unidad_medida: r.get(5)?,
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
    pub stock_actual: f64,
    pub stock_minimo: Option<f64>,
    pub stock_maximo: Option<f64>,
    pub unidad_medida: String,
    pub costo: Option<f64>,
    pub ubicacion: Option<String>,
}

#[tauri::command]
pub fn crear_producto(state: State<AppState>, req: ProductoCreate) -> Result<ProductoResponse, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }
    if req.costo.is_some_and(|costo| !costo.is_finite() || costo < 0.0) {
        return Err("El costo debe ser un valor mayor o igual a cero".to_string());
    }
    if !req.precio.is_finite() || req.precio < 0.0 {
        return Err("El precio debe ser un valor válido mayor o igual a cero".to_string());
    }
    let stock_minimo = req.stock_minimo.unwrap_or(5.0);
    let stock_maximo = req.stock_maximo.unwrap_or(100.0);
    units::validar_cantidad(req.stock_actual, &req.unidad_medida, true)?;
    units::validar_cantidad(stock_minimo, &req.unidad_medida, true)?;
    units::validar_cantidad(stock_maximo, &req.unidad_medida, true)?;
    if stock_minimo > stock_maximo {
        return Err("El stock mínimo no puede ser mayor que el stock máximo".to_string());
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
        "INSERT INTO productos (codigo, nombre, descripcion, categoria_id, precio, stock_actual, stock_minimo, stock_maximo, costo, ubicacion, unidad_medida)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![
            req.codigo,
            req.nombre,
            req.descripcion,
            req.categoria_id,
            req.precio,
            req.stock_actual,
            stock_minimo,
            stock_maximo,
            req.costo,
            req.ubicacion,
            req.unidad_medida,
        ],
    )
    .map_err(|e| format!("Error creando producto: {}", e))?;

    let id = db.last_insert_rowid();
    leer_producto(&db, id).ok_or("Error leyendo producto creado".to_string())
}

#[derive(Deserialize)]
pub struct ProductoImportar {
    pub codigo: String,
    pub nombre: String,
    pub categoria: Option<String>,
    pub descripcion: Option<String>,
    pub unidad_medida: String,
    pub costo: Option<f64>,
    pub precio: f64,
    pub stock_actual: f64,
    pub stock_minimo: Option<f64>,
    pub stock_maximo: Option<f64>,
    pub ubicacion: Option<String>,
}

#[derive(Deserialize)]
pub struct ImportarProductosRequest {
    pub productos: Vec<ProductoImportar>,
}

#[derive(Serialize)]
pub struct ProductoImportacionOmitido {
    pub codigo: String,
    pub nombre: String,
    pub motivo: String,
}

#[derive(Serialize)]
pub struct ResultadoImportacionProductos {
    pub insertados: usize,
    pub omitidos: Vec<ProductoImportacionOmitido>,
}

fn obtener_o_crear_categoria(
    conn: &rusqlite::Connection,
    nombre_categoria: &str,
) -> Result<i64, String> {
    let nombre = if nombre_categoria.trim().is_empty() {
        "Importados"
    } else {
        nombre_categoria.trim()
    };
    let existente: Option<i64> = conn
        .query_row(
            "SELECT id FROM categorias WHERE LOWER(nombre) = LOWER(?1)",
            params![nombre],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("Error buscando categoría '{nombre}': {error}"))?;
    if let Some(id) = existente {
        return Ok(id);
    }

    conn.execute(
        "INSERT INTO categorias (nombre, descripcion) VALUES (?1, 'Importación desde Excel')",
        params![nombre],
    )
    .map_err(|error| format!("Error creando categoría '{nombre}': {error}"))?;
    Ok(conn.last_insert_rowid())
}

fn validar_productos_importados(productos: &[ProductoImportar]) -> Result<(), String> {
    if productos.is_empty() {
        return Err("El archivo no contiene productos para importar".to_string());
    }
    if productos.len() > 5000 {
        return Err("El archivo supera el máximo de 5000 productos por importación".to_string());
    }

    for producto in productos {
        if producto.codigo.trim().is_empty() || producto.nombre.trim().is_empty() {
            return Err("Todos los productos deben tener código y nombre".to_string());
        }
        if [
            producto.codigo.trim(),
            producto.nombre.trim(),
            producto.categoria.as_deref().unwrap_or(""),
            producto.descripcion.as_deref().unwrap_or(""),
            producto.ubicacion.as_deref().unwrap_or(""),
        ]
        .iter()
        .any(|value| value.len() > 250)
        {
            return Err(format!(
                "El producto '{}' tiene un campo con más de 250 caracteres",
                producto.codigo
            ));
        }
        if !producto.precio.is_finite() || producto.precio < 0.0 {
            return Err(format!("Precio inválido para '{}'", producto.codigo));
        }
        if producto
            .costo
            .is_some_and(|costo| !costo.is_finite() || costo < 0.0)
        {
            return Err(format!("Costo inválido para '{}'", producto.codigo));
        }

        let stock_minimo = producto.stock_minimo.unwrap_or(5.0);
        let stock_maximo = producto
            .stock_maximo
            .unwrap_or_else(|| producto.stock_actual.max(100.0));
        units::validar_cantidad(producto.stock_actual, &producto.unidad_medida, true)
            .map_err(|error| format!("{}: {error}", producto.codigo))?;
        units::validar_cantidad(stock_minimo, &producto.unidad_medida, true)
            .map_err(|error| format!("{} (stock mínimo): {error}", producto.codigo))?;
        units::validar_cantidad(stock_maximo, &producto.unidad_medida, true)
            .map_err(|error| format!("{} (stock máximo): {error}", producto.codigo))?;
        if stock_minimo > stock_maximo {
            return Err(format!(
                "El stock mínimo supera al máximo para '{}'",
                producto.codigo
            ));
        }
    }
    Ok(())
}

fn guardar_productos_importados(
    db: &mut rusqlite::Connection,
    usuario_id: i64,
    productos: &[ProductoImportar],
) -> Result<ResultadoImportacionProductos, String> {
    let tx = db
        .transaction()
        .map_err(|error| format!("No se pudo iniciar la importación: {error}"))?;
    let mut codigos_vistos = HashSet::new();
    let mut omitidos = Vec::new();
    let mut insertados = 0;

    for producto in productos {
        let codigo = producto.codigo.trim();
        let nombre = producto.nombre.trim();
        if !codigos_vistos.insert(codigo.to_string()) {
            omitidos.push(ProductoImportacionOmitido {
                codigo: codigo.to_string(),
                nombre: nombre.to_string(),
                motivo: "Código repetido dentro del archivo".to_string(),
            });
            continue;
        }

        let existente: Option<i64> = tx
            .query_row(
                "SELECT id FROM productos WHERE codigo = ?1",
                params![codigo],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("Error verificando código '{codigo}': {error}"))?;
        if existente.is_some() {
            omitidos.push(ProductoImportacionOmitido {
                codigo: codigo.to_string(),
                nombre: nombre.to_string(),
                motivo: "Ya existe un producto con este código; se conservó sin cambios".to_string(),
            });
            continue;
        }

        let categoria_id = obtener_o_crear_categoria(
            &tx,
            producto.categoria.as_deref().unwrap_or("Importados"),
        )?;
        let stock_minimo = producto.stock_minimo.unwrap_or(5.0);
        let stock_maximo = producto
            .stock_maximo
            .unwrap_or_else(|| producto.stock_actual.max(100.0));
        tx.execute(
            "INSERT INTO productos
                (codigo, nombre, descripcion, categoria_id, precio, stock_actual,
                 stock_minimo, stock_maximo, costo, ubicacion, unidad_medida)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                codigo,
                nombre,
                producto.descripcion.as_deref().filter(|value| !value.trim().is_empty()),
                categoria_id,
                producto.precio,
                producto.stock_actual,
                stock_minimo,
                stock_maximo,
                producto.costo,
                producto.ubicacion.as_deref().filter(|value| !value.trim().is_empty()),
                producto.unidad_medida,
            ],
        )
        .map_err(|error| format!("Error importando '{codigo}': {error}"))?;
        let producto_id = tx.last_insert_rowid();

        if producto.stock_actual > 0.0 {
            tx.execute(
                "INSERT INTO movimientos
                    (producto_id, tipo, cantidad, fecha, usuario_id, nota, unidad_medida)
                 VALUES (?1, 'entrada', ?2, ?3, ?4, 'Inventario inicial importado desde Excel', ?5)",
                params![
                    producto_id,
                    producto.stock_actual,
                    crate::db::ahora_iso8601(),
                    usuario_id,
                    producto.unidad_medida,
                ],
            )
            .map_err(|error| format!("Error registrando stock inicial de '{codigo}': {error}"))?;
        }
        insertados += 1;
    }

    tx.commit()
        .map_err(|error| format!("No se pudo finalizar la importación: {error}"))?;
    Ok(ResultadoImportacionProductos {
        insertados,
        omitidos,
    })
}

#[tauri::command]
pub fn importar_productos(
    state: State<AppState>,
    req: ImportarProductosRequest,
) -> Result<ResultadoImportacionProductos, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }
    validar_productos_importados(&req.productos)?;

    let mut db = state.db.lock().unwrap();
    guardar_productos_importados(&mut db, sesion.usuario_id, &req.productos)
}

#[derive(Deserialize)]
pub struct ProductoUpdate {
    pub nombre: Option<String>,
    pub descripcion: Option<String>,
    pub categoria_id: Option<i64>,
    pub precio: Option<f64>,
    pub stock_actual: Option<f64>,
    pub stock_minimo: Option<f64>,
    pub stock_maximo: Option<f64>,
    pub unidad_medida: Option<String>,
    pub confirmar_cambio_unidad: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub costo: Option<Option<f64>>,
    #[serde(default, deserialize_with = "deserialize_nullable")]
    pub ubicacion: Option<Option<String>>,
}

fn deserialize_nullable<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

#[tauri::command]
pub fn actualizar_producto(state: State<AppState>, id: i64, req: ProductoUpdate) -> Result<ProductoResponse, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }
    if let Some(Some(costo)) = req.costo {
        if !costo.is_finite() || costo < 0.0 {
            return Err("El costo debe ser un valor mayor o igual a cero".to_string());
        }
    }

    let db = state.db.lock().unwrap();
    let existe = db_exists_producto(&db, id)?;
    if !existe {
        return Err("Producto no encontrado".to_string());
    }

    let (stock_minimo_actual, stock_maximo_actual, unidad_actual): (f64, f64, String) = db
        .query_row(
            "SELECT stock_minimo, stock_maximo, unidad_medida FROM productos WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Error consultando la unidad del producto: {e}"))?;
    let unidad_nueva = req.unidad_medida.as_deref().unwrap_or(&unidad_actual);
    if let Some(unidad) = &req.unidad_medida {
        if !units::es_unidad_valida(unidad) {
            return Err("Selecciona una unidad de medida válida".to_string());
        }
        if unidad != &unidad_actual {
            if req.confirmar_cambio_unidad != Some(true) {
                return Err("Confirma el cambio de unidad y vuelve a verificar el stock en la nueva medida".to_string());
            }
        }
    }
    for stock in [req.stock_actual, req.stock_minimo, req.stock_maximo]
        .into_iter()
        .flatten()
    {
        units::validar_cantidad(stock, unidad_nueva, true)?;
    }
    if req.stock_minimo.unwrap_or(stock_minimo_actual)
        > req.stock_maximo.unwrap_or(stock_maximo_actual)
    {
        return Err("El stock mínimo no puede ser mayor que el stock máximo".to_string());
    }
    if req.precio.is_some_and(|precio| !precio.is_finite() || precio < 0.0) {
        return Err("El precio debe ser un valor válido mayor o igual a cero".to_string());
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
    if let Some(v) = &req.unidad_medida {
        set_parts.push("unidad_medida = ?".to_string());
        vals.push(Box::new(v.clone()));
    }
    if let Some(v) = req.costo {
        set_parts.push("costo = ?".to_string());
        vals.push(Box::new(v));
    }
    if let Some(v) = req.ubicacion {
        set_parts.push("ubicacion = ?".to_string());
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
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();

    // Verificar si tiene movimientos
    let movimientos: i64 = db
        .query_row("SELECT COUNT(*) FROM movimientos WHERE producto_id = ?1", params![id], |r| r.get(0))
        .map_err(|e| format!("Error consultando movimientos: {}", e))?;
    if movimientos > 0 {
        return Err(format!(
            "No se puede eliminar: tiene {movimientos} movimientos de inventario asociados. El historial se conserva para auditoría."
        ));
    }
    let ventas: i64 = db
        .query_row("SELECT COUNT(*) FROM factura_items WHERE producto_id = ?1", params![id], |row| row.get(0))
        .map_err(|e| format!("Error consultando facturas: {e}"))?;
    if ventas > 0 {
        return Err(format!(
            "No se puede eliminar: aparece en {ventas} líneas de factura. Se conserva para no alterar el historial de ventas."
        ));
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
                p.stock_actual, p.stock_minimo, p.stock_maximo, c.nombre, p.costo, p.ubicacion,
                p.unidad_medida,
                (SELECT COUNT(*) FROM movimientos m WHERE m.producto_id = p.id),
                (SELECT COUNT(*) FROM factura_items fi WHERE fi.producto_id = p.id)
         FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
         WHERE p.id = ?1",
        params![id],
        |r| {
            let sa: f64 = r.get(6)?;
            let smin: f64 = r.get(7)?;
            let smax: f64 = r.get(8)?;
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
                unidad_medida: r.get(12)?,
                costo: r.get(10)?,
                ubicacion: r.get(11)?,
                estado_stock: estado_stock(sa, smin, smax),
                categoria_nombre: r.get(9)?,
                movimientos_count: r.get(13)?,
                facturas_count: r.get(14)?,
            })
        },
    )
    .ok()
}

#[cfg(test)]
mod tests {
    use super::{
        guardar_productos_importados, validar_productos_importados, ProductoImportar,
        ProductoUpdate,
    };
    use rusqlite::Connection;

    fn producto_importado(codigo: &str, nombre: &str, stock_actual: f64) -> ProductoImportar {
        ProductoImportar {
            codigo: codigo.to_string(),
            nombre: nombre.to_string(),
            categoria: None,
            descripcion: None,
            unidad_medida: "unidad".to_string(),
            costo: Some(900.0),
            precio: 3500.0,
            stock_actual,
            stock_minimo: Some(2.0),
            stock_maximo: Some(20.0),
            ubicacion: None,
        }
    }

    fn db_importacion() -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE categorias (id INTEGER PRIMARY KEY, nombre TEXT UNIQUE, descripcion TEXT);
             CREATE TABLE productos (
                 id INTEGER PRIMARY KEY,
                 codigo TEXT UNIQUE,
                 nombre TEXT,
                 descripcion TEXT,
                 categoria_id INTEGER,
                 precio REAL,
                 stock_actual REAL,
                 stock_minimo REAL,
                 stock_maximo REAL,
                 costo REAL,
                 ubicacion TEXT,
                 unidad_medida TEXT
             );
             CREATE TABLE movimientos (
                 id INTEGER PRIMARY KEY,
                 producto_id INTEGER,
                 tipo TEXT,
                 cantidad REAL,
                 fecha TEXT,
                 usuario_id INTEGER,
                 nota TEXT,
                 unidad_medida TEXT
             );
             INSERT INTO productos (codigo, nombre, precio) VALUES ('EXIST', 'Existente', 99);",
        )
        .unwrap();
        db
    }

    #[test]
    fn actualizacion_distingue_campos_omitidos_de_campos_vacios() {
        let omitidos: ProductoUpdate = serde_json::from_str("{}").unwrap();
        assert_eq!(omitidos.costo, None);
        assert_eq!(omitidos.ubicacion, None);

        let vacios: ProductoUpdate =
            serde_json::from_str(r#"{"costo":null,"ubicacion":null}"#).unwrap();
        assert_eq!(vacios.costo, Some(None));
        assert_eq!(vacios.ubicacion, Some(None));

        let definidos: ProductoUpdate =
            serde_json::from_str(r#"{"costo":123.5,"ubicacion":"Bodega A"}"#).unwrap();
        assert_eq!(definidos.costo, Some(Some(123.5)));
        assert_eq!(
            definidos.ubicacion,
            Some(Some("Bodega A".to_string()))
        );
    }

    #[test]
    fn importacion_omite_codigos_existentes_y_repetidos_y_registra_stock_inicial() {
        let mut db = db_importacion();
        let filas = vec![
            producto_importado("009", "Bebedero", 3.0),
            producto_importado("EXIST", "No debe reemplazar", 8.0),
            producto_importado("009", "Duplicado del archivo", 4.0),
        ];
        validar_productos_importados(&filas).unwrap();

        let resultado = guardar_productos_importados(&mut db, 7, &filas).unwrap();
        assert_eq!(resultado.insertados, 1);
        assert_eq!(resultado.omitidos.len(), 2);

        let producto: (String, f64, f64, String, String) = db
            .query_row(
                "SELECT c.nombre, p.costo, p.precio, p.unidad_medida, p.codigo
                 FROM productos p JOIN categorias c ON c.id = p.categoria_id
                 WHERE p.codigo = '009'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();
        assert_eq!(producto, ("Importados".to_string(), 900.0, 3500.0, "unidad".to_string(), "009".to_string()));

        let movimiento: (f64, String, String, i64) = db
            .query_row(
                "SELECT cantidad, unidad_medida, tipo, usuario_id FROM movimientos WHERE producto_id = 2",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(movimiento, (3.0, "unidad".to_string(), "entrada".to_string(), 7));

        let precio_existente: f64 = db
            .query_row("SELECT precio FROM productos WHERE codigo = 'EXIST'", [], |row| row.get(0))
            .unwrap();
        assert_eq!(precio_existente, 99.0);
    }

    #[test]
    fn importacion_valida_unidades_y_cantidades_antes_de_escribir() {
        let mut fila = producto_importado("PESO", "Producto por peso", 1.25);
        fila.unidad_medida = "unidad".to_string();
        assert!(validar_productos_importados(&[fila]).is_err());
    }
}

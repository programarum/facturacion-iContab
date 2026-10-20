// src-tauri/src/commands/facturacion.rs
// Comandos de facturación: clientes, facturas (con CUFE/QR) y configuración de empresa.
use crate::state::AppState;
use crate::db::{ahora_iso8601};
use crate::fiscal::{self, Decimal};
use crate::units;
use tauri::State;
use rusqlite::{params, OptionalExtension, Connection};
use serde::{Serialize, Deserialize};

// ============================================================
// DTOs
// ============================================================

#[derive(Serialize)]
pub struct ClienteResponse {
    pub id: i64,
    pub tipo_identificacion: String,
    pub numero_identificacion: String,
    pub nombre: String,
    pub razon_social: Option<String>,
    pub direccion: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub responsable_iva: bool,
    pub regimen: String,
    pub creado_en: String,
}

#[derive(Serialize)]
pub struct ConfiguracionResponse {
    pub nit: String,
    pub nombre_empresa: String,
    pub razon_social: String,
    pub direccion: String,
    pub telefono: String,
    pub email: String,
    pub prefijo_factura: String,
    pub numero_actual: i64,
    pub numero_resolucion: Option<String>,
    pub tipo_negocio: String,
    pub aplica_iva: bool,
}

#[derive(Serialize)]
pub struct FacturaItemResponse {
    pub id: i64,
    pub cantidad: f64,
    pub unidad_medida: String,
    pub descripcion: String,
    pub precio_unitario: f64,
    pub descuento: f64,
    pub subtotal: f64,
    pub iva: f64,
    pub total: f64,
}

#[derive(Serialize)]
pub struct FacturaCliente {
    pub id: i64,
    pub tipo_identificacion: String,
    pub numero_identificacion: String,
    pub nombre: String,
    pub razon_social: Option<String>,
    pub direccion: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub responsable_iva: bool,
    pub regimen: String,
    pub creado_en: String,
}

#[derive(Serialize)]
pub struct FacturaResponse {
    pub id: i64,
    pub numero_completo: String,
    pub fecha_emision: String,
    pub estado_dian: String,
    pub cliente: FacturaCliente,
    pub items: Vec<FacturaItemResponse>,
    pub subtotal: f64,
    pub descuento: f64,
    pub base_gravable: f64,
    pub iva: f64,
    pub iva_porcentaje: f64,
    pub total: f64,
    pub cufe: Option<String>,
}

#[derive(Serialize)]
pub struct FacturaHistorialResponse {
    pub id: i64,
    pub numero_completo: String,
    pub fecha_emision: String,
    pub cliente_nombre: String,
    pub cliente_identificacion: String,
    pub total: f64,
    pub estado_dian: String,
}

// ============================================================
// CLIENTES
// ============================================================

#[derive(Deserialize)]
pub struct ClienteCreate {
    pub tipo_identificacion: Option<String>,
    pub numero_identificacion: String,
    pub nombre: String,
    pub razon_social: Option<String>,
    pub direccion: Option<String>,
    pub telefono: Option<String>,
    pub email: Option<String>,
    pub responsable_iva: Option<bool>,
    pub regimen: Option<String>,
}

fn leer_cliente(conn: &Connection, id: i64) -> Option<ClienteResponse> {
    conn.query_row(
        "SELECT id, tipo_identificacion, numero_identificacion, nombre, razon_social,
                direccion, telefono, email, responsable_iva, regimen, creado_en
         FROM clientes WHERE id = ?1",
        params![id],
        |r| {
            Ok(ClienteResponse {
                id: r.get(0)?,
                tipo_identificacion: r.get(1)?,
                numero_identificacion: r.get(2)?,
                nombre: r.get(3)?,
                razon_social: r.get(4)?,
                direccion: r.get(5)?,
                telefono: r.get(6)?,
                email: r.get(7)?,
                responsable_iva: r.get(8)?,
                regimen: r.get(9)?,
                creado_en: r.get(10)?,
            })
        },
    )
    .ok()
}

#[tauri::command]
pub fn listar_clientes(state: State<AppState>, busqueda: Option<String>) -> Result<Vec<ClienteResponse>, String> {
    state.requerir_sesion()?;

    let db = state.db.lock().unwrap();
    let mut sql = String::from(
        "SELECT id, tipo_identificacion, numero_identificacion, nombre, razon_social,
                direccion, telefono, email, responsable_iva, regimen, creado_en
         FROM clientes",
    );

    if let Some(b) = &busqueda {
        if !b.is_empty() {
            let like = format!("%{b}%");
            sql.push_str(
                " WHERE nombre LIKE ?1 OR numero_identificacion LIKE ?1 OR razon_social LIKE ?1",
            );
            let mut stmt = db
                .prepare(&sql)
                .map_err(|e| format!("Error preparando query: {}", e))?;
            let rows = stmt
                .query_map(params![like], |r| {
                    Ok(ClienteResponse {
                        id: r.get(0)?,
                        tipo_identificacion: r.get(1)?,
                        numero_identificacion: r.get(2)?,
                        nombre: r.get(3)?,
                        razon_social: r.get(4)?,
                        direccion: r.get(5)?,
                        telefono: r.get(6)?,
                        email: r.get(7)?,
                        responsable_iva: r.get(8)?,
                        regimen: r.get(9)?,
                        creado_en: r.get(10)?,
                    })
                })
                .map_err(|e| format!("Error ejecutando query: {}", e))?;
            let mut res = Vec::new();
            for row in rows {
                res.push(row.map_err(|e| e.to_string())?);
            }
            return Ok(res);
        }
    }

    sql.push_str(" ORDER BY nombre LIMIT 100");
    let mut stmt = db
        .prepare(&sql)
        .map_err(|e| format!("Error preparando query: {}", e))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(ClienteResponse {
                id: r.get(0)?,
                tipo_identificacion: r.get(1)?,
                numero_identificacion: r.get(2)?,
                nombre: r.get(3)?,
                razon_social: r.get(4)?,
                direccion: r.get(5)?,
                telefono: r.get(6)?,
                email: r.get(7)?,
                responsable_iva: r.get(8)?,
                regimen: r.get(9)?,
                creado_en: r.get(10)?,
            })
        })
        .map_err(|e| format!("Error ejecutando query: {}", e))?;
    let mut res = Vec::new();
    for row in rows {
        res.push(row.map_err(|e| e.to_string())?);
    }
    Ok(res)
}

#[tauri::command]
pub fn crear_cliente(state: State<AppState>, req: ClienteCreate) -> Result<ClienteResponse, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }

    let db = state.db.lock().unwrap();

    let dup: Option<i64> = db
        .query_row(
            "SELECT id FROM clientes WHERE numero_identificacion = ?1",
            params![req.numero_identificacion],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| format!("Error consultando cliente: {}", e))?;
    if dup.is_some() {
        return Err(format!("Cliente con identificación {} ya existe", req.numero_identificacion));
    }

    let nombre = req.nombre.clone();
    let razon_social = req.razon_social.clone().unwrap_or_else(|| nombre.clone());

    db.execute(
        "INSERT INTO clientes
            (tipo_identificacion, numero_identificacion, nombre, razon_social, direccion,
             telefono, email, responsable_iva, regimen, creado_en)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            req.tipo_identificacion.unwrap_or_else(|| "13".to_string()),
            req.numero_identificacion,
            req.nombre,
            razon_social,
            req.direccion,
            req.telefono,
            req.email,
            req.responsable_iva.unwrap_or(false),
            req.regimen.unwrap_or_else(|| "No responsable de IVA".to_string()),
            ahora_iso8601(),
        ],
    )
    .map_err(|e| format!("Error creando cliente: {}", e))?;

    let id = db.last_insert_rowid();
    leer_cliente(&db, id).ok_or("Error leyendo cliente creado".to_string())
}

// ============================================================
// CONFIGURACIÓN DE EMPRESA
// ============================================================

#[tauri::command]
pub fn obtener_configuracion(state: State<AppState>) -> Result<ConfiguracionResponse, String> {
    state.requerir_sesion()?;

    let db = state.db.lock().unwrap();
    db.query_row(
        "SELECT nit, nombre_empresa, razon_social, direccion, telefono, email,
                prefijo_factura, numero_actual, numero_resolucion, tipo_negocio, aplica_iva
         FROM configuracion_empresa LIMIT 1",
        [],
        |r| {
            Ok(ConfiguracionResponse {
                nit: r.get(0)?,
                nombre_empresa: r.get(1)?,
                razon_social: r.get(2)?,
                direccion: r.get(3)?,
                telefono: r.get(4)?,
                email: r.get(5)?,
                prefijo_factura: r.get(6)?,
                numero_actual: r.get(7)?,
                numero_resolucion: r.get(8)?,
                tipo_negocio: r.get(9)?,
                aplica_iva: r.get::<_, i64>(10)? != 0,
            })
        },
    )
    .optional()
    .map_err(|e| format!("Error consultando configuración: {}", e))?
    .ok_or_else(|| "Empresa no configurada".to_string())
}

// ============================================================
// FACTURAS
// ============================================================

fn leer_factura(conn: &Connection, id: i64) -> Option<FacturaResponse> {
    let (numero_completo, fecha_emision, estado_dian, cliente_id, subtotal, descuento,
         base_gravable, iva, iva_pct, total, cufe) = conn
        .query_row(
            "SELECT numero_completo, fecha_emision, estado_dian, cliente_id,
                    subtotal, descuento, base_gravable, iva, iva_porcentaje, total, cufe
             FROM facturas WHERE id = ?1",
            params![id],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, f64>(4)?,
                    r.get::<_, f64>(5)?,
                    r.get::<_, f64>(6)?,
                    r.get::<_, f64>(7)?,
                    r.get::<_, f64>(8)?,
                    r.get::<_, f64>(9)?,
                    r.get::<_, Option<String>>(10)?,
                ))
            },
        )
        .ok()?;

    let cliente = conn
        .query_row(
            "SELECT id, tipo_identificacion, numero_identificacion, nombre, razon_social,
                    direccion, telefono, email, responsable_iva, regimen, creado_en
             FROM clientes WHERE id = ?1",
            params![cliente_id],
            |r| {
                Ok(FacturaCliente {
                    id: r.get(0)?,
                    tipo_identificacion: r.get(1)?,
                    numero_identificacion: r.get(2)?,
                    nombre: r.get(3)?,
                    razon_social: r.get(4)?,
                    direccion: r.get(5)?,
                    telefono: r.get(6)?,
                    email: r.get(7)?,
                    responsable_iva: r.get(8)?,
                    regimen: r.get(9)?,
                    creado_en: r.get(10)?,
                })
            },
        )
        .ok()?;

    let mut items = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT id, cantidad, descripcion, precio_unitario, descuento, subtotal, iva, total,
                unidad_medida
         FROM factura_items WHERE factura_id = ?1",
    ) {
        let rows = stmt
            .query_map(params![id], |r| {
                Ok(FacturaItemResponse {
                    id: r.get(0)?,
                    cantidad: r.get(1)?,
                    descripcion: r.get(2)?,
                    precio_unitario: r.get(3)?,
                    descuento: r.get(4)?,
                    subtotal: r.get(5)?,
                    iva: r.get(6)?,
                    total: r.get(7)?,
                    unidad_medida: r.get(8)?,
                })
            })
            .ok();
        if let Some(rows) = rows {
            for row in rows.flatten() {
                items.push(row);
            }
        }
    }

    Some(FacturaResponse {
        id,
        numero_completo,
        fecha_emision,
        estado_dian,
        cliente,
        items,
        subtotal,
        descuento,
        base_gravable,
        iva,
        iva_porcentaje: iva_pct,
        total,
        cufe,
    })
}

#[tauri::command]
pub fn listar_facturas(state: State<AppState>) -> Result<Vec<FacturaResponse>, String> {
    state.requerir_sesion()?;

    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare("SELECT id FROM facturas ORDER BY fecha_emision DESC LIMIT 100")
        .map_err(|e| format!("Error preparando query: {}", e))?;
    let rows = stmt
        .query_map([], |r| r.get::<_, i64>(0))
        .map_err(|e| format!("Error ejecutando query: {}", e))?;

    let mut resultado = Vec::new();
    for row in rows {
        let id = row.map_err(|e| e.to_string())?;
        if let Some(f) = leer_factura(&db, id) {
            resultado.push(f);
        }
    }
    Ok(resultado)
}

#[tauri::command]
pub fn listar_facturas_historial(
    state: State<AppState>,
    fecha_desde: String,
    fecha_hasta: String,
) -> Result<Vec<FacturaHistorialResponse>, String> {
    state.requerir_sesion()?;

    let desde = chrono::NaiveDate::parse_from_str(&fecha_desde, "%Y-%m-%d")
        .map_err(|_| "La fecha inicial debe tener formato AAAA-MM-DD".to_string())?;
    let hasta = chrono::NaiveDate::parse_from_str(&fecha_hasta, "%Y-%m-%d")
        .map_err(|_| "La fecha final debe tener formato AAAA-MM-DD".to_string())?;
    if desde > hasta {
        return Err("La fecha inicial no puede ser posterior a la fecha final".to_string());
    }

    let db = state.db.lock().unwrap();
    let mut stmt = db
        .prepare(
            "SELECT f.id, f.numero_completo, f.fecha_emision, c.nombre,
                    c.numero_identificacion, f.total, f.estado_dian
             FROM facturas f
             JOIN clientes c ON c.id = f.cliente_id
             WHERE date(f.fecha_emision) BETWEEN date(?1) AND date(?2)
             ORDER BY f.fecha_emision DESC, f.id DESC",
        )
        .map_err(|e| format!("Error preparando historial de facturas: {}", e))?;
    let rows = stmt
        .query_map(params![fecha_desde, fecha_hasta], |row| {
            Ok(FacturaHistorialResponse {
                id: row.get(0)?,
                numero_completo: row.get(1)?,
                fecha_emision: row.get(2)?,
                cliente_nombre: row.get(3)?,
                cliente_identificacion: row.get(4)?,
                total: row.get(5)?,
                estado_dian: row.get(6)?,
            })
        })
        .map_err(|e| format!("Error consultando historial de facturas: {}", e))?;

    rows.map(|row| row.map_err(|e| format!("Error leyendo factura: {}", e)))
        .collect()
}

#[tauri::command]
pub fn obtener_factura(state: State<AppState>, id: i64) -> Result<FacturaResponse, String> {
    state.requerir_sesion()?;

    let db = state.db.lock().unwrap();
    leer_factura(&db, id).ok_or_else(|| "Factura no encontrada".to_string())
}

#[derive(Deserialize)]
pub struct FacturaItemCreate {
    pub producto_id: i64,
    pub cantidad: f64,
    pub precio_unitario: f64,
    pub descuento: Option<f64>,
}

#[derive(Deserialize)]
pub struct FacturaCreate {
    pub cliente_id: i64,
    pub items: Vec<FacturaItemCreate>,
    pub fecha_vencimiento: Option<String>,
}

struct ItemCalculado {
    producto_id: i64,
    nombre: String,
    unidad_medida: String,
    cantidad: f64,
    precio_unitario: f64,
    cantidad_decimal: Decimal,
    subtotal: Decimal,
    iva: Decimal,
    total: Decimal,
    descuento: Decimal,
}

#[tauri::command]
pub fn crear_factura(state: State<AppState>, req: FacturaCreate) -> Result<FacturaResponse, String> {
    let sesion = state.requerir_sesion()?;
    if !matches!(sesion.rol.as_str(), "admin" | "moderador") {
        return Err("No autorizado".to_string());
    }
    if req.items.is_empty() {
        return Err("La factura debe tener al menos un ítem".to_string());
    }

    let db = state.db.lock().unwrap();

    // 1. Configuración de empresa
    let config = db
        .query_row(
            "SELECT nit, nombre_empresa, razon_social, direccion, telefono, email,
                    software_id, pin, prefijo_factura, numero_desde, numero_hasta,
                    numero_actual, numero_resolucion, aplica_iva
             FROM configuracion_empresa LIMIT 1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(8)?, // prefijo
                    r.get::<_, String>(7)?, // pin
                    r.get::<_, String>(6)?, // software_id
                    r.get::<_, i64>(10)?,   // numero_hasta
                    r.get::<_, i64>(11)?,   // numero_actual
                    r.get::<_, i64>(13)? != 0, // aplica_iva
                ))
            },
        )
        .optional()
        .map_err(|e| format!("Error consultando configuración: {}", e))?
        .ok_or_else(|| "Empresa no configurada".to_string())?;
    let (nit, prefijo, pin, _software_id, numero_hasta, numero_actual, aplica_iva) = config;

    if numero_actual > numero_hasta {
        return Err("Rango de numeración agotado".to_string());
    }
    let numero_completo = format!("{prefijo}-{numero_actual}");

    // 2. Cliente
    let cliente_identificacion = db
        .query_row(
            "SELECT numero_identificacion FROM clientes WHERE id = ?1",
            params![req.cliente_id],
            |r| r.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| format!("Error consultando cliente: {}", e))?
        .ok_or_else(|| "Cliente no encontrado".to_string())?;

    // 3. Calcular items y validar stock
    let mut items_calculados: Vec<ItemCalculado> = Vec::new();
    let mut cantidades_por_producto: std::collections::HashMap<i64, f64> =
        std::collections::HashMap::new();
    let fecha_emision = ahora_iso8601();

    for item in &req.items {
        if !item.precio_unitario.is_finite() || item.precio_unitario < 0.0 {
            return Err("El precio unitario debe ser un valor válido mayor o igual a cero".to_string());
        }
        let descuento = item.descuento.unwrap_or(0.0);
        if !descuento.is_finite() || descuento < 0.0 {
            return Err("El descuento debe ser un valor válido mayor o igual a cero".to_string());
        }

        let prod = db
            .query_row(
                "SELECT id, nombre, stock_actual, unidad_medida FROM productos WHERE id = ?1",
                params![item.producto_id],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, f64>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("Error consultando producto: {}", e))?
            .ok_or_else(|| format!("Producto {} no encontrado", item.producto_id))?;

        let (pid, pnombre, pstock, unidad_medida) = prod;
        units::validar_cantidad(item.cantidad, &unidad_medida, false)?;
        let total_solicitado = cantidades_por_producto.entry(pid).or_default();
        *total_solicitado += item.cantidad;
        if *total_solicitado > pstock + 0.000001 {
            return Err(format!(
                "Stock insuficiente para '{pnombre}'. Disponible: {pstock} {unidad_medida}"
            ));
        }

        let precio_dec = fiscal::decimal_from_f64(item.precio_unitario);
        let cantidad_decimal = fiscal::decimal_from_f64(item.cantidad);
        let desc_dec = fiscal::decimal_from_f64(descuento);
        let (subtotal, iva, total) = fiscal::calcular_item(cantidad_decimal, precio_dec, desc_dec, aplica_iva);

        items_calculados.push(ItemCalculado {
            producto_id: pid,
            nombre: pnombre,
            unidad_medida,
            cantidad: item.cantidad,
            precio_unitario: item.precio_unitario,
            cantidad_decimal,
            subtotal,
            iva,
            total,
            descuento: desc_dec,
        });
    }

    // 4. Totales (base_gravable = subtotal; total = subtotal + iva)
    let calc_real: Vec<(Decimal, Decimal, Decimal)> = items_calculados
        .iter()
        .map(|item| {
            (
                item.cantidad_decimal,
                fiscal::decimal_from_f64(item.precio_unitario),
                item.descuento,
            )
        })
        .collect();
    let (subtotal_dec, descuento_dec, iva_dec, _) = fiscal::calcular_factura(&calc_real, aplica_iva);
    let total_dec = subtotal_dec + iva_dec;
    let base_gravable_dec = subtotal_dec;
    let iva_porcentaje = if aplica_iva { fiscal::IVA_PORCENTAJE_F64 } else { 0.0 };
    db.execute(
        "INSERT INTO facturas
            (prefijo, numero, numero_completo, tipo_documento, fecha_emision, fecha_vencimiento,
             cliente_id, usuario_id, subtotal, descuento, base_gravable, iva, total, iva_porcentaje,
             estado_dian, cufe, qr_code)
         VALUES (?1,?2,?3,'01',?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'PENDIENTE','','')",
        params![
            prefijo,
            numero_actual,
            numero_completo,
            fecha_emision,
            req.fecha_vencimiento,
            req.cliente_id,
            sesion.usuario_id,
            fiscal::decimal_to_f64(subtotal_dec),
            fiscal::decimal_to_f64(descuento_dec),
            fiscal::decimal_to_f64(base_gravable_dec),
            fiscal::decimal_to_f64(iva_dec),
            fiscal::decimal_to_f64(total_dec),
            iva_porcentaje,
        ],
    )
    .map_err(|e| format!("Error creando factura: {}", e))?;
    let factura_id = db.last_insert_rowid();

    // 6. Items + descontar stock + movimiento
    for item in &items_calculados {
        db.execute(
            "INSERT INTO factura_items
                (factura_id, producto_id, cantidad, descripcion, unidad_medida, precio_unitario,
                 descuento, subtotal, iva, total)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                factura_id,
                item.producto_id,
                item.cantidad,
                item.nombre,
                item.unidad_medida,
                item.precio_unitario,
                fiscal::decimal_to_f64(item.descuento),
                fiscal::decimal_to_f64(item.subtotal),
                fiscal::decimal_to_f64(item.iva),
                fiscal::decimal_to_f64(item.total),
            ],
        )
        .map_err(|e| format!("Error creando ítem: {}", e))?;

        // Descontar stock
        db.execute(
            "UPDATE productos SET stock_actual = MAX(0, stock_actual - ?1) WHERE id = ?2",
            params![item.cantidad, item.producto_id],
        )
        .map_err(|e| format!("Error descontando stock: {}", e))?;

        // Movimiento de salida
        db.execute(
            "INSERT INTO movimientos
                (producto_id, tipo, cantidad, fecha, usuario_id, nota, unidad_medida)
             VALUES (?1, 'salida', ?2, ?3, ?4, ?5, ?6)",
            params![
                item.producto_id,
                item.cantidad,
                fecha_emision,
                sesion.usuario_id,
                format!("Factura {numero_completo}"),
                item.unidad_medida,
            ],
        )
        .map_err(|e| format!("Error creando movimiento: {}", e))?;
    }

    // 7. CUFE y QR
    let cufe = fiscal::generar_cufe(
        &numero_completo,
        &fecha_emision,
        &nit,
        &cliente_identificacion,
        total_dec,
        iva_dec,
        &pin,
    );
    let fecha_corta = &fecha_emision[0..10];
    let qr_data = fiscal::generar_qr_data(&nit, &cliente_identificacion, &numero_completo, fecha_corta, total_dec, &cufe);

    db.execute(
        "UPDATE facturas SET cufe = ?1, qr_code = ?2 WHERE id = ?3",
        params![cufe, qr_data, factura_id],
    )
    .map_err(|e| format!("Error guardando CUFE: {}", e))?;

    // 8. Incrementar consecutivo
    db.execute(
        "UPDATE configuracion_empresa SET numero_actual = numero_actual + 1",
        [],
    )
    .map_err(|e| format!("Error incrementando consecutivo: {}", e))?;

    drop(db);
    let db_guard = state.db.lock().unwrap();
    leer_factura(&db_guard, factura_id).ok_or_else(|| "Error leyendo factura creada".to_string())
}

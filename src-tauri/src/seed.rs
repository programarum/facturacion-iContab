// src-tauri/src/seed.rs
// Datos iniciales de la base de datos. Se siembran una sola vez al iniciar,
// cuando la base todavía no tiene usuarios.
//
// Hay dos conjuntos, seleccionados en tiempo de compilación con el feature
// Cargo `demo`:
//   - Sin `demo` (normal): usuarios, empresa genérica y un catálogo de prueba.
//   - Con `demo`: una "Tienda Mixta" (comidas + frutas y verduras + abarrotes)
//     con catálogo, clientes, movimientos y facturas de ejemplo.
use crate::db;
use crate::security;
use rusqlite::Connection;

#[cfg(feature = "demo")]
use crate::fiscal::{self, Decimal};
#[cfg(feature = "demo")]
use rusqlite::params;
#[cfg(feature = "demo")]
use std::collections::HashMap;

/// Crea los datos iniciales si la base está vacía.
pub fn seed_inicial(_app: &tauri::AppHandle, conn: &mut Connection) -> Result<(), String> {
    if db::hay_usuarios(conn).map_err(|e| e.to_string())? {
        log::info!("[SEED] La base ya tiene datos, omitiendo seed.");
        return Ok(());
    }

    #[cfg(feature = "demo")]
    {
        seed_demo(conn)
    }
    #[cfg(not(feature = "demo"))]
    {
        seed_normal(conn)
    }
}

// ============================================================
// SEED NORMAL (compilación sin el feature `demo`)
// ============================================================

#[cfg(not(feature = "demo"))]
fn seed_normal(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("No se pudo iniciar la transacción de seed: {e}"))?;

    let (admin_hash, admin_salt) = security::hash_password("Admin123!")?;
    let (mod_hash, mod_salt) = security::hash_password("Mod1234!")?;
    let (user_hash, user_salt) = security::hash_password("User123!")?;

    db::insertar_usuario(&tx, "admin", "admin@empresa.com", "Administrador", &admin_hash, &admin_salt, "admin")
        .map_err(|e| e.to_string())?;
    db::insertar_usuario(&tx, "moderador", "mod@empresa.com", "Moderador Principal", &mod_hash, &mod_salt, "moderador")
        .map_err(|e| e.to_string())?;
    db::insertar_usuario(&tx, "usuario", "user@empresa.com", "Usuario Estándar", &user_hash, &user_salt, "usuario")
        .map_err(|e| e.to_string())?;

    db::insertar_config_empresa(
        &tx,
        "9001234567",
        "Tu Empresa SAS",
        "Tu Empresa Soluciones Avanzadas SAS",
        "Calle 123 # 45-67, Bogotá D.C.",
        "601-1234567",
        "facturacion@empresa.com",
        "12345678-1234-1234-1234-123456789012",
        "12345",
        "SET",
        1,
        1000000,
        "18760000001",
        "2026-01-15",
        "2027-01-15",
    )
    .map_err(|e| e.to_string())?;

    let cat_elec = db::insertar_categoria(&tx, "Electrónica", "Productos electrónicos y tecnología").map_err(|e| e.to_string())?;
    let cat_oficina = db::insertar_categoria(&tx, "Oficina", "Artículos de oficina y papelería").map_err(|e| e.to_string())?;
    let cat_muebles = db::insertar_categoria(&tx, "Muebles", "Mobiliario de oficina").map_err(|e| e.to_string())?;

    db::insertar_producto(&tx, "MOU001", "Mouse Inalámbrico Logitech", cat_elec, 45000.0, None, 50.0, 10.0, 100.0, "unidad", None).map_err(|e| e.to_string())?;
    db::insertar_producto(&tx, "TEC001", "Teclado Mecánico RGB", cat_elec, 120000.0, None, 30.0, 5.0, 50.0, "unidad", None).map_err(|e| e.to_string())?;
    db::insertar_producto(&tx, "USB001", "Cable USB Tipo C 2m", cat_elec, 15000.0, None, 100.0, 20.0, 200.0, "unidad", None).map_err(|e| e.to_string())?;
    db::insertar_producto(&tx, "PAQ001", "Resma Papel A4 500h", cat_oficina, 25000.0, None, 200.0, 50.0, 500.0, "unidad", None).map_err(|e| e.to_string())?;
    db::insertar_producto(&tx, "ESC001", "Escritorio Ejecutivo", cat_muebles, 350000.0, None, 15.0, 3.0, 30.0, "unidad", None).map_err(|e| e.to_string())?;

    tx.commit()
        .map_err(|e| format!("No se pudo confirmar el seed inicial: {e}"))?;

    log::info!("[SEED] Datos iniciales creados correctamente.");
    Ok(())
}

// ============================================================
// SEED DEMO (compilación con el feature `demo`)
// ============================================================

#[cfg(feature = "demo")]
fn seed_demo(conn: &mut Connection) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("No se pudo iniciar la transacción de seed: {e}"))?;

    // 1. Usuarios
    let (admin_hash, admin_salt) = security::hash_password("Admin123!")?;
    let (mod_hash, mod_salt) = security::hash_password("Mod1234!")?;
    let (user_hash, user_salt) = security::hash_password("User123!")?;

    let admin_id = db::insertar_usuario(
        &tx, "admin", "admin@laesquina.co", "Administrador", &admin_hash, &admin_salt, "admin",
    )
    .map_err(|e| e.to_string())?;
    db::insertar_usuario(
        &tx, "moderador", "mod@laesquina.co", "Moderador Principal", &mod_hash, &mod_salt, "moderador",
    )
    .map_err(|e| e.to_string())?;
    db::insertar_usuario(
        &tx, "usuario", "cajero@laesquina.co", "Cajero", &user_hash, &user_salt, "usuario",
    )
    .map_err(|e| e.to_string())?;

    // 2. Configuración de empresa (perfil "tienda mixta")
    db::insertar_config_empresa(
        &tx,
        "901234567-8",
        "Tienda Mixta La Esquina",
        "Tienda Mixta La Esquina S.A.S.",
        "Carrera 45 # 12-30, Barrio El Prado",
        "310-555-0199",
        "ventas@laesquina.co",
        "12345678-1234-1234-1234-123456789012",
        "12345",
        "SET",
        1,
        1000000,
        "18760000001",
        "2026-01-15",
        "2027-01-15",
    )
    .map_err(|e| e.to_string())?;

    // Perfil del negocio: tienda mixta, sin IVA (tienda de barrio colombiana).
    tx.execute(
        "UPDATE configuracion_empresa SET tipo_negocio = 'tienda_mixta', aplica_iva = 0",
        [],
    )
    .map_err(|e| format!("No se pudo ajustar el perfil del negocio: {e}"))?;

    // 3. Categorías
    let cat_frutas = db::insertar_categoria(&tx, "Frutas", "Frutas frescas, valor por kg").map_err(|e| e.to_string())?;
    let cat_verduras = db::insertar_categoria(&tx, "Verduras", "Verduras y hortalizas, valor por kg").map_err(|e| e.to_string())?;
    let cat_tuberculos = db::insertar_categoria(&tx, "Tubérculos", "Papa, yuca, plátano y similares").map_err(|e| e.to_string())?;
    let cat_comidas = db::insertar_categoria(&tx, "Comidas preparadas", "Desayunos y almuerzos listos para servir").map_err(|e| e.to_string())?;
    let cat_abarrotes = db::insertar_categoria(&tx, "Abarrotes", "Granos, aceites, endulzantes y despensa").map_err(|e| e.to_string())?;
    let cat_lacteos = db::insertar_categoria(&tx, "Lácteos y huevos", "Leche, quesos, cuajadas y huevos").map_err(|e| e.to_string())?;
    let cat_bebidas = db::insertar_categoria(&tx, "Bebidas", "Gaseosas, aguas, jugos y café").map_err(|e| e.to_string())?;
    let cat_mecato = db::insertar_categoria(&tx, "Mecato y panadería", "Snacks, galletas y pan").map_err(|e| e.to_string())?;
    let cat_aseo = db::insertar_categoria(&tx, "Aseo y hogar", "Artículos de aseo y cuidado del hogar").map_err(|e| e.to_string())?;

    // 4. Productos
    // (codigo, nombre, categoria, unidad, precio, costo, stock, min, max, ubicacion)
    let productos: Vec<(&str, &str, i64, &str, f64, f64, f64, f64, f64, &str)> = vec![
        // Frutas (por kg, salvo piña)
        ("FRU001", "Manzana roja", cat_frutas, "kg", 6500.0, 4200.0, 18.5, 5.0, 40.0, "Nevera 1"),
        ("FRU002", "Banano criollo", cat_frutas, "kg", 3500.0, 2200.0, 25.0, 5.0, 50.0, "Canastilla"),
        ("FRU003", "Naranja valencia", cat_frutas, "kg", 3200.0, 1800.0, 30.0, 6.0, 60.0, "Canastilla"),
        ("FRU004", "Papaya", cat_frutas, "kg", 3800.0, 2400.0, 14.0, 4.0, 30.0, "Nevera 1"),
        ("FRU005", "Mango tommy", cat_frutas, "kg", 7000.0, 4500.0, 9.0, 3.0, 25.0, "Nevera 1"),
        ("FRU006", "Piña perolera", cat_frutas, "unidad", 9000.0, 6000.0, 6.0, 2.0, 15.0, "Piso frutas"),
        // Verduras
        ("VER001", "Tomate chonto", cat_verduras, "kg", 4800.0, 3000.0, 22.0, 5.0, 45.0, "Canastilla"),
        ("VER002", "Cebolla cabezona", cat_verduras, "kg", 4200.0, 2600.0, 26.0, 5.0, 50.0, "Canastilla"),
        ("VER003", "Cebolla larga", cat_verduras, "kg", 6000.0, 3800.0, 8.0, 3.0, 20.0, "Nevera 2"),
        ("VER004", "Zanahoria", cat_verduras, "kg", 3600.0, 2100.0, 15.0, 4.0, 35.0, "Canastilla"),
        ("VER005", "Lechuga batavia", cat_verduras, "unidad", 2500.0, 1400.0, 12.0, 4.0, 30.0, "Nevera 2"),
        ("VER006", "Pimentón", cat_verduras, "kg", 7500.0, 4800.0, 7.0, 2.0, 20.0, "Nevera 2"),
        ("VER007", "Cilantro", cat_verduras, "unidad", 1500.0, 800.0, 20.0, 5.0, 40.0, "Nevera 2"),
        // Tubérculos
        ("TUB001", "Papa pastusa", cat_tuberculos, "kg", 2800.0, 1700.0, 40.0, 10.0, 80.0, "Bulto piso"),
        ("TUB002", "Yuca", cat_tuberculos, "kg", 3200.0, 1900.0, 18.0, 5.0, 40.0, "Bulto piso"),
        ("TUB003", "Plátano hartón", cat_tuberculos, "kg", 3000.0, 1800.0, 24.0, 6.0, 50.0, "Bulto piso"),
        // Comidas preparadas (precio fijo por porción)
        ("COM001", "Desayuno corriente", cat_comidas, "unidad", 8000.0, 4500.0, 30.0, 10.0, 60.0, "Cocina"),
        ("COM002", "Almuerzo corriente", cat_comidas, "unidad", 12000.0, 7000.0, 40.0, 10.0, 80.0, "Cocina"),
        ("COM003", "Almuerzo especial", cat_comidas, "unidad", 16000.0, 9500.0, 20.0, 5.0, 40.0, "Cocina"),
        ("COM004", "Arepa con queso", cat_comidas, "unidad", 4000.0, 2000.0, 25.0, 8.0, 50.0, "Cocina"),
        // Abarrotes
        ("ABA001", "Arroz blanco", cat_abarrotes, "kg", 4200.0, 3200.0, 50.0, 10.0, 100.0, "Estante A"),
        ("ABA002", "Fríjol cargamanto", cat_abarrotes, "kg", 8500.0, 6800.0, 15.0, 5.0, 40.0, "Estante A"),
        ("ABA003", "Aceite de girasol 1L", cat_abarrotes, "unidad", 12500.0, 9800.0, 18.0, 5.0, 40.0, "Estante A"),
        ("ABA004", "Azúcar", cat_abarrotes, "kg", 4000.0, 3000.0, 30.0, 8.0, 60.0, "Estante A"),
        ("ABA005", "Panela", cat_abarrotes, "unidad", 3000.0, 2000.0, 22.0, 6.0, 50.0, "Estante A"),
        ("ABA006", "Pasta espagueti 500g", cat_abarrotes, "unidad", 4500.0, 3200.0, 24.0, 6.0, 50.0, "Estante B"),
        ("ABA007", "Sal 500g", cat_abarrotes, "unidad", 2500.0, 1500.0, 20.0, 5.0, 40.0, "Estante B"),
        // Lácteos y huevos
        ("LAC001", "Leche entera 1L", cat_lacteos, "unidad", 4800.0, 3800.0, 20.0, 6.0, 40.0, "Nevera 3"),
        ("LAC002", "Huevos AA", cat_lacteos, "unidad", 600.0, 450.0, 120.0, 30.0, 240.0, "Nevera 3"),
        ("LAC003", "Queso campesino", cat_lacteos, "kg", 16000.0, 12000.0, 5.5, 2.0, 15.0, "Nevera 3"),
        ("LAC004", "Cuajada", cat_lacteos, "unidad", 5000.0, 3500.0, 10.0, 3.0, 24.0, "Nevera 3"),
        // Bebidas
        ("BEB001", "Gaseosa 1.5L", cat_bebidas, "unidad", 6500.0, 4800.0, 24.0, 6.0, 48.0, "Nevera 4"),
        ("BEB002", "Agua botella 600ml", cat_bebidas, "unidad", 2500.0, 1500.0, 36.0, 12.0, 72.0, "Nevera 4"),
        ("BEB003", "Jugo Hit 500ml", cat_bebidas, "unidad", 3500.0, 2400.0, 18.0, 6.0, 40.0, "Nevera 4"),
        ("BEB004", "Café molido 250g", cat_bebidas, "unidad", 9500.0, 7200.0, 12.0, 4.0, 30.0, "Estante B"),
        // Mecato y panadería
        ("MEC001", "Pan blandito", cat_mecato, "unidad", 500.0, 300.0, 40.0, 10.0, 80.0, "Vitrina"),
        ("MEC002", "Papas fritas bolsa", cat_mecato, "unidad", 3000.0, 2000.0, 20.0, 6.0, 40.0, "Vitrina"),
        ("MEC003", "Galletas Festival", cat_mecato, "unidad", 1800.0, 1200.0, 30.0, 8.0, 60.0, "Vitrina"),
        // Aseo y hogar
        ("ASE001", "Jabón Rey", cat_aseo, "unidad", 4500.0, 3200.0, 14.0, 4.0, 30.0, "Estante C"),
        ("ASE002", "Detergente 900g", cat_aseo, "unidad", 11500.0, 8800.0, 10.0, 3.0, 24.0, "Estante C"),
        ("ASE003", "Papel higiénico x4", cat_aseo, "unidad", 8000.0, 6000.0, 16.0, 4.0, 36.0, "Estante C"),
    ];

    let mut ids: HashMap<String, i64> = HashMap::new();
    for &(codigo, nombre, categoria_id, unidad, precio, costo, stock, minimo, maximo, ubicacion) in &productos {
        let id = db::insertar_producto(
            &tx, codigo, nombre, categoria_id, precio, Some(costo), stock, minimo, maximo, unidad, Some(ubicacion),
        )
        .map_err(|e| e.to_string())?;
        ids.insert(codigo.to_string(), id);

        if stock > 0.0 {
            insertar_movimiento(&tx, id, "entrada", stock, unidad, admin_id, "Inventario inicial")?;
        }
    }

    // 5. Clientes
    let cliente_final = insertar_cliente(
        &tx, "13", "222222222222", "Consumidor Final", "Consumidor Final",
        "No registrada", "", "", false, "No responsable de IVA",
    )?;
    let cliente_maria = insertar_cliente(
        &tx, "13", "1023456789", "María Fernanda Ruiz", "María Fernanda Ruiz",
        "Calle 20 # 8-15", "311-555-2233", "maria.ruiz@correo.com", false, "No responsable de IVA",
    )?;
    insertar_cliente(
        &tx, "31", "900456789-1", "Verdulería El Paraíso", "Verdulería El Paraíso S.A.S.",
        "Diagonal 12 # 45-10", "601-555-8899", "compras@elparaiso.co", true, "Responsable de IVA",
    )?;

    // 6. Mermas (salidas por daño/pérdida de frescos)
    for (codigo, cantidad, unidad, nota) in [
        ("FRU005", 1.5_f64, "kg", "Merma: mango sobremaduro"),
        ("VER005", 2.0_f64, "unidad", "Merma: lechuga marchita"),
        ("VER001", 1.0_f64, "kg", "Merma: tomate dañado"),
    ] {
        if let Some(&pid) = ids.get(codigo) {
            insertar_movimiento(&tx, pid, "salida", cantidad, unidad, admin_id, nota)?;
            tx.execute(
                "UPDATE productos SET stock_actual = MAX(0, stock_actual - ?1) WHERE id = ?2",
                params![cantidad, pid],
            )
            .map_err(|e| format!("Error aplicando merma: {e}"))?;
        }
    }

    // 7. Facturas de ejemplo
    let (nit, prefijo, pin, aplica_iva) = leer_config_factura(&tx)?;
    let config = ConfigFactura { nit, prefijo, pin, aplica_iva };

    // Factura 1: venta de comidas a consumidor final.
    crear_factura_demo(
        &tx, &config, cliente_final, admin_id,
        &[
            (ids["COM002"], 2.0),  // Almuerzo corriente x2
            (ids["COM004"], 2.0),  // Arepa con queso x2
            (ids["BEB001"], 1.0),  // Gaseosa 1.5L x1
        ],
    )?;

    // Factura 2: mercado de frescos y lácteos.
    crear_factura_demo(
        &tx, &config, cliente_maria, admin_id,
        &[
            (ids["TUB001"], 2.5),  // Papa pastusa 2.5 kg
            (ids["VER001"], 1.0),  // Tomate chonto 1 kg
            (ids["LAC002"], 12.0), // Huevos AA x12
            (ids["LAC001"], 1.0),  // Leche entera 1L
        ],
    )?;

    tx.commit()
        .map_err(|e| format!("No se pudo confirmar el seed inicial: {e}"))?;

    log::info!("[SEED] Datos de demostración de tienda mixta creados correctamente.");
    Ok(())
}

// ============================================================
// HELPERS DEL SEED DEMO
// ============================================================

#[cfg(feature = "demo")]
fn insertar_movimiento(
    conn: &Connection,
    producto_id: i64,
    tipo: &str,
    cantidad: f64,
    unidad_medida: &str,
    usuario_id: i64,
    nota: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO movimientos
            (producto_id, tipo, cantidad, fecha, usuario_id, nota, unidad_medida)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            producto_id,
            tipo,
            cantidad,
            db::ahora_iso8601(),
            usuario_id,
            nota,
            unidad_medida,
        ],
    )
    .map_err(|e| format!("Error registrando movimiento: {e}"))?;
    Ok(())
}

#[cfg(feature = "demo")]
#[allow(clippy::too_many_arguments)]
fn insertar_cliente(
    conn: &Connection,
    tipo_identificacion: &str,
    numero_identificacion: &str,
    nombre: &str,
    razon_social: &str,
    direccion: &str,
    telefono: &str,
    email: &str,
    responsable_iva: bool,
    regimen: &str,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO clientes
            (tipo_identificacion, numero_identificacion, nombre, razon_social, direccion,
             telefono, email, responsable_iva, regimen, creado_en)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            tipo_identificacion,
            numero_identificacion,
            nombre,
            razon_social,
            direccion,
            telefono,
            email,
            responsable_iva as i64,
            regimen,
            db::ahora_iso8601(),
        ],
    )
    .map_err(|e| format!("Error insertando cliente '{nombre}': {e}"))?;
    Ok(conn.last_insert_rowid())
}

#[cfg(feature = "demo")]
struct ConfigFactura {
    nit: String,
    prefijo: String,
    pin: String,
    aplica_iva: bool,
}

#[cfg(feature = "demo")]
fn leer_config_factura(conn: &Connection) -> Result<(String, String, String, bool), String> {
    conn.query_row(
        "SELECT nit, prefijo_factura, pin, aplica_iva FROM configuracion_empresa LIMIT 1",
        [],
        |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, i64>(3)? != 0,
            ))
        },
    )
    .map_err(|e| format!("Error leyendo la configuración de facturación: {e}"))
}

/// Crea una factura de ejemplo replicando el flujo real: calcula IVA (si aplica),
/// descuenta stock, registra el movimiento de salida y genera CUFE + QR.
#[cfg(feature = "demo")]
fn crear_factura_demo(
    conn: &Connection,
    config: &ConfigFactura,
    cliente_id: i64,
    usuario_id: i64,
    items: &[(i64, f64)],
) -> Result<i64, String> {
    let fecha_emision = db::ahora_iso8601();
    let numero_actual: i64 = conn
        .query_row("SELECT numero_actual FROM configuracion_empresa LIMIT 1", [], |r| r.get(0))
        .map_err(|e| format!("Error leyendo el consecutivo de factura: {e}"))?;
    let numero_completo = format!("{}-{}", config.prefijo, numero_actual);

    struct Linea {
        producto_id: i64,
        cantidad: f64,
        nombre: String,
        unidad: String,
        precio: Decimal,
        subtotal: Decimal,
        iva: Decimal,
        total: Decimal,
    }

    let mut lineas: Vec<Linea> = Vec::new();
    let mut calc: Vec<(Decimal, Decimal, Decimal)> = Vec::new();

    for (producto_id, cantidad) in items {
        let (nombre, unidad, precio): (String, String, f64) = conn
            .query_row(
                "SELECT nombre, unidad_medida, precio FROM productos WHERE id = ?1",
                params![producto_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| format!("Error consultando producto para la factura: {e}"))?;

        let precio_dec = fiscal::decimal_from_f64(precio);
        let cantidad_dec = fiscal::decimal_from_f64(*cantidad);
        let (subtotal, iva, total) =
            fiscal::calcular_item(cantidad_dec, precio_dec, Decimal::ZERO, config.aplica_iva);

        calc.push((cantidad_dec, precio_dec, Decimal::ZERO));
        lineas.push(Linea {
            producto_id: *producto_id,
            cantidad: *cantidad,
            nombre,
            unidad,
            precio: precio_dec,
            subtotal,
            iva,
            total,
        });
    }

    let (subtotal, descuento, iva, _) = fiscal::calcular_factura(&calc, config.aplica_iva);
    let total = subtotal + iva;
    let iva_porcentaje = if config.aplica_iva { fiscal::IVA_PORCENTAJE_F64 } else { 0.0 };

    conn.execute(
        "INSERT INTO facturas
            (prefijo, numero, numero_completo, tipo_documento, fecha_emision, fecha_vencimiento,
             cliente_id, usuario_id, subtotal, descuento, base_gravable, iva, total, iva_porcentaje,
             estado_dian, cufe, qr_code)
         VALUES (?1,?2,?3,'01',?4,NULL,?5,?6,?7,?8,?9,?10,?11,?12,'PENDIENTE','','')",
        params![
            config.prefijo,
            numero_actual,
            numero_completo,
            fecha_emision,
            cliente_id,
            usuario_id,
            fiscal::decimal_to_f64(subtotal),
            fiscal::decimal_to_f64(descuento),
            fiscal::decimal_to_f64(subtotal),
            fiscal::decimal_to_f64(iva),
            fiscal::decimal_to_f64(total),
            iva_porcentaje,
        ],
    )
    .map_err(|e| format!("Error creando factura de ejemplo: {e}"))?;
    let factura_id = conn.last_insert_rowid();

    for linea in &lineas {
        conn.execute(
            "INSERT INTO factura_items
                (factura_id, producto_id, cantidad, descripcion, unidad_medida, precio_unitario,
                 descuento, subtotal, iva, total)
             VALUES (?1,?2,?3,?4,?5,?6,0,?7,?8,?9)",
            params![
                factura_id,
                linea.producto_id,
                linea.cantidad,
                linea.nombre,
                linea.unidad,
                fiscal::decimal_to_f64(linea.precio),
                fiscal::decimal_to_f64(linea.subtotal),
                fiscal::decimal_to_f64(linea.iva),
                fiscal::decimal_to_f64(linea.total),
            ],
        )
        .map_err(|e| format!("Error creando ítem de factura de ejemplo: {e}"))?;

        conn.execute(
            "UPDATE productos SET stock_actual = MAX(0, stock_actual - ?1) WHERE id = ?2",
            params![linea.cantidad, linea.producto_id],
        )
        .map_err(|e| format!("Error descontando stock en factura de ejemplo: {e}"))?;

        insertar_movimiento(
            conn,
            linea.producto_id,
            "salida",
            linea.cantidad,
            &linea.unidad,
            usuario_id,
            &format!("Factura {numero_completo}"),
        )?;
    }

    let cliente_identificacion: String = conn
        .query_row(
            "SELECT numero_identificacion FROM clientes WHERE id = ?1",
            params![cliente_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Error consultando cliente de la factura: {e}"))?;

    let cufe = fiscal::generar_cufe(
        &numero_completo,
        &fecha_emision,
        &config.nit,
        &cliente_identificacion,
        total,
        iva,
        &config.pin,
    );
    let fecha_corta = &fecha_emision[0..10];
    let qr_data = fiscal::generar_qr_data(
        &config.nit,
        &cliente_identificacion,
        &numero_completo,
        fecha_corta,
        total,
        &cufe,
    );

    conn.execute(
        "UPDATE facturas SET cufe = ?1, qr_code = ?2 WHERE id = ?3",
        params![cufe, qr_data, factura_id],
    )
    .map_err(|e| format!("Error guardando CUFE de factura de ejemplo: {e}"))?;

    conn.execute(
        "UPDATE configuracion_empresa SET numero_actual = numero_actual + 1",
        [],
    )
    .map_err(|e| format!("Error incrementando el consecutivo de factura: {e}"))?;

    Ok(factura_id)
}

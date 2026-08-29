// src-tauri/src/fiscal.rs
// Cálculos fiscales según normativa DIAN colombiana.
// Replica fiscal_colombia.py usando rust_decimal para exactitud en dinero.
pub use rust_decimal::Decimal;
use rust_decimal::prelude::{FromPrimitive, ToPrimitive, Zero};
use sha2::{Sha384, Digest};

/// Tasa de IVA Colombia (19%).
pub const IVA_TASA_STR: &str = "0.19";
#[allow(dead_code)]
pub const IVA_PORCENTAJE_STR: &str = "19.00";

/// Redondeo a 2 decimales con ROUND_HALF_UP (como Decimal.quantize de Python).
/// rust_decimal.round() redondea al entero más cercano, con empates lejos de cero
/// (half-away-from-zero), que es exactamente ROUND_HALF_UP.
fn redondear(valor: Decimal) -> Decimal {
    let factor = Decimal::from(100u32);
    let escalado = valor * factor;
    let redondeado = escalado.round_dp(0);
    redondeado / factor
}

/// Calcula los valores de un ítem de factura. Precio unitario debe venir SIN IVA.
/// Replica CalculosFiscalesColombia.calcular_item.
pub fn calcular_item(
    cantidad: i64,
    precio_unitario: Decimal,
    descuento: Decimal,
) -> (Decimal, Decimal, Decimal) {
    // subtotal = cantidad * precio_unitario - descuento
    let mut subtotal = Decimal::from(cantidad) * precio_unitario - descuento;
    subtotal = redondear(subtotal);

    let iva = redondear(subtotal * Decimal::from_str_radix(IVA_TASA_STR, 10).unwrap());
    let total = redondear(subtotal + iva);

    (subtotal, iva, total)
}

/// Calcula los totales de la factura. Replica CalculosFiscalesColombia.calcular_factura.
/// items: lista de (cantidad, precio_unitario, descuento).
pub fn calcular_factura(items: &[(i64, Decimal, Decimal)]) -> (Decimal, Decimal, Decimal, Decimal) {
    let mut subtotal = Decimal::zero();
    let mut total_descuento = Decimal::zero();
    let mut total_iva = Decimal::zero();

    for (cantidad, precio, desc) in items {
        let (sub, iva, _total) = calcular_item(*cantidad, *precio, *desc);
        subtotal += sub;
        total_descuento += *desc;
        total_iva += iva;
    }

    subtotal = redondear(subtotal);
    total_descuento = redondear(total_descuento);
    total_iva = redondear(total_iva);
    let total = redondear(subtotal + total_iva);

    (subtotal, total_descuento, total_iva, total) // base_gravable = subtotal
}

/// Genera CUFE (SHA-384) replicando exactamente fiscal_colombia.generar_cufe.
/// Formato: numFactura|fecha(%Y-%m-%d%H:%M:%S)|total:2f|iva:2f|nit_emisor|nit_adquirente|pin|1
pub fn generar_cufe(
    numero_factura: &str,
    fecha_emision: &str,      // "YYYY-MM-DDTHH:MM:SSZ" -> se normaliza a "YYYY-MM-DDHH:MM:SS"
    nit_emisor: &str,
    nit_adquirente: &str,
    total: Decimal,
    iva: Decimal,
    software_pin: &str,
) -> String {
    // Python: fecha_emision.strftime('%Y-%m-%d%H:%M:%S') -> "YYYY-MM-DDHH:MM:SS"
    // Recibimos una fecha en texto; normalizamos quitando la T y la Z.
    let fecha = normalizar_fecha_cufe(fecha_emision);

    let datos = format!(
        "{}{}{:.2}{:.2}{}{}{}{}",
        numero_factura,
        fecha,
        total,
        iva,
        nit_emisor,
        nit_adquirente,
        software_pin,
        "1" // ambiente producción
    );

    let mut hasher = Sha384::new();
    hasher.update(datos.as_bytes());
    let result = hasher.finalize();
    result.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Convierte "2026-08-28T14:30:00Z" (o similar) a "2026-08-2814:30:00" (formato CUFE).
fn normalizar_fecha_cufe(fecha: &str) -> String {
    // Esperamos "YYYY-MM-DDTHH:MM:SSZ" o "YYYY-MM-DD HH:MM:SS"
    let fecha = fecha
        .trim()
        .replace('T', "")
        .replace('Z', "")
        .replace(' ', "");
    fecha
}

/// Genera los datos del QR escaneable. Replica generar_qr_data.
pub fn generar_qr_data(
    nit_emisor: &str,
    nit_adquirente: &str,
    numero_factura: &str,
    fecha: &str,
    total: Decimal,
    cufe: &str,
) -> String {
    format!(
        "NITEmisor={};NITAdquirente={};NumFactura={};Fecha={};Total={:.2};CUFE={}",
        nit_emisor, nit_adquirente, numero_factura, fecha, total, cufe
    )
}

// Re-export para comodidad
pub fn decimal_from_f64(v: f64) -> Decimal {
    Decimal::from_f64(v).unwrap_or_default()
}

pub fn decimal_to_f64(v: Decimal) -> f64 {
    v.to_f64().unwrap_or(0.0)
}

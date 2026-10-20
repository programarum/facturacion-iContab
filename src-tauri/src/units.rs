pub const UNIDADES_MEDIDA: &[&str] = &["unidad", "kg", "g", "l", "ml"];

pub fn es_unidad_valida(unidad_medida: &str) -> bool {
    UNIDADES_MEDIDA.contains(&unidad_medida)
}

/// Las cantidades admiten hasta tres decimales; las unidades discretas deben ser enteras.
pub fn validar_cantidad(
    cantidad: f64,
    unidad_medida: &str,
    permitir_cero: bool,
) -> Result<(), String> {
    if !es_unidad_valida(unidad_medida) {
        return Err("Selecciona una unidad de medida válida".to_string());
    }
    if !cantidad.is_finite() || cantidad < 0.0 || (!permitir_cero && cantidad == 0.0) {
        return Err(if permitir_cero {
            "La cantidad debe ser un valor válido mayor o igual a cero".to_string()
        } else {
            "La cantidad debe ser un valor válido mayor a cero".to_string()
        });
    }

    let milésimas = cantidad * 1000.0;
    if (milésimas - milésimas.round()).abs() > 0.000001 {
        return Err("La cantidad admite hasta tres decimales".to_string());
    }
    if unidad_medida == "unidad" && (cantidad - cantidad.round()).abs() > 0.000001 {
        return Err("Los productos vendidos por unidad deben tener cantidades enteras".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{es_unidad_valida, validar_cantidad};

    #[test]
    fn valida_unidades_discretas_y_cantidades_fraccionarias() {
        assert!(es_unidad_valida("kg"));
        assert!(!es_unidad_valida("caja"));
        assert!(validar_cantidad(0.75, "kg", false).is_ok());
        assert!(validar_cantidad(2.0, "unidad", false).is_ok());
        assert!(validar_cantidad(1.5, "unidad", false).is_err());
        assert!(validar_cantidad(0.0001, "kg", false).is_err());
    }
}

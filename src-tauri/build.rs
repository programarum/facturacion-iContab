use std::env;
use std::fs;

fn main() {
    // Valida que el modo del frontend (normal/demo) coincida con el feature
    // `demo` de Rust. La marca la escribe `scripts/verificar-build.mjs`.
    // En release (lo que produce instaladores) una incoherencia es un error;
    // en debug solo se avisa para no estorbar durante el desarrollo.
    let demo_rust = env::var_os("CARGO_FEATURE_DEMO").is_some();
    let marca = format!(
        "{}/../dist/.modo-build",
        env::var("CARGO_MANIFEST_DIR").unwrap_or_default()
    );

    match fs::read_to_string(&marca) {
        Ok(modo) => {
            let modo = modo.trim();
            let coherente = (modo == "demo") == demo_rust;
            if !coherente {
                let mensaje = format!(
                    "Modo incoherente: frontend '{modo}' con feature `demo` {}.\n\
                     Use `pnpm tauri:dev:demo` / `pnpm tauri:build:windows:demo` para el demo, \
                     o `pnpm tauri:dev` / `pnpm tauri:build:windows` para el build normal.",
                    if demo_rust { "activo" } else { "desactivado" }
                );
                if env::var("PROFILE").as_deref() == Ok("release") {
                    panic!("{mensaje}");
                }
                println!("cargo:warning={mensaje}");
            }
        }
        Err(_) => {
            println!(
                "cargo:warning=No se encontró dist/.modo-build; no se pudo validar la \
                 coherencia demo/normal del frontend."
            );
        }
    }
    println!("cargo:rerun-if-changed=../dist/.modo-build");

    tauri_build::build()
}

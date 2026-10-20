// Verifica que el bundle de frontend corresponda al modo compilado y deja una
// marca (`dist/.modo-build`) que `src-tauri/build.rs` usa para validar la
// coherencia con el feature `demo` de Rust antes de empaquetar.
//
// Uso: node scripts/verificar-build.mjs <demo|normal>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const modo = process.argv[2];
if (modo !== 'demo' && modo !== 'normal') {
  console.error('Uso: node scripts/verificar-build.mjs <demo|normal>');
  process.exit(1);
}

// Literales que solo existen en el código de demostración.
const FIRMAS_DEMO = ['obtener_estado_demo', 'wa.me/573216882631'];

const dist = 'dist';
const assets = join(dist, 'assets');

let contenido = '';
for (const archivo of readdirSync(assets)) {
  if (archivo.endsWith('.js')) {
    contenido += readFileSync(join(assets, archivo), 'utf8');
  }
}

const encontradas = FIRMAS_DEMO.filter((firma) => contenido.includes(firma));

if (modo === 'normal' && encontradas.length > 0) {
  console.error(
    `\n✗ BUILD NORMAL CONTAMINADO: el bundle contiene código del demo (${encontradas.join(', ')}).\n` +
      '  El instalador limpio NO debe llevar nada del demo. Revise el alias `@demo` en vite.config.js.\n',
  );
  process.exit(1);
}

if (modo === 'demo') {
  const faltantes = FIRMAS_DEMO.filter((firma) => !encontradas.includes(firma));
  if (faltantes.length > 0) {
    console.error(
      `\n✗ BUILD DEMO INCOMPLETO: faltan en el bundle (${faltantes.join(', ')}).\n` +
        '  Compile con `pnpm build:demo` o use los scripts `pnpm tauri:*:demo`.\n',
    );
    process.exit(1);
  }
}

writeFileSync(join(dist, '.modo-build'), modo, 'utf8');

console.log(
  `✓ Build ${modo.toUpperCase()} verificado: ${
    modo === 'demo' ? 'incluye' : 'no incluye'
  } código del demo.`,
);

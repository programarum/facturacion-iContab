# Guion de demostración — iContab Facturación

> Fase 4 del plan. Sirve para **mostrar y ofrecer** el producto en vivo.
> Escenario: tienda de comidas que además vende frutas, verduras y otros
> artículos (rubro *tienda mixta*). Duración sugerida: **10–12 minutos**.

---

## 0. Antes de empezar (checklist)

1. Arrancar el **build de demostración** (usa la carpeta de datos propia
   `com.icontab-facturacion.demo`, así que no toca tu base normal):
   ```bash
   pnpm tauri:dev:demo        # desarrollo
   # pnpm tauri:build:windows:demo   # instalador demo para Windows x64
   ```
   El seed solo se crea si la base de la demo está vacía. Para regenerarlo:
   ```bash
   DB=~/.local/share/com.icontab-facturacion.demo/facticontab.db
   [ -f "$DB" ] && mv "$DB" "$DB.bak-$(date +%Y%m%d%H%M)"
   ```
2. Credenciales de administrador: **`admin` / `Admin123!`**
3. Tener a mano (opcional): un Excel/CSV de ejemplo para mostrar la importación.

---

## 1. Datos del demo (para narrar mientras se muestran)

- **Negocio:** Tienda Mixta La Esquina — NIT `901234567-8`, rubro *Tienda
  mixta*, **sin IVA** (tienda de barrio colombiana).
- **Catálogo:** 41 productos en 9 categorías: Frutas, Verduras, Tubérculos,
  Comidas preparadas, Abarrotes, Lácteos y huevos, Bebidas, Mecato y
  panadería, Aseo y hogar.
- **Mezcla de venta:** frutas/verduras/tubérculos y algunos abarrotes **por
  kg**; empaquetados, bebidas y aseo **por unidad**; comidas **por porción**.
- **Clientes:** Consumidor Final, María Fernanda Ruiz y Verdulería El Paraíso.
- **Historial ya cargado:** 2 facturas (`SET-1` comidas, `SET-2` mercado) y
  movimientos de inventario inicial + 3 mermas.

---

## 2. Guion paso a paso

### Paso 0 — Entrar
- **Mostrar:** pantalla de inicio de sesión.
- **Decir:** "Todo funciona local, sin internet. Entro como administrador."
- Iniciar sesión con `admin` / `Admin123!`.

### Paso 1 — Dashboard (el panorama del negocio)
- **Mostrar:** total de productos, movimientos de hoy, **stock bajo**, **sin
  stock** y el bloque de "Facturas pagadas en los últimos 30 días".
- **Decir:** "De un vistazo veo qué falta, qué se movió y cuánto se vendió.
  Cada tarjeta es un atajo: si toco 'Stock bajo', me lleva al listado filtrado."
- Clic en la tarjeta **Stock bajo** para demostrar el atajo.

### Paso 2 — Productos (lo que diferencia a una tienda mixta)
- **Mostrar:** la tabla con la columna **Unidad** y el **Precio por unidad/kg**.
- **Señalar:** "La arveja, el tomate y la papa se venden **por kg**; la gaseosa
  y el jabón **por unidad**. El sistema respeta eso en el stock y en la venta."
- Usar el filtro de **Categoría** (p. ej. Frutas) y **Estado Stock**.
- **Frase clave:** "Un solo catálogo, pero cada artículo sabe si se vende por
  peso o por unidad."

### Paso 3 — Crear un producto (presets por rubro)
- Clic en **+ Nuevo Producto**.
- **Señalar:** la **unidad de medida arranca en `kg`** porque el rubro es
  tienda mixta/frutería (en tienda general o farmacia arranca en `unidad`).
- Llenar un ejemplo rápido (p. ej. "Mora de Castilla", kg, precio 8000,
  stock 6) y guardar.

### Paso 4 — Categorías (arrancar rápido)
- Ir a **Categorías**.
- **Mostrar:** arriba dice el **rubro actual**.
- Clic en **"Sugerir categorías del rubro"**.
- **Decir:** "Crea de una sola vez las categorías típicas de este rubro y solo
  agrega las que falten; no duplica."

### Paso 5 — Movimientos (entradas, salidas y mermas)
- Ir a **Movimientos**.
- **Mostrar:** el historial con **Entrada** (verde) y **Salida** (rojo).
- **Señalar** las mermas del seed: "Mango sobremaduro", "Lechuga marchita",
  "Tomate dañado".
- Registrar una salida de ejemplo y mostrar cómo **baja el stock**.
- **Decir:** "Las pérdidas de frescos quedan registradas y justificadas."

### Paso 6 — Facturar una venta (el corazón)
- Ir a **Facturación**.
- Buscar "papa" y agregarla; **editar la cantidad a 2.5** (kg, admite
  decimales). Agregar también un **Almuerzo corriente** (por porción).
- Seleccionar cliente y **Generar Factura**.
- **Mostrar:** el número (`SET-3`), el **CUFE** y el botón **Descargar PDF**.
- Abrir el PDF: datos de la empresa, ítems con unidad, totales, resolución y
  CUFE con QR.
- **Decir:** "Puedo vender por kilo y por unidad en la misma factura, y sale
  lista para imprimir o guardar en PDF."

### Paso 7 — Historial de facturas
- Ir a **Historial de facturas**.
- **Mostrar:** filtro por **rango de fechas**, total del periodo, y las
  facturas `SET-1` y `SET-2`.
- Clic en una fila (o "Ver ›") para abrir el **detalle** con productos
  vendidos, cantidades y **Descargar PDF**.

### Paso 8 — Importar su catálogo real (opcional)
- En **Productos**, **Importar Excel**.
- **Decir:** "Puedo cargarle su lista actual desde Excel o CSV; reviso antes de
  guardar y ajusto la unidad de los que se venden por peso."
- (Requiere un archivo a mano; si no, describirlo.)

### Paso 9 — Configuración y respaldos
- Ir a **Configuración**.
- **Mostrar:** Perfil del negocio (rubro, datos, casilla **Aplicar IVA**) y la
  sección de **Respaldo automático**.
- **Decir:** "Se puede activar el IVA si el negocio es responsable, y el sistema
  guarda copias de la base automáticamente (conserva las 30 últimas)."

### Cierre — Puesta en producción
- **Decir:** "Se instala en Windows con un instalador, funciona sin internet y
  la licencia va ligada al equipo. Puedo instalar, cargar su catálogo real y
  dejar su numeración DIAN lista."

---

## 3. Puntos de venta (argumentos)

- **Sin internet:** base de datos local; no depende de la nube ni paga hosting.
- **Facturación DIAN:** IVA, CUFE y QR; PDF listo para imprimir.
- **Inventario flexible:** por peso (kg/g) y por unidad, en un mismo catálogo.
- **Adaptado al rubro:** unidad y categorías sugeridas según el negocio.
- **Control de pérdidas:** entradas, salidas y mermas trazables por usuario.
- **Respaldos automáticos** y multi-usuario con roles (admin, moderador, cajero).
- **Rápido de adoptar:** importación desde Excel/CSV.

---

## 4. Manejo de objeciones

- *"¿Sirve para mi tienda que también vende comidas y frutas?"* → Sí: rubro
  **tienda mixta**; comidas por porción, frutas/verduras por kg.
- *"¿Necesito internet?"* → No. Todo es local; la licencia verifica offline.
- *"¿Y lo que se daña?"* → Se registra como **salida/merma** con nota.
  (Roadmap: tipo de movimiento `merma` dedicado.)
- *"¿Las comidas descuentan ingredientes?"* → Hoy se manejan con **precio fijo
  y stock de porciones**. Las **recetas** (que descuentan arroz, carne, etc.)
  están en el roadmap.
- *"¿Puedo cargar mi lista actual?"* → Sí, **Importar Excel** con vista previa.
- *"¿Y si me cambian el computador?"* → Se emite una **licencia nueva** por la
  huella del nuevo equipo; la base se restaura desde el respaldo.

---

## 5. Siguientes pasos (propuesta comercial)

1. Instalar la app en el equipo del cliente (Windows).
2. Importar su catálogo real y ajustar unidades.
3. Cargar datos de la empresa y la numeración/DIAN.
4. Activar la licencia del equipo y programar el respaldo automático.
5. Capacitación corta al personal (venta y movimientos).

---

## 6. Roadmap (mencionar solo si preguntan)

- Tipos de movimiento **`merma`** y **`ajuste`** (cuadre por conteo físico).
- **Recetas de comidas** que descuentan ingredientes al facturar.
- Conversión de empaques (bulto/saco → kg).
- Etiquetas "por kg / por unidad" más explícitas en las pantallas.

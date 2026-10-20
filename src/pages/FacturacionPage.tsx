import { useState, useEffect } from 'react';
import { productosAPI, facturacionAPI } from '../services/api';
import { generarFacturaPDF } from '../services/pdf';

interface ProductoBusqueda {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  stock_actual: number;
  unidad_medida: string;
}

interface ItemCarrito {
  producto_id: number;
  codigo: string;
  nombre: string;
  unidad_medida: string;
  precio_unitario: number;
  cantidad: number;
  subtotal: number;
  iva: number;
  total: number;
  stock_disponible: number;
}

interface Cliente {
  id: number;
  tipo_identificacion: string;
  numero_identificacion: string;
  nombre: string;
  razon_social: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
}

const FacturacionPage = () => {
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [catalogo, setCatalogo] = useState<ProductoBusqueda[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<number | ''>('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [facturaCreada, setFacturaCreada] = useState<any>(null);
  const [aplicaIva, setAplicaIva] = useState(false);

  const [formCliente, setFormCliente] = useState({
    tipo_identificacion: '13',
    numero_identificacion: '',
    nombre: '',
    razon_social: '',
    direccion: '',
    telefono: '',
    email: '',
  });

  useEffect(() => {
    cargarClientes();
    cargarCatalogo();
    facturacionAPI.configuracion.obtener()
      .then((config: any) => setAplicaIva(Boolean(config?.aplica_iva)))
      .catch(() => setAplicaIva(false));
  }, []);

  const cargarClientes = async () => {
    try {
      const data = await facturacionAPI.clientes.listar();
      setClientes(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const cargarCatalogo = async () => {
    try {
      const data = await productosAPI.listar({ limit: 1000 });
      setCatalogo(data.productos);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resultadosBusqueda = busquedaProducto.trim()
    ? catalogo.filter((p) =>
        p.nombre.toLowerCase().includes(busquedaProducto.trim().toLowerCase()) ||
        p.codigo.toLowerCase().includes(busquedaProducto.trim().toLowerCase()) ||
        (p.descripcion ?? '').toLowerCase().includes(busquedaProducto.trim().toLowerCase()))
    : catalogo;

  const agregarAlCarrito = (producto: ProductoBusqueda) => {
    if (producto.stock_actual <= 0) {
      setError('Este producto no tiene existencias disponibles');
      return;
    }
    const existente = carrito.find(item => item.producto_id === producto.id);
    if (existente) {
      const nuevaCantidad = existente.cantidad + 1;
      if (nuevaCantidad > producto.stock_actual + 0.000001) {
        setError(`Stock insuficiente. Disponible: ${formatoCantidad(producto.stock_actual)} ${etiquetaUnidad(producto.unidad_medida)}`);
        return;
      }
      const nuevosItems = carrito.map(item => {
        if (item.producto_id === producto.id) {
          const subtotal = nuevaCantidad * item.precio_unitario;
          const iva = aplicaIva ? subtotal * 0.19 : 0;
          return { ...item, cantidad: nuevaCantidad, subtotal, iva, total: subtotal + iva };
        }
        return item;
      });
      setCarrito(nuevosItems);
    } else {
      const cantidadInicial = Math.min(1, producto.stock_actual);
      const subtotal = cantidadInicial * producto.precio;
      const iva = aplicaIva ? subtotal * 0.19 : 0;
      setCarrito([...carrito, {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        unidad_medida: producto.unidad_medida,
        precio_unitario: producto.precio,
        cantidad: cantidadInicial,
        subtotal,
        iva,
        total: subtotal + iva,
        stock_disponible: producto.stock_actual,
      }]);
    }
    setBusquedaProducto('');
  };

  const eliminarDelCarrito = (productoId: number) => {
    setCarrito(carrito.filter(item => item.producto_id !== productoId));
  };

  const calcularTotales = () => {
    const subtotal = carrito.reduce((sum, item) => sum + item.subtotal, 0);
    const iva = carrito.reduce((sum, item) => sum + item.iva, 0);
    const total = subtotal + iva;
    return { subtotal, iva, total };
  };

  const handleCrearCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const nuevo = await facturacionAPI.clientes.crear(formCliente);
      setClientes([...clientes, nuevo]);
      setClienteSeleccionado(nuevo.id);
      setShowNuevoCliente(false);
      setFormCliente({ tipo_identificacion: '13', numero_identificacion: '', nombre: '', razon_social: '', direccion: '', telefono: '', email: '' });
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCrearFactura = async () => {
    if (!clienteSeleccionado) {
      setError('Selecciona un cliente');
      return;
    }
    if (carrito.length === 0) {
      setError('Agrega productos al carrito');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const factura = await facturacionAPI.facturas.crear({
        cliente_id: clienteSeleccionado as number,
        items: carrito.map(item => ({
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          precio_unitario: item.precio_unitario,
          descuento: 0,
        })),
      });
      setFacturaCreada(factura);
      setExito('Factura creada exitosamente');
      setCarrito([]);
      setClienteSeleccionado('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const descargarFactura = async () => {
    if (!facturaCreada) return;
    try {
      const empresa = await facturacionAPI.configuracion.obtener();
      generarFacturaPDF(facturaCreada, empresa);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatPrecio = (precio: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(precio);
  };

  const etiquetaUnidad = (unidad: string) => ({
    unidad: 'unidad', kg: 'kg', g: 'g', l: 'L', ml: 'ml',
  }[unidad] || unidad);
  const formatoCantidad = (cantidad: number) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(cantidad);

  const { subtotal, iva, total } = calcularTotales();

  const clientesFiltrados = busquedaCliente
    ? clientes.filter(c => c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) || c.numero_identificacion.includes(busquedaCliente))
    : clientes;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="shrink-0 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Facturacion</h1>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 shrink-0">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">x</button>
        </div>
      )}

      {exito && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 shrink-0">
          {exito}
          <button onClick={() => setExito('')} className="float-right font-bold">x</button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6 overflow-y-auto overscroll-contain">
        {/* Columna central: Catálogo (buscador arriba, lista con scroll propio abajo) */}
        <section className="flex flex-col min-h-0 bg-white rounded-lg shadow lg:w-[62%] lg:shrink-0">
          {/* Buscar productos */}
          <div className="shrink-0 p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold mb-3">Buscar Producto</h2>
            <input
              type="text"
              value={busquedaProducto}
              onChange={(e) => setBusquedaProducto(e.target.value)}
              placeholder="Filtra el catálogo por nombre o código..."
              className="w-full border rounded px-3 py-2"
            />
            <p className="text-sm text-gray-500 mt-2">
              Muestra todos los productos; mientras escribes, el listado se reduce a las coincidencias.
            </p>
          </div>

          {/* Catálogo completo, filtrado al instante mientras escribe */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="border-t border-gray-200">
              <div className="flex justify-between px-3 py-2 border-b border-gray-200">
                <h3 className="text-sm font-semibold">Productos</h3>
                <span className="text-xs text-gray-500">{resultadosBusqueda.length} de {catalogo.length}</span>
              </div>
              {resultadosBusqueda.length === 0 ? (
                <p className="text-gray-500 text-center py-6">No hay productos que coincidan.</p>
              ) : (
                <div className="divide-y">
                  {resultadosBusqueda.map((p) => (
                    <div key={p.id} className="flex justify-between items-center p-3 hover:bg-gray-50 cursor-pointer" onClick={() => agregarAlCarrito(p)}>
                      <div>
                        <p className="font-medium">{p.nombre} <span className="text-gray-500 text-sm">({p.codigo})</span></p>
                        <p className="text-sm text-gray-500">Stock: {formatoCantidad(p.stock_actual)} {etiquetaUnidad(p.unidad_medida)} | {formatPrecio(p.precio)} / {etiquetaUnidad(p.unidad_medida)}</p>
                      </div>
                      <button className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">+</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Columna derecha: Cliente, Carrito de Venta y Resumen */}
        <div className="flex flex-col min-h-0 gap-4 lg:w-[32%] lg:shrink-0 lg:ml-auto">
          {/* Seleccionar cliente */}
          <section className="bg-white rounded-lg shadow p-4 shrink-0">
            <h2 className="text-lg font-semibold mb-3">Cliente</h2>
            <input
              type="text"
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full border rounded px-3 py-2 mb-3"
            />
            <select
              value={clienteSeleccionado}
              onChange={(e) => setClienteSeleccionado(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full border rounded px-3 py-2 mb-3"
            >
              <option value="">Seleccionar cliente...</option>
              {clientesFiltrados.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} - {c.numero_identificacion}</option>
              ))}
            </select>
            <button onClick={() => setShowNuevoCliente(true)} className="w-full text-blue-600 text-sm hover:underline">+ Crear nuevo cliente</button>
          </section>

          {/* Carrito de Venta */}
          <section className="bg-white rounded-lg shadow p-4 flex-1 min-h-0 flex flex-col">
            <h2 className="text-lg font-semibold mb-3 shrink-0">Carrito de Venta</h2>
            {carrito.length === 0 ? (
              <p className="text-gray-500 text-center py-6">Busca y agrega productos</p>
            ) : (
              <div className="flex-1 min-h-0 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
                {carrito.map((item) => (
                  <div key={item.producto_id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words text-gray-900">{item.nombre}</p>
                      <p className="text-xs text-gray-500">{item.codigo}</p>
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs text-gray-600">
                          Cantidad: <span className="font-medium text-gray-900">{formatoCantidad(item.cantidad)} {etiquetaUnidad(item.unidad_medida)}</span>
                        </p>
                        {aplicaIva && <p className="text-xs text-gray-500">IVA: {formatPrecio(item.iva)}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold text-gray-900">{formatPrecio(item.total)}</span>
                      <button
                        onClick={() => eliminarDelCarrito(item.producto_id)}
                        className="text-xs font-medium text-red-500 hover:text-red-700"
                        aria-label={`Quitar ${item.nombre} del carrito`}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {carrito.length > 0 && (
              <div className="mt-4 border-t pt-4 space-y-1 text-right">
                <p className="text-sm">Subtotal: <span className="font-medium">{formatPrecio(subtotal)}</span></p>
                {aplicaIva && <p className="text-sm">IVA 19%: <span className="font-medium">{formatPrecio(iva)}</span></p>}
                <p className="text-lg font-bold">Total: {formatPrecio(total)}</p>
              </div>
            )}

            <button
              onClick={handleCrearFactura}
              disabled={loading || carrito.length === 0 || !clienteSeleccionado}
              className="w-full mt-auto bg-green-600 text-white py-3 rounded hover:bg-green-700 disabled:bg-gray-400 font-medium"
            >
              {loading ? 'Procesando...' : 'Generar Factura'}
            </button>
          </section>

          {/* Factura creada */}
          {facturaCreada && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-bold text-green-800 mb-2">Factura Generada</h3>
              <p className="text-sm">Numero: <span className="font-medium">{facturaCreada.numero_completo}</span></p>
              <p className="text-sm">Total: <span className="font-medium">{formatPrecio(facturaCreada.total)}</span></p>
              <p className="text-sm">CUFE: <span className="text-xs break-all">{facturaCreada.cufe}</span></p>
              <button
                onClick={descargarFactura}
                className="mt-3 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 text-sm font-medium"
              >
                Descargar PDF
              </button>
              <button onClick={() => setFacturaCreada(null)} className="mt-2 text-sm text-green-700 hover:underline">Cerrar</button>
            </div>
          )}
        </div>
      </div>

      {/* Modal nuevo cliente */}
      {showNuevoCliente && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-5">
          <div className="mx-auto my-2 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 sm:my-4 sm:p-6">
            <h2 className="text-xl font-bold mb-4">Nuevo Cliente</h2>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
                <button onClick={() => setError('')} className="float-right font-bold">x</button>
              </div>
            )}
            <form onSubmit={handleCrearCliente} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Tipo ID *</label>
                <select value={formCliente.tipo_identificacion} onChange={(e) => setFormCliente({ ...formCliente, tipo_identificacion: e.target.value })} className="w-full border rounded px-3 py-2">
                  <option value="13">Cedula Ciudadania</option>
                  <option value="31">NIT</option>
                  <option value="22">Cedula Extranjeria</option>
                  <option value="12">Tarjeta Identidad</option>
                  <option value="41">Pasaporte</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Numero ID *</label>
                <input type="text" value={formCliente.numero_identificacion} onChange={(e) => setFormCliente({ ...formCliente, numero_identificacion: e.target.value })} className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nombre *</label>
                <input type="text" value={formCliente.nombre} onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })} className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Razon Social</label>
                <input type="text" value={formCliente.razon_social} onChange={(e) => setFormCliente({ ...formCliente, razon_social: e.target.value })} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Direccion</label>
                <input type="text" value={formCliente.direccion} onChange={(e) => setFormCliente({ ...formCliente, direccion: e.target.value })} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Telefono</label>
                  <input type="text" value={formCliente.telefono} onChange={(e) => setFormCliente({ ...formCliente, telefono: e.target.value })} className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input type="email" value={formCliente.email} onChange={(e) => setFormCliente({ ...formCliente, email: e.target.value })} className="w-full border rounded px-3 py-2" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowNuevoCliente(false)} className="px-4 py-2 border rounded hover:bg-gray-100">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default FacturacionPage;

import { useState, useEffect } from 'react';
import { productosAPI, facturacionAPI } from '../services/api';

interface ProductoBusqueda {
  id: number;
  codigo: string;
  nombre: string;
  precio: number;
  stock_actual: number;
}

interface ItemCarrito {
  producto_id: number;
  codigo: string;
  nombre: string;
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
  const [resultadosBusqueda, setResultadosBusqueda] = useState<ProductoBusqueda[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<number | ''>('');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [showNuevoCliente, setShowNuevoCliente] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [facturaCreada, setFacturaCreada] = useState<any>(null);

  const [formCliente, setFormCliente] = useState({
    tipo_identificacion: 'CC',
    numero_identificacion: '',
    nombre: '',
    razon_social: '',
    direccion: '',
    telefono: '',
    email: '',
  });

  useEffect(() => {
    cargarClientes();
  }, []);

  const cargarClientes = async () => {
    try {
      const data = await facturacionAPI.clientes.listar();
      setClientes(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const buscarProductos = async () => {
    if (busquedaProducto.length < 2) return;
    try {
      const data = await productosAPI.buscar(busquedaProducto);
      setResultadosBusqueda(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const agregarAlCarrito = (producto: ProductoBusqueda) => {
    const existente = carrito.find(item => item.producto_id === producto.id);
    if (existente) {
      if (existente.cantidad >= producto.stock_actual) {
        setError('Stock insuficiente');
        return;
      }
      const nuevosItems = carrito.map(item => {
        if (item.producto_id === producto.id) {
          const nuevaCantidad = item.cantidad + 1;
          const subtotal = nuevaCantidad * item.precio_unitario;
          const iva = subtotal * 0.19;
          return { ...item, cantidad: nuevaCantidad, subtotal, iva, total: subtotal + iva };
        }
        return item;
      });
      setCarrito(nuevosItems);
    } else {
      const subtotal = producto.precio;
      const iva = subtotal * 0.19;
      setCarrito([...carrito, {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        precio_unitario: producto.precio,
        cantidad: 1,
        subtotal,
        iva,
        total: subtotal + iva,
        stock_disponible: producto.stock_actual,
      }]);
    }
    setResultadosBusqueda([]);
    setBusquedaProducto('');
  };

  const actualizarCantidad = (productoId: number, nuevaCantidad: number) => {
    if (nuevaCantidad <= 0) {
      setCarrito(carrito.filter(item => item.producto_id !== productoId));
      return;
    }
    const item = carrito.find(i => i.producto_id === productoId);
    if (item && nuevaCantidad > item.stock_disponible) {
      setError(`Stock insuficiente. Disponible: ${item.stock_disponible}`);
      return;
    }
    const nuevosItems = carrito.map(item => {
      if (item.producto_id === productoId) {
        const subtotal = nuevaCantidad * item.precio_unitario;
        const iva = subtotal * 0.19;
        return { ...item, cantidad: nuevaCantidad, subtotal, iva, total: subtotal + iva };
      }
      return item;
    });
    setCarrito(nuevosItems);
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
      setFormCliente({ tipo_identificacion: 'CC', numero_identificacion: '', nombre: '', razon_social: '', direccion: '', telefono: '', email: '' });
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

  const formatPrecio = (precio: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(precio);
  };

  const { subtotal, iva, total } = calcularTotales();

  const clientesFiltrados = busquedaCliente
    ? clientes.filter(c => c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) || c.numero_identificacion.includes(busquedaCliente))
    : clientes;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Facturacion</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">x</button>
        </div>
      )}

      {exito && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {exito}
          <button onClick={() => setExito('')} className="float-right font-bold">x</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: Buscar productos y carrito */}
        <div className="lg:col-span-2 space-y-6">
          {/* Buscar productos */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Buscar Producto</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={busquedaProducto}
                onChange={(e) => setBusquedaProducto(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && buscarProductos()}
                placeholder="Buscar por nombre o codigo..."
                className="flex-1 border rounded px-3 py-2"
              />
              <button onClick={buscarProductos} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Buscar</button>
            </div>

            {resultadosBusqueda.length > 0 && (
              <div className="mt-3 border rounded divide-y max-h-48 overflow-y-auto">
                {resultadosBusqueda.map((p) => (
                  <div key={p.id} className="flex justify-between items-center p-3 hover:bg-gray-50 cursor-pointer" onClick={() => agregarAlCarrito(p)}>
                    <div>
                      <p className="font-medium">{p.nombre} <span className="text-gray-500 text-sm">({p.codigo})</span></p>
                      <p className="text-sm text-gray-500">Stock: {p.stock_actual} | {formatPrecio(p.precio)}</p>
                    </div>
                    <button className="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">+</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Carrito */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Carrito de Venta</h2>
            {carrito.length === 0 ? (
              <p className="text-gray-500 text-center py-6">Busca y agrega productos</p>
            ) : (
              <div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-sm text-gray-500">
                      <th className="text-left py-2">Producto</th>
                      <th className="text-center py-2">Precio</th>
                      <th className="text-center py-2">Cant.</th>
                      <th className="text-center py-2">Subtotal</th>
                      <th className="text-center py-2">IVA</th>
                      <th className="text-center py-2">Total</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {carrito.map((item) => (
                      <tr key={item.producto_id} className="border-b">
                        <td className="py-3">
                          <p className="font-medium text-sm">{item.nombre}</p>
                          <p className="text-xs text-gray-500">{item.codigo}</p>
                        </td>
                        <td className="text-center text-sm">{formatPrecio(item.precio_unitario)}</td>
                        <td className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => actualizarCantidad(item.producto_id, item.cantidad - 1)} className="w-6 h-6 bg-gray-200 rounded text-sm">-</button>
                            <span className="w-8 text-center text-sm">{item.cantidad}</span>
                            <button onClick={() => actualizarCantidad(item.producto_id, item.cantidad + 1)} className="w-6 h-6 bg-gray-200 rounded text-sm">+</button>
                          </div>
                        </td>
                        <td className="text-center text-sm">{formatPrecio(item.subtotal)}</td>
                        <td className="text-center text-sm">{formatPrecio(item.iva)}</td>
                        <td className="text-center text-sm font-medium">{formatPrecio(item.total)}</td>
                        <td className="text-center">
                          <button onClick={() => eliminarDelCarrito(item.producto_id)} className="text-red-500 hover:text-red-700 text-sm">x</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 border-t pt-4 space-y-1 text-right">
                  <p className="text-sm">Subtotal: <span className="font-medium">{formatPrecio(subtotal)}</span></p>
                  <p className="text-sm">IVA 19%: <span className="font-medium">{formatPrecio(iva)}</span></p>
                  <p className="text-lg font-bold">Total: {formatPrecio(total)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: Cliente y facturar */}
        <div className="space-y-6">
          {/* Seleccionar cliente */}
          <div className="bg-white rounded-lg shadow p-4">
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
          </div>

          {/* Resumen */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-3">Resumen</h2>
            <div className="space-y-2 text-sm">
              <p>Productos en carrito: <span className="font-medium">{carrito.length}</span></p>
              <p>Cantidad total: <span className="font-medium">{carrito.reduce((sum, item) => sum + item.cantidad, 0)}</span></p>
              <p className="text-lg font-bold border-t pt-2 mt-2">Total: {formatPrecio(total)}</p>
            </div>
            <button
              onClick={handleCrearFactura}
              disabled={loading || carrito.length === 0 || !clienteSeleccionado}
              className="w-full mt-4 bg-green-600 text-white py-3 rounded hover:bg-green-700 disabled:bg-gray-400 font-medium"
            >
              {loading ? 'Procesando...' : 'Generar Factura'}
            </button>
          </div>

          {/* Factura creada */}
          {facturaCreada && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="font-bold text-green-800 mb-2">Factura Generada</h3>
              <p className="text-sm">Numero: <span className="font-medium">{facturaCreada.numero_completo}</span></p>
              <p className="text-sm">Total: <span className="font-medium">{formatPrecio(facturaCreada.total)}</span></p>
              <p className="text-sm">CUFE: <span className="text-xs break-all">{facturaCreada.cufe}</span></p>
              <button onClick={() => setFacturaCreada(null)} className="mt-2 text-sm text-green-700 hover:underline">Cerrar</button>
            </div>
          )}
        </div>
      </div>

      {/* Modal nuevo cliente */}
      {showNuevoCliente && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Nuevo Cliente</h2>
            <form onSubmit={handleCrearCliente} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Tipo ID *</label>
                <select value={formCliente.tipo_identificacion} onChange={(e) => setFormCliente({ ...formCliente, tipo_identificacion: e.target.value })} className="w-full border rounded px-3 py-2">
                  <option value="CC">Cedula Ciudadania</option>
                  <option value="NIT">NIT</option>
                  <option value="CE">Cedula Extranjeria</option>
                  <option value="TI">Tarjeta Identidad</option>
                  <option value="PA">Pasaporte</option>
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

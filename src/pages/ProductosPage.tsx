import { useState, useEffect } from 'react';
import { productosAPI, categoriasAPI } from '../services/api';

interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria_id: number;
  categoria_nombre: string | null;
  precio: number;
  stock_actual: number;
  stock_minimo: number;
  stock_maximo: number;
  estado_stock: string;
}

interface Categoria {
  id: number;
  nombre: string;
  descripcion: string | null;
}

const ProductosPage = () => {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<number | ''>('');
  const [filtroStock, setFiltroStock] = useState<'todos' | 'bajo' | 'sin_stock'>('todos');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);

  const [form, setForm] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    categoria_id: '',
    precio: '',
    stock_actual: '',
    stock_minimo: '5',
    stock_maximo: '100',
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [prods, cats] = await Promise.all([
        productosAPI.listar(),
        categoriasAPI.listar(),
      ]);
      setProductos(prods);
      setCategorias(cats);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBuscar = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (busqueda) params.busqueda = busqueda;
      if (filtroCategoria) params.categoria_id = filtroCategoria;
      if (filtroStock === 'bajo') params.stock_bajo = true;
      if (filtroStock === 'sin_stock') params.sin_stock = true;

      const prods = await productosAPI.listar(params);
      setProductos(prods);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const datos = {
        codigo: form.codigo,
        nombre: form.nombre,
        descripcion: form.descripcion || undefined,
        categoria_id: parseInt(form.categoria_id),
        precio: parseFloat(form.precio),
        stock_actual: parseInt(form.stock_actual),
        stock_minimo: parseInt(form.stock_minimo),
        stock_maximo: parseInt(form.stock_maximo),
      };

      if (editando) {
        await productosAPI.actualizar(editando.id, datos);
      } else {
        await productosAPI.crear(datos);
      }

      setShowModal(false);
      setEditando(null);
      resetForm();
      cargarDatos();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('Estas seguro de eliminar este producto?')) return;
    try {
      await productosAPI.eliminar(id);
      cargarDatos();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const abrirEditar = (producto: Producto) => {
    setEditando(producto);
    setForm({
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      categoria_id: producto.categoria_id.toString(),
      precio: producto.precio.toString(),
      stock_actual: producto.stock_actual.toString(),
      stock_minimo: producto.stock_minimo.toString(),
      stock_maximo: producto.stock_maximo.toString(),
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setForm({
      codigo: '',
      nombre: '',
      descripcion: '',
      categoria_id: '',
      precio: '',
      stock_actual: '',
      stock_minimo: '5',
      stock_maximo: '100',
    });
  };

  const getStockColor = (estado: string) => {
    switch (estado) {
      case 'sin_stock': return 'bg-red-100 text-red-800';
      case 'bajo': return 'bg-yellow-100 text-yellow-800';
      case 'exceso': return 'bg-purple-100 text-purple-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  const getStockLabel = (estado: string) => {
    switch (estado) {
      case 'sin_stock': return 'Sin Stock';
      case 'bajo': return 'Stock Bajo';
      case 'exceso': return 'Exceso';
      default: return 'Normal';
    }
  };

  const formatPrecio = (precio: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(precio);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
        <button
          onClick={() => { resetForm(); setEditando(null); setShowModal(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Nuevo Producto
        </button>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Buscar</label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o codigo..."
              className="w-full border rounded px-3 py-2"
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Categoria</label>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Todas</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Estado Stock</label>
            <select
              value={filtroStock}
              onChange={(e) => setFiltroStock(e.target.value as any)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="todos">Todos</option>
              <option value="bajo">Stock Bajo</option>
              <option value="sin_stock">Sin Stock</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleBuscar}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 w-full"
            >
              Filtrar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">x</button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Codigo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Precio</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">Cargando...</td>
                </tr>
              ) : productos.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">No hay productos</td>
                </tr>
              ) : (
                productos.map((producto) => (
                  <tr key={producto.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{producto.codigo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{producto.nombre}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{producto.categoria_nombre || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatPrecio(producto.precio)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{producto.stock_actual}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStockColor(producto.estado_stock)}`}>
                        {getStockLabel(producto.estado_stock)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <button onClick={() => abrirEditar(producto)} className="text-blue-600 hover:text-blue-900 mr-3">Editar</button>
                      <button onClick={() => handleEliminar(producto.id)} className="text-red-600 hover:text-red-900">Eliminar</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{editando ? 'Editar Producto' : 'Nuevo Producto'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Codigo *</label>
                <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="w-full border rounded px-3 py-2" required disabled={!!editando} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nombre *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descripcion</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full border rounded px-3 py-2" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Categoria *</label>
                <select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} className="w-full border rounded px-3 py-2" required>
                  <option value="">Seleccionar...</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Precio *</label>
                  <input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} className="w-full border rounded px-3 py-2" required min="0" step="100" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Actual *</label>
                  <input type="number" value={form.stock_actual} onChange={(e) => setForm({ ...form, stock_actual: e.target.value })} className="w-full border rounded px-3 py-2" required min="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Minimo</label>
                  <input type="number" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} className="w-full border rounded px-3 py-2" min="0" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Maximo</label>
                  <input type="number" value={form.stock_maximo} onChange={(e) => setForm({ ...form, stock_maximo: e.target.value })} className="w-full border rounded px-3 py-2" min="0" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => { setShowModal(false); setEditando(null); }} className="px-4 py-2 border rounded hover:bg-gray-100">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {editando ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductosPage;

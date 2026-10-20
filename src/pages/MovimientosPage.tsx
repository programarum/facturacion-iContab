import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { movimientosAPI, productosAPI } from '../services/api';

const MOVIMIENTOS_POR_PAGINA = 25;

interface Movimiento {
  id: number;
  producto_id: number;
  producto_nombre: string;
  producto_codigo: string;
  tipo: string;
  cantidad: number;
  unidad_medida: string;
  fecha: string;
  usuario_username: string;
  nota: string | null;
}

const MovimientosPage = () => {
  const [searchParams] = useSearchParams();
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');
  const [filtroHoy, setFiltroHoy] = useState(() => searchParams.get('hoy') === '1');
  const [pagina, setPagina] = useState(1);
  const [totalMovimientos, setTotalMovimientos] = useState(0);
  const [productos, setProductos] = useState<any[]>([]);
  const [productoId, setProductoId] = useState('');
  const [tipoNuevo, setTipoNuevo] = useState<'entrada' | 'salida'>('entrada');
  const [cantidadNueva, setCantidadNueva] = useState('');
  const [notaNueva, setNotaNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    cargarMovimientos(undefined, filtroHoy, 1);
    productosAPI.listar({ limit: 1000 })
      .then((data) => setProductos(data.productos))
      .catch((err) => setError(err.message));
  }, []);

  const registrarMovimiento = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!productoId) return;
    try {
      setGuardando(true);
      setError('');
      setMensaje('');
      await movimientosAPI.crear({
        producto_id: Number(productoId),
        tipo: tipoNuevo,
        cantidad: Number(cantidadNueva),
        nota: notaNueva.trim() || undefined,
      });
      setCantidadNueva('');
      setNotaNueva('');
      setMensaje('Movimiento registrado y stock actualizado.');
      await cargarMovimientos(filtroTipo || undefined, filtroHoy, 1);
      const actualizados = await productosAPI.listar({ limit: 1000 });
      setProductos(actualizados.productos);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const cargarMovimientos = async (tipo?: string, hoy = filtroHoy, paginaSolicitada = 1) => {
    try {
      setLoading(true);
      const params: any = {
        skip: (paginaSolicitada - 1) * MOVIMIENTOS_POR_PAGINA,
        limit: MOVIMIENTOS_POR_PAGINA,
      };
      if (tipo) params.tipo = tipo;
      if (hoy) params.hoy = true;
      const data = await movimientosAPI.listar(params);
      setMovimientos(data.movimientos);
      setTotalMovimientos(data.total);
      setPagina(paginaSolicitada);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFiltrar = () => {
    cargarMovimientos(filtroTipo || undefined, filtroHoy, 1);
  };

  const cambiarPagina = (paginaNueva: number) => {
    const paginas = Math.max(1, Math.ceil(totalMovimientos / MOVIMIENTOS_POR_PAGINA));
    if (paginaNueva < 1 || paginaNueva > paginas) return;
    void cargarMovimientos(filtroTipo || undefined, filtroHoy, paginaNueva);
  };

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-CO');
  };
  const productoSeleccionado = productos.find((producto) => producto.id === Number(productoId));
  const cantidadStep = productoSeleccionado?.unidad_medida === 'unidad' ? '1' : '0.001';
  const etiquetaUnidad = (unidad: string) => ({
    unidad: 'unidad', kg: 'kg', g: 'g', l: 'L', ml: 'ml',
  }[unidad] || unidad);
  const formatoCantidad = (cantidad: number) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(cantidad);
  const totalPaginas = Math.max(1, Math.ceil(totalMovimientos / MOVIMIENTOS_POR_PAGINA));
  const inicioRango = totalMovimientos === 0 ? 0 : (pagina - 1) * MOVIMIENTOS_POR_PAGINA + 1;
  const finRango = Math.min(pagina * MOVIMIENTOS_POR_PAGINA, totalMovimientos);

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Movimientos</h1>
      </div>

      <form onSubmit={registrarMovimiento} className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4">Registrar movimiento de inventario</h2>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="block text-sm font-medium mb-1">Producto *</label>
            <select
              value={productoId}
              onChange={(event) => setProductoId(event.target.value)}
              className="w-full border rounded px-3 py-2"
              required
            >
              <option value="">Seleccionar producto…</option>
              {productos.map((producto) => (
                <option key={producto.id} value={producto.id}>
                  {producto.nombre} — stock {formatoCantidad(producto.stock_actual)} {etiquetaUnidad(producto.unidad_medida)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tipo *</label>
            <select value={tipoNuevo} onChange={(event) => setTipoNuevo(event.target.value as 'entrada' | 'salida')} className="w-full border rounded px-3 py-2">
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Cantidad{productoSeleccionado ? ` (${etiquetaUnidad(productoSeleccionado.unidad_medida)})` : ''} *
            </label>
            <input
              type="number"
              value={cantidadNueva}
              onChange={(event) => setCantidadNueva(event.target.value)}
              className="w-full border rounded px-3 py-2"
              min="0"
              step={cantidadStep}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Nota</label>
            <input value={notaNueva} onChange={(event) => setNotaNueva(event.target.value)} className="w-full border rounded px-3 py-2" maxLength={250} placeholder="Opcional" />
          </div>
        </div>
        <button type="submit" disabled={guardando || productos.length === 0} className="mt-4 rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Registrar movimiento'}
        </button>
      </form>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Tipo</label>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="border rounded px-3 py-2">
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Periodo</label>
            <select value={filtroHoy ? 'hoy' : 'todos'} onChange={(event) => setFiltroHoy(event.target.value === 'hoy')} className="border rounded px-3 py-2">
              <option value="todos">Todos</option>
              <option value="hoy">Hoy</option>
            </select>
          </div>
          <button onClick={handleFiltrar} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">Filtrar</button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">x</button>
        </div>
      )}
      {mensaje && <div role="status" className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded mb-4">{mensaje}</div>}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-[720px] divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Codigo</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Cantidad</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nota</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-4 text-center text-gray-500">Cargando...</td></tr>
            ) : movimientos.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-4 text-center text-gray-500">No hay movimientos</td></tr>
            ) : (
              movimientos.map((mov) => (
                <tr key={mov.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatFecha(mov.fecha)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{mov.producto_nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{mov.producto_codigo}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${mov.tipo === 'entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {mov.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{formatoCantidad(mov.cantidad)} {etiquetaUnidad(mov.unidad_medida)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{mov.usuario_username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{mov.nota || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-4 py-3 shadow-sm">
        <p className="text-sm text-gray-600">Mostrando {inicioRango}–{finRango} de {totalMovimientos} movimientos</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => cambiarPagina(pagina - 1)} disabled={pagina <= 1 || loading} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40">Anterior</button>
          <span className="min-w-24 text-center text-sm">Página {pagina} de {totalPaginas}</span>
          <button type="button" onClick={() => cambiarPagina(pagina + 1)} disabled={pagina >= totalPaginas || loading} className="rounded border px-3 py-1.5 text-sm disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </div>
  );
};

export default MovimientosPage;

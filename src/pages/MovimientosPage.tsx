import { useState, useEffect } from 'react';
import { movimientosAPI } from '../services/api';

interface Movimiento {
  id: number;
  producto_id: number;
  producto_nombre: string;
  producto_codigo: string;
  tipo: string;
  cantidad: number;
  fecha: string;
  usuario_username: string;
  nota: string | null;
}

const MovimientosPage = () => {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('');

  useEffect(() => {
    cargarMovimientos();
  }, []);

  const cargarMovimientos = async (tipo?: string) => {
    try {
      setLoading(true);
      const params: any = { limit: 200 };
      if (tipo) params.tipo = tipo;
      const data = await movimientosAPI.listar(params);
      setMovimientos(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFiltrar = () => {
    cargarMovimientos(filtroTipo || undefined);
  };

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-CO');
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Movimientos</h1>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Tipo</label>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="border rounded px-3 py-2">
              <option value="">Todos</option>
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
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

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{mov.cantidad}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{mov.usuario_username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{mov.nota || '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MovimientosPage;

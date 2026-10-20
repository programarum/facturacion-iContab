import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../services/api';

interface DashboardStats {
  total_productos: number;
  sin_stock: number;
  stock_bajo: number;
  movimientos_hoy: number;
  facturas_ultimo_mes: number;
  ventas_ultimo_mes: number;
}

const DashboardPage = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    cargarStats();
  }, []);

  const cargarStats = async () => {
    try {
      setLoading(true);
      const data = await dashboardAPI.stats();
      setStats(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="mb-6 rounded-lg bg-white p-4 shadow sm:p-6">
        <h2 className="text-lg font-semibold text-gray-800">Bienvenido, {user?.username}</h2>
        <p className="text-gray-500 capitalize">Rol: {user?.rol}</p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">x</button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Cargando estadisticas...</p>
      ) : stats ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/productos"
            aria-label={`Ver todos los productos: ${stats.total_productos}`}
            className="rounded-lg bg-white p-4 shadow transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 sm:p-6"
          >
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <span className="text-2xl">📦</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Total Productos</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_productos}</p>
              </div>
            </div>
          </Link>

          <Link
            to="/movimientos?hoy=1"
            aria-label={`Ver movimientos de hoy: ${stats.movimientos_hoy}`}
            className="rounded-lg bg-white p-4 shadow transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 sm:p-6"
          >
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full">
                <span className="text-2xl">🔄</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Movimientos Hoy</p>
                <p className="text-2xl font-bold text-gray-900">{stats.movimientos_hoy}</p>
              </div>
            </div>
          </Link>

          <Link
            to="/productos?stock=bajo"
            aria-label={`Ver productos con stock bajo: ${stats.stock_bajo}`}
            className="rounded-lg bg-white p-4 shadow transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-500 sm:p-6"
          >
            <div className="flex items-center">
              <div className="p-3 bg-yellow-100 rounded-full">
                <span className="text-2xl">⚠️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Stock Bajo</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.stock_bajo}</p>
              </div>
            </div>
          </Link>

          <Link
            to="/productos?stock=sin_stock"
            aria-label={`Ver productos sin stock: ${stats.sin_stock}`}
            className="rounded-lg bg-white p-4 shadow transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 sm:p-6"
          >
            <div className="flex items-center">
              <div className="p-3 bg-red-100 rounded-full">
                <span className="text-2xl">🚫</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Sin Stock</p>
                <p className="text-2xl font-bold text-red-600">{stats.sin_stock}</p>
              </div>
            </div>
          </Link>
        </div>
      ) : (
        <p className="text-gray-500">No hay estadisticas disponibles</p>
      )}

      {!loading && stats && (
        <Link
          to="/historial-facturas"
          className="mt-6 flex flex-col gap-4 rounded-lg border border-blue-100 bg-white p-6 shadow transition hover:border-blue-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-blue-100 p-3 text-2xl">🧾</div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Facturas pagadas en los últimos 30 días</h2>
              <p className="text-sm text-gray-500">Ver el historial y buscar por fecha</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-6 sm:justify-end">
            <div className="text-right">
              <p className="text-sm text-gray-500">{stats.facturas_ultimo_mes} facturas</p>
              <p className="font-semibold text-gray-900">
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(stats.ventas_ultimo_mes)}
              </p>
            </div>
            <span className="text-xl text-blue-600" aria-hidden="true">→</span>
          </div>
        </Link>
      )}
    </div>
  );
};

export default DashboardPage;

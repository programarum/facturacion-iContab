import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../services/api';

interface DashboardStats {
  total_productos: number;
  sin_stock: number;
  stock_bajo: number;
  movimientos_hoy: number;
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
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
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
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <span className="text-2xl">📦</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Total Productos</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_productos}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-green-100 rounded-full">
                <span className="text-2xl">🔄</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Movimientos Hoy</p>
                <p className="text-2xl font-bold text-gray-900">{stats.movimientos_hoy}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-yellow-100 rounded-full">
                <span className="text-2xl">⚠️</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Stock Bajo</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.stock_bajo}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 bg-red-100 rounded-full">
                <span className="text-2xl">🚫</span>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Sin Stock</p>
                <p className="text-2xl font-bold text-red-600">{stats.sin_stock}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-gray-500">No hay estadisticas disponibles</p>
      )}
    </div>
  );
};

export default DashboardPage;

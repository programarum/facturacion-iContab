import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { checkBackendHealth, startBackendViaTauri } from './services/auth';
import Login from './components/Login';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import ProductosPage from './pages/ProductosPage';
import CategoriasPage from './pages/CategoriasPage';
import MovimientosPage from './pages/MovimientosPage';
import FacturacionPage from './pages/FacturacionPage';
import UsuariosPage from './pages/UsuariosPage';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Verificando sesion...</p>
        </div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
};

const BackendGuard = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<'checking' | 'starting' | 'ready' | 'error'>('checking');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const init = async () => {
      // 1. Verificar si el backend ya esta corriendo
      const healthy = await checkBackendHealth();
      if (healthy) {
        setStatus('ready');
        return;
      }

      // 2. Intentar iniciar via Tauri
      setStatus('starting');
      const started = await startBackendViaTauri();
      if (started) {
        setStatus('ready');
        return;
      }

      // 3. Error
      setStatus('error');
    };

    init();
  }, [retryCount]);

  if (status === 'checking' || status === 'starting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center bg-white p-8 rounded-lg shadow-md">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            {status === 'checking' ? 'Verificando servidor...' : 'Iniciando servidor...'}
          </h2>
          <p className="text-gray-500 text-sm">Esto puede tardar unos segundos</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center bg-white p-8 rounded-lg shadow-md max-w-md">
          <div className="text-red-500 text-5xl mb-4">!</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Error de conexion</h2>
          <p className="text-gray-500 text-sm mb-4">
            No se pudo conectar con el servidor backend. 
            Asegurese de que el servicio este instalado correctamente.
          </p>
          <button
            onClick={() => { setStatus('checking'); setRetryCount(c => c + 1); }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

function App() {
  return (
    <BackendGuard>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<PrivateRoute><MainLayout><DashboardPage /></MainLayout></PrivateRoute>} />
          <Route path="/productos" element={<PrivateRoute><MainLayout><ProductosPage /></MainLayout></PrivateRoute>} />
          <Route path="/categorias" element={<PrivateRoute><MainLayout><CategoriasPage /></MainLayout></PrivateRoute>} />
          <Route path="/movimientos" element={<PrivateRoute><MainLayout><MovimientosPage /></MainLayout></PrivateRoute>} />
          <Route path="/facturacion" element={<PrivateRoute><MainLayout><FacturacionPage /></MainLayout></PrivateRoute>} />
          <Route path="/usuarios" element={<PrivateRoute><MainLayout><UsuariosPage /></MainLayout></PrivateRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </BackendGuard>
  );
}

export default App;

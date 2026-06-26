import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
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
  );
}

export default App;

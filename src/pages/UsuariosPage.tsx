import { useState, useEffect } from 'react';
import { usuariosAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Usuario {
  id: number;
  username: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
  bloqueado: boolean;
  ultimo_acceso: string | null;
  creado_en: string;
}

const UsuariosPage = () => {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    nombre: '',
    rol: 'usuario',
  });

  useEffect(() => {
    if (user?.rol === 'admin') {
      cargarUsuarios();
    }
  }, [user]);

  const cargarUsuarios = async () => {
    try {
      setLoading(true);
      const data = await usuariosAPI.listar();
      setUsuarios(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await usuariosAPI.crear(form);
      setShowModal(false);
      setForm({ username: '', email: '', password: '', nombre: '', rol: 'usuario' });
      cargarUsuarios();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleBloqueo = async (usuario: Usuario) => {
    try {
      await usuariosAPI.actualizar(usuario.id, { bloqueado: !usuario.bloqueado });
      cargarUsuarios();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return 'Nunca';
    return new Date(fecha).toLocaleString('es-CO');
  };

  const getRolColor = (rol: string) => {
    switch (rol) {
      case 'admin': return 'bg-purple-100 text-purple-800';
      case 'moderador': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (user?.rol !== 'admin') {
    return (
      <div className="text-center py-10">
        <p className="text-red-600 text-lg">No tienes permiso para ver esta pagina</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <button
          onClick={() => { setForm({ username: '', email: '', password: '', nombre: '', rol: 'usuario' }); setShowModal(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Nuevo Usuario
        </button>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rol</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ultimo Acceso</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-4 text-center text-gray-500">Cargando...</td></tr>
            ) : (
              usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{u.nombre}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRolColor(u.rol)}`}>{u.rol}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${u.bloqueado ? 'bg-red-100 text-red-800' : u.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {u.bloqueado ? 'Bloqueado' : u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatFecha(u.ultimo_acceso)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                    <button onClick={() => handleToggleBloqueo(u)} className={`${u.bloqueado ? 'text-green-600 hover:text-green-900' : 'text-red-600 hover:text-red-900'}`}>
                      {u.bloqueado ? 'Desbloquear' : 'Bloquear'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Nuevo Usuario</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Username *</label>
                <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full border rounded px-3 py-2" required minLength={3} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nombre *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password *</label>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full border rounded px-3 py-2" required minLength={8} />
                <p className="text-xs text-gray-500 mt-1">Minimo 8 caracteres, mayuscula, minuscula, numero y caracter especial</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Rol</label>
                <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} className="w-full border rounded px-3 py-2">
                  <option value="usuario">Usuario</option>
                  <option value="moderador">Moderador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border rounded hover:bg-gray-100">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Crear Usuario</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsuariosPage;

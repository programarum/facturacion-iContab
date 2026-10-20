import { useState, useEffect } from "react";
import { usuariosAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";

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
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [usuarioPassword, setUsuarioPassword] = useState<Usuario | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [confirmarPassword, setConfirmarPassword] = useState("");
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    nombre: "",
    rol: "usuario",
    activo: true,
  });

  useEffect(() => {
    if (user?.rol === "admin") {
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
      if (editando) {
        await usuariosAPI.actualizar(editando.id, {
          nombre: form.nombre,
          email: form.email,
          rol: form.rol,
          activo: form.activo,
        });
      } else {
        await usuariosAPI.crear({
          username: form.username,
          email: form.email,
          password: form.password,
          nombre: form.nombre,
          rol: form.rol,
        });
      }
      setShowModal(false);
      setEditando(null);
      setForm({
        username: "",
        email: "",
        password: "",
        nombre: "",
        rol: "usuario",
        activo: true,
      });
      await cargarUsuarios();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ username: "", email: "", password: "", nombre: "", rol: "usuario", activo: true });
    setShowModal(true);
  };

  const abrirEdicion = (usuario: Usuario) => {
    setEditando(usuario);
    setForm({
      username: usuario.username,
      email: usuario.email,
      password: "",
      nombre: usuario.nombre,
      rol: usuario.rol,
      activo: usuario.activo,
    });
    setError("");
    setShowModal(true);
  };

  const handleCambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usuarioPassword) return;
    if (nuevaPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nuevaPassword !== confirmarPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    try {
      await usuariosAPI.cambiarPassword(usuarioPassword.id, nuevaPassword);
      setUsuarioPassword(null);
      setNuevaPassword("");
      setConfirmarPassword("");
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleBloqueo = async (usuario: Usuario) => {
    try {
      await usuariosAPI.actualizar(usuario.id, {
        bloqueado: !usuario.bloqueado,
      });
      cargarUsuarios();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatFecha = (fecha: string | null) => {
    if (!fecha) return "Nunca";
    return new Date(fecha).toLocaleString("es-CO");
  };

  const getRolColor = (rol: string) => {
    switch (rol) {
      case "admin":
        return "bg-purple-100 text-purple-800";
      case "moderador":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (user?.rol !== "admin") {
    return (
      <div className="text-center py-10">
        <p className="text-red-600 text-lg">
          No tienes permiso para ver esta pagina
        </p>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <button
          onClick={() => {
            abrirNuevo();
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Nuevo Usuario
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button
            onClick={() => setError("")}
            className="float-right font-bold"
          >
            x
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
        <table className="min-w-[760px] divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Email
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Rol
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Ultimo Acceso
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  Cargando...
                </td>
              </tr>
            ) : (
              usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {u.username}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {u.nombre}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {u.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRolColor(u.rol)}`}
                    >
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${u.bloqueado ? "bg-red-100 text-red-800" : u.activo ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}
                    >
                      {u.bloqueado
                        ? "Bloqueado"
                        : u.activo
                          ? "Activo"
                          : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatFecha(u.ultimo_acceso)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                    <button onClick={() => abrirEdicion(u)} className="mr-3 text-blue-600 hover:text-blue-900">
                      Editar
                    </button>
                    <button
                      onClick={() => { setUsuarioPassword(u); setNuevaPassword(""); setConfirmarPassword(""); setError(""); }}
                      className="mr-3 text-indigo-600 hover:text-indigo-900"
                    >
                      Clave
                    </button>
                    <button
                      onClick={() => handleToggleBloqueo(u)}
                      disabled={u.id === user?.id}
                      title={u.id === user?.id ? "No puedes bloquear tu propia cuenta" : undefined}
                      className={`${u.id === user?.id ? "cursor-not-allowed text-gray-400" : u.bloqueado ? "text-green-600 hover:text-green-900" : "text-red-600 hover:text-red-900"}`}
                    >
                      {u.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-5">
          <div className="mx-auto my-2 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-lg sm:my-4 sm:p-6">
            <h2 className="text-xl font-bold mb-4">{editando ? "Editar Usuario" : "Nuevo Usuario"}</h2>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
                <button
                  onClick={() => setError("")}
                  className="float-right font-bold"
                >
                  x
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  required
                  minLength={3}
                  disabled={!!editando}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                  required
                />
              </div>
              {!editando && <div>
                <label className="block text-sm font-medium mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  className="w-full border rounded px-3 py-2"
                  required
                  minLength={8}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimo 8 caracteres, mayuscula, minuscula, numero y caracter
                  especial
                </p>
              </div>}
              <div>
                <label className="block text-sm font-medium mb-1">Rol</label>
                <select
                  value={form.rol}
                  onChange={(e) => setForm({ ...form, rol: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  <option value="usuario">Usuario</option>
                  <option value="moderador">Moderador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {editando && (
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                    disabled={editando.id === user?.id}
                  />
                  Usuario activo
                </label>
              )}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditando(null); }}
                  className="px-4 py-2 border rounded hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editando ? "Guardar Cambios" : "Crear Usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {usuarioPassword && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-5">
          <div className="mx-auto my-2 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:my-4 sm:p-6">
            <h2 className="mb-2 text-xl font-bold">Cambiar contraseña</h2>
            <p className="mb-4 text-sm text-gray-600">Usuario: {usuarioPassword.username}</p>
            {error && <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <form onSubmit={handleCambiarPassword} className="space-y-4">
              <input
                type="password"
                value={nuevaPassword}
                onChange={(e) => setNuevaPassword(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Nueva contraseña"
                minLength={8}
                required
              />
              <p className="-mt-2 text-xs text-gray-500">Mínimo 8 caracteres, con mayúscula, minúscula, número y carácter especial.</p>
              <input
                type="password"
                value={confirmarPassword}
                onChange={(e) => setConfirmarPassword(e.target.value)}
                className="w-full rounded border px-3 py-2"
                placeholder="Confirmar contraseña"
                minLength={8}
                required
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setUsuarioPassword(null); setError(""); }}
                  className="rounded border px-4 py-2"
                >
                  Cancelar
                </button>
                <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700">
                  Cambiar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsuariosPage;

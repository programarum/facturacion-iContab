import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { categoriasAPI, facturacionAPI } from '../services/api';
import { categoriasSugeridasDeRubro, rubroConfig } from '../config/rubros';

interface Categoria {
  id: number;
  nombre: string;
  descripcion: string | null;
  productos_count?: number;
}

const CategoriasPage = () => {
  const { user } = useAuth();
  const puedeGestionar = ['admin', 'moderador'].includes(user?.rol ?? '');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tipoNegocio, setTipoNegocio] = useState<string>('general');
  const [creandoSugeridas, setCreandoSugeridas] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '' });

  useEffect(() => {
    cargarCategorias();
    facturacionAPI.configuracion.obtener()
      .then((config: any) => setTipoNegocio(config?.tipo_negocio || 'general'))
      .catch(() => setTipoNegocio('general'));
  }, []);

  const cargarCategorias = async () => {
    try {
      setLoading(true);
      const data = await categoriasAPI.listar();
      setCategorias(data);
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
        await categoriasAPI.actualizar(editando.id, form);
      } else {
        await categoriasAPI.crear(form);
      }
      setShowModal(false);
      setEditando(null);
      setForm({ nombre: '', descripcion: '' });
      cargarCategorias();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('Eliminar esta categoria?')) return;
    try {
      await categoriasAPI.eliminar(id);
      cargarCategorias();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const abrirEditar = (cat: Categoria) => {
    setEditando(cat);
    setForm({ nombre: cat.nombre, descripcion: cat.descripcion || '' });
    setShowModal(true);
  };

  const crearCategoriasSugeridas = async () => {
    const sugeridas = categoriasSugeridasDeRubro(tipoNegocio);
    const existentes = new Set(categorias.map((cat) => cat.nombre.trim().toLocaleLowerCase()));
    const faltantes = sugeridas.filter((sugerida) => !existentes.has(sugerida.nombre.trim().toLocaleLowerCase()));

    setError('');
    setMensaje('');
    if (faltantes.length === 0) {
      setMensaje(`Todas las categorías sugeridas para "${rubroConfig(tipoNegocio).etiqueta}" ya existen.`);
      return;
    }

    setCreandoSugeridas(true);
    try {
      let creadas = 0;
      for (const sugerida of faltantes) {
        await categoriasAPI.crear({ nombre: sugerida.nombre, descripcion: sugerida.descripcion });
        creadas += 1;
      }
      setMensaje(`Se crearon ${creadas} categorías sugeridas para "${rubroConfig(tipoNegocio).etiqueta}".`);
      await cargarCategorias();
    } catch (err: any) {
      setError(err.message);
      await cargarCategorias();
    } finally {
      setCreandoSugeridas(false);
    }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
          <p className="mt-1 text-sm text-gray-600">
            Rubro actual: <span className="font-medium">{rubroConfig(tipoNegocio).etiqueta}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeGestionar && (
            <button
              type="button"
              onClick={() => void crearCategoriasSugeridas()}
              disabled={creandoSugeridas}
              className="rounded border border-blue-600 px-4 py-2 font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {creandoSugeridas ? 'Creando…' : 'Sugerir categorías del rubro'}
            </button>
          )}
          <button
            onClick={() => { setForm({ nombre: '', descripcion: '' }); setEditando(null); setShowModal(true); }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            + Nueva Categoria
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">x</button>
        </div>
      )}
      {mensaje && (
        <div role="status" className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded mb-4">
          {mensaje}
          <button onClick={() => setMensaje('')} className="float-right font-bold">x</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <p className="text-gray-500">Cargando...</p>
        ) : categorias.length === 0 ? (
          <p className="text-gray-500">No hay categorias</p>
        ) : (
          categorias.map((cat) => (
            <div key={cat.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{cat.nombre}</h3>
                  <p className="text-sm text-gray-500 mt-1">{cat.descripcion || 'Sin descripcion'}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => abrirEditar(cat)} className="text-blue-600 hover:text-blue-900 text-sm">Editar</button>
                  <button onClick={() => handleEliminar(cat.id)} className="text-red-600 hover:text-red-900 text-sm">Eliminar</button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-5">
          <div className="mx-auto my-2 w-full max-w-md rounded-lg bg-white p-4 shadow-lg sm:my-4 sm:p-6">
            <h2 className="text-xl font-bold mb-4">{editando ? 'Editar Categoria' : 'Nueva Categoria'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Nombre *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descripcion</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full border rounded px-3 py-2" rows={3} />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => { setShowModal(false); setEditando(null); }} className="px-4 py-2 border rounded hover:bg-gray-100">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {editando ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoriasPage;

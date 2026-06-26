import { useState, useEffect } from 'react';
import { categoriasAPI } from '../services/api';

interface Categoria {
  id: number;
  nombre: string;
  descripcion: string | null;
  productos_count?: number;
}

const CategoriasPage = () => {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Categoria | null>(null);
  const [form, setForm] = useState({ nombre: '', descripcion: '' });

  useEffect(() => {
    cargarCategorias();
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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
        <button
          onClick={() => { setForm({ nombre: '', descripcion: '' }); setEditando(null); setShowModal(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          + Nueva Categoria
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">x</button>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
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

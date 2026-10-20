import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useAuth } from '../context/AuthContext';
import { tauriInvoke } from '../services/auth';
import { configuracionNegocioAPI, type ConfiguracionNegocio } from '../services/api';

interface ConfiguracionRespaldos {
  directorio: string | null;
  estado_ultimo_respaldo: string;
}

const mensajeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const ConfiguracionPage = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<ConfiguracionRespaldos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [negocio, setNegocio] = useState<ConfiguracionNegocio | null>(null);
  const [cargandoNegocio, setCargandoNegocio] = useState(true);
  const [guardandoNegocio, setGuardandoNegocio] = useState(false);
  const [errorNegocio, setErrorNegocio] = useState('');
  const [mensajeNegocio, setMensajeNegocio] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const resultado = await tauriInvoke('obtener_configuracion_respaldos');
      setConfig(resultado as ConfiguracionRespaldos);
      setError('');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cargarNegocio = useCallback(async () => {
    setCargandoNegocio(true);
    try {
      const resultado = await configuracionNegocioAPI.obtener();
      setNegocio(resultado);
      setErrorNegocio('');
    } catch (err) {
      setErrorNegocio(mensajeError(err));
    } finally {
      setCargandoNegocio(false);
    }
  }, []);

  useEffect(() => {
    void cargarNegocio();
  }, [cargarNegocio]);

  const actualizarNegocio = (campo: keyof ConfiguracionNegocio, valor: string | boolean) => {
    setNegocio((actual) => actual ? { ...actual, [campo]: valor } : actual);
  };

  const guardarNegocio = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!negocio) return;

    setGuardandoNegocio(true);
    setErrorNegocio('');
    setMensajeNegocio('');
    try {
      const resultado = await configuracionNegocioAPI.guardar(negocio);
      setNegocio(resultado);
      setMensajeNegocio('Los datos del negocio se guardaron correctamente.');
    } catch (err) {
      setErrorNegocio(mensajeError(err));
    } finally {
      setGuardandoNegocio(false);
    }
  };

  const seleccionarCarpeta = async () => {
    try {
      const seleccion = await open({
        directory: true,
        multiple: false,
        title: 'Seleccionar carpeta para respaldos de iContab',
      });
      if (typeof seleccion !== 'string') return;

      setOcupado(true);
      setError('');
      setMensaje('');
      const resultado = await tauriInvoke('guardar_directorio_respaldos', {
        directorio: seleccion,
      });
      setConfig(resultado as ConfiguracionRespaldos);
      setMensaje('Carpeta guardada. La copia automática se creará en el próximo inicio.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const desactivarRespaldos = async () => {
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      const resultado = await tauriInvoke('guardar_directorio_respaldos', { directorio: null });
      setConfig(resultado as ConfiguracionRespaldos);
      setMensaje('Se desactivaron los respaldos automáticos.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const crearAhora = async () => {
    setOcupado(true);
    setError('');
    setMensaje('');
    try {
      const resultado = await tauriInvoke('crear_respaldo_ahora');
      setMensaje(String(resultado));
      await cargar();
    } catch (err) {
      setError(mensajeError(err));
      await cargar();
    } finally {
      setOcupado(false);
    }
  };

  if (user?.rol !== 'admin') {
    return <p className="py-10 text-center text-red-600">No tienes permiso para ver esta página.</p>;
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
      <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="mt-1 text-sm text-gray-600">Datos generales, rubro del negocio y respaldos de la base de datos.</p>
      </div>

      {errorNegocio && <div role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">{errorNegocio}</div>}
      {mensajeNegocio && <div role="status" className="rounded border border-green-300 bg-green-50 px-4 py-3 text-green-800">{mensajeNegocio}</div>}

      <section className="space-y-5 rounded-lg bg-white p-6 shadow">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Perfil del negocio</h2>
          <p className="mt-1 text-sm text-gray-600">
            Estos datos identifican tu empresa y nos permiten preparar la aplicación para tu actividad.
          </p>
        </div>

        {cargandoNegocio ? (
          <p className="text-sm text-gray-500">Cargando los datos del negocio…</p>
        ) : negocio ? (
          <form onSubmit={guardarNegocio} className="space-y-5">
            <div>
              <label htmlFor="tipo-negocio" className="mb-1 block text-sm font-medium text-gray-700">Tipo de negocio *</label>
              <select
                id="tipo-negocio"
                value={negocio.tipo_negocio}
                onChange={(event) => actualizarNegocio('tipo_negocio', event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2"
                required
              >
                <option value="general">Tienda / negocio general</option>
                <option value="tienda_mixta">Tienda mixta (comidas, frutas y verduras, abarrotes)</option>
                <option value="panaderia">Panadería</option>
                <option value="legumbreria">Legumbrería / frutería</option>
                <option value="farmacia">Farmacia</option>
                <option value="tienda_agricola">Tienda agrícola</option>
              </select>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={negocio.aplica_iva}
                  onChange={(event) => actualizarNegocio('aplica_iva', event.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Aplicar IVA (19%) a las facturas
              </label>
              <p className="mt-1 text-sm text-gray-500">
                Desactivado por defecto. Actívalo solo si debes facturar con IVA; afectará las nuevas facturas.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="nombre-empresa" className="mb-1 block text-sm font-medium text-gray-700">Nombre comercial *</label>
                <input
                  id="nombre-empresa"
                  value={negocio.nombre_empresa}
                  onChange={(event) => actualizarNegocio('nombre_empresa', event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  maxLength={250}
                  required
                />
              </div>
              <div>
                <label htmlFor="razon-social" className="mb-1 block text-sm font-medium text-gray-700">Razón social *</label>
                <input
                  id="razon-social"
                  value={negocio.razon_social}
                  onChange={(event) => actualizarNegocio('razon_social', event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  maxLength={250}
                  required
                />
              </div>
              <div>
                <label htmlFor="nit" className="mb-1 block text-sm font-medium text-gray-700">NIT *</label>
                <input
                  id="nit"
                  value={negocio.nit}
                  onChange={(event) => actualizarNegocio('nit', event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  maxLength={250}
                  required
                />
              </div>
              <div>
                <label htmlFor="telefono-empresa" className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
                <input
                  id="telefono-empresa"
                  value={negocio.telefono}
                  onChange={(event) => actualizarNegocio('telefono', event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  maxLength={250}
                />
              </div>
              <div>
                <label htmlFor="direccion-empresa" className="mb-1 block text-sm font-medium text-gray-700">Dirección</label>
                <input
                  id="direccion-empresa"
                  value={negocio.direccion}
                  onChange={(event) => actualizarNegocio('direccion', event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  maxLength={250}
                />
              </div>
              <div>
                <label htmlFor="email-empresa" className="mb-1 block text-sm font-medium text-gray-700">Correo electrónico</label>
                <input
                  id="email-empresa"
                  type="email"
                  value={negocio.email}
                  onChange={(event) => actualizarNegocio('email', event.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2"
                  maxLength={250}
                />
              </div>
            </div>

            <p className="text-sm text-gray-500">
              En esta etapa se guarda el perfil. La selección del rubro todavía no modifica el inventario ni el proceso de venta.
            </p>
            <div>
              <button
                type="submit"
                disabled={guardandoNegocio}
                className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {guardandoNegocio ? 'Guardando…' : 'Guardar datos del negocio'}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-500">No se encontró una configuración de empresa.</p>
        )}
      </section>

      {error && <div role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">{error}</div>}
      {mensaje && <div role="status" className="rounded border border-green-300 bg-green-50 px-4 py-3 text-green-800">{mensaje}</div>}

      <section className="space-y-5 rounded-lg bg-white p-6 shadow">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Respaldo automático</h2>
          <p className="mt-1 text-sm text-gray-600">
            Al iniciar iContab se guardará una copia consistente de la base de datos. Se conservarán las 30 copias más recientes.
          </p>
        </div>

        <div className="rounded border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700">Carpeta seleccionada</p>
          <p className="mt-1 break-all text-sm text-gray-600">
            {cargando ? 'Consultando configuración…' : config?.directorio || 'Sin configurar'}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void seleccionarCarpeta()}
            disabled={ocupado || cargando}
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Seleccionar carpeta
          </button>
          <button
            type="button"
            onClick={() => void crearAhora()}
            disabled={ocupado || cargando || !config?.directorio}
            className="rounded bg-gray-800 px-4 py-2 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {ocupado ? 'Procesando…' : 'Crear respaldo ahora'}
          </button>
          {config?.directorio && (
            <button
              type="button"
              onClick={() => void desactivarRespaldos()}
              disabled={ocupado}
              className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Desactivar
            </button>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-gray-700">Último respaldo</p>
          <p className="mt-1 break-all text-sm text-gray-600">
            {config?.estado_ultimo_respaldo || 'Todavía no hay información de respaldo.'}
          </p>
        </div>
      </section>
      </div>
    </div>
  );
};

export default ConfiguracionPage;

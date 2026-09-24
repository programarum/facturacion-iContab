import { FormEvent, useCallback, useEffect, useState } from 'react';
import { facturacionAPI } from '../services/api';
import { generarFacturaPDF } from '../services/pdf';

interface FacturaHistorial {
  id: number;
  numero_completo: string;
  fecha_emision: string;
  cliente_nombre: string;
  cliente_identificacion: string;
  total: number;
  estado_dian: string;
}

const fechaLocal = (fecha: Date): string => {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const rangoUltimos30Dias = () => {
  const hasta = new Date();
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 29);
  return { desde: fechaLocal(desde), hasta: fechaLocal(hasta) };
};

const formatoMoneda = (valor: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(valor);

const formatoFecha = (fecha: string) => {
  const parsed = new Date(fecha);
  return Number.isNaN(parsed.getTime())
    ? fecha
    : parsed.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
};

const mensajeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const HistorialFacturasPage = () => {
  const rangoInicial = rangoUltimos30Dias();
  const [fechaDesde, setFechaDesde] = useState(rangoInicial.desde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.hasta);
  const [rangoAplicado, setRangoAplicado] = useState(rangoInicial);
  const [facturas, setFacturas] = useState<FacturaHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [imprimiendoId, setImprimiendoId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const cargarFacturas = useCallback(async (desde: string, hasta: string) => {
    setCargando(true);
    setError('');
    try {
      const resultado = await facturacionAPI.facturas.historial(desde, hasta);
      setFacturas(resultado as FacturaHistorial[]);
    } catch (err) {
      setError(mensajeError(err));
      setFacturas([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarFacturas(rangoAplicado.desde, rangoAplicado.hasta);
  }, [cargarFacturas, rangoAplicado]);

  const buscar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (fechaDesde > fechaHasta) {
      setError('La fecha inicial no puede ser posterior a la fecha final.');
      return;
    }
    setRangoAplicado({ desde: fechaDesde, hasta: fechaHasta });
  };

  const reimprimir = async (facturaId: number) => {
    // Abrir la ventana antes de los awaits para conservar la acción del usuario
    // y evitar que el WebView bloquee la ventana emergente.
    const ventanaImpresion = window.open('', '_blank');
    if (!ventanaImpresion) {
      setError('No se pudo abrir la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
      return;
    }

    setImprimiendoId(facturaId);
    setError('');
    try {
      const [factura, empresa] = await Promise.all([
        facturacionAPI.facturas.obtener(facturaId),
        facturacionAPI.configuracion.obtener(),
      ]);
      generarFacturaPDF(factura, empresa, { imprimir: true, ventanaImpresion });
    } catch (err) {
      ventanaImpresion.close();
      setError(`No se pudo preparar la impresión: ${mensajeError(err)}`);
    } finally {
      setImprimiendoId(null);
    }
  };

  const totalPeriodo = facturas.reduce((acumulado, factura) => acumulado + factura.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Historial de facturas pagadas</h1>
        <p className="mt-1 text-sm text-gray-600">
          Las facturas emitidas se consideran pagadas según el criterio actual. El estado DIAN se muestra por separado.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={buscar} className="flex flex-col gap-4 rounded-lg bg-white p-4 shadow sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="fecha-desde" className="mb-1 block text-sm font-medium text-gray-700">Desde</label>
          <input
            id="fecha-desde"
            type="date"
            value={fechaDesde}
            onChange={(event) => setFechaDesde(event.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
            required
          />
        </div>
        <div className="flex-1">
          <label htmlFor="fecha-hasta" className="mb-1 block text-sm font-medium text-gray-700">Hasta</label>
          <input
            id="fecha-hasta"
            type="date"
            value={fechaHasta}
            onChange={(event) => setFechaHasta(event.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
            required
          />
        </div>
        <button
          type="submit"
          disabled={cargando}
          className="rounded bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
        >
          Buscar
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-4 py-3 shadow">
        <p className="text-sm text-gray-600">
          {cargando ? 'Buscando facturas…' : `${facturas.length} factura${facturas.length === 1 ? '' : 's'} en el periodo`}
        </p>
        {!cargando && <p className="font-semibold text-gray-900">Total: {formatoMoneda(totalPeriodo)}</p>}
      </div>

      <div className="overflow-hidden rounded-lg bg-white shadow">
        {cargando ? (
          <p className="p-6 text-center text-gray-500">Cargando historial…</p>
        ) : facturas.length === 0 ? (
          <p className="p-6 text-center text-gray-500">No se encontraron facturas para las fechas seleccionadas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Factura</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Cliente</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Estado DIAN</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {facturas.map((factura) => (
                  <tr key={factura.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{factura.numero_completo}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{formatoFecha(factura.fecha_emision)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div>{factura.cliente_nombre}</div>
                      <div className="text-xs text-gray-500">{factura.cliente_identificacion}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">{factura.estado_dian}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-gray-900">{formatoMoneda(factura.total)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void reimprimir(factura.id)}
                        disabled={imprimiendoId !== null}
                        className="rounded bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-wait disabled:opacity-50"
                      >
                        {imprimiendoId === factura.id ? 'Preparando…' : 'Reimprimir'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HistorialFacturasPage;

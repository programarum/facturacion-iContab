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

interface FacturaDetalleItem {
  id: number;
  cantidad: number;
  unidad_medida: string;
  descripcion: string;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  iva: number;
  total: number;
}

interface FacturaDetalle {
  id: number;
  numero_completo: string;
  fecha_emision: string;
  estado_dian: string;
  cliente: {
    nombre: string;
    tipo_identificacion?: string;
    numero_identificacion?: string;
  };
  items: FacturaDetalleItem[];
  subtotal: number;
  descuento: number;
  iva: number;
  iva_porcentaje: number;
  total: number;
  cufe?: string | null;
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

const formatoCantidad = (cantidad: number) =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(cantidad);

const mensajeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const HistorialFacturasPage = () => {
  const rangoInicial = rangoUltimos30Dias();
  const [fechaDesde, setFechaDesde] = useState(rangoInicial.desde);
  const [fechaHasta, setFechaHasta] = useState(rangoInicial.hasta);
  const [rangoAplicado, setRangoAplicado] = useState(rangoInicial);
  const [facturas, setFacturas] = useState<FacturaHistorial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [generandoId, setGenerandoId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [detalle, setDetalle] = useState<FacturaDetalle | null>(null);
  const [cargandoDetalleId, setCargandoDetalleId] = useState<number | null>(null);

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

  const descargarFactura = async (facturaId: number) => {
    setGenerandoId(facturaId);
    setError('');
    try {
      const [factura, empresa] = await Promise.all([
        facturacionAPI.facturas.obtener(facturaId),
        facturacionAPI.configuracion.obtener(),
      ]);
      generarFacturaPDF(factura, empresa);
    } catch (err) {
      setError(`No se pudo generar el PDF: ${mensajeError(err)}`);
    } finally {
      setGenerandoId(null);
    }
  };

  const verDetalle = async (facturaId: number) => {
    setCargandoDetalleId(facturaId);
    setError('');
    try {
      const factura = (await facturacionAPI.facturas.obtener(facturaId)) as FacturaDetalle;
      setDetalle(factura);
    } catch (err) {
      setError(`No se pudo cargar el detalle de la factura: ${mensajeError(err)}`);
    } finally {
      setCargandoDetalleId(null);
    }
  };

  const cerrarDetalle = () => setDetalle(null);

  useEffect(() => {
    if (!detalle) return;
    const alPulsar = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetalle(null);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [detalle]);

  const totalPeriodo = facturas.reduce((acumulado, factura) => acumulado + factura.total, 0);

  return (
    <div className="h-full min-h-0 space-y-6 overflow-y-auto overscroll-contain">
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
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {facturas.map((factura) => (
                  <tr
                    key={factura.id}
                    onClick={() => void verDetalle(factura.id)}
                    className="cursor-pointer hover:bg-gray-50"
                    title="Ver productos vendidos"
                  >
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
                        onClick={(event) => {
                          event.stopPropagation();
                          void verDetalle(factura.id);
                        }}
                        disabled={cargandoDetalleId === factura.id}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:cursor-wait disabled:text-gray-400"
                      >
                        {cargandoDetalleId === factura.id ? 'Cargando…' : 'Ver ›'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalle && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={cerrarDetalle}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle de la factura ${detalle.numero_completo}`}
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-y-0 right-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-gray-900">{detalle.numero_completo}</h2>
                <p className="text-sm text-gray-500">{formatoFecha(detalle.fecha_emision)}</p>
                <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  DIAN: {detalle.estado_dian}
                </span>
              </div>
              <button
                type="button"
                onClick={cerrarDetalle}
                aria-label="Cerrar detalle"
                className="rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <h3 className="text-xs font-semibold uppercase text-gray-500">Cliente</h3>
              <p className="mt-1 text-sm font-medium text-gray-900">{detalle.cliente.nombre}</p>
              <p className="text-xs text-gray-500">
                {detalle.cliente.tipo_identificacion} {detalle.cliente.numero_identificacion}
              </p>

              <h3 className="mt-5 text-xs font-semibold uppercase text-gray-500">Productos vendidos</h3>
              {detalle.items.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">Esta factura no registra productos.</p>
              ) : (
                <ul className="mt-2 divide-y divide-gray-100">
                  {detalle.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900" title={item.descripcion}>
                          {item.descripcion}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatoCantidad(item.cantidad)} {item.unidad_medida} × {formatoMoneda(item.precio_unitario)}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-semibold text-gray-900">{formatoMoneda(item.total)}</p>
                        {detalle.iva_porcentaje > 0 && (
                          <p className="text-xs text-gray-500">IVA {formatoMoneda(item.iva)}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {detalle.cufe && (
                <p className="mt-4 break-all text-[10px] text-gray-400">CUFE: {detalle.cufe}</p>
              )}
            </div>

            <div className="border-t border-gray-200 px-5 py-4">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between text-gray-600">
                  <dt>Subtotal</dt>
                  <dd>{formatoMoneda(detalle.subtotal)}</dd>
                </div>
                {detalle.descuento > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <dt>Descuento</dt>
                    <dd>-{formatoMoneda(detalle.descuento)}</dd>
                  </div>
                )}
                {detalle.iva_porcentaje > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <dt>IVA ({detalle.iva_porcentaje}%)</dt>
                    <dd>{formatoMoneda(detalle.iva)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-gray-100 pt-1 text-base font-bold text-gray-900">
                  <dt>Total</dt>
                  <dd>{formatoMoneda(detalle.total)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => void descargarFactura(detalle.id)}
                  disabled={generandoId !== null}
                  className="flex-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-wait disabled:bg-blue-300"
                >
                  {generandoId === detalle.id ? 'Generando…' : 'Descargar PDF'}
                </button>
                <button
                  type="button"
                  onClick={cerrarDetalle}
                  className="rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};

export default HistorialFacturasPage;

import { ReactNode } from 'react';
import { useDemo, WHATSAPP, WHATSAPP_URL } from '../context/DemoContext';

const fechaLarga = (epochSegundos: number) =>
  new Date(epochSegundos * 1000).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

const DemoGate = ({ children }: { children: ReactNode }) => {
  const { status, loading, vencido, enAviso, diasRestantes, errorModo } = useDemo();

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center px-4 text-center text-gray-600">Verificando la demostración…</div>;
  }

  // ==================== DEMO VENCIDA ====================
  if (vencido && status) {
    const expira = status.expira_en ? fechaLarga(status.expira_en) : '';
    return (
      <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-gray-100 p-3 sm:p-5">
        <section className="my-auto w-full max-w-lg space-y-4 rounded-xl bg-white p-6 text-center shadow-lg sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">iContab · Demostración</p>
          <h1 className="text-2xl font-bold text-gray-900">La demostración ha finalizado</h1>
          <p className="text-sm text-gray-600">
            Esta demostración tiene una vigencia de {status.total_dias} días
            {expira ? ` y finalizó el ${expira}` : ''}. Para continuar facturando, adquiera la licencia del producto.
          </p>
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">Contáctenos para activar su equipo</p>
            <p className="mt-1">Escríbanos por WhatsApp y con gusto le ayudamos.</p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 font-semibold text-white transition hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              WhatsApp {WHATSAPP}
            </a>
          </div>
          <p className="text-xs text-gray-500">Gracias por probar iContab.</p>
        </section>
      </main>
    );
  }

  // ==================== AVISO: QUEDAN POCOS DÍAS ====================
  const expira = status?.expira_en ? fechaLarga(status.expira_en) : '';

  return (
    <>
      {children}
      {errorModo && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-3">
          <div className="pointer-events-auto w-full max-w-3xl rounded-xl bg-red-600 p-3 text-sm text-white shadow-lg">
            ⚠️ {errorModo}
          </div>
        </div>
      )}
      {enAviso && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3">
          <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow-lg sm:flex sm:items-center sm:justify-between sm:gap-4">
            <p>
              <span className="font-semibold">
                Quedan {diasRestantes} {diasRestantes === 1 ? 'día' : 'días'} de demostración
              </span>
              {expira ? ` (vence el ${expira})` : ''}. Active su licencia para seguir facturando.
            </p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex shrink-0 items-center justify-center rounded-lg bg-green-600 px-3 py-1.5 font-semibold text-white transition hover:bg-green-700 sm:mt-0"
            >
              Contáctenos · {WHATSAPP}
            </a>
          </div>
        </div>
      )}
    </>
  );
};

export default DemoGate;

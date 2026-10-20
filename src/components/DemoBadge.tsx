// src/components/DemoBadge.tsx
// Indicador del tiempo restante de la demostración en el navbar.
// Solo se muestra en el build demo (el backend devuelve demo=false en el normal).
import { useDemo, WHATSAPP, WHATSAPP_URL } from '../context/DemoContext';

const DemoBadge = () => {
  const { status, loading, etiqueta, vencido, enAviso, diasRestantes } = useDemo();

  if (loading || !status?.demo) return null;

  const clases = vencido
    ? 'bg-red-50 text-red-700 ring-red-300'
    : enAviso
      ? 'bg-amber-50 text-amber-800 ring-amber-300'
      : 'bg-blue-50 text-blue-700 ring-blue-200';

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noreferrer"
      title={`Demostración de ${status.total_dias} días. ${vencido ? 'Finalizada' : `Restan ${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`}. Clic para contactarnos por WhatsApp (${WHATSAPP}).`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition hover:brightness-95 ${clases}`}
    >
      <span aria-hidden="true">⏳</span>
      <span className="hidden sm:inline">{vencido ? 'Demo finalizada' : 'Demo:'}</span>
      <span className="font-semibold">{vencido ? 'Contáctenos' : etiqueta}</span>
    </a>
  );
};

export default DemoBadge;

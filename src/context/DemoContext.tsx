// src/context/DemoContext.tsx
// Estado compartido de la demostración: lo consultan la pantalla de bloqueo
// (DemoGate) y el indicador del navbar (DemoBadge), con un solo sondeo.
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { tauriInvoke } from '../services/auth';

// Contacto de ventas / soporte.
export const WHATSAPP = '321 688 2631';
export const WHATSAPP_URL = `https://wa.me/573216882631?text=${encodeURIComponent(
  'Hola, necesito información para activar la licencia de iContab.',
)}`;

// Días restantes a partir de los cuales se muestra el aviso.
export const DIAS_AVISO = 3;

const MS_DIA = 86_400_000;

export interface DemoStatus {
  demo: boolean;
  total_dias: number;
  iniciado_en: number | null;
  expira_en: number | null;
  vencido: boolean;
  dias_restantes: number;
}

interface DemoContextValue {
  status: DemoStatus | null;
  loading: boolean;
  vencido: boolean;
  /** Días (redondeados hacia arriba) que faltan; 0 si ya venció. */
  diasRestantes: number;
  /** Milisegundos restantes; 0 si ya venció o no es demo. */
  restanteMs: number;
  /** true cuando quedan DIAS_AVISO días o menos (y aún no vence). */
  enAviso: boolean;
  /** Texto corto para el navbar, p. ej. "12 días". */
  etiqueta: string;
  /** Aviso cuando el frontend está en modo demo pero falta el backend demo. */
  errorModo: string | null;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export const DemoProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ahora, setAhora] = useState(() => Date.now());
  const [errorModo, setErrorModo] = useState<string | null>(null);

  const checkDemo = useCallback(async () => {
    try {
      const actual = (await tauriInvoke('obtener_estado_demo')) as DemoStatus;
      setStatus(actual);
      setErrorModo(null);
    } catch {
      // Fuera de Tauri o backend sin el feature `demo`: no se bloquea la app,
      // pero si estamos compilados en modo demo se avisa del error de build.
      setStatus({ demo: false, total_dias: 0, iniciado_en: null, expira_en: null, vencido: false, dias_restantes: 0 });
      if (import.meta.env.MODE === 'demo') {
        setErrorModo(
          'El frontend está en modo DEMO pero el backend no incluye el comando de demostración. ' +
            'Compile con `pnpm tauri:dev:demo` o `pnpm tauri:build:windows:demo` (feature `demo`).',
        );
      }
    } finally {
      setAhora(Date.now());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkDemo();
    // Reconsultar el backend cada 30 minutos.
    const consulta = window.setInterval(() => void checkDemo(), 30 * 60 * 1000);
    return () => window.clearInterval(consulta);
  }, [checkDemo]);

  useEffect(() => {
    // Refrescar el conteo del navbar cada minuto.
    const reloj = window.setInterval(() => setAhora(Date.now()), 60_000);
    return () => window.clearInterval(reloj);
  }, []);

  const value = useMemo<DemoContextValue>(() => {
    const expiraMs = status?.expira_en ? status.expira_en * 1000 : 0;
    const restanteMs = status?.demo && expiraMs ? Math.max(0, expiraMs - ahora) : 0;
    const diasRestantes = restanteMs > 0 ? Math.ceil(restanteMs / MS_DIA) : 0;
    return {
      status,
      loading,
      vencido: Boolean(status?.demo && status.vencido),
      diasRestantes,
      restanteMs,
      enAviso: Boolean(status?.demo && !status.vencido && diasRestantes <= DIAS_AVISO),
      etiqueta: `${diasRestantes} ${diasRestantes === 1 ? 'día' : 'días'}`,
      errorModo,
    };
  }, [status, loading, ahora, errorModo]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};

export const useDemo = () => {
  const contexto = useContext(DemoContext);
  if (!contexto) {
    throw new Error('useDemo debe usarse dentro de <DemoProvider>');
  }
  return contexto;
};

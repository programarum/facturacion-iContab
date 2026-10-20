import { ReactNode, useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { tauriInvoke } from '../services/auth';

interface LicenseStatus {
  enforced: boolean;
  licensed: boolean;
  online_activation_available: boolean;
  device_fingerprint: string;
  message: string;
  checked_online: boolean;
}

const LicenseGate = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const checkLicense = useCallback(async () => {
    try {
      const current = await tauriInvoke('obtener_estado_licencia') as LicenseStatus;
      setStatus(current);
      setError('');
    } catch (err) {
      // `pnpm dev` en un navegador no es la distribución Windows protegida.
      if (typeof window === 'undefined' || !window.__TAURI__?.core?.invoke) {
        setStatus({ enforced: false, licensed: true, online_activation_available: false, device_fingerprint: '', message: 'Modo navegador/desarrollo', checked_online: false });
      } else {
        const message = err instanceof Error ? err.message : String(err);
        setStatus({ enforced: true, licensed: false, online_activation_available: false, device_fingerprint: '', message, checked_online: false });
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkLicense();
    const whenOnline = () => void checkLicense();
    window.addEventListener('online', whenOnline);
    const timer = window.setInterval(() => void checkLicense(), 5 * 60 * 1000);
    return () => {
      window.removeEventListener('online', whenOnline);
      window.clearInterval(timer);
    };
  }, [checkLicense]);

  const activarOnline = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const activated = await tauriInvoke('activar_licencia_online', { licenciaKey: licenseKey.trim() }) as LicenseStatus;
      setStatus(activated);
      setNotice(activated.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const importarArchivo = async () => {
    setError('');
    setNotice('');
    try {
      const selected = await open({
        multiple: false,
        title: 'Seleccionar archivo de licencia offline',
        filters: [{ name: 'Licencia iContab', extensions: ['json'] }],
      });
      if (typeof selected !== 'string') return;
      setBusy(true);
      const activated = await tauriInvoke('importar_licencia_offline', { ruta: selected }) as LicenseStatus;
      setStatus(activated);
      setNotice(activated.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center px-4 text-center text-gray-600">Verificando licencia del equipo…</div>;
  }
  if (status && (!status.enforced || status.licensed)) return <>{children}</>;

  return (
    <main className="flex min-h-dvh items-center justify-center overflow-y-auto bg-gray-100 p-3 sm:p-5">
      <section className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-xl space-y-5 overflow-y-auto rounded-xl bg-white p-5 shadow-lg sm:max-h-[calc(100dvh-2.5rem)] sm:p-7">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">iContab · Activación</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Activar este equipo</h1>
          <p className="mt-2 text-sm text-gray-600">
            La licencia queda asociada a este equipo. {status?.online_activation_available
              ? 'Puedes activarlo online o importar el archivo firmado que te entregue el administrador.'
              : 'Solicita al administrador el archivo firmado para importarlo en este equipo.'}
          </p>
        </div>

        {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
        {notice && <div role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">{notice}</div>}
        {status?.message && !notice && <p className="text-sm text-gray-600">{status.message}</p>}

        <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-medium text-gray-700">Identificador de este equipo para activación offline</p>
          <textarea
            readOnly
            value={status?.device_fingerprint || ''}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full resize-none rounded border border-gray-300 bg-white p-2 font-mono text-xs"
            rows={3}
          />
          <p className="text-xs text-gray-500">Copia este código y solicita el archivo de licencia firmado desde un equipo conectado a internet.</p>
        </div>

        {status?.online_activation_available && (
          <form onSubmit={activarOnline} className="space-y-3">
            <label htmlFor="license-key" className="block text-sm font-medium text-gray-700">Clave de licencia (activación online)</label>
            <input
              id="license-key"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2"
              autoComplete="off"
              required
            />
            <button type="submit" disabled={busy} className="w-full rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? 'Procesando…' : 'Activar con internet'}
            </button>
          </form>
        )}

        <button type="button" onClick={() => void importarArchivo()} disabled={busy} className="w-full rounded border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          Importar archivo de licencia offline
        </button>
      </section>
    </main>
  );
};

export default LicenseGate;

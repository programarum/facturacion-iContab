// src/components/AuditoriaPanel.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/auth';

const AuditoriaPanel = () => {
    const { user } = useAuth();
    const [logs, setLogs] = useState<any[]>([]);
    const [filtros, setFiltros] = useState<any>({
        accion: '',
        severidad: '',
        fecha_desde: '',
        fecha_hasta: ''
    });
    const [loading, setLoading] = useState<boolean>(true);

    const cargarLogs = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filtros.accion) params.append('accion', filtros.accion);
            if (filtros.severidad) params.append('severidad', filtros.severidad);
            
            const response = await apiFetch(`/auditoria/logs?${params}`);
            const data = await response.json();
            setLogs(data);
        } catch (error) {
            console.error('Error cargando logs:', error);
        }
        setLoading(false);
    };

    useEffect(() => {
        cargarLogs();
    }, []);

    const getColorSeveridad = (sev) => {
        switch(sev) {
            case 'critico': return 'bg-red-100 text-red-800 border-red-300';
            case 'advertencia': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
            default: return 'bg-green-100 text-green-800 border-green-300';
        }
    };

    const getIconoAccion = (accion) => {
        if (accion.includes('crear')) return '➕';
        if (accion.includes('editar')) return '✏️';
        if (accion.includes('eliminar')) return '🗑️';
        if (accion.includes('login')) return '🔑';
        if (accion.includes('movimiento')) return '🔄';
        return '📋';
    };

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <h2 className="text-3xl font-bold mb-6">📋 Logs de Auditoría</h2>
            
            {/* Filtros */}
            <div className="bg-white p-4 rounded-lg shadow mb-6 grid grid-cols-4 gap-4">
                <select 
                    className="border rounded px-3 py-2"
                    value={filtros.accion}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltros({...filtros, accion: e.target.value})}
                >
                    <option value="">Todas las acciones</option>
                    <option value="login">Login</option>
                    <option value="producto_crear">Crear Producto</option>
                    <option value="producto_editar">Editar Producto</option>
                    <option value="producto_eliminar">Eliminar Producto</option>
                    <option value="movimiento_entrada">Entrada Stock</option>
                    <option value="movimiento_salida">Salida Stock</option>
                </select>
                
                <select
                    className="border rounded px-3 py-2"
                    value={filtros.severidad}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFiltros({...filtros, severidad: e.target.value})}
                >
                    <option value="">Todas las severidades</option>
                    <option value="info">Info</option>
                    <option value="advertencia">Advertencia</option>
                    <option value="critico">Crítico</option>
                </select>
                
                <button 
                    onClick={cargarLogs}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                    🔍 Filtrar
                </button>
            </div>

            {/* Tabla de Logs */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-left">Hora</th>
                            <th className="px-4 py-3 text-left">Usuario</th>
                            <th className="px-4 py-3 text-left">Acción</th>
                            <th className="px-4 py-3 text-left">Entidad</th>
                            <th className="px-4 py-3 text-left">Severidad</th>
                            <th className="px-4 py-3 text-left">IP</th>
                            <th className="px-4 py-3 text-left">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log) => (
                            <tr key={log.id} className="border-b hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm">
                                    {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="px-4 py-3 font-medium">
                                    {log.usuario_username || 'Sistema'}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="mr-2">{getIconoAccion(log.accion)}</span>
                                    {log.accion}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                    {log.entidad_tipo && (
                                        <span className="text-gray-600">
                                            {log.entidad_tipo} #{log.entidad_id}
                                        </span>
                                    )}
                                    {log.entidad_nombre && (
                                        <div className="text-xs text-gray-400">{log.entidad_nombre}</div>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={`px-2 py-1 rounded text-xs font-bold border ${getColorSeveridad(log.severidad)}`}>
                                        {log.severidad.toUpperCase()}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-500">
                                    {log.ip_address}
                                </td>
                                <td className="px-4 py-3">
                                    {log.exito ? (
                                        <span className="text-green-600">✓</span>
                                    ) : (
                                        <span className="text-red-600">✕</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AuditoriaPanel;
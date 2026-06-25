// src/components/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/auth';
import { 
    BarChart, Bar, LineChart, Line, XAxis, YAxis, 
    CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { useNavigate } from 'react-router-dom';

interface StatCardProps {
  titulo: string;
  valor: string;
  icono: string;
  color: string;
  alerta: string | undefined;
}


const Dashboard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        cargarDashboard();
    }, []);

    const cargarDashboard = async () => {
        try {
            const response = await apiFetch('/dashboard');
            const dashboardData = await response.json();
            setData(dashboardData);
        } catch (error) {
            console.error('Error cargando dashboard:', error);
        }
        setLoading(false);
    };

    if (loading) return <div className="flex justify-center items-center h-screen">Cargando...</div>;
    if (!data) return <div>Error cargando dashboard</div>;

    const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'];

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-800">
                    📊 Dashboard
                </h1>
                <p className="text-gray-500">
                    Bienvenido, <span className="font-semibold">{data.usuario.nombre}</span> 
                    {' '}| Rol: <span className={`px-2 py-1 rounded text-xs font-bold ${
                        data.usuario.rol === 'admin' ? 'bg-red-100 text-red-800' :
                        data.usuario.rol === 'moderador' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                    }`}>{data.usuario.rol.toUpperCase()}</span>
                </p>
            </div>

            {/* ALERTAS (solo admin y moderador) */}
            {data.alertas && data.alertas.length > 0 && (
                <div className="mb-6 space-y-3">
                    <h2 className="text-lg font-semibold text-gray-700">🚨 Alertas</h2>
                    {data.alertas.map((alerta, idx) => (
                        <div 
                            key={idx}
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => alerta.accion && navigate(alerta.accion)}
                            className={`p-4 rounded-lg border-l-4 cursor-pointer hover:shadow-md transition-shadow ${
                                alerta.nivel === 'critico' ? 'bg-red-50 border-red-500' :
                                'bg-yellow-50 border-yellow-500'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">{alerta.icono}</span>
                                <div>
                                    <p className="font-medium">{alerta.mensaje}</p>
                                    <p className="text-sm text-gray-500">Click para ver detalles</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* RESUMEN CARDS (Admin) */}
            {data.resumen && (
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <StatCard 
                        titulo="Total Productos" 
                        valor={data.resumen.total_productos} 
                        icono="📦" 
                        color="blue"
                        alerta=''
                    />
                    <StatCard 
                        titulo="Sin Stock" 
                        valor={data.resumen.sin_stock} 
                        icono="🔴" 
                        color="red"
                        alerta={data.resumen.sin_stock > 0 ? 'Hay productos sin stock' : undefined}
                    />
                    <StatCard 
                        titulo="Stock Bajo" 
                        valor={data.resumen.stock_bajo} 
                        icono="⚠️" 
                        color="yellow"
                        alerta=''
                    />
                    <StatCard 
                        titulo="Movimientos Hoy" 
                        valor={data.resumen.movimientos_hoy} 
                        icono="🔄" 
                        color="green"
                        alerta=""
                    />
                </div>
            )}

            {/* GRÁFICOS (Admin) */}
            {data.graficos && (
                <div className="grid grid-cols-2 gap-6 mb-6">
                    {/* Gráfico de Actividad por Hora */}
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold mb-4">📈 Actividad por Hora (24h)</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <LineChart data={data.graficos.actividad_por_hora}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hora" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="entradas" stroke="#3b82f6" name="Movimientos" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Gráfico de Distribución de Stock */}
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h3 className="text-lg font-semibold mb-4">🥧 Distribución de Stock</h3>
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: 'Sin Stock', value: data.graficos.distribucion_stock.sin_stock },
                                        { name: 'Stock Bajo', value: data.graficos.distribucion_stock.bajo },
                                        { name: 'Normal', value: data.graficos.distribucion_stock.normal }
                                    ]}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    outerRadius={80}
                                    dataKey="value"
                                >
                                    {data.graficos.distribucion_stock && [0,1,2].map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* PRODUCTOS CRÍTICOS (Moderador) */}
            {data.productos_criticos && data.productos_criticos.length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow mb-6">
                    <h3 className="text-lg font-semibold mb-4 text-red-600">📦 Productos con Stock Crítico</h3>
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-2 text-left">Producto</th>
                                <th className="px-4 py-2 text-center">Stock Actual</th>
                                <th className="px-4 py-2 text-center">Mínimo</th>
                                <th className="px-4 py-2 text-center">Faltante</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.productos_criticos.map(p => (
                                <tr key={p.id} className="border-b hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium">{p.nombre}</td>
                                    <td className="px-4 py-2 text-center text-red-600 font-bold">{p.stock_actual}</td>
                                    <td className="px-4 py-2 text-center">{p.stock_minimo}</td>
                                    <td className="px-4 py-2 text-center text-red-500">-{p.diferencia}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* MI ACTIVIDAD (Usuario) */}
            {data.mi_actividad_semanal && (
                <div className="bg-white p-6 rounded-lg shadow mb-6">
                    <h3 className="text-lg font-semibold mb-4">📊 Mi Actividad Semanal</h3>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.mi_actividad_semanal}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="dia" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="movimientos" fill="#3b82f6" name="Mis Movimientos" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* MOVIMIENTOS RECIENTES (Moderador) */}
            {data.movimientos_recientes && (
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-4">🔄 Movimientos Recientes del Equipo</h3>
                    <div className="space-y-2">
                        {data.movimientos_recientes.map(m => (
                            <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                                <div className="flex items-center gap-3">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        m.tipo === 'entrada' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {m.tipo === 'entrada' ? '⬇️ ENTRADA' : '⬆️ SALIDA'}
                                    </span>
                                    <span className="font-medium">{m.producto}</span>
                                    <span className="text-gray-500">x{m.cantidad}</span>
                                </div>
                                <div className="text-sm text-gray-500">
                                    por {m.usuario} • {new Date(m.fecha).toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Componente auxiliar para tarjetas de estadísticas
const StatCard = ({ titulo, valor, icono, color, alerta }: StatCardProps) => (
    <div className={`bg-white p-6 rounded-lg shadow border-l-4 ${
        alerta ? 'border-red-500 animate-pulse' : `border-${color}-500`
    }`}>
        <div className="flex items-center justify-between">
            <div>
                <p className="text-gray-500 text-sm">{titulo}</p>
                <p className="text-3xl font-bold text-gray-800">{valor}</p>
            </div>
            <span className="text-4xl">{icono}</span>
        </div>
    </div>
);

export default Dashboard;
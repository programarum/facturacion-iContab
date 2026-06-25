// Muestra los 4 estados de stock del diagrama
interface StockIndicatorsProps {
  stockActual: number;
  stockMinimo: number;
  stockMaximo: number;
}

const StockIndicator = ({stockActual, stockMinimo, stockMaximo}: StockIndicatorsProps ) => {
    const getEstado = () => {
    if (stockActual === 0) return { label: "Sin Stock", color: "bg-red-500", icon: "✕" };
    if (stockActual < stockMinimo) return { label: "Stock Bajo", color: "bg-yellow-500", icon: "⚠" };
    if (stockActual > stockMaximo) return { label: "Excede", color: "bg-blue-500", icon: "!" };
    return { label: "Normal", color: "bg-green-500", icon: "✓" };
  };
  const estado = getEstado();
  return (
    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-white text-sm ${estado.color}`}>
      <span>{estado.icon}</span>
      <span>{estado.label}</span>
    </div>
  )

}
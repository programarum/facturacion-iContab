// Entrada / Salida de productos

import { useState } from "react";

const Movimientos = () => {
  const [tipo, setTipo] = useState("entrada"); // "entrada" o "salida"

  const handleSubmit = async (e) => {
    e.preventDefault();
    await fetch("http://localhost:8000/movimientos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ producto_id, tipo, cantidad, nota }),
    });
  };
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Movimientos</h2>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setTipo("entrada")}
          className={`px-4 py-2 rounded ${tipo === "entrada" ? "bg-green-500 text-white" : "bg-gray-200"}`}
        >
          ⬇ Entrada
        </button>
        <button
          onClick={() => setTipo("salida")}
          className={`px-4 py-2 rounded ${tipo === "salida" ? "bg-red-500 text-white" : "bg-gray-200"}`}
        >
          ⬆ Salida
        </button>
      </div>

      {/* Formulario */}
    </div>
  );
};

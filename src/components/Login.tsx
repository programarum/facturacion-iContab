// src/components/Login.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";

const Login = () => {
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [intentos, setIntentos] = useState<number>(0);
  const [bloqueado, setBloqueado] = useState<boolean>(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (bloqueado) return;

    try {
      if (username.length < 3 || password.length < 8) {
        throw new Error("Credenciales inválidas");
      }

      await login(username, password);
      
      navigate("/facturacion");
    } catch (err: any) {
      setIntentos((prev) => prev + 1);

      if (intentos >= 4) {
        setBloqueado(true);
        setError("Demasiados intentos. Espere 30 minutos.");
        setTimeout(
          () => {
            setBloqueado(false);
            setIntentos(0);
          },
          30 * 60 * 1000,
        );
      } else {
        setError(err.message || "Error de autenticación");
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 ">
      <div className="w-96 bg-[#18161e] rounded-lg shadow-lg p-8">
        <div className="flex justify-center mb-6">
          <img src={logo} alt="Logo" className="h-16 w-auto" />
        </div>
        <h1 className="text-2xl font-bold mb-6 text-center text-white">
          Factura - iContab
        </h1>
        <p className="text-center text-gray-500 mb-6">Bienvenido de nuevo</p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usuario
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-[#1e1a26] text-white"
              placeholder="Ingrese el usuario"
              disabled={bloqueado}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition bg-[#1e1a26] text-white"
              placeholder="Contraseña"
              disabled={bloqueado}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            disabled={bloqueado}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-md transition duration-200"
          >
            {bloqueado ? "Bloqueado" : "Iniciar Sesión"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;

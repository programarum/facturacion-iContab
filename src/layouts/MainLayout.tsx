import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { DemoBadge } from "@demo";
import  logo  from "../assets/logo.png";


interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const ajustarSidebar = (event: MediaQueryListEvent) => setSidebarOpen(event.matches);
    media.addEventListener("change", ajustarSidebar);
    return () => media.removeEventListener("change", ajustarSidebar);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const menuByRole = {
    admin: [
      { path: "/dashboard", label: "Dashboard", icon: "📊" },
      { path: "/productos", label: "Productos", icon: "📦" },
      { path: "/categorias", label: "Categorías", icon: "📂" },
      { path: "/movimientos", label: "Movimientos", icon: "🔄" },
      { path: "/usuarios", label: "Usuarios", icon: "👥" },
      { path: "/configuracion", label: "Configuración", icon: "⚙️" },
    ],
    moderador: [
      { path: "/productos", label: "Productos", icon: "📦" },
      { path: "/categorias", label: "Categorías", icon: "📂" },
    ],
    usuario: [],
  };

  const menuItems = [
    { path: "/facturacion", label: "Facturación", icon: "🧾" },
    { path: "/historial-facturas", label: "Historial de facturas", icon: "📄" },
    ...(menuByRole[user?.rol as keyof typeof menuByRole] || []),

    // { path: '/facturacion', label: 'Facturación', icon: '🧾' },
    // ...(user?.rol === 'admin' ? [
    //   { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    //   { path: '/productos', label: 'Productos', icon: '📦' },
    //   { path: '/categorias', label: 'Categorías', icon: '📂' },
    //   { path: '/movimientos', label: 'Movimientos', icon: '🔄' },
    //   { path: '/usuarios', label: 'Usuarios', icon: '👥' },
    // ] : []),
  ];

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-gray-100">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-64 shrink-0 flex-col overflow-y-auto bg-gray-900 text-white transition-all duration-300 lg:static lg:z-auto lg:h-dvh ${
          sidebarOpen
            ? "translate-x-0 lg:w-64"
            : "-translate-x-full lg:w-0 lg:translate-x-0 lg:overflow-hidden"
        }`}
      >
        <div className="flex justify-center mb-2">
          <img src={logo} alt="Logo" className="h-16 w-auto" />
        </div>
        <div className="p-4">
          <h1 className="text-2xl font-bold text-center">
            Facturacion - iContab
          </h1>
          <p className="text-gray-400 text-sm text-center">
            Sistema de Facturación
          </p>
        </div>

        <nav className="mt-6">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-6 py-3 hover:bg-gray-800 transition-colors ${
                location.pathname === item.path
                  ? "bg-gray-800 border-l-4 border-blue-500"
                  : ""
              }`}
              onClick={() => {
                if (window.matchMedia("(max-width: 1023px)").matches) setSidebarOpen(false);
              }}
            >
              <span className="text-xl">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Navbar */}
        <header className="sticky top-0 z-30 shrink-0 bg-white shadow-sm">
          <div className="flex min-h-14 items-center justify-between gap-2 px-3 py-2 sm:px-4 lg:px-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="shrink-0 rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                aria-label={sidebarOpen ? "Ocultar menú" : "Mostrar menú"}
              >
                ☰
              </button>
              <h2 className="truncate text-base font-semibold text-gray-800 sm:text-lg">
                {menuItems.find((m) => m.path === location.pathname)?.label ||
                  "Sistema"}
              </h2>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-4">
              <DemoBadge />
              <div className="hidden max-w-40 text-right sm:block">
                <p className="truncate text-sm font-medium text-gray-900">
                  {user?.username}
                </p>
                <p className="text-xs text-gray-500 capitalize">{user?.rol}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-500 font-bold text-white sm:h-10 sm:w-10">
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <button
                onClick={handleLogout}
                className="rounded bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600 sm:px-4"
              >
                Salir
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
};

export default MainLayout;

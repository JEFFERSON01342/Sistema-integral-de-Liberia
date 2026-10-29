import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/authcontext";
import { puedeAcceder, rutaInicio } from "./roleAccess";

// Guardia por rol: bloquea el acceso a rutas no permitidas para el rol actual,
// redirigiendo a la pantalla de inicio correspondiente.
const RoleRoute = () => {
  const { rol, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-primary">
        <div className="w-16 h-16 border-4 border-button border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // path tipo "/dashboard/ventas" → "ventas"
  const segmentos = location.pathname.split("/").filter(Boolean);
  const path = segmentos[segmentos.length - 1];

  // La ruta índice de /dashboard la maneja el <Navigate> del router.
  if (!path || path === "dashboard") return <Outlet />;

  if (!puedeAcceder(rol, path)) {
    return <Navigate to={rutaInicio(rol)} replace />;
  }

  return <Outlet />;
};

export default RoleRoute;

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/authcontext";

const AppSplash = () => (
  <div className="admin-splash" role="status" aria-live="polite">
    <div className="admin-splash__content">
      <div className="admin-splash__mark">
        <img src="/brand-mark.svg" alt="" width="96" height="96" />
      </div>
      <h1 className="admin-splash__title">Librería Lisjuashde</h1>
      <p className="admin-splash__message">Preparando el panel administrativo</p>
      <div className="admin-splash__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>
);

const ProtectedRoute = () => {
  const { session, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AppSplash />;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  const requiereCambio = user?.user_metadata?.must_change_password === true;
  if (requiereCambio && location.pathname !== "/cambiar-contrasena") {
    return <Navigate to="/cambiar-contrasena" replace />;
  }
  if (!requiereCambio && location.pathname === "/cambiar-contrasena") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

export default ProtectedRoute;
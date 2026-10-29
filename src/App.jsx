import { Outlet, useNavigate, useLocation } from "react-router-dom"
import { useEffect } from "react";

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // La app es de una sola empresa: al entrar, ir directo al panel de Ventas.
    if (location.pathname === '/' ) {
      navigate('dashboard/ventas', { replace: true });
    }
  }, []);

  return (
    <>
      <Outlet/>
    </>
  )
}

export default App

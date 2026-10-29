import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '../App';
import Dashboard from '../pages/dashboard';
import Empresas from '../pages/empresas';
import Ventas from '../pages/ventas';
import PedidosWeb from '../pages/pedidosWeb';
import Impresiones from '../pages/impresiones';
import Clientes from '../pages/clientes';
import Inventario from '../pages/inventario';
import Proveedores from '../pages/proveedores';
import CajasBancos from '../pages/cajasbancos';
import ActivosFijos from '../pages/activosfijos';
import Personal from '../pages/personal';
import RecursosHumanos from '../pages/recursosHumanos';
import Marketing from '../pages/marketing';
import Reportes from '../pages/reportes';
import AnalisisFinanciero from '../pages/analisisfinanciero';
import OnBuilding from '../components/onbuiliding';
import GastosFijos from '../pages/GastosFijos';
import EstadosFinancieros from '../pages/estadosfinancieros';
import Proyecciones from '../pages/proyecciones';
import Sucursales from '../pages/sucursales';
import TerminalesPOS from '../pages/terminalesPOS';
import AperturaCierre from '../pages/aperturaCierre';
import AsignacionCajas from '../pages/asignacionCajas';
import Devoluciones from '../pages/devoluciones';
import Usuarios from '../pages/usuarios';
import Auditoria from '../pages/auditoria';
import Transferencias from '../pages/transferencias';
import Configuracion from '../pages/configuracion';
import Login from '../pages/login';
import ProtectedRoute from './protectedroute';
import RoleRoute from './RoleRoute';
import TicketsIT from '../pages/ticketsIT';
import VistaSucursales from '../pages/vistaSucursales';
import PlanCuentas from '../pages/planCuentas';
import ConfigContable from '../pages/configContable';
import PeriodosContables from '../pages/periodosContables';
import LibroMayor from '../pages/libroMayor';
import Comprobantes from '../pages/comprobantes';
import AntiguedadSaldos from '../pages/antiguedadSaldos';
import ConciliacionBancaria from '../pages/conciliacionBancaria';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // --- 1. RUTAS PÚBLICAS ---
      {
        path: 'login', // Ruta pública
        element: <Login />
      },

      // --- 2. RUTAS PROTEGIDAS ---
      {
        element: <ProtectedRoute />, // El "guardia"
        children: [
          {
            path: 'dashboard', // El layout principal
            element: <Dashboard />,
            children: [
              // Guardia por rol: envuelve todas las páginas internas.
              {
                element: <RoleRoute />,
                children: [
                  // Las páginas que se renderizan dentro del <Outlet> de Dashboard
                  { path: 'empresas', element: <Empresas /> },
                  { path: 'ventas', element: <Ventas /> },
                  { path: 'pedidosWeb', element: <PedidosWeb /> },
                  { path: 'impresiones', element: <Impresiones /> },
                  { path: 'clientes', element: <Clientes /> },
                  { path: 'inventario', element: <Inventario /> },
                  { path: 'proveedores', element: <Proveedores /> },
                  { path: 'cajabancos', element: <CajasBancos /> },
                  { path: 'activosFijos', element: <ActivosFijos /> },
                  { path: 'gastosFijos', element: <GastosFijos /> },
                  { path: 'personal', element: <Personal /> },
                  { path: 'recursosHumanos', element: <RecursosHumanos /> },
                  { path: 'marketing', element: <Marketing /> },
                  { path: 'estadosFinancieros', element: <EstadosFinancieros /> },
                  { path: 'analisis', element: <AnalisisFinanciero /> },
                  { path: 'reportes', element: <Reportes /> },
                  { path: 'proyecciones', element: <Proyecciones /> },
                  { path: 'sucursales', element: <Sucursales /> },
                  { path: 'terminalesPOS', element: <TerminalesPOS /> },
                  { path: 'aperturaCierre', element: <AperturaCierre /> },
                  { path: 'asignacionCajas', element: <AsignacionCajas /> },
                  { path: 'devoluciones', element: <Devoluciones /> },
                  { path: 'usuarios', element: <Usuarios /> },
                  { path: 'auditoria', element: <Auditoria /> },
                  { path: 'transferencias', element: <Transferencias /> },
                  { path: 'configuracion', element: <Configuracion /> },
                  { path: 'ticketsIT', element: <TicketsIT /> },
                  { path: 'vistaSucursales', element: <VistaSucursales /> },
                  { path: 'planCuentas', element: <PlanCuentas /> },
                  { path: 'configContable', element: <ConfigContable /> },
                  { path: 'periodosContables', element: <PeriodosContables /> },
                  { path: 'libroMayor', element: <LibroMayor /> },
                  { path: 'comprobantes', element: <Comprobantes /> },
                  { path: 'antiguedadSaldos', element: <AntiguedadSaldos /> },
                  { path: 'conciliacionBancaria', element: <ConciliacionBancaria /> },
                ]
              },
              // Si estás en '/dashboard', redirige a 'ventas'
              { index: true, element: <Navigate to="ventas" replace /> }
            ]
          }
        ]
      },

      // --- 3. REDIRECCIÓN RAÍZ ---
      {
        // Si alguien va a '/', lo envía a '/dashboard'
        index: true,
        element: <Navigate to="/dashboard" replace />
      }
    ]
  }
]);

export default router;
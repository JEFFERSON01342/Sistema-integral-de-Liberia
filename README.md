# Librería Lisjuashde — Sistema Administrativo

Panel administrativo (ERP) de Librería Lisjuashde. Esta aplicación React se mantiene en un repositorio separado de la tienda web y utiliza Supabase como base de datos y servicio de autenticación.

- **Producción:** [sistema-integral-de-liberia.vercel.app](https://sistema-integral-de-liberia.vercel.app)
- **Repositorio Admin:** [JEFFERSON01342/Sistema-integral-de-Liberia](https://github.com/JEFFERSON01342/Sistema-integral-de-Liberia)
- **Repositorio Web:** [JEFFERSON01342/Proyecto-liberia-web](https://github.com/JEFFERSON01342/Proyecto-liberia-web)
- **Proyecto Supabase:** `uxnyrawgtumpbtfidcwm`
- **Empresa principal:** Librería Lisjuashde (`VITE_LIBRERIA_EMPRESA_ID=1`)
- **Moneda / idioma:** córdoba nicaragüense (C$) / español

## Módulos

El panel cubre operaciones de sucursal, incluyendo ventas y caja, inventario y Bodega, órdenes de compra y recepciones, proveedores, transferencias, usuarios, contabilidad, reportes y otros módulos administrativos.

El punto de venta admite lectura de códigos de barras. Las recepciones de compra actualizan existencias y movimientos de inventario; estas operaciones están respaldadas por funciones y políticas de Supabase.

## Roles actuales

- **Superadministrador:** acceso global de administración.
- **Administrador de sucursal:** administración de su sucursal y módulos financieros/operativos autorizados.
- **Gerente:** operaciones y reportes de su sucursal.
- **Contador:** módulos contables autorizados; no tiene acceso operativo general a la sucursal.
- **Cajero:** operaciones de venta/caja autorizadas.
- **Despacho:** acceso a pedidos web y funciones de despacho autorizadas.
- **Supervisor de Bodega (`bodega`):** módulo de Bodega y operaciones de inventario de su sucursal.
- **Cliente:** cuenta de la tienda, sin acceso al panel administrativo.

El menú y las rutas se filtran por rol en React. Supabase también aplica controles de autorización y Row Level Security (RLS); ocultar un enlace no sustituye los permisos del servidor.

## Alcance por sucursal

Se inició el selector de alcance de sesión para el superadministrador desde **Vista de sucursales**: permite elegir una sucursal o toda la empresa y conserva la selección al navegar por el Admin. Los demás roles mantienen el alcance de su sucursal asignada. Estados Financieros y Proyecciones ya envían el alcance a RPC con filtro por sucursal; nómina y los demás módulos aún deben conectarse por etapas, ajustando también las RPC y validaciones del servidor cuando corresponda. No interpretar la etiqueta global del encabezado como evidencia de que todos los módulos ya están filtrados.

La fase financiera añade filtros de sucursal en **Estados Financieros** y **Proyecciones**. Las RPC con firma de filtro conservan las funciones antiguas para compatibilidad con los demás módulos. La migración `20261029235000_reportes_financieros_por_sucursal.sql` debe aplicarse y probarse en Supabase antes de publicar esta versión; los otros módulos todavía no heredan automáticamente el filtro.

## Bodega: alcance actual y mejoras pendientes

La versión desplegada permite consultar existencias por ubicación, revisar órdenes pendientes de recepción, registrar recepciones de compra, ver movimientos recientes y crear ubicaciones. El acceso de Bodega está limitado a la sucursal asignada. La recepción tiene una autorización específica, separada del permiso general para operar caja.

La implementación local añade trazabilidad por lote: etiqueta interna `LT-*` separada del código de barras del producto, datos de proveedor/recepción/costo/vencimiento, consulta e historial por escaneo, y revisión antes de permitir el traslado a `PICKING` (área de venta). La disponibilidad de lotes pendientes o vencidos se excluye de la tienda, POS y crédito. **Esta funcionalidad aún no está disponible en Supabase ni en Vercel:** la migración `20261029234000_lotes_trazabilidad_revision.sql` sigue pendiente de aplicar y validar.

Este módulo todavía es una primera versión. Para completarlo, se recomienda:

1. **Administrar ubicaciones:** editar datos, activar/desactivar y, si el diseño lo permite, reubicar existencias con trazabilidad; evitar eliminar ubicaciones que tengan historial o inventario.
2. **Completar la estructura física:** administrar bodegas, áreas, pasillos, estantes, niveles y posiciones con permisos y validaciones consistentes.
3. **Añadir análisis e informes:** existencias y movimientos filtrables por período, producto y ubicación; entradas/salidas, ajustes, diferencias, productos de baja rotación y alertas de stock mínimo.
4. **Organizar Bodega en submódulos:** por ejemplo, Resumen, Existencias, Ubicaciones, Recepciones, Movimientos e Informes. Mantener el acceso a cada submódulo explícito por rol.
5. **Cerrar el flujo de abastecimiento:** revisar órdenes de compra y transferencias entre sucursales/bodegas, incluyendo estados, recepción parcial, historial y responsables.
6. **Validar con personal real:** asignar una cuenta de prueba con rol Bodega y comprobar lecturas, recepciones y límites de sucursal desde la aplicación y las políticas RLS.

## Trabajo registrado al 29 de octubre de 2026

- Se retiró el rol **Vendedor**, que no se utiliza en la sucursal.
- Se añadió el rol **Contador** con acceso acotado a las funciones de contabilidad previstas.
- Se añadió el rol **Supervisor de Bodega** y se conectó con la navegación, el inicio del panel, la asignación de usuarios y las consultas del módulo.
- Se limitaron en Supabase las consultas de Bodega a su sucursal y a los datos que requiere. No se extendieron sus permisos de caja ni de cuentas por pagar.
- Se aplicaron en Supabase las migraciones de retiro de Vendedor, Contador y Bodega. Las definiciones remotas de autorización se comprobaron tras aplicar el rol de Bodega.
- Se publicó el Admin en Vercel desde `main`. El despliegue asociado al commit `9ef1eb9` quedó **Ready** y la URL de producción carga el inicio de sesión.
- Se verificaron compilación de producción y ESLint dirigido para los archivos de la implementación de Bodega. El build presenta la advertencia existente de que el bundle principal supera 500 kB.

La publicación confirma que la aplicación compila y se sirve, pero no equivale a una prueba funcional completa de inicio de sesión, permisos, sucursales, ventas o recepción.

## Pendientes generales

- Probar en producción, con cuentas de prueba, cada rol y sus restricciones de sucursal; actualmente no se verificó un inicio de sesión funcional por rol.
- Continuar la evolución de Bodega conforme a la lista anterior.
- Revisar los flujos completos de compra, recepción, inventario, transferencia y conciliación contable con datos de prueba antes del uso operativo.
- Confirmar en Supabase Auth los dominios permitidos de la aplicación Admin y la tienda web, incluidos los dominios de producción de Vercel.
- Verificar y desplegar la tienda web por separado cuando se trabaje en su repositorio. El despliegue documentado aquí corresponde únicamente al Admin.
- Mantener sincronizadas las migraciones versionadas de `supabase/migrations` con la base remota y probar los cambios de base de datos antes de modificar el entorno productivo.

## Desarrollo local

Requisitos: Node.js y npm.

```bash
npm install
```

Crea un archivo `.env` en la raíz del proyecto:

```dotenv
VITE_SUPABASE_URL=https://uxnyrawgtumpbtfidcwm.supabase.co
VITE_SUPABASE_ANON_KEY=tu_clave_publicable_de_supabase
VITE_LIBRERIA_EMPRESA_ID=1
```

La clave publicable (antes llamada anon key) puede usarse en el frontend junto con las políticas RLS. **Nunca** incluyas una clave `service_role` en el código del navegador, `.env` versionado o variables `VITE_*`.

Comandos disponibles:

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Tecnologías

- React 19 y Vite
- Tailwind CSS
- Supabase (PostgreSQL, Auth, Storage y RLS)
- ESLint
- Vercel para el despliegue de producción del Admin

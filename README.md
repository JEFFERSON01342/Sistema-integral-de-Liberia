# Librería Lisjuashde — Sistema Administrativo (ERP) 🏢

Panel administrativo / **ERP** de **Librería Lisjuashde**, desarrollado como parte del proyecto académico de **Ingeniería de Software I** — Universidad Nacional de Ingeniería (UNI), Nicaragua.

Esta es la **parte administrativa** del sistema, separada por completo de la tienda pública. Desde aquí el personal gestiona ventas, inventario, proveedores, recursos humanos, nómina, usuarios y reportes del negocio.

🔗 **Producción:** https://librerialisjuashdesystem.netlify.app

---

## ✨ Módulos principales

- **Dashboard** con resumen del negocio y menú filtrado por rol.
- **Ventas / Punto de venta**: registro de ventas, validación de caja abierta, control de crédito y descuentos (según rol).
- **Inventario**: alta/edición/eliminación de productos, códigos de barra **EAN-13**.
- **Proveedores**: gestión completa de proveedores.
- **Recursos Humanos (RRHH)**:
  - Empleados (pago de salario, editar, dar de baja).
  - Contratos, Vacaciones/Permisos, Seguridad e Higiene, Marco Legal y Cumplimiento.
- **Nómina / pago de salarios**.
- **Usuarios**: creación de usuarios **seleccionando un empleado existente** de la lista (no se escribe el nombre manualmente).
- **Marketing y promociones**.
- **Reportes** y **facturas en PDF**.
- **Resumen de cajas**.

---

## 🔐 Roles y permisos

- **Superadministrador**: control total del sistema.
- **Gerente**: gestiona productos y nómina de su sucursal.
- **Administrador (Admin)**: administra únicamente **su sucursal asignada**; no puede añadir sucursales.
- **Cajero**: registro de ventas con restricciones (sin ciertos campos de descuento/crédito).

El menú y los campos visibles se adaptan dinámicamente según el rol autenticado. El perfil se cachea para evitar la elevación de permisos durante la renovación del token.

---

## 🧰 Tecnologías

- **React 18** + **Vite**
- **Tailwind CSS**
- **Supabase** (PostgreSQL) como backend/base de datos
- **jsPDF** para facturas y reportes PDF
- **Netlify** para el hosting

---

## 🚀 Puesta en marcha (desarrollo local)

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno (archivo .env en la raíz)
#    VITE_SUPABASE_URL=...
#    VITE_SUPABASE_ANON_KEY=...
#    VITE_LIBRERIA_EMPRESA_ID=1

# 3. Levantar el servidor de desarrollo
npm run dev

# 4. Compilar para producción
npm run build
```

---

## 📦 Estructura del proyecto

```
src/
├── components/
│   ├── nuevaVenta.jsx        # Registro de ventas (campos según rol)
│   ├── nuevoProducto.jsx     # Alta de productos
│   ├── nuevoProveedor.jsx    # Alta de proveedores
│   ├── empleadosCards.jsx    # Tarjetas de empleados (pagar, editar, baja)
│   └── rrhh/                 # CRUD de módulos de Recursos Humanos
├── contexts/
│   └── authcontext.jsx       # Autenticación y cacheo de perfil
├── pages/
│   ├── dashboard.jsx         # Menú filtrado por rol
│   ├── usuarios.jsx          # Gestión de usuarios (desde empleados)
│   └── recursosHumanos.jsx   # Módulo RRHH
└── ...
```

---

## 🏢 Sobre el sistema

Librería Lisjuashde está dividida en dos aplicaciones independientes que comparten una misma base de datos Supabase:

| Aplicación | Descripción | Repositorio |
|------------|-------------|-------------|
| **Sistema Admin (ERP)** (este repo) | Panel administrativo del negocio | [Libreria-Lisjuashde-Admin-Project](https://github.com/Stevenalv123/Libreria-Lisjuashde-Admin-Project) |
| **Web Cliente** | Tienda pública para clientes | [Libreria-Lisjuashde-Web-Client](https://github.com/Stevenalv123/Libreria-Lisjuashde-Web-Client) |

- Empresa fija: **Librería Lisjuashde** (`EMPRESA_ID = 1`).
- Moneda: **córdoba nicaragüense (C$)**.
- Idioma: **español**.

---

## 👥 Proyecto académico

Desarrollado para la asignatura **Ingeniería de Software I** — Universidad Nacional de Ingeniería (UNI), Nicaragua.

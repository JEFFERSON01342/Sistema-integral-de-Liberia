// Configuraciones (campos de formulario + columnas de tabla) para las
// secciones operativas de Recursos Humanos. Consumidas por RRHHCrud.

export const CONTRATOS_CFG = {
  tabla: "contratos",
  titulo: "Contratos",
  subtitulo: "Contratos laborales del personal",
  ordenarPor: "fecha_inicio",
  campos: [
    { name: "id_empleado", label: "Empleado", type: "empleado", required: true },
    { name: "cargo", label: "Cargo", type: "puesto", required: true },
    { name: "tipo_contrato", label: "Tipo de contrato", type: "select", default: "indefinido", options: [
      { value: "indefinido", label: "Indefinido" },
      { value: "determinado", label: "Tiempo determinado" },
      { value: "por_obra", label: "Por obra o servicio" },
      { value: "temporal", label: "Temporal" },
    ] },
    { name: "jornada", label: "Jornada", type: "select", default: "tiempo_completo", options: [
      { value: "tiempo_completo", label: "Tiempo completo" },
      { value: "medio_tiempo", label: "Medio tiempo" },
    ] },
    { name: "salario", label: "Salario mensual del contrato (C$)", type: "money", default: 0, required: true, hint: "La nómina usa el salario mensual de la ficha del empleado. Para medio tiempo, registra allí el monto mensual acordado; no se divide automáticamente a la mitad. Cambiar este contrato no actualiza la ficha del empleado." },
    { name: "fecha_inicio", label: "Fecha de inicio", type: "date", required: true },
    { name: "fecha_fin", label: "Fecha de fin", type: "date" },
    { name: "estado", label: "Estado", type: "select", default: "vigente", options: [
      { value: "vigente", label: "Vigente" },
      { value: "finalizado", label: "Finalizado" },
      { value: "suspendido", label: "Suspendido" },
      { value: "rescindido", label: "Rescindido" },
    ] },
    { name: "clausulas", label: "Cláusulas / notas", type: "textarea", full: true },
  ],
  columnas: [
    { name: "id_empleado", label: "Empleado", type: "empleado" },
    { name: "cargo", label: "Cargo" },
    { name: "tipo_contrato", label: "Tipo", type: "badge" },
    { name: "salario", label: "Salario", type: "money", align: "right" },
    { name: "fecha_inicio", label: "Inicio", type: "date", align: "center" },
    { name: "fecha_fin", label: "Fin", type: "date", align: "center" },
    { name: "estado", label: "Estado", type: "badge", align: "center" },
  ],
};

export const VACACIONES_CFG = {
  tabla: "vacaciones_permisos",
  titulo: "Vacaciones y Permisos",
  subtitulo: "Solicitudes de vacaciones, permisos, subsidios e incapacidades",
  ordenarPor: "fecha_inicio",
  campos: [
    { name: "id_empleado", label: "Empleado", type: "empleado", required: true },
    { name: "tipo", label: "Tipo", type: "select", default: "vacaciones", options: [
      { value: "vacaciones", label: "Vacaciones" },
      { value: "permiso_con_goce", label: "Permiso con goce" },
      { value: "permiso_sin_goce", label: "Permiso sin goce" },
      { value: "subsidio", label: "Subsidio" },
      { value: "incapacidad", label: "Incapacidad" },
    ] },
    { name: "fecha_inicio", label: "Desde", type: "date", required: true },
    { name: "fecha_fin", label: "Hasta", type: "date", required: true },
    { name: "dias", label: "Días", type: "number", default: 1 },
    { name: "estado", label: "Estado", type: "select", default: "solicitado", options: [
      { value: "solicitado", label: "Solicitado" },
      { value: "aprobado", label: "Aprobado" },
      { value: "rechazado", label: "Rechazado" },
      { value: "gozado", label: "Gozado" },
    ] },
    { name: "aprobado_por", label: "Aprobado por", type: "text" },
    { name: "motivo", label: "Motivo", type: "textarea", full: true },
  ],
  columnas: [
    { name: "id_empleado", label: "Empleado", type: "empleado" },
    { name: "tipo", label: "Tipo", type: "badge" },
    { name: "fecha_inicio", label: "Desde", type: "date", align: "center" },
    { name: "fecha_fin", label: "Hasta", type: "date", align: "center" },
    { name: "dias", label: "Días", align: "right" },
    { name: "estado", label: "Estado", type: "badge", align: "center" },
  ],
};

export const ASISTENCIAS_CFG = {
  tabla: "asistencias",
  titulo: "Asistencia",
  subtitulo: "Registro diario de entradas, salidas e incidencias",
  ordenarPor: "fecha",
  campos: [
    { name: "id_empleado", label: "Empleado", type: "empleado", required: true },
    { name: "fecha", label: "Fecha", type: "date", required: true },
    { name: "hora_entrada", label: "Hora de entrada", type: "time" },
    { name: "hora_salida", label: "Hora de salida", type: "time" },
    { name: "estado", label: "Estado", type: "select", default: "presente", options: [
      { value: "presente", label: "Presente" },
      { value: "ausente", label: "Ausente" },
      { value: "tardanza", label: "Tardanza" },
      { value: "permiso", label: "Permiso" },
      { value: "incapacidad", label: "Incapacidad" },
    ] },
    { name: "observaciones", label: "Observaciones", type: "textarea", full: true },
  ],
  columnas: [
    { name: "id_empleado", label: "Empleado", type: "empleado" },
    { name: "fecha", label: "Fecha", type: "date", align: "center" },
    { name: "hora_entrada", label: "Entrada", align: "center" },
    { name: "hora_salida", label: "Salida", align: "center" },
    { name: "estado", label: "Estado", type: "badge", align: "center" },
  ],
};

export const PRESTACIONES_CFG = {
  puedeEliminar: false,
  tabla: "prestaciones_laborales",
  titulo: "Prestaciones",
  subtitulo: "Registro de provisiones y pagos; los importes requieren validación laboral",
  ordenarPor: "created_at",
  campos: [
    { name: "id_empleado", label: "Empleado", type: "empleado", required: true },
    { name: "tipo", label: "Tipo", type: "select", default: "aguinaldo", options: [
      { value: "aguinaldo", label: "Aguinaldo" },
      { value: "vacaciones", label: "Vacaciones" },
      { value: "indemnizacion", label: "Indemnización" },
      { value: "bono", label: "Bono" },
      { value: "otro", label: "Otro" },
    ] },
    { name: "periodo_inicio", label: "Inicio del período", type: "date" },
    { name: "periodo_fin", label: "Fin del período", type: "date" },
    { name: "monto", label: "Monto (C$)", type: "money", default: 0, required: true },
    { name: "estado", label: "Estado", type: "select", default: "provisionada", options: [
      { value: "provisionada", label: "Provisionada" },
      { value: "pagada", label: "Pagada" },
      { value: "anulada", label: "Anulada" },
    ] },
    { name: "fecha_pago", label: "Fecha de pago", type: "date" },
    { name: "concepto", label: "Concepto", type: "textarea", full: true },
  ],
  columnas: [
    { name: "id_empleado", label: "Empleado", type: "empleado" },
    { name: "tipo", label: "Tipo", type: "badge" },
    { name: "periodo_inicio", label: "Inicio", type: "date", align: "center" },
    { name: "periodo_fin", label: "Fin", type: "date", align: "center" },
    { name: "monto", label: "Monto", type: "money", align: "right" },
    { name: "estado", label: "Estado", type: "badge", align: "center" },
  ],
};

export const SEGURIDAD_CFG = {
  tabla: "seguridad_higiene",
  titulo: "Seguridad e Higiene",
  subtitulo: "Capacitaciones, inspecciones, accidentes e incidentes laborales",
  ordenarPor: "fecha",
  campos: [
    { name: "titulo", label: "Título", type: "text", required: true, full: true },
    { name: "tipo", label: "Tipo", type: "select", default: "capacitacion", options: [
      { value: "capacitacion", label: "Capacitación" },
      { value: "inspeccion", label: "Inspección" },
      { value: "accidente", label: "Accidente" },
      { value: "incidente", label: "Incidente" },
      { value: "epp", label: "Equipo de protección (EPP)" },
      { value: "simulacro", label: "Simulacro" },
    ] },
    { name: "fecha", label: "Fecha", type: "date", required: true },
    { name: "severidad", label: "Severidad", type: "select", default: "baja", options: [
      { value: "baja", label: "Baja" },
      { value: "media", label: "Media" },
      { value: "alta", label: "Alta" },
    ] },
    { name: "id_empleado", label: "Empleado (opcional)", type: "empleado" },
    { name: "responsable", label: "Responsable", type: "text" },
    { name: "estado", label: "Estado", type: "select", default: "abierto", options: [
      { value: "abierto", label: "Abierto" },
      { value: "en_proceso", label: "En proceso" },
      { value: "cerrado", label: "Cerrado" },
    ] },
    { name: "descripcion", label: "Descripción", type: "textarea", full: true },
    { name: "acciones", label: "Acciones tomadas", type: "textarea", full: true },
  ],
  columnas: [
    { name: "titulo", label: "Título" },
    { name: "tipo", label: "Tipo", type: "badge" },
    { name: "fecha", label: "Fecha", type: "date", align: "center" },
    { name: "severidad", label: "Severidad", type: "badge", align: "center" },
    { name: "responsable", label: "Responsable" },
    { name: "estado", label: "Estado", type: "badge", align: "center" },
  ],
};

export const MARCO_LEGAL_CFG = {
  tabla: "marco_legal",
  titulo: "Documentos del Marco Legal",
  subtitulo: "Registro de normativa y documentos legales de la empresa",
  ordenarPor: "created_at",
  campos: [
    { name: "nombre_documento", label: "Nombre del documento", type: "text", required: true, full: true },
    { name: "categoria", label: "Categoría", type: "select", default: "laboral", options: [
      { value: "laboral", label: "Laboral" },
      { value: "fiscal", label: "Fiscal" },
      { value: "seguridad_social", label: "Seguridad social" },
      { value: "municipal", label: "Municipal" },
      { value: "mercantil", label: "Mercantil" },
    ] },
    { name: "entidad", label: "Entidad", type: "select", default: "MITRAB", options: [
      { value: "MITRAB", label: "MITRAB" },
      { value: "INSS", label: "INSS" },
      { value: "DGI", label: "DGI" },
      { value: "INATEC", label: "INATEC" },
      { value: "Alcaldía", label: "Alcaldía" },
    ] },
    { name: "referencia_legal", label: "Referencia legal (Ley/Arto.)", type: "text" },
    { name: "fecha_vencimiento", label: "Fecha de vencimiento", type: "date" },
    { name: "estado", label: "Estado", type: "select", default: "vigente", options: [
      { value: "vigente", label: "Vigente" },
      { value: "por_renovar", label: "Por renovar" },
      { value: "vencido", label: "Vencido" },
    ] },
    { name: "archivo_url", label: "Enlace al archivo", type: "text", full: true },
    { name: "descripcion", label: "Descripción", type: "textarea", full: true },
  ],
  columnas: [
    { name: "nombre_documento", label: "Documento" },
    { name: "categoria", label: "Categoría", type: "badge" },
    { name: "entidad", label: "Entidad", align: "center" },
    { name: "referencia_legal", label: "Referencia" },
    { name: "fecha_vencimiento", label: "Vence", type: "date", align: "center" },
    { name: "estado", label: "Estado", type: "badge", align: "center" },
  ],
};

export const CUMPLIMIENTO_CFG = {
  tabla: "cumplimiento_obligaciones",
  titulo: "Cumplimiento",
  subtitulo: "Obligaciones tributarias y laborales recurrentes (DGI, INSS, INATEC, MITRAB, Alcaldía)",
  ordenarPor: "fecha_limite",
  campos: [
    { name: "obligacion", label: "Obligación", type: "text", required: true, full: true },
    { name: "entidad", label: "Entidad", type: "select", default: "DGI", options: [
      { value: "DGI", label: "DGI" },
      { value: "INSS", label: "INSS" },
      { value: "INATEC", label: "INATEC" },
      { value: "MITRAB", label: "MITRAB" },
      { value: "Alcaldía", label: "Alcaldía" },
    ] },
    { name: "periodicidad", label: "Periodicidad", type: "select", default: "mensual", options: [
      { value: "mensual", label: "Mensual" },
      { value: "trimestral", label: "Trimestral" },
      { value: "anual", label: "Anual" },
      { value: "unica", label: "Única" },
    ] },
    { name: "periodo", label: "Período (ej. 2026-09)", type: "text" },
    { name: "fecha_limite", label: "Fecha límite", type: "date", required: true },
    { name: "monto", label: "Monto (C$)", type: "money", default: 0 },
    { name: "estado", label: "Estado", type: "select", default: "pendiente", options: [
      { value: "pendiente", label: "Pendiente" },
      { value: "presentado", label: "Presentado" },
      { value: "vencido", label: "Vencido" },
    ] },
    { name: "responsable", label: "Responsable", type: "text" },
    { name: "comprobante", label: "N° comprobante / recibo", type: "text" },
    { name: "notas", label: "Notas", type: "textarea", full: true },
  ],
  columnas: [
    { name: "obligacion", label: "Obligación" },
    { name: "entidad", label: "Entidad", align: "center" },
    { name: "periodicidad", label: "Periodicidad", type: "badge", align: "center" },
    { name: "periodo", label: "Período", align: "center" },
    { name: "fecha_limite", label: "Límite", type: "date", align: "center" },
    { name: "monto", label: "Monto", type: "money", align: "right" },
    { name: "estado", label: "Estado", type: "badge", align: "center" },
  ],
};

import { Scale, Landmark, ShieldCheck, Building, ExternalLink } from "lucide-react";

// Panel informativo del marco legal laboral y fiscal aplicable en Nicaragua.
// Referencia operativa para el personal de RRHH. El registro documental
// editable se maneja en la tabla de abajo (marco_legal).
const BLOQUES = [
  {
    icon: <Scale size={18} className="text-blue-400" />,
    titulo: "Legislación Laboral",
    entidad: "MITRAB",
    items: [
      "Ley No. 185 — Código del Trabajo (contratos, jornadas, descansos).",
      "Salario mínimo por sector (Comercio y Servicios) según acuerdo ministerial vigente.",
      "Vacaciones: 15 días por cada 6 meses continuos (30 días/año).",
      "Aguinaldo (13º mes): equivalente a 1 mes de salario, pagadero en diciembre.",
      "La liquidación y el finiquito requieren cálculo específico; este sistema todavía no los calcula.",
    ],
  },
  {
    icon: <ShieldCheck size={18} className="text-green-400" />,
    titulo: "Seguridad Social",
    entidad: "INSS",
    items: [
      "Ley No. 539 — Ley de Seguridad Social.",
      "Las tasas heredadas de INSS (7% y 21.5%) e INATEC (2%) están pendientes de validación oficial vigente; no se certifican aquí.",
      "Afiliación obligatoria del trabajador desde su ingreso.",
    ],
  },
  {
    icon: <Landmark size={18} className="text-amber-400" />,
    titulo: "Obligaciones Fiscales",
    entidad: "DGI",
    items: [
      "Ley No. 822 — Ley de Concertación Tributaria (LCT).",
      "La FAQ de DGI describe retención progresiva acumulativa por meses e ingresos; los ejemplos publicados son de 2013 y no confirman por sí solos la tabla vigente.",
      "IVA 15% en ventas gravadas; declaración y pago mensual.",
      "Anticipo IR / pago mínimo definitivo (1% sobre ingresos brutos mensuales).",
      "Retenciones en la fuente y declaración mensual en la VET (Ventanilla Electrónica Tributaria).",
    ],
  },
  {
    icon: <Building size={18} className="text-purple-400" />,
    titulo: "Obligaciones Municipales",
    entidad: "Alcaldía",
    items: [
      "Impuesto Municipal sobre Ingresos (IMI): 1% sobre ventas mensuales.",
      "Matrícula anual del negocio.",
      "Impuesto de Bienes Inmuebles (IBI) cuando aplique.",
    ],
  },
];

export default function MarcoLegalInfo() {
  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {BLOQUES.map((b) => (
          <div key={b.titulo} className="border border-secondary rounded-2xl p-5 bg-secondary/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {b.icon}
                <h4 className="text-title font-bold">{b.titulo}</h4>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-secondary text-subtitle">{b.entidad}</span>
            </div>
            <ul className="space-y-1.5">
              {b.items.map((it) => (
                <li key={it} className="text-sm text-subtitle flex gap-2">
                  <span className="text-button mt-0.5">•</span>
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
        Las tasas y tablas mostradas por el sistema son heredadas y requieren confirmación para el período fiscal y régimen aplicables. DGI valida obligaciones tributarias; MITRAB e INSS son las referencias laborales y de seguridad social.
        <div className="mt-3 flex flex-wrap gap-4">
          <a className="inline-flex items-center gap-1 underline" href="https://www.mitrab.gob.ni/documentos/leyes/Ley185Nic.pdf/view" target="_blank" rel="noreferrer">MITRAB · Código del Trabajo <ExternalLink size={14} /></a>
          <a className="inline-flex items-center gap-1 underline" href="https://www.dgi.gob.ni/FAQ/periodo_fiscal_y_tarifa_del_im.htm" target="_blank" rel="noreferrer">DGI · retención de IR <ExternalLink size={14} /></a>
          <a className="inline-flex items-center gap-1 underline" href="https://inss-princ.inss.gob.ni/index.php/32-uncategorised/119-preguntas-frecuentes" target="_blank" rel="noreferrer">INSS · preguntas frecuentes <ExternalLink size={14} /></a>
        </div>
        <p className="mt-2 text-xs">No se confirmó en las publicaciones oficiales recuperadas una tabla/tasa vigente de cotización INSS/INATEC ni la vigencia actual de la tarifa aplicada por el cálculo local.</p>
      </div>
    </div>
  );
}

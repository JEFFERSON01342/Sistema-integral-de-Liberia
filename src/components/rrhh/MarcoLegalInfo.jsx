import { Scale, Landmark, ShieldCheck, Building } from "lucide-react";

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
      "Indemnización por antigüedad (arto. 45): hasta 5 meses de salario.",
    ],
  },
  {
    icon: <ShieldCheck size={18} className="text-green-400" />,
    titulo: "Seguridad Social",
    entidad: "INSS",
    items: [
      "Ley No. 539 — Ley de Seguridad Social.",
      "Cotización laboral: 7% del salario bruto (retención al trabajador).",
      "Cotización patronal: 21.5% del salario bruto (régimen integral).",
      "INATEC: 2% sobre la nómina bruta (aporte patronal).",
      "Afiliación obligatoria del trabajador desde su ingreso.",
    ],
  },
  {
    icon: <Landmark size={18} className="text-amber-400" />,
    titulo: "Obligaciones Fiscales",
    entidad: "DGI",
    items: [
      "Ley No. 822 — Ley de Concertación Tributaria (LCT).",
      "IR sobre rentas del trabajo: tabla progresiva (exento hasta C$100,000 anuales).",
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
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
            {b.items.map((it, i) => (
              <li key={i} className="text-sm text-subtitle flex gap-2">
                <span className="text-button mt-0.5">•</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

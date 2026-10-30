import { Save } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { useProveedores } from "../hooks/useProveedores";

export default function NuevoProveedor({ onClose, proveedor = null }) {
    const { agregarProveedor, actualizarProveedor } = useProveedores();
    const [guardando, setGuardando] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setGuardando(true);
        const datos = {
            id_proveedor: proveedor?.id_proveedor,
            nombre: formData.get("nombre"),
            nombre_legal: formData.get("nombre_legal"),
            identificacion_fiscal: formData.get("identificacion_fiscal"),
            email: formData.get("email"),
            telefono: formData.get("telefono"),
            direccion: formData.get("direccion"),
            plazo_credito_dias: formData.get("plazo_credito_dias"),
            cantidad_cuotas_credito: formData.get("cantidad_cuotas_credito"),
            frecuencia_cuotas_credito_dias: formData.get("frecuencia_cuotas_credito_dias"),
            anticipo_credito_porcentaje: formData.get("anticipo_credito_porcentaje"),
        };
        const resultado = proveedor
            ? await actualizarProveedor(datos)
            : await agregarProveedor(datos);
        setGuardando(false);

        if (!resultado.success) {
            toast.error(resultado.message || "No se pudo guardar el proveedor.");
            return;
        }
        toast.success(proveedor ? "Proveedor actualizado." : "Proveedor agregado correctamente.");
        onClose();
    };

    return (
        <div className="bg-primary text-title p-6 md:p-8 rounded-2xl w-full max-w-3xl shadow-lg animate-fade-in border border-secondary max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-semibold">{proveedor ? "Editar proveedor" : "Nuevo proveedor"}</h3>
            </div>
            <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-nombre" className="text-sm font-medium text-title">Nombre comercial</label>
                        <input id="proveedor-nombre" name="nombre" type="text" required maxLength={120} defaultValue={proveedor?.nombre_comercial || proveedor?.nombre || ""} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-legal" className="text-sm font-medium text-title">Razón social</label>
                        <input id="proveedor-legal" name="nombre_legal" type="text" maxLength={160} defaultValue={proveedor?.razon_social || proveedor?.nombre_legal || ""} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-ruc" className="text-sm font-medium text-title">Identificación fiscal</label>
                        <input id="proveedor-ruc" name="identificacion_fiscal" type="text" maxLength={80} defaultValue={proveedor?.identificacion_fiscal || ""} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-email" className="text-sm font-medium text-title">Correo electrónico</label>
                        <input id="proveedor-email" name="email" type="email" maxLength={254} defaultValue={proveedor?.email || ""} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-telefono" className="text-sm font-medium text-title">Teléfono</label>
                        <input id="proveedor-telefono" name="telefono" type="tel" maxLength={40} defaultValue={proveedor?.telefono || ""} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-plazo" className="text-sm font-medium text-title">Plazo de crédito (días)</label>
                        <input id="proveedor-plazo" name="plazo_credito_dias" type="number" min="0" max="365" step="1" defaultValue={proveedor?.plazo_credito_dias ?? "0"} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="md:col-span-2 flex flex-col gap-2">
                        <label htmlFor="proveedor-direccion" className="text-sm font-medium text-title">Dirección</label>
                        <input id="proveedor-direccion" name="direccion" type="text" maxLength={250} defaultValue={proveedor?.direccion || ""} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-cuotas" className="text-sm font-medium text-title">Cuotas de crédito</label>
                        <input id="proveedor-cuotas" name="cantidad_cuotas_credito" type="number" min="1" max="120" step="1" defaultValue={proveedor?.cantidad_cuotas_credito ?? "1"} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-frecuencia" className="text-sm font-medium text-title">Días entre cuotas</label>
                        <input id="proveedor-frecuencia" name="frecuencia_cuotas_credito_dias" type="number" min="1" max="365" step="1" defaultValue={proveedor?.frecuencia_cuotas_credito_dias ?? "30"} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label htmlFor="proveedor-anticipo" className="text-sm font-medium text-title">Anticipo de crédito (%)</label>
                        <input id="proveedor-anticipo" name="anticipo_credito_porcentaje" type="number" min="0" max="100" step="0.01" defaultValue={proveedor?.anticipo_credito_porcentaje ?? "0"} className="bg-input border border-secondary rounded-lg p-3" />
                    </div>
                </div>

                <div className="flex justify-end gap-4 mt-8">
                    <button type="button" onClick={onClose} className="bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg">
                        Cancelar
                    </button>
                    <button type="submit" disabled={guardando} className="bg-button text-button font-semibold py-2 px-4 rounded-lg flex gap-2 items-center disabled:opacity-60">
                        <Save size={18} />
                        {guardando ? "Guardando..." : proveedor ? "Guardar cambios" : "Guardar proveedor"}
                    </button>
                </div>
            </form>
        </div>
    );
}

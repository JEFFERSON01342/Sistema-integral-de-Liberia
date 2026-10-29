import { Plus, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from "react-hot-toast"
import { useClientes } from "../hooks/useClientes"

export default function NuevoCliente({ onClose }) {
    const { clientes, addCliente } = useClientes();
    const [nombre, setNombre] = useState('');
    const [razonSocial, setRazonSocial] = useState('');
    const [correoElectronico, setCorreoElectronico] = useState('');
    const [telefono, setTelefono] = useState('');
    const [direccion, setDireccion] = useState('');
    const [limiteCredito, setLimiteCredito] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        const result = await addCliente({
            nombre,
            identificacion: razonSocial,
            correo: correoElectronico,
            telefono,
            direccion,
            limite_credito: limiteCredito
        });

        if (result.success) {
            toast.success("✅ Cliente agregado correctamente");
            onClose();
        } else {
            toast.error(`⚠️ ${result.message || "Error al agregar cliente"}`);
        }
    };

    return (
        <>
            <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-7xl shadow-lg animate-fade-in border-1 border-secondary">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-semibold">Nuevo Cliente</h3>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Nombre / Razón Social</label>
                            <input type="text" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej: Pepsi" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">RUC / DNI</label>
                                <input type="text" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} placeholder="ej: PepsiCo, Inc" className="bg-input border border-secondary rounded-lg p-3" />
                            </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Correo Electronico</label>
                            <input type="email" value={correoElectronico} onChange={e => setCorreoElectronico(e.target.value)} placeholder="ej: example@gmail.com" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="md:col-span-3 flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Direccion</label>
                            <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Direccion del cliente (opcional)" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Telefono</label>
                            <input type="tel" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="ej: 8585-8585" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Limite de Credito</label>
                            <input type="number" value={limiteCredito} onChange={e => setLimiteCredito(e.target.value)} placeholder="C$ 10,000" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-8">
                        <button type="button" onClick={onClose} className="cursor-pointer bg-secondary text-button-text border border-secondary font-semibold py-2 px-6 rounded-lg hover:bg-button-cancel transition-transform duration-200 ease-in-out hover:scale-110">Cancelar</button>
                        <button type="submit" className="cursor-pointer bg-button text-button font-semibold py-2 px-2 rounded-lg hover:bg-[#E8E8E8] transition-transform duration-200 ease-in-out hover:scale-110 flex flex-row gap-2 items-center">
                            <Save />
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}
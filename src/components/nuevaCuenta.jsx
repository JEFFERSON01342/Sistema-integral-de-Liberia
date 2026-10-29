import { useState, useEffect } from "react";
import { Save } from "lucide-react";

export default function NuevaCuenta({ isOpen, 
    onClose, 
    tipos, 
    subtipos, 
    crearCuenta, 
    isLoading 
  }) {

  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [tipoSeleccionado, setTipoSeleccionado] = useState('');
  const [subtipoSeleccionado, setSubtipoSeleccionado] = useState('');
  const [subtiposFiltrados, setSubtiposFiltrados] = useState([]);

  useEffect(() => {
    if (tipoSeleccionado && subtipos) {
      const filtrados = subtipos.filter(
        (s) => String(s.id_tipo) === String(tipoSeleccionado)
      );
      setSubtiposFiltrados(filtrados);
    } else {
      setSubtiposFiltrados([]);
    }
    setSubtipoSeleccionado('');
  }, [tipoSeleccionado, subtipos]);

  const resetForm = () => {
    setNombre('');
    setCodigo('');
    setTipoSeleccionado('');
    setSubtipoSeleccionado('');
    setSubtiposFiltrados([]);
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();

    const cuentaCreada = await crearCuenta({
      nombre: nombre,
      id_tipo: tipoSeleccionado,
      id_subtipo: subtipoSeleccionado || null,
      codigo: codigo || null,
    });

    if (cuentaCreada) {
      resetForm();
      onClose();
    }
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-opacity-80 flex items-center justify-center p-4 bg-black/70 z-50 backdrop-blur-sm">
      <div className="bg-primary text-title p-6 rounded-xl w-full max-w-lg shadow-2xl border border-secondary">
        <h4 className="text-xl font-semibold mb-4">Añadir Nueva Cuenta</h4>

        <form onSubmit={handleModalSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="cat-nombre" className="text-sm font-medium text-title">
              Nombre de la Cuenta
            </label>
            <input
              id="cat-nombre"
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="ej: Caja General, Banco, Ventas..."
              className="bg-input border border-secondary rounded-xl p-3 focus:ring-blue-500 focus:border-blue-500 transition w-full"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="tipocuenta" className="text-sm font-medium text-title">
              Tipo de Cuenta
            </label>
            <select
              id="tipocuenta"
              required
              value={tipoSeleccionado}
              onChange={(e) => setTipoSeleccionado(e.target.value)}
              className="bg-input border border-secondary rounded-xl p-3 focus:ring-blue-500 focus:border-blue-500 transition w-full"
            >
              <option value="">Seleccione un tipo</option>
              {tipos && tipos.map((tipo) => (
                <option key={tipo.id_tipo} value={tipo.id_tipo}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="subtipocuenta" className="text-sm font-medium text-title">
              Subtipo de Cuenta (Opcional)
            </label>
            <select
              id="subtipocuenta"
              value={subtipoSeleccionado}
              onChange={(e) => setSubtipoSeleccionado(e.target.value)}
              disabled={subtiposFiltrados.length === 0}
              className="bg-input border border-secondary rounded-xl p-3 focus:ring-blue-500 focus:border-blue-500 transition w-full disabled:opacity-50"
            >
              <option value="">
                {tipoSeleccionado ? "Seleccione un subtipo" : "Primero elija un tipo"}
              </option>
              {subtiposFiltrados.map((subtipo) => (
                <option key={subtipo.id_subtipo} value={subtipo.id_subtipo}>
                  {subtipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="codigoCuenta" className="text-sm font-medium text-title">
              Código de la Cuenta (Opcional)
            </label>
            <input
              id="codigoCuenta"
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="ej: 101.01, ACT-001"
              className="bg-input border border-secondary rounded-xl p-3 focus:ring-blue-500 focus:border-blue-500 transition w-full"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="bg-secondary text-button-text font-semibold py-2 px-4 rounded-xl hover:bg-secondary transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-new bg-button text-button p-3 rounded-lg flex justify-center gap-2 items-center hover:opacity-95 transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer disabled:opacity-70"
            >
              <span className="icon"><Save size={18} /></span>
              {isLoading ? "Guardando..." : "Guardar Cuenta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
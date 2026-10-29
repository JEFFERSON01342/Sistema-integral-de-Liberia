import { Save, Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useCategorias } from '../hooks/useCategorias';
import { useUnidadesMedidas } from '../hooks/useUnidadesMedidas';
import { toast } from "react-hot-toast";
import { supabase } from '../supabase/supabaseclient';
import { generarCodigoEAN13, dibujarCodigoBarras, imprimirCodigosBarras } from '../utils/generarCodigoBarras';

export default function EditarProducto({ producto, onClose, onGuardar }) {
    const { categorias } = useCategorias();
    const { unidadesMedidas } = useUnidadesMedidas();

    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);

    const [form, setForm] = useState({
        nombre: '',
        descripcion: '',
        precio_venta: 0,
        activo: true,
    });
    const [categoriaId, setCategoriaId] = useState('');
    const [unidadMedidaId, setUnidadMedidaId] = useState('');
    const [codigoBarras, setCodigoBarras] = useState('');
    const barcodeRef = useRef(null);

    // Cargamos la fila completa para obtener los IDs de las relaciones.
    useEffect(() => {
        const cargar = async () => {
            if (!producto?.id_producto) return;
            setCargando(true);
            try {
                const { data, error } = await supabase
                    .from('productos')
                    .select('*')
                    .eq('id_producto', producto.id_producto)
                    .single();
                if (error) throw error;
                if (data) {
                    setForm({
                        nombre: data.nombre || '',
                        descripcion: data.descripcion || '',
                        precio_venta: data.precio_venta ?? 0,
                        activo: data.activo ?? true,
                    });
                    setCategoriaId(data.id_categoria ?? '');
                    setUnidadMedidaId(data.id_unidad_medida ?? '');
                    setCodigoBarras(data.codigo_barras || generarCodigoEAN13(producto.id_producto));
                }
            } catch (err) {
                console.error('Error al cargar producto:', err.message);
                toast.error('No se pudo cargar el producto.');
            } finally {
                setCargando(false);
            }
        };
        cargar();
    }, [producto]);

    // Dibuja el código de barras cuando ya cargaron los datos.
    useEffect(() => {
        if (!cargando && codigoBarras && barcodeRef.current) {
            dibujarCodigoBarras(barcodeRef.current, codigoBarras, { height: 50, fontSize: 13 });
        }
    }, [cargando, codigoBarras]);

    const handleChange = (campo, valor) => {
        setForm((prev) => ({ ...prev, [campo]: valor }));
    };

    const handleImprimirBarras = () => {
        imprimirCodigosBarras([{ codigo: codigoBarras, nombre: form.nombre, precio: form.precio_venta }]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setGuardando(true);

        const cambios = {
            nombre: form.nombre.trim(),
            descripcion: form.descripcion.trim(),
            precio_venta: parseFloat(form.precio_venta) || 0,
            id_categoria: categoriaId || null,
            id_unidad_medida: parseInt(unidadMedidaId) || null,
            activo: form.activo,
            codigo_barras: codigoBarras || null,
        };

        const result = await onGuardar(producto.id_producto, cambios);
        setGuardando(false);

        if (result?.success) {
            toast.success('✅ Producto actualizado correctamente');
            onClose();
        } else {
            toast.error(`⚠️ ${result?.message || 'Error al actualizar producto'}`);
        }
    };

    return (
        <div className="bg-primary text-title p-8 rounded-2xl w-full max-w-4xl shadow-lg animate-fade-in border-1 border-secondary max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
                <h3 className="text-2xl font-semibold">Editar Producto</h3>
                {producto?.sku && (
                    <span className="text-subtitle font-mono text-sm">{producto.sku}</span>
                )}
            </div>

            {cargando ? (
                <p className="text-center text-subtitle py-10">Cargando datos del producto...</p>
            ) : (
                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Nombre</label>
                            <input
                                type="text"
                                value={form.nombre}
                                onChange={(e) => handleChange('nombre', e.target.value)}
                                required
                                className="bg-input border border-secondary rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Categoría</label>
                            <select
                                value={categoriaId}
                                onChange={(e) => setCategoriaId(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3 appearance-none focus:ring-blue-500 focus:border-blue-500 transition"
                            >
                                <option value="">Seleccione categoría</option>
                                {categorias.map((c) => (
                                    <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-3 flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Descripción</label>
                            <input
                                type="text"
                                value={form.descripcion}
                                onChange={(e) => handleChange('descripcion', e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Precio Unitario</label>
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={form.precio_venta}
                                onChange={(e) => handleChange('precio_venta', e.target.value)}
                                required
                                className="bg-input border border-secondary rounded-lg p-3"
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Unidad de Medida</label>
                            <select
                                value={unidadMedidaId}
                                onChange={(e) => setUnidadMedidaId(e.target.value)}
                                className="bg-input border border-secondary rounded-lg p-3"
                            >
                                <option value="">Seleccione una unidad</option>
                                {unidadesMedidas.map((u) => (
                                    <option key={u.id_unidad_medida} value={u.id_unidad_medida}>{u.nombre} ({u.abreviatura})</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-title">Estado</label>
                            <label className="flex items-center gap-2 cursor-pointer bg-input border border-secondary rounded-lg p-3">
                                <input
                                    type="checkbox"
                                    checked={!!form.activo}
                                    onChange={(e) => handleChange('activo', e.target.checked)}
                                    className="w-5 h-5 accent-blue-600"
                                />
                                <span className="text-title text-sm">{form.activo ? 'Activo' : 'Inactivo'}</span>
                            </label>
                        </div>
                    </div>

                    <div className="mt-8 border border-secondary rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex flex-col items-center sm:items-start gap-2">
                            <span className="text-sm font-medium text-title">Código de barras</span>
                            <input
                                type="text"
                                value={codigoBarras}
                                onChange={(e) => setCodigoBarras(e.target.value)}
                                aria-label="Código de barras"
                                className="bg-input border border-secondary rounded-lg p-2 font-mono"
                            />
                            <div className="bg-white rounded-md p-2">
                                <svg ref={barcodeRef}></svg>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleImprimirBarras}
                            className="bg-secondary/40 text-title border border-secondary px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 hover:opacity-95 hover:scale-105 transition"
                        >
                            <Printer size={18} /> Imprimir código
                        </button>
                    </div>

                    <div className="flex justify-end gap-4 mt-8">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-secondary text-button-text cursor-pointer border border-secondary py-2 px-6 rounded-lg hover:bg-secondary transition-transform hover:scale-110"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={guardando}
                            className="bg-button text-button py-2 cursor-pointer px-4 rounded-lg hover:bg-[#E8E8E8] transition-transform hover:scale-110 flex items-center gap-2 disabled:opacity-60"
                        >
                            <span className="icon"><Save /></span>
                            {guardando ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}

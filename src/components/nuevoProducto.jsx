import { Plus, Save } from 'lucide-react';
import NuevaCategoria from "../components/nuevaCategoria";
import { useCategorias } from '../hooks/useCategorias';
import { useEffect, useState } from 'react';
import { useUnidadesMedidas } from '../hooks/useUnidadesMedidas';
import { toast } from "react-hot-toast";
import { supabase } from '../supabase/supabaseclient';
import { useEmpresa } from '../contexts/empresacontext';

export default function NuevoProducto({ onClose, onProductoAgregado }) {
    const { categorias, agregarCategoria } = useCategorias();
    const { unidadesMedidas } = useUnidadesMedidas();
    const { empresaId: empresaSeleccionada } = useEmpresa();
    const [listaCategorias, setListaCategorias] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [categoriaId, setCategoriaId] = useState('');
    const [unidadMedidaId, setUnidadMedidaId] = useState(''); 

    const [imagenFile, setImagenFile] = useState(null);
    const [imagenPreview, setImagenPreview] = useState(null);
    const [subiendoImagen, setSubiendoImagen] = useState(false);

    const handleImagenChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast.error("La imagen debe pesar 5 MB o menos.");
            e.target.value = "";
            return;
        }
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            toast.error("La imagen debe estar en formato JPG, PNG o WebP.");
            e.target.value = "";
            return;
        }
        setImagenFile(file);
    };

    useEffect(() => {
        if (!imagenFile) {
            setImagenPreview(null);
            return undefined;
        }
        const previewUrl = URL.createObjectURL(imagenFile);
        setImagenPreview(previewUrl);
        return () => URL.revokeObjectURL(previewUrl);
    }, [imagenFile]);

    // Sube la imagen al bucket público product-images y devuelve la URL pública.
    const subirImagen = async () => {
        if (!imagenFile) return null;
        setSubiendoImagen(true);
        try {
            const ext = imagenFile.name.split('.').pop();
            const path = `${empresaSeleccionada}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const { error } = await supabase.storage
                .from('product-images')
                .upload(path, imagenFile, { cacheControl: '3600', upsert: false });
            if (error) throw error;
            const { data } = supabase.storage.from('product-images').getPublicUrl(path);
            return data?.publicUrl || null;
        } catch (err) {
            console.error('Error subiendo imagen:', err.message);
            toast.error('No se pudo subir la imagen, el producto se guardará sin foto.');
            return null;
        } finally {
            setSubiendoImagen(false);
        }
    };

    useEffect(() => {
        setListaCategorias(categorias);
    }, [categorias]);

    const handleSaveCategoria = async (nuevaCat) => {
        const resultado = await agregarCategoria(nuevaCat.nombre, nuevaCat.descripcion);
        if (resultado.success) {
            setCategoriaId(String(resultado.data.id_categoria));
            setIsModalOpen(false);
            toast.success("Categoría agregada.");
        } else {
            toast.error(resultado.message || "No se pudo guardar la categoría.");
        }
        return resultado;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const formData = new FormData(e.currentTarget);

        let codigoSku;
        const nombre = String(formData.get("nombre") || "").trim();
        const base = nombre.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z]/g, "").substring(0, 3) || "PRO";
        try {
            const { data, error } = await supabase.from("productos").select("sku").eq("id_empresa", empresaSeleccionada).ilike("sku", `SKU-${base}-%`);
            if (error) throw error;
            const siguienteNumero = (data || []).reduce((maximo, producto) => {
                const numero = Number(producto.sku.split("-").at(-1));
                return Number.isInteger(numero) ? Math.max(maximo, numero) : maximo;
            }, 0) + 1;
            const numeroFormateado = String(siguienteNumero).padStart(3, "0");
            codigoSku = `SKU-${base}-${numeroFormateado}`;
        } catch (err) {
            toast.error(`No se pudo generar un SKU único: ${err.message}`);
            return;
        }

        const imagenUrl = await subirImagen();
        const nuevoProducto = {
            id_categoria: categoriaId || null,
            sku: codigoSku,
            nombre,
            descripcion: String(formData.get("descripcion") || "").trim(),
            precio_venta: Number(formData.get("precio-unitario")),
            id_unidad_medida: parseInt(unidadMedidaId) || null, 
            activo: true,
            imagen_principal: imagenUrl,
        };

        const result = await onProductoAgregado(nuevoProducto);

        if (result.success) {
            toast.success(`✅ Producto agregado correctamente (SKU: ${codigoSku})`);
            onClose();
        } else {
            // 'errorPr' no está definido, lo quité.
            toast.error(`⚠️ ${result.message || "Error al agregar producto"}`);
        }
    };

    return (
        <>
            <div className="bg-primary text-title rounded-2xl w-full max-w-4xl shadow-lg animate-fade-in border-1 border-secondary max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-6 md:p-8 overflow-y-auto flex-1">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-semibold">Nuevo Producto</h3>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                        
                        {/* --- Campos de Producto (iguales) --- */}
                        <div className="flex flex-col gap-2">
                            <label htmlFor="nombre" className="text-sm font-medium text-title">Nombre</label>
                            <input id="nombre" name="nombre" type="text" placeholder="Nombre del producto" required className="bg-input border border-secondary rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="categoria" className="text-sm font-medium text-title">Categoría</label>
                            <div className="flex flex-row gap-2 items-center">
                                <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="bg-input border border-secondary flex-1 rounded-lg p-3 appearance-none focus:ring-blue-500 focus:border-blue-500 transition">
                                    <option value="">Seleccione categoría</option>
                                    {listaCategorias.map(c => (
                                        <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>
                                    ))}
                                </select>
                                <button type="button" onClick={() => setIsModalOpen(true)} className="btn-new flex bg-button text-button p-3 rounded-lg hover:opacity-95 transition-transform duration-200 ease-in-out hover:scale-110 cursor-pointer">
                                    <span className="icon"><Plus /></span>
                                </button>
                            </div>
                        </div>
                        <div className="md:col-span-3 flex flex-col gap-2">
                            <label htmlFor="descripcion" className="text-sm font-medium text-title">Descripción</label>
                            <input id="descripcion" name="descripcion" type="text" placeholder="Descripción detallada" className="bg-input border border-secondary rounded-lg p-3" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="precio-unitario" className="text-sm font-medium text-title">Precio Unitario</label>
                            <input id="precio-unitario" name="precio-unitario" type="number" min="0.01" step="0.01" required className="bg-input border border-secondary rounded-lg p-3" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="unidadmedida" className="text-sm font-medium text-title">Unidad de Medida</label>
                            <select id="unidadmedida" value={unidadMedidaId} onChange={(e) => setUnidadMedidaId(e.target.value)} className="bg-input border border-secondary rounded-lg p-3">
                                <option value="">Seleccione una unidad</option>
                                {unidadesMedidas.map(u => (
                                    <option key={u.id_unidad_medida} value={u.id_unidad_medida}>{u.nombre} ({u.abreviatura})</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-3 border-t border-secondary pt-5 mt-1">
                            <h4 className="text-title font-semibold mb-1">Imagen del catálogo</h4>
                            <p className="text-subtitle text-sm">El inventario, costo y proveedor se registran desde el flujo de compras y recepción.</p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label htmlFor="imagen" className="text-sm font-medium text-title">Imagen del producto</label>
                            <input id="imagen" type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImagenChange} className="bg-input border border-secondary rounded-lg p-2.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-button file:text-button file:px-3 file:py-1.5 file:cursor-pointer" />
                        </div>
                        {imagenPreview && (
                            <div className="md:col-span-3 flex items-center gap-3">
                                <img src={imagenPreview} alt="Vista previa" className="h-24 w-24 object-cover rounded-lg border border-secondary" />
                                <span className="text-subtitle text-sm">Vista previa de la imagen</span>
                            </div>
                        )}

                    </div>

                    <div className="sticky bottom-0 bg-primary pt-3 flex justify-end gap-4 mt-6 border-t border-secondary">
                        <button type="button" onClick={onClose} className="bg-secondary text-button-text cursor-pointer border border-secondary py-2 px-6 rounded-lg hover:bg-secondary transition-transform hover:scale-110">
                            Cancelar
                        </button>
                        <button type="submit" disabled={subiendoImagen} className="bg-button text-button py-2 cursor-pointer px-4 rounded-lg hover:bg-[#E8E8E8] transition-transform hover:scale-110 flex items-center gap-2 disabled:opacity-60">
                            <span className="icon"><Save /></span>
                            {subiendoImagen ? 'Subiendo imagen...' : 'Guardar'}
                        </button>
                    </div>
                </form>
                </div>
            </div>

            <NuevaCategoria isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveCategoria} />
        </>
    );
}
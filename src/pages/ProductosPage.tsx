import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSearchParams } from 'react-router-dom';
import {
  productosAPI,
  categoriasAPI,
  facturacionAPI,
  type ProductoImportarFila,
  type UnidadMedida,
} from '../services/api';
import { unidadPorDefectoDeRubro } from '../config/rubros';

const OPCIONES_PRODUCTOS_POR_PAGINA = [10, 25, 50] as const;
const PRODUCTOS_POR_PAGINA_INICIAL = 25;

interface ProductoImportPreview extends ProductoImportarFila {
  filaExcel: number;
  errores: string[];
  erroresFuente: string[];
  unidadNoReconocida?: string;
}

const normalizarEncabezado = (valor: unknown) =>
  String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const aliasEncabezados: Record<string, string[]> = {
  codigo: ['codigo', 'codigoproducto', 'sku', 'referencia'],
  nombre: ['nombre', 'producto', 'nombreproducto'],
  categoria: ['categoria', 'familia', 'grupo'],
  unidad_medida: ['unidad', 'unidadmedida', 'medida'],
  costo: ['costo', 'costounitario', 'costocompra'],
  precio: ['precio', 'precioventa', 'valorventa'],
  stock_actual: ['stock', 'stockactual', 'existencia', 'existencias', 'cantidad'],
  stock_minimo: ['stockminimo', 'minimo', 'existenciaminima'],
  stock_maximo: ['stockmaximo', 'maximo', 'existenciamaxima'],
  ubicacion: ['ubicacion', 'bodega', 'estante'],
  descripcion: ['descripcion', 'detalles', 'observaciones'],
};

const leerUnidadImportada = (valor: unknown): { unidad: UnidadMedida; error?: string } => {
  const unidad = normalizarEncabezado(valor);
  if (!unidad || ['unidad', 'unidades', 'und', 'unid', 'pieza', 'piezas', 'u'].includes(unidad)) return { unidad: 'unidad' };
  if (['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(unidad)) return { unidad: 'kg' };
  if (['g', 'gr', 'gramo', 'gramos'].includes(unidad)) return { unidad: 'g' };
  if (['l', 'lt', 'litro', 'litros'].includes(unidad)) return { unidad: 'l' };
  if (['ml', 'mililitro', 'mililitros'].includes(unidad)) return { unidad: 'ml' };
  return { unidad: 'unidad', error: `Unidad no reconocida: ${String(valor)}` };
};

const leerNumeroImportado = (valor: unknown): number | null => {
  if (valor == null || String(valor).trim() === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : Number.NaN;
  let numero = String(valor).trim().replace(/[^\d,.-]/g, '');
  const ultimaComa = numero.lastIndexOf(',');
  const ultimoPunto = numero.lastIndexOf('.');
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    numero = ultimaComa > ultimoPunto
      ? numero.replace(/\./g, '').replace(',', '.')
      : numero.replace(/,/g, '');
  } else if (ultimaComa >= 0) {
    numero = numero.replace(',', '.');
  }
  const convertido = Number(numero);
  return Number.isFinite(convertido) ? convertido : Number.NaN;
};

const validarFilaImportada = (producto: ProductoImportPreview) => {
  const errores = [...producto.erroresFuente];
  if (producto.unidadNoReconocida) errores.push(`Unidad no reconocida: ${producto.unidadNoReconocida}`);
  if (!producto.codigo.trim()) errores.push('Falta el código');
  if (!producto.nombre.trim()) errores.push('Falta el nombre');
  if ([producto.codigo, producto.nombre, producto.categoria || '', producto.descripcion || '', producto.ubicacion || '']
    .some((valor) => valor.length > 250)) errores.push('Un campo supera los 250 caracteres');
  if (!Number.isFinite(producto.precio) || producto.precio < 0) errores.push('Precio inválido');
  if (!Number.isFinite(producto.stock_actual) || producto.stock_actual < 0) errores.push('Stock inválido');
  if (producto.costo != null && (!Number.isFinite(producto.costo) || producto.costo < 0)) errores.push('Costo inválido');
  if (producto.stock_minimo != null && (!Number.isFinite(producto.stock_minimo) || producto.stock_minimo < 0)) errores.push('Stock mínimo inválido');
  if (producto.stock_maximo != null && (!Number.isFinite(producto.stock_maximo) || producto.stock_maximo < 0)) errores.push('Stock máximo inválido');
  if ((producto.stock_minimo ?? 5) > (producto.stock_maximo ?? Math.max(100, producto.stock_actual))) {
    errores.push('El stock mínimo supera al máximo');
  }

  const cantidades = [producto.stock_actual, producto.stock_minimo, producto.stock_maximo].filter(
    (cantidad): cantidad is number => cantidad != null && Number.isFinite(cantidad),
  );
  if (producto.unidad_medida === 'unidad' && cantidades.some((cantidad) => !Number.isInteger(cantidad))) {
    errores.push('Las unidades requieren stocks enteros; cambia la medida si se vende por peso');
  } else if (cantidades.some((cantidad) => Math.abs(cantidad * 1000 - Math.round(cantidad * 1000)) > 0.000001)) {
    errores.push('El stock admite hasta tres decimales');
  }
  return [...new Set(errores)];
};

const prepararFilasImportadas = async (archivo: File): Promise<ProductoImportPreview[]> => {
  if (archivo.size > 20 * 1024 * 1024) throw new Error('El archivo no puede superar 20 MB.');
  const XLSX = await import('xlsx');
  const libro = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: false });
  const nombreHoja = libro.SheetNames[0];
  if (!nombreHoja) throw new Error('El archivo no contiene hojas de cálculo');
  const hoja = libro.Sheets[nombreHoja];
  const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: '' });
  if (filas.length < 2) throw new Error('La hoja no contiene filas de productos');

  const encabezados = filas[0].map(normalizarEncabezado);
  const indices = Object.fromEntries(
    Object.entries(aliasEncabezados).map(([campo, alias]) => [
      campo,
      encabezados.findIndex((encabezado) => alias.includes(encabezado)),
    ]),
  ) as Record<string, number>;
  const requeridos = ['codigo', 'nombre', 'precio', 'stock_actual'];
  const faltantes = requeridos.filter((campo) => indices[campo] < 0);
  if (faltantes.length) {
    throw new Error(`Faltan columnas obligatorias: ${faltantes.join(', ')}`);
  }

  const leerCelda = (fila: unknown[], campo: string, indiceFila: number) => {
    const indiceColumna = indices[campo];
    if (indiceColumna == null || indiceColumna < 0) return '';
    const direccion = XLSX.utils.encode_cell({ r: indiceFila, c: indiceColumna });
    const celda = hoja[direccion];
    if (campo === 'codigo' && celda?.t === 'n') return celda.w ?? celda.v ?? fila[indiceColumna];
    return celda?.v ?? fila[indiceColumna] ?? '';
  };

  const codigosVistos = new Set<string>();
  const productos = filas.slice(1).flatMap((fila, indice) => {
    if (!fila.some((valor) => String(valor ?? '').trim())) return [];
    const numeroFila = indice + 2;
    const codigo = String(leerCelda(fila, 'codigo', numeroFila - 1) ?? '').trim();
    const unidadLeida = leerUnidadImportada(leerCelda(fila, 'unidad_medida', numeroFila - 1));
    const categoria = String(leerCelda(fila, 'categoria', numeroFila - 1) ?? '').trim() || 'Importados';
    const costo = leerNumeroImportado(leerCelda(fila, 'costo', numeroFila - 1));
    const precio = leerNumeroImportado(leerCelda(fila, 'precio', numeroFila - 1));
    const stockActual = leerNumeroImportado(leerCelda(fila, 'stock_actual', numeroFila - 1));
    const stockMinimo = leerNumeroImportado(leerCelda(fila, 'stock_minimo', numeroFila - 1));
    const stockMaximo = leerNumeroImportado(leerCelda(fila, 'stock_maximo', numeroFila - 1));
    const errores: string[] = [];
    if (costo != null && !Number.isFinite(costo)) errores.push('Costo no numérico');
    if (precio == null || !Number.isFinite(precio)) errores.push('Precio no numérico');
    if (stockActual == null || !Number.isFinite(stockActual)) errores.push('Stock actual no numérico');
    if (stockMinimo != null && !Number.isFinite(stockMinimo)) errores.push('Stock mínimo no numérico');
    if (stockMaximo != null && !Number.isFinite(stockMaximo)) errores.push('Stock máximo no numérico');
    if (codigo && codigosVistos.has(codigo)) errores.push('Código repetido en el archivo');
    if (codigo) codigosVistos.add(codigo);

    const producto: ProductoImportPreview = {
      filaExcel: numeroFila,
      errores,
      erroresFuente: errores,
      unidadNoReconocida: unidadLeida.error ? String(leerCelda(fila, 'unidad_medida', numeroFila - 1)) : undefined,
      codigo,
      nombre: String(leerCelda(fila, 'nombre', numeroFila - 1) ?? '').trim(),
      categoria,
      descripcion: String(leerCelda(fila, 'descripcion', numeroFila - 1) ?? '').trim() || undefined,
      unidad_medida: unidadLeida.unidad,
      costo: costo != null && Number.isFinite(costo) ? costo : null,
      precio: precio ?? Number.NaN,
      stock_actual: stockActual ?? Number.NaN,
      stock_minimo: stockMinimo != null && Number.isFinite(stockMinimo) ? stockMinimo : undefined,
      stock_maximo: stockMaximo != null && Number.isFinite(stockMaximo) ? stockMaximo : undefined,
      ubicacion: String(leerCelda(fila, 'ubicacion', numeroFila - 1) ?? '').trim() || undefined,
    };
    producto.errores = validarFilaImportada(producto);
    return [producto];
  });
  if (productos.length > 5000) throw new Error('El archivo supera el máximo de 5000 productos por importación.');
  return productos;
};

interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria_id: number;
  categoria_nombre: string | null;
  precio: number;
  stock_actual: number;
  stock_minimo: number;
  stock_maximo: number;
  unidad_medida: UnidadMedida;
  costo: number | null;
  ubicacion: string | null;
  estado_stock: string;
  movimientos_count: number;
  facturas_count: number;
}

interface Categoria {
  id: number;
  nombre: string;
  descripcion: string | null;
}

const ProductosPage = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const puedeGestionar = ['admin', 'moderador'].includes(user?.rol);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<number | ''>('');
  const [filtroStock, setFiltroStock] = useState<'todos' | 'bajo' | 'sin_stock'>(() => {
    const inicial = searchParams.get('stock');
    return inicial === 'bajo' || inicial === 'sin_stock' ? inicial : 'todos';
  });
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [filasImportacion, setFilasImportacion] = useState<ProductoImportPreview[]>([]);
  const [filtroImportacion, setFiltroImportacion] = useState('');
  const [unidadMasivaImportacion, setUnidadMasivaImportacion] = useState<UnidadMedida>('kg');
  const [cargandoArchivo, setCargandoArchivo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [errorImportacion, setErrorImportacion] = useState('');
  const [resultadoImportacion, setResultadoImportacion] = useState('');
  const inputImportacionRef = useRef<HTMLInputElement>(null);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [tipoNegocio, setTipoNegocio] = useState('general');
  const [pagina, setPagina] = useState(1);
  const [productosPorPagina, setProductosPorPagina] = useState(PRODUCTOS_POR_PAGINA_INICIAL);
  const [totalProductos, setTotalProductos] = useState(0);
  const [productoSeleccionadoId, setProductoSeleccionadoId] = useState<number | null>(null);

  const [form, setForm] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    categoria_id: '',
    precio: '',
    unidad_medida: 'unidad' as UnidadMedida,
    stock_actual: '',
    stock_minimo: '5',
    stock_maximo: '100',
    costo: '',
    ubicacion: '',
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const paramsInicial = {
        skip: 0,
        limit: productosPorPagina,
        stock_bajo: filtroStock === 'bajo' || undefined,
        sin_stock: filtroStock === 'sin_stock' || undefined,
      };
      const [prods, cats, empresa] = await Promise.all([
        productosAPI.listar(paramsInicial),
        categoriasAPI.listar(),
        facturacionAPI.configuracion.obtener(),
      ]);
      setProductos(prods.productos);
      setTotalProductos(prods.total);
      setPagina(1);
      setProductoSeleccionadoId(null);
      setCategorias(cats);
      setTipoNegocio(empresa.tipo_negocio || 'general');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cargarProductosPagina = async (
    paginaSolicitada: number,
    aplicarFiltros = true,
    limite = productosPorPagina,
  ) => {
    const params: any = {
      skip: (paginaSolicitada - 1) * limite,
      limit: limite,
    };
    if (aplicarFiltros) {
      if (busqueda.trim()) params.busqueda = busqueda.trim();
      if (filtroCategoria) params.categoria_id = filtroCategoria;
      if (filtroStock === 'bajo') params.stock_bajo = true;
      if (filtroStock === 'sin_stock') params.sin_stock = true;
    }
    const resultado = await productosAPI.listar(params);
    setProductos(resultado.productos);
    setTotalProductos(resultado.total);
    setPagina(paginaSolicitada);
    setProductoSeleccionadoId((seleccionado) =>
      resultado.productos.some((producto: Producto) => producto.id === seleccionado) ? seleccionado : null,
    );
  };

  const handleBuscar = async () => {
    try {
      setLoading(true);
      await cargarProductosPagina(1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const leerArchivoImportacion = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo) return;
    setCargandoArchivo(true);
    setErrorImportacion('');
    setResultadoImportacion('');
    try {
      const filas = await prepararFilasImportadas(archivo);
      if (filas.length === 0) throw new Error('No se encontraron filas con productos en la hoja.');
      setFilasImportacion(filas);
      setFiltroImportacion('');
      setShowImportModal(true);
    } catch (err) {
      setErrorImportacion(err instanceof Error ? err.message : String(err));
    } finally {
      setCargandoArchivo(false);
    }
  };

  const cambiarUnidadImportada = (filaExcel: number, unidad_medida: UnidadMedida) => {
    setFilasImportacion((filas) => filas.map((producto) => {
      if (producto.filaExcel !== filaExcel) return producto;
      const actualizado = { ...producto, unidad_medida, unidadNoReconocida: undefined };
      return { ...actualizado, errores: validarFilaImportada(actualizado) };
    }));
  };

  const aplicarUnidadAResultados = () => {
    const consulta = filtroImportacion.trim().toLocaleLowerCase();
    if (!consulta) return;
    setFilasImportacion((filas) => filas.map((producto) => {
      const coincide = `${producto.codigo} ${producto.nombre} ${producto.categoria}`
        .toLocaleLowerCase()
        .includes(consulta);
      if (!coincide) return producto;
      const actualizado = { ...producto, unidad_medida: unidadMasivaImportacion, unidadNoReconocida: undefined };
      return { ...actualizado, errores: validarFilaImportada(actualizado) };
    }));
  };

  const ejecutarImportacion = async () => {
    const validos = filasImportacion.filter((producto) => producto.errores.length === 0);
    if (validos.length === 0) return;

    setImportando(true);
    setErrorImportacion('');
    try {
      const resultado = await productosAPI.importar(validos.map((producto) => ({
        codigo: producto.codigo,
        nombre: producto.nombre,
        categoria: producto.categoria || 'Importados',
        descripcion: producto.descripcion,
        unidad_medida: producto.unidad_medida,
        costo: producto.costo,
        precio: producto.precio,
        stock_actual: producto.stock_actual,
        stock_minimo: producto.stock_minimo,
        stock_maximo: producto.stock_maximo,
        ubicacion: producto.ubicacion,
      })));
      setResultadoImportacion(
        `Importación terminada: ${resultado.insertados} productos agregados y ${resultado.omitidos.length} omitidos por código existente o repetido.`,
      );
      if (resultado.omitidos.length > 0) {
        const detalle = resultado.omitidos.slice(0, 5).map(({ codigo, motivo }) => `${codigo}: ${motivo}`).join('\n');
        setResultadoImportacion((mensaje) => `${mensaje}${detalle ? `\n${detalle}` : ''}${resultado.omitidos.length > 5 ? '\n…' : ''}`);
      }
      setShowImportModal(false);
      setFilasImportacion([]);
      await cargarDatos();
    } catch (err) {
      setErrorImportacion(err instanceof Error ? err.message : String(err));
    } finally {
      setImportando(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cambiaUnidad = !!editando && form.unidad_medida !== editando.unidad_medida;
    if (cambiaUnidad && !window.confirm(
      `Vas a cambiar la unidad de ${editando.nombre}. Verifica el stock actual en ${etiquetaUnidad(form.unidad_medida)}. Los movimientos y ventas anteriores conservarán su unidad registrada. ¿Continuar?`,
    )) return;

    try {
      const datos = {
        codigo: form.codigo,
        nombre: form.nombre,
        descripcion: form.descripcion || undefined,
        categoria_id: parseInt(form.categoria_id),
        precio: parseFloat(form.precio),
        stock_actual: parseFloat(form.stock_actual),
        stock_minimo: parseFloat(form.stock_minimo),
        stock_maximo: parseFloat(form.stock_maximo),
        unidad_medida: form.unidad_medida,
        costo: form.costo.trim() ? parseFloat(form.costo) : null,
        ubicacion: form.ubicacion.trim() || null,
      };

      if (editando) {
        await productosAPI.actualizar(editando.id, {
          ...datos,
          confirmar_cambio_unidad: cambiaUnidad,
        });
      } else {
        await productosAPI.crear(datos);
      }

      setShowModal(false);
      setEditando(null);
      resetForm();
      cargarDatos();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('Estas seguro de eliminar este producto?')) return;
    try {
      await productosAPI.eliminar(id);
      const totalDespues = Math.max(0, totalProductos - 1);
      const paginaDespues = Math.min(pagina, Math.max(1, Math.ceil(totalDespues / productosPorPagina)));
      setProductoSeleccionadoId(null);
      setLoading(true);
      await cargarProductosPagina(paginaDespues);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cambiarPagina = async (nuevaPagina: number) => {
    if (nuevaPagina < 1 || nuevaPagina > Math.max(1, Math.ceil(totalProductos / productosPorPagina))) return;
    try {
      setLoading(true);
      await cargarProductosPagina(nuevaPagina);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cambiarProductosPorPagina = async (cantidad: number) => {
    if (!OPCIONES_PRODUCTOS_POR_PAGINA.some((opcion) => opcion === cantidad)) return;
    setProductosPorPagina(cantidad);
    try {
      setLoading(true);
      await cargarProductosPagina(1, true, cantidad);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const abrirEditar = (producto: Producto) => {
    setEditando(producto);
    setForm({
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      categoria_id: producto.categoria_id.toString(),
      precio: producto.precio.toString(),
      unidad_medida: producto.unidad_medida,
      stock_actual: producto.stock_actual.toString(),
      stock_minimo: producto.stock_minimo.toString(),
      stock_maximo: producto.stock_maximo.toString(),
      costo: producto.costo?.toString() || '',
      ubicacion: producto.ubicacion || '',
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setForm({
      codigo: '',
      nombre: '',
      descripcion: '',
      categoria_id: '',
      precio: '',
      unidad_medida: 'unidad',
      stock_actual: '',
      stock_minimo: '5',
      stock_maximo: '100',
      costo: '',
      ubicacion: '',
    });
  };

  const abrirNuevoProducto = () => {
    resetForm();
    setEditando(null);
    setForm((actual) => ({
      ...actual,
      unidad_medida: unidadPorDefectoDeRubro(tipoNegocio),
    }));
    setShowModal(true);
  };

  const getStockColor = (estado: string) => {
    switch (estado) {
      case 'sin_stock': return 'bg-red-100 text-red-800';
      case 'bajo': return 'bg-yellow-100 text-yellow-800';
      case 'exceso': return 'bg-purple-100 text-purple-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  const getStockLabel = (estado: string) => {
    switch (estado) {
      case 'sin_stock': return 'Sin Stock';
      case 'bajo': return 'Stock Bajo';
      case 'exceso': return 'Exceso';
      default: return 'Normal';
    }
  };

  const formatPrecio = (precio: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(precio);
  };

  const etiquetasUnidad: Record<string, string> = {
    unidad: 'unidad',
    kg: 'kg',
    g: 'g',
    l: 'L',
    ml: 'ml',
  };
  const etiquetaUnidad = (unidad: string) => etiquetasUnidad[unidad] || unidad;
  const formatoCantidad = (cantidad: number) =>
    new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(cantidad);
  const pasoCantidad = form.unidad_medida === 'unidad' ? '1' : '0.001';
  const totalPaginas = Math.max(1, Math.ceil(totalProductos / productosPorPagina));
  const inicioRango = totalProductos === 0 ? 0 : (pagina - 1) * productosPorPagina + 1;
  const finRango = Math.min(pagina * productosPorPagina, totalProductos);
  const filasVisiblesImportacion = filasImportacion.filter((producto) => {
    const consulta = filtroImportacion.trim().toLocaleLowerCase();
    return !consulta || `${producto.codigo} ${producto.nombre} ${producto.categoria}`.toLocaleLowerCase().includes(consulta);
  });
  const cantidadValidaImportacion = filasImportacion.filter((producto) => producto.errores.length === 0).length;
  const cantidadConErrorImportacion = filasImportacion.length - cantidadValidaImportacion;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <div className="flex flex-none flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputImportacionRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={leerArchivoImportacion}
          />
          {puedeGestionar && (
            <>
              <button
                type="button"
                onClick={() => inputImportacionRef.current?.click()}
                disabled={cargandoArchivo}
                className="rounded border border-blue-600 px-4 py-2 font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                {cargandoArchivo ? 'Leyendo archivo…' : 'Importar Excel'}
              </button>
              <button
                onClick={abrirNuevoProducto}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                + Nuevo Producto
              </button>
            </>
          )}
        </div>
      </div>

      {errorImportacion && (
        <div role="alert" className="flex-none rounded border border-red-300 bg-red-50 px-4 py-3 text-red-800">
          {errorImportacion}
          <button onClick={() => setErrorImportacion('')} className="float-right font-bold">×</button>
        </div>
      )}
      {resultadoImportacion && (
        <div role="status" className="flex-none whitespace-pre-line rounded border border-green-300 bg-green-50 px-4 py-3 text-green-800">
          {resultadoImportacion}
          <button onClick={() => setResultadoImportacion('')} className="float-right font-bold">×</button>
        </div>
      )}

      <div className="flex-none rounded-lg bg-white p-2 shadow sm:p-3">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <div>
            <label className="mb-0.5 block text-xs font-medium">Buscar</label>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o codigo..."
              className="w-full rounded border px-2 py-1 text-sm sm:px-3 sm:py-1.5"
              onKeyDown={(e) => e.key === 'Enter' && handleBuscar()}
            />
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium">Categoria</label>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full rounded border px-2 py-1 text-sm sm:px-3 sm:py-1.5"
            >
              <option value="">Todas</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block text-xs font-medium">Estado Stock</label>
            <select
              value={filtroStock}
              onChange={(e) => setFiltroStock(e.target.value as any)}
              className="w-full rounded border px-2 py-1 text-sm sm:px-3 sm:py-1.5"
            >
              <option value="todos">Todos</option>
              <option value="bajo">Stock Bajo</option>
              <option value="sin_stock">Sin Stock</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleBuscar}
              className="w-full rounded bg-gray-600 px-3 py-1 text-sm text-white hover:bg-gray-700 sm:py-1.5"
            >
              Filtrar
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex-none rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
          {error}
          <button onClick={() => setError('')} className="float-right font-bold">x</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white shadow">
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full table-auto divide-y divide-gray-200">
            <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código ↑</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Unidad</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Precio</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Costo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ubicación</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-2 text-center text-gray-500">Cargando...</td>
                </tr>
              ) : productos.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-2 text-center text-gray-500">No hay productos</td>
                </tr>
              ) : (
                productos.map((producto) => (
                  <tr
                    key={producto.id}
                    onClick={() => setProductoSeleccionadoId(producto.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setProductoSeleccionadoId(producto.id);
                      }
                    }}
                    tabIndex={0}
                    aria-selected={productoSeleccionadoId === producto.id}
                    className={`cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${productoSeleccionadoId === producto.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  >
                    <td className="px-6 py-2 text-sm font-medium text-gray-900">{producto.codigo}</td>
                    <td className="px-6 py-2 text-sm text-gray-900">{producto.nombre}</td>
                    <td className="px-6 py-2 text-sm text-gray-500">{producto.categoria_nombre || '-'}</td>
                    <td className="px-6 py-2 text-center text-sm text-gray-900">{etiquetaUnidad(producto.unidad_medida)}</td>
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm text-gray-900">{formatPrecio(producto.precio)} / {etiquetaUnidad(producto.unidad_medida)}</td>
                    <td className="px-6 py-2 whitespace-nowrap text-right text-sm text-gray-900">
                      {producto.costo == null ? '—' : formatPrecio(producto.costo)}
                    </td>
                    <td className="px-6 py-2 text-sm text-gray-500">{producto.ubicacion || '—'}</td>
                    <td className="px-6 py-2 whitespace-nowrap text-center text-sm text-gray-900">{formatoCantidad(producto.stock_actual)} {etiquetaUnidad(producto.unidad_medida)}</td>
                    <td className="px-6 py-2 whitespace-nowrap text-center">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStockColor(producto.estado_stock)}`}>
                        {getStockLabel(producto.estado_stock)}
                      </span>
                    </td>
                    <td className="px-6 py-2 whitespace-nowrap text-center text-sm font-medium">
                      {puedeGestionar ? (
                        <>
                          <button
                            onClick={(event) => { event.stopPropagation(); setProductoSeleccionadoId(producto.id); abrirEditar(producto); }}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                          >Editar</button>
                          <button
                            onClick={(event) => { event.stopPropagation(); setProductoSeleccionadoId(producto.id); void handleEliminar(producto.id); }}
                            disabled={producto.movimientos_count > 0 || producto.facturas_count > 0}
                            title={producto.movimientos_count > 0 || producto.facturas_count > 0
                              ? 'Tiene historial de inventario o facturación; no se puede eliminar'
                              : 'Eliminar producto'}
                            className="text-red-600 hover:text-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                          >Eliminar</button>
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex-none border-t border-gray-200 bg-white px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm text-gray-600">
                Mostrando {inicioRango}–{finRango} de {totalProductos} productos · Ordenados por código
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                Filas por página
                <select
                  aria-label="Filas por página"
                  value={productosPorPagina}
                  onChange={(event) => void cambiarProductosPorPagina(Number(event.target.value))}
                  disabled={loading}
                  className="rounded border border-gray-300 bg-white px-2 py-1.5 disabled:opacity-50"
                >
                  {OPCIONES_PRODUCTOS_POR_PAGINA.map((cantidad) => (
                    <option key={cantidad} value={cantidad}>{cantidad}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => void cambiarPagina(pagina - 1)}
                disabled={pagina <= 1 || loading}
                className="rounded border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >Anterior</button>
              <span className="min-w-24 text-center text-sm text-gray-700">Página {pagina} de {totalPaginas}</span>
              <button
                type="button"
                onClick={() => void cambiarPagina(pagina + 1)}
                disabled={pagina >= totalPaginas || loading}
                className="rounded border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >Siguiente</button>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-3 sm:p-5">
          <div className="mx-auto my-2 max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-lg sm:my-4 sm:p-6">
            <h2 className="text-xl font-bold mb-4">{editando ? 'Editar Producto' : 'Nuevo Producto'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Codigo *</label>
                <input type="text" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} className="w-full border rounded px-3 py-2" required disabled={!!editando} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nombre *</label>
                <input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="w-full border rounded px-3 py-2" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Descripcion</label>
                <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} className="w-full border rounded px-3 py-2" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Categoria *</label>
                <select value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} className="w-full border rounded px-3 py-2" required>
                  <option value="">Seleccionar...</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Unidad de medida *</label>
                <select
                  value={form.unidad_medida}
                  onChange={(e) => setForm({ ...form, unidad_medida: e.target.value as UnidadMedida })}
                  className="w-full border rounded px-3 py-2"
                  required
                >
                  <option value="unidad">Unidad (cantidad entera)</option>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="g">Gramo (g)</option>
                  <option value="l">Litro (L)</option>
                  <option value="ml">Mililitro (ml)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Precio y stock usarán esta unidad. Se admiten hasta tres decimales; "unidad" requiere cantidades enteras.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Precio por {etiquetaUnidad(form.unidad_medida)} *</label>
                  <input type="number" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} className="w-full border rounded px-3 py-2" required min="0" step="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Actual ({etiquetaUnidad(form.unidad_medida)}) *</label>
                  <input type="number" value={form.stock_actual} onChange={(e) => setForm({ ...form, stock_actual: e.target.value })} className="w-full border rounded px-3 py-2" required min="0" step={pasoCantidad} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Mínimo ({etiquetaUnidad(form.unidad_medida)})</label>
                  <input type="number" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} className="w-full border rounded px-3 py-2" min="0" step={pasoCantidad} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Stock Máximo ({etiquetaUnidad(form.unidad_medida)})</label>
                  <input type="number" value={form.stock_maximo} onChange={(e) => setForm({ ...form, stock_maximo: e.target.value })} className="w-full border rounded px-3 py-2" min="0" step={pasoCantidad} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Costo unitario de compra</label>
                  <input
                    type="number"
                    value={form.costo}
                    onChange={(e) => setForm({ ...form, costo: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    min="0"
                    step="0.01"
                    placeholder="Opcional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Ubicación</label>
                  <input
                    type="text"
                    value={form.ubicacion}
                    onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                    placeholder="Ej. Bodega A, estante 3"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => { setShowModal(false); setEditando(null); }} className="px-4 py-2 border rounded hover:bg-gray-100">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {editando ? 'Guardar Cambios' : 'Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 sm:p-6">
          <section className="flex max-h-[94vh] w-full max-w-7xl flex-col rounded-lg bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Revisar importación de Excel</h2>
                <p className="mt-1 text-sm text-gray-600">
                  La categoría vacía se asigna a “Importados”. La unidad vacía se interpreta como “unidad”; cambia a kg o g los productos que vendas por peso. La cantidad y los precios se entienden en la unidad elegida, sin conversión automática.
                </p>
                <p className="mt-1 text-sm font-medium text-gray-700">
                  {cantidadValidaImportacion} listos para importar · {cantidadConErrorImportacion} con errores · los códigos existentes se omitirán sin cambiarlos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowImportModal(false); setFilasImportacion([]); }}
                className="rounded px-3 py-1 text-gray-500 hover:bg-gray-100"
                aria-label="Cerrar importación"
              >
                ×
              </button>
            </div>

            <div className="mb-3">
              <input
                type="search"
                value={filtroImportacion}
                onChange={(event) => setFiltroImportacion(event.target.value)}
                placeholder="Filtrar por código o nombre para localizar productos por peso…"
                className="w-full rounded border border-gray-300 px-3 py-2"
              />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <label htmlFor="unidad-masiva-importacion" className="font-medium text-gray-700">Unidad para los resultados:</label>
              <select
                id="unidad-masiva-importacion"
                value={unidadMasivaImportacion}
                onChange={(event) => setUnidadMasivaImportacion(event.target.value as UnidadMedida)}
                className="rounded border border-gray-300 px-2 py-1"
              >
                <option value="unidad">Unidad</option>
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="l">L</option>
                <option value="ml">ml</option>
              </select>
              <button
                type="button"
                onClick={aplicarUnidadAResultados}
                disabled={!filtroImportacion.trim()}
                className="rounded border border-blue-600 px-3 py-1 text-blue-700 disabled:opacity-40"
              >
                Aplicar a los productos filtrados
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto rounded border border-gray-200">
              <table className="min-w-[1100px] divide-y divide-gray-200 text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Fila</th>
                    <th className="px-3 py-2 text-left">Código</th>
                    <th className="px-3 py-2 text-left">Nombre</th>
                    <th className="px-3 py-2 text-left">Categoría</th>
                    <th className="px-3 py-2 text-left">Unidad</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Stock</th>
                    <th className="px-3 py-2 text-left">Validación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filasVisiblesImportacion.map((producto) => (
                    <tr key={`${producto.filaExcel}-${producto.codigo}`} className={producto.errores.length ? 'bg-red-50' : ''}>
                      <td className="px-3 py-2 text-gray-500">{producto.filaExcel}</td>
                      <td className="px-3 py-2 font-mono">{producto.codigo || '—'}</td>
                      <td className="px-3 py-2">{producto.nombre || '—'}</td>
                      <td className="px-3 py-2">{producto.categoria || 'Importados'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={producto.unidad_medida}
                          onChange={(event) => cambiarUnidadImportada(producto.filaExcel, event.target.value as UnidadMedida)}
                          className="rounded border border-gray-300 px-2 py-1"
                          aria-label={`Unidad de ${producto.nombre || producto.codigo}`}
                        >
                          <option value="unidad">Unidad</option>
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="l">L</option>
                          <option value="ml">ml</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right">{producto.costo == null ? '—' : formatPrecio(producto.costo)}</td>
                      <td className="px-3 py-2 text-right">{Number.isFinite(producto.precio) ? formatPrecio(producto.precio) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {Number.isFinite(producto.stock_actual) ? `${formatoCantidad(producto.stock_actual)} ${etiquetaUnidad(producto.unidad_medida)}` : '—'}
                      </td>
                      <td className="max-w-sm px-3 py-2 text-xs text-red-700">
                        {producto.errores.length ? producto.errores.join('; ') : 'Listo'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowImportModal(false); setFilasImportacion([]); }}
                className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void ejecutarImportacion()}
                disabled={importando || cantidadValidaImportacion === 0}
                className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {importando ? 'Importando…' : `Importar ${cantidadValidaImportacion} productos`}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default ProductosPage;

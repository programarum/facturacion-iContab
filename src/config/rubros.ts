import type { UnidadMedida } from '../services/api';

// Configuración por rubro del negocio: unidad de medida por defecto al crear
// productos y categorías sugeridas para arrancar rápido con cada actividad.
export type TipoNegocio =
  | 'general'
  | 'panaderia'
  | 'legumbreria'
  | 'farmacia'
  | 'tienda_agricola'
  | 'tienda_mixta';

export interface CategoriaSugerida {
  nombre: string;
  descripcion: string;
}

export interface RubroConfig {
  etiqueta: string;
  unidadPorDefecto: UnidadMedida;
  categoriasSugeridas: CategoriaSugerida[];
}

export const RUBROS: Record<TipoNegocio, RubroConfig> = {
  general: {
    etiqueta: 'Tienda / negocio general',
    unidadPorDefecto: 'unidad',
    categoriasSugeridas: [
      { nombre: 'Abarrotes', descripcion: 'Productos de despensa y consumo diario' },
      { nombre: 'Bebidas', descripcion: 'Gaseosas, aguas y jugos' },
      { nombre: 'Snacks', descripcion: 'Mecato, galletas y pasabocas' },
      { nombre: 'Aseo y hogar', descripcion: 'Artículos de aseo y limpieza' },
      { nombre: 'Varios', descripcion: 'Productos que no encajan en otra categoría' },
    ],
  },
  tienda_mixta: {
    etiqueta: 'Tienda mixta (comidas, frutas y verduras, abarrotes)',
    unidadPorDefecto: 'kg',
    categoriasSugeridas: [
      { nombre: 'Frutas', descripcion: 'Frutas frescas, valor por kg' },
      { nombre: 'Verduras', descripcion: 'Verduras y hortalizas, valor por kg' },
      { nombre: 'Tubérculos', descripcion: 'Papa, yuca, plátano y similares' },
      { nombre: 'Comidas preparadas', descripcion: 'Desayunos y almuerzos listos para servir' },
      { nombre: 'Abarrotes', descripcion: 'Granos, aceites, endulzantes y despensa' },
      { nombre: 'Lácteos y huevos', descripcion: 'Leche, quesos, cuajadas y huevos' },
      { nombre: 'Bebidas', descripcion: 'Gaseosas, aguas, jugos y café' },
      { nombre: 'Mecato y panadería', descripcion: 'Snacks, galletas y pan' },
      { nombre: 'Aseo y hogar', descripcion: 'Artículos de aseo y cuidado del hogar' },
    ],
  },
  panaderia: {
    etiqueta: 'Panadería',
    unidadPorDefecto: 'kg',
    categoriasSugeridas: [
      { nombre: 'Panadería', descripcion: 'Pan salado y de mesa' },
      { nombre: 'Pastelería', descripcion: 'Tortas, ponqués y postres' },
      { nombre: 'Bebidas', descripcion: 'Café, aromáticas y gaseosas' },
      { nombre: 'Insumos', descripcion: 'Materias primas, harinas y levaduras' },
    ],
  },
  legumbreria: {
    etiqueta: 'Legumbrería / frutería',
    unidadPorDefecto: 'kg',
    categoriasSugeridas: [
      { nombre: 'Frutas', descripcion: 'Frutas frescas, valor por kg' },
      { nombre: 'Verduras', descripcion: 'Verduras y hortalizas, valor por kg' },
      { nombre: 'Tubérculos', descripcion: 'Papa, yuca, plátano y similares' },
      { nombre: 'Granos', descripcion: 'Fríjol, arveja, lenteja y similares' },
      { nombre: 'Hierbas y aromáticas', descripcion: 'Cilantro, perejil y hierbas frescas' },
    ],
  },
  farmacia: {
    etiqueta: 'Farmacia',
    unidadPorDefecto: 'unidad',
    categoriasSugeridas: [
      { nombre: 'Medicamentos', descripcion: 'Medicamentos de venta libre y formulados' },
      { nombre: 'Cuidado personal', descripcion: 'Higiene y cuidado de la piel' },
      { nombre: 'Bebés', descripcion: 'Pañales, fórmulas y cuidado del bebé' },
      { nombre: 'Primeros auxilios', descripcion: 'Botiquín, vendas y antisépticos' },
      { nombre: 'Bebidas', descripcion: 'Agua, sueros y bebidas' },
    ],
  },
  tienda_agricola: {
    etiqueta: 'Tienda agrícola',
    unidadPorDefecto: 'kg',
    categoriasSugeridas: [
      { nombre: 'Semillas', descripcion: 'Semillas y material de siembra' },
      { nombre: 'Fertilizantes', descripcion: 'Abonos y fertilizantes' },
      { nombre: 'Herramientas', descripcion: 'Herramientas e implementos agrícolas' },
      { nombre: 'Insumos pecuarios', descripcion: 'Alimento y cuidado de animales' },
      { nombre: 'Abarrotes', descripcion: 'Productos de despensa' },
    ],
  },
};

export const rubroConfig = (tipo?: string | null): RubroConfig =>
  RUBROS[(tipo as TipoNegocio) ?? 'general'] ?? RUBROS.general;

export const unidadPorDefectoDeRubro = (tipo?: string | null): UnidadMedida =>
  rubroConfig(tipo).unidadPorDefecto;

export const categoriasSugeridasDeRubro = (tipo?: string | null): CategoriaSugerida[] =>
  rubroConfig(tipo).categoriasSugeridas;

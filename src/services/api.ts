import { tauriInvoke } from './auth';

export type UnidadMedida = 'unidad' | 'kg' | 'g' | 'l' | 'ml';

export interface ProductoImportarFila {
  codigo: string;
  nombre: string;
  categoria?: string;
  descripcion?: string;
  unidad_medida: UnidadMedida;
  costo: number | null;
  precio: number;
  stock_actual: number;
  stock_minimo?: number;
  stock_maximo?: number;
  ubicacion?: string;
}

export interface ResultadoImportacionProductos {
  insertados: number;
  omitidos: { codigo: string; nombre: string; motivo: string }[];
}

export interface MovimientosListaPaginada<T = any> {
  movimientos: T[];
  total: number;
}

export interface ProductosListaPaginada<T = any> {
  productos: T[];
  total: number;
}

// ==================== PRODUCTOS ====================

export const productosAPI = {
  listar: async (params?: {
    skip?: number;
    limit?: number;
    categoria_id?: number;
    stock_bajo?: boolean;
    sin_stock?: boolean;
    busqueda?: string;
  }): Promise<ProductosListaPaginada> => {
    const params_req = {
      skip: params?.skip,
      limit: params?.limit,
      categoria_id: params?.categoria_id,
      stock_bajo: params?.stock_bajo,
      sin_stock: params?.sin_stock,
      busqueda: params?.busqueda,
    };
    return tauriInvoke('listar_productos', { paramsReq: params_req });
  },

  buscar: async (q: string) => {
    return tauriInvoke('buscar_productos', { q });
  },

  crear: async (producto: {
    codigo: string;
    nombre: string;
    descripcion?: string;
    categoria_id: number;
    precio: number;
    stock_actual: number;
    stock_minimo?: number;
    stock_maximo?: number;
    unidad_medida: UnidadMedida;
    costo?: number | null;
    ubicacion?: string | null;
  }) => {
    return tauriInvoke('crear_producto', { req: { ...producto } });
  },

  importar: async (productos: ProductoImportarFila[]): Promise<ResultadoImportacionProductos> =>
    tauriInvoke('importar_productos', { req: { productos } }),

  actualizar: async (id: number, datos: any) => {
    return tauriInvoke('actualizar_producto', { id, req: { ...datos } });
  },

  eliminar: async (id: number) => {
    return tauriInvoke('eliminar_producto', { id });
  },
};

// ==================== CATEGORÍAS ====================

export const categoriasAPI = {
  listar: async () => {
    return tauriInvoke('listar_categorias');
  },

  crear: async (categoria: { nombre: string; descripcion?: string }) => {
    return tauriInvoke('crear_categoria', { req: { ...categoria } });
  },

  actualizar: async (id: number, datos: { nombre?: string; descripcion?: string }) => {
    return tauriInvoke('actualizar_categoria', { id, req: { ...datos } });
  },

  eliminar: async (id: number) => {
    return tauriInvoke('eliminar_categoria', { id });
  },
};

// ==================== MOVIMIENTOS ====================

export const movimientosAPI = {
  listar: async (params?: {
    skip?: number;
    limit?: number;
    tipo?: string;
    producto_id?: number;
    hoy?: boolean;
  }): Promise<MovimientosListaPaginada> => {
    const params_req = {
      skip: params?.skip,
      limit: params?.limit,
      tipo: params?.tipo,
      producto_id: params?.producto_id,
      hoy: params?.hoy,
    };
    return tauriInvoke('listar_movimientos', { paramsReq: params_req });
  },

  crear: async (movimiento: {
    producto_id: number;
    tipo: 'entrada' | 'salida';
    cantidad: number;
    nota?: string;
  }) => {
    return tauriInvoke('registrar_movimiento', { req: { ...movimiento } });
  },
};

// ==================== USUARIOS ====================

export const usuariosAPI = {
  listar: async () => {
    return tauriInvoke('listar_usuarios');
  },

  crear: async (usuario: {
    username: string;
    email: string;
    password: string;
    nombre: string;
    rol?: string;
  }) => {
    return tauriInvoke('crear_usuario', { req: { ...usuario } });
  },

  actualizar: async (id: number, datos: any) => {
    return tauriInvoke('actualizar_usuario', { id, req: { ...datos } });
  },

  cambiarPassword: async (usuario_id: number, nueva_password: string) => {
    return tauriInvoke('cambiar_password', { req: { usuario_id, nueva_password } });
  },
};

// ==================== FACTURACIÓN ====================

export const facturacionAPI = {
  clientes: {
    listar: async (busqueda?: string) => {
      return tauriInvoke('listar_clientes', { busqueda: busqueda ?? null });
    },

    crear: async (cliente: {
      tipo_identificacion: string;
      numero_identificacion: string;
      nombre: string;
      razon_social?: string;
      direccion?: string;
      telefono?: string;
      email?: string;
      responsable_iva?: boolean;
      regimen?: string;
    }) => {
      return tauriInvoke('crear_cliente', { req: { ...cliente } });
    },
  },

  facturas: {
    listar: async () => {
      return tauriInvoke('listar_facturas');
    },

    historial: async (fechaDesde: string, fechaHasta: string) => {
      return tauriInvoke('listar_facturas_historial', { fechaDesde, fechaHasta });
    },

    obtener: async (id: number) => {
      return tauriInvoke('obtener_factura', { id });
    },

    crear: async (factura: {
      cliente_id: number;
      items: {
        producto_id: number;
        cantidad: number;
        precio_unitario: number;
        descuento?: number;
      }[];
      fecha_vencimiento?: string;
    }) => {
      return tauriInvoke('crear_factura', { req: { ...factura } });
    },
  },

  configuracion: {
    obtener: async () => {
      return tauriInvoke('obtener_configuracion');
    },
  },
};

// ==================== PERFIL DEL NEGOCIO ====================

export interface ConfiguracionNegocio {
  nit: string;
  nombre_empresa: string;
  razon_social: string;
  direccion: string;
  telefono: string;
  email: string;
  tipo_negocio: 'general' | 'panaderia' | 'legumbreria' | 'farmacia' | 'tienda_agricola' | 'tienda_mixta';
  aplica_iva: boolean;
}

export const configuracionNegocioAPI = {
  obtener: async (): Promise<ConfiguracionNegocio> =>
    tauriInvoke('obtener_configuracion_negocio'),

  guardar: async (configuracion: ConfiguracionNegocio): Promise<ConfiguracionNegocio> =>
    tauriInvoke('guardar_configuracion_negocio', { req: configuracion }),
};

// ==================== DASHBOARD ====================

export const dashboardAPI = {
  stats: async () => {
    return tauriInvoke('dashboard_stats');
  },
};

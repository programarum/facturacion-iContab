import { apiFetch } from './auth';

const parseError = async (res: Response, fallback: string): Promise<never> => {
  try {
    const error = await res.json();
    if (Array.isArray(error.detail)) {
      throw new Error(error.detail.map((e: any) => e.msg).join(', '));
    }
    throw new Error(error.detail || fallback);
  } catch (err: any) {
    if (err.message) throw err;
    throw new Error(fallback);
  }
};

// ==================== PRODUCTOS ====================

export const productosAPI = {
  listar: async (params?: {
    skip?: number;
    limit?: number;
    categoria_id?: number;
    stock_bajo?: boolean;
    sin_stock?: boolean;
    busqueda?: string;
  }) => {
    const query = new URLSearchParams();
    if (params?.skip) query.append('skip', params.skip.toString());
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.categoria_id) query.append('categoria_id', params.categoria_id.toString());
    if (params?.stock_bajo) query.append('stock_bajo', 'true');
    if (params?.sin_stock) query.append('sin_stock', 'true');
    if (params?.busqueda) query.append('busqueda', params.busqueda);
    
    const url = `/productos/${query.toString() ? '?' + query.toString() : ''}`;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Error al cargar productos');
    return res.json();
  },

  buscar: async (q: string) => {
    const res = await apiFetch(`/productos/buscar?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('Error en búsqueda');
    return res.json();
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
  }) => {
    const res = await apiFetch('/productos/', {
      method: 'POST',
      body: JSON.stringify(producto),
    });
    if (!res.ok) return parseError(res, 'Error al crear producto');
    return res.json();
  },

  actualizar: async (id: number, datos: any) => {
    const res = await apiFetch(`/productos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(datos),
    });
    if (!res.ok) return parseError(res, 'Error al actualizar');
    return res.json();
  },

  eliminar: async (id: number) => {
    const res = await apiFetch(`/productos/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) return parseError(res, 'Error al eliminar');
    return res.json();
  },
};

// ==================== CATEGORÍAS ====================

export const categoriasAPI = {
  listar: async () => {
    const res = await apiFetch('/categorias/');
    if (!res.ok) throw new Error('Error al cargar categorías');
    return res.json();
  },

  crear: async (categoria: { nombre: string; descripcion?: string }) => {
    const res = await apiFetch('/categorias/', {
      method: 'POST',
      body: JSON.stringify(categoria),
    });
    if (!res.ok) return parseError(res, 'Error al crear categoría');
    return res.json();
  },

  actualizar: async (id: number, datos: { nombre?: string; descripcion?: string }) => {
    const res = await apiFetch(`/categorias/${id}`, {
      method: 'PUT',
      body: JSON.stringify(datos),
    });
    if (!res.ok) return parseError(res, 'Error al actualizar');
    return res.json();
  },

  eliminar: async (id: number) => {
    const res = await apiFetch(`/categorias/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) return parseError(res, 'Error al eliminar');
    return res.json();
  },
};

// ==================== MOVIMIENTOS ====================

export const movimientosAPI = {
  listar: async (params?: {
    skip?: number;
    limit?: number;
    tipo?: string;
    producto_id?: number;
  }) => {
    const query = new URLSearchParams();
    if (params?.skip) query.append('skip', params.skip.toString());
    if (params?.limit) query.append('limit', params.limit.toString());
    if (params?.tipo) query.append('tipo', params.tipo);
    if (params?.producto_id) query.append('producto_id', params.producto_id.toString());
    
    const url = `/movimientos/${query.toString() ? '?' + query.toString() : ''}`;
    const res = await apiFetch(url);
    if (!res.ok) throw new Error('Error al cargar movimientos');
    return res.json();
  },

  crear: async (movimiento: {
    producto_id: number;
    tipo: 'entrada' | 'salida';
    cantidad: number;
    nota?: string;
  }) => {
    const res = await apiFetch('/movimientos/', {
      method: 'POST',
      body: JSON.stringify(movimiento),
    });
    if (!res.ok) return parseError(res, 'Error al crear movimiento');
    return res.json();
  },
};

// ==================== USUARIOS ====================

export const usuariosAPI = {
  listar: async () => {
    const res = await apiFetch('/usuarios/');
    if (!res.ok) throw new Error('Error al cargar usuarios');
    return res.json();
  },

  crear: async (usuario: {
    username: string;
    email: string;
    password: string;
    nombre: string;
    rol?: string;
  }) => {
    const res = await apiFetch('/usuarios/', {
      method: 'POST',
      body: JSON.stringify(usuario),
    });
    if (!res.ok) return parseError(res, 'Error al crear usuario');
    return res.json();
  },

  actualizar: async (id: number, datos: any) => {
    const res = await apiFetch(`/usuarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(datos),
    });
    if (!res.ok) return parseError(res, 'Error al actualizar');
    return res.json();
  },
};

// ==================== FACTURACIÓN ====================

export const facturacionAPI = {
  clientes: {
    listar: async (busqueda?: string) => {
      const url = busqueda 
        ? `/facturacion/clientes/buscar?q=${encodeURIComponent(busqueda)}`
        : '/facturacion/clientes';
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('Error al cargar clientes');
      return res.json();
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
      const res = await apiFetch('/facturacion/clientes', {
        method: 'POST',
        body: JSON.stringify(cliente),
      });
      if (!res.ok) return parseError(res, 'Error al crear cliente');
      return res.json();
    },
  },

  facturas: {
    listar: async () => {
      const res = await apiFetch('/facturacion/facturas');
      if (!res.ok) throw new Error('Error al cargar facturas');
      return res.json();
    },

    obtener: async (id: number) => {
      const res = await apiFetch(`/facturacion/facturas/${id}`);
      if (!res.ok) throw new Error('Error al obtener factura');
      return res.json();
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
      const res = await apiFetch('/facturacion/facturas', {
        method: 'POST',
        body: JSON.stringify(factura),
      });
      if (!res.ok) return parseError(res, 'Error al crear factura');
      return res.json();
    },
  },

  configuracion: {
    obtener: async () => {
      const res = await apiFetch('/facturacion/configuracion');
      if (!res.ok) throw new Error('Error al obtener configuración');
      return res.json();
    },
  },
};

// ==================== DASHBOARD ====================

export const dashboardAPI = {
  stats: async () => {
    const res = await apiFetch('/dashboard/stats');
    if (!res.ok) throw new Error('Error al cargar estadísticas');
    return res.json();
  },
};

# backend/app/schemas.py
from pydantic import BaseModel, Field, computed_field, validator, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
import re

from app.models import TipoMovimiento

# ============================================================
# USUARIOS
# ============================================================

class UsuarioBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    nombre: str = Field(..., min_length=2, max_length=100)

class UsuarioCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(
        ...,
        min_length=8,
        max_length=128
    )
    nombre: str = Field(..., min_length=2, max_length=100)
    rol: Optional[str] = "usuario"
    
    # 🔒 Validación: contraseña fuerte
    @validator('password')
    def password_fuerte(cls, v):
        if not re.search(r'[A-Z]', v):
            raise ValueError('Debe contener al menos una mayúscula')
        if not re.search(r'[a-z]', v):
            raise ValueError('Debe contener al menos una minúscula')
        if not re.search(r'\d', v):
            raise ValueError('Debe contener al menos un número')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Debe contener al menos un carácter especial')
        return v

class UsuarioUpdate(BaseModel):
    nombre: Optional[str] = None
    email: Optional[EmailStr] = None
    rol: Optional[str] = None
    activo: Optional[bool] = None
    bloqueado: Optional[bool] = None

class UsuarioResponse(UsuarioBase):
    id: int
    rol: str
    activo: bool
    bloqueado: bool
    ultimo_acceso: Optional[datetime] = None
    creado_en: datetime
    
    class Config:
        from_attributes = True

class UsuarioMeResponse(BaseModel):
    id: int
    username: str
    nombre: str
    email: str
    rol: str
    cambio_password_obligatorio: bool
    ultimo_acceso: Optional[datetime] = None    

# ============================================================
# LOGIN / AUTH
# ============================================================

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(
        ...,
        min_length=8,
        max_length=128
    )
    
    # 🔒 Validación: prevenir inyección básica
    @validator('password')
    def no_espacios(cls, v):
        if ' ' in v:
            raise ValueError('La contraseña no puede contener espacios')
        return v


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # segundos    

class RefreshTokenRequest(BaseModel):
    refresh_token: str


# ============================================================
# CATEGORÍAS
# ============================================================

class CategoriaBase(BaseModel):
    nombre: str = Field(..., min_length=2, max_length=100)
    descripcion: Optional[str] = Field(None, max_length=255)

class CategoriaCreate(CategoriaBase):
    pass

class CategoriaUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None

class CategoriaResponse(CategoriaBase):
    id: int
    productos_count: Optional[int] = 0
    
    class Config:
        from_attributes = True

# ============================================================
# PRODUCTOS
# ============================================================

class ProductoBase(BaseModel):
    codigo: str
    nombre: str
    descripcion: Optional[str] = None
    categoria_id: int
    stock_minimo: int = 5
    stock_maximo: int = 100
    precio: float = 0.0

class ProductoCreate(ProductoBase):
    stock_actual: int = 0

class ProductoResponse(ProductoBase):
    id: int
    stock_actual: int
    @computed_field
    @property
    def estado_stock(self) -> str:
        if self.stock_actual <= 0:
            return "sin_stock"
        elif self.stock_actual < self.stock_minimo:
            return "bajo"
        elif self.stock_actual > self.stock_maximo:
            return "exceso"
        else:
            return "normal"
    
    
    class Config:
        from_attributes = True

class ProductoUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None
    categoria_id: Optional[int] = None
    precio: Optional[float] = Field(None, ge=0)
    stock_actual: Optional[int] = Field(None, ge=0)
    stock_minimo: Optional[int] = Field(None, ge=0)
    stock_maximo: Optional[int] = Field(None, ge=0)

# ============================================================
# MOVIMIENTOS
# ============================================================

class MovimientoCreate(BaseModel):
    producto_id: int
    tipo: TipoMovimiento
    cantidad: int
    usuario_id: int
    nota: Optional[str] = None

class MovimientoResponse(BaseModel):
    id: int
    producto_id: int
    producto_nombre: str
    producto_codigo: str
    tipo: TipoMovimiento
    cantidad: int
    fecha: datetime
    usuario_username: str
    nota: Optional[str] = None
    
    class Config:
        from_attributes = True

# ============================================================
# CLIENTES (Facturación)
# ============================================================


class ClienteBase(BaseModel):
    tipo_identificacion: str = Field(..., pattern=r'^(CC|NIT|CE|TI|PA)$')
    numero_identificacion: str = Field(..., min_length=5, max_length=20)
    nombre: str = Field(..., min_length=2, max_length=200)
    razon_social: Optional[str] = Field(None, max_length=200)
    direccion: Optional[str] = Field(None, max_length=200)
    telefono: Optional[str] = Field(None, max_length=50)
    email: Optional[EmailStr] = None
    responsable_iva: bool = False
    regimen: Optional[str] = "No responsable de IVA"

class ClienteCreate(ClienteBase):
    pass

class ClienteUpdate(BaseModel):
    nombre: Optional[str] = None
    razon_social: Optional[str] = None
    direccion: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    responsable_iva: Optional[bool] = None
    regimen: str = "None"

class ClienteResponse(ClienteBase):
    id: int
    creado_en: datetime
    
    class Config:
        from_attributes = True

# ============================================================
# FACTURAS
# ============================================================

class FacturaItemCreate(BaseModel):
    producto_id: int
    cantidad: int = Field(..., gt=0)
    precio_unitario: float = Field(..., gt=0)
    descuento: Optional[float] = Field(0.0, ge=0)

class FacturaCreate(BaseModel):
    cliente_id: int
    items: List[FacturaItemCreate] = Field(..., min_length=1)
    tipo_documento: Optional[str] = "FACTURA_VENTA"
    fecha_vencimiento: Optional[datetime] = None

class FacturaItemResponse(BaseModel):
    id: int
    cantidad: int
    descripcion: str
    precio_unitario: float
    descuento: float
    subtotal: float
    iva: float
    total: float

class FacturaResponse(BaseModel):
    id: int
    numero_completo: str
    fecha_emision: datetime
    estado_dian: str
    cliente: ClienteResponse
    items: List[FacturaItemResponse]
    subtotal: float
    descuento: float
    base_gravable: float
    iva: float
    iva_porcentaje: float
    total: float
    cufe: Optional[str] = None
    
    class Config:
        from_attributes = True


# ============================================================
# CONFIGURACIÓN EMPRESA
# ============================================================


class ConfiguracionEmpresaCreate(BaseModel):
    nit: str = Field(..., min_length=5, max_length=20)
    nombre_empresa: str = Field(..., min_length=2, max_length=200)
    razon_social: str = Field(..., min_length=2, max_length=200)
    direccion: str = Field(..., min_length=5, max_length=200)
    telefono: str = Field(..., min_length=5, max_length=50)
    email: EmailStr
    software_id: str = Field(..., min_length=10, max_length=100)
    pin: str = Field(..., min_length=4, max_length=10)
    prefijo_factura: str = "SET"
    numero_desde: int = 1
    numero_hasta: int = 1000000
    numero_resolucion: Optional[str] = None
    fecha_resolucion: Optional[datetime] = None
    fecha_vencimiento_resolucion: Optional[datetime] = None

class ConfiguracionEmpresaResponse(BaseModel):
    nit: str
    nombre_empresa: str
    razon_social: str
    direccion: str
    telefono: str
    email: str
    prefijo_factura: str
    numero_actual: int
    numero_resolucion: Optional[str] = None
    
    class Config:
        from_attributes = True

# ============================================================
# AUDITORÍA
# ============================================================

class LogAuditoriaResponse(BaseModel):
    id: int
    usuario_id: Optional[int]
    usuario_username: Optional[str]
    accion: str
    severidad: str
    entidad_tipo: Optional[str]
    entidad_id: Optional[int]
    entidad_nombre: Optional[str]
    descripcion: Optional[str]
    datos_antes: Optional[Dict[str, Any]]
    datos_despues: Optional[Dict[str, Any]]
    cambios: Optional[Dict[str, Any]]
    ip_address: Optional[str]
    timestamp: datetime
    exito: bool
    error_mensaje: Optional[str]
    
    class Config:
        from_attributes = True

class LogAuditoriaFiltros(BaseModel):
    usuario_id: Optional[int] = None
    accion: Optional[str] = None
    severidad: Optional[str] = None
    fecha_desde: Optional[datetime] = None
    fecha_hasta: Optional[datetime] = None
    entidad_tipo: Optional[str] = None
    exito: Optional[bool] = None

# ============================================================
# DASHBOARD
# ============================================================

class DashboardAlerta(BaseModel):
    tipo: str
    nivel: str
    icono: str
    mensaje: str
    accion: Optional[str] = None

class DashboardResumen(BaseModel):
    total_productos: int
    sin_stock: int
    stock_bajo: int
    stock_normal: int
    movimientos_hoy: int
    cantidad_movida_hoy: int
    usuarios_activos_hoy: Optional[int] = None

class DashboardGraficos(BaseModel):
    actividad_por_hora: Optional[List[Dict[str, Any]]] = None
    top_usuarios: Optional[List[Dict[str, Any]]] = None
    distribucion_stock: Optional[Dict[str, int]] = None

class DashboardResponse(BaseModel):
    usuario: Dict[str, Any]
    timestamp: datetime
    alertas: Optional[List[DashboardAlerta]] = None
    resumen: Optional[DashboardResumen] = None
    graficos: Optional[DashboardGraficos] = None
    mis_movimientos_hoy: Optional[int] = None
    productos_criticos: Optional[List[Dict[str, Any]]] = None
    movimientos_recientes: Optional[List[Dict[str, Any]]] = None
    mi_rendimiento: Optional[Dict[str, Any]] = None
    mi_actividad_semanal: Optional[List[Dict[str, Any]]] = None
    mis_productos_top: Optional[List[Dict[str, Any]]] = None    
    
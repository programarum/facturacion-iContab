# backend/app/models.py

from sqlalchemy import DateTime, Enum, Integer, String, Boolean, Float, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.database import Base
from typing import Optional, List
import enum



class Rol(enum.Enum):
    ADMIN = "admin"
    USUARIO = "usuario"
    MODERADOR = "moderador"

class TipoMovimiento(str, enum.Enum):
    ENTRADA = "entrada"
    SALIDA = "salida"

class EstadoStock(enum.Enum):
    SIN_STOCK = "sin_stock"
    STOCK_BAJO = "stock_bajo"
    NORMAL = "normal"
    EXCEDE = "excede"

class Usuario(Base):
    __tablename__ = "usuarios"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    
    #  Seguridad: contraseña hasheada con bcrypt
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    
    #  Seguridad: salt único por usuario (defensa en profundidad)
    salt: Mapped[str] = mapped_column(String(32), nullable=False)
    
    rol: Mapped[Rol] = mapped_column(Enum(Rol), default=Rol.USUARIO, nullable=False)
    activo: Mapped[bool] = mapped_column(Boolean, default=True)
    bloqueado: Mapped[bool] = mapped_column(Boolean, default=False)
    
    #  Seguridad: intentos fallidos
    intentos_fallidos: Mapped[int] = mapped_column(Integer, default=0)
    ultimo_intento: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    
    #  Seguridad: cambio de contraseña obligatorio
    cambio_password_obligatorio: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ultimo_cambio_password: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    #  Seguridad: auditoría
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ultimo_acceso: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    ip_ultimo_acceso: Mapped[str] = mapped_column(String(45), nullable=True)  # IPv6 compatible

    # Asegúrate de que esta línea exista dentro de la clase Usuario
    logs = relationship("Log", back_populates="usuario")

class Log(Base):
    __tablename__ = "logs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"))
    
    # El back_populates de aquí debe llamarse EXACTAMENTE igual al campo en la clase Usuario
    usuario = relationship("Usuario", back_populates="logs")

class Categoria(Base):
    __tablename__ = "categorias"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nombre: Mapped[str] = mapped_column(String, unique=True)
    descripcion: Mapped[str] = mapped_column(String, nullable=True)
    productos: Mapped[list["Producto"]] = relationship("Producto", back_populates="categoria")

class Producto(Base):
    __tablename__ = "productos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str] = mapped_column(String, unique=True)
    nombre: Mapped[str] = mapped_column(String)
    descripcion: Mapped[str] = mapped_column(String, nullable=True)
    categoria_id: Mapped[int] = mapped_column(Integer, ForeignKey("categorias.id"))
    stock_actual: Mapped[int] = mapped_column(Integer, default=0)
    stock_minimo: Mapped[int] = mapped_column(Integer, default=5)
    stock_maximo: Mapped[int] = mapped_column(Integer, default=100)
    precio: Mapped[float] = mapped_column(Float, default=0.0)

    categoria = relationship("Categoria", back_populates="productos")
    movimientos = relationship("Movimiento", back_populates="producto")

class Movimiento(Base):
    __tablename__ = "movimientos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    producto_id: Mapped[int] = mapped_column(Integer, ForeignKey("productos.id"))
    tipo: Mapped[TipoMovimiento] = mapped_column(Enum(TipoMovimiento))
    cantidad: Mapped[int] = mapped_column(Integer)
    fecha: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"))
    nota: Mapped[str] = mapped_column(String)
    
    producto = relationship("Producto", back_populates="movimientos")
    
class RefreshToken(Base):
    """🔒 Tokens de refresco rotativos (previene reuse)"""
    __tablename__ = "refresh_tokens"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)  # Hash del token, nunca el token plano
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    creado_en: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expira_en: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revocado: Mapped[bool] = mapped_column(Boolean, default=False)
    dispositivo: Mapped[str] = mapped_column(String(255), nullable=True)  # Fingerprint del dispositivo
    ip: Mapped[str] = mapped_column(String(45), nullable=True)

    # 🔒 Seguridad: detectar reuse (ataque de token theft)
    usado: Mapped[bool] = mapped_column(Boolean, default=False)
    usado_en: Mapped[datetime] = mapped_column(DateTime, nullable=True)

class AccionTipo(enum.Enum):
    # 🔐 Autenticación
    LOGIN = "login"
    LOGIN_FALLIDO = "login_fallido"
    LOGOUT = "logout"
    TOKEN_REFRESH = "token_refresh"
    PASSWORD_CAMBIO = "password_cambio"
    
    # 📦 Productos
    PRODUCTO_CREAR = "producto_crear"
    PRODUCTO_EDITAR = "producto_editar"
    PRODUCTO_ELIMINAR = "producto_eliminar"
    PRODUCTO_VER = "producto_ver"
    
    # 📂 Categorías
    CATEGORIA_CREAR = "categoria_crear"
    CATEGORIA_EDITAR = "categoria_editar"
    CATEGORIA_ELIMINAR = "categoria_eliminar"
    
    # 🔄 Movimientos
    MOVIMIENTO_ENTRADA = "movimiento_entrada"
    MOVIMIENTO_SALIDA = "movimiento_salida"
    MOVIMIENTO_ANULAR = "movimiento_anular"
    
    # 👥 Usuarios (solo admin)
    USUARIO_CREAR = "usuario_crear"
    USUARIO_EDITAR = "usuario_editar"
    USUARIO_BLOQUEAR = "usuario_bloquear"
    USUARIO_DESBLOQUEAR = "usuario_desbloquear"
    USUARIO_ELIMINAR = "usuario_eliminar"
    ROL_CAMBIAR = "rol_cambiar"
    
    # 📊 Reportes
    REPORTE_EXPORTAR = "reporte_exportar"
    AUDITORIA_VER = "auditoria_ver"
    
class Severidad(enum.Enum):
    INFO = "info"
    ADVERTENCIA = "advertencia"
    CRITICO = "critico"

class LogAuditoria(Base):
    __tablename__ = "log_auditoria"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    # 🔍 Quién
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=True)
    usuario_username: Mapped[str] = mapped_column(String(50), nullable=True)  # Denormalizado para integridad
    
    # 📋 Qué
    accion: Mapped[AccionTipo] = mapped_column(Enum(AccionTipo), nullable=False, index=True)
    severidad: Mapped[Severidad] = mapped_column(Enum(Severidad), default=Severidad.INFO)
    
    # 🎯 Sobre qué recurso
    entidad_tipo: Mapped[str] = mapped_column(String(50), nullable=True)   # "producto", "categoria", "usuario"
    entidad_id: Mapped[int] = mapped_column(Integer, nullable=True)          # ID del recurso afectado
    entidad_nombre: Mapped[str] = mapped_column(String(100), nullable=True) # Nombre descriptivo
    
    # 📝 Detalles
    descripcion: Mapped[str] = mapped_column(Text, nullable=True)
    datos_antes: Mapped[dict] = mapped_column(JSON, nullable=True)   # Estado anterior
    datos_despues: Mapped[dict] = mapped_column(JSON, nullable=True)  # Estado nuevo
    cambios: Mapped[dict] = mapped_column(JSON, nullable=True)         # Solo los campos cambiados (diff)
    
    # 🌐 Dónde
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(255), nullable=True)
    dispositivo_fingerprint: Mapped[str] = mapped_column(String(64), nullable=True)
    
    # ⏰ Cuándo
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    
    # 🔒 Resultado
    exito: Mapped[int] = mapped_column(Integer, default=1)  # 1 = éxito, 0 = fallo
    error_mensaje: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Relación
    #usuario: Mapped["Usuario"] = relationship("Usuario", back_populates="logs")
    
    def __repr__(self):
        return f"<Log {self.accion.value} by {self.usuario_username} at {self.timestamp}>"    
    
class TipoDocumento(enum.Enum):
    FACTURA_VENTA = "01"  # Factura de Venta Nacional
    NOTA_CREDITO = "91"   # Nota Crédito
    NOTA_DEBITO = "92"    # Nota Débito

class TipoIdentificacion(enum.Enum):
    CC = "13"   # Cédula Ciudadanía
    NIT = "31"  # NIT
    CE = "22"   # Cédula Extranjería
    TI = "12"   # Tarjeta Identidad
    PA = "41"   # Pasaporte

class Cliente(Base):
    __tablename__ = "clientes"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tipo_identificacion: Mapped[TipoIdentificacion] = mapped_column(Enum(TipoIdentificacion), default=TipoIdentificacion.CC)
    numero_identificacion: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nombre: Mapped[str] = mapped_column(String(200), nullable=False)
    razon_social: Mapped[str] = mapped_column(String(200), nullable=True)  # Para NIT
    direccion: Mapped[str] = mapped_column(String(200), nullable=True)
    telefono: Mapped[str] = mapped_column(String(50), nullable=True)
    email: Mapped[str] = mapped_column(String(100), nullable=True)
    responsable_iva: Mapped[bool] = mapped_column(Boolean, default=False)  # Si es responsable de IVA
    regimen: Mapped[str] = mapped_column(String(50), default="No responsable de IVA")  # Régimen tributario
    
    facturas: Mapped[List["Factura"]] = relationship("Factura", back_populates="cliente")

class ConfiguracionEmpresa(Base):
    """Configuración fiscal de la empresa emisora"""
    __tablename__ = "configuracion_empresa"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nit: Mapped[str] = mapped_column(String(20), nullable=False)
    nombre_empresa: Mapped[str] = mapped_column(String(200), nullable=False)
    razon_social: Mapped[str] = mapped_column(String(200), nullable=False)
    direccion: Mapped[str] = mapped_column(String(200), nullable=False)
    telefono: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(100), nullable=False)
    
    # Datos DIAN
    software_id: Mapped[str] = mapped_column(String(100), nullable=False)  # ID asignado por DIAN
    pin: Mapped[str] = mapped_column(String(10), nullable=False)  # PIN de software
    prefijo_factura: Mapped[str] = mapped_column(String(10), default="SET")  # Prefijo autorizado
    numero_desde: Mapped[int] = mapped_column(Integer, default=1)  # Rango autorizado
    numero_hasta: Mapped[int] = mapped_column(Integer, default=1000000)
    numero_actual: Mapped[int] = mapped_column(Integer, default=1)  # Consecutivo actual
    
    # Certificado digital
    certificado_path: Mapped[str] = mapped_column(String(255), nullable=True)
    certificado_password: Mapped[str] = mapped_column(String(255), nullable=True)
    
    # Resolución DIAN
    numero_resolucion: Mapped[str] = mapped_column(String(50), nullable=True)
    fecha_resolucion: Mapped[DateTime] = mapped_column(DateTime, nullable=True)
    fecha_vencimiento_resolucion: Mapped[DateTime] = mapped_column(DateTime, nullable=True)

class Factura(Base):
    __tablename__ = "facturas"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    
    # Numeración fiscal
    prefijo: Mapped[str] = mapped_column(String(10), nullable=False)
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    numero_completo: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)  # SET-123
    
    tipo_documento: Mapped[Enum] = mapped_column(Enum(TipoDocumento), default=TipoDocumento.FACTURA_VENTA)
    
    # Fechas
    fecha_emision: Mapped[DateTime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    fecha_vencimiento: Mapped[DateTime] = mapped_column(DateTime, nullable=True)  # Para crédito
    
    # Relaciones
    cliente_id: Mapped[int] = mapped_column(Integer, ForeignKey("clientes.id"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    
    # Valores
    subtotal: Mapped[float] = mapped_column(Float, default=0.0)      # Suma antes de IVA
    descuento: Mapped[float] = mapped_column(Float, default=0.0)      # Descuentos
    base_gravable: Mapped[float] = mapped_column(Float, default=0.0)  # Base para IVA
    iva: Mapped[float] = mapped_column(Float, default=0.0)           # IVA 19%
    total: Mapped[float] = mapped_column(Float, default=0.0)          # Total a pagar
    
    # IVA desglosado (para reportes)
    iva_porcentaje: Mapped[float] = mapped_column(Float, default=19.0)
    
    # Campos DIAN
    cufe: Mapped[str] = mapped_column(String(100), nullable=True)   # Código Único de Factura Electrónica
    qr_code: Mapped[str] = mapped_column(Text, nullable=True)       # Datos del QR
    estado_dian: Mapped[str] = mapped_column(String(20), default="PENDIENTE")  # PENDIENTE, ENVIADA, ACEPTADA, RECHAZADA
    
    # Tracking
    xml_firmado: Mapped[str] = mapped_column(Text, nullable=True)   # XML firmado para DIAN
    fecha_envio_dian: Mapped[DateTime] = mapped_column(DateTime, nullable=True)
    track_id: Mapped[str] = mapped_column(String(100), nullable=True)  # ID de seguimiento DIAN
    
    # Relaciones
    cliente = relationship("Cliente", back_populates="facturas")
    items = relationship("FacturaItem", back_populates="factura")
    usuario = relationship("Usuario")

class FacturaItem(Base):
    __tablename__ = "factura_items"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    factura_id: Mapped[int] = mapped_column(Integer, ForeignKey("facturas.id"), nullable=False)
    producto_id: Mapped[int] = mapped_column(Integer, ForeignKey("productos.id"), nullable=False)
    
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)
    descripcion: Mapped[str] = mapped_column(String(255), nullable=False)
    precio_unitario: Mapped[float] = mapped_column(Float, nullable=False)  # Sin IVA
    descuento: Mapped[float] = mapped_column(Float, default=0.0)
    
    # Cálculos
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)      # cantidad * precio_unitario - descuento
    iva: Mapped[float] = mapped_column(Float, nullable=False)          # subtotal * 0.19
    total: Mapped[float] = mapped_column(Float, nullable=False)         # subtotal + iva
    
    factura = relationship("Factura", back_populates="items")
    producto = relationship("Producto")    
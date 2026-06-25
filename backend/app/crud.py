# backend/app/crud.py
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from decimal import Decimal

# Importar todos los modelos
from app.models import (
    Usuario, Cliente, Categoria, Producto, Movimiento,
    Factura, FacturaItem, ConfiguracionEmpresa,
    LogAuditoria, RefreshToken,
    Rol, TipoMovimiento, AccionTipo, Severidad, EstadoStock,
    TipoDocumento, TipoIdentificacion
)

from app.security import PasswordManager
from app.fiscal_colombia import CalculosFiscalesColombia

# ============================================================
# USUARIOS
# ============================================================

def get_usuario_by_id(db: Session, usuario_id: int) -> Optional[Usuario]:
    return db.query(Usuario).filter(Usuario.id == usuario_id).first()

def get_usuario_by_username(db: Session, username: str) -> Optional[Usuario]:
    return db.query(Usuario).filter(
        func.lower(Usuario.username) == func.lower(username)
    ).first()

def get_usuario_by_email(db: Session, email: str) -> Optional[Usuario]:
    return db.query(Usuario).filter(Usuario.email == email).first()

def get_usuarios(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    activos: Optional[bool] = None,
    rol: Optional[str] = None
) -> List[Usuario]:
    query = db.query(Usuario)
    
    if activos is not None:
        query = query.filter(Usuario.activo == activos)
    if rol:
        query = query.filter(Usuario.rol == rol)
    
    return query.offset(skip).limit(limit).all()

def create_usuario(
    db: Session,
    username: str,
    email: str,
    nombre: str,
    password: str,
    rol: Rol = Rol.USUARIO,
    creado_por: Optional[Usuario] = None
) -> Usuario:
    """Crea un nuevo usuario con contraseña hasheada"""
    
    # Verificar duplicados
    if get_usuario_by_username(db, username):
        raise ValueError(f"El usuario '{username}' ya existe")
    if get_usuario_by_email(db, email):
        raise ValueError(f"El email '{email}' ya está registrado")
    
    # Hashear contraseña
    password_hash, salt = PasswordManager.hash(password)
    
    usuario = Usuario(
        username=username,
        email=email,
        password_hash=password_hash,
        salt=salt,
        nombre=nombre,
        rol=rol,
        activo=True,
        bloqueado=False,
        intentos_fallidos=0
    )
    
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    
    return usuario

def update_usuario(
    db: Session,
    usuario_id: int,
    datos: Dict[str, Any]
) -> Optional[Usuario]:
    """Actualiza campos de un usuario"""
    usuario = get_usuario_by_id(db, usuario_id)
    if not usuario:
        return None
    
    campos_permitidos = ['nombre', 'email', 'rol', 'activo', 'bloqueado']
    
    for campo, valor in datos.items():
        if campo in campos_permitidos:
            setattr(usuario, campo, valor)
    
    db.commit()
    db.refresh(usuario)
    return usuario

def cambiar_password(
    db: Session,
    usuario: Usuario,
    nueva_password: str
) -> bool:
    """Cambia la contraseña de un usuario"""
    password_hash, salt = PasswordManager.hash(nueva_password)
    usuario.password_hash = password_hash
    usuario.salt = salt
    usuario.ultimo_cambio_password = datetime.utcnow()
    usuario.cambio_password_obligatorio = False
    db.commit()
    return True

def autenticar_usuario(db: Session, username: str, password: str) -> Optional[Usuario]:
    """Autentica un usuario. Retorna None si falla."""
    usuario = get_usuario_by_username(db, username)
    
    if not usuario:
        return None
    
    if not usuario.activo or usuario.bloqueado:
        return None
    
    if not PasswordManager.verify(password, usuario.password_hash):
        # Incrementar intentos fallidos
        usuario.intentos_fallidos += 1
        usuario.ultimo_intento = datetime.utcnow()
        
        # Bloquear si supera el límite
        if usuario.intentos_fallidos >= 5:
            usuario.bloqueado = True
        
        db.commit()
        return None
    
    # Login exitoso: resetear intentos
    usuario.intentos_fallidos = 0
    usuario.ultimo_acceso = datetime.utcnow()
    db.commit()
    
    return usuario

# ============================================================
# CATEGORÍAS
# ============================================================

def get_categoria_by_id(db: Session, categoria_id: int) -> Optional[Categoria]:
    return db.query(Categoria).filter(Categoria.id == categoria_id).first()

def get_categorias(db: Session, skip: int = 0, limit: int = 100) -> List[Categoria]:
    return db.query(Categoria).offset(skip).limit(limit).all()

def create_categoria(db: Session, nombre: str, descripcion: Optional[str] = None) -> Categoria:
    # Verificar duplicado
    existente = db.query(Categoria).filter(
        func.lower(Categoria.nombre) == func.lower(nombre)
    ).first()
    
    if existente:
        raise ValueError(f"La categoría '{nombre}' ya existe")
    
    categoria = Categoria(nombre=nombre, descripcion=descripcion)
    db.add(categoria)
    db.commit()
    db.refresh(categoria)
    return categoria

def update_categoria(
    db: Session,
    categoria_id: int,
    nombre: Optional[str] = None,
    descripcion: Optional[str] = None
) -> Optional[Categoria]:
    categoria = get_categoria_by_id(db, categoria_id)
    if not categoria:
        return None
    
    if nombre:
        categoria.nombre = nombre
    if descripcion is not None:
        categoria.descripcion = descripcion
    
    
    db.commit()
    db.refresh(categoria)
    return categoria

def delete_categoria(db: Session, categoria_id: int) -> bool:
    """Elimina categoría solo si no tiene productos asociados"""
    categoria = get_categoria_by_id(db, categoria_id)
    if not categoria:
        return False
    
    if categoria.productos:
        raise ValueError("No se puede eliminar: tiene productos asociados")
    
    db.delete(categoria)
    db.commit()
    return True

# ============================================================
# PRODUCTOS
# ============================================================

def get_producto_by_id(db: Session, producto_id: int) -> Optional[Producto]:
    return db.query(Producto).filter(Producto.id == producto_id).first()

def get_producto_by_codigo(db: Session, codigo: str) -> Optional[Producto]:
    return db.query(Producto).filter(Producto.codigo == codigo).first()

def get_productos(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    categoria_id: Optional[int] = None,
    stock_bajo: Optional[bool] = None,
    sin_stock: Optional[bool] = None,
    busqueda: Optional[str] = None
) -> List[Producto]:
    query = db.query(Producto)
    
    if categoria_id:
        query = query.filter(Producto.categoria_id == categoria_id)
    
    if stock_bajo:
        query = query.filter(
            Producto.stock_actual < Producto.stock_minimo,
            Producto.stock_actual > 0
        )
    
    if sin_stock:
        query = query.filter(Producto.stock_actual == 0)
    
    if busqueda:
        query = query.filter(
            or_(
                Producto.nombre.ilike(f"%{busqueda}%"),
                Producto.codigo.ilike(f"%{busqueda}%"),
                Producto.descripcion.ilike(f"%{busqueda}%")
            )
        )
    
    return query.offset(skip).limit(limit).all()

def create_producto(
    db: Session,
    codigo: str,
    nombre: str,
    categoria_id: int,
    precio: float = 0.0,
    stock_actual: int = 0,
    stock_minimo: int = 5,
    stock_maximo: int = 100,
    descripcion: Optional[str] = None
) -> Producto:
    # Verificar código único
    if get_producto_by_codigo(db, codigo):
        raise ValueError(f"El código '{codigo}' ya existe")
    
    # Verificar categoría
    categoria = get_categoria_by_id(db, categoria_id)
    if not categoria:
        raise ValueError(f"Categoría {categoria_id} no encontrada")
    
    producto = Producto(
        codigo=codigo,
        nombre=nombre,
        descripcion=descripcion,
        categoria_id=categoria_id,
        precio=precio,
        stock_actual=stock_actual,
        stock_minimo=stock_minimo,
        stock_maximo=stock_maximo
    )
    
    db.add(producto)
    db.commit()
    db.refresh(producto)
    return producto

def update_producto(
    db: Session,
    producto_id: int,
    datos: Dict[str, Any]
) -> Optional[Producto]:
    producto = get_producto_by_id(db, producto_id)
    if not producto:
        return None
    
    campos_permitidos = [
        'nombre', 'descripcion', 'categoria_id', 'precio',
        'stock_actual', 'stock_minimo', 'stock_maximo'
    ]
    
    for campo, valor in datos.items():
        if campo in campos_permitidos:
            setattr(producto, campo, valor)
    
    db.commit()
    db.refresh(producto)
    return producto

def delete_producto(db: Session, producto_id: int) -> bool:
    producto = get_producto_by_id(db, producto_id)
    if not producto:
        return False
    
    # Verificar si tiene movimientos
    if producto.movimientos:
        raise ValueError("No se puede eliminar: tiene movimientos registrados")
    
    db.delete(producto)
    db.commit()
    return True

def get_estado_stock(producto: Producto) -> str:
    """Calcula el estado de stock de un producto"""
    if producto.stock_actual == 0:
        return EstadoStock.SIN_STOCK.value
    if producto.stock_actual < producto.stock_minimo:
        return EstadoStock.STOCK_BAJO.value
    if producto.stock_actual > producto.stock_maximo:
        return EstadoStock.EXCEDE.value
    return EstadoStock.NORMAL.value

def count_productos(db: Session):
    return db.query(func.count(Producto.id)).scalar()


# ============================================================
# MOVIMIENTOS
# ============================================================

def get_movimiento_by_id(db: Session, movimiento_id: int) -> Optional[Movimiento]:
    return db.query(Movimiento).filter(Movimiento.id == movimiento_id).first()

def get_movimientos(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    tipo: Optional[str] = None,
    producto_id: Optional[int] = None,
    usuario_id: Optional[int] = None,
    fecha_desde: Optional[datetime] = None,
    fecha_hasta: Optional[datetime] = None
) -> List[Movimiento]:
    query = db.query(Movimiento)
    
    if tipo:
        query = query.filter(Movimiento.tipo == tipo)
    if producto_id:
        query = query.filter(Movimiento.producto_id == producto_id)
    if usuario_id:
        query = query.filter(Movimiento.usuario_id == usuario_id)
    if fecha_desde:
        query = query.filter(Movimiento.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Movimiento.fecha <= fecha_hasta)
    
    return query.order_by(Movimiento.fecha.desc()).offset(skip).limit(limit).all()

def create_movimiento(
    db: Session,
    producto_id: int,
    tipo: TipoMovimiento,
    cantidad: int,
    usuario_id: int,
    nota: Optional[str] = None
) -> Movimiento:
    """Registra un movimiento y actualiza el stock del producto"""
    
    producto = get_producto_by_id(db, producto_id)
    if not producto:
        raise ValueError(f"Producto {producto_id} no encontrado")
    
    if cantidad <= 0:
        raise ValueError("La cantidad debe ser mayor a cero")
    
    # Validar stock para salidas
    if tipo == TipoMovimiento.SALIDA:
        if producto.stock_actual < cantidad:
            raise ValueError(
                f"Stock insuficiente. Disponible: {producto.stock_actual}, "
                f"Solicitado: {cantidad}"
            )
        producto.stock_actual -= cantidad
    else:  # ENTRADA
        producto.stock_actual += cantidad
    
    movimiento = Movimiento(
        producto_id=producto_id,
        tipo=tipo,
        cantidad=cantidad,
        usuario_id=usuario_id,
        nota=nota,
        fecha=datetime.utcnow()
    )
    
    db.add(movimiento)
    db.commit()
    db.refresh(movimiento)
    return movimiento

def movimientos_hoy(db: Session) -> int:
    """Cuenta los movimientos registrados hoy"""
    hoy = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return db.query(func.count(Movimiento.id)).filter(Movimiento.fecha >= hoy).scalar()
# ============================================================
# CLIENTES (Para facturación)
# ============================================================

def get_cliente_by_id(db: Session, cliente_id: int) -> Optional[Cliente]:
    return db.query(Cliente).filter(Cliente.id == cliente_id).first()

def get_cliente_by_identificacion(db: Session, numero: str) -> Optional[Cliente]:
    return db.query(Cliente).filter(Cliente.numero_identificacion == numero).first()

def get_clientes(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    busqueda: Optional[str] = None
) -> List[Cliente]:
    query = db.query(Cliente)
    
    if busqueda:
        query = query.filter(
            or_(
                Cliente.nombre.ilike(f"%{busqueda}%"),
                Cliente.numero_identificacion.ilike(f"%{busqueda}%"),
                Cliente.razon_social.ilike(f"%{busqueda}%")
            )
        )
    
    return query.offset(skip).limit(limit).all()

def create_cliente(
    db: Session,
    tipo_identificacion: TipoIdentificacion,
    numero_identificacion: str,
    nombre: str,
    razon_social: Optional[str] = None,
    direccion: Optional[str] = None,
    telefono: Optional[str] = None,
    email: Optional[str] = None,
    responsable_iva: bool = False,
    regimen: str = "No responsable de IVA"
) -> Cliente:
    # Verificar duplicado
    if get_cliente_by_identificacion(db, numero_identificacion):
        raise ValueError(f"Cliente con identificación {numero_identificacion} ya existe")
    
    cliente = Cliente(
        tipo_identificacion=tipo_identificacion,
        numero_identificacion=numero_identificacion,
        nombre=nombre,
        razon_social=razon_social or nombre,
        direccion=direccion,
        telefono=telefono,
        email=email,
        responsable_iva=responsable_iva,
        regimen=regimen
    )
    
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente

# ============================================================
# FACTURAS
# ============================================================

def get_factura_by_id(db: Session, factura_id: int) -> Optional[Factura]:
    return db.query(Factura).filter(Factura.id == factura_id).first()

def get_factura_by_numero(db: Session, numero: str) -> Optional[Factura]:
    return db.query(Factura).filter(Factura.numero_completo == numero).first()

def get_facturas(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    cliente_id: Optional[int] = None,
    estado_dian: Optional[str] = None,
    fecha_desde: Optional[datetime] = None,
    fecha_hasta: Optional[datetime] = None
) -> List[Factura]:
    query = db.query(Factura)
    
    if cliente_id:
        query = query.filter(Factura.cliente_id == cliente_id)
    if estado_dian:
        query = query.filter(Factura.estado_dian == estado_dian)
    if fecha_desde:
        query = query.filter(Factura.fecha_emision >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Factura.fecha_emision <= fecha_hasta)
    
    return query.order_by(Factura.fecha_emision.desc()).offset(skip).limit(limit).all()

def get_siguiente_numero_factura(db: Session) -> str:
    """Obtiene el siguiente número de factura autorizado"""
    config = db.query(ConfiguracionEmpresa).first()
    if not config:
        raise ValueError("Empresa no configurada")
    
    if config.numero_actual > config.numero_hasta:
        raise ValueError("Rango de numeración agotado")
    
    return f"{config.prefijo_factura}-{config.numero_actual}"

# ============================================================
# CONFIGURACIÓN EMPRESA
# ============================================================

def get_configuracion_empresa(db: Session) -> Optional[ConfiguracionEmpresa]:
    return db.query(ConfiguracionEmpresa).first()

def crear_configuracion_empresa(
    db: Session,
    nit: str,
    nombre_empresa: str,
    razon_social: str,
    direccion: str,
    telefono: str,
    email: str,
    software_id: str,
    pin: str,
    prefijo_factura: str = "SET",
    numero_desde: int = 1,
    numero_hasta: int = 1000000,
    numero_resolucion: Optional[str] = None,
    fecha_resolucion: Optional[datetime] = None,
    fecha_vencimiento_resolucion: Optional[datetime] = None
) -> ConfiguracionEmpresa:
    """Crea la configuración inicial de la empresa (solo una vez)"""
    
    existente = get_configuracion_empresa(db)
    if existente:
        raise ValueError("La empresa ya está configurada")
    
    config = ConfiguracionEmpresa(
        nit=nit,
        nombre_empresa=nombre_empresa,
        razon_social=razon_social,
        direccion=direccion,
        telefono=telefono,
        email=email,
        software_id=software_id,
        pin=pin,
        prefijo_factura=prefijo_factura,
        numero_desde=numero_desde,
        numero_hasta=numero_hasta,
        numero_actual=numero_desde,
        numero_resolucion=numero_resolucion,
        fecha_resolucion=fecha_resolucion,
        fecha_vencimiento_resolucion=fecha_vencimiento_resolucion
    )
    
    db.add(config)
    db.commit()
    db.refresh(config)
    return config

# ============================================================
# LOGS DE AUDITORÍA
# ============================================================

def get_logs_auditoria(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    usuario_id: Optional[int] = None,
    accion: Optional[str] = None,
    severidad: Optional[str] = None,
    fecha_desde: Optional[datetime] = None,
    fecha_hasta: Optional[datetime] = None,
    entidad_tipo: Optional[str] = None
) -> List[LogAuditoria]:
    query = db.query(LogAuditoria)
    
    if usuario_id:
        query = query.filter(LogAuditoria.usuario_id == usuario_id)
    if accion:
        query = query.filter(LogAuditoria.accion == accion)
    if severidad:
        query = query.filter(LogAuditoria.severidad == severidad)
    if fecha_desde:
        query = query.filter(LogAuditoria.timestamp >= fecha_desde)
    if fecha_hasta:
        query = query.filter(LogAuditoria.timestamp <= fecha_hasta)
    if entidad_tipo:
        query = query.filter(LogAuditoria.entidad_tipo == entidad_tipo)
    
    return query.order_by(LogAuditoria.timestamp.desc()).offset(skip).limit(limit).all()

# ============================================================
# ESTADÍSTICAS Y DASHBOARD
# ============================================================

def get_estadisticas_dashboard(db: Session) -> Dict[str, Any]:
    """Estadísticas generales para el dashboard"""
    hoy = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    
    return {
        "total_productos": db.query(func.count(Producto.id)).scalar(),
        "sin_stock": db.query(func.count(Producto.id)).filter(Producto.stock_actual == 0).scalar(),
        "stock_bajo": db.query(func.count(Producto.id)).filter(
            Producto.stock_actual < Producto.stock_minimo,
            Producto.stock_actual > 0
        ).scalar(),
        "total_categorias": db.query(func.count(Categoria.id)).scalar(),
        "total_usuarios": db.query(func.count(Usuario.id)).filter(Usuario.activo == True).scalar(),
        "movimientos_hoy": db.query(func.count(Movimiento.id)).filter(
            Movimiento.fecha >= hoy
        ).scalar(),
        "facturas_hoy": db.query(func.count(Factura.id)).filter(
            Factura.fecha_emision >= hoy
        ).scalar(),
        "ventas_hoy": db.query(func.sum(Factura.total)).filter(
            Factura.fecha_emision >= hoy
        ).scalar() or 0.0
    }

def get_movimientos_por_hora(db: Session, horas: int = 24) -> List[Dict]:
    """Movimientos agrupados por hora para gráficos"""
    ahora = datetime.utcnow()
    resultado = []
    
    for i in range(horas):
        hora_inicio = ahora - timedelta(hours=i+1)
        hora_fin = ahora - timedelta(hours=i)
        
        count = db.query(func.count(Movimiento.id)).filter(
            Movimiento.fecha >= hora_inicio,
            Movimiento.fecha < hora_fin
        ).scalar()
        
        resultado.append({
            "hora": hora_fin.strftime("%H:00"),
            "cantidad": count
        })
    
    resultado.reverse()
    return resultado

def count_por_estado(db: Session, estado: str):
    """Cuenta productos por estado de stock"""
    if estado == EstadoStock.SIN_STOCK.value:
        return db.query(func.count(Producto.id)).filter(Producto.stock_actual == 0).scalar()
    elif estado == EstadoStock.STOCK_BAJO.value:
        return db.query(func.count(Producto.id)).filter(
            Producto.stock_actual < Producto.stock_minimo,
            Producto.stock_actual > 0
        ).scalar()
    elif estado == EstadoStock.EXCEDE.value:
        return db.query(func.count(Producto.id)).filter(
            Producto.stock_actual > Producto.stock_maximo
        ).scalar()
    else:
        return 0

# ============================================================
# REFRESH TOKENS
# ============================================================

def crear_refresh_token(
    db: Session,
    token_hash: str,
    usuario_id: int,
    expira_en: datetime,
    dispositivo: Optional[str] = None,
    ip: Optional[str] = None
) -> RefreshToken:
    db_token = RefreshToken(
        token_hash=token_hash,
        usuario_id=usuario_id,
        expira_en=expira_en,
        dispositivo=dispositivo,
        ip=ip
    )
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token

def get_refresh_token_by_hash(db: Session, token_hash: str) -> Optional[RefreshToken]:
    return db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash,
        RefreshToken.revocado == False,
        RefreshToken.expira_en > datetime.utcnow()
    ).first()

def revocar_refresh_token(db: Session, token_hash: str) -> bool:
    token = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not token:
        return False
    token.revocado = True
    db.commit()
    return True

def revocar_todos_tokens_usuario(db: Session, usuario_id: int) -> int:
    """Revoca todos los refresh tokens de un usuario (compromiso de seguridad)"""
    result = db.query(RefreshToken).filter(
        RefreshToken.usuario_id == usuario_id
    ).update({"revocado": True})
    db.commit()
    return result
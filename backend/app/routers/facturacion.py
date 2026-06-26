# backend/app/routers/facturacion.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

from app.database import get_db
from app.models import Factura, Cliente, Producto, ConfiguracionEmpresa, Rol, AccionTipo, TipoDocumento, TipoIdentificacion, TipoMovimiento
from app.schemas import (
    ClienteCreate, ClienteUpdate, ClienteResponse,
    FacturaCreate, FacturaResponse,
    ConfiguracionEmpresaCreate, ConfiguracionEmpresaResponse
)
from app.dependencies import get_current_user, require_rol
from app.crud import (
    get_clientes, get_cliente_by_id, create_cliente,
    get_facturas, get_factura_by_id, get_configuracion_empresa,
    crear_configuracion_empresa, get_siguiente_numero_factura,
    get_producto_by_id
)
from app.fiscal_colombia import CalculosFiscalesColombia
from app.auditoria import AuditoriaService

router = APIRouter(prefix="/facturacion", tags=["facturación"])

# ==================== CONFIGURACIÓN EMPRESA ====================

@router.get("/configuracion", response_model=ConfiguracionEmpresaResponse)
def obtener_configuracion(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    config = get_configuracion_empresa(db)
    if not config:
        raise HTTPException(status_code=404, detail="Empresa no configurada")
    return config

@router.post("/configuracion", response_model=ConfiguracionEmpresaResponse)
def configurar_empresa(
    request: Request,
    config: ConfiguracionEmpresaCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin"]))
):
    try:
        nueva = crear_configuracion_empresa(
            db=db,
            nit=config.nit,
            nombre_empresa=config.nombre_empresa,
            razon_social=config.razon_social,
            direccion=config.direccion,
            telefono=config.telefono,
            email=config.email,
            software_id=config.software_id,
            pin=config.pin,
            prefijo_factura=config.prefijo_factura,
            numero_desde=config.numero_desde,
            numero_hasta=config.numero_hasta,
            numero_resolucion=config.numero_resolucion,
            fecha_resolucion=config.fecha_resolucion,
            fecha_vencimiento_resolucion=config.fecha_vencimiento_resolucion
        )
        return nueva
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== CLIENTES ====================

@router.get("/clientes", response_model=List[ClienteResponse])
def listar_clientes(
    skip: int = 0,
    limit: int = 100,
    busqueda: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return get_clientes(db, skip=skip, limit=limit, busqueda=busqueda)

@router.get("/clientes/buscar")
def buscar_clientes(
    q: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return get_clientes(db, busqueda=q, limit=10)

@router.post("/clientes", response_model=ClienteResponse)
def crear_cliente_endpoint(
    request: Request,
    cliente: ClienteCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin", "moderador"]))
):
    try:
        tipo_id = TipoIdentificacion(cliente.tipo_identificacion.value)
        nuevo = create_cliente(
            db=db,
            tipo_identificacion=tipo_id,
            numero_identificacion=cliente.numero_identificacion,
            nombre=cliente.nombre,
            razon_social=cliente.razon_social,
            direccion=cliente.direccion,
            telefono=cliente.telefono,
            email=cliente.email,
            responsable_iva=cliente.responsable_iva,
            regimen=cliente.regimen
        )
        return nuevo
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==================== FACTURAS ====================

@router.get("/facturas")
def listar_facturas(
    skip: int = 0,
    limit: int = 100,
    cliente_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    facturas = get_facturas(db, skip=skip, limit=limit, cliente_id=cliente_id)
    return [{
        "id": f.id,
        "numero_completo": f.numero_completo,
        "fecha_emision": f.fecha_emision,
        "estado_dian": f.estado_dian,
        "cliente": {
            "id": f.cliente.id,
            "tipo_identificacion": f.cliente.tipo_identificacion.value,
            "numero_identificacion": f.cliente.numero_identificacion,
            "nombre": f.cliente.nombre,
            "razon_social": f.cliente.razon_social,
            "direccion": f.cliente.direccion,
            "telefono": f.cliente.telefono,
            "email": f.cliente.email,
            "responsable_iva": f.cliente.responsable_iva,
            "regimen": f.cliente.regimen,
            "creado_en": f.cliente.creado_en,
        },
        "items": [{
            "id": item.id,
            "cantidad": item.cantidad,
            "descripcion": item.descripcion,
            "precio_unitario": item.precio_unitario,
            "descuento": item.descuento,
            "subtotal": item.subtotal,
            "iva": item.iva,
            "total": item.total
        } for item in f.items],
        "subtotal": f.subtotal,
        "descuento": f.descuento,
        "base_gravable": f.base_gravable,
        "iva": f.iva,
        "iva_porcentaje": f.iva_porcentaje,
        "total": f.total,
        "cufe": f.cufe
    } for f in facturas]

@router.get("/facturas/{factura_id}")
def obtener_factura(
    factura_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    factura = get_factura_by_id(db, factura_id)
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    
    return {
        "id": factura.id,
        "numero_completo": factura.numero_completo,
        "fecha_emision": factura.fecha_emision,
        "estado_dian": factura.estado_dian,
        "cliente": {
            "id": factura.cliente.id,
            "tipo_identificacion": factura.cliente.tipo_identificacion.value,
            "numero_identificacion": factura.cliente.numero_identificacion,
            "nombre": factura.cliente.nombre,
            "razon_social": factura.cliente.razon_social,
            "direccion": factura.cliente.direccion,
            "telefono": factura.cliente.telefono,
            "email": factura.cliente.email,
            "responsable_iva": factura.cliente.responsable_iva,
            "regimen": factura.cliente.regimen,
            "creado_en": factura.cliente.creado_en,
        },
        "items": [{
            "id": item.id,
            "cantidad": item.cantidad,
            "descripcion": item.descripcion,
            "precio_unitario": item.precio_unitario,
            "descuento": item.descuento,
            "subtotal": item.subtotal,
            "iva": item.iva,
            "total": item.total
        } for item in factura.items],
        "subtotal": factura.subtotal,
        "descuento": factura.descuento,
        "base_gravable": factura.base_gravable,
        "iva": factura.iva,
        "iva_porcentaje": factura.iva_porcentaje,
        "total": factura.total,
        "cufe": factura.cufe
    }

@router.post("/facturas")
def crear_factura_endpoint(
    request: Request,
    factura_data: FacturaCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin", "moderador"]))
):
    """
    Crea una factura fiscal colombiana completa con IVA 19%.
    """
    # Validar configuración
    config = get_configuracion_empresa(db)
    if not config:
        raise HTTPException(status_code=400, detail="Empresa no configurada")
    
    # Validar cliente
    cliente = get_cliente_by_id(db, factura_data.cliente_id)
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente no encontrado")
    
    # Validar productos y calcular
    items_calculados = []
    for item_data in factura_data.items:
        producto = get_producto_by_id(db, item_data.producto_id)
        if not producto:
            raise HTTPException(status_code=404, detail=f"Producto {item_data.producto_id} no encontrado")
        
        if producto.stock_actual < item_data.cantidad:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para '{producto.nombre}'. Disponible: {producto.stock_actual}"
            )
        
        # Calcular con IVA 19%
        calc = CalculosFiscalesColombia.calcular_item(
            cantidad=item_data.cantidad,
            precio_unitario=Decimal(str(item_data.precio_unitario)),
            descuento=Decimal(str(item_data.descuento or 0))
        )
        
        items_calculados.append({
            "producto_id": producto.id,
            "producto": producto,
            "descripcion": producto.nombre,
            **calc
        })
    
    # Calcular totales
    totales = CalculosFiscalesColombia.calcular_factura([
        {
            "cantidad": item["cantidad"],
            "precio_unitario": item["precio_unitario"],
            "descuento": item["descuento"]
        }
        for item in items_calculados
    ])
    
    # Generar número
    numero_completo = get_siguiente_numero_factura(db)
    
    # Crear factura
    from app.models import FacturaItem, Movimiento
    
    factura = Factura(
        prefijo=config.prefijo_factura,
        numero=config.numero_actual,
        numero_completo=numero_completo,
        tipo_documento=TipoDocumento.FACTURA_VENTA,
        cliente_id=cliente.id,
        usuario_id=current_user.id,
        fecha_vencimiento=factura_data.fecha_vencimiento,
        **{k: float(v) for k, v in totales.items() if k != "iva_porcentaje"}
    )
    factura.iva_porcentaje = float(totales["iva_porcentaje"])
    
    db.add(factura)
    db.flush()
    
    # Crear items y descontar stock
    for item_calc in items_calculados:
        item = FacturaItem(
            factura_id=factura.id,
            producto_id=item_calc["producto_id"],
            cantidad=item_calc["cantidad"],
            descripcion=item_calc["descripcion"],
            precio_unitario=float(item_calc["precio_unitario"]),
            descuento=float(item_calc["descuento"]),
            subtotal=float(item_calc["subtotal"]),
            iva=float(item_calc["iva"]),
            total=float(item_calc["total"])
        )
        db.add(item)
        
        # Descontar stock (reutilizar producto ya cargado)
        prod = item_calc["producto"]
        prod.stock_actual -= item_calc["cantidad"]
        
        # Movimiento de salida
        mov = Movimiento(
            producto_id=prod.id,
            tipo=TipoMovimiento.SALIDA,
            cantidad=item_calc["cantidad"],
            usuario_id=current_user.id,
            nota=f"Factura {numero_completo}"
        )
        db.add(mov)
    
    # Generar CUFE
    cufe = CalculosFiscalesColombia.generar_cufe(
        numero_factura=numero_completo,
        fecha_emision=factura.fecha_emision,
        nit_emisor=config.nit,
        nit_adquirente=cliente.numero_identificacion,
        total=Decimal(str(totales["total"])),
        iva=Decimal(str(totales["iva"])),
        software_pin=config.pin
    )
    factura.cufe = cufe
    
    # Generar QR
    qr_data = CalculosFiscalesColombia.generar_qr_data({
        "nit_emisor": config.nit,
        "nit_adquirente": cliente.numero_identificacion,
        "numero": numero_completo,
        "fecha": factura.fecha_emision.strftime("%Y-%m-%d"),
        "total": totales["total"],
        "cufe": cufe
    })
    factura.qr_code = qr_data
    
    # Incrementar consecutivo
    config.numero_actual += 1
    
    # Auditoría (commit=False para que todo sea una sola transacción)
    AuditoriaService.registrar(
        db=db,
        usuario_id=current_user.id,
        usuario_username=current_user.username,
        accion=AccionTipo.FACTURA_CREAR,
        entidad_tipo="factura",
        entidad_id=factura.id,
        entidad_nombre=numero_completo,
        descripcion=f"Factura {numero_completo}. Total: ${totales['total']:.2f}",
        datos_despues={
            "numero": numero_completo,
            "total": float(totales["total"]),
            "iva": float(totales["iva"]),
            "cufe": cufe
        },
        ip_address=request.client.host if request.client else None,
        exito=True,
        commit=False
    )
    
    db.commit()
    db.refresh(factura)
    
    return {
        "id": factura.id,
        "numero_completo": factura.numero_completo,
        "fecha_emision": factura.fecha_emision,
        "estado_dian": factura.estado_dian,
        "cliente": {
            "id": cliente.id,
            "nombre": cliente.nombre,
            "numero_identificacion": cliente.numero_identificacion,
            "tipo_identificacion": cliente.tipo_identificacion.value,
            "direccion": cliente.direccion,
            "telefono": cliente.telefono,
            "email": cliente.email,
            "responsable_iva": cliente.responsable_iva,
            "regimen": cliente.regimen,
            "creado_en": cliente.creado_en
        },
        "items": [{
            "id": item.id,
            "cantidad": item.cantidad,
            "descripcion": item.descripcion,
            "precio_unitario": item.precio_unitario,
            "descuento": item.descuento,
            "subtotal": item.subtotal,
            "iva": item.iva,
            "total": item.total
        } for item in factura.items],
        "subtotal": factura.subtotal,
        "descuento": factura.descuento,
        "base_gravable": factura.base_gravable,
        "iva": factura.iva,
        "iva_porcentaje": factura.iva_porcentaje,
        "total": factura.total,
        "cufe": factura.cufe
    }
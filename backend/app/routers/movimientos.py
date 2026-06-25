# backend/app/routers/movimientos.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.database import get_db
from app.models import Movimiento, TipoMovimiento, Rol, AccionTipo
from app.schemas import MovimientoCreate, MovimientoResponse
from app.dependencies import get_current_user, require_rol
from app.crud import create_movimiento, get_movimientos, get_producto_by_id
from app.auditoria import AuditoriaService

router = APIRouter(prefix="/movimientos", tags=["movimientos"])

@router.get("/", response_model=List[MovimientoResponse])
def listar_movimientos(
    skip: int = 0,
    limit: int = 100,
    tipo: Optional[str] = None,
    producto_id: Optional[int] = None,
    fecha_desde: Optional[datetime] = None,
    fecha_hasta: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    movs = get_movimientos(
        db, skip=skip, limit=limit,
        tipo=tipo, producto_id=producto_id,
        fecha_desde=fecha_desde, fecha_hasta=fecha_hasta
    )
    
    return [{
        "id": m.id,
        "producto_id": m.producto_id,
        "producto_nombre": m.producto.nombre,
        "producto_codigo": m.producto.codigo,
        "tipo": m.tipo.value,
        "cantidad": m.cantidad,
        "fecha": m.fecha,
        "usuario_username": m.usuario.username if m.usuario else "Sistema",
        "nota": m.nota
    } for m in movs]

@router.post("/", response_model=MovimientoResponse)
def registrar_movimiento(
    request: Request,
    movimiento: MovimientoCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    try:
        # Validar tipo
        tipo_enum = TipoMovimiento(movimiento.tipo)
        
        # Crear movimiento
        nuevo = create_movimiento(
            db=db,
            producto_id=movimiento.producto_id,
            tipo=tipo_enum,
            cantidad=movimiento.cantidad,
            usuario_id=current_user.id,
            nota=movimiento.nota
        )
        
        # Auditoría
        AuditoriaService.movimiento_registrado(
            db=db,
            usuario=current_user,
            movimiento=nuevo,
            producto=nuevo.producto,
            ip=request.client.host if request.client else "unknown"
        )
        
        return {
            "id": nuevo.id,
            "producto_id": nuevo.producto_id,
            "producto_nombre": nuevo.producto.nombre,
            "producto_codigo": nuevo.producto.codigo,
            "tipo": nuevo.tipo.value,
            "cantidad": nuevo.cantidad,
            "fecha": nuevo.fecha,
            "usuario_username": current_user.username,
            "nota": nuevo.nota
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
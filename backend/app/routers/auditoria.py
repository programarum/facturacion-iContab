# backend/app/routers/auditoria.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from typing import Optional, List
from datetime import datetime, timedelta

from app.database import get_db
from app.models import LogAuditoria, Usuario, Rol, AccionTipo, Severidad
from app.schemas import LogAuditoriaResponse
from app.dependencies import get_current_user, require_rol
from app.crud import get_logs_auditoria
from app.auditoria import AuditoriaService

router = APIRouter(prefix="/auditoria", tags=["auditoría"])

@router.get("/logs", response_model=List[LogAuditoriaResponse])
def consultar_logs(
    usuario_id: Optional[int] = Query(None),
    accion: Optional[str] = Query(None),
    severidad: Optional[str] = Query(None),
    entidad_tipo: Optional[str] = Query(None),
    fecha_desde: Optional[datetime] = Query(None),
    fecha_hasta: Optional[datetime] = Query(None),
    exito: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Consulta de logs con permisos por rol:
    - ADMIN: Ve TODO
    - MODERADOR: Ve logs de productos/movimientos (no admin)
    - USUARIO: Solo sus propios logs
    """
    
    query = db.query(LogAuditoria)
    
    # Restricciones por rol
    if current_user.rol == Rol.USUARIO:
        query = query.filter(LogAuditoria.usuario_id == current_user.id)
        
    elif current_user.rol == Rol.MODERADOR:
        query = query.filter(
            or_(
                LogAuditoria.usuario_id == current_user.id,
                LogAuditoria.accion.in_([
                    AccionTipo.PRODUCTO_CREAR, AccionTipo.PRODUCTO_EDITAR,
                    AccionTipo.PRODUCTO_ELIMINAR, AccionTipo.PRODUCTO_VER,
                    AccionTipo.CATEGORIA_CREAR, AccionTipo.CATEGORIA_EDITAR,
                    AccionTipo.CATEGORIA_ELIMINAR,
                    AccionTipo.MOVIMIENTO_ENTRADA, AccionTipo.MOVIMIENTO_SALIDA,
                    AccionTipo.LOGIN, AccionTipo.LOGOUT, AccionTipo.LOGIN_FALLIDO
                ])
            )
        )
    
    # Filtros
    if usuario_id:
        if current_user.rol == Rol.USUARIO and usuario_id != current_user.id:
            raise HTTPException(status_code=403, detail="Sin acceso")
        query = query.filter(LogAuditoria.usuario_id == usuario_id)
    
    if accion:
        try:
            query = query.filter(LogAuditoria.accion == AccionTipo(accion))
        except ValueError:
            raise HTTPException(status_code=400, detail="Acción inválida")
    
    if severidad:
        try:
            query = query.filter(LogAuditoria.severidad == Severidad(severidad))
        except ValueError:
            raise HTTPException(status_code=400, detail="Severidad inválida")
    
    if entidad_tipo:
        query = query.filter(LogAuditoria.entidad_tipo == entidad_tipo)
    
    if fecha_desde:
        query = query.filter(LogAuditoria.timestamp >= fecha_desde)
    if fecha_hasta:
        query = query.filter(LogAuditoria.timestamp <= fecha_hasta)
    
    if exito is not None:
        query = query.filter(LogAuditoria.exito == (1 if exito else 0))
    
    query = query.order_by(LogAuditoria.timestamp.desc())
    logs = query.offset(skip).limit(limit).all()
    
    # Registrar consulta
    if current_user.rol in [Rol.ADMIN, Rol.MODERADOR]:
        AuditoriaService.auditoria_consultada(
            db, current_user,
            {"filtros": {"accion": accion, "severidad": severidad}},
            "127.0.0.1"
        )
    
    return logs

@router.get("/estadisticas")
def estadisticas_auditoria(
    dias: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin", "moderador"]))
):
    desde = datetime.utcnow() - timedelta(days=dias)
    
    acciones = db.query(
        LogAuditoria.accion,
        func.count(LogAuditoria.id).label("total")
    ).filter(LogAuditoria.timestamp >= desde).group_by(LogAuditoria.accion).all()
    
    top_usuarios = db.query(
        LogAuditoria.usuario_username,
        func.count(LogAuditoria.id).label("total")
    ).filter(LogAuditoria.timestamp >= desde).group_by(
        LogAuditoria.usuario_username
    ).order_by(func.count(LogAuditoria.id).desc()).limit(10).all()
    
    fallidos = db.query(func.count(LogAuditoria.id)).filter(
        LogAuditoria.accion == AccionTipo.LOGIN_FALLIDO,
        LogAuditoria.timestamp >= desde
    ).scalar()
    
    # Alertas automáticas
    alertas = []
    intentos = db.query(
        LogAuditoria.usuario_username,
        func.count(LogAuditoria.id).label("total")
    ).filter(
        LogAuditoria.accion == AccionTipo.LOGIN_FALLIDO,
        LogAuditoria.timestamp >= desde
    ).group_by(LogAuditoria.usuario_username).having(
        func.count(LogAuditoria.id) >= 5
    ).all()
    
    for i in intentos:
        alertas.append({
            "tipo": "fuerza_bruta",
            "usuario": i.usuario_username,
            "intentos": i.total,
            "severidad": "critico"
        })
    
    return {
        "periodo_dias": dias,
        "total_acciones": {a.accion.value: a.total for a in acciones},
        "top_usuarios": [{"username": u.usuario_username, "acciones": u.total} for u in top_usuarios],
        "login_fallidos": fallidos,
        "alertas": alertas
    }
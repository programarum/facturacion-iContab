# backend/app/routers/dashboard.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import datetime, timedelta

from app.database import get_db
from app.models import LogAuditoria, Producto, Movimiento, Usuario, Factura, Rol, AccionTipo, Severidad
from app.dependencies import get_current_user, require_rol
from app.crud import get_estadisticas_dashboard, get_movimientos_por_hora

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/")
def get_dashboard(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    ahora = datetime.utcnow()
    hoy_inicio = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    semana_inicio = ahora - timedelta(days=7)
    
    dashboard_data = {
        "usuario": {
            "nombre": current_user.username,
            "rol": current_user.rol.value,
            "ultimo_acceso": current_user.ultimo_acceso
        },
        "timestamp": ahora,
        "mis_movimientos_hoy": db.query(func.count(Movimiento.id)).filter(
            Movimiento.usuario_id == current_user.id,
            Movimiento.fecha >= hoy_inicio
        ).scalar()
    }
    
    if current_user.rol == Rol.ADMIN:
        dashboard_data.update(_get_datos_admin(db, hoy_inicio, semana_inicio, ahora))
    elif current_user.rol == Rol.MODERADOR:
        dashboard_data.update(_get_datos_moderador(db, current_user.id, hoy_inicio, semana_inicio))
    else:
        dashboard_data.update(_get_datos_usuario(db, current_user.id, hoy_inicio, semana_inicio))
    
    return dashboard_data

def _get_datos_admin(db, hoy_inicio, semana_inicio, ahora):
    alertas = []
    
    fallidos_1h = db.query(func.count(LogAuditoria.id)).filter(
        LogAuditoria.accion == AccionTipo.LOGIN_FALLIDO,
        LogAuditoria.timestamp >= (ahora - timedelta(hours=1))
    ).scalar()
    
    if fallidos_1h > 5:
        alertas.append({
            "tipo": "seguridad", "nivel": "critico", "icono": "🔴",
            "mensaje": f"{fallidos_1h} intentos de login fallidos en la última hora",
            "accion": "/auditoria?accion=login_fallido"
        })
    
    usuarios_bloqueados = db.query(func.count(Usuario.id)).filter(Usuario.bloqueado == True).scalar()
    if usuarios_bloqueados > 0:
        alertas.append({
            "tipo": "seguridad", "nivel": "advertencia", "icono": "⚠️",
            "mensaje": f"{usuarios_bloqueados} usuarios bloqueados",
            "accion": "/usuarios?filtro=bloqueados"
        })
    
    total_productos = db.query(func.count(Producto.id)).scalar()
    sin_stock = db.query(func.count(Producto.id)).filter(Producto.stock_actual == 0).scalar()
    stock_bajo = db.query(func.count(Producto.id)).filter(
        Producto.stock_actual < Producto.stock_minimo,
        Producto.stock_actual > 0
    ).scalar()
    
    movs_hoy = db.query(func.count(Movimiento.id), func.sum(Movimiento.cantidad)).filter(
        Movimiento.fecha >= hoy_inicio
    ).first()
    
    usuarios_activos_hoy = db.query(func.count(func.distinct(LogAuditoria.usuario_id))).filter(
        LogAuditoria.accion == AccionTipo.LOGIN,
        LogAuditoria.exito == 1,
        LogAuditoria.timestamp >= hoy_inicio
    ).scalar()
    
    horas = []
    for i in range(24):
        hora_inicio = ahora - timedelta(hours=i+1)
        hora_fin = ahora - timedelta(hours=i)
        count = db.query(func.count(Movimiento.id)).filter(
            Movimiento.fecha >= hora_inicio,
            Movimiento.fecha < hora_fin
        ).scalar()
        horas.append({"hora": hora_fin.strftime("%H:00"), "entradas": count})
    horas.reverse()
    
    top_usuarios = db.query(
        LogAuditoria.usuario_username,
        func.count(LogAuditoria.id).label("total")
    ).filter(LogAuditoria.timestamp >= semana_inicio).group_by(
        LogAuditoria.usuario_username
    ).order_by(func.count(LogAuditoria.id).desc()).limit(5).all()
    
    return {
        "alertas": alertas,
        "resumen": {
            "total_productos": total_productos,
            "sin_stock": sin_stock,
            "stock_bajo": stock_bajo,
            "stock_normal": total_productos - sin_stock - stock_bajo,
            "movimientos_hoy": movs_hoy[0] or 0,
            "cantidad_movida_hoy": int(movs_hoy[1] or 0),
            "usuarios_activos_hoy": usuarios_activos_hoy
        },
        "graficos": {
            "actividad_por_hora": horas,
            "top_usuarios": [{"username": u.usuario_username, "actividad": u.total} for u in top_usuarios],
            "distribucion_stock": {
                "sin_stock": sin_stock,
                "bajo": stock_bajo,
                "normal": total_productos - sin_stock - stock_bajo
            }
        }
    }

def _get_datos_moderador(db, user_id, hoy_inicio, semana_inicio):
    productos_criticos = db.query(Producto).filter(
        Producto.stock_actual < Producto.stock_minimo
    ).order_by(Producto.stock_actual.asc()).limit(10).all()
    
    movimientos_equipo = db.query(Movimiento, Producto, Usuario).join(
        Producto
    ).join(Usuario, Movimiento.usuario_id == Usuario.id).filter(
        Movimiento.fecha >= hoy_inicio
    ).order_by(Movimiento.fecha.desc()).limit(20).all()
    
    return {
        "alertas": [{
            "tipo": "stock", "nivel": "advertencia" if len(productos_criticos) > 5 else "info",
            "icono": "📦",
            "mensaje": f"{len(productos_criticos)} productos necesitan reabastecimiento",
            "accion": "/productos?filtro=stock_bajo"
        }],
        "productos_criticos": [{
            "id": p.id, "nombre": p.nombre,
            "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo,
            "diferencia": p.stock_minimo - p.stock_actual
        } for p in productos_criticos],
        "movimientos_recientes": [{
            "id": m.id, "producto": p.nombre,
            "tipo": m.tipo.value, "cantidad": m.cantidad,
            "usuario": u.username, "fecha": m.fecha
        } for m, p, u in movimientos_equipo]
    }

def _get_datos_usuario(db, user_id, hoy_inicio, semana_inicio):
    dias_semana = []
    for i in range(7):
        dia = hoy_inicio - timedelta(days=i)
        count = db.query(func.count(Movimiento.id)).filter(
            Movimiento.usuario_id == user_id,
            Movimiento.fecha >= dia,
            Movimiento.fecha < dia + timedelta(days=1)
        ).scalar()
        dias_semana.append({"dia": dia.strftime("%a"), "movimientos": count})
    dias_semana.reverse()
    
    return {
        "alertas": [],
        "mi_actividad_semanal": dias_semana
    }
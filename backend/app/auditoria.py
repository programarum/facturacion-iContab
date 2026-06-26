# backend/app/auditoria.py
from sqlalchemy.orm import Session
from app.models import LogAuditoria, AccionTipo, Severidad
from typing import Optional, Dict, Any
import json
from datetime import datetime

class AuditoriaService:
    """Servicio centralizado para registrar toda actividad"""
    
    @staticmethod
    def registrar(
        db: Session,
        usuario_id: Optional[int],
        usuario_username: Optional[str],
        accion: AccionTipo,
        entidad_tipo: Optional[str] = None,
        entidad_id: Optional[int] = None,
        entidad_nombre: Optional[str] = None,
        descripcion: Optional[str] = None,
        datos_antes: Optional[Dict] = None,
        datos_despues: Optional[Dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        exito: bool = True,
        error_mensaje: Optional[str] = None,
        severidad: Severidad = Severidad.INFO,
        commit: bool = True
    ) -> LogAuditoria:
        """
        Registra un evento de auditoría.
        Siempre usar este método, nunca insertar directamente.
        """
        
        # 🔍 Calcular diff automático si hay datos antes y después
        cambios = None
        if datos_antes and datos_despues:
            cambios = AuditoriaService._calcular_diff(datos_antes, datos_despues)
        
        log = LogAuditoria(
            usuario_id=usuario_id,
            usuario_username=usuario_username,
            accion=accion,
            severidad=severidad,
            entidad_tipo=entidad_tipo,
            entidad_id=entidad_id,
            entidad_nombre=entidad_nombre,
            descripcion=descripcion,
            datos_antes=datos_antes,
            datos_despues=datos_despues,
            cambios=cambios,
            ip_address=ip_address,
            user_agent=user_agent,
            exito=1 if exito else 0,
            error_mensaje=error_mensaje
        )
        
        db.add(log)
        if commit:
            db.commit()
            db.refresh(log)
        
        return log
    
    @staticmethod
    def _calcular_diff(
        antes: Dict[str, Any], 
        despues: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Calcula diferencias entre dos diccionarios"""
        cambios = {}
        todas_claves = set(antes.keys()) | set(despues.keys())
        
        for clave in todas_claves:
            val_antes = antes.get(clave)
            val_despues = despues.get(clave)
            if val_antes != val_despues:
                cambios[clave] = {
                    "antes": val_antes,
                    "despues": val_despues
                }
        return cambios if cambios else None
    
    # ===== MÉTODOS ESPECÍFICOS POR ACCIÓN =====
    
    @staticmethod
    def login_exitoso(db: Session, usuario, ip: str, user_agent: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=usuario.id,
            usuario_username=usuario.username,
            accion=AccionTipo.LOGIN,
            descripcion=f"Login exitoso desde {ip}",
            ip_address=ip,
            user_agent=user_agent,
            severidad=Severidad.INFO
        )
    
    @staticmethod
    def login_fallido(db: Session, username: str, ip: str, user_agent: str, razon: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=None,
            usuario_username=username,
            accion=AccionTipo.LOGIN_FALLIDO,
            descripcion=f"Login fallido: {razon}",
            ip_address=ip,
            user_agent=user_agent,
            exito=False,
            error_mensaje=razon,
            severidad=Severidad.ADVERTENCIA
        )
    
    @staticmethod
    def producto_creado(db: Session, usuario, producto, ip: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=usuario.id,
            usuario_username=usuario.username,
            accion=AccionTipo.PRODUCTO_CREAR,
            entidad_tipo="producto",
            entidad_id=producto.id,
            entidad_nombre=producto.nombre,
            descripcion=f"Producto '{producto.nombre}' creado",
            datos_despues={
                "codigo": producto.codigo,
                "nombre": producto.nombre,
                "stock": producto.stock_actual,
                "precio": float(producto.precio)
            },
            ip_address=ip,
            severidad=Severidad.INFO
        )
    
    @staticmethod
    def producto_editado(db: Session, usuario, producto, datos_antes: dict, datos_despues: dict, ip: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=usuario.id,
            usuario_username=usuario.username,
            accion=AccionTipo.PRODUCTO_EDITAR,
            entidad_tipo="producto",
            entidad_id=producto.id,
            entidad_nombre=producto.nombre,
            descripcion=f"Producto '{producto.nombre}' modificado",
            datos_antes=datos_antes,
            datos_despues=datos_despues,
            ip_address=ip,
            severidad=Severidad.INFO
        )
    
    @staticmethod
    def producto_eliminado(db: Session, usuario, producto, ip: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=usuario.id,
            usuario_username=usuario.username,
            accion=AccionTipo.PRODUCTO_ELIMINAR,
            entidad_tipo="producto",
            entidad_id=producto.id,
            entidad_nombre=producto.nombre,
            descripcion=f"Producto '{producto.nombre}' eliminado",
            datos_antes={
                "codigo": producto.codigo,
                "nombre": producto.nombre,
                "stock": producto.stock_actual
            },
            ip_address=ip,
            severidad=Severidad.ADVERTENCIA  # Eliminación = advertencia
        )
    
    @staticmethod
    def movimiento_registrado(db: Session, usuario, movimiento, producto, ip: str):
        tipo_str = "entrada" if movimiento.tipo.value == "entrada" else "salida"
        accion = AccionTipo.MOVIMIENTO_ENTRADA if tipo_str == "entrada" else AccionTipo.MOVIMIENTO_SALIDA
        
        return AuditoriaService.registrar(
            db=db,
            usuario_id=usuario.id,
            usuario_username=usuario.username,
            accion=accion,
            entidad_tipo="movimiento",
            entidad_id=movimiento.id,
            entidad_nombre=f"{tipo_str.upper()} - {producto.nombre}",
            descripcion=f"{tipo_str.upper()}: {movimiento.cantidad} unidades de '{producto.nombre}'",
            datos_despues={
                "producto_id": producto.id,
                "producto_nombre": producto.nombre,
                "tipo": tipo_str,
                "cantidad": movimiento.cantidad,
                "stock_resultante": producto.stock_actual,
                "nota": movimiento.nota
            },
            ip_address=ip,
            severidad=Severidad.INFO
        )
    
    @staticmethod
    def usuario_creado(db: Session, admin, nuevo_usuario, ip: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=admin.id,
            usuario_username=admin.username,
            accion=AccionTipo.USUARIO_CREAR,
            entidad_tipo="usuario",
            entidad_id=nuevo_usuario.id,
            entidad_nombre=nuevo_usuario.username,
            descripcion=f"Usuario '{nuevo_usuario.username}' creado con rol {nuevo_usuario.rol.value}",
            datos_despues={
                "username": nuevo_usuario.username,
                "email": nuevo_usuario.email,
                "rol": nuevo_usuario.rol.value,
                "activo": nuevo_usuario.activo
            },
            ip_address=ip,
            severidad=Severidad.ADVERTENCIA  # Crear usuario = sensible
        )
    
    @staticmethod
    def rol_cambiado(db: Session, admin, usuario, rol_anterior, rol_nuevo, ip: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=admin.id,
            usuario_username=admin.username,
            accion=AccionTipo.ROL_CAMBIAR,
            entidad_tipo="usuario",
            entidad_id=usuario.id,
            entidad_nombre=usuario.username,
            descripcion=f"Rol de '{usuario.username}' cambiado de {rol_anterior} a {rol_nuevo}",
            datos_antes={"rol": rol_anterior},
            datos_despues={"rol": rol_nuevo},
            ip_address=ip,
            severidad=Severidad.CRITICO  # Cambio de rol = crítico
        )
    
    @staticmethod
    def usuario_bloqueado(db: Session, admin, usuario, razon: str, ip: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=admin.id,
            usuario_username=admin.username,
            accion=AccionTipo.USUARIO_BLOQUEAR,
            entidad_tipo="usuario",
            entidad_id=usuario.id,
            entidad_nombre=usuario.username,
            descripcion=f"Usuario '{usuario.username}' bloqueado: {razon}",
            datos_antes={"bloqueado": False},
            datos_despues={"bloqueado": True, "razon": razon},
            ip_address=ip,
            severidad=Severidad.CRITICO
        )
    
    @staticmethod
    def auditoria_consultada(db: Session, usuario, filtros: dict, ip: str):
        return AuditoriaService.registrar(
            db=db,
            usuario_id=usuario.id,
            usuario_username=usuario.username,
            accion=AccionTipo.AUDITORIA_VER,
            descripcion=f"Consultó logs de auditoría",
            datos_despues=filtros,
            ip_address=ip,
            severidad=Severidad.INFO
        )
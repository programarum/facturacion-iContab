# backend/app/routers/usuarios.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import Usuario, Rol, AccionTipo
from app.schemas import UsuarioCreate, UsuarioUpdate, UsuarioResponse
from app.dependencies import get_current_user, require_rol
from app.crud import (
    get_usuarios, get_usuario_by_id, create_usuario, 
    update_usuario, cambiar_password
)
from app.auditoria import AuditoriaService

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

@router.get("/", response_model=List[UsuarioResponse])
def listar_usuarios(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin"]))
):
    return get_usuarios(db, skip=skip, limit=limit)

@router.post("/", response_model=UsuarioResponse)
def crear_usuario(
    request: Request,
    usuario: UsuarioCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin"]))
):
    try:
        # Convertir string rol a enum
        rol_enum = Rol(usuario.rol.lower()) if usuario.rol else Rol.USUARIO
        
        nuevo = create_usuario(
            db=db,
            username=usuario.username,
            email=usuario.email,
            password=usuario.password,
            nombre=usuario.nombre,
            rol=rol_enum
        )
        
        AuditoriaService.usuario_creado(
            db=db,
            admin=current_user,
            nuevo_usuario=nuevo,
            ip=request.client.host
        )
        
        return nuevo
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{usuario_id}")
def editar_usuario(
    request: Request,
    usuario_id: int,
    datos: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin"]))
):
    usuario = get_usuario_by_id(db, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    # Si cambia el rol, auditar
    if datos.rol and datos.rol != usuario.rol.value:
        rol_anterior = usuario.rol.value
        rol_nuevo = datos.rol
        
        AuditoriaService.rol_cambiado(
            db=db,
            admin=current_user,
            usuario=usuario,
            rol_anterior=rol_anterior,
            rol_nuevo=rol_nuevo,
            ip=request.client.host
        )
    
    # Si bloquea/desbloquea
    if datos.bloqueado is not None and datos.bloqueado != usuario.bloqueado:
        if datos.bloqueado:
            AuditoriaService.usuario_bloqueado(
                db=db,
                admin=current_user,
                usuario=usuario,
                razon="Bloqueo manual por administrador",
                ip=request.client.host
            )
    
    datos_dict = datos.dict(exclude_unset=True)
    actualizado = update_usuario(db, usuario_id, datos_dict)
    
    return actualizado

@router.post("/{usuario_id}/cambiar-password")
def admin_cambiar_password(
    request: Request,
    usuario_id: int,
    nueva_password: str,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin"]))
):
    usuario = get_usuario_by_id(db, usuario_id)
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    cambiar_password(db, usuario, nueva_password)
    
    AuditoriaService.registrar(
        db=db,
        usuario_id=current_user.id,
        usuario_username=current_user.username,
        accion=AccionTipo.PASSWORD_CAMBIO,
        entidad_tipo="usuario",
        entidad_id=usuario_id,
        entidad_nombre=usuario.username,
        descripcion=f"Contraseña cambiada por administrador",
        ip_address=request.client.host,
        exito=True
    )
    
    return {"message": "Contraseña actualizada"}
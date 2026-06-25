# backend/app/routers/categorias.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import Categoria, Rol, AccionTipo
from app.schemas import CategoriaCreate, CategoriaUpdate, CategoriaResponse
from app.dependencies import get_current_user, require_rol
from app.crud import (
    get_categorias, get_categoria_by_id, create_categoria, 
    update_categoria, delete_categoria
)
from app.auditoria import AuditoriaService

router = APIRouter(prefix="/categorias", tags=["categorías"])

@router.get("/", response_model=List[CategoriaResponse])
def listar_categorias(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    return get_categorias(db, skip=skip, limit=limit)

@router.post("/", response_model=CategoriaResponse)
def crear_categoria(
    request: Request,
    categoria: CategoriaCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin", "moderador"]))
):
    try:
        nueva = create_categoria(db, categoria.nombre, categoria.descripcion)
        
        AuditoriaService.registrar(
            db=db,
            usuario_id=current_user.id,
            usuario_username=current_user.username,
            accion=AccionTipo.CATEGORIA_CREAR,
            entidad_tipo="categoria",
            entidad_id=nueva.id,
            entidad_nombre=nueva.nombre,
            ip_address=request.client.host if request.client else "unknown",
            exito=True
        )
        
        return nueva
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{categoria_id}", response_model=CategoriaResponse)
def editar_categoria(
    request: Request,
    categoria_id: int,
    categoria: CategoriaUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin", "moderador"]))
):
    cat = get_categoria_by_id(db, categoria_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    datos = categoria.dict(exclude_unset=True)
    actualizada = update_categoria(db, categoria_id, **datos)
    
    if actualizada is None:
        raise HTTPException(status_code=400, detail="Error al actualizar la categoría")
    
    AuditoriaService.registrar(
        db=db,
        usuario_id=current_user.id,
        usuario_username=current_user.username,
        accion=AccionTipo.CATEGORIA_EDITAR,
        entidad_tipo="categoria",
        entidad_id=categoria_id,
        entidad_nombre=actualizada.nombre,
        ip_address=request.client.host if request.client else "unknown",
        exito=True
    )
    
    return actualizada

@router.delete("/{categoria_id}")
def eliminar_categoria(
    request: Request,
    categoria_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin"]))
):
    try:
        cat = get_categoria_by_id(db, categoria_id)
        if not cat:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")
        
        nombre = cat.nombre
        delete_categoria(db, categoria_id)
        
        AuditoriaService.registrar(
            db=db,
            usuario_id=current_user.id,
            usuario_username=current_user.username,
            accion=AccionTipo.CATEGORIA_ELIMINAR,
            entidad_tipo="categoria",
            entidad_id=categoria_id,
            entidad_nombre=nombre,
            ip_address=request.client.host if request.client else "unknown",
            exito=True
        )
        
        return {"message": "Categoría eliminada"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
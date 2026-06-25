# backend/app/routers/productos.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional

from app.database import get_db
from app.models import Producto, Rol, AccionTipo
from app.schemas import ProductoCreate, ProductoUpdate, ProductoResponse
from app.dependencies import get_current_user, require_rol
from app.crud import (
    get_productos, get_producto_by_id, create_producto, 
    update_producto, delete_producto, get_estado_stock
)
from app.auditoria import AuditoriaService

router = APIRouter(prefix="/productos", tags=["productos"])

@router.get("/", response_model=List[ProductoResponse])
def listar_productos(
    skip: int = 0,
    limit: int = 100,
    categoria_id: Optional[int] = None,
    stock_bajo: Optional[bool] = None,
    sin_stock: Optional[bool] = None,
    busqueda: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    productos = get_productos(
        db, skip=skip, limit=limit,
        categoria_id=categoria_id,
        stock_bajo=stock_bajo,
        sin_stock=sin_stock,
        busqueda=busqueda
    )
    
    # Agregar nombre de categoría y estado
    resultado = []
    for p in productos:
        p_dict = {
            "id": p.id,
            "codigo": p.codigo,
            "nombre": p.nombre,
            "descripcion": p.descripcion,
            "categoria_id": p.categoria_id,
            "precio": float(p.precio),
            "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo,
            "stock_maximo": p.stock_maximo,
            "estado_stock": get_estado_stock(p),
            "categoria_nombre": p.categoria.nombre if p.categoria else None
        }
        resultado.append(p_dict)
    
    return resultado

@router.get("/buscar")
def buscar_productos(
    q: str,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    productos = get_productos(db, busqueda=q, limit=20)
    return [{
        "id": p.id,
        "codigo": p.codigo,
        "nombre": p.nombre,
        "precio": float(p.precio),
        "stock_actual": p.stock_actual
    } for p in productos]

@router.post("/", response_model=ProductoResponse)
def crear_producto(
    request: Request,
    producto: ProductoCreate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin", "moderador"]))
):
    try:
        nuevo = create_producto(
            db=db,
            codigo=producto.codigo,
            nombre=producto.nombre,
            categoria_id=producto.categoria_id,
            precio=producto.precio,
            stock_actual=producto.stock_actual,
            stock_minimo=producto.stock_minimo,
            stock_maximo=producto.stock_maximo,
            descripcion=producto.descripcion
        )
        
        AuditoriaService.producto_creado(
            db=db,
            usuario=current_user,
            producto=nuevo,
            ip=request.client.host if request.client else "unknown"
        )
        
        return {
            "id": nuevo.id,
            "codigo": nuevo.codigo,
            "nombre": nuevo.nombre,
            "descripcion": nuevo.descripcion,
            "categoria_id": nuevo.categoria_id,
            "precio": float(nuevo.precio),
            "stock_actual": nuevo.stock_actual,
            "stock_minimo": nuevo.stock_minimo,
            "stock_maximo": nuevo.stock_maximo,
            "estado_stock": get_estado_stock(nuevo),
            "categoria_nombre": nuevo.categoria.nombre if nuevo.categoria else None
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{producto_id}", response_model=ProductoResponse)
def editar_producto(
    request: Request,
    producto_id: int,
    producto: ProductoUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin", "moderador"]))
):
    p = get_producto_by_id(db, producto_id)
    if not p:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    # Guardar datos antes para auditoría
    datos_antes = {
        "codigo": p.codigo,
        "nombre": p.nombre,
        "descripcion": p.descripcion,
        "categoria_id": p.categoria_id,
        "precio": float(p.precio),
        "stock_actual": p.stock_actual,
        "stock_minimo": p.stock_minimo,
        "stock_maximo": p.stock_maximo
    }
    
    datos = producto.dict(exclude_unset=True)
    actualizado = update_producto(db, producto_id, datos)
    
    if not actualizado:
        raise HTTPException(status_code=400, detail="Error al actualizar")
    
    # Guardar datos después
    datos_despues = {
        "codigo": actualizado.codigo,
        "nombre": actualizado.nombre,
        "descripcion": actualizado.descripcion,
        "categoria_id": actualizado.categoria_id,
        "precio": float(actualizado.precio),
        "stock_actual": actualizado.stock_actual,
        "stock_minimo": actualizado.stock_minimo,
        "stock_maximo": actualizado.stock_maximo
    }
    
    AuditoriaService.producto_editado(
        db=db,
        usuario=current_user,
        producto=actualizado,
        datos_antes=datos_antes,
        datos_despues=datos_despues,
        ip=request.client.host if request.client else "unknown"
    )
    
    return {
        "id": actualizado.id,
        "codigo": actualizado.codigo,
        "nombre": actualizado.nombre,
        "descripcion": actualizado.descripcion,
        "categoria_id": actualizado.categoria_id,
        "precio": float(actualizado.precio),
        "stock_actual": actualizado.stock_actual,
        "stock_minimo": actualizado.stock_minimo,
        "stock_maximo": actualizado.stock_maximo,
        "estado_stock": get_estado_stock(actualizado),
        "categoria_nombre": actualizado.categoria.nombre if actualizado.categoria else None
    }

@router.delete("/{producto_id}")
def eliminar_producto(
    request: Request,
    producto_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(require_rol(["admin"]))
):
    try:
        p = get_producto_by_id(db, producto_id)
        if not p:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        
        AuditoriaService.producto_eliminado(
            db=db,
            usuario=current_user,
            producto=p,
            ip=request.client.host if request.client else "unknown"
        )
        
        delete_producto(db, producto_id)
        return {"message": "Producto eliminado"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
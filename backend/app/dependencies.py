# backend/app/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.database import get_db
from app.security import TokenManager
from app.models import Usuario

security = HTTPBearer()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> Usuario:
    token = credentials.credentials
    payload = TokenManager.decode_access_token(token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    usuario = db.query(Usuario).filter(Usuario.id == int(payload["sub"])).first()
    
    if not usuario or not usuario.activo or usuario.bloqueado:
        raise HTTPException(status_code=401, detail="Usuario no autorizado")
    
    return usuario

def require_rol(roles: list[str]):
    """🔒 Decorador para roles"""
    def role_checker(user: Usuario = Depends(get_current_user)):
        if user.rol.value not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tiene permisos para esta acción"
            )
        return user
    return role_checker

# Uso en rutas protegidas:
# @router.get("/usuarios")
# def listar_usuarios(user: Usuario = Depends(require_rol(["admin"]))):
#     ...
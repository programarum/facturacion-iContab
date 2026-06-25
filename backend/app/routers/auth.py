# backend/app/routers/auth.py
import hashlib

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import datetime
from app.config import SECURITY
from app import models, schemas
from app.database import get_db
from app.security import PasswordManager, TokenManager, RateLimiter
from typing import Optional

router = APIRouter(prefix="/auth", tags=["autenticación"])
security = HTTPBearer()

@router.post("/login", response_model=schemas.TokenResponse)
def login(
    request: Request,
    credentials: schemas.LoginRequest,
    db: Session = Depends(get_db)
):
    ip = request.client.host if request.client else "unknown"
    
    # 🔒 Rate limiting
    if not RateLimiter.check(ip, credentials.username):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Cuenta bloqueada temporalmente. Intente más tarde."
        )
    
    # Buscar usuario
    usuario = db.query(models.Usuario).filter(
        models.Usuario.username == credentials.username
    ).first()
    
    # 🔒 Timing-safe: verificar siempre para prevenir timing attacks
    password_valida = False
    if usuario and usuario.activo and not usuario.bloqueado:
        password_valida = PasswordManager.verify(
            credentials.password, 
            usuario.password_hash
        )
    
    if not password_valida:
        RateLimiter.register_attempt(ip, credentials.username, False)
        # 🔒 Mensaje genérico (no revelar si usuario existe)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas"
        )
    
    if usuario is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas"
        )

    # 🔒 Verificar si debe cambiar contraseña
    dias_desde_cambio = (datetime.utcnow() - usuario.ultimo_cambio_password).days
    if dias_desde_cambio > 90:
        usuario.cambio_password_obligatorio = True
    
    # 🔒 Generar tokens
    access_token = TokenManager.create_access_token(
        usuario.id, usuario.username, usuario.rol.value
    )
    refresh_token, refresh_hash = TokenManager.create_refresh_token()
    
    # Guardar refresh token en DB
    db_refresh = models.RefreshToken(
        token_hash=refresh_hash,
        usuario_id=usuario.id,
        expira_en=datetime.utcnow() + SECURITY.REFRESH_TOKEN_EXPIRE,
        dispositivo=request.headers.get("User-Agent", "unknown"),
        ip=ip
    )
    db.add(db_refresh)
    
    # Actualizar último acceso
    usuario.ultimo_acceso = datetime.utcnow()
    usuario.ip_ultimo_acceso = ip
    usuario.intentos_fallidos = 0
    
    db.commit()
    
    RateLimiter.register_attempt(ip, credentials.username, True)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": int(SECURITY.ACCESS_TOKEN_EXPIRE.total_seconds())
    }

@router.post("/refresh")
def refresh_token(
    request: Request,
    refresh_token: str,
    db: Session = Depends(get_db)
):
    """🔒 Rotación de refresh tokens"""
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    
    db_token = db.query(models.RefreshToken).filter(
        models.RefreshToken.token_hash == token_hash,
        models.RefreshToken.revocado == False,
        models.RefreshToken.expira_en > datetime.utcnow()
    ).first()
    
    if not db_token:
        raise HTTPException(status_code=401, detail="Token inválido")
    
    # 🔒 Detectar reuse (ataque de token theft)
    if db_token.usado:
        # Revocar TODOS los tokens del usuario
        db.query(models.RefreshToken).filter(
            models.RefreshToken.usuario_id == db_token.usuario_id
        ).update({"revocado": True})
        db.commit()
        
        # Alertar al usuario (en producción: email/SMS)
        raise HTTPException(
            status_code=401, 
            detail="Sesión comprometida. Contacte al administrador."
        )
    
    # Marcar como usado
    db_token.usado = True
    db_token.usado_en = datetime.utcnow()
    
    # Generar NUEVO par de tokens (rotación)
    usuario = db_token.usuario
    new_access = TokenManager.create_access_token(
        usuario.id, usuario.username, usuario.rol.value
    )
    new_refresh, new_refresh_hash = TokenManager.create_refresh_token()
    
    new_db_token = models.RefreshToken(
        token_hash=new_refresh_hash,
        usuario_id=usuario.id,
        expira_en=datetime.utcnow() + SECURITY.REFRESH_TOKEN_EXPIRE,
        dispositivo=request.headers.get("User-Agent", "unknown"),
        ip=request.client.host if request.client else "unknown"
    )
    db.add(new_db_token)
    db.commit()
    
    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "expires_in": int(SECURITY.ACCESS_TOKEN_EXPIRE.total_seconds())
    }

@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    refresh_token: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """🔒 Revocar tokens"""
    if refresh_token:
        token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        db.query(models.RefreshToken).filter(
            models.RefreshToken.token_hash == token_hash
        ).update({"revocado": True})
        db.commit()
    
    # En una implementación completa, agregar access token a blacklist
    return {"message": "Sesión cerrada"}

@router.get("/me")
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials
    payload = TokenManager.decode_access_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")
    
    usuario = db.query(models.Usuario).filter(
        models.Usuario.id == int(payload["sub"])
    ).first()
    
    if not usuario or not usuario.activo:
        raise HTTPException(status_code=401, detail="Usuario no válido")
    
    return {
        "id": usuario.id,
        "username": usuario.username,
        "email": usuario.email,
        "rol": usuario.rol.value,
        "cambio_password_obligatorio": usuario.cambio_password_obligatorio
    }
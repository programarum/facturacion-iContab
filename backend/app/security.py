# backend/app/security.py
import bcrypt
import jwt
import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Tuple
from app.config import SECURITY

class PasswordManager:
    @staticmethod
    def hash(password: str) -> Tuple[str, str]:
        """Genera hash bcrypt + salt único"""
        salt = bcrypt.gensalt(rounds=SECURITY.BCRYPT_ROUNDS)
        hashed = bcrypt.hashpw(password.encode(), salt)
        return hashed.decode(), salt.decode()
    
    @staticmethod
    def verify(password: str, hashed: str) -> bool:
        return bcrypt.checkpw(password.encode(), hashed.encode())

class TokenManager:
    @staticmethod
    def create_access_token(usuario_id: int, username: str, rol: str) -> str:
        """JWT de corta duración"""
        payload = {
            "sub": str(usuario_id),
            "username": username,
            "rol": rol,
            "type": "access",
            "iat": datetime.utcnow(),
            "exp": datetime.utcnow() + SECURITY.ACCESS_TOKEN_EXPIRE,
            "jti": secrets.token_hex(16)  # JWT ID único para revocación
        }
        return jwt.encode(payload, SECURITY.JWT_SECRET, algorithm=SECURITY.JWT_ALGORITHM)
    
    @staticmethod
    def create_refresh_token() -> Tuple[str, str]:
        """Refresh token opaco (no JWT) + su hash para DB"""
        token = secrets.token_urlsafe(64)  # 64 bytes = ~86 chars
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        return token, token_hash
    
    @staticmethod
    def decode_access_token(token: str) -> Optional[dict]:
        try:
            payload = jwt.decode(
                token, 
                SECURITY.JWT_SECRET, 
                algorithms=[SECURITY.JWT_ALGORITHM]
            )
            if payload.get("type") != "access":
                return None
            return payload
        except jwt.ExpiredSignatureError:
            return None
        except jwt.InvalidTokenError:
            return None

class RateLimiter:
    """🔒 Prevención de fuerza bruta en memoria"""
    _intentos = {}  # En producción: usar Redis
    
    @classmethod
    def check(cls, ip: str, username: str) -> bool:
        key = f"{ip}:{username}"
        ahora = datetime.utcnow()
        
        if key in cls._intentos:
            intentos, bloqueado_hasta = cls._intentos[key]
            if bloqueado_hasta and ahora < bloqueado_hasta:
                return False  # Bloqueado
        
        return True
    
    @classmethod
    def register_attempt(cls, ip: str, username: str, exito: bool):
        key = f"{ip}:{username}"
        ahora = datetime.utcnow()
        
        if exito:
            cls._intentos.pop(key, None)
            return
        
        intentos, _ = cls._intentos.get(key, (0, None))
        intentos += 1
        
        if intentos >= SECURITY.MAX_LOGIN_ATTEMPTS:
            bloqueado_hasta = ahora + SECURITY.LOCKOUT_DURATION
            cls._intentos[key] = (intentos, bloqueado_hasta)
        else:
            cls._intentos[key] = (intentos, None)
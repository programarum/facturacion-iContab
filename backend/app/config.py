# backend/app/config.py
import os
from datetime import timedelta

class SecurityConfig:
    # 🔒 JWT: clave fuerte (32+ bytes aleatorios)
    JWT_SECRET = os.getenv("JWT_SECRET", "cambia-esto-en-produccion-32bytes-min!")
    JWT_ALGORITHM = "HS256"
    
    # 🔒 Access token: corta duración (15 min)
    ACCESS_TOKEN_EXPIRE = timedelta(minutes=15)
    
    # 🔒 Refresh token: duración media (7 días)
    REFRESH_TOKEN_EXPIRE = timedelta(days=7)
    
    # 🔒 Bcrypt: cost factor alto (12-14)
    BCRYPT_ROUNDS = 12
    
    # 🔒 Rate limiting
    MAX_LOGIN_ATTEMPTS = 5
    LOCKOUT_DURATION = timedelta(minutes=30)
    
    # 🔒 Headers de seguridad
    SECURE_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
    }

SECURITY = SecurityConfig()
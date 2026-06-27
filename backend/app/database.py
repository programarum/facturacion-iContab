# backend/app/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import os
from pathlib import Path
from typing import Generator

# ============================================================
# CONFIGURACIÓN DE LA BASE DE DATOS
# ============================================================

# Crear directorio de datos si no existe (para Tauri/desktop)
# En Windows: C:\Users\<user>\AppData\Local\facturaiContab-app\
# En Linux: ~/.local/share/facturaiContab-app/
def get_db_path() -> str:
    """Determina la ruta de la base de datos según el sistema"""
    
    # Para desarrollo: usar carpeta del proyecto
    if os.getenv("DEV_MODE", "true").lower() == "true":
        base_dir = Path(__file__).resolve().parent.parent  # carpeta backend/
        db_dir = base_dir / "data"
        db_dir.mkdir(exist_ok=True)
        return str(db_dir / "facticontab.db")
    
    # Para producción (Tauri desktop): directorio de usuario
    if os.name == 'nt':  # Windows
        app_data = Path(os.environ.get('LOCALAPPDATA', '~')) / "facturaiContab-app"
    else:  # Linux/Mac
        app_data = Path.home() / ".local" / "share" / "facturaiContab-app"
    
    app_data.mkdir(parents=True, exist_ok=True)
    return str(app_data / "facticontab.db")

DATABASE_URL = f"sqlite:///{get_db_path()}"

# ============================================================
# ENGINE Y SESSION
# ============================================================

# connect_args={"check_same_thread": False} es necesario para SQLite
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,  # Cambiar a True para ver queries SQL en consola (debug)
    future=True
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

# ============================================================
# DEPENDENCY PARA FASTAPI
# ============================================================

def get_db() -> Generator[Session, None, None]:
    """
    Dependencia de FastAPI para obtener sesión de DB.
    Cierra automáticamente la sesión al terminar la request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ============================================================
# UTILIDADES
# ============================================================

def init_db():
    """Crea todas las tablas si no existen. Llama al iniciar la app."""
    from app import models  # Importa todos los modelos
    Base.metadata.create_all(bind=engine)
    print(f"[OK] Base de datos inicializada en: {DATABASE_URL}")

def reset_db():
    """ELIMINA todas las tablas y las recrea. Usalo con cuidado."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    print("[WARN] Base de datos reiniciada")

def get_db_session() -> Session:
    """Para usar en scripts o tareas en background (no en requests HTTP)"""
    return SessionLocal()
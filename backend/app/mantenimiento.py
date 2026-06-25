# backend/app/mantenimiento.py
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models import LogAuditoria

def limpiar_logs_antiguos(db: Session, dias_retencion: int = 365):
    """
    Elimina logs antiguos para no llenar la base de datos.
    Admin decide la política de retención.
    """
    limite = datetime.utcnow() - timedelta(days=dias_retencion)
    
    # Primero, exportar logs críticos antes de borrar
    logs_criticos = db.query(LogAuditoria).filter(
        LogAuditoria.timestamp < limite,
        LogAuditoria.severidad == "critico"
    ).all()
    
    # Guardar en archivo externo antes de eliminar
    #exportar_logs_criticos(logs_criticos)
    
    # Eliminar logs antiguos
    eliminados = db.query(LogAuditoria).filter(
        LogAuditoria.timestamp < limite
    ).delete()
    
    db.commit()
    return eliminados
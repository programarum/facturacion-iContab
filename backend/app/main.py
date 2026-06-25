# backend/app/main.py
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# 1. IMPORTAR PRIMERO LOS MODELOS (Esto asegura que SQLAlchemy conozca todas las tablas y relaciones)
import app.models
from app.models import Rol, Log

# 2. IMPORTAR CONEXIÓN DE BASE DE DATOS Y SEEDS
from app.database import SessionLocal, Base, engine, init_db

# 3. IMPORTAR CRUD Y SCHEMAS (Ya con los modelos bien cargados en memoria)
from app import schemas, crud
from app.crud import create_usuario, crear_configuracion_empresa, create_categoria, create_producto

# 4. IMPORTAR ROUTERS
from app.routers import auth, categorias, productos, movimientos, usuarios, facturacion, auditoria, dashboard

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Sistema de Facturación iContab",
    description="API con facturación fiscal DIAN",
    version="1.0.0"
)

# CORS para desarrollo
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar routers
app.include_router(auth.router)
app.include_router(categorias.router)
app.include_router(productos.router)
app.include_router(movimientos.router)
app.include_router(usuarios.router)
app.include_router(facturacion.router)
app.include_router(auditoria.router)
app.include_router(dashboard.router)

# Inicializar DB al arrancar
@app.on_event("startup")
async def startup_event():
    init_db()
    seed_datos_iniciales()

def seed_datos_iniciales():
    """Crea datos de prueba si la base está vacía"""
    print ("🌱 Verificando datos iniciales...")
    db = next(get_db())
    
    try:
        # Verificar si ya hay usuarios
        
        from app.crud import get_usuarios
        if get_usuarios(db, limit=1):
            print("✅ Base de datos ya tiene datos")
            return
        
        print("🌱 Creando datos de prueba...")
        
        # 1. Usuario admin
        admin = create_usuario(
            db=db,
            username="admin",
            email="admin@empresa.com",
            password="Admin123!",
            nombre="Administrador",
            rol=Rol.ADMIN
        )
        print(f"   👤 Admin creado: {admin.username}")
        
        # 2. Usuario moderador
        mod = create_usuario(
            db=db,
            username="moderador",
            email="mod@empresa.com",
            password="Mod123!",
            nombre="Moderador Principal",
            rol=Rol.MODERADOR
        )
        print(f"   👤 Moderador creado: {mod.username}")
        
        # 3. Usuario normal
        user = create_usuario(
            db=db,
            username="usuario",
            email="user@empresa.com",
            password="User123!",
            nombre="Usuario Estándar",
            rol=Rol.USUARIO
        )
        print(f"   👤 Usuario creado: {user.username}")
        
        # 4. Configuración empresa
        config = crear_configuracion_empresa(
            db=db,
            nit="9001234567",
            nombre_empresa="Tu Empresa SAS",
            razon_social="Tu Empresa Soluciones Avanzadas SAS",
            direccion="Calle 123 # 45-67, Bogotá D.C.",
            telefono="601-1234567",
            email="facturacion@empresa.com",
            software_id="12345678-1234-1234-1234-123456789012",
            pin="12345",
            prefijo_factura="SET",
            numero_desde=1,
            numero_hasta=1000000,
            numero_resolucion="18760000001",
            fecha_resolucion=datetime(2026, 1, 15),
            fecha_vencimiento_resolucion=datetime(2027, 1, 15)
        )
        print(f"   🏢 Empresa configurada: {config.nombre_empresa}")
        
        # 5. Categorías
        cat_electronica = create_categoria(db, "Electrónica", "Productos electrónicos y tecnología")
        cat_oficina = create_categoria(db, "Oficina", "Artículos de oficina y papelería")
        cat_muebles = create_categoria(db, "Muebles", "Mobiliario de oficina")
        print(f"   📂 Categorías creadas")
        
        # 6. Productos de prueba
        productos = [
            ("MOU001", "Mouse Inalámbrico Logitech", cat_electronica.id, 45000, 50, 10, 100),
            ("TEC001", "Teclado Mecánico RGB", cat_electronica.id, 120000, 30, 5, 50),
            ("USB001", "Cable USB Tipo C 2m", cat_electronica.id, 15000, 100, 20, 200),
            ("PAQ001", "Resma Papel A4 500h", cat_oficina.id, 25000, 200, 50, 500),
            ("ESC001", "Escritorio Ejecutivo", cat_muebles.id, 350000, 15, 3, 30),
        ]
        
        for codigo, nombre, categoria_id, precio, stock, minimo, maximo in productos:
            prod = create_producto(
                db=db,
                codigo=codigo,
                nombre=nombre,
                categoria_id=categoria_id,
                precio=precio,
                stock_actual=stock,
                stock_minimo=minimo,
                stock_maximo=maximo
            )
            print(f"   📦 Producto: {prod.nombre}")
        
        print("✅ Datos de prueba creados exitosamente")
        
    except Exception as e:
        print(f"⚠️ Error en seed: {e}")
    finally:
        db.close()

@app.get("/")
def root():
    return {
        "message": "Sistema de Facturación - iContab",
        "version": "1.0.0",
        "status": "online",
        "endpoints": {
            "docs": "/docs",
            "auth": "/auth",
            "productos": "/productos",
            "categorias": "/categorias",
            "movimientos": "/movimientos",
            "usuarios": "/usuarios",
            "facturacion": "/facturacion",
            "auditoria": "/auditoria",
            "dashboard": "/dashboard"
        }
    }

@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow()}


# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/login")
def login(credentials: schemas.LoginRequest, db: Session = Depends(get_db)):
    usuario = crud.autenticar_usuario(db, credentials.username, credentials.password)
    if not usuario:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    return {"token": "jwt_token", "usuario": usuario.username, "rol": usuario.rol}

@app.get("/productos", response_model=list[schemas.ProductoResponse])
def listar_productos(db: Session = Depends(get_db)):
    return crud.get_productos(db)

@app.post("/productos")
def crear_producto(producto: schemas.ProductoCreate, 
                   db: Session = Depends(get_db)
                   ):
    return crud.create_producto(
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

@app.post("/movimientos")
def registrar_movimiento(mov: schemas.MovimientoCreate, db: Session = Depends(get_db)):
    return crud.create_movimiento(
        db=db,
        producto_id=mov.producto_id,
        tipo=mov.tipo,
        cantidad=mov.cantidad,
        usuario_id=mov.usuario_id,
        nota=mov.nota
    )


@app.get("/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db)):
    return {
        "total_productos": crud.count_productos(db),
        "sin_stock": crud.count_por_estado(db, "sin_stock"),
        "stock_bajo": crud.count_por_estado(db, "stock_bajo"),
        "movimientos_hoy": crud.movimientos_hoy(db)
    }
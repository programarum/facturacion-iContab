# backend/app/fiscal_colombia.py
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
import hashlib
import base64

class CalculosFiscalesColombia:
    """
    Cálculos según normativa DIAN colombiana.
    Usa Decimal para precisión en dinero.
    """
    
    IVA_TASA = Decimal("0.19")
    IVA_PORCENTAJE = Decimal("19.00")
    
    @staticmethod
    def redondear(valor: Decimal) -> Decimal:
        """Redondeo a 2 decimales según normativa colombiana"""
        return valor.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    
    @staticmethod
    def calcular_item(cantidad: int, precio_unitario: Decimal, descuento: Decimal = Decimal("0")) -> dict:
        """
        Calcula valores de un ítem de factura.
        Precio unitario debe venir SIN IVA.
        """
        cantidad_dec = Decimal(str(cantidad))
        
        subtotal = cantidad_dec * precio_unitario - descuento
        subtotal = CalculosFiscalesColombia.redondear(subtotal)
        
        iva = subtotal * CalculosFiscalesColombia.IVA_TASA
        iva = CalculosFiscalesColombia.redondear(iva)
        
        total = subtotal + iva
        total = CalculosFiscalesColombia.redondear(total)
        
        return {
            "cantidad": cantidad,
            "precio_unitario": precio_unitario,
            "descuento": descuento,
            "subtotal": subtotal,      # Base gravable del ítem
            "iva": iva,
            "total": total
        }
    
    @staticmethod
    def calcular_factura(items: list) -> dict:
        """
        Calcula totales de la factura.
        items: lista de dicts con cantidad, precio_unitario, descuento
        """
        subtotal = Decimal("0")
        total_descuento = Decimal("0")
        total_iva = Decimal("0")
        
        for item in items:
            calc = CalculosFiscalesColombia.calcular_item(
                item["cantidad"],
                item["precio_unitario"],
                item.get("descuento", Decimal("0"))
            )
            subtotal += calc["subtotal"]
            total_descuento += calc["descuento"]
            total_iva += calc["iva"]
        
        subtotal = CalculosFiscalesColombia.redondear(subtotal)
        total_descuento = CalculosFiscalesColombia.redondear(total_descuento)
        total_iva = CalculosFiscalesColombia.redondear(total_iva)
        total = CalculosFiscalesColombia.redondear(subtotal + total_iva)
        
        return {
            "subtotal": subtotal,              # Suma antes de IVA
            "descuento": total_descuento,
            "base_gravable": subtotal,          # En Colombia, base = subtotal (sin descuentos)
            "iva": total_iva,
            "iva_porcentaje": CalculosFiscalesColombia.IVA_PORCENTAJE,
            "total": total
        }
    
    @staticmethod
    def generar_cufe(
        numero_factura: str,
        fecha_emision: datetime,
        nit_emisor: str,
        nit_adquirente: str,
        total: Decimal,
        iva: Decimal,
        software_pin: str
    ) -> str:
        """
        Genera CUFE (Código Único de Factura Electrónica).
        Según formato DIAN: SHA-384 de datos concatenados.
        """
        # Formato según resolución DIAN
        datos = (
            f"{numero_factura}"
            f"{fecha_emision.strftime('%Y-%m-%d%H:%M:%S')}"
            f"{total:.2f}"
            f"{iva:.2f}"
            f"{nit_emisor}"
            f"{nit_adquirente}"
            f"{software_pin}"
            f"1"  # Tipo ambiente: 1=Producción, 2=Pruebas
        )
        
        hash_obj = hashlib.sha384(datos.encode('utf-8'))
        cufe = hash_obj.hexdigest()
        
        return cufe
    
    @staticmethod
    def generar_qr_data(factura: dict) -> str:
        """
        Datos para el QR de la factura.
        Escaneable con app de la DIAN.
        """
        return (
            f"NITEmisor={factura['nit_emisor']};"
            f"NITAdquirente={factura['nit_adquirente']};"
            f"NumFactura={factura['numero']};"
            f"Fecha={factura['fecha']};"
            f"Total={factura['total']:.2f};"
            f"CUFE={factura['cufe']}"
        )
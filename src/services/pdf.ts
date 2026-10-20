// src/services/pdf.ts
// Generacion de PDF de facturas y tickets de forma 100% en el navegador.
// Funciona igual en Linux y Windows, sin depender de impresoras nativas.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatCOP = (valor: number): string =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(valor);
const formatCantidad = (cantidad: number): string =>
  new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(cantidad);

// Estructura del dato de factura que devuelve el comando crear_factura (src-tauri)
interface FacturaPDF {
  numero_completo: string;
  fecha_emision: string;
  estado_dian?: string | null;
  cufe?: string | null;
  subtotal?: number;
  descuento?: number;
  base_gravable?: number;
  iva?: number;
  iva_porcentaje?: number;
  total: number;
  cliente?: {
    tipo_identificacion?: string;
    numero_identificacion?: string;
    nombre: string;
    razon_social?: string | null;
    direccion?: string | null;
    telefono?: string | null;
    email?: string | null;
  };
  items: {
    cantidad: number;
    unidad_medida?: string;
    descripcion: string;
    precio_unitario: number;
    descuento?: number;
    subtotal: number;
    iva?: number;
    total: number;
  }[];
}

// Datos de la empresa emisora. Pueden venir de `facturacionAPI.configuracion.obtener()`.
export interface EmpresaEmisora {
  nombre_empresa?: string;
  razon_social?: string;
  nit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  numero_resolucion?: string;
  fecha_resolucion?: string;
  fecha_vencimiento_resolucion?: string;
}

export const generarFacturaPDF = (
  factura: FacturaPDF,
  empresa?: EmpresaEmisora,
): void => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const cliente = factura.cliente || {
    nombre: '',
    numero_identificacion: '',
    tipo_identificacion: '',
  };

  // ---------- Encabezado ----------
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa?.razon_social || empresa?.nombre_empresa || 'EMPRESA', margin, 20);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let y = 27;
  if (empresa?.nit) { doc.text(`NIT: ${empresa.nit}`, margin, y); y += 5; }
  if (empresa?.direccion) { doc.text(`Direccion: ${empresa.direccion}`, margin, y); y += 5; }
  if (empresa?.telefono) { doc.text(`Telefono: ${empresa.telefono}`, margin, y); y += 5; }
  if (empresa?.email) { doc.text(`Email: ${empresa.email}`, margin, y); y += 5; }

  // Esquina derecha: datos de la factura
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURA DE VENTA', pageWidth - margin, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`N°: ${factura.numero_completo}`, pageWidth - margin, 27, { align: 'right' });
  doc.text(`Fecha: ${factura.fecha_emision || ''}`, pageWidth - margin, 32, { align: 'right' });
  if (factura.estado_dian) doc.text(`Estado DIAN: ${factura.estado_dian}`, pageWidth - margin, 37, { align: 'right' });

  if (empresa?.numero_resolucion) {
    doc.setFontSize(8);
    doc.setFont('italic');
    const res = `Resolucion DIAN N° ${empresa.numero_resolucion}`;
    const vigencia = empresa.fecha_vencimiento_resolucion ? ` (vigente hasta ${empresa.fecha_vencimiento_resolucion})` : '';
    doc.text(`${res}${vigencia}`, margin, y + 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    y += 8;
  }

  // ---------- Datos del cliente ----------
  y += 6;
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('Datos del Cliente', margin + 3, y + 5.5);
  doc.setFont('helvetica', 'normal');
  y += 10;
  doc.text(`Cliente: ${cliente.nombre}`, margin, y);
  if (cliente.tipo_identificacion || cliente.numero_identificacion) {
    doc.text(`Identificacion: ${cliente.tipo_identificacion || ''} ${cliente.numero_identificacion || ''}`, margin, y + 5);
  }
  if (cliente.direccion) doc.text(`Direccion: ${cliente.direccion}`, margin, y + 10);
  if (cliente.telefono) doc.text(`Telefono: ${cliente.telefono}`, margin, y + 15);
  if (cliente.email) doc.text(`Email: ${cliente.email}`, margin, y + 20);
  y += 26;

  // ---------- Tabla de items ----------
  const conIva = (factura.iva_porcentaje ?? 0) > 0 || (factura.iva ?? 0) > 0;
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [conIva
      ? ['Cant', 'Descripcion', 'P. Unitario', 'Subtotal', 'IVA', 'Total']
      : ['Cant', 'Descripcion', 'P. Unitario', 'Subtotal', 'Total']],
    body: factura.items.map((item) => [
      `${formatCantidad(item.cantidad)} ${item.unidad_medida || ''}`.trim(),
      item.descripcion,
      formatCOP(item.precio_unitario),
      formatCOP(item.subtotal),
      ...(conIva ? [formatCOP(item.iva || 0)] : []),
      formatCOP(item.total),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [31, 41, 55], fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 30, halign: 'right' },
      ...(conIva ? { 4: { cellWidth: 28, halign: 'right' } } : {}),
      [conIva ? 5 : 4]: { cellWidth: 30, halign: 'right' },
    },
  });

  // ---------- Totales ----------
  const finalY = (doc as any).lastAutoTable.finalY + 6;
  const rightX = pageWidth - margin;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  let totalesY = finalY;
  doc.text(`Subtotal:`, rightX - 45, totalesY, { align: 'right' });
  doc.text(formatCOP(factura.subtotal || 0), rightX, totalesY, { align: 'right' });
  if (conIva) {
    totalesY += 6;
    doc.text(`IVA (${factura.iva_porcentaje || 0}%):`, rightX - 45, totalesY, { align: 'right' });
    doc.text(formatCOP(factura.iva || 0), rightX, totalesY, { align: 'right' });
  }
  if (factura.descuento) {
    totalesY += 6;
    doc.text(`Descuento:`, rightX - 45, totalesY, { align: 'right' });
    doc.text(formatCOP(factura.descuento), rightX, totalesY, { align: 'right' });
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  const totalY = totalesY + 6;
  doc.text(`TOTAL:`, rightX - 45, totalY, { align: 'right' });
  doc.text(formatCOP(factura.total), rightX, totalY, { align: 'right' });

  // ---------- CUFE ----------
  if (factura.cufe) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('CUFE (Estructura de Factura Electronica de Venta):', margin, totalY + 14);
    const cufeLines = doc.splitTextToSize(factura.cufe, pageWidth - margin * 2);
    doc.text(cufeLines, margin, totalY + 19);
  }

  doc.save(`factura_${factura.numero_completo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
};

// Ticket compacto para impresion termica (estilo POS) en PDF
export interface TicketPDF {
  titulo: string;
  numero_ticket: string;
  fecha: string;
  usuario: string;
  total_cantidad: number;
  total_valor: number;
  nota?: string;
  items: {
    codigo: string;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }[];
}

export const generarTicketPDF = (ticket: TicketPDF): void => {
  const doc = new jsPDF({ unit: 'mm', format: [80, 120] });
  const width = doc.internal.pageSize.getWidth();

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(ticket.titulo, width / 2, 15, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Ticket: #${ticket.numero_ticket}`, 4, 25);
  doc.text(`Fecha: ${ticket.fecha}`, 4, 30);
  doc.text(`Usuario: ${ticket.usuario}`, 4, 35);
  doc.line(4, 38, width - 4, 38);

  let y = 42;
  for (const item of ticket.items) {
    doc.text(`${item.nombre}`, 4, y);
    doc.text(`${item.cantidad} x ${formatCOP(item.precio_unitario)}`, 4, y + 4);
    doc.text(formatCOP(item.subtotal), width - 4, y + 4, { align: 'right' });
    y += 10;
  }

  doc.line(4, y, width - 4, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL ITEMS: ${ticket.total_cantidad}`, 4, y);
  doc.text(`TOTAL: ${formatCOP(ticket.total_valor)}`, width - 4, y, { align: 'right' });

  if (ticket.nota) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(ticket.nota, 4, y + 8);
  }

  doc.save(`ticket_${ticket.numero_ticket.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
};

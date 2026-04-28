"""
Servicio SIF / VERI*FACTU.

Incluye:
- huella encadenada append-only para registros de facturacion
- numeracion secuencial de registros fiscales
- diagnostico de integridad por serie
- resumen de cumplimiento para pantalla admin

Sigue pendiente para un VERI*FACTU plenamente operativo ante AEAT:
- remision real
- certificado electronico
- gestion de respuestas oficiales
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.tamper_chain import build_chain_hash
from app.models.factura import Factura
from app.models.registro_evento_sif import RegistroEventoSIF
from app.models.registro_facturacion import RegistroFacturacion

settings = get_settings()


def _get_nif_emisor() -> str:
    try:
        current_settings = get_settings()
        return getattr(current_settings, "nif_emisor", "B00000000")
    except Exception:
        return "B00000000"


def _campos_huella(
    nif_emisor: str,
    serie: str,
    numero: int,
    fecha: date,
    total: Decimal,
    huella_anterior: str | None,
) -> str:
    fecha_str = fecha.strftime("%d-%m-%Y")
    total_str = f"{float(total):.2f}"
    anterior = huella_anterior or ("0" * 64)
    return f"{nif_emisor}|{serie}|{numero}|{fecha_str}|{total_str}|{anterior}"


def calcular_huella(
    *,
    nif_emisor: str,
    serie: str,
    numero: int,
    fecha: date,
    total: Decimal,
    huella_anterior: str | None,
) -> str:
    import hashlib

    datos = _campos_huella(nif_emisor, serie, numero, fecha, total, huella_anterior)
    return hashlib.sha256(datos.encode("utf-8")).hexdigest()


def _payload_registro(
    *,
    factura: Factura,
    tipo_registro: str,
    huella_anterior: str | None,
    usuario_id: str | None = None,
    detalles: dict | None = None,
) -> dict:
    return {
        "algoritmo": (
            "legacy_factura_alta_v1"
            if tipo_registro == "alta"
            else "chain_json_v1"
        ),
        "tipo_registro": tipo_registro,
        "nif_emisor": _get_nif_emisor(),
        "serie": factura.serie,
        "numero": factura.numero,
        "fecha": factura.fecha.isoformat(),
        "total": f"{Decimal(factura.total):.2f}",
        "factura_id": str(factura.id),
        "factura_rectificada_id": str(factura.factura_rectificada_id) if factura.factura_rectificada_id else None,
        "es_rectificativa": factura.es_rectificativa,
        "estado_factura": factura.estado,
        "huella_anterior": huella_anterior or ("0" * 64),
        "sistema_codigo": settings.sif_codigo,
        "sistema_version": settings.sif_version,
        "usuario_id": usuario_id,
        "detalles": detalles or {},
    }


async def obtener_huella_fiscal_anterior(db: AsyncSession, serie: str) -> str | None:
    result = await db.execute(
        select(RegistroFacturacion.huella)
        .where(RegistroFacturacion.serie == serie)
        .order_by(RegistroFacturacion.secuencia.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def obtener_siguiente_num_registro(db: AsyncSession, serie: str) -> int:
    result = await db.execute(
        select(func.max(RegistroFacturacion.secuencia)).where(RegistroFacturacion.serie == serie)
    )
    max_reg = result.scalar_one_or_none()
    return (max_reg or 0) + 1


async def sellar_factura(db: AsyncSession, factura: Factura) -> None:
    huella_anterior = await obtener_huella_fiscal_anterior(db, factura.serie)
    num_reg = await obtener_siguiente_num_registro(db, factura.serie)

    factura.huella = calcular_huella(
        nif_emisor=_get_nif_emisor(),
        serie=factura.serie,
        numero=factura.numero,
        fecha=factura.fecha,
        total=Decimal(factura.total),
        huella_anterior=huella_anterior,
    )
    factura.num_registro = num_reg
    factura.estado_verifactu = "pendiente" if settings.verifactu_mode == "verifactu" else "no_verifactu"


async def registrar_registro_facturacion(
    db: AsyncSession,
    *,
    factura: Factura,
    tipo_registro: str,
    usuario_id,
    detalles: dict | None = None,
) -> RegistroFacturacion:
    existing = await db.execute(
        select(RegistroFacturacion).where(
            RegistroFacturacion.factura_id == factura.id,
            RegistroFacturacion.tipo_registro == tipo_registro,
        )
    )
    previo = existing.scalar_one_or_none()
    if previo:
        return previo

    if tipo_registro == "alta":
        secuencia = factura.num_registro or await obtener_siguiente_num_registro(db, factura.serie)
        huella_anterior = await db.scalar(
            select(RegistroFacturacion.huella)
            .where(
                RegistroFacturacion.serie == factura.serie,
                RegistroFacturacion.secuencia < secuencia,
            )
            .order_by(RegistroFacturacion.secuencia.desc())
            .limit(1)
        )
        huella = factura.huella or calcular_huella(
            nif_emisor=_get_nif_emisor(),
            serie=factura.serie,
            numero=factura.numero,
            fecha=factura.fecha,
            total=Decimal(factura.total),
            huella_anterior=huella_anterior,
        )
    else:
        huella_anterior = await obtener_huella_fiscal_anterior(db, factura.serie)
        secuencia = await obtener_siguiente_num_registro(db, factura.serie)
        huella = build_chain_hash(
            previous_hash=huella_anterior,
            payload=_payload_registro(
                factura=factura,
                tipo_registro=tipo_registro,
                huella_anterior=huella_anterior,
                usuario_id=str(usuario_id) if usuario_id else None,
                detalles=detalles,
            ),
        )

    payload = _payload_registro(
        factura=factura,
        tipo_registro=tipo_registro,
        huella_anterior=huella_anterior,
        usuario_id=str(usuario_id) if usuario_id else None,
        detalles=detalles,
    )
    registro = RegistroFacturacion(
        factura_id=factura.id,
        serie=factura.serie,
        numero_factura=factura.numero,
        tipo_registro=tipo_registro,
        secuencia=secuencia,
        huella_anterior=huella_anterior,
        huella=huella,
        estado_remision=(
            "anulacion_pendiente"
            if settings.verifactu_mode == "verifactu" and tipo_registro == "anulacion"
            else "pendiente"
            if settings.verifactu_mode == "verifactu"
            else "no_verifactu"
        ),
        payload=payload,
    )
    db.add(registro)
    return registro


async def registrar_evento_sif(
    db: AsyncSession,
    *,
    tipo_evento: str,
    factura_id,
    usuario_id,
    detalles: dict | None = None,
) -> None:
    previous_hash = await db.scalar(
        select(RegistroEventoSIF.event_hash)
        .order_by(RegistroEventoSIF.created_at.desc(), RegistroEventoSIF.id.desc())
        .limit(1)
    )
    payload = {
        "tipo_evento": tipo_evento,
        "factura_id": str(factura_id) if factura_id else None,
        "usuario_id": str(usuario_id) if usuario_id else None,
        "sistema_codigo": settings.sif_codigo,
        "sistema_version": settings.sif_version,
        "detalles": detalles or {},
    }
    db.add(
        RegistroEventoSIF(
            tipo_evento=tipo_evento,
            factura_id=factura_id,
            usuario_id=usuario_id,
            sistema_codigo=settings.sif_codigo,
            sistema_version=settings.sif_version,
            detalles=detalles,
            previous_hash=previous_hash,
            event_hash=build_chain_hash(previous_hash=previous_hash, payload=payload),
        )
    )


def puede_mostrar_qr_aeat(factura: Factura) -> bool:
    return bool(factura.huella)


def generar_identificador_fiscal(factura: Factura) -> str:
    nif = _get_nif_emisor()
    num_registro = factura.num_registro if factura.num_registro is not None else "NA"
    return f"{nif}-{factura.serie}-{factura.numero:04d}-{num_registro}"


def obtener_leyenda_factura(factura: Factura) -> str:
    if settings.verifactu_mode == "verifactu":
        if factura.estado_verifactu == "enviada":
            return "VERI*FACTU. Factura verificable en la sede electronica de la AEAT."
        return "VERI*FACTU. Registro generado y pendiente de remision o confirmacion AEAT."
    return "Factura generada por sistema informatico de facturacion con registro fiscal encadenado."


def obtener_estado_remision(factura: Factura) -> str:
    if factura.estado_verifactu == "enviada":
        return "Enviada a AEAT"
    if factura.estado_verifactu == "rechazada":
        return "Rechazada por AEAT"
    if factura.estado_verifactu == "anulacion_pendiente":
        return "Anulacion pendiente de remision"
    if factura.estado_verifactu == "pendiente":
        return "Pendiente de remision"
    return "Registro interno sin remision AEAT"


def generar_url_qr_verificacion(
    nif_emisor: str, serie: str, numero: int, fecha: date, total: Decimal
) -> str:
    fecha_str = fecha.strftime("%Y%m%d")
    total_str = f"{float(total):.2f}".replace(".", "")
    return (
        "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR"
        f"?nif={nif_emisor}&serie={serie}&num={numero}&fecha={fecha_str}&importe={total_str}"
    )


async def verificar_integridad_serie(db: AsyncSession, serie: str) -> dict:
    result = await db.execute(
        select(RegistroFacturacion)
        .where(RegistroFacturacion.serie == serie)
        .order_by(RegistroFacturacion.secuencia)
    )
    registros = result.scalars().all()

    errores: list[dict] = []
    huella_anterior: str | None = None

    for registro in registros:
        algoritmo = (registro.payload or {}).get("algoritmo")
        if algoritmo == "chain_json_v1":
            esperada = build_chain_hash(previous_hash=huella_anterior, payload=registro.payload)
        else:
            esperada = calcular_huella(
                nif_emisor=(registro.payload or {}).get("nif_emisor", _get_nif_emisor()),
                serie=registro.serie,
                numero=registro.numero_factura,
                fecha=date.fromisoformat((registro.payload or {}).get("fecha")),
                total=Decimal((registro.payload or {}).get("total", "0.00")),
                huella_anterior=huella_anterior,
            )
        if (
            registro.huella_anterior != huella_anterior
            or registro.huella != esperada
        ):
            errores.append(
                {
                    "secuencia": registro.secuencia,
                    "tipo_registro": registro.tipo_registro,
                    "huella_almacenada": registro.huella,
                    "huella_calculada": esperada,
                    "huella_anterior_almacenada": registro.huella_anterior,
                    "huella_anterior_esperada": huella_anterior,
                }
            )
        huella_anterior = registro.huella

    return {
        "ok": len(errores) == 0,
        "serie": serie,
        "total_registros": len(registros),
        "errores": errores,
    }


async def verificar_integridad_eventos_sif(db: AsyncSession) -> dict:
    result = await db.execute(
        select(RegistroEventoSIF).order_by(RegistroEventoSIF.created_at, RegistroEventoSIF.id)
    )
    eventos = result.scalars().all()

    previous_hash: str | None = None
    errores: list[dict] = []

    for evento in eventos:
        payload = {
            "tipo_evento": evento.tipo_evento,
            "factura_id": str(evento.factura_id) if evento.factura_id else None,
            "usuario_id": str(evento.usuario_id) if evento.usuario_id else None,
            "sistema_codigo": evento.sistema_codigo,
            "sistema_version": evento.sistema_version,
            "detalles": evento.detalles or {},
        }
        expected_hash = build_chain_hash(previous_hash=previous_hash, payload=payload)
        if evento.previous_hash != previous_hash or evento.event_hash != expected_hash:
            errores.append(
                {
                    "evento_id": str(evento.id),
                    "tipo_evento": evento.tipo_evento,
                    "expected_previous_hash": previous_hash,
                    "stored_previous_hash": evento.previous_hash,
                    "expected_event_hash": expected_hash,
                    "stored_event_hash": evento.event_hash,
                }
            )
        previous_hash = evento.event_hash

    return {
        "ok": len(errores) == 0,
        "total_eventos": len(eventos),
        "errores": errores,
    }


async def obtener_resumen_cumplimiento_sif(db: AsyncSession) -> dict:
    series = (
        await db.execute(
            select(distinct(RegistroFacturacion.serie)).order_by(RegistroFacturacion.serie)
        )
    ).scalars().all()

    diagnostico_series = [await verificar_integridad_serie(db, serie) for serie in series]
    total_registros = await db.scalar(select(func.count(RegistroFacturacion.id))) or 0
    total_eventos = await db.scalar(select(func.count(RegistroEventoSIF.id))) or 0
    total_facturas = await db.scalar(select(func.count(Factura.id))) or 0
    pendientes = await db.scalar(
        select(func.count(Factura.id)).where(Factura.estado_verifactu == "pendiente")
    ) or 0
    rechazadas = await db.scalar(
        select(func.count(Factura.id)).where(Factura.estado_verifactu == "rechazada")
    ) or 0

    ultimos_registros = (
        await db.execute(
            select(RegistroFacturacion)
            .order_by(RegistroFacturacion.secuencia.desc())
            .limit(10)
        )
    ).scalars().all()

    return {
        "modo": settings.verifactu_mode,
        "sif_codigo": settings.sif_codigo,
        "sif_version": settings.sif_version,
        "sif_nombre_producto": settings.sif_nombre_producto,
        "declaracion_responsable": settings.declaracion_responsable_texto,
        "resumen": {
            "total_facturas": total_facturas,
            "total_registros_facturacion": total_registros,
            "total_eventos_sif": total_eventos,
            "facturas_pendientes_remision": pendientes,
            "facturas_rechazadas": rechazadas,
        },
        "diagnostico_series": diagnostico_series,
        "ultimos_registros": [
            {
                "id": str(registro.id),
                "factura_id": str(registro.factura_id),
                "serie": registro.serie,
                "numero_factura": registro.numero_factura,
                "tipo_registro": registro.tipo_registro,
                "secuencia": registro.secuencia,
                "estado_remision": registro.estado_remision,
                "huella": registro.huella,
                "created_at": registro.created_at.isoformat(),
            }
            for registro in ultimos_registros
        ],
    }

"""Exports reuse the same role/tenant projection, filters and order as consultation."""
from collections.abc import Iterator
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from app.core.permissions import CurrentUser, RequireStaff
from app.database import get_db
from app.domains.reporting.application.record_exports import (
    MAX_PDF_ROWS,
    MIME_TYPES,
    ExportValueError,
    RecordExportWriter,
)
from app.domains.reporting.application.registros import build_query, serialize_row
from app.domains.reporting.schemas.registros import RegistroFilters

router = APIRouter(dependencies=[RequireStaff])


class ExportFilters(RegistroFilters):
    format: Literal["csv", "xlsx", "pdf"] = "xlsx"
    columns: list[str] | None = Field(None, max_length=40)


def file_chunks(file) -> Iterator[bytes]:
    try:
        while chunk := file.read(64 * 1024):
            yield chunk
    finally:
        file.close()


@router.get("/{vista}/export")
async def export_registros(
    vista: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: CurrentUser,
    params: Annotated[ExportFilters, Query()],
):
    filters = RegistroFilters.model_validate(params.model_dump(exclude={"format", "columns"}))
    query = build_query(vista, filters, current_user)
    if not query.metadata.can_export or params.format not in query.metadata.export_formats:
        raise HTTPException(403, "No tiene permiso para exportar esta vista")
    available = {column.key: column for column in query.columns}
    selected = params.columns if params.columns is not None else list(available)
    if not selected or len(selected) != len(set(selected)) or any(key not in available for key in selected):
        raise HTTPException(422, "Las columnas de exportación no están disponibles")
    columns = [available[key] for key in selected]
    if params.format == "pdf":
        total = await db.scalar(select(func.count()).select_from(query.stmt.order_by(None).subquery()))
        if total and total > MAX_PDF_ROWS:
            raise HTTPException(422, f"El resultado contiene {total} registros. Use Excel o CSV para exportarlo completo, o acote los filtros para imprimir hasta {MAX_PDF_ROWS} filas.")
    sort = available[filters.sort_by or query.metadata.default_sort.by].label
    period = f"{filters.fecha_desde or 'Inicio'} — {filters.fecha_hasta or 'Actualidad'}" if filters.fecha_desde or filters.fecha_hasta else "Todos los periodos"
    subtitle = f"{period} · Orden: {sort} {'ascendente' if filters.sort_dir == 'asc' else 'descendente'}"
    writer = RecordExportWriter(params.format, columns, query.metadata.label, subtitle)
    try:
        # No page offset/limit and no hidden row cap. A server cursor bounds RAM.
        result = await db.stream(query.stmt.execution_options(yield_per=500))
        try:
            async for row in result.mappings():
                writer.add(serialize_row(row, columns).cells)
        finally:
            await result.close()
        file = writer.finish()
    except ExportValueError as error:
        writer.close()
        raise HTTPException(422, str(error)) from error
    except BaseException:
        writer.close()
        raise
    request.state.audit_export = {"vista": vista, "formato": params.format, "filas": writer.count, "columnas": selected}
    return StreamingResponse(
        file_chunks(file),
        media_type=MIME_TYPES[params.format],
        headers={
            "Content-Disposition": f'attachment; filename="dentcore-{vista}.{params.format}"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Export-Row-Count": str(writer.count),
        },
        background=BackgroundTask(file.close),
    )

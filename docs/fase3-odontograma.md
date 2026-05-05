# Fase 3 - Odontograma profesional

## Objetivo

Se añade un odontograma clínico persistente por paciente, separado del odontograma ligero de presupuesto. La ficha del paciente incorpora una pestaña `Odontograma` con dentición adulta FDI, superficies clicables, estados visuales y conversión de tratamientos planificados a presupuesto.

## Backend

Nuevas tablas:

- `odontogramas`: versión activa por paciente y clínica.
- `odontograma_piezas`: estado general y notas por pieza FDI.
- `odontograma_superficies`: condición por superficie, tratamiento planificado o realizado y notas.
- `odontograma_eventos`: historial técnico-clínico de cambios del odontograma.

Nuevos endpoints:

- `GET /api/pacientes/{paciente_id}/odontograma`
- `POST /api/pacientes/{paciente_id}/odontograma`
- `PATCH /api/odontograma/{odontograma_id}/pieza/{pieza_fdi}`
- `PATCH /api/odontograma/{odontograma_id}/pieza/{pieza_fdi}/superficie/{superficie}`
- `POST /api/odontograma/{odontograma_id}/plan-tratamiento`
- `GET /api/odontograma/{odontograma_id}/historial`
- `POST /api/odontograma/{odontograma_id}/duplicar-version`

Cada cambio sensible escribe en `audit_log` y también en `odontograma_eventos`.

## Frontend

Nuevo módulo:

- `frontend/src/modules/odontograma`

Integración:

- Nueva pestaña `Odontograma` dentro de la ficha de paciente.
- Piezas FDI adultas 18-28 y 48-38.
- Superficies: mesial, distal, vestibular, lingual/palatina, oclusal/incisal y raíz.
- Estados: sano, caries, obturación, endodoncia, corona, implante, ausente, extracción indicada, fractura, movilidad, pendiente y realizado.
- Botón `Pasar a presupuesto` para crear un presupuesto desde tratamientos planificados.

## Limitaciones

- La dentición temporal queda preparada a nivel de validación FDI, pero la UI inicial se centra en dentición adulta.
- La geometría visual es propia y ligera; se puede mejorar con SVG dental más detallado sin cambiar el modelo de datos.

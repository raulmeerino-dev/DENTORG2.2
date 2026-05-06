# Fase 3 - Odontograma clinico profesional

## Objetivo

El sistema mantiene el odontograma ligero de presupuestos como compatibilidad v0 (`presupuestos.odontograma` y `OdontogramaPlan.tsx`) y anade un odontograma clinico real asociado directamente al paciente.

La ficha del paciente incorpora la pestana `Odontograma` con denticion adulta FDI, superficies clicables, estados clinicos visuales, panel lateral de edicion, historial de cambios y una funcion preparada para generar presupuesto desde tratamientos planificados.

## Compatibilidad v0

Se conserva sin borrar:

- Campo `presupuestos.odontograma` en JSONB.
- Endpoints `GET/PUT /api/presupuestos/{presupuesto_id}/odontograma`.
- Componente `frontend/src/components/OdontogramaPlan.tsx`.

Este flujo sigue sirviendo para presupuestos/planes existentes. El modulo nuevo no obliga todavia a migrar los presupuestos antiguos.

## Backend

Tablas clinicas:

- `odontogramas`: version activa por paciente y clinica.
- `odontograma_piezas`: estado general y notas por pieza FDI.
- `odontograma_superficies`: condicion por superficie, tratamiento planificado o realizado y notas.
- `odontograma_eventos`: historial de cambios con usuario, fecha, pieza, superficie, estado anterior y estado nuevo.

Migraciones:

- `0018_odontograma_profesional.py`: crea el modelo relacional del odontograma clinico.
- `0023_normaliza_superficie_odontograma.py`: normaliza la superficie legacy `lingual_palatal` a `lingual_palatina`.

Endpoints canonicos:

- `GET /api/pacientes/{paciente_id}/odontograma`
- `POST /api/pacientes/{paciente_id}/odontograma`
- `PATCH /api/odontogramas/{odontograma_id}/piezas/{pieza_fdi}`
- `PATCH /api/odontogramas/{odontograma_id}/piezas/{pieza_fdi}/superficies/{superficie}`
- `GET /api/odontogramas/{odontograma_id}/historial`
- `POST /api/odontogramas/{odontograma_id}/generar-presupuesto`

Endpoints legacy mantenidos temporalmente:

- `PATCH /api/odontograma/{odontograma_id}/pieza/{pieza_fdi}`
- `PATCH /api/odontograma/{odontograma_id}/pieza/{pieza_fdi}/superficie/{superficie}`
- `GET /api/odontograma/{odontograma_id}/historial`
- `POST /api/odontograma/{odontograma_id}/plan-tratamiento`

Validaciones:

- Piezas adultas FDI admitidas: `18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28,48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38`.
- Superficies canonicas: `oclusal_incisal`, `mesial`, `distal`, `vestibular`, `lingual_palatina`, `raiz`.
- Alias compatible: `lingual_palatal` se acepta en entrada y se guarda como `lingual_palatina`.
- Estados: `sano`, `caries`, `obturacion`, `endodoncia`, `corona`, `implante`, `ausente`, `extraccion_indicada`, `fractura`, `movilidad`, `protesis`, `tratamiento_pendiente`, `tratamiento_realizado`.

Cada cambio de pieza o superficie crea:

- Evento en `odontograma_eventos`.
- Entrada de auditoria mediante el servicio de auditoria.

## Frontend

Modulo nuevo:

- `frontend/src/modules/odontograma`

Integracion:

- Pestana `Odontograma` dentro de la ficha de paciente.
- Vista de ambas arcadas con piezas FDI adultas.
- Superficies clicables dentro de cada pieza.
- Panel lateral con estado clinico, tratamiento vinculado y notas.
- Historial reciente del odontograma.
- Boton `Pasar a presupuesto` para tratamientos marcados como planificados.

## Tests

Cobertura backend anadida:

- Crear odontograma de paciente.
- Obtener odontograma existente.
- Actualizar pieza.
- Actualizar superficie.
- Validar rechazo de pieza FDI no adulta.
- Comprobar historial de eventos.
- Comprobar compatibilidad del alias legacy `lingual_palatal`.
- Generar presupuesto desde tratamientos planificados.

## Limitaciones actuales

- La denticion temporal infantil queda fuera de esta fase para evitar mezclar reglas clinicas y UI antes de cerrar el flujo adulto.
- La conversion completa del JSONB de presupuestos v0 al modelo clinico queda preparada, pero no se ejecuta automaticamente.
- El endpoint de generacion de presupuesto crea una base estable desde tratamientos planificados; el flujo economico completo sigue conectado al modulo de presupuestos existente.

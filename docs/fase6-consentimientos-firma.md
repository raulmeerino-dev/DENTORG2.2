# Fase 6 - Consentimientos y firma

## Objetivo

Hacer que los consentimientos informados funcionen como documentos clínicos reales: plantilla versionada, generación para paciente, firma táctil, PDF archivado y bloqueo de edición tras firma.

## Backend

- Nueva tabla `consentimiento_plantillas` para plantillas versionadas por clínica.
- `consentimientos` se amplía con:
  - `clinica_id`;
  - `plantilla_id`;
  - `version_plantilla`;
  - firmas base64;
  - hash SHA-256 del PDF;
  - IP y user agent de firma;
  - motivo de revocación.
- Al firmar se genera PDF con ReportLab y se archiva como `DocumentoPaciente` de categoría `consentimiento`.
- Un consentimiento firmado no se puede modificar; solo revocar con motivo.
- Crear, firmar y revocar genera auditoría.

## Endpoints

- `GET /api/consentimientos/plantillas`
- `POST /api/consentimientos/plantillas`
- `GET /api/pacientes/{paciente_id}/consentimientos`
- `POST /api/pacientes/{paciente_id}/consentimientos`
- `PATCH /api/pacientes/{paciente_id}/consentimientos/{consentimiento_id}`
- `POST /api/consentimientos/{consentimiento_id}/firmar`
- `POST /api/consentimientos/{consentimiento_id}/revocar`
- `GET /api/consentimientos/{consentimiento_id}/pdf`

## Frontend

- El diseñador de consentimiento de ficha de paciente usa plantillas reales cuando existen.
- La firma táctil guarda el consentimiento mediante el endpoint clínico, no como documento suelto.
- Tras firmar, el PDF se abre y queda archivado en Enlaces.
- La tabla de consentimientos permite abrir PDF y revocar.

## Tests

Se cubre:

- crear plantilla versionada;
- generar consentimiento desde plantilla;
- renderizar datos del paciente;
- firmar con imagen base64;
- comprobar PDF y hash;
- bloquear edición tras firma;
- revocar con motivo.

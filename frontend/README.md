# Frontend de DentCore

Aplicación clínica en React, TypeScript y Vite. La navegación principal se organiza en Hoy, Agenda, Pacientes, Caja, Reportes y Administración; los flujos clínicos del paciente viven dentro de `src/modules/pacientes`.

## Desarrollo

```powershell
npm ci
npm run dev
```

Por defecto consume la API en `http://127.0.0.1:8011/api`. Para una revisión visual sin backend puede activarse el fallback de demostración solo en desarrollo:

```powershell
$env:VITE_DEMO_FALLBACK="true"
npm run dev
```

El build de producción rechaza expresamente el fallback demo.

## Comprobaciones

```powershell
npm run lint
npm run test:unit
npm run build
```

La prueba end-to-end actual simula la API en el navegador, levanta Vite automáticamente y no requiere backend ni PostgreSQL:

```powershell
npm run test:e2e
```

## Organización

- `src/components`: shell y componentes globales.
- `src/modules`: superficies funcionales por dominio.
- `src/lib`: cliente API, invalidaciones y utilidades compartidas.
- `src/types`: contratos TypeScript del backend.
- `src/styles`: fundamentos visuales compartidos.
- `public/odontogram-assets`: imágenes clínicas del odontograma.

La documentación de arquitectura, despliegue y pruebas se mantiene en `../docs`.

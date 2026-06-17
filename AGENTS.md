# AGENTS.md — DentOrg2

## Rol del asistente

Actúa como un senior full-stack engineer, product designer y consultor experto en software de gestión dental.

Tu objetivo no es añadir funcionalidades por cantidad, sino mejorar DentOrg2 como producto clínico profesional: estable, claro, rápido, seguro, visualmente limpio y coherente con el flujo real de una clínica dental.

Debes conocer y aplicar lógica de programas dentales tipo Eurodent, Gesdent u otros sistemas de clínica: paciente activo, ficha clínica, odontograma, primera visita, presupuestos, trabajo pendiente, realizados, historial, facturación, cobros, recetas, consentimientos, laboratorio, agenda, caja, reportes y administración.

No copies interfaces antiguas. Copia la funcionalidad, el flujo y la eficiencia, pero con una organización moderna.

---

## Estado actual del producto

DentOrg2 ya está bastante avanzado.

Estructura principal:
- Hoy
- Pacientes
- Agenda
- Caja
- Admin

Dentro de Pacientes:
- Ficha
- Tratamientos
- Historial

Dentro de Tratamientos:
- Primera visita
- Presupuestos
- Pendientes
- Realizados

Funciones ya existentes o avanzadas:
- Ficha ampliada del paciente
- Mini odontograma resumen en ficha
- Odontograma completo por contexto
- Presupuestos con estados
- Trabajo pendiente
- Tratamientos realizados
- Historial completo tipo timeline
- Documentos y consentimientos
- Recetas clínicas con PDF
- Laboratorio/protésicos
- Facturas, cobros, anticipos y caja
- Admin con reportes
- Multi-clínica, permisos, auditoría y migraciones Alembic

El proyecto ya no está en fase de prototipo. Está en fase de producto avanzado que necesita pulido, estabilidad, coherencia y calidad profesional.

---

## Principios de trabajo

1. No añadir funcionalidades nuevas sin revisar primero si ya existe algo parecido.
2. No duplicar módulos, componentes ni flujos.
3. No romper flujos existentes.
4. No hacer cambios masivos si una mejora puede hacerse de forma localizada.
5. No convertir cada idea en una pantalla nueva.
6. Mantener la interfaz limpia: menos botones visibles, más acciones contextuales.
7. Priorizar flujo real de clínica sobre estética superficial.
8. Todo cambio clínico o económico debe mantener trazabilidad.
9. Todo endpoint sensible debe respetar permisos y `clinica_id`.
10. Si hay duda, primero auditar y proponer; después implementar.

---

## Filosofía UX/UI

DentOrg2 debe sentirse como un software dental moderno, no como una tabla administrativa antigua.

Objetivo visual:
- Jerarquía clara.
- Tarjetas limpias.
- Acciones principales visibles.
- Acciones secundarias en menús o drawers.
- Formularios largos en modales/drawers.
- Estados visuales claros.
- Menos bordes y ruido.
- Más espacio útil.
- Colores con significado.

Colores recomendados:
- Rojo: deuda, alerta, pendiente crítico.
- Verde: realizado, cobrado, correcto.
- Naranja: presupuestado, planificado o pendiente no crítico.
- Azul: acción o información neutra.
- Gris: información secundaria.

Evita:
- Demasiadas tablas visibles a la vez.
- Botones pequeños repartidos sin jerarquía.
- Formularios enormes abiertos por defecto.
- Duplicar la misma información en dos sitios.
- Crear pantallas que no correspondan al flujo real.

---

## Flujo clínico principal

El flujo central debe mantenerse coherente:

Paciente
→ Ficha
→ Primera visita
→ Odontograma diagnóstico
→ Presupuesto
→ Presupuesto aceptado
→ Trabajo pendiente
→ Cita
→ Pedido laboratorio si procede
→ Tratamiento realizado
→ Historial clínico
→ Factura
→ Cobro
→ Historial completo

Reglas:
- Un presupuesto aceptado debe poder pasar a pendiente.
- Un pendiente realizado debe aparecer en realizados e historial.
- Un tratamiento facturado debe quedar vinculado a factura.
- Un cobro debe actualizar saldo.
- Una anulación o revocación no debe borrar trazabilidad.
- El historial completo debe contar toda la historia del paciente.

---

## Pacientes

La pantalla Pacientes es el centro del programa.

Debe mantener solo tres áreas principales:
- Ficha
- Tratamientos
- Historial

Ficha:
- Datos del paciente.
- Alertas.
- Próxima cita.
- Última visita.
- Saldo.
- Documentos y consentimientos compactos.
- Acciones rápidas.
- Mini odontograma resumen.

Tratamientos:
- Primera visita.
- Presupuestos.
- Pendientes.
- Realizados.

Historial:
- Timeline completo clínico, económico y documental.

No volver a crear pestañas principales separadas para documentos, consentimientos, laboratorio o recetas. Deben estar integradas dentro del flujo del paciente.

---

## Odontograma

El odontograma es una herramienta compartida, no un módulo aislado.

Debe tener modos/contextos:
- diagnóstico
- presupuesto
- pendiente
- realizado
- historial
- documentos
- lectura

En Ficha solo debe aparecer un mini odontograma resumen, no el odontograma completo interactivo.

El odontograma completo debe usarse en:
- Primera visita
- Presupuestos
- Pendientes
- Realizados
- Historial, si aporta valor

---

## Acciones rápidas

La ficha del paciente debe tener acciones rápidas claras.

Principales:
- Nueva cita
- Nuevo presupuesto
- Cobrar
- Subir documento

Secundarias:
- Crear receta
- Consentimiento informado
- Revocar consentimiento
- Documento LOPD
- Cuestionario médico
- Pedido laboratorio
- WhatsApp
- Comentario
- Copiar datos

No mostrar todas las acciones como botones grandes. Usar menú “Más acciones”.

---

## Backend

Backend usa FastAPI, SQLAlchemy, Alembic y PostgreSQL.

Reglas:
- No aceptar payloads arbitrarios en endpoints clínicos.
- Usar schemas Pydantic explícitos.
- Respetar `clinica_id`.
- Validar permisos en backend, no solo ocultar botones en frontend.
- Auditar cambios clínicos y económicos relevantes.
- No borrar datos sensibles; usar estados, anulaciones o soft delete cuando proceda.
- Mantener migraciones Alembic lineales.
- Antes de tocar modelos, revisar migraciones existentes.

---

## Frontend

Frontend usa React, TypeScript, Vite, TanStack Query y React Router.

Reglas:
- Componentes pequeños y reutilizables.
- Evitar que `PacientesPage` siga creciendo sin control.
- Mover lógica repetida a hooks/utils cuando aporte claridad.
- No meter lógica pesada dentro del JSX.
- Mantener queries y mutaciones con invalidaciones correctas.
- Mostrar errores visibles.
- Mantener estados de carga.
- No ocultar errores reales con datos demo salvo modo demo explícito.

---

## Calidad y tests

Antes de dar una tarea por terminada:
- Ejecutar build si procede.
- Ejecutar tests relevantes.
- Revisar TypeScript.
- Revisar lint/ruff si aplica.
- Comprobar que no quedan imports muertos.
- Comprobar que no hay código duplicado.
- Comprobar que las rutas siguen funcionando.

Tests prioritarios:
- Flujo paciente completo.
- Presupuesto → pendiente → realizado → factura → cobro.
- Recetas.
- Laboratorio.
- Historial completo.
- Permisos por rol.
- Multi-clínica.
- Navegación principal.

---

## Forma de trabajar

Para cada tarea:

1. Revisar el estado actual del repo.
2. Identificar archivos afectados.
3. Evitar duplicar funcionalidad.
4. Proponer el plan brevemente si la tarea es grande.
5. Implementar de forma incremental.
6. Ejecutar comprobaciones.
7. Resumir:
   - qué cambió
   - archivos modificados
   - cómo probarlo
   - riesgos pendientes

Si una petición es demasiado grande, dividirla en fases pequeñas.

No implementar “todo el sistema” de golpe.

---

## Criterio de producto

DentOrg2 debe aspirar a tener la potencia funcional de Eurodent, pero con una experiencia más clara, moderna y mantenible.

No se busca una copia visual de Eurodent.

Se busca:
- mismo nivel funcional o superior
- mejor organización
- mejor flujo
- mejor diseño
- menos saturación
- más seguridad
- más trazabilidad
- más facilidad para una clínica real

Prioriza siempre utilidad clínica real sobre decoración visual.
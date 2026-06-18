# DentOrg2 Product Master

## Vision

DentOrg2 Clinic es la herramienta central de la clinica dental. Su trabajo es ordenar el dia real de recepcion, doctores, administracion y pacientes sin convertir cada funcion en una pantalla principal.

El producto debe sentirse como un sistema clinico profesional: rapido, denso, claro, trazable y preparado para uso diario. La interfaz debe priorizar el flujo de trabajo y no la cantidad de modulos visibles.

## Modulos globales oficiales

Los modulos globales para personal de clinica son:

- Hoy
- Agenda
- Pacientes
- Reportes/Listados
- Administracion

Para usuarios paciente, el acceso global permitido es:

- Portal paciente / Mis citas, segun permisos actuales

No son modulos globales:

- Caja
- WhatsApp
- Recetas
- Documentos
- Circulares
- Consentimientos
- Presupuestos

Estos elementos pueden seguir existiendo como rutas, paneles, drawers, modales o acciones contextuales, pero no deben aparecer como pestañas superiores grandes ni como entradas principales del launcher.

## Pacientes

Pacientes es el centro operativo del programa. Debe tener solo tres pestanas principales:

- Ficha
- Clinica
- Historial

Ficha contiene datos personales, contacto, alertas, alergias, observaciones importantes, proxima cita, saldo/deuda, resumen clinico breve y acciones rapidas.

Clinica es la zona de trabajo del doctor: sesion actual, tratamientos a realizar, tratamientos realizados, odontograma, notas clinicas y acceso contextual a presupuestos.

Historial concentra lo acumulado del paciente: historia clinica, cronologia, documentos, recetas, consentimientos, facturas, cobros, anticipos, recibos y comunicaciones relevantes.

## Caja

Caja no es un modulo global principal. La gestion economica general pertenece a Reportes/Listados y la economia de un paciente pertenece al Historial del paciente.

La ruta o funcionalidad de caja puede mantenerse si es necesaria por compatibilidad o permisos, pero no debe promocionarse en la navegacion principal.

## WhatsApp

WhatsApp no es un modulo global principal. Debe aparecer integrado en:

- Agenda, para recordatorios, confirmaciones, cambios y reprogramaciones.
- Pacientes, como accion contextual cuando el paciente tenga telefono utilizable.

La ruta o bandeja de WhatsApp puede mantenerse si es necesaria por compatibilidad, pero no debe mostrarse como modulo principal.

## Presupuestos

Presupuestos pertenece al contexto del paciente. No debe aparecer como pestana principal de Pacientes ni como modulo global.

Debe abrirse desde acciones como:

- Nuevo presupuesto en Ficha
- Acceso contextual en Clinica
- Acciones sobre tratamientos a realizar

Un presupuesto aceptado debe alimentar tratamientos a realizar y mantener trazabilidad hasta tratamiento realizado, factura, cobro e historial.

## Layout oficial

DentOrg2 debe funcionar como un sistema de ventanas/modulos compactos:

- Sin scroll vertical global innecesario.
- Sin pestanas superiores grandes.
- Header superior compacto con launcher desde el logo/nombre.
- Zonas largas con scroll interno: historiales, listados, documentos, tablas, cronologias y paneles extensos.
- Acciones principales visibles.
- Acciones secundarias en modales, drawers o paneles contextuales.

## Reglas de evolucion

- No inventar modulos principales nuevos sin decision explicita de producto.
- No duplicar funciones ya existentes.
- No mover funciones clinicas o economicas fuera del paciente cuando formen parte de su recorrido.
- Mantener rutas existentes si son necesarias para compatibilidad.
- Mantener permisos, roles, multi-clinica, auditoria y trazabilidad.
- No afirmar cumplimiento legal, fiscal o sanitario no verificado.

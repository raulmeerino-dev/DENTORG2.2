# DENTCORE — ASTRA EXECUTION PROMPTS

Estos prompts complementan `DENTCORE_CODEX_ASTRA_OPERATING_GUIDE_V2.md`.

---

# PROMPT 1 — REORGANIZAR Y LIMPIAR EL REPOSITORIO EJECUTANDO DIRECTAMENTE

Lee primero `DENTCORE_CODEX_ASTRA_OPERATING_GUIDE_V2.md` y `AGENTS.md`.

Quiero que reorganices y refactorices directamente el repositorio DentCore. No quiero una auditoría previa para mi aprobación, un mapa del repositorio ni una lista de recomendaciones. Inspecciona internamente, decide y ejecuta.

Objetivo: que la estructura física del código refleje claramente los dominios reales de DentCore y que sea difícil introducir nuevo código en el lugar incorrecto.

Puedes mover, renombrar, dividir, fusionar y eliminar archivos; actualizar imports; crear dominios y capas; eliminar código muerto y estructuras legacy; modularizar API, routers y componentes; reorganizar tests y documentación; actualizar `AGENTS.md`.

Backend: evoluciona hacia un monolito modular con dominios claros como identity, patients, scheduling, clinical, treatment_plans, billing, communications, laboratory, inventory, reporting y ai. Separa API/transport, application/use cases, domain rules, persistence y schemas solo cuando la complejidad real lo justifique. No introduzcas arquitectura ceremoniosa ni microservicios.

Frontend: evoluciona hacia app/, design-system/, api/, domains/ y shared/. Divide el cliente API monolítico por dominio. Organiza los dominios por responsabilidad real. `shared` no debe ser un vertedero.

Ataca especialmente los archivos grandes y responsabilidades mezcladas ya identificadas en la guía, pero no dividas archivos solo por número de líneas.

No hagas un big-bang rewrite. Migra incrementalmente y elimina legacy cuando sus consumidores ya hayan sido migrados. No mantengas `Old/New/V2` indefinidamente.

No te detengas después del primer bloque. Continúa de forma autónoma por el repositorio mientras el cambio sea razonablemente seguro.

Tras cada bloque ejecuta los tests y validaciones aplicables. Al terminar, informa únicamente de lo ejecutado, validaciones realizadas y riesgos reales pendientes.

Solo pide autorización por pérdida de datos, migración destructiva irreversible, decisión clínica profesional, decisión legal/fiscal no verificable o riesgo serio de seguridad.

Empieza a ejecutar ahora.

---

# PROMPT 2 — TRANSFORMAR DENTCORE EN “MODO PROGRAMA” COMPACTO

Lee primero `DENTCORE_CODEX_ASTRA_OPERATING_GUIDE_V2.md`.

Quiero que ejecutes una modernización visual y estructural profunda para que DentCore deje de sentirse como una web/SaaS compuesta por páginas, cards, títulos y bloques flotantes, y pase a sentirse como un programa profesional compacto de gestión dental.

No quiero únicamente cambios cosméticos. Quiero modificar layout, jerarquía, densidad, navegación, componentes y distribución cuando sea necesario.

OBJETIVO VISUAL

DentCore debe sentirse como una aplicación de escritorio profesional aunque siga funcionando técnicamente en navegador:

- Application Shell permanente;
- navegación estable;
- toolbar/contexto global estable;
- máximo aprovechamiento del área útil;
- workspaces continuos;
- alineación por grid;
- densidad intermedia;
- acciones en posiciones previsibles;
- menos cards;
- menos sombras;
- menos bordes redondeados innecesarios;
- menos espacios gigantes;
- menos títulos de estilo web;
- más toolbars, divisores, tabs, paneles, grids y tablas bien resueltas;
- sistema de color semántico consistente.

No quiero convertirlo en una interfaz antigua o agobiante. Debe ser compacto, limpio, moderno y cómodo durante una jornada completa.

TRES TIPOS DE SUPERFICIE

1. Workspace principal: Jornada, Pacientes, Caja y Listados. Ocupan prácticamente todo el espacio disponible y están diseñados para uso prolongado.

2. Pantalla dedicada de tarea: consentimientos, primera visita, odontograma completo, periodontograma, receta, presupuesto complejo y otras tareas que requieran varios minutos o gran espacio. Estas pantallas siguen dentro del Application Shell, conservan paciente/contexto y no parecen una aplicación diferente.

3. Modal/drawer/popover: únicamente para acciones breves y acotadas como editar un dato, añadir una observación, registrar un pago, cambiar una duración o crear una cita sencilla.

Regla: acción de segundos -> overlay; tarea de minutos -> pantalla dedicada; entorno de horas -> workspace.

CARDS

No envolver cada sección en una Card por defecto.

Usar card solo cuando exista una unidad conceptual realmente independiente. Eliminar progresivamente cards dentro de cards y bloques flotantes que no aporten jerarquía.

AGENDA/JORNADA

La agenda debe ser el workspace, no un calendario pequeño dentro de una página con título + descripción + card.

PACIENTE

La ficha debe sentirse como un workspace conectado: cabecera persistente, tabs compactas, contenido alineado y contexto constante. Evitar múltiples tarjetas flotantes para saldo, próxima cita, tratamiento, etc. si pueden resolverse mediante una composición integrada.

CONSENTIMIENTOS

Consentimientos sí pueden y deben tener pantalla propia cuando el documento lo requiera. Mantener shell, contexto del paciente y acciones claras. No meter documentos largos en modales gigantes.

DESIGN SYSTEM

Consolida tokens de spacing, tipografía, alturas, radios, bordes, superficies y colores. Reutiliza componentes. Reduce CSS global acumulativo y overrides.

QA

Revisa las pantallas reales con datos densos y distintos tamaños de viewport. No des una pantalla por terminada si hay overflow, clipping, espacios absurdos, alineaciones incoherentes, botones perdidos, cards excesivas, jerarquía pobre o sensación de “web de bloques”.

No me entregues una propuesta visual para aprobación. Inspecciona, implementa, prueba, revisa visualmente y continúa.

Empieza por el Application Shell y design foundation, y después migra workspaces y pantallas progresivamente sin romper los flujos clínicos.

Empieza a ejecutar ahora.

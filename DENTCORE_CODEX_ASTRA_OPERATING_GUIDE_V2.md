# DENTCORE — CODEX / ASTRA OPERATING GUIDE

**Guía operativa principal para modernizar `raulmeerino-dev/DENTORG2.2`**

- Producto: DentCore
- Repositorio: `raulmeerino-dev/DENTORG2.2`
- Rama objetivo: `main`
- Commit de referencia auditado: `065a2e5168dd8c7fb016975a61412e33ef5da093`
- Fuente extensa de contexto: `DentCore_Master_Blueprint_FINAL_2026-09-10.docx`
- Este archivo es la **guía ejecutiva de trabajo para Codex/Astra**.

---

# 1. MISIÓN

Actúa simultáneamente como:

- senior full-stack engineer;
- product designer;
- especialista en UX de software profesional;
- arquitecto de sistemas;
- consultor de software de gestión dental;
- responsable de calidad, seguridad y mantenibilidad.

Tu misión no es añadir funciones por cantidad.

Tu misión es convertir DentCore en un software dental:

- muy completo;
- extremadamente organizado;
- rápido en uso real;
- visualmente impecable;
- coherente entre módulos;
- sencillo de aprender;
- cómodo durante una jornada completa;
- seguro y trazable;
- preparado para IA operativa profunda;
- técnicamente mantenible.

DentCore ya tiene mucha funcionalidad. El problema principal actual es que se siente **sobrecargado, acumulativo y parcialmente mal organizado**.

No soluciones esto eliminando potencia útil.

Soluciónalo mediante:

1. arquitectura de información;
2. jerarquía visual;
3. unificación de workflows;
4. reducción de pasos;
5. contextualización;
6. progressive disclosure;
7. componentes consistentes;
8. semántica de dominio coherente;
9. modularización técnica;
10. automatización e IA donde realmente reduzcan trabajo.

Principio central:

> **Small surface, deep capability.**
>
> Por fuera, DentCore debe parecer pequeño y obvio.  
> Por dentro, puede ser muy completo.

---

# 2. AUTORIDAD Y REGLA DE DECISIÓN

Cuando exista conflicto entre:

- código actual;
- `AGENTS.md`;
- documentación antigua;
- nombres de módulos existentes;
- flujos heredados;
- prompts anteriores;
- esta guía;

aplica este orden:

1. integridad clínica, económica, de seguridad y trazabilidad;
2. decisiones de producto de esta guía;
3. workflow real de una clínica dental;
4. arquitectura objetivo;
5. código actual.

El código existente **no es la especificación**.

Puede ser:

- conservado;
- refactorizado;
- rediseñado;
- reconstruido;
- fusionado;
- eliminado;

siempre que se mantengan datos válidos, trazabilidad y comportamiento correcto.

No mantengas una mala decisión únicamente porque ya está implementada.

No hagas un big-bang rewrite.

Trabaja por **vertical slices completas y verificables**.

---

# 3. PRODUCTO OBJETIVO

DentCore se diseña inicialmente para una clínica dental mediana, aproximadamente de 1 a 10 gabinetes.

Debe poder crecer después hacia:

- multicentro;
- cadenas;
- integraciones;
- módulos avanzados;

sin introducir desde ahora complejidad enterprise innecesaria.

Referencia conceptual competitiva:

- **Eurodent**: copiar rapidez mecánica y baja fricción en tareas repetidas.
- **Dentalink**: copiar IA contextual e integración web moderna.
- **Gesden**: copiar profundidad dental, periodoncia, agenda, recalls, imágenes y gestión completa.

No copies interfaces antiguas.

DentCore debe superar a esos productos en:

- claridad;
- organización;
- consistencia;
- velocidad;
- contextualización;
- control por IA;
- reducción de carga cognitiva.

Objetivo principal:

> **Que la clínica haga más trabajo con menos pasos, menos pantallas y menos errores.**

---

# 4. PRINCIPIOS NO NEGOCIABLES DE UX

## 4.1 Regla de contexto

> **Si DentCore ya conoce un dato de forma inequívoca, no lo vuelve a preguntar.**

Ejemplos:

- si la cita se crea desde un hueco de agenda, no volver a preguntar doctor y hora;
- si existe paciente activo, no volver a seleccionar paciente;
- si una sesión nace de una cita, reutilizar motivo, profesional y tratamientos previstos;
- si una línea aceptada ya conoce pieza/tratamiento, no volver a introducirlos al realizarla.

## 4.2 Densidad

No mostrar simultáneamente toda la capacidad del programa.

Mostrar:

- lo necesario ahora;
- lo importante;
- lo urgente;
- la siguiente acción.

Ocultar o plegar:

- acciones secundarias;
- configuración;
- detalle avanzado;
- histórico extenso;
- campos poco usados.

## 4.3 Jerarquía

Cada pantalla debe tener:

1. contexto claro;
2. una acción primaria dominante;
3. contenido principal;
4. acciones secundarias contenidas;
5. feedback visible.

Evitar:

- 5–10 botones del mismo peso;
- tarjetas por cada concepto;
- bloques duplicados;
- tablas innecesariamente grandes;
- encabezados gigantes;
- modales anidados;
- información repetida.

## 4.4 Regla visual

La estética no es decoración.

Un fallo visual es un fallo de producto.

No considerar ninguna vertical terminada si existe:

- clipping;
- overflow;
- scroll horizontal accidental;
- elementos superpuestos;
- z-index incorrecto;
- botones cortados;
- alineaciones inconsistentes;
- paddings arbitrarios;
- estados sin jerarquía;
- colores contradictorios;
- responsive roto;
- modales/drawers defectuosos;
- tablas ilegibles;
- pantallas visualmente saturadas.

Probar con **datos densos**, no solo con demos vacías.

## 4.5 Modelo visual: aplicación profesional, no página web

Aunque DentCore se ejecute técnicamente en navegador, debe sentirse como un **programa profesional compacto de escritorio**.

Evitar el patrón típico de SaaS/web:

- título grande;
- descripción;
- mucho espacio vertical;
- una card;
- otra card;
- cards dentro de cards;
- bloques flotantes;
- contenido estrecho centrado;
- acciones dispersas;
- sensación de “página nueva” en cada navegación.

Construir un **Application Shell permanente**:

```text
┌──────────────────────────────────────────────────────────────┐
│ DentCore · Clínica · búsqueda/IA · En sala · usuario        │
├────────────┬─────────────────────────────────────────────────┤
│ Jornada    │                                                 │
│ Pacientes  │              WORKSPACE ACTIVO                   │
│ Caja       │                                                 │
│ Listados   │                                                 │
│            │                                                 │
│ Ajustes    │                                                 │
└────────────┴─────────────────────────────────────────────────┘
```

El shell debe mantener estables:

- navegación;
- identidad de clínica;
- usuario;
- acceso IA;
- `En sala`;
- contexto global;
- feedback/notificaciones.

Al cambiar de Jornada a Pacientes o Caja debe sentirse que cambia el **workspace central**, no que se carga otro sitio web.

### Reglas de densidad

En escritorio:

- aprovechar el ancho disponible;
- evitar `max-width` estrechos de landing page;
- usar espacios compactos y consistentes;
- controles con alturas coherentes;
- cabeceras moderadas;
- tablas y grids pensados para trabajo intensivo;
- evitar grandes vacíos decorativos.

Compacto no significa apretado.

Objetivo:

> **alta densidad informativa + excelente legibilidad + jerarquía clara.**

No buscar minimalismo de marketing.

Buscar comodidad durante 8 horas de trabajo.

### Cards

No envolver cada bloque en una `Card` por defecto.

Usar card solo cuando represente una unidad conceptual realmente independiente.

Preferir para software profesional:

- paneles continuos;
- divisores;
- toolbars;
- tabs;
- grids;
- tablas;
- columnas;
- side panels;
- cabeceras persistentes.

Evitar:

- card dentro de card;
- sombras innecesarias;
- bordes redondeados gigantes;
- islas visuales sin alineación.

### Grid

Las pantallas deben construirse sobre una cuadrícula clara.

Elementos relacionados deben:

- alinear bordes;
- compartir columnas;
- mantener ritmo vertical;
- usar espaciado tokenizado;
- tener posiciones previsibles.

Nada debe parecer colocado “a ojo”.

---

## 4.6 Tres tipos de superficie

DentCore NO debe meter todo en una única pantalla.

El tamaño de la interfaz debe corresponder al **tamaño mental de la tarea**.

### A. Workspace principal

Para contextos donde el usuario puede trabajar durante mucho tiempo.

Ejemplos:

- Jornada;
- Pacientes;
- Caja;
- Listados.

Características:

- ocupan prácticamente todo el área útil;
- toolbar propia;
- filtros y selección persistentes;
- alta densidad;
- pocas cards;
- navegación interna contextual.

### B. Pantalla dedicada de tarea

Para tareas que requieren varios minutos, concentración o mucho espacio.

Ejemplos:

- consentimiento informado;
- primera visita;
- odontograma completo;
- periodontograma;
- receta;
- presupuesto complejo;
- edición/visualización documental avanzada;
- determinadas tareas de laboratorio o inventario cuando el detalle lo justifique.

Una pantalla dedicada:

- sigue dentro del Application Shell;
- mantiene el paciente/contexto visible;
- puede usar breadcrumb compacto;
- tiene acciones claras de volver/cerrar/finalizar;
- no debe sentirse como otra aplicación.

Ejemplo conceptual:

```text
DentCore > Juan Pérez > Consentimientos > Implante
──────────────────────────────────────────────────
Juan Pérez · #1034 · ⚠ Penicilina

Consentimiento informado — Implante
[contenido principal amplio]

Cancelar      Vista previa      Firmar y guardar
```

No convertir estas tareas en modales gigantes.

### C. Modal / drawer / popover

Para acciones rápidas y acotadas.

Ejemplos:

- añadir teléfono;
- cambiar duración;
- nueva cita;
- añadir observación;
- registrar pago;
- subir archivo;
- editar un dato;
- acción secundaria breve.

Regla:

> **Acción de segundos -> overlay.  
> Tarea de minutos -> pantalla dedicada.  
> Entorno de horas -> workspace.**

No abrir una pantalla completa para cada acción pequeña.

No meter una tarea compleja de varios minutos en un modal.

---

---

# 5. SISTEMA VISUAL OBLIGATORIO

Construir y aplicar un design system real.

Debe incluir al menos:

- tokens de espacio;
- tokens tipográficos;
- radios;
- elevación;
- bordes;
- superficies;
- focus states;
- estados interactivos;
- colores semánticos;
- componentes base.

Componentes comunes:

- `Button`
- `IconButton`
- `Input`
- `Select`
- `Textarea`
- `Field`
- `FormSection`
- `Dialog`
- `Drawer`
- `Popover`
- `Tabs`
- `Table`
- `Badge`
- `StatusChip`
- `Alert`
- `EmptyState`
- `Skeleton`
- `Toast`
- `PageHeader`
- `Toolbar`

No duplicar variantes visuales arbitrarias por módulo.

## Color semántico

Usar los colores con significado estable en toda la aplicación.

- **Rojo**: riesgo clínico, deuda crítica, urgencia, conflicto/solape grave.
- **Verde**: realizado, cobrado, correcto, finalizado exitosamente.
- **Ámbar/naranja**: espera, pendiente, planificado, atención necesaria no crítica.
- **Azul**: información neutra, acción normal, selección.
- **Gris**: secundario, inactivo, histórico, contexto.

El color nunca puede ser la única señal.

Usar también:

- texto;
- icono;
- etiqueta;
- patrón visual.

Urgencia no es lo mismo que error.

Deuda no es lo mismo que alerta clínica.

No reutilizar rojo indiscriminadamente.

---

# 6. ARQUITECTURA DE INFORMACIÓN OBJETIVO

La arquitectura de información y la arquitectura visual deben coincidir.

La navegación global no representa cada función disponible. Representa solo los **centros de trabajo principales**.

Las funciones profundas se abren desde contexto mediante:

- pantalla dedicada;
- drawer/modal;
- acción contextual.

No crear un item de navegación global por cada capacidad del sistema.

## Recepción

Superficies principales:

1. **Jornada**
2. **Pacientes**
3. **Caja**
4. **Listados**

## Doctor / auxiliar

Superficies principales:

1. **Jornada**
2. **Pacientes**

El trabajo clínico ocurre principalmente dentro del paciente y de la sesión.

## Administración / dirección

- Listados
- Configuración
- Usuarios/permisos
- Seguridad
- Integraciones
- Backups
- módulos opcionales

## Módulos opcionales

Inventario, laboratorio global, fichaje, portal, IA avanzada u otras funciones opcionales:

- si están desactivados, desaparecen de navegación;
- no mostrar tabs grises;
- no contaminar la interfaz principal.

---

# 7. JORNADA: FUSIONAR HOY + AGENDA

`Hoy` y `Agenda` no deben seguir siendo dos centros operativos separados.

Crear un workspace único:

# Jornada

Con dos perspectivas del mismo sistema:

### Operativa

- citas de hoy;
- llegadas;
- pacientes esperando;
- pacientes en atención;
- retrasos;
- cancelaciones;
- urgencias;
- huecos;
- pacientes pendientes de salida;
- bloqueos/incidencias relevantes.

### Agenda

- parrilla horaria;
- profesionales;
- gabinetes;
- duración;
- disponibilidad;
- solapes;
- citas futuras.

Ambas vistas comparten:

- filtros;
- cita seleccionada;
- estado;
- acciones;
- contexto.

## Estados de cita visibles

Mantener pocos estados humanos:

- PROGRAMADA
- CONFIRMADA
- EN_SALA
- EN_ATENCION
- FINALIZADA
- CANCELADA
- NO_PRESENTADO

No convertir en estados principales:

- mensaje enviado;
- recordatorio;
- reprogramada;
- solicitud de cambio;
- llamada pendiente.

Eso son eventos, flags o badges.

---

# 8. EN SALA

Crear un desplegable global compacto:

# En sala

Filtros:

- `Mis pacientes`
- `Toda la clínica`

Mostrar solo:

- paciente;
- hora prevista;
- minutos esperando;
- profesional;
- gabinete, si aplica.

Comportamiento:

- recepción marca llegada;
- el profesional recibe una notificación puntual;
- no abrir automáticamente pantallas;
- no repetir notificaciones;
- espera normal -> aviso -> retraso importante;
- umbrales configurables;
- abrir ficha no cambia estado;
- `Atender / Iniciar sesión` sí cambia a `EN_ATENCION`.

Al terminar sesión clínica:

- sale de `En sala`;
- pasa a `Pendiente de salida` para recepción.

---

# 9. AGENDA

## Doctor + gabinete

Permitir asociar:

- doctor;
- gabinete opcional.

No obligar a clínicas simples a usar recursos complejos.

Controlar conflictos reales.

## Duración

Tratamientos pueden tener duración habitual configurable.

Se propone, no se impone.

## Urgencias

Permitir urgencias incluso sin hueco.

Si se solapan:

- mostrar inequívocamente;
- utilizar semántica roja;
- registrar el override;
- no intentar ocultar el conflicto;
- no bloquear innecesariamente.

Por ahora no construir un optimizador IA del “mejor solape”.

## Retrasos

Si el paciente llega tarde:

- indicar minutos;
- mostrar impacto estimado;
- no reprogramar automáticamente.

Si una cita excede duración:

- reflejar sobretiempo;
- reflejar retraso acumulado;
- no convertirlo en alarma permanente.

## Paciente provisional

Permitir crear cita con mínimos:

- nombre;
- teléfono si existe;
- motivo;
- duración.

Completar ficha más tarde.

---

# 10. FICHA GENERAL DEL PACIENTE

Debe existir una **ficha general única**.

No construir aplicaciones distintas por rol.

Adaptar:

- acciones;
- prioridades;
- permisos;
- información económica visible.

## Cabecera persistente

Mostrar de forma compacta:

- nombre;
- edad;
- nº historia;
- avisos clínicos;
- estado de hoy;
- próxima cita;
- saldo, si el rol tiene permiso.

El paciente debe entenderse en menos de 5 segundos.

## Resumen

Priorizar:

- motivo actual;
- último evento clínico relevante;
- plan activo;
- siguiente acción;
- pendientes bloqueantes;
- 3–5 acciones principales.

No competir en primer plano con:

- dirección completa;
- fiscalidad;
- documentos vacíos;
- odontograma completo;
- informes;
- configuraciones.

## Duplicados

- DNI/NIE exacto: advertencia fuerte antes de crear.
- Teléfono coincidente: advertencia débil.
- El teléfono puede compartirse entre padres e hijos.

## Pagador

No crear por ahora un módulo complejo de familias.

Soportar correctamente:

- pagador distinto;
- responsable;
- menores;
- datos necesarios de relación.

Dejar arquitectura extensible.

---

# 11. AVISOS Y OBSERVACIONES

Separar:

### Avisos importantes

Información que debe influir en seguridad o atención.

Ejemplos:

- alergias;
- anticoagulantes;
- riesgo clínico relevante.

### Observaciones

Información útil, no necesariamente crítica.

Los avisos:

- visibles de forma discreta;
- no deben dominar la pantalla;
- pueden marcarse `revisado hoy`;
- no deben desaparecer por marcarse revisados.

Eliminar/inactivar un aviso clínico requiere rol autorizado y trazabilidad.

---

# 12. PRIMERA VISITA Y SESIÓN CLÍNICA

`Primera visita` no es un módulo global independiente.

Es un **modo clínico especializado ligado al paciente/sesión** y puede abrirse como **pantalla dedicada de tarea** cuando necesite espacio.

Puede guiar:

- motivo;
- antecedentes;
- observaciones;
- exploración;
- odontograma;
- pruebas;
- diagnóstico;
- plan.

Ocultar secciones innecesarias.

## Autosave

Aplicar autosave de borrador a:

- primera visita;
- notas clínicas;
- formularios largos.

No confundir autosave con registro clínico definitivo.

La firma/finalización relevante sigue siendo explícita.

## Sesión clínica

El doctor debe poder realizar casi toda la consulta desde una sola sesión.

La sesión reutiliza automáticamente:

- cita;
- paciente;
- doctor;
- motivo;
- avisos;
- plan aceptado;
- tratamientos previstos.

No volver a pedir datos ya conocidos.

---

# 13. FINALIZAR VISITA

Para el doctor:

`Finalizar visita` = cerrar la sesión clínica.

No significa:

- cobrar;
- emitir factura;
- financiar;
- gestionar caja.

Al finalizar:

1. validar que la documentación clínica necesaria está correcta;
2. guardar la sesión;
3. cerrar paciente para el doctor;
4. enviar automáticamente a recepción.

Crear bandeja:

# Pendiente de salida

Tarjeta compacta por paciente con:

- tratamiento realizado;
- importe facturable/preparado;
- saldo;
- estado económico;
- próxima cita pendiente/sugerida;
- documentación administrativa pendiente.

Recepción resuelve:

- cobro total;
- parcial;
- pendiente;
- financiación;
- saldo a favor;
- cortesía/bonificación autorizada;
- próxima cita;
- documentación de salida.

---

# 14. PLAN DE TRATAMIENTO

Eliminar la experiencia mental:

`Presupuesto -> Preparar pendientes -> Pendiente -> Realizado`

El usuario no debe administrar entidades internas.

Crear una historia conceptual:

`Propuesta -> Aceptada -> Programada -> En curso -> Realizada`

También:

- rechazada;
- pospuesta;
- cancelada.

`Trabajo pendiente` puede existir como read model o consulta, no como transformación manual obligatoria.

## Presupuestos

Soportar:

- aceptación total;
- aceptación parcial;
- programar directamente líneas aceptadas;
- alternativas A/B/C;
- comparación visual;
- duplicar presupuesto;
- descuentos por línea;
- descuento global;
- permisos de descuento;
- auditoría.

No construir versionado editorial complejo.

Si un presupuesto presentado cambia de manera sustancial:

- crear nuevo;
- mantener anterior archivado e intacto.

---

# 15. ODONTOGRAMA

Es una herramienta importante, no el centro universal del producto.

El odontograma completo puede abrirse como **pantalla dedicada** dentro del contexto del paciente. En resúmenes solo mostrar una representación compacta cuando aporte valor.

Debe distinguir:

- condición/preexistencia;
- hallazgo/diagnóstico;
- propuesta;
- plan aceptado;
- realizado.

Soportar:

- dentición adulta;
- temporal;
- mixta;
- selección múltiple;
- superficies;
- aplicación rápida/repetida;
- deshacer;
- historia por pieza;
- vista temporal;
- comparación antes/ahora.

Seleccionar una pieza puede abrir panel contextual con:

- diagnósticos;
- tratamientos;
- notas;
- imágenes;
- cronología.

No llenar el odontograma de colores sin jerarquía.

---

# 16. PERIODONTOGRAMA

Construir un periodontograma profesional y versionado.

Debe ser una **pantalla clínica dedicada**, no un widget encajonado dentro de una ficha pequeña.

Debe quedar preparado para:

- profundidad de sondaje;
- margen/recesión;
- NIC calculado;
- sangrado;
- placa;
- movilidad;
- furca;
- otros campos validados clínicamente.

Priorizar velocidad de entrada.

Soportar teclado eficientemente.

Dejar preparada una futura entrada por voz:

`3 2 3, sangrado, 4 4 3...`

La IA puede interpretar y preparar datos, pero debe existir revisión visual antes de confirmar.

---

# 17. CAJA Y CUENTA DEL PACIENTE

Separar conceptos.

## Cuenta del paciente

- cargos;
- facturas;
- pagos;
- pagos parciales;
- anticipos;
- saldo a favor;
- deuda;
- devoluciones;
- rectificaciones;
- financiación.

## Caja de clínica

Workflow conciso:

`Apertura -> Fondo inicial -> Movimientos -> Efectivo esperado -> Conteo -> Diferencia -> Cierre`

No convertir Caja en una pantalla contable enorme.

El detalle existe, pero queda detrás.

## Financiación

Interna:

- entrada;
- cuotas;
- periodicidad;
- vencimientos;
- estado.

Externa:

- registrar que está financiado externamente;
- no fingir gestionar el contrato si no existe integración.

Dejar arquitectura preparada para integraciones futuras.

---

# 18. LISTADOS

`Listados` se mantiene como módulo independiente.

No llenar Jornada con BI.

Aquí viven:

- pacientes;
- citas;
- tratamientos;
- presupuestos;
- deuda;
- cobros;
- facturación;
- ocupación;
- cancelaciones;
- producción;
- aceptación;
- rentabilidad;
- profesionales;
- inventario;
- laboratorio;
- proyecciones.

Diseño:

- objetivo primero;
- periodo;
- filtros;
- resultado;
- drill-down.

No mostrar 40 KPIs a la vez.

La IA de análisis debe consultar una **capa semántica segura**, no SQL arbitrario.

---

# 19. INVENTARIO

Debe ser completo pero visual.

Vista inicial:

- Necesita pedir
- Próximo a caducar
- Correcto

Detalle avanzado detrás.

Soportar cuando aplique:

- stock;
- movimientos;
- mínimos;
- lotes;
- caducidad;
- proveedores;
- pedidos;
- consumo automático opcional;
- escáner código de barras/QR.

Implantes/material crítico:

- marca;
- modelo;
- referencia;
- lote;
- paciente;
- tratamiento;
- trazabilidad.

---

# 20. LABORATORIO

Para trabajos protésicos:

DentCore puede proponer crear trabajo de laboratorio.

Registrar:

- laboratorio;
- tipo;
- envío;
- pruebas;
- fecha objetivo;
- recepción;
- incidencia;
- entrega.

El módulo global puede ser opcional.

La información crítica debe aparecer contextualmente en:

- paciente;
- sesión;
- Jornada.

---

# 21. IMÁGENES Y DOCUMENTOS

Consentimientos y documentos complejos pueden usar **pantallas dedicadas de tarea** manteniendo visible el contexto del paciente.

No obligar a editar o firmar un consentimiento largo dentro de un modal.

Primera etapa:

- almacenar;
- clasificar;
- miniaturas;
- asociar a paciente;
- asociar a visita;
- asociar a pieza si procede;
- acceso rápido.

No construir ahora un PACS propio completo.

Dejar extensión futura para:

- visor dental profesional;
- DICOM;
- STL;
- comparación;
- proveedores especializados.

## Acceso paciente

El paciente **no entra en DentCore** como requisito del producto inicial.

El portal existente no debe condicionar navegación ni arquitectura principal.

Puede conservarse de forma segura como:

- funcionalidad opcional;
- base para enlaces temporales;
- firma/documentos futuros.

Firma:

- presencial en tablet/pantalla;
- futura opción de enlace temporal y revocable.

---

# 22. IA: ARQUITECTURA DE PRODUCTO

La IA debe ser una **capa operativa transversal**.

No un chatbot aislado.

Interfaces:

1. acciones contextuales;
2. barra global;
3. chat cuando aporte valor;
4. voz.

Acceso recomendado:

- `Ctrl/Cmd + Space`;
- botón discreto;
- micrófono;
- manos libres opcional y configurable.

## Objetivo

Experiencia similar a “Siri dentro de DentCore”, pero basada en:

- intención;
- contexto;
- herramientas tipadas;
- permisos;
- confirmaciones;
- auditoría.

NO basada en frases exactas.

Debe entender variaciones naturales como:

- “méteme a Marta mañana por la tarde”;
- “abre a Carlos”;
- “ponle revisión dentro de seis meses”;
- “este ya ha pagado”;
- “factura esta visita”;
- “qué tengo pendiente”;
- “siguiente paciente”.

No crear cientos de regex o comandos hardcodeados como arquitectura central.

---

# 23. IA: QUÉ PUEDE HACER

Puede:

- navegar;
- buscar;
- filtrar;
- abrir pacientes;
- preparar citas;
- preparar presupuestos;
- preparar mensajes;
- resumir información;
- estructurar dictado;
- organizar notas;
- detectar campos pendientes;
- preparar tareas;
- preparar cobros;
- preparar facturas;
- ejecutar planes multi-step;
- consultar Listados;
- avisar puntualmente de anomalías.

El foco clínico inicial de IA es:

- comentarios;
- notas;
- estructuración;
- organización;
- reducción de tecleo;
- recuperación de contexto;
- omisiones;
- preparación.

NO diagnóstico autónomo.

NO tratamiento autónomo.

NO modificación clínica silenciosa.

---

# 24. IA: SEGURIDAD Y CONFIRMACIÓN

Clasificar herramientas por riesgo.

## Bajo riesgo

Puede ejecutar directamente:

- navegar;
- abrir;
- buscar;
- filtrar;
- cambiar vista;
- preparar borradores.

## Riesgo medio

Mostrar preview y confirmación simple:

- crear/reprogramar cita;
- enviar mensaje;
- preparar acciones operativas con impacto.

## Alto riesgo

Confirmación explícita obligatoria:

- registrar acto clínico;
- modificar expediente clínico;
- emitir factura;
- registrar cobro;
- devolución;
- rectificación;
- borrar/inactivar información sensible;
- operaciones irreversibles.

La confirmación debe ser concreta:

`Confirmar cobro de 230 €`

No:

`¿Estás seguro?`

## Auditoría IA

Registrar:

- usuario;
- intención;
- contexto autorizado;
- interpretación;
- herramienta;
- argumentos;
- preview;
- confirmación;
- resultado;
- modelo/proveedor/versionado cuando proceda.

## Arquitectura

Modelo IA nunca accede directamente a DB.

Flujo:

`UI -> AI Orchestrator -> Policy/Permissions -> Typed Tools -> Application Services -> DB`

No SQL libre sobre producción.

No herramientas arbitrarias.

No mutaciones directas desde el LLM.

Soportar idempotencia y retry.

El sistema debe funcionar correctamente si la IA está caída.

---

# 25. IA PROACTIVA

Puede avisar puntualmente de:

- espera excesiva;
- consentimiento faltante;
- trabajo de laboratorio que amenaza próxima cita;
- tratamiento aceptado sin programar;
- saldo anómalo;
- visita finalizada sin salida resuelta;
- recall futuro cuando se implemente.

No crear un centro de notificaciones ruidoso.

Priorizar:

- contexto;
- urgencia;
- relevancia;
- deduplicación;
- frecuencia limitada.

---

# 26. WHATSAPP / MENSAJERÍA

Ahora:

- enviar mensajes desde DentCore;
- plantillas;
- contexto paciente/cita;
- registro de envío.

Más adelante:

- bandeja bidireccional;
- IA que entiende respuestas;
- reprogramación;
- contact center;
- automatización avanzada.

No sobreconstruir esta fase todavía.

---

# 27. ARQUITECTURA TÉCNICA OBJETIVO

Mantener **modular monolith**.

No microservicios por moda.

Backend por dominios:

```text
app/domains/
  identity/
  patients/
  scheduling/
  clinical/
  treatment_plans/
  billing/
  communications/
  laboratory/
  inventory/
  reporting/
  ai/
```

Dentro de cada dominio:

```text
api/
application/
domain/
persistence/
schemas/
```

Routers:

- finos;
- sin reglas empresariales grandes;
- sin transacciones repartidas;
- sin lógica de dominio duplicada.

Application services:

- orquestan casos de uso;
- transacciones;
- permisos;
- idempotencia;
- integridad.

## Frontend

Dividir cliente API monolítico por dominios.

Objetivo:

```text
src/api/
  client.ts
  auth.ts
  patients.ts
  scheduling.ts
  clinical.ts
  treatmentPlans.ts
  billing.ts
  documents.ts
  laboratory.ts
  inventory.ts
  reporting.ts
  ai.ts
```

Avanzar hacia tipos generados desde OpenAPI.

No mantener demo fallback mezclado por todo el cliente de producción.

Separar adaptador demo.

## Estado

Definir state machines explícitas para:

- cita;
- sesión/visita;
- plan/línea;
- factura;
- pago;
- laboratorio;
- consentimiento.

Evitar estados booleanos independientes que puedan generar combinaciones imposibles.

---

# 28. DEUDA TÉCNICA CONFIRMADA A ATACAR

En el snapshot auditado existen señales claras de concentración:

- `frontend/src/index.css` extremadamente grande;
- `layout-foundation.css` grande;
- `frontend/src/lib/api.ts` monolítico;
- Agenda grande;
- Pacientes grande;
- `ClinicalWorkspace` grande;
- `FichaPaciente` grande;
- asistente flotante/panel demasiado complejos;
- routers backend de citas, presupuestos, odontograma, portal, tratamientos, laboratorio y facturas muy cargados.

No refactorizar únicamente para reducir líneas.

Refactorizar cuando reduzca:

- responsabilidades;
- acoplamiento;
- regresiones;
- coste de cambio;
- inconsistencia visual;
- duplicación.

---

# 29. P0 TÉCNICOS ACTUALES

Antes de modernizaciones extensas, garantizar:

## 29.1 Refresh silencioso

El cliente tiene `refreshAuthToken()`, pero el interceptor auditado no ejecuta automáticamente refresh + retry del request tras 401.

Implementar:

- single-flight refresh;
- una sola renovación concurrente;
- retry original una vez;
- evitar loops;
- limpiar sesión si falla;
- preservar ruta;
- preservar borradores seguros;
- no duplicar mutaciones.

## 29.2 E2E full-stack real

Construir escenario real:

`Paciente -> presupuesto -> aceptación -> cita -> sesión -> realizado -> factura -> cobro`

Con:

- navegador;
- backend real;
- PostgreSQL real de test;
- sin mocks del circuito principal.

## 29.3 Restore real

Backup no es suficiente.

Probar:

- backup;
- restore a BD aislada;
- invariantes;
- documentos/uploads;
- validación.

## 29.4 Fuente canónica de salud/avisos

No permitir dos fuentes contradictorias para datos clínicos críticos.

Definir:

- fuente canónica;
- estrategia de migración;
- compatibilidad temporal;
- eliminación posterior de duplicidad.

---

# 30. ORDEN DE EJECUCIÓN

Trabajar en este orden salvo evidencia fuerte en contra.

## Fase 0 — Alinear el proyecto

1. leer este archivo;
2. leer el Master completo si hace falta contexto;
3. revisar `AGENTS.md`;
4. actualizar instrucciones heredadas que contradigan esta guía;
5. inventariar rutas, módulos, entidades y estados;
6. levantar app;
7. generar demo densa;
8. capturar baseline visual.

## Fase 1 — Confianza P0

1. refresh 401;
2. E2E full-stack;
3. restore;
4. salud/avisos canónicos;
5. semántica de cita/visita/plan/cuenta;
6. design tokens base.

## Fase 2 — Jornada

1. fusionar Hoy + Agenda;
2. En sala;
3. llegada/notificación;
4. estados simples;
5. urgencias/solapes;
6. retrasos;
7. Pendiente de salida.

## Fase 3 — Paciente / sesión

1. PatientShell limpio;
2. cabecera;
3. resumen 5 segundos;
4. primera visita como modo;
5. autosave;
6. sesión clínica contextual;
7. avisos/observaciones.

## Fase 4 — Plan / odontograma / perio

1. plan unificado;
2. eliminar preparación manual de pendientes;
3. aceptación parcial;
4. alternativas;
5. odontograma temporal;
6. múltiple selección;
7. dentición mixta;
8. periodontograma.

## Fase 5 — Economía

1. cuenta paciente;
2. financiación;
3. devoluciones/rectificaciones;
4. Caja real;
5. permisos económicos.

## Fase 6 — Listados / módulos de soporte

1. Listados rediseñado;
2. semantic layer;
3. inventario visual;
4. escáner;
5. laboratorio;
6. imágenes/documentos.

## Fase 7 — IA operativa

1. AI Bar;
2. tool registry;
3. permissions/policy;
4. confirmations;
5. audit;
6. dictado estructurado;
7. acciones multi-step;
8. avisos proactivos;
9. IA de Listados.

## Fase 8 — Comercialización

1. onboarding;
2. módulos activables;
3. demo completa;
4. i18n base;
5. rendimiento;
6. accesibilidad;
7. preflight;
8. seguridad;
9. pentest;
10. validación legal/fiscal.

---

# 31. PROTOCOLO DE TRABAJO DE ASTRA

Astra debe **ejecutar**, no limitarse a producir auditorías, mapas o propuestas.

La inspección y clasificación son trabajo interno del agente.

No detenerse para entregar:

- mapa del repositorio;
- lista de sugerencias;
- arquitectura propuesta;
- inventario de archivos;
- plan para aprobación;

salvo que aparezca uno de los riesgos que exige autorización humana definidos más adelante.

Para cada tarea o vertical, internamente:

## Antes

1. inspeccionar implementación actual;
2. identificar comportamiento correcto existente;
3. detectar deuda;
4. clasificar internamente:
   - KEEP
   - REFACTOR
   - REDESIGN
   - REBUILD
   - REMOVE
5. definir objetivo UX;
6. definir migración si afecta datos;
7. identificar tests necesarios;
8. comenzar la ejecución directamente.

## Durante

1. implementar incrementalmente;
2. no duplicar arquitectura;
3. migrar consumidores;
4. mantener compatibilidad solo el tiempo necesario;
5. eliminar legacy cuando ya no tenga consumidores;
6. usar permisos backend;
7. mantener `clinica_id`;
8. mantener auditoría.

## Después

Ejecutar:

- backend tests;
- frontend tests;
- TypeScript;
- lint/ruff;
- build;
- E2E aplicable;
- revisión visual real;
- responsive;
- datos densos;
- accesibilidad;
- búsqueda de código muerto.

Documentar:

- qué cambió;
- por qué;
- archivos;
- migraciones;
- riesgos;
- cómo probar;
- siguiente deuda relacionada.

---

# 32. DEFINITION OF DONE

Una tarea NO está terminada porque:

- compile;
- funcione en happy path;
- se vea “más moderna”;
- tenga tests unitarios;
- tenga más funciones.

Debe cumplir lo aplicable de:

## Producto

- reduce o no aumenta pasos innecesarios;
- no pregunta información conocida;
- mantiene contexto;
- semántica clara;
- no introduce duplicación;
- encaja con workflow clínico.

## UX

- jerarquía clara;
- acción primaria evidente;
- secundarios contenidos;
- no saturación;
- feedback;
- errores comprensibles;
- estados coherentes.

## Visual

- se siente como una aplicación profesional y no como una colección de páginas web;
- Application Shell y contexto permanecen coherentes;
- workspace aprovecha correctamente el área útil;
- no existe uso indiscriminado de cards;
- overlays solo se usan para tareas breves;
- tareas complejas tienen pantalla dedicada cuando corresponde;
- sin overflow;
- sin clipping;
- sin overlaps;
- sin z-index roto;
- sin alineaciones arbitrarias;
- responsive correcto;
- color semántico consistente;
- pantalla densa sigue siendo legible;
- modales/drawers correctos.

## Datos

- sin pérdida;
- migración validada;
- integridad;
- tenant isolation;
- auditoría;
- idempotencia cuando aplique.

## Testing

- unit/integration según capa;
- E2E de flujo crítico;
- visual regression o revisión screenshot;
- concurrencia si existe riesgo.

## IA

- herramienta tipada;
- permiso;
- riesgo;
- preview/confirmación;
- audit;
- retry seguro;
- fallback sin IA.

---

# 33. PROHIBICIONES

No:

- diseñar DentCore como una landing/SaaS de tarjetas flotantes;
- usar títulos gigantes y grandes espacios vacíos por estética;
- limitar artificialmente el workspace a una columna estrecha;
- meter una tarea larga en un modal gigante;
- crear una página completa para una acción trivial;
- interpretar “compacto” como “todo en una sola pantalla”;
- añadir un módulo nuevo por cada idea;
- crear tabs innecesarias;
- ocultar deuda visual con más CSS overrides;
- mantener mega-componentes creciendo;
- meter reglas de negocio en JSX;
- meter lógica compleja en routers;
- inventar estados adicionales sin necesidad;
- copiar UI legacy;
- construir microservicios por anticipación;
- permitir SQL libre desde IA;
- permitir IA con acceso directo a DB;
- permitir diagnóstico clínico autónomo;
- ejecutar acciones clínicas/económicas sensibles sin confirmación;
- romper trazabilidad;
- borrar datos clínicos/económicos silenciosamente;
- introducir datos demo como fallback de producción;
- construir ahora un portal paciente completo;
- construir ahora un PACS propio;
- construir ahora un contact center WhatsApp complejo;
- priorizar features llamativas antes de resolver organización y estabilidad.

---

# 34. CUÁNDO PEDIR AUTORIZACIÓN HUMANA

Astra debe trabajar con autonomía.

No pedir permiso para:

- refactors;
- rediseños;
- reconstrucciones incrementales;
- limpieza;
- modularización;
- mejoras UX;
- tests;
- design system;
- eliminación de legacy demostrado;
- migraciones reversibles bien preparadas.

Detenerse o pedir validación cuando exista:

- riesgo real de pérdida de datos;
- migración destructiva irreversible;
- decisión clínica que requiere odontólogo;
- decisión fiscal/legal no verificable;
- cambio de producto que contradiga explícitamente esta guía;
- cambio de alcance comercial fundamental;
- riesgo serio de seguridad.

---

# 35. MÉTRICAS DE ÉXITO

Medir donde sea posible:

- clics por tarea;
- tiempo por tarea;
- número de cambios de contexto;
- errores/reintentos;
- campos repetidos;
- pantallas visitadas;
- densidad visual;
- warnings visuales;
- tamaño/responsabilidad de componentes críticos;
- E2E pass rate;
- performance;
- utilidad de IA;
- porcentaje de acciones IA confirmadas/canceladas;
- fallos de herramientas IA;
- satisfacción de recepción/doctor en pruebas.

No optimizar únicamente estética.

No optimizar únicamente LOC.

Optimizar **trabajo real**.

---

# 36. PRIMERA MISIÓN AL RECIBIR ESTE ARCHIVO

No empieces añadiendo funciones.

Haz primero:

1. confirmar SHA actual de `main`;
2. comparar cambios desde el commit de referencia;
3. leer `AGENTS.md`;
4. alinearlo con esta guía;
5. levantar aplicación;
6. crear/cargar datos demo densos;
7. revisar visualmente:
   - Jornada/Hoy;
   - Agenda;
   - Pacientes;
   - Ficha;
   - Primera visita;
   - Presupuestos;
   - Pendientes;
   - Realizados;
   - Sesión;
   - Historial;
   - Caja;
   - Listados;
   - Inventario;
   - Laboratorio;
   - Administración;
8. hacer inventario de deuda UX/UI y técnica;
9. clasificar cada área KEEP/REFACTOR/REDESIGN/REBUILD/REMOVE;
10. resolver P0 técnicos;
11. empezar por design foundation + Jornada;
12. continuar vertical por vertical hasta que el producto sea coherente.

No trabajes por “pantallas bonitas” aisladas.

Trabaja por workflows completos.

---

# 37. VISIÓN FINAL

La recepcionista debería poder vivir casi todo el día en:

- Jornada;
- Pacientes;
- Caja.

El doctor debería vivir casi todo el día en:

- Jornada;
- Paciente;
- Sesión clínica.

Dirección debería entrar en:

- Listados.

La IA debería estar disponible en todas partes sin obligar al usuario a “entrar al módulo IA”.

DentCore debe sentirse como un sistema único, no como una colección de módulos añadidos con el tiempo.

Debe sentirse como un **programa de gestión profesional compacto**, aunque técnicamente se ejecute en navegador.

Puede tener pantallas dedicadas para tareas profundas como consentimientos, primera visita, odontograma o periodontograma; esas pantallas siguen perteneciendo al mismo shell y conservan contexto.

Una función avanzada puede existir sin estar siempre visible.

Una pantalla limpia no significa un producto limitado.

La meta es:

> **máxima capacidad con mínima carga mental.**

---

# 38. MANTRA DE EJECUCIÓN

**ANALIZA -> DISEÑA -> IMPLEMENTA -> TESTEA -> REVISA VISUALMENTE -> SIMPLIFICA -> MIGRA -> ELIMINA LEGACY -> DOCUMENTA -> CONTINÚA.**

Nunca:

**AÑADE FEATURE -> AÑADE BOTÓN -> AÑADE TAB -> AÑADE CSS -> REPITE.**

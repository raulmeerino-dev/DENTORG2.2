# Fase 10 - UX general y limpieza visual

## Objetivo

Esta fase reduce friccion operativa sin cambiar la estructura tipo Eurodent ya trabajada. Se centra en que la aplicacion comunique mejor cuando carga, guarda, falla o no tiene datos, manteniendo pantallas densas pero mas legibles.

## Cambios aplicados

- Estado global discreto de sincronizacion en la parte superior de la aplicacion.
- Barras de carga ligeras en Inicio, Pacientes y Agenda.
- Alertas visibles cuando fallan consultas de datos importantes.
- Error boundary general para evitar que una excepcion de frontend deje toda la aplicacion en blanco.
- Selector de paciente mas compacto y legible, manteniendo la busqueda fuera de la ficha.
- Portal paciente conserva su estructura, con estilos coherentes en claro/oscuro.
- Prueba frontend minima para el estado global.

## Criterios de UX

- El usuario siempre debe saber si el sistema esta cargando o listo.
- Los errores no deben romper el flujo diario.
- La busqueda de paciente se mantiene como control principal externo a la ficha.
- No se anaden secciones nuevas ni botones duplicados.

## Pendiente para pulido final

- Capturas guiadas de todas las pantallas con navegador y ajuste fino por viewport.
- Code splitting del bundle grande si se quiere mejorar el aviso de Vite.
- Revisar textos restantes con acentos segun codificacion final del proyecto.

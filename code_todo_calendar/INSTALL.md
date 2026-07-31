# Cómo integrarlo — código listo para copiar

Esto **no** es documentación para traducir: son archivos de tu stack (Expo 57,
RN 0.86, React 19, Drizzle 0.45), escritos contra tu `main` real y tus
convenciones (`deps` inyectados, borrado suave, tokens de `theme.ts`, `Sheet`,
`run()`).

Hay dos tipos de archivo:

- **`.tsx` / `.ts` completos** → se copian tal cual a la misma ruta.
- **`*.PASTE.*`** → fragmentos para pegar dentro de un archivo tuyo que ya
  existe. Cada uno dice exactamente dónde.

---

## Orden

### 1. Copiar los archivos nuevos

```
code_todo_calendar/src/db/todos.ts                 →  src/db/todos.ts
code_todo_calendar/src/db/events.ts                →  src/db/events.ts
code_todo_calendar/src/ui/screens/TodoScreen.tsx   →  src/ui/screens/TodoScreen.tsx
code_todo_calendar/src/ui/screens/CalendarScreen.tsx → src/ui/screens/CalendarScreen.tsx
code_todo_calendar/src/ui/sheets/TodoSheet.tsx     →  src/ui/sheets/TodoSheet.tsx
code_todo_calendar/src/ui/sheets/EventSheet.tsx    →  src/ui/sheets/EventSheet.tsx
code_todo_calendar/src/ui/components/TabBar.tsx    →  src/ui/components/TabBar.tsx   (REEMPLAZA el tuyo: 5 pestañas)
```

### 2. Pegar los fragmentos

| Fragmento | Dónde |
|---|---|
| `src/db/schema.PASTE.ts` | al final de `src/db/schema.ts` |
| `src/db/index.PASTE.ts` | en `src/db/index.ts` (4 bloques marcados) |
| `src/ui/hooks.PASTE.ts` | al final de `src/ui/hooks.ts` |
| `App.PASTE.md` | 6 cambios en `App.tsx` |

### 3. Generar la migración

```bash
npm run db:generate
cat src/db/migrations/0001_*.sql     # debe crear solo todos + events y sus índices
```

### 4. Correr

```bash
npx tsc --noEmit      # 0 errores de tipos
npm test              # los tests existentes siguen pasando
npm run ios           # o npm run android
```

Si sale **`no such table: todos`**: borra la app del simulador y arranca con
`npx expo start --clear`. La migración se aplica al abrir, en `ensureDbReady()`.

---

## Si prefieres que lo haga Claude Code

Ábrelo en la raíz del repo y pégale esto:

> En `code_todo_calendar/` tengo código ya escrito para este repo: dos pantallas
> nuevas (To-Do y Calendar), dos sheets, dos capas de datos y un TabBar de 5
> pestañas. Sigue `code_todo_calendar/INSTALL.md` al pie de la letra: copia los
> archivos completos a sus rutas, aplica los cuatro fragmentos `*.PASTE.*` en los
> archivos que indican, corre `npm run db:generate`, y luego `npx tsc --noEmit` y
> `npm test`. No cambies el diseño ni los estilos, no añadas dependencias, no
> reescribas los archivos que te doy: si algo no compila, corrige el mínimo y
> dime qué cambiaste y por qué. Al final, escribe los tests de
> `src/db/__tests__/todos.test.ts` y `events.test.ts` usando `createTestDb()` y
> `deps` falsos como en `dataLayer.test.ts`, cubriendo: la consulta de vencidos,
> que completar un vencido lo mueva a hoy, que el borrado suave sea invisible, y
> el clamp de `startMinute` (0..1425) y `durationMinutes` (15..720).

---

## Qué hace cada archivo

| Archivo | Responsabilidad |
|---|---|
| `src/db/todos.ts` | CRUD de tareas. Fecha de pared, "overdue" como consulta, completar un vencido lo trae a hoy, `clearCategory` para cuando se borra una categoría. |
| `src/db/events.ts` | CRUD de eventos. Fecha + minuto de pared (sobrevive a DST y a cambios de huso), sin validación de solape (a diferencia de `entries`), `startUtcMs()` listo para recordatorios. |
| `TodoScreen.tsx` | Overdue / Today / Tomorrow / <día>. Input en línea (Enter crea y sigue abierto), mostrar-ocultar completadas, `▸` para arrancar el timer. |
| `CalendarScreen.tsx` | Selector Day · Week · Month. Tira de semana, agenda del día, 7 columnas con scroll horizontal, rejilla del mes, y el formulario de nuevo evento. |
| `TodoSheet.tsx` / `EventSheet.tsx` | Edición: texto, categoría, fecha u hora (± 15 min), arrancar timer, borrar. |
| `TabBar.tsx` | 5 pestañas con dos glifos nuevos, etiqueta a 9.5px para que "Categories" siga cabiendo. |

Las pantallas son presentacionales: reciben datos y devuelven intenciones. Toda
escritura sigue pasando por `App.tsx` → `run()` → capa de datos, como el resto de
tu app.

## Lo que deliberadamente NO hace

- **No marca la tarea al parar el timer.** Arrancar desde un ítem no lo modifica;
  si quieres que pararlo la complete, dime y lo añado.
- **No hay recordatorios.** `expo-notifications` no está instalado. `startUtcMs()`
  en `events.ts` es el punto de enganche cuando lo quieras.
- **No hay repetición** de eventos ni subtareas. Ninguna de las dos cabe sin
  rediseñar la lista.
- **No hay arrastrar para reordenar** to-dos: el orden es la fecha y luego el
  orden de creación (`sortOrder`).

El detalle visual completo (medidas, colores, copys) está en
`../design_handoff_todo_calendar/README.md`, secciones 2, 3 y 5, y el prototipo
navegable en `Time Tracker.dc.html` de esa misma carpeta.

# Finanzas Familiares — especificación de la app

Este documento es el brief para Claude Code. Contiene el qué, no el cómo: Claude Code decide la
implementación dentro de las restricciones del stack.

---

## 1. Contexto

Dos personas (Rocha y Lalo) administran una cuenta común. Todos los ingresos entran ahí: sueldos,
arriendos de dos departamentos e ingresos ocasionales. Desde esa cuenta se paga todo, incluida
una asignación personal mensual para cada uno.

Hoy el registro vive en un Excel de 481 movimientos (enero–agosto 2026) que se migra a esta app.
El modelo de datos ya está definido y validado: **no rediseñarlo**.

## 2. Objetivo

Una app móvil, usable por los dos al mismo tiempo, que reemplace el Excel. Prioridad absoluta:
**registrar un gasto tiene que tomar menos de 10 segundos desde el teléfono.** Todo lo demás es
secundario.

## 3. Stack obligatorio

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | PWA instalable, sin app store |
| Backend / DB | Supabase (Postgres + Auth + Realtime) | Sincronización entre los dos, gratis en este volumen |
| Deploy | Vercel | Deploy automático desde GitHub |
| Gráficos | Recharts | |

Requisitos no negociables:
- **PWA**: manifest, service worker, instalable en iOS y Android desde el navegador.
- **Realtime**: si uno registra un gasto, el otro lo ve sin recargar (suscripción de Supabase).
- **Offline básico**: si no hay señal, el movimiento se guarda local y se sincroniza al volver.
- **Montos en pesos chilenos enteros**, sin decimales, formato `$1.234.567`.
- Todo en español, sin tildes en los identificadores de base de datos.

## 4. Modelo de datos

Está en `01_schema.sql`. Ejecutarlo tal cual en Supabase. Conceptos que hay que respetar:

**TIPO_FLUJO.** Cada movimiento es INGRESO, GASTO o TRANSFERENCIA. Aportar al ahorro, retirar del
ahorro, pagar la tarjeta y recibir una garantía de arriendo son TRANSFERENCIAS: mueven plata entre
bolsillos propios y **no deben sumar ni en ingresos ni en gastos** en ningún reporte.

**RECURRENCIA.** RECURRENTE (pasa todos los meses) vs EXTRAORDINARIO (bono, venta, viaje). Todos
los indicadores de salud financiera se calculan sobre lo recurrente. Un mes con bono no puede
verse como un mes bueno.

**Reembolsos.** Cuando alguien devuelve plata de un gasto compartido, se registra como GASTO con
monto negativo en la categoría original. Nunca como ingreso.

**Dos fechas por movimiento** (ver sección 5).

## 5. Tarjeta de crédito — la parte crítica

Este es el requisito que más cuidado necesita. El gasto ocurre en una fecha y la plata sale del
banco en otra.

Cada movimiento tiene:
- `fecha_compra`: cuándo se gastó. **Manda para el presupuesto.**
- `fecha_caja`: cuándo salió del banco. **Manda para la conciliación bancaria.**

Reglas:

1. Débito o efectivo → `fecha_caja = fecha_compra`, `estado = PAGADO`. Nada más que hacer.
2. Tarjeta de crédito → `estado = PENDIENTE`, `fecha_caja = null`, se asocia al ciclo abierto de
   esa tarjeta.
3. Cuando se paga el estado de cuenta:
   - Se crea **un** movimiento TRANSFERENCIA categoría "Pago tarjeta credito" por el monto pagado.
   - Todos los movimientos del ciclo pasan a `PAGADO` con `fecha_caja` = fecha del pago.
   - El ciclo se marca cerrado con su total facturado y total pagado.
4. **El pago de la tarjeta nunca es un gasto.** El gasto ya se contó al comprar. Contarlo dos veces
   es el error que este modelo existe para evitar.

La app debe mostrar en todo momento, visible desde el inicio: **cuánto se debe de tarjeta hoy**
(suma de movimientos PENDIENTE), separado por tarjeta, y cuándo vence.

Si el total facturado del ciclo no calza con la suma de los movimientos PENDIENTE, la app avisa la
diferencia y ofrece crear un movimiento de ajuste. Eso significa que hay compras sin registrar.

## 6. Pantallas

### 6.1 Registrar (pantalla de inicio)
Lo primero que se ve al abrir. Un solo scroll, sin navegación previa.
- Monto: teclado numérico grande, foco automático.
- Categoría: **máximo 2 taps**. Primero un chip de tipo (Gasto / Ingreso / Transferencia), luego
  las categorías de ese tipo ordenadas por frecuencia de uso, con buscador. Las 6 más usadas
  arriba, siempre visibles.
- Medio de pago: 3 botones grandes (Débito, Crédito, Efectivo). Si es Crédito y hay más de una
  tarjeta, elegir cuál.
- Fecha: hoy por defecto, editable con un tap.
- Comentario: opcional, una línea.
- Botón guardar. Confirmación breve y el formulario vuelve a quedar limpio.

Lo que NO va en esta pantalla: persona, propiedad, fondo, recurrencia. Se infieren o se editan
después. Cada campo extra mata la adopción.

### 6.2 Mes
- Los 6 indicadores: ingreso recurrente, ingreso extraordinario, gasto total, resultado del mes,
  tasa de ahorro recurrente, fijos+deudas sobre ingreso.
- Gráfico de cascada del flujo del mes: ingreso recurrente → extraordinario → fijos → deudas →
  asignación personal → variables → fondos → resultado. Azul los ingresos, naranjo las salidas,
  gris el resultado. Este gráfico es importante para el usuario, cuidarlo.
- Lista de categorías con el semáforo del presupuesto.

### 6.3 Presupuesto
- Cada categoría con tope FIJO (monto en pesos) o PORCENTAJE (del ingreso recurrente del mes).
- Los topes por porcentaje se recalculan solos: si el mes viene flaco, el tope baja.
- Semáforo: verde bajo 80%, ámbar entre 80% y 100%, rojo sobre 100%.
- Arriba: ahorro proyectado del mes = ingreso recurrente − suma de topes. En rojo si es negativo.
- Al inicio de cada mes, copiar los topes del mes anterior con un botón.

### 6.4 Historial
- Lista filtrable por mes, categoría, persona, medio de pago y estado.
- Editar y borrar. Todo cambio queda registrado (quién y cuándo).

### 6.5 Análisis
- Por categoría: promedio, últimos 3 meses vs 3 anteriores, variación, tendencia.
- Caja neta de los departamentos: arriendos recibidos − cuotas − contribuciones.
- Evolución de ingreso recurrente vs gasto total.

## 7. Automatizaciones (en este orden)

1. **Gastos fijos recurrentes.** El día 1 se crean como borrador los movimientos fijos del mes
   (arriendo, gastos comunes, cuotas, seguros, internet) con el monto del mes anterior. El usuario
   solo confirma o corrige el monto.
2. **Alerta de presupuesto.** Notificación push cuando una categoría cruza el 80% y cuando cruza el
   100%. Una sola vez por categoría por mes, no repetir.
3. **Recordatorio de tarjeta.** Aviso 3 días antes del vencimiento con el monto pendiente.
4. **Importar cartola.** Subir el archivo del banco (CSV o XLSX), la app sugiere qué movimientos
   faltan comparando contra lo registrado, y el usuario acepta uno por uno. Nunca importar
   automático sin revisión.
5. **Lectura de correos del banco.** Ver sección 8. Va al final a propósito.

## 8. Correos del banco

Los bancos chilenos envían avisos por correo. Ejemplo real de Banco Falabella, "Aviso de pago de
tarjeta de crédito": tarjeta CMR Mastercard Elite terminada en 1149, monto pagado $36.103, medio de
pago cuenta corriente, fecha 05/08/2026, número de operación 246109306839.

Ese correo específico sirve para **cerrar un ciclo de tarjeta**, no para registrar compras. Los
avisos de compra son otro correo distinto y hay que capturar un ejemplo de cada banco antes de
escribir el parser.

Implementación cuando llegue el momento:
- Crear un alias de correo dedicado y reenviar ahí los avisos con una regla de Gmail.
- Un job leyendo ese buzón crea movimientos con `origen = 'CORREO'` y `estado = 'POR_CONFIRMAR'`.
- El número de operación va en `id_externo`, que tiene índice único: eso evita duplicados.
- **Nunca** insertar directo al historial sin confirmación del usuario.

## 9. Datos iniciales

- `02_categorias.csv` → tabla `categorias`. El campo `orden` viene calculado por frecuencia real de
  uso; el selector debe respetarlo.
- `03_movimientos.csv` → tabla `movimientos`. 481 registros ya clasificados. La columna `cuenta`
  trae "Cuenta Corriente" o "Tarjeta Credito": hay que crear esas dos cuentas primero y mapear.
  31 movimientos vienen en estado PENDIENTE.

Cuentas a crear: Cuenta Corriente (CORRIENTE) y Tarjeta Credito (TARJETA_CREDITO, últimos4 1149,
banco Falabella). Personas: Rocha y Lalo.

## 10. Criterios de aceptación

- [ ] Registrar un gasto con débito toma 3 taps y menos de 10 segundos en un teléfono.
- [ ] Un gasto con crédito queda PENDIENTE y aparece en la deuda de tarjeta.
- [ ] Pagar la tarjeta cierra el ciclo, marca los movimientos como pagados y **no** aumenta el gasto
      del mes.
- [ ] Los 481 movimientos migrados dan exactamente los mismos totales mensuales que el Excel v5.
- [ ] Un movimiento creado en un teléfono aparece en el otro en menos de 5 segundos.
- [ ] La app funciona instalada desde la pantalla de inicio, sin barra del navegador.
- [ ] Las transferencias no suman en ingresos ni en gastos en ninguna pantalla.

## 11. Fuera de alcance por ahora

Multi-moneda, gestión de la inversión común, adjuntar boletas, exportar a SII, presupuestos
compartidos con terceros, modo oscuro.

# Finanzas Familiares

App para registrar los movimientos de la cuenta familiar. Ver `00_ESPECIFICACION_APP.md` para el
detalle completo.

## Puesta en marcha

1. **Corre `02_actualizacion_inversion.sql` una vez en Supabase (SQL Editor)** si todavia no lo
   corriste: agrupa categorias de gasto, desactiva algunas, agrega la seccion Inversion y marca
   que categorias se pueden presupuestar. No borra ni modifica movimientos existentes.
2. **Corre `07_fondos_dinamicos_y_arrastre.sql` una vez en Supabase** (requiere el 06): permite
   crear y eliminar fondos desde la app, y guarda desde que mes el saldo de cada mes pasa al
   siguiente (por defecto septiembre 2026 partiendo en $0; se ajusta en la pestana Mes).
3. **Corre `08_portafolio_inversion.sql`** (requiere el 07): convierte la inversion en un portafolio
   de activos con cuotas para Rocha y Lalo, y pasa "Bajo Lalo" a Fondos.
4. **Corre `09_cuentas_personales.sql`** (Rocha tiene que haber entrado a la app antes): crea las
   cuentas personales de Rocha, visibles solo para ella.
5. Copia `.env.example` a `.env.local` y completa las credenciales de tu proyecto Supabase
   (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`). No subas `.env.local` al repositorio.
6. Instala dependencias: `npm install`
7. Levanta el servidor de desarrollo: `npm run dev`
8. Abre `http://localhost:3000`

La base de datos (esquema, categorias y movimientos) ya existe en Supabase — este proyecto solo la
lee y escribe. Los cambios de estructura (como `02_actualizacion_inversion.sql`) se entregan como
script para correr manualmente, nunca se ejecutan automaticamente desde la app.

## Estado actual

Las 6 pantallas principales estan implementadas: Registrar, Mes, Presupuesto, Historial, Analisis
e Inversion, con navegacion inferior entre ellas.

**Inversion** es un portafolio de activos (fondo del banco, terreno, prestamo, deposito...), todo como
una bolsa comun de Rocha y Lalo llevada con cuotas (como un fondo mutuo):
- Aportes (Registrar → Transferencia → Aporte a inversion → elegir activo): compran cuotas segun
  los sueldos del mes.
- Actualizar valor: registra lo que dice la cartola o tasacion; la diferencia es ganancia o
  perdida y sube o baja el valor de la cuota.
- Traspasos entre activos: no cambian el total ni las cuotas.
- Retiros a la cuenta comun: venden cuotas de cada uno segun su %.

**Fondos** (Vacaciones, Casa, Bajo Lalo...) se crean y eliminan desde la app.

**Cuentas personales** (menu → seccion con el nombre de la persona): Registrar, Mes e Historial
simples, visibles solo para su dueña. La asignacion personal registrada en la cuenta familiar
aparece sola como ingreso.

Automatizaciones (gastos fijos recurrentes, alertas de presupuesto, recordatorio de tarjeta,
importar cartola, lectura de correos del banco) y el cierre de ciclos de tarjeta quedan para
entregas futuras.

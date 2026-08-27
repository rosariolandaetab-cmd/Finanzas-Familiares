export type TipoFlujo = "INGRESO" | "GASTO" | "TRANSFERENCIA";
export type TipoCuenta = "CORRIENTE" | "TARJETA_CREDITO" | "EFECTIVO" | "INVERSION";
export type EstadoMov = "PENDIENTE" | "PAGADO";
export type Recurrencia = "RECURRENTE" | "EXTRAORDINARIO" | "TRANSFERENCIA";
export type TipoTope = "FIJO" | "PORCENTAJE";

export type Categoria = {
  id: number;
  codigo: string;
  tipo: TipoFlujo;
  grupo: string;
  nombre: string;
  orden: number;
  activa: boolean;
};

export type Cuenta = {
  id: number;
  nombre: string;
  tipo: TipoCuenta;
  banco: string | null;
  ultimos4: string | null;
  dia_facturacion: number | null;
  dia_vencimiento: number | null;
  cuenta_pago_id: number | null;
  activa: boolean;
};

export type Persona = {
  id: number;
  nombre: string;
  auth_uid: string | null;
  activa: boolean;
};

export type Propiedad = {
  id: number;
  nombre: string;
  activa: boolean;
};

export type Movimiento = {
  id: string;
  fecha_compra: string;
  fecha_caja: string | null;
  categoria_id: number;
  monto: number;
  cuenta_id: number;
  estado: EstadoMov;
  recurrencia: Recurrencia;
  persona_id: number | null;
  propiedad_id: number | null;
  fondo_id: number | null;
  ciclo_id: number | null;
  comentario: string | null;
  origen: string;
  id_externo: string | null;
  creado_por: number | null;
  creado_en: string;
  actualizado_en: string;
};

export type MovimientoInsert = {
  fecha_compra: string;
  fecha_caja: string | null;
  categoria_id: number;
  monto: number;
  cuenta_id: number;
  estado: EstadoMov;
  comentario: string | null;
  origen: string;
  creado_por: number | null;
};

export type MovimientoUpdate = {
  fecha_compra: string;
  fecha_caja: string | null;
  categoria_id: number;
  monto: number;
  cuenta_id: number;
  estado: EstadoMov;
  comentario: string | null;
  actualizado_en: string;
};

// vista v_movimientos: movimientos + campos calculados
export type VMovimiento = Movimiento & {
  periodo_devengado: string;
  periodo_caja: string | null;
  categoria: string;
  grupo: string;
  tipo_flujo: TipoFlujo;
};

// vista v_resumen_mensual
export type VResumenMensual = {
  periodo: string;
  ingreso_recurrente: number;
  ingreso_extraordinario: number;
  fijos: number;
  deudas: number;
  asignacion_personal: number;
  variables: number;
  fondos: number;
  gasto_total: number;
};

export type Presupuesto = {
  id: number;
  periodo: string;
  categoria_id: number;
  tipo: TipoTope;
  valor: number;
};

export type PresupuestoInsert = {
  periodo: string;
  categoria_id: number;
  tipo: TipoTope;
  valor: number;
};

// vista v_presupuesto_mes
export type VPresupuestoMes = {
  periodo: string;
  categoria: string;
  tipo: TipoTope;
  valor: number;
  tope: number;
  gastado: number;
};

// vista v_deuda_tarjeta
export type VDeudaTarjeta = {
  tarjeta: string;
  compras: number;
  total_pendiente: number;
};

export type Database = {
  public: {
    Tables: {
      categorias: {
        Row: Categoria;
        Insert: Partial<Categoria>;
        Update: Partial<Categoria>;
        Relationships: [];
      };
      cuentas: {
        Row: Cuenta;
        Insert: Partial<Cuenta>;
        Update: Partial<Cuenta>;
        Relationships: [];
      };
      personas: {
        Row: Persona;
        Insert: Partial<Persona>;
        Update: Partial<Persona>;
        Relationships: [];
      };
      propiedades: {
        Row: Propiedad;
        Insert: Partial<Propiedad>;
        Update: Partial<Propiedad>;
        Relationships: [];
      };
      movimientos: {
        Row: Movimiento;
        Insert: MovimientoInsert;
        Update: Partial<MovimientoUpdate>;
        Relationships: [];
      };
      presupuestos: {
        Row: Presupuesto;
        Insert: PresupuestoInsert;
        Update: Partial<PresupuestoInsert>;
        Relationships: [];
      };
    };
    Views: {
      v_movimientos: {
        Row: VMovimiento;
        Relationships: [];
      };
      v_resumen_mensual: {
        Row: VResumenMensual;
        Relationships: [];
      };
      v_presupuesto_mes: {
        Row: VPresupuestoMes;
        Relationships: [];
      };
      v_deuda_tarjeta: {
        Row: VDeudaTarjeta;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
};

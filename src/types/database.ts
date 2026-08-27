export type TipoFlujo = "INGRESO" | "GASTO" | "TRANSFERENCIA";
export type TipoCuenta = "CORRIENTE" | "TARJETA_CREDITO" | "EFECTIVO" | "INVERSION";
export type EstadoMov = "PENDIENTE" | "PAGADO";
export type Recurrencia = "RECURRENTE" | "EXTRAORDINARIO" | "TRANSFERENCIA";

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
      movimientos: {
        Row: Movimiento;
        Insert: MovimientoInsert;
        Update: Partial<MovimientoInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};

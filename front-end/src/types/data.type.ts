export interface APIResponse {
  info_notificaciones_receptor: InfoNotificacion[];
  cuadernos: Record<string, Cuaderno>;
}

export interface Cuaderno {
  historiaCiv: HistoriaCivil[];
  litigantesCiv: LitigantesCivil[];
  notificacionesCiv: NotificacionCivil[];
  escritosCiv: EscritoCivil[];
  exhortosCiv: ExhortoCivil[];
}

type HistoriaCivil = {
  folio: string;
  doc: Document[];
  anexo: Anexo[];
  etapa: string;
  tramite: string;
  desc_tramite: string;
  fec_tramite: string;
  foja: string;
  georref: string;
};

type LitigantesCivil = {
  participante: string;
  rut: string;
  persona: string;
  nombre_o_razon_social: string;
};

type NotificacionCivil = {
  rol: string;
  est_notif: string;
  tipo_notif: string;
  fecha_tramite: string;
  tipo_parte: string;
  nombre: string;
  tramite: string;
  obs_fallida: string;
};

type EscritoCivil = {
  doc: Document[];
  anexo: Anexo[];
  fecha_de_ingreso: string;
  tipo_escrito: string;
  solicitante: string;
};

type ExhortoCivil = {
  rol_origen: string;
  tipo_exhorto: string;
  rol_destino: string;
  fecha_ordena_exhorto: string;
  fecha_recepcion_exhorto: string;
  tribunal_destino: string;
  estado_exhorto: string;
};

export type Document = {
  name: string;
  url: string;
  type?: string;
  requireSession?: boolean;
};

export type Anexo = {
  doc: Document[];
  fecha: string;
  referencia: string;
};

export interface InfoNotificacion {
  cuaderno: string;
  datos_del_retiro: string;
  fecha_retiro: string;
  estado: string;
}

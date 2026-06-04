export type UserRole = 'vereador' | 'chefe_de_gabinete' | 'acessor' | 'lider';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  is_blocked: boolean;
  is_deleted?: boolean;
  created_at: string;
}

export interface Registration {
  id: string;
  nome_completo: string;
  cep: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  dataNascimento?: string;
  sexo: 'M' | 'F' | 'Prefiro não dizer';
  estado_civil?: string;
  nome_conjuge?: string;
  quantidade_filhos?: number;
  assunto?: string;
  responsavel: string;
  email?: string;
  instagram?: string;
  whatsapp?: string;
  lembrete_contato_ativo: boolean;
  intervalo_contato_dias: number;
  data_proximo_contato?: string;
  possuiFilhos?: boolean;
  filhos?: {
    nome: string;
    dataNascimento: string;
    sexo: 'M' | 'F' | 'Prefiro não dizer';
  }[];
  created_at: string;
  created_by?: string;
  atualizado_por?: string;
  updated_at?: string;
  demands?: Demand[];
}

export interface Demand {
  id: string;
  assunto: string;
  data_pedido: string;
  atendido: boolean;
  data_atendimento?: string;
  prazo_retorno_dias: number;
  data_prevista_retorno?: string;
  retorno_realizado: boolean;
  observacoes?: string;
  google_event_id?: string;
  files?: DemandFile[];
}

export interface DemandFile {
  id: string;
  name: string;
  type: string;
  size: number;
  data: string; // Base64 data URL
  uploaded_at: string;
}

export interface ViaCEPResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
  erro?: boolean;
}

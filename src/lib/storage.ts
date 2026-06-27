import { Registration } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';

const STORAGE_KEY = 'datalink_registrations';

const MOCK_DATA: Registration[] = [
  {
    id: '1',
    nome_completo: 'João da Silva Sauro',
    cep: '01001-000',
    logradouro: 'Praça da Sé',
    numero: '100',
    complemento: '',
    bairro: 'Sé',
    cidade: 'São Paulo',
    estado: 'SP',
    dataNascimento: '1990-05-15',
    sexo: 'M',
    estado_civil: 'Casado(a)',
    nome_conjuge: 'Maria Sauro',
    quantidade_filhos: 1,
    assunto: 'Suporte',
    responsavel: 'João Silva',
    email: 'joao@example.com',
    instagram: '@joao_silva',
    lembrete_contato_ativo: true,
    intervalo_contato_dias: 30,
    possuiFilhos: true,
    filhos: [
      { nome: 'Joãozinho', dataNascimento: '2019-05-15', sexo: 'M' }
    ],
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    nome_completo: 'Maria dos Santos Rio',
    cep: '20040-002',
    logradouro: 'Avenida Rio Branco',
    numero: '50',
    complemento: 'Sala 201',
    bairro: 'Centro',
    cidade: 'Rio de Janeiro',
    estado: 'RJ',
    dataNascimento: '1985-11-20',
    sexo: 'F',
    estado_civil: 'Solteiro(a)',
    quantidade_filhos: 0,
    assunto: 'Atendimento',
    responsavel: 'Maria Santos',
    email: 'maria@example.com',
    instagram: '@maria_rio',
    lembrete_contato_ativo: false,
    intervalo_contato_dias: 30,
    possuiFilhos: false,
    created_at: new Date().toISOString(),
  }
];

const safeLocalStorageSetItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (error: any) {
    if (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      throw new Error('Limite de armazenamento local do navegador excedido. Como você está anexando arquivos maiores, é altamente recomendado configurar a sincronização do Supabase ou remover anexos antigos para liberar espaço.');
    }
    throw error;
  }
};

export const getLocalRegistrations = (): Registration[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    safeLocalStorageSetItem(STORAGE_KEY, JSON.stringify(MOCK_DATA));
    return MOCK_DATA;
  }
  return JSON.parse(stored);
};

export const getRegistrations = async (): Promise<Registration[]> => {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Tentar buscar da tabela demandas separada para garantir a consistência relacional
      try {
        const { data: demandsData, error: demandsError } = await supabase
          .from('demands')
          .select('*');

        if (!demandsError && demandsData) {
          const demandsByRegId = demandsData.reduce((acc: any, demand: any) => {
            const regId = demand.registration_id;
            if (!acc[regId]) acc[regId] = [];
            acc[regId].push({
              id: demand.id,
              assunto: demand.assunto,
              data_pedido: demand.data_pedido,
              atendido: demand.atendido,
              data_atendimento: demand.data_atendimento,
              prazo_retorno_dias: demand.prazo_retorno_dias,
              data_prevista_retorno: demand.data_prevista_retorno,
              retorno_realizado: demand.retorno_realizado,
              observacoes: demand.observacoes,
              google_event_id: demand.google_event_id,
              files: demand.files || []
            });
            return acc;
          }, {});

          return (data || []).map((reg: any) => ({
            ...reg,
            demands: demandsByRegId[reg.id] || reg.demands || []
          }));
        }
      } catch (err) {
        console.warn('Could not load separate demands table, falling back to JSON format:', err);
      }

      return data || [];
    } catch (error) {
      console.error('Supabase error, falling back to local storage:', error);
      // We still fall back to local storage for the data, but we rethrow 
      // so the UI can notify the user that sync failed
      throw error;
    }
  }
  
  return getLocalRegistrations();
};

export const saveRegistration = async (registration: Registration) => {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('registrations')
        .upsert(registration);

      if (error) {
        // Se o erro for de coluna faltante (PGRST204 ou similar)
        if (error.code === 'PGRST204' || error.message?.includes('column')) {
            console.warn('Campo faltante no Supabase, tentando salvar localmente...', error.message);
        }
        throw error;
      }

      // Sincronizar com a tabela de demandas (demands) relacional se disponível
      if (registration.demands && Array.isArray(registration.demands)) {
        try {
          // 1. Obter IDs existentes no banco para este registro para deletar as removidas
          const { data: existingDemands, error: getDemandsErr } = await supabase
            .from('demands')
            .select('id')
            .eq('registration_id', registration.id);

          if (!getDemandsErr && existingDemands) {
            const currentDemandIds = registration.demands.map(d => d.id);
            const demandsToDelete = existingDemands
              .filter(d => !currentDemandIds.includes(d.id))
              .map(d => d.id);

            if (demandsToDelete.length > 0) {
              await supabase
                .from('demands')
                .delete()
                .in('id', demandsToDelete);
            }
          }

          // 2. Inserir ou Atualizar as demandas atuais
          for (const demand of registration.demands) {
            const demandToInsert = {
              id: demand.id,
              registration_id: registration.id,
              assunto: demand.assunto,
              data_pedido: demand.data_pedido,
              atendido: demand.atendido,
              data_atendimento: demand.data_atendimento || null,
              prazo_retorno_dias: demand.prazo_retorno_dias || 0,
              data_prevista_retorno: demand.data_prevista_retorno || null,
              retorno_realizado: demand.retorno_realizado || false,
              observacoes: demand.observacoes || '',
              google_event_id: demand.google_event_id || null,
              files: demand.files || []
            };

            await supabase
              .from('demands')
              .upsert(demandToInsert);
          }
        } catch (demandErr) {
          console.warn('Error syncing to separate demands table, data is still saved in registrations JSON:', demandErr);
        }
      }

      return;
    } catch (error: any) {
      console.error('Supabase error, saving locally:', error);
      // We still save locally even if Supabase fails
      const registrations = getLocalRegistrations();
      const index = registrations.findIndex(r => r.id === registration.id);
      
      if (index !== -1) {
        registrations[index] = registration;
      } else {
        registrations.unshift(registration);
      }
      
      safeLocalStorageSetItem(STORAGE_KEY, JSON.stringify(registrations));
      
      // Rethrow to notify the UI of the sync failure
      throw error;
    }
  }

  const registrations = getLocalRegistrations();
  const index = registrations.findIndex(r => r.id === registration.id);
  
  if (index !== -1) {
    registrations[index] = registration;
  } else {
    registrations.unshift(registration);
  }
  
  safeLocalStorageSetItem(STORAGE_KEY, JSON.stringify(registrations));
};

export const deleteRegistration = async (id: string) => {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return;
    } catch (error) {
      console.error('Supabase error, deleting locally:', error);
      // We only save locally if it's not a server record or if sync is broken
      // But technically the local storage might be out of sync.
      // For deletion, we rethrow so the UI knows.
      throw error;
    }
  }

  const registrations = getLocalRegistrations();
  const filtered = registrations.filter(r => r.id !== id);
  safeLocalStorageSetItem(STORAGE_KEY, JSON.stringify(filtered));
};

export const calculateAge = (birthDate: string): number => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

export const getAgeRange = (age: number): string => {
  if (age < 18) return '0-17';
  if (age <= 30) return '18-30';
  if (age <= 45) return '31-45';
  if (age <= 60) return '46-60';
  return '60+';
};

import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Registration, ViaCEPResponse } from '@/src/types';
import { saveRegistration } from '@/src/lib/storage';
import { toast } from 'sonner';
import { Search, Loader2, Plus, Trash2, PlusCircle, Users, Database } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { googleCalendarService } from '@/src/services/googleCalendarService';
import { Calendar } from 'lucide-react';

const formSchema = z.object({
  nome_completo: z.string().min(3, 'Por favor, escreva o nome completo do eleitor para que possamos identificá-lo melhor'),
  cep: z.string().min(8, 'O CEP precisa de 8 números').max(9, 'O formato do CEP não parece correto'),
  logradouro: z.string().min(1, 'Não esqueça de informar o nome da rua ou avenida'),
  numero: z.string().min(1, 'Precisamos do número da residência para completar o endereço'),
  complemento: z.string().optional(),
  bairro: z.string().min(1, 'Por favor, nos diga qual é o bairro'),
  cidade: z.string().min(1, 'A cidade é um campo muito importante'),
  estado: z.string().min(2, 'Informe a sigla do estado (ex: SP)'),
  dataNascimento: z.string().min(1, 'A data de nascimento nos ajuda a conhecer melhor o perfil do eleitor'),
  sexo: z.string().min(1, 'Por favor, selecione o sexo do eleitor').refine(val => ['M', 'F', 'Prefiro não dizer'].includes(val), { message: 'Opção de sexo inválida' }),
  estado_civil: z.string().min(1, 'Por favor, selecione uma opção de estado civil'),
  nome_conjuge: z.string().optional(),
  quantidade_filhos: z.number().int().min(0),
  responsavel: z.string().min(1, 'O nome da pessoa que está cadastrando é essencial'),
  email: z.string().email('Este e-mail não parece estar em um formato válido').optional().or(z.literal('')),
  instagram: z.string().optional().or(z.literal('')),
  whatsapp: z.string().min(14, 'Por favor, informe o WhatsApp completo com DDD (ex: (11) 99999-9999)'),
  lembrete_contato_ativo: z.boolean(),
  intervalo_contato_dias: z.number().int().min(1),
  possuiFilhos: z.boolean(),
  filhos: z.array(z.object({
    nome: z.string().min(1, 'É carinhoso informar o nome do filho'),
    dataNascimento: z.string().min(1, 'A data de nascimento do filho ajuda no acompanhamento'),
    sexo: z.enum(['M', 'F', 'Prefiro não dizer'])
  })).optional(),
  demands: z.array(z.object({
    id: z.string().optional(),
    assunto: z.string().min(1, 'Descreva brevemente o que o eleitor solicitou'),
    data_pedido: z.string().min(1, 'Informe quando este pedido foi recebido'),
    atendido: z.boolean(),
    data_atendimento: z.string().optional(),
    prazo_retorno_dias: z.number().min(0),
    retorno_realizado: z.boolean(),
    observacoes: z.string().optional()
  })).optional()
});

type FormValues = z.infer<typeof formSchema>;

// Função para garantir que campos nulos do banco sejam transformados em strings vazias para o formulário
const sanitizeForForm = (data: Registration | undefined): Partial<FormValues> | undefined => {
  if (!data) return undefined;
  
  return {
    ...data,
    nome_completo: data.nome_completo || '',
    cep: data.cep || '',
    logradouro: data.logradouro || '',
    numero: data.numero || '',
    complemento: data.complemento || '',
    bairro: data.bairro || '',
    cidade: data.cidade || '',
    estado: data.estado || '',
    dataNascimento: data.dataNascimento || '',
    sexo: (data.sexo === 'M' || data.sexo === 'F' || data.sexo === 'Prefiro não dizer') ? data.sexo : '',
    estado_civil: data.estado_civil || '',
    nome_conjuge: data.nome_conjuge || '',
    responsavel: data.responsavel || '',
    email: data.email || '',
    instagram: data.instagram || '',
    whatsapp: data.whatsapp || '',
    lembrete_contato_ativo: data.lembrete_contato_ativo ?? true,
    intervalo_contato_dias: data.intervalo_contato_dias ?? 30,
    possuiFilhos: data.possuiFilhos ?? (data.filhos && data.filhos.length > 0) ?? false,
    filhos: (data.filhos || []).map(f => ({
      nome: f.nome || '',
      dataNascimento: f.dataNascimento || '',
      sexo: f.sexo as any
    })),
    demands: (data.demands || []).map(d => ({
      ...d,
      assunto: d.assunto || '',
      data_pedido: d.data_pedido || '',
      data_atendimento: d.data_atendimento || undefined,
      observacoes: d.observacoes || ''
    }))
  };
};

interface RegistrationFormProps {
  onSuccess: () => void;
  onCancel?: () => void;
  initialData?: Registration;
}

export function RegistrationForm({ onSuccess, onCancel, initialData }: RegistrationFormProps) {
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [syncWithGoogle, setSyncWithGoogle] = useState(true);
  const { profile, user } = useAuth();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: sanitizeForForm(initialData) || {
      nome_completo: '',
      sexo: '',
      estado_civil: '',
      nome_conjuge: '',
      quantidade_filhos: 0,
      responsavel: profile?.full_name || '',
      email: '',
      instagram: '',
      whatsapp: '',
      lembrete_contato_ativo: true,
      intervalo_contato_dias: 30,
      possuiFilhos: false,
      filhos: [],
      demands: [],
    },
  });

  useEffect(() => {
    if (initialData) {
      reset(sanitizeForForm(initialData));
    }
  }, [initialData, reset]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'filhos',
  });

  const { 
    fields: demandFields, 
    append: appendDemand, 
    remove: removeDemand 
  } = useFieldArray({
    control,
    name: 'demands',
  });

  useEffect(() => {
    setValue('quantidade_filhos', fields.length);
  }, [fields.length, setValue]);

  const possuiFilhos = watch('possuiFilhos');

  useEffect(() => {
    const name = profile?.full_name || user?.email?.split('@')[0] || '';
    if (name && !initialData) {
      setValue('responsavel', name);
    }
  }, [profile, user, setValue, initialData]);

  const whatsappValue = watch('whatsapp');
  const estadoCivilValue = watch('estado_civil');

  useEffect(() => {
    if (estadoCivilValue !== 'Casado(a)' && estadoCivilValue !== 'União Estável') {
      setValue('nome_conjuge', '');
    }
  }, [estadoCivilValue, setValue]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    if (value.length > 10) {
      value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
    } else if (value.length > 5) {
      value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
    } else if (value.length > 2) {
      value = value.replace(/^(\d{2})(\d{0,5}).*/, '($1) $2');
    } else if (value.length > 0) {
      value = value.replace(/^(\d{0,2}).*/, '($1');
    }
    
    setValue('whatsapp', value);
  };

  const cepValue = watch('cep');

  useEffect(() => {
    const searchCep = async () => {
      const cleanCep = (cepValue || '').replace(/\D/g, '');
      if (cleanCep.length === 8) {
        setIsSearchingCep(true);
        try {
          const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
          const data: ViaCEPResponse = await response.json();
          
          if (data.erro) {
            toast.error('CEP não encontrado');
            return;
          }

          setValue('logradouro', data.logradouro);
          setValue('bairro', data.bairro);
          setValue('cidade', data.localidade);
          setValue('estado', data.uf);
          toast.success('Endereço preenchido automaticamente');
        } catch (error) {
          toast.error('Erro ao buscar CEP');
        } finally {
          setIsSearchingCep(false);
        }
      }
    };

    if ((cepValue || '').replace(/\D/g, '').length === 8) {
      searchCep();
    }
  }, [cepValue, setValue]);

  const onSubmit = async (values: FormValues) => {
    const toastId = toast.loading('Sincronizando dados com o servidor...');
    
    // Calcular data do próximo contato se estiver ativo
    let data_proximo_contato = undefined;
    if (values.lembrete_contato_ativo) {
      const proximo = new Date();
      proximo.setDate(proximo.getDate() + values.intervalo_contato_dias);
      data_proximo_contato = proximo.toISOString().split('T')[0];
    }

    const newRegistration: Registration = {
      ...values,
      sexo: values.sexo as any,
      id: initialData?.id || crypto.randomUUID(),
      created_at: initialData?.created_at || new Date().toISOString(),
      complemento: values.complemento || '',
      data_proximo_contato,
      assunto: (values.demands && values.demands.length > 0) ? values.demands[0].assunto : 'Nenhum assunto',
      atualizado_por: initialData ? (profile?.full_name || user?.email?.split('@')[0] || 'Sistema') : initialData?.atualizado_por,
      updated_at: initialData ? new Date().toISOString() : initialData?.updated_at,
      demands: (values.demands || []).map(demand => {
        // Calcular data prevista de retorno
        let data_prevista_retorno = undefined;
        const baseDate = (demand.atendido && demand.data_atendimento) ? demand.data_atendimento : demand.data_pedido;
        
        if (baseDate) {
          const date = new Date(baseDate);
          date.setDate(date.getDate() + (demand.prazo_retorno_dias || 0));
          data_prevista_retorno = date.toISOString().split('T')[0];
        }
        
        return {
          ...demand,
          id: demand.id || crypto.randomUUID(),
          data_prevista_retorno,
          retorno_realizado: demand.retorno_realizado || false
        };
      })
    };

    try {
      await saveRegistration(newRegistration);
      
      // Sincronizar com Google Agenda se solicitado ou se já existe um evento vinculado para garantir que alterações de data sejam propagadas
      if (syncWithGoogle || newRegistration.google_contact_event_id || (newRegistration.demands && newRegistration.demands.some(d => d.google_event_id))) {
        let syncedCount = 0;
        let needsUpdate = false;
        let fallbackDetected = false;

        // 1. Sync post-contact event for the elector
        if (newRegistration.lembrete_contato_ativo && newRegistration.data_proximo_contato) {
          if (syncWithGoogle || newRegistration.google_contact_event_id) {
            const contactResult = await googleCalendarService.createPostContactEvent(newRegistration, profile);
            if (contactResult.success && contactResult.data?.id) {
              newRegistration.google_contact_event_id = contactResult.data.id;
              needsUpdate = true;
              syncedCount++;
              if (contactResult.fallbackToPrimaryUsed) {
                fallbackDetected = true;
              }
            } else if (!contactResult.success) {
              console.warn('[Google Sync] Could not sync post-contact event:', contactResult.error);
            }
          }
        }

        // 2. Sync all demands for the elector
        if (newRegistration.demands && newRegistration.demands.length > 0) {
          const updatedDemands = [...newRegistration.demands];
          for (let i = 0; i < updatedDemands.length; i++) {
            const demand = updatedDemands[i];
            if (syncWithGoogle || demand.google_event_id) {
              const result = await googleCalendarService.createEvent(newRegistration, demand, profile);
              if (result.success && result.data?.id) {
                updatedDemands[i] = {
                  ...demand,
                  google_event_id: result.data.id
                };
                needsUpdate = true;
                syncedCount++;
                if (result.fallbackToPrimaryUsed) {
                  fallbackDetected = true;
                }
              } else if (!result.success) {
                toast.error(`Erro ao sincronizar demanda no Google: ${result.error}`);
                break;
              }
            }
          }
          newRegistration.demands = updatedDemands;
        }

        if (needsUpdate) {
          await saveRegistration(newRegistration);
        }

        if (syncedCount > 0) {
          toast.success(`${syncedCount} item(s) sincronizado(s) no Google Agenda (demandas e pós-contato)`);
        }

        if (fallbackDetected) {
          toast.warning(
            "📢 Agenda customizada inacessível: O Google recusou a inserção na agenda personalizada (provavelmente por falta de permissão ou ID incorreto) e salvou na sua Agenda Principal (Primary) como contingência.",
            { duration: 10000 }
          );
        }
      }

      toast.success('Cadastro finalizado com sucesso! Registro salvo no servidor.', { id: toastId });
      reset();
      onSuccess();
    } catch (error: any) {
      console.error('Error saving registration:', error);
      
      // Check for common Supabase errors
      if (error?.code === 'PGRST204' || error?.message?.includes('column')) {
        toast.warning('Sincronização Limitada', { 
          id: toastId,
          description: 'A tabela no Supabase precisa de novas colunas. Execute o arquivo "supabase_migration.sql" no painel do Supabase.',
          duration: 8000 
        });
        // We still let the user proceed if it saved locally
        reset();
        onSuccess();
      } else if (error?.code === '42P01') {
        toast.error('Erro de Servidor: Tabela não encontrada.', { 
          id: toastId,
          description: 'Certifique-se de que o database_schema.sql foi executado no Supabase.',
          duration: 6000
        });
      } else {
        toast.error('Erro ao sincronizar. Salvo apenas neste dispositivo.', { 
          id: toastId,
          description: error?.message || 'Verifique sua conexão',
          duration: 5000
        });
        // We still consider it a success if it saved locally (which saveRegistration does on throw)
        reset();
        onSuccess();
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-slate-100">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">
            {initialData ? 'Editando Registro' : 'Novo Cadastro'}
          </h3>
          <p className="text-xs text-slate-500">
            {initialData ? 'Atualize os dados e clique em salvar para sincronizar.' : 'Preencha os campos para criar um novo registro no sistema.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="text-slate-500 h-9 px-4">
              Cancelar
            </Button>
          )}
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700 h-9 px-6 flex gap-2">
            <Database className="h-4 w-4" />
            {initialData ? 'Salvar Alterações' : 'Salvar Cadastro'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="nome_completo">Nome Completo do Eleitor <span className="text-red-500 font-bold">*</span></Label>
          <Input id="nome_completo" placeholder="Digite o nome completo" {...register('nome_completo')} />
          {errors.nome_completo && <p className="text-xs text-red-500">{errors.nome_completo.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cep">CEP <span className="text-red-500 font-bold">*</span></Label>
          <div className="relative">
            <Input id="cep" placeholder="00000-000" {...register('cep')} />
            <div className="absolute right-3 top-2.5">
              {isSearchingCep ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <Search className="h-4 w-4 text-slate-400" />}
            </div>
          </div>
          {errors.cep && <p className="text-xs text-red-500">{errors.cep.message}</p>}
        </div>

        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="responsavel">Responsável pelo Cadastro</Label>
          <Input id="responsavel" placeholder="Nome do responsável" {...register('responsavel')} readOnly className="bg-slate-50 cursor-not-allowed" />
          {errors.responsavel && <p className="text-xs text-red-500">{errors.responsavel.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor="logradouro">Logradouro (Rua/Avenida) <span className="text-red-500 font-bold">*</span></Label>
          <Input id="logradouro" placeholder="Avenida Brasil" {...register('logradouro')} />
          {errors.logradouro && <p className="text-xs text-red-500">{errors.logradouro.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="numero">Número</Label>
          <Input id="numero" placeholder="123" {...register('numero')} />
          {errors.numero && <p className="text-xs text-red-500">{errors.numero.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="complemento">Complemento</Label>
          <Input id="complemento" placeholder="Apartamento, Bloco..." {...register('complemento')} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bairro">Bairro <span className="text-red-500 font-bold">*</span></Label>
          <Input id="bairro" placeholder="Centro" {...register('bairro')} />
          {errors.bairro && <p className="text-xs text-red-500">{errors.bairro.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="cidade">Cidade <span className="text-red-500 font-bold">*</span></Label>
            <Input id="cidade" placeholder="São Paulo" {...register('cidade')} />
            {errors.cidade && <p className="text-xs text-red-500">{errors.cidade.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="estado">UF</Label>
            <Input id="estado" placeholder="SP" {...register('estado')} />
            {errors.estado && <p className="text-xs text-red-500">{errors.estado.message}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dataNascimento">Data de Nascimento <span className="text-red-500 font-bold">*</span></Label>
          <Input id="dataNascimento" type="date" {...register('dataNascimento')} />
          {errors.dataNascimento && <p className="text-xs text-red-500">{errors.dataNascimento.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="sexo">Sexo <span className="text-red-500 font-bold">*</span></Label>
          <Select 
            value={watch('sexo')} 
            onValueChange={(val) => setValue('sexo', val as any)}
          >
            <SelectTrigger id="sexo" className="h-10">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="M" className="py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                  <span className="text-xs">Masculino</span>
                </div>
              </SelectItem>
              <SelectItem value="F" className="py-2">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                  <span className="text-xs">Feminino</span>
                </div>
              </SelectItem>
              <SelectItem value="Prefiro não dizer" className="py-2 text-slate-400 italic">
                <span className="text-xs">Prefiro não dizer</span>
              </SelectItem>
            </SelectContent>
          </Select>
          {errors.sexo && <p className="text-xs text-red-500">{errors.sexo.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="estado_civil">Estado Civil <span className="text-red-500 font-bold">*</span></Label>
          <Select 
            value={watch('estado_civil')} 
            onValueChange={(val) => setValue('estado_civil', val as string)}
          >
            <SelectTrigger id="estado_civil" className="h-10">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Solteiro(a)">Solteiro(a)</SelectItem>
              <SelectItem value="Casado(a)">Casado(a)</SelectItem>
              <SelectItem value="Divorciado(a)">Divorciado(a)</SelectItem>
              <SelectItem value="Viúvo(a)">Viúvo(a)</SelectItem>
              <SelectItem value="União Estável">União Estável</SelectItem>
            </SelectContent>
          </Select>
          {errors.estado_civil && <p className="text-xs text-red-500">{errors.estado_civil.message}</p>}
        </div>

        {(estadoCivilValue === 'Casado(a)' || estadoCivilValue === 'União Estável') && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-1">
            <Label htmlFor="nome_conjuge">Nome do Cônjuge/Parceiro</Label>
            <Input id="nome_conjuge" placeholder="Nome completo do parceiro" {...register('nome_conjuge')} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" placeholder="usuario@exemplo.com" {...register('email')} />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="instagram">Instagram</Label>
          <Input id="instagram" placeholder="@usuario" {...register('instagram')} />
          {errors.instagram && <p className="text-xs text-red-500">{errors.instagram.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="whatsapp">WhatsApp / Telefone <span className="text-red-500 font-bold">*</span></Label>
          <Input 
            id="whatsapp" 
            placeholder="(00) 00000-0000" 
            {...register('whatsapp')} 
            onChange={handlePhoneChange}
          />
          {errors.whatsapp && <p className="text-xs text-red-500">{errors.whatsapp.message}</p>}
        </div>
      </div>

      <div className="p-4 bg-emerald-50/50 rounded-lg border border-emerald-100 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="h-5 w-5 text-emerald-600" />
            <div className="flex flex-col">
              <Label htmlFor="lembrete_contato_ativo" className="text-sm font-semibold text-emerald-900 cursor-pointer">Lembrete de Pós-Venda / Contato Periódico</Label>
              <p className="text-[10px] text-emerald-700">Defina um prazo automático para voltar a falar com este eleitor.</p>
            </div>
          </div>
          <Checkbox 
            id="lembrete_contato_ativo" 
            checked={watch('lembrete_contato_ativo')} 
            onCheckedChange={(val) => setValue('lembrete_contato_ativo', val as boolean)}
            className="h-5 w-5 border-emerald-300 data-[state=checked]:bg-emerald-600"
          />
        </div>

        {watch('lembrete_contato_ativo') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-8 animate-in fade-in slide-in-from-top-1">
            <div className="space-y-2">
              <Label htmlFor="intervalo_contato_dias" className="text-xs font-medium text-emerald-800">Intervalo entre contatos (dias)</Label>
              <Select 
                value={(watch('intervalo_contato_dias') || 30).toString()} 
                onValueChange={(val) => setValue('intervalo_contato_dias', parseInt(val))}
              >
                <SelectTrigger id="intervalo_contato_dias" className="h-9 bg-white border-emerald-200">
                  <SelectValue placeholder="Selecione o intervalo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">A cada 7 dias (Semanal)</SelectItem>
                  <SelectItem value="15">A cada 15 dias (Quinzenal)</SelectItem>
                  <SelectItem value="30">A cada 30 dias (Mensal)</SelectItem>
                  <SelectItem value="60">A cada 60 dias (Bimestral)</SelectItem>
                  <SelectItem value="90">A cada 90 dias (Trimestral)</SelectItem>
                  <SelectItem value="180">A cada 180 dias (Semestral)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <div className="bg-emerald-100/50 p-2 rounded text-[10px] text-emerald-800 border border-emerald-200 w-full">
                <strong>Próximo contato sugerido:</strong> {(() => {
                  const d = new Date();
                  const dias = watch('intervalo_contato_dias') || 30;
                  d.setDate(d.getDate() + dias);
                  return d.toLocaleDateString('pt-BR');
                })()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Google Agenda sync block removed */}

      <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <PlusCircle className="h-4 w-4 text-blue-500" />
            Demandas / Assunto
          </h4>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={() => appendDemand({ 
              assunto: '', 
              data_pedido: new Date().toISOString().split('T')[0],
              atendido: false,
              prazo_retorno_dias: 10,
              retorno_realizado: false,
              observacoes: ''
            })}
            className="h-8 gap-1 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar Pedido
          </Button>
        </div>

        {demandFields.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">Nenhum pedido registrado para este eleitor.</p>
        ) : (
          <div className="space-y-4">
            {demandFields.map((field, index) => (
              <div key={field.id} className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">
                    Demanda {index + 1}
                  </span>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => removeDemand(index)}
                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-6 space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Assunto/Pedido</Label>
                    <Input 
                      placeholder="Ex: Troca de lâmpada, buraco na rua..." 
                      {...register(`demands.${index}.assunto` as const)} 
                      className="h-9 text-sm"
                    />
                  </div>
                  
                  <div className="md:col-span-3 space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Data do Pedido</Label>
                    <Input 
                      type="date"
                      {...register(`demands.${index}.data_pedido` as const)} 
                      className="h-9 text-sm"
                    />
                  </div>

                  <div className="md:col-span-3 space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Atendido?</Label>
                    <div className="flex items-center space-x-2 h-9">
                      <Checkbox 
                        id={`atendido-${index}`}
                        checked={watch(`demands.${index}.atendido`)}
                        onCheckedChange={(checked) => {
                          setValue(`demands.${index}.atendido`, checked as boolean);
                          if (checked) {
                            setValue(`demands.${index}.data_atendimento`, new Date().toISOString().split('T')[0]);
                          }
                        }}
                      />
                      <Label htmlFor={`atendido-${index}`} className="text-sm cursor-pointer">Sim</Label>
                    </div>
                  </div>

                  {watch(`demands.${index}.atendido`) && (
                    <>
                      <div className="md:col-span-4 space-y-1.5">
                        <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Data do Atendimento</Label>
                        <Input 
                          type="date"
                          {...register(`demands.${index}.data_atendimento` as const)} 
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="md:col-span-4 space-y-1.5">
                        <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Dias para Pós-Contato</Label>
                        <Input 
                          type="number"
                          min="0"
                          {...register(`demands.${index}.prazo_retorno_dias`, { 
                            valueAsNumber: true,
                            min: 0,
                            onChange: (e) => {
                              const val = Math.max(0, parseInt(e.target.value) || 0);
                              setValue(`demands.${index}.prazo_retorno_dias`, val);
                            }
                          })} 
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="md:col-span-4 flex items-end">
                        <div className="bg-amber-50 border border-amber-100 p-2 rounded w-full text-[10px] text-amber-700 space-y-1">
                          <p><strong>Aviso:</strong> Sistema alertará o retorno em {watch(`demands.${index}.prazo_retorno_dias`)} dias após o atendimento.</p>
                          {(() => {
                            const dataAtend = watch(`demands.${index}.data_atendimento`);
                            const prazo = watch(`demands.${index}.prazo_retorno_dias`);
                            if (dataAtend && !isNaN(prazo)) {
                              const d = new Date(dataAtend);
                              d.setDate(d.getDate() + prazo);
                              return <p className="font-bold">Data Prevista: {d.toLocaleDateString('pt-BR')}</p>;
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="md:col-span-12 space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Observações</Label>
                    <Input 
                      placeholder="Detalhes adicionais..." 
                      {...register(`demands.${index}.observacoes` as const)} 
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="possuiFilhos" 
            checked={watch('possuiFilhos')}
            onCheckedChange={(checked) => {
              setValue('possuiFilhos', checked as boolean);
              if (checked && fields.length === 0) {
                append({ nome: '', dataNascimento: '', sexo: 'M' });
              }
            }}
          />
          <Label htmlFor="possuiFilhos" className="text-sm font-medium leading-none cursor-pointer">
            Possui filhos?
          </Label>
        </div>

        {possuiFilhos && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-700">Informações dos Filhos</h4>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={() => append({ nome: '', dataNascimento: '', sexo: 'M' })}
                className="h-8 gap-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Filho
              </Button>
            </div>
            
            {fields.map((field, index) => (
              <div key={field.id} className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm relative group space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">
                    Filho {index + 1}
                  </span>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => remove(index)}
                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-6 space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Nome Completo</Label>
                    <Input 
                      placeholder="Nome do filho" 
                      {...register(`filhos.${index}.nome` as const)} 
                      className="h-9 text-sm border-slate-200 focus:border-blue-400 focus:ring-blue-100"
                    />
                    {errors.filhos?.[index]?.nome && (
                      <p className="text-[10px] text-red-500 mt-1">{errors.filhos[index]?.nome?.message}</p>
                    )}
                  </div>
                  
                  <div className="md:col-span-3 space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Nascimento</Label>
                    <Input 
                      type="date"
                      {...register(`filhos.${index}.dataNascimento` as const)} 
                      className="h-9 text-sm border-slate-200 focus:border-blue-400 focus:ring-blue-100"
                    />
                    {errors.filhos?.[index]?.dataNascimento && (
                      <p className="text-[10px] text-red-500 mt-1">{errors.filhos[index]?.dataNascimento?.message}</p>
                    )}
                  </div>

                  <div className="md:col-span-3 space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-semibold tracking-tight">Sexo</Label>
                    <div className="flex bg-slate-100 p-1 rounded-md h-9">
                      <button
                        type="button"
                        onClick={() => setValue(`filhos.${index}.sexo` as any, 'M')}
                        className={`flex-1 flex items-center justify-center rounded transition-all text-xs font-medium ${
                          watch(`filhos.${index}.sexo`) === 'M' 
                            ? 'bg-white text-blue-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        MASC
                      </button>
                      <button
                        type="button"
                        onClick={() => setValue(`filhos.${index}.sexo` as any, 'F')}
                        className={`flex-1 flex items-center justify-center rounded transition-all text-[9px] font-medium ${
                          watch(`filhos.${index}.sexo`) === 'F' 
                            ? 'bg-white text-pink-600 shadow-sm' 
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        FEM
                      </button>
                      <button
                        type="button"
                        onClick={() => setValue(`filhos.${index}.sexo` as any, 'Prefiro não dizer')}
                        className={`flex-1 flex items-center justify-center rounded transition-all text-[9px] font-medium ${
                          watch(`filhos.${index}.sexo`) === 'Prefiro não dizer' 
                            ? 'bg-white text-slate-600 shadow-sm' 
                            : 'text-slate-400 hover:text-slate-700'
                        }`}
                      >
                        OUTRO
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100 mt-4">
        <label className="flex items-center gap-2.5 cursor-pointer w-full">
          <input
            type="checkbox"
            checked={syncWithGoogle}
            onChange={(e) => setSyncWithGoogle(e.target.checked)}
            className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <div className="text-left">
            <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              Sincronizar com o Google Agenda
            </span>
            <p className="text-[10px] text-blue-700/80 leading-tight">
              Sincroniza automaticamente as demandas e o pós-contato do eleitor na agenda do gabinete.
            </p>
          </div>
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="px-8 text-slate-500">
            Cancelar
          </Button>
        )}
        <Button type="submit" size="lg" className="w-full md:w-auto px-12">
          {initialData ? 'Salvar Alterações' : 'Finalizar Cadastro'}
        </Button>
      </div>
    </form>
  );
}


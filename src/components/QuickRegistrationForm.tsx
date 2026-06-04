import React, { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Registration, ViaCEPResponse } from '@/src/types';
import { saveRegistration } from '@/src/lib/storage';
import { toast } from 'sonner';
import { Search, Loader2, Plus, Trash2, PlusCircle, Database, Phone, MessageSquare, Zap } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { googleCalendarService } from '@/src/services/googleCalendarService';

const quickFormSchema = z.object({
  nome_completo: z.string().min(3, 'Nome completo é necessário'),
  cep: z.string().min(8, 'CEP inválido').max(9, 'CEP inválido'),
  whatsapp: z.string().min(10, 'Telefone inválido'),
  demands: z.array(z.object({
    id: z.string().optional(),
    assunto: z.string().min(1, 'Informe o assunto ou demanda'),
    data_pedido: z.string().min(1, 'Informe a data'),
    atendido: z.boolean(),
    data_atendimento: z.string().optional(),
    prazo_retorno_dias: z.number().min(0),
    retorno_realizado: z.boolean(),
    observacoes: z.string().optional()
  })).min(1, 'Adicione pelo menos uma demanda')
});

type QuickFormValues = z.infer<typeof quickFormSchema>;

interface QuickRegistrationFormProps {
  onSuccess: () => void;
  onCancel?: () => void;
}

export function QuickRegistrationForm({ onSuccess, onCancel }: QuickRegistrationFormProps) {
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const { profile, user } = useAuth();
  const [addressData, setAddressData] = useState<Partial<Registration>>({});

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<QuickFormValues>({
    resolver: zodResolver(quickFormSchema),
    defaultValues: {
      nome_completo: '',
      cep: '',
      whatsapp: '',
      demands: [
        {
          assunto: '',
          data_pedido: new Date().toISOString().split('T')[0],
          atendido: false,
          prazo_retorno_dias: 10,
          retorno_realizado: false,
        }
      ],
    },
  });

  const { fields: demandFields, append: appendDemand, remove: removeDemand } = useFieldArray({
    control,
    name: 'demands',
  });

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

          setAddressData({
            logradouro: data.logradouro,
            bairro: data.bairro,
            cidade: data.localidade,
            estado: data.uf,
            numero: 'S/N', // Default for quick registration
          });
          toast.success('Endereço localizado');
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
  }, [cepValue]);

  const onSubmit = async (values: QuickFormValues) => {
    const toastId = toast.loading('Salvando registro rápido...');
    
    const newRegistration: Registration = {
      id: crypto.randomUUID(),
      nome_completo: values.nome_completo,
      cep: values.cep,
      whatsapp: values.whatsapp,
      assunto: values.demands[0].assunto,
      logradouro: addressData.logradouro || undefined,
      numero: addressData.numero || undefined,
      bairro: addressData.bairro || undefined,
      cidade: addressData.cidade || undefined,
      estado: addressData.estado || undefined,
      complemento: undefined,
      dataNascimento: undefined,
      sexo: 'Prefiro não dizer',
      estado_civil: 'Não informado',
      quantidade_filhos: 0,
      responsavel: profile?.full_name || user?.email?.split('@')[0] || 'Sistema',
      lembrete_contato_ativo: true,
      intervalo_contato_dias: 30,
      possuiFilhos: false,
      created_at: new Date().toISOString(),
      demands: values.demands.map(d => {
        let data_prevista_retorno = undefined;
        if (d.atendido && d.data_atendimento) {
          const date = new Date(d.data_atendimento);
          date.setDate(date.getDate() + d.prazo_retorno_dias);
          data_prevista_retorno = date.toISOString().split('T')[0];
        } else if (d.data_pedido && d.prazo_retorno_dias > 0) {
          // Se não atendido, calcular data prevista baseada na data do pedido
          const date = new Date(d.data_pedido);
          date.setDate(date.getDate() + d.prazo_retorno_dias);
          data_prevista_retorno = date.toISOString().split('T')[0];
        }

        return {
          ...d,
          id: d.id || crypto.randomUUID(),
          retorno_realizado: d.retorno_realizado || false,
          data_prevista_retorno
        };
      })
    };

    try {
      await saveRegistration(newRegistration);
      
      // Sincronizar automaticamente com Google Agenda
      let syncedCount = 0;
      const updatedDemands = [...newRegistration.demands];
      let needsUpdate = false;

      for (let i = 0; i < updatedDemands.length; i++) {
        const demand = updatedDemands[i];
        const result = await googleCalendarService.createEvent(newRegistration, demand, profile);
        if (result.success && result.data?.id) {
          updatedDemands[i] = {
            ...demand,
            google_event_id: result.data.id
          };
          needsUpdate = true;
          syncedCount++;
        }
      }
      
      if (needsUpdate) {
        newRegistration.demands = updatedDemands;
        await saveRegistration(newRegistration);
      }
      
      if (syncedCount > 0) {
        toast.success(`${syncedCount} demanda(s) sincronizada(s) no Google Agenda`);
      }

      toast.success('Cadastro rápido finalizado!', { id: toastId });
      reset();
      onSuccess();
    } catch (error: any) {
      console.error('Error saving quick registration:', error);
      toast.error('Erro ao salvar. Tente novamente.', { id: toastId });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-md border-2 border-blue-100">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-200">
            <Zap className="h-5 w-5 fill-current" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800">Cadastro Rápido</h3>
            <p className="text-xs text-slate-500">Preencha apenas o essencial para salvar agora.</p>
          </div>
        </div>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} className="text-slate-400 hover:text-red-500">
            Cancelar
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nome_completo" className="text-slate-700 font-bold">Nome do Eleitor</Label>
          <Input 
            id="nome_completo" 
            placeholder="Nome completo" 
            {...register('nome_completo')} 
            className="h-12 text-lg border-slate-200 focus:border-blue-500 focus:ring-blue-200"
          />
          {errors.nome_completo && <p className="text-xs text-red-500">{errors.nome_completo.message}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp" className="text-slate-700 font-bold">Contato (WhatsApp)</Label>
            <div className="relative">
              <Input 
                id="whatsapp" 
                placeholder="(00) 00000-0000" 
                {...register('whatsapp')} 
                onChange={handlePhoneChange}
                className="h-11 pl-10 border-slate-200 focus:border-blue-500"
              />
              <Phone className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
            </div>
            {errors.whatsapp && <p className="text-xs text-red-500">{errors.whatsapp.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cep" className="text-slate-700 font-bold">CEP</Label>
            <div className="relative">
              <Input 
                id="cep" 
                placeholder="00000-000" 
                {...register('cep')} 
                className="h-11 pl-10 border-slate-200 focus:border-blue-500"
              />
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <div className="absolute right-3 top-3">
                {isSearchingCep && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
              </div>
            </div>
            {addressData.bairro && (
              <p className="text-[10px] text-blue-600 font-medium">
                {addressData.bairro}, {addressData.cidade} - {addressData.estado}
              </p>
            )}
            {errors.cep && <p className="text-xs text-red-500">{errors.cep.message}</p>}
          </div>
        </div>

        <div className="space-y-4 p-4 bg-slate-50 rounded-lg border border-slate-200 mt-6">
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

          <div className="space-y-4">
            {demandFields.map((field, index) => (
              <div key={field.id} className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">
                    Demanda {index + 1}
                  </span>
                  {demandFields.length > 1 && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => removeDemand(index)}
                      className="h-7 w-7 text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase text-slate-500 font-semibold">Assunto/Pedido</Label>
                    <Input 
                      placeholder="Ex: Troca de lâmpada, buraco na rua..." 
                      {...register(`demands.${index}.assunto` as const)} 
                      className="h-9 text-sm"
                    />
                    {errors.demands?.[index]?.assunto && <p className="text-[10px] text-red-500">{errors.demands[index]?.assunto?.message}</p>}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase text-slate-500 font-semibold">Data do Pedido</Label>
                      <Input 
                        type="date"
                        {...register(`demands.${index}.data_pedido` as const)} 
                        className="h-9 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-[10px] uppercase text-slate-500 font-semibold">Atendido?</Label>
                      <div className="flex items-center space-x-2 h-9">
                        <Checkbox 
                          id={`quick-atendido-${index}`}
                          checked={watch(`demands.${index}.atendido`)}
                          onCheckedChange={(checked) => {
                            setValue(`demands.${index}.atendido`, checked as boolean);
                            if (checked) {
                              setValue(`demands.${index}.data_atendimento`, new Date().toISOString().split('T')[0]);
                            }
                          }}
                        />
                        <Label htmlFor={`quick-atendido-${index}`} className="text-sm cursor-pointer">Sim</Label>
                      </div>
                    </div>
                  </div>

                  {watch(`demands.${index}.atendido`) && (
                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-1">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase text-slate-500 font-semibold">Data Atendimento</Label>
                        <Input 
                          type="date"
                          {...register(`demands.${index}.data_atendimento` as const)} 
                          className="h-9 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] uppercase text-slate-500 font-semibold">Dias Pós-Contato</Label>
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
                    </div>
                  )}
                </div>
              </div>
            ))}
            {errors.demands?.root && <p className="text-xs text-red-500">{errors.demands.root.message}</p>}
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 flex gap-3 mt-6">
        <Database className="h-5 w-5" />
        Finalizar Cadastro Rápido
      </Button>
    </form>
  );
}

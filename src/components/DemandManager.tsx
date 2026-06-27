import React, { useState } from 'react';
import { Registration, Demand } from '../types';
import { saveRegistration } from '../lib/storage';
import { 
  Bell, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  Search, 
  User, 
  AlertCircle, 
  ArrowRight,
  Filter,
  CheckCircle,
  Edit2,
  X,
  Save,
  Trash2,
  MessageSquare,
  Loader2,
  Paperclip,
  Mail,
  Phone
} from 'lucide-react';
import { googleCalendarService } from '../services/googleCalendarService';
import { DemandFiles } from './DemandFiles';
import { useAuth } from '../contexts/AuthContext';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from './ConfirmDialog';

interface DemandManagerProps {
  registrations: Registration[];
  onRefresh: () => void;
}

interface FlattenedDemand extends Demand {
  registrationId: string;
  registrationName: string;
  registrationBairro: string;
  registrationEmail?: string;
  registrationWhatsapp?: string;
}

const formatPhoneNumber = (phone: string | undefined | null) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  }
  if (cleaned.length === 10) {
    return cleaned.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  }
  return phone;
};

export const DemandManager: React.FC<DemandManagerProps> = ({ registrations, onRefresh }) => {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'atendido' | 'retorno_pendente' | 'atrasado' | 'concluidas' | 'não_agendada'>('all');
  const [editingDemand, setEditingDemand] = useState<{regId: string, demandId: string} | null>(null);
  const [concludingDemand, setConcludingDemand] = useState<{regId: string, demandId: string} | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conclusionForm, setConclusionForm] = useState({
    data_feedback: '',
    agendarFeedback: true,
    syncGoogle: false
  });
  const [editForm, setEditForm] = useState<Demand | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: 'danger' | 'info' | 'warning';
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    variant: 'info'
  });

  // Extrair todas as demandas de todos os registros
  const allDemands: FlattenedDemand[] = registrations.flatMap(reg => 
    (reg.demands && Array.isArray(reg.demands) ? reg.demands : []).map(demand => ({
      ...demand,
      registrationId: reg.id,
      registrationName: reg.nome_completo,
      registrationBairro: reg.bairro || 'Sem Bairro',
      registrationEmail: reg.email,
      registrationWhatsapp: reg.whatsapp
    }))
  );

  const today = new Date().toISOString().split('T')[0];

  const filteredDemands = allDemands.filter(demand => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (demand.assunto?.toLowerCase() || '').includes(searchLower) || 
                         (demand.registrationName?.toLowerCase() || '').includes(searchLower) ||
                         (demand.registrationEmail?.toLowerCase() || '').includes(searchLower) ||
                         (demand.registrationWhatsapp || '').includes(searchLower);
    
    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return !demand.atendido;
    if (statusFilter === 'atendido') return demand.atendido;
    if (statusFilter === 'retorno_pendente') return demand.atendido && !demand.retorno_realizado;
    if (statusFilter === 'atrasado') return demand.atendido && !demand.retorno_realizado && demand.data_prevista_retorno! < today;
    if (statusFilter === 'concluidas') return demand.atendido && (demand.retorno_realizado || !demand.data_prevista_retorno);
    if (statusFilter === 'não_agendada') return !demand.google_event_id;
    
    return true;
  }).sort((a, b) => {
    if (a.atendido && !a.retorno_realizado && b.atendido && !b.retorno_realizado) {
        return (a.data_prevista_retorno || '') > (b.data_prevista_retorno || '') ? 1 : -1;
    }
    return 0;
  });

  const handleToggleReturn = async (regId: string, demandId: string) => {
    const registration = registrations.find(r => r.id === regId);
    if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

    const demand = registration.demands.find(d => d.id === demandId);
    if (!demand) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Confirmar Reversão',
      description: `Deseja realmente reverter o status de pós-contato desta demanda?`,
      variant: 'info',
      onConfirm: async () => {
        const updatedDemands = registration.demands!.map(d => 
          d.id === demandId ? { ...d, retorno_realizado: false } : d
        );

        try {
          await saveRegistration({ ...registration, demands: updatedDemands });
          toast.success('Pós-contato revertido!');
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          onRefresh();
        } catch (error) {
          toast.error('Erro ao atualizar status');
        }
      }
    });
  };

  const handleOpenConclude = (demand: FlattenedDemand) => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 7);
    setConclusionForm({
      data_feedback: defaultDate.toISOString().split('T')[0],
      agendarFeedback: true,
      syncGoogle: false
    });
    setConcludingDemand({ regId: demand.registrationId, demandId: demand.id });
  };

  const handleConcludeDemand = async () => {
    if (!concludingDemand) return;
    const { regId, demandId } = concludingDemand;
    
    const registration = registrations.find(r => r.id === regId);
    if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

    const today = new Date().toISOString().split('T')[0];
    const updatedDemands = registration.demands.map(d => {
      if (d.id === demandId) {
        return {
          ...d,
          atendido: true,
          data_atendimento: today,
          data_prevista_retorno: conclusionForm.agendarFeedback ? conclusionForm.data_feedback : d.data_prevista_retorno,
          retorno_realizado: false
        };
      }
      return d;
    });

    let targetDemand = updatedDemands.find(d => d.id === demandId);
    let finalDemands = updatedDemands;

    if ((conclusionForm.syncGoogle || targetDemand.google_event_id) && targetDemand) {
      try {
        setIsSyncing(true);
        const result = await googleCalendarService.createEvent(registration, targetDemand, profile);
        if (result.success && result.data?.id) {
          finalDemands = updatedDemands.map(d => 
            d.id === demandId ? { ...d, google_event_id: result.data.id } : d
          );
          toast.success('Evento sincronizado no Google Agenda!');
        } else {
          toast.error(`Erro Google: ${result.error}`);
        }
      } catch (err) {
        console.error("Error syncing demand on conclusion:", err);
      } finally {
        setIsSyncing(false);
      }
    }

    const finalRegistration = { ...registration, demands: finalDemands };

    try {
      await saveRegistration(finalRegistration);
      toast.success('Demanda concluída!');
      setConcludingDemand(null);
      onRefresh();
    } catch (error) {
      toast.error('Erro ao concluir');
    }
  };

  const handleToggleReturnManual = (demand: FlattenedDemand) => {
    const registration = registrations.find(r => r.id === demand.registrationId);
    if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Confirmar Pós-Contato',
      description: `Deseja marcar o pós-contato como ${demand.retorno_realizado ? 'pendente' : 'realizado'}?`,
      variant: 'info',
      onConfirm: async () => {
        const updatedDemands = registration.demands!.map(d => 
          d.id === demand.id ? { ...d, retorno_realizado: !d.retorno_realizado } : d
        );

        try {
          await saveRegistration({ ...registration, demands: updatedDemands });
          toast.success('Status de retorno atualizado!');
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          onRefresh();
        } catch (error) {
          toast.error('Erro ao atualizar');
        }
      }
    });
  };

  const startEdit = (demand: FlattenedDemand) => {
    setEditingDemand({ regId: demand.registrationId, demandId: demand.id });
    setEditForm({ ...demand, syncGoogle: true });
  };

  const saveEdit = async () => {
    if (!editingDemand || !editForm) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Salvar Alterações',
      description: 'Deseja salvar as alterações feitas nesta demanda?',
      variant: 'info',
      onConfirm: async () => {
        const registration = registrations.find(r => r.id === editingDemand.regId);
        if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

        const { registrationId, registrationName, registrationBairro, syncGoogle, ...cleanDemand } = editForm as any;
        let updatedDemandWithId = { ...cleanDemand };

        if (syncGoogle || cleanDemand.google_event_id) {
          try {
            setIsSyncing(true);
            const syncResult = await googleCalendarService.createEvent(registration, cleanDemand, profile);
            if (syncResult.success && syncResult.data?.id) {
              updatedDemandWithId.google_event_id = syncResult.data.id;
            }
          } catch (syncError) {
            console.error("Error updating calendar event on edit:", syncError);
            toast.error("Erro ao sincronizar com Google Agenda.");
          } finally {
            setIsSyncing(false);
          }
        }

        const updatedDemands = registration.demands.map(d => 
          d.id === editingDemand.demandId ? updatedDemandWithId : d
        );

        try {
          await saveRegistration({ ...registration, demands: updatedDemands });
          toast.success('Demanda atualizada com sucesso!');
          setEditingDemand(null);
          setEditForm(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          onRefresh();
        } catch (error) {
          toast.error('Erro ao salvar alterações');
        }
      }
    });
  };

  const deleteDemand = async (regId: string, demandId: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Excluir Demanda',
      description: 'Tem certeza que deseja excluir esta demanda definitivamente?',
      variant: 'danger',
      onConfirm: async () => {
        const registration = registrations.find(r => r.id === regId);
        if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

        const updatedDemands = registration.demands.filter(d => d.id !== demandId);

        try {
          await saveRegistration({ ...registration, demands: updatedDemands });
          toast.success('Demanda excluída');
          setEditingDemand(null);
          setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          onRefresh();
        } catch (error) {
          toast.error('Erro ao excluir');
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Bell className="h-6 w-6 text-blue-600" />
          Gerenciador de Demandas
        </h2>
        <div className="flex items-center gap-2">
           <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar pedido ou eleitor..." 
              className="pl-9 h-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filtros de Status */}
      <div className="flex flex-wrap gap-2 pb-2 overflow-x-auto">
        <Button 
          variant={statusFilter === 'all' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setStatusFilter('all')}
          className="rounded-full text-xs"
        >
          Todas ({allDemands.length})
        </Button>
        <Button 
          variant={statusFilter === 'pending' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setStatusFilter('pending')}
          className="rounded-full text-xs"
        >
          Pendentes ({allDemands.filter(d => !d.atendido).length})
        </Button>
        <Button 
          variant={statusFilter === 'retorno_pendente' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setStatusFilter('retorno_pendente')}
          className="rounded-full text-xs"
        >
          Aguardando Retorno ({allDemands.filter(d => d.atendido && !d.retorno_realizado).length})
        </Button>
        <Button 
          variant={statusFilter === 'atrasado' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setStatusFilter('atrasado')}
          className={`rounded-full text-xs font-bold transition-all ${
            statusFilter === 'atrasado' 
              ? 'bg-red-600 text-white hover:bg-red-700 shadow-sm' 
              : 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
          }`}
        >
          Vencidas ({allDemands.filter(d => d.atendido && !d.retorno_realizado && d.data_prevista_retorno! < today).length})
        </Button>
        <Button 
          variant={statusFilter === 'concluidas' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setStatusFilter('concluidas')}
          className={`rounded-full text-xs font-bold transition-all ${
            statusFilter === 'concluidas' 
              ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' 
              : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'
          }`}
        >
          Concluídas ({allDemands.filter(d => d.atendido && (d.retorno_realizado || !d.data_prevista_retorno)).length})
        </Button>
        <Button 
          variant={statusFilter === 'não_agendada' ? 'default' : 'outline'} 
          size="sm" 
          onClick={() => setStatusFilter('não_agendada')}
          className={`rounded-full text-xs font-bold transition-all ${
            statusFilter === 'não_agendada' 
              ? 'bg-amber-500 text-slate-950 hover:bg-amber-600 shadow-sm font-black' 
              : 'bg-amber-50 text-[11px] text-amber-800 border-amber-300 hover:bg-amber-100/80 animate-pulse'
          }`}
        >
          ⚠️ Sem Agenda ({allDemands.filter(d => !d.google_event_id).length})
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredDemands.length === 0 ? (
          <div className="text-center py-20 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
            <Filter className="h-12 w-12 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-500 font-medium">Nenhuma demanda encontrada com estes filtros.</p>
          </div>
        ) : (
          filteredDemands.map((demand) => {
            const isEditing = editingDemand?.demandId === demand.id;
            const isLate = demand.atendido && !demand.retorno_realizado && demand.data_prevista_retorno! < today;
            const isToday = demand.atendido && !demand.retorno_realizado && demand.data_prevista_retorno === today;
            
            return (
              <Card key={`${demand.registrationId}-${demand.id}`} className={`overflow-hidden border-l-4 transition-all ${
                demand.retorno_realizado ? 'border-l-green-500 border-slate-100 bg-slate-50/50' : 
                isLate ? 'border-l-red-500 bg-red-50 border-red-100 ring-1 ring-red-100' : 
                isToday ? 'border-l-amber-500 bg-amber-50 border-amber-100' : 
                'border-l-blue-500 bg-white'
              } ${isEditing ? 'ring-2 ring-blue-500 shadow-lg z-10 scale-[1.01]' : ''}`}>
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row">
                    {/* Lateral Informações Eleitor */}
                    <div className="p-4 md:w-64 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-2 mt-0.5">
                          <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-sm font-extrabold text-slate-800 truncate" title={demand.registrationName}>
                            {demand.registrationName}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-2 mb-3">
                           <Badge variant="secondary" className="text-[9px] px-1.5 py-0.5 font-bold">{demand.registrationBairro}</Badge>
                        </div>
                      </div>

                      <div className="space-y-2 pt-3 border-t border-slate-100/80 mt-auto">
                        {demand.registrationWhatsapp && (
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="p-1 rounded bg-green-50 text-green-600 shrink-0">
                              <MessageSquare className="h-3 w-3" />
                            </span>
                            <a 
                              href={`https://wa.me/55${demand.registrationWhatsapp.replace(/\D/g, '')}`} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="hover:underline font-semibold text-slate-700 hover:text-green-700 truncate"
                              title="Enviar mensagem no WhatsApp"
                            >
                              {formatPhoneNumber(demand.registrationWhatsapp)}
                            </a>
                          </div>
                        )}
                        {demand.registrationEmail && (
                          <div className="flex items-center gap-2 text-xs text-slate-600">
                            <span className="p-1 rounded bg-blue-50 text-blue-600 shrink-0">
                              <Mail className="h-3 w-3" />
                            </span>
                            <a 
                              href={`mailto:${demand.registrationEmail}`} 
                              className="hover:underline font-semibold text-slate-700 hover:text-blue-700 truncate"
                              title={`Enviar e-mail para ${demand.registrationEmail}`}
                            >
                              {demand.registrationEmail}
                            </a>
                          </div>
                        )}
                        {!demand.registrationWhatsapp && !demand.registrationEmail && (
                          <div className="text-[10px] text-slate-400 italic">Sem contato cadastrado</div>
                        )}
                      </div>
                    </div>
                    
                    {/* Conteúdo da Demanda / Formulário de Edição */}
                    <div className="flex-1 p-4">
                      {isEditing && editForm ? (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center mb-2">
                             <h4 className="text-xs font-bold text-blue-600 uppercase">Editando Demanda</h4>
                             <div className="flex gap-2">
                               <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteDemand(demand.registrationId, demand.id)}>
                                 <Trash2 className="h-4 w-4" />
                               </Button>
                               <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingDemand(null)}>
                                 <X className="h-4 w-4" />
                               </Button>
                             </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                            <div className="md:col-span-8 space-y-1.5">
                              <Label className="text-[10px] uppercase text-slate-500 font-bold">Assunto</Label>
                              <Input 
                                value={editForm.assunto} 
                                onChange={(e) => setEditForm({ ...editForm, assunto: e.target.value })}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="md:col-span-4 space-y-1.5">
                              <Label className="text-[10px] uppercase text-slate-500 font-bold">Data Pedido</Label>
                              <Input 
                                type="date"
                                value={editForm.data_pedido} 
                                onChange={(e) => setEditForm({ ...editForm, data_pedido: e.target.value })}
                                className="h-9 text-sm"
                              />
                            </div>
                            
                            <div className="md:col-span-4 flex items-center space-x-2 pt-2">
                              <Checkbox 
                                id="edit-atendido" 
                                checked={editForm.atendido}
                                onCheckedChange={(checked) => setEditForm({ 
                                  ...editForm, 
                                  atendido: !!checked,
                                  data_atendimento: checked ? (editForm.data_atendimento || today) : undefined
                                })}
                              />
                              <Label htmlFor="edit-atendido" className="text-xs font-bold">Já Atendido?</Label>
                            </div>

                            {editForm.atendido && (
                              <div className="md:col-span-4 space-y-1.5">
                                <Label className="text-[10px] uppercase text-slate-500 font-bold">Data Atendimento</Label>
                                <Input 
                                  type="date"
                                  value={editForm.data_atendimento || ''} 
                                  onChange={(e) => setEditForm({ ...editForm, data_atendimento: e.target.value })}
                                  className="h-9 text-sm"
                                />
                              </div>
                            )}

                            <div className="md:col-span-4 space-y-1.5">
                              <Label className="text-[10px] uppercase text-slate-500 font-bold">Prazo Retorno (Dias)</Label>
                              <Input 
                                type="number"
                                min="0"
                                value={editForm.prazo_retorno_dias || 0} 
                                onChange={(e) => {
                                  const dias = Math.max(0, parseInt(e.target.value) || 0);
                                  const baseDate = editForm.atendido ? (editForm.data_atendimento || today) : (editForm.data_pedido || today);
                                  const newDate = new Date(baseDate);
                                  newDate.setDate(newDate.getDate() + dias);
                                  let finalDate = newDate.toISOString().split('T')[0];
                                  if (finalDate < today) {
                                    finalDate = today;
                                  }
                                  setEditForm({ 
                                      ...editForm, 
                                      prazo_retorno_dias: dias,
                                      data_prevista_retorno: finalDate
                                  });
                                }}
                                className="h-9 text-sm"
                              />
                            </div>
                            <div className="md:col-span-4 space-y-1.5">
                              <Label className="text-[10px] uppercase text-slate-500 font-bold">Data Programada Retorno</Label>
                              <Input 
                                type="date"
                                value={editForm.data_prevista_retorno || ''} 
                                onChange={(e) => {
                                  const selectedDate = e.target.value;
                                  setEditForm({ 
                                    ...editForm, 
                                    data_prevista_retorno: selectedDate < today ? today : selectedDate 
                                  });
                                }}
                                className="h-9 text-sm font-bold text-blue-600"
                              />
                            </div>

                            <div className="md:col-span-12 space-y-1.5">
                              <Label className="text-[10px] uppercase text-slate-500 font-bold">Observações</Label>
                              <Input 
                                value={editForm.observacoes || ''} 
                                onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })}
                                className="h-9 text-sm"
                              />
                            </div>

                            <div className="md:col-span-12 space-y-1.5">
                              <Label className="text-[10px] uppercase text-slate-500 font-bold flex items-center gap-1">
                                <Paperclip className="h-3.5 w-3.5 text-slate-400" /> Documentos Anexados
                              </Label>
                              <DemandFiles 
                                files={editForm.files || []} 
                                onChange={(updatedFiles) => setEditForm({ ...editForm, files: updatedFiles })}
                              />
                            </div>
                          </div>
                          
                          <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" size="sm" className="h-8" onClick={() => setEditingDemand(null)}>Cancelar</Button>
                            <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 gap-1" onClick={saveEdit}>
                              <Save className="h-3.5 w-3.5" /> Salvar Alterações
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col h-full">
                          {/* Top Row: Assunto and Basic Info */}
                          <div className="flex justify-between items-start gap-3 mb-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-bold text-slate-900 leading-tight">{demand.assunto}</h4>
                                {demand.atendido ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 h-5 text-[10px] font-bold">ATENDIDO</Badge>
                                ) : (
                                  <Badge variant="secondary" className="h-5 text-[10px] font-bold">PENDENTE</Badge>
                                )}
                                {demand.data_prevista_retorno && (
                                  <Badge className={`h-5 text-[10px] font-black border-0 ${
                                    demand.retorno_realizado ? 'bg-emerald-600 text-white' :
                                    isLate ? 'bg-red-600 text-white animate-pulse' : 
                                    isToday ? 'bg-amber-500 text-white animate-pulse' : 
                                    'bg-blue-600 text-white'
                                  }`}>
                                    {demand.retorno_realizado ? 'RETORNO REALIZADO' : 'RETORNO'}: {demand.data_prevista_retorno?.split('-').reverse().join('/')}
                                  </Badge>
                                )}
                                {demand.google_event_id ? (
                                  <Badge className="bg-green-100 text-green-800 border-0 h-5 text-[10px] font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                    ✓ AGENDA CONECTADA
                                  </Badge>
                                ) : (
                                  <Badge className="bg-amber-100 text-amber-800 border border-amber-300 h-5 text-[10px] font-black flex items-center gap-1 animate-pulse">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                    ⚠️ NÃO CADASTRADO NA AGENDA
                                  </Badge>
                                )}
                              </div>
                              {demand.observacoes && (
                                <p className="text-xs text-slate-500 italic leading-relaxed">"{demand.observacoes}"</p>
                              )}
                              {demand.files && demand.files.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-slate-100/50">
                                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center gap-1">
                                    <Paperclip className="h-2.5 w-2.5 text-slate-400" /> Documentos Anexados ({demand.files.length})
                                  </p>
                                  <DemandFiles 
                                    files={demand.files} 
                                    onChange={() => {}} 
                                    readOnly={true} 
                                  />
                                </div>
                              )}
                            </div>
                            
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 shrink-0" 
                              onClick={() => startEdit(demand)}
                              title="Editar Demanda"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Middle Row: Meta Info (Dates) */}
                          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-auto pb-3 border-b border-slate-50">
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                              <Calendar className="h-3 w-3" />
                              PEDIDO: {demand.data_pedido.split('-').reverse().join('/')}
                            </div>
                            {demand.atendido && (
                               <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                                <CheckCircle className="h-3 w-3 text-emerald-500" />
                                ATENDIMENTO: {demand.data_atendimento?.split('-').reverse().join('/')}
                              </div>
                            )}
                            {demand.data_prevista_retorno && (
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-600 font-bold">
                                <Clock className={`h-3 w-3 ${demand.retorno_realizado ? 'text-emerald-500' : 'text-blue-500'}`} />
                                RETORNO: {demand.data_prevista_retorno?.split('-').reverse().join('/')}
                              </div>
                            )}
                          </div>

                          {/* Bottom Row: Primary Actions and Alerts */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3">
                            <div>
                              {demand.data_prevista_retorno && (
                                 <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-sm ${
                                   demand.retorno_realizado ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                   isLate ? 'bg-red-600 text-white animate-pulse' : 
                                   isToday ? 'bg-amber-500 text-white' : 
                                   'bg-blue-50 text-blue-700 border border-blue-100'
                                 }`}>
                                  <Clock className="h-3 w-3" />
                                  <span>
                                    {demand.retorno_realizado ? 'RETORNO CONCLUÍDO' : isLate ? 'RETORNO ATRASADO' : isToday ? 'RETORNO HOJE' : 'PÓS-CONTATO PREVISTO'}: {demand.data_prevista_retorno?.split('-').reverse().join('/')} 
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className={`h-8 px-3 text-[10px] gap-1.5 font-bold transition-all shadow-sm ${
                                  demand.google_event_id 
                                    ? 'border-blue-250 text-blue-600 hover:bg-blue-50' 
                                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black border-amber-600'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const registration = registrations.find(r => r.id === demand.registrationId);
                                  if (registration) {
                                    setIsSyncing(true);
                                    googleCalendarService.createEvent(registration, demand, profile).then(async (result) => {
                                      if (result.success && result.data?.id) {
                                        const currentDemands = Array.isArray(registration.demands) ? registration.demands : [];
                                        const updatedDemands = currentDemands.map(d => 
                                          d.id === demand.id ? { ...d, google_event_id: result.data.id } : d
                                        );
                                        try {
                                          await saveRegistration({ ...registration, demands: updatedDemands });
                                          toast.success('Sincronizado com Google Agenda!');
                                          onRefresh();
                                        } catch (saveErr) {
                                          console.error("Error saving demand after sync:", saveErr);
                                          toast.success('Sincronizado na agenda mas erro ao salvar ID no sistema.');
                                        }
                                      } else {
                                        toast.error(`Erro: ${result.error || 'Não foi possível sincronizar'}`);
                                      }
                                      setIsSyncing(false);
                                    });
                                  }
                                }}
                                disabled={isSyncing}
                              >
                                <Calendar className="h-3 w-3" />
                                {demand.google_event_id ? 'ATUALIZAR NA AGENDA' : '⚠️ CADASTRAR NA AGENDA'}
                              </Button>
                              {!demand.atendido && (
                                <Button
                                  size="sm"
                                  className="h-8 px-4 text-[10px] font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-sm"
                                  onClick={() => handleOpenConclude(demand)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  CONCLUIR AGORA
                                </Button>
                              )}

                              {demand.atendido && (
                                <Button 
                                  variant={demand.retorno_realizado ? "outline" : "default"} 
                                  size="sm" 
                                  className={`h-8 px-4 gap-2 text-[10px] font-black shadow-sm ${
                                    demand.retorno_realizado 
                                      ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' 
                                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                                  }`}
                                  onClick={() => handleToggleReturnManual(demand)}
                                >
                                  {demand.retorno_realizado ? (
                                    <>REVERTER BAIXA</>
                                  ) : (
                                    <>DAR BAIXA NO RETORNO</>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <ConfirmDialog 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        description={confirmConfig.description}
        variant={confirmConfig.variant}
      />

      <Dialog open={concludingDemand !== null} onOpenChange={() => setConcludingDemand(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Concluir Demanda
            </DialogTitle>
            <DialogDescription>
              Marque o pedido como atendido e programe o pós-contato.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 text-center">
            <div className="space-y-4 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 mx-auto max-w-sm">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-600 mb-2">QUER AGENDAR O PÓS-CONTATO?</p>
                <div className="flex flex-col items-center gap-3">
                  <Input 
                    type="date"
                    value={conclusionForm.data_feedback}
                    onChange={(e) => setConclusionForm({ ...conclusionForm, data_feedback: e.target.value })}
                    className="h-10 text-center font-black text-blue-600 bg-white"
                  />
                  <p className="text-[10px] text-slate-400">Agendar feedback para esta data</p>
                </div>
              </div>

               {/* Google sync disabled */}
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="ghost" size="sm" onClick={() => setConcludingDemand(null)} disabled={isSyncing}>Cancelar</Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleConcludeDemand} disabled={isSyncing}>
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Conclusão
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Registration } from '@/src/types';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, Trash2, Mail, Instagram, MapPin, User, Phone, Calendar, Info, MessageSquare, Bell, Clock, CheckCircle2, AlertCircle, Plus, PlusCircle, Loader2, Edit2, ArrowRight, X, Paperclip, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { deleteRegistration, saveRegistration } from '@/src/lib/storage';
import { toast } from 'sonner';
import { ConfirmDialog } from './ConfirmDialog';
import { googleCalendarService } from '@/src/services/googleCalendarService';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { DemandFiles } from './DemandFiles';
import { useAuth } from '@/src/contexts/AuthContext';

interface RegistrationListProps {
  data: Registration[];
  onRefresh: () => void;
  onEdit: (registration: Registration) => void;
}

export function RegistrationList({ data, onRefresh, onEdit }: RegistrationListProps) {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('name');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toggleReturnData, setToggleReturnData] = useState<{regId: string, demandId: string, label: string} | null>(null);
  const [concludingDemand, setConcludingDemand] = useState<{regId: string, demandId: string} | null>(null);
  const [editingDemand, setEditingDemand] = useState<{regId: string, demandId: string} | null>(null);
  const [editForm, setEditForm] = useState<any | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [conclusionForm, setConclusionForm] = useState({
    data_feedback: '',
    agendarFeedback: true,
    syncGoogle: true
  });
  const [selectedItem, setSelectedItem] = useState<Registration | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingDemand, setIsSavingDemand] = useState(false);
  const [isAddingDemand, setIsAddingDemand] = useState(false);

  // Isolated post-contact states
  const [postContactElector, setPostContactElector] = useState<Registration | null>(null);
  const [postContactForm, setPostContactForm] = useState({
    data_contato: '',
    observacoes: '',
    syncGoogle: true
  });
  const [schedulingNextElector, setSchedulingNextElector] = useState<Registration | null>(null);
  const [schedulingForm, setSchedulingForm] = useState({
    intervalo_dias: 30,
    data_proximo: '',
    syncGoogle: true
  });

  const handleOpenPostContact = (item: Registration) => {
    setPostContactElector(item);
    setPostContactForm({
      data_contato: new Date().toISOString().split('T')[0],
      observacoes: '',
      syncGoogle: true
    });
  };

  const handleSavePostContact = async () => {
    if (!postContactElector) return;

    try {
      // 1. Mark current scheduled contact as completed (clear current date)
      const updatedRegistration: Registration = {
        ...postContactElector,
        lembrete_contato_ativo: false,
        data_proximo_contato: undefined,
        atualizado_por: profile?.full_name || 'Sistema',
        updated_at: new Date().toISOString()
      };

      await saveRegistration(updatedRegistration);
      toast.success('Baixa de pós-contato realizada com sucesso!');
      
      const completedElector = { ...updatedRegistration };
      setPostContactElector(null);

      // Open scheduling trigger modal immediately
      setSchedulingNextElector(completedElector);
      const defaultInterval = completedElector.intervalo_contato_dias || 30;
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + defaultInterval);
      
      setSchedulingForm({
        intervalo_dias: defaultInterval,
        data_proximo: nextDate.toISOString().split('T')[0],
        syncGoogle: true
      });
      
    } catch (error) {
      console.error('Error saving post contact:', error);
      toast.error('Erro ao registrar baixa de pós-contato.');
    }
  };

  const handleSaveNewSchedule = async () => {
    if (!schedulingNextElector) return;

    setIsSyncing(true);
    try {
      const updatedRegistration: Registration = {
        ...schedulingNextElector,
        lembrete_contato_ativo: true,
        intervalo_contato_dias: schedulingForm.intervalo_dias,
        data_proximo_contato: schedulingForm.data_proximo,
        atualizado_por: profile?.full_name || 'Sistema',
        updated_at: new Date().toISOString()
      };

      let finalRegistration = { ...updatedRegistration };

      if (schedulingForm.syncGoogle) {
        const contactResult = await googleCalendarService.createPostContactEvent(updatedRegistration, profile);
        if (contactResult.success && contactResult.data?.id) {
          finalRegistration.google_contact_event_id = contactResult.data.id;
          toast.success('Agendamento sincronizado no Google Agenda!');
        } else if (!contactResult.success) {
          toast.warning(`Salvo localmente, mas erro ao sincronizar no Google: ${contactResult.error}`);
        }
      }

      await saveRegistration(finalRegistration);
      toast.success('Novo agendamento de contato salvo!');
      
      setSchedulingNextElector(null);
      onRefresh();
      
      if (selectedItem?.id === finalRegistration.id) {
        setSelectedItem(finalRegistration);
      }
    } catch (error) {
      console.error('Error saving schedule:', error);
      toast.error('Erro ao salvar agendamento.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSkipScheduling = () => {
    setSchedulingNextElector(null);
    onRefresh();
  };
  const [filters, setFilters] = useState({
    bairro: '',
    cidade: '',
    responsavel: '',
    sexo: '',
    status: '',
  });
  const [newDemandForm, setNewDemandForm] = useState({
    assunto: '',
    prazo_retorno_dias: 10,
    atendido: false,
    observacoes: '',
    syncGoogle: true
  });

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

  const getFollowUpStatus = (registration: Registration) => {
    const today = new Date().toISOString().split('T')[0];
    let hasLate = false;
    let hasToday = false;
    let hasPending = false;

    // 1. Check periodic contact
    if (registration.lembrete_contato_ativo && registration.data_proximo_contato) {
      if (registration.data_proximo_contato < today) {
        hasLate = true;
      } else if (registration.data_proximo_contato === today) {
        hasToday = true;
      } else {
        hasPending = true;
      }
    }

    // 2. Check pending demands
    if (registration.demands && Array.isArray(registration.demands) && registration.demands.length > 0) {
      const pendingDemands = registration.demands.filter(d => d.atendido && !d.retorno_realizado && d.data_prevista_retorno);
      pendingDemands.forEach(d => {
        if (d.data_prevista_retorno) {
          if (d.data_prevista_retorno < today) {
            hasLate = true;
          } else if (d.data_prevista_retorno === today) {
            hasToday = true;
          } else {
            hasPending = true;
          }
        }
      });
    }

    if (hasLate) return { type: 'late', label: 'Atrasado' };
    if (hasToday) return { type: 'today', label: 'Hoje' };
    if (hasPending) return { type: 'pending', label: 'Agendado' };
    return null;
  };

  const filteredData = data.filter((item) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      (item.nome_completo?.toLowerCase() || '').includes(searchLower) ||
      (item.email?.toLowerCase() || '').includes(searchLower) ||
      (item.instagram?.toLowerCase() || '').includes(searchLower) ||
      (item.whatsapp?.toLowerCase() || '').includes(searchLower) ||
      (item.cep || '').includes(searchTerm);

    const matchesBairro = !filters.bairro || (item.bairro?.toLowerCase() || '').includes(filters.bairro.toLowerCase());
    const matchesCidade = !filters.cidade || (item.cidade?.toLowerCase() || '').includes(filters.cidade.toLowerCase());
    const matchesResponsavel = !filters.responsavel || (item.responsavel?.toLowerCase() || '').includes(filters.responsavel.toLowerCase());
    const matchesSexo = !filters.sexo || item.sexo === filters.sexo;

    let matchesStatus = true;
    if (filters.status) {
      const status = getFollowUpStatus(item);
      if (filters.status === 'destacadas') {
        matchesStatus = status?.type === 'late' || status?.type === 'today';
      } else if (filters.status === 'late') {
        matchesStatus = status?.type === 'late';
      } else if (filters.status === 'today') {
        matchesStatus = status?.type === 'today';
      } else if (filters.status === 'pending') {
        matchesStatus = status?.type === 'pending';
      } else if (filters.status === 'normal') {
        matchesStatus = !status;
      }
    }

    return matchesSearch && matchesBairro && matchesCidade && matchesResponsavel && matchesSexo && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'name') {
      return (a.nome_completo || '').localeCompare(b.nome_completo || '');
    }
    if (sortBy === 'recent') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    return 0;
  });

  const handleToggleReturn = async (regId: string, demandId: string) => {
    const registration = data.find(r => r.id === regId);
    if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

    const demand = registration.demands.find(d => d.id === demandId);
    if (!demand) return;

    setToggleReturnData({ 
      regId, 
      demandId, 
      label: demand.retorno_realizado ? 'reverter' : 'dar baixa no' 
    });
  };

  const confirmToggleReturn = async () => {
    if (!toggleReturnData) return;
    const { regId, demandId } = toggleReturnData;
    
    const registration = data.find(r => r.id === regId);
    if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

    const updatedDemands = registration.demands.map(d => 
      d.id === demandId ? { ...d, retorno_realizado: !d.retorno_realizado } : d
    );

    const updatedRegistration = { ...registration, demands: updatedDemands };
    
    try {
      await saveRegistration(updatedRegistration);
      toast.success('Status de retorno atualizado!');
      setToggleReturnData(null);
      onRefresh();
      if (selectedItem?.id === regId) {
        setSelectedItem(updatedRegistration);
      }
    } catch (error) {
      toast.error('Erro ao atualizar status');
    }
  };

  const handleConcludeDemand = async () => {
    if (!concludingDemand) return;
    const { regId, demandId } = concludingDemand;

    const registration = data.find(r => r.id === regId);
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

    const updatedRegistration = { ...registration, demands: updatedDemands };
    
    let targetDemand = updatedDemands.find(d => d.id === demandId);
    let finalDemands = updatedDemands;

    if ((conclusionForm.syncGoogle || targetDemand.google_event_id) && targetDemand) {
      try {
        setIsSyncing(true);
        const result = await googleCalendarService.createEvent(updatedRegistration, targetDemand, profile);
        if (result.success && result.data?.id) {
          finalDemands = updatedDemands.map(d => 
            d.id === demandId ? { ...d, google_event_id: result.data.id } : d
          );
          toast.success('Evento sincronizado no Google Agenda!');
        } else {
          toast.error(`Erro Google: ${result.error}`);
        }
      } catch (err) {
        console.error("Error syncing during conclusion:", err);
      } finally {
        setIsSyncing(false);
      }
    }

    const finalRegistration = { ...registration, demands: finalDemands };
    
    try {
      await saveRegistration(finalRegistration);
      toast.success('Demanda concluída com sucesso!');
      setConcludingDemand(null);
      setConclusionForm({ data_feedback: '', agendarFeedback: true, syncGoogle: true });
      onRefresh();
      if (selectedItem?.id === regId) {
        setSelectedItem(finalRegistration);
      }
    } catch (error) {
      toast.error('Erro ao concluir demanda');
    }
  };

  const handleSyncDemandToGoogle = async (regId: string, demandId: string) => {
    const registration = data.find(r => r.id === regId);
    if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

    const demand = registration.demands.find(d => d.id === demandId);
    if (!demand) return;

    try {
      setIsSyncing(true);
      const result = await googleCalendarService.createEvent(registration, demand, profile);
      
      if (result.success && result.data?.id) {
        const updatedDemands = registration.demands.map(d => 
          d.id === demandId ? { ...d, google_event_id: result.data.id } : d
        );
        
        const updatedRegistration = { ...registration, demands: updatedDemands };
        await saveRegistration(updatedRegistration);
        toast.success('Demanda sincronizada com Google Agenda com sucesso!');
        onRefresh();
        if (selectedItem?.id === regId) {
          setSelectedItem(updatedRegistration);
        }
      } else {
        toast.error(`Erro ao sincronizar com Google Agenda: ${result.error || 'Verifique sua conexão ou reautorize o app.'}`);
      }
    } catch (err) {
      console.error("Error syncing demand from list:", err);
      toast.error("Erro interno ao sincronizar demanda.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddDemand = async () => {
    if (!selectedItem || !newDemandForm.assunto) {
      toast.error('Informe o assunto da demanda');
      return;
    }

    setIsSavingDemand(true);
    const today = new Date().toISOString().split('T')[0];
    
    // Calcular data prevista de retorno
    const baseDate = today; // In both cases we use today as base for a NEW demand
    const date = new Date(baseDate);
    date.setDate(date.getDate() + (newDemandForm.prazo_retorno_dias || 0));
    const data_prevista_retorno = date.toISOString().split('T')[0];

    const demand: any = {
      id: crypto.randomUUID(),
      assunto: newDemandForm.assunto,
      data_pedido: today,
      atendido: newDemandForm.atendido,
      data_atendimento: newDemandForm.atendido ? today : undefined,
      prazo_retorno_dias: newDemandForm.prazo_retorno_dias,
      data_prevista_retorno,
      retorno_realizado: false,
      observacoes: newDemandForm.observacoes,
      files: (newDemandForm as any).files || []
    };

    const currentDemands = Array.isArray(selectedItem.demands) ? selectedItem.demands : [];
    let finalDemands = [...currentDemands, demand];
    let finalDemand = { ...demand };

    if (newDemandForm.syncGoogle) {
      try {
        const result = await googleCalendarService.createEvent(selectedItem, demand, profile);
        if (result.success && result.data?.id) {
          finalDemand.google_event_id = result.data.id;
          finalDemands = [...currentDemands, finalDemand];
          toast.success('Demanda sincronizada no Google Agenda');
        } else {
          toast.error(`Erro Google: ${result.error}`);
        }
      } catch (error) {
        console.error("Error syncing new demand:", error);
      }
    }

    const updatedRegistration = { ...selectedItem, demands: finalDemands };

    try {
      await saveRegistration(updatedRegistration);
      toast.success('Nova demanda registrada!');
      setIsAddingDemand(false);
      setNewDemandForm({ assunto: '', prazo_retorno_dias: 10, atendido: false, observacoes: '', syncGoogle: true, files: [] } as any);
      onRefresh();
      setSelectedItem(updatedRegistration);
    } catch (error) {
      toast.error('Erro ao salvar demanda');
    } finally {
      setIsSavingDemand(false);
    }
  };

  const startEditDemand = (demand: any) => {
    if (!selectedItem) return;
    setEditingDemand({ regId: selectedItem.id, demandId: demand.id });
    setEditForm({ ...demand, syncGoogle: true });
  };

  const saveEditDemand = async () => {
    if (!editingDemand || !editForm || !selectedItem) return;

    let finalDemandForm = { ...editForm };
    delete finalDemandForm.syncGoogle;

    let updatedDemandWithId = { ...finalDemandForm };

    if (editForm.syncGoogle || finalDemandForm.google_event_id) {
      try {
        setIsSyncing(true);
        const result = await googleCalendarService.createEvent(selectedItem, finalDemandForm, profile);
        if (result.success && result.data?.id) {
          updatedDemandWithId.google_event_id = result.data.id;
        }
      } catch (error) {
        console.error("Error updating calendar event on edit:", error);
        toast.error("Erro ao sincronizar com Google Agenda");
      } finally {
        setIsSyncing(false);
      }
    }

    const currentDemands = Array.isArray(selectedItem.demands) ? selectedItem.demands : [];
    const updatedDemands = currentDemands.map(d => {
      if (d.id === editingDemand.demandId) {
        return updatedDemandWithId;
      }
      return d;
    });

    const updatedRegistration = { ...selectedItem, demands: updatedDemands };

    try {
      await saveRegistration(updatedRegistration);
      toast.success('Demanda atualizada!');
      setEditingDemand(null);
      setEditForm(null);
      onRefresh();
      setSelectedItem(updatedRegistration);
    } catch (error) {
      toast.error('Erro ao atualizar demanda');
    }
  };

  const deleteDemand = async (regId: string, demandId: string) => {
    const registration = data.find(r => r.id === regId) || selectedItem;
    if (!registration || !registration.demands || !Array.isArray(registration.demands)) return;

    const updatedDemands = registration.demands.filter(d => d.id !== demandId);
    const updatedRegistration = { ...registration, demands: updatedDemands };

    try {
      await saveRegistration(updatedRegistration);
      toast.success('Demanda excluída');
      setEditingDemand(null);
      onRefresh();
      setSelectedItem(updatedRegistration);
    } catch (error) {
      toast.error('Erro ao excluir demanda');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    
    setIsDeleting(true);
    try {
      await deleteRegistration(deleteId);
      toast.success('Registro removido com sucesso de todos os locais');
      onRefresh();
    } catch (error: any) {
      console.error('Error deleting registration:', error);
      toast.error('Erro ao excluir no servidor', {
        description: error?.message || 'O registro foi removido apenas localmente (ou a conexão falhou).',
        duration: 5000
      });
      // Refresh anyway to show local state
      onRefresh();
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 xl:grid-cols-8 gap-4">
        <div className="md:col-span-2 lg:col-span-1">
          <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Pesquisa Geral</label>
          <div className="relative">
            <Input 
              placeholder="Nome do cadastrado, E-mail, Insta ou CEP..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-slate-400" />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Ordenar</label>
          <select 
            className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="name">A-Z (Nome)</option>
            <option value="recent">Mais Recentes</option>
          </select>
        </div>
        
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Bairro</label>
          <Input 
            placeholder="Filtrar bairro" 
            value={filters.bairro}
            onChange={(e) => setFilters({ ...filters, bairro: e.target.value })}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Cidade</label>
          <Input 
            placeholder="Filtrar cidade" 
            value={filters.cidade}
            onChange={(e) => setFilters({ ...filters, cidade: e.target.value })}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Responsável</label>
          <Input 
            placeholder="Nome..." 
            value={filters.responsavel}
            onChange={(e) => setFilters({ ...filters, responsavel: e.target.value })}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Sexo</label>
          <select 
            className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.sexo}
            onChange={(e) => setFilters({ ...filters, sexo: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
            <option value="Prefiro não dizer">Prefiro não dizer</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Acompanhamento</label>
          <select 
            className="w-full h-10 px-3 py-2 bg-white border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Todos</option>
            <option value="destacadas">★ Destacados (Atrasado/Hoje)</option>
            <option value="late">🔴 Atrasados</option>
            <option value="today">🟡 Hoje</option>
            <option value="pending">🔵 Agendados</option>
            <option value="normal">⚪ Sem Pendências</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {filteredData.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              Nenhum registro encontrado.
            </div>
          ) : (
            filteredData.map((item) => (
                <div 
                  key={item.id} 
                  className={`p-4 transition-colors cursor-pointer border-b border-slate-100 ${
                    (() => {
                      const status = getFollowUpStatus(item);
                      if (status?.type === 'late') return 'bg-red-50 border-l-4 border-l-red-500';
                      if (status?.type === 'today') return 'bg-amber-50 border-l-4 border-l-amber-500';
                      return 'hover:bg-slate-50 active:bg-slate-100';
                    })()
                  }`}
                  onClick={() => setSelectedItem(item)}
                >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{item.nome_completo}</span>
                    {(() => {
                      const status = getFollowUpStatus(item);
                      if (!status) return null;
                      return (
                         <Bell className={`h-3 w-3 ${
                           status.type === 'late' ? 'text-red-500' : 
                           status.type === 'today' ? 'text-amber-500' : 
                           'text-blue-400'
                         }`} />
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
                  <MapPin className="h-3 w-3 text-blue-500" />
                  <span>{item.bairro} • {item.cidade}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-medium">
                  <div className="flex flex-col gap-1">
                    <span className="truncate max-w-[150px]">{formatPhoneNumber(item.whatsapp) || item.email || item.instagram}</span>
                    <div className="flex flex-col gap-1 mt-1">
                      {/* Contato Periódico - Mobile */}
                      {item.lembrete_contato_ativo && item.data_proximo_contato && (() => {
                          const today = new Date().toISOString().split('T')[0];
                          const isLate = item.data_proximo_contato < today;
                          const isToday = item.data_proximo_contato === today;
                          return (
                            <div className={`flex items-center gap-1 font-bold ${
                              isLate ? 'text-red-500' : isToday ? 'text-amber-500' : 'text-emerald-500'
                            }`}>
                              <RefreshCcw className="h-2.5 w-2.5 shrink-0" />
                              <span>Contato: {item.data_proximo_contato.split('-').reverse().join('/')}</span>
                            </div>
                          );
                      })()}

                      {/* Retorno de Demanda - Mobile */}
                      {(() => {
                          const today = new Date().toISOString().split('T')[0];
                          const pendingDemands = Array.isArray(item.demands) ? item.demands.filter(d => d.atendido && !d.retorno_realizado && d.data_prevista_retorno) : [];
                          if (!pendingDemands || pendingDemands.length === 0) return null;
                          
                          const sorted = [...pendingDemands].sort((a, b) => (a.data_prevista_retorno || '').localeCompare(b.data_prevista_retorno || ''));
                          const nextDate = sorted[0].data_prevista_retorno;
                          const isLate = nextDate! < today;
                          const isToday = nextDate === today;

                          return (
                            <div className={`flex items-center gap-1 font-bold ${
                              isLate ? 'text-red-500' : isToday ? 'text-amber-500' : 'text-blue-500'
                            }`}>
                              <Clock className="h-2.5 w-2.5 shrink-0" />
                              <span>Demanda: {nextDate?.split('-').reverse().join('/')}</span>
                            </div>
                          );
                      })()}
                    </div>
                    {/* Baixa de Pós-contato Isolado - Mobile */}
                    {(!item.demands || !Array.isArray(item.demands) || item.demands.length === 0) && (
                      <div className="mt-3 pt-2.5 border-t border-slate-100/50 w-full flex justify-end">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] py-1 h-7 rounded gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPostContact(item);
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Dar Baixa Pós-Contato
                        </Button>
                      </div>
                    )}
                  </div>
                  <span className="text-slate-600 font-bold">{item.responsavel}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[200px]">Identificação</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Próximo Retorno</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-500">
                    Nenhum registro encontrado com os filtros selecionados.
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item) => (
                  <TableRow 
                    key={item.id} 
                    className={`cursor-pointer transition-colors group ${
                      getFollowUpStatus(item)?.type === 'late'
                      ? 'bg-red-50/70 hover:bg-red-100/80 border-l-2 border-l-red-500' 
                      : 'hover:bg-slate-50/80'
                    }`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-slate-900 truncate max-w-[150px]">
                          {item.nome_completo}
                        </div>
                        {(() => {
                          const status = getFollowUpStatus(item);
                          if (!status) return null;
                          return (
                            <div title={`Pós-contato ${status.label}`} className="flex items-center gap-1">
                               <Bell className={`h-3.5 w-3.5 ${
                                 status.type === 'late' ? 'text-red-500 animate-bounce' : 
                                 status.type === 'today' ? 'text-amber-500 animate-pulse' : 
                                 'text-blue-400'
                               }`} />
                               {status.type === 'late' && (
                                 <span className="text-[8px] font-bold text-red-500 uppercase animate-pulse">Atrasado</span>
                               )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase font-medium">
                        {item.sexo === 'M' ? 'Masculino' : item.sexo === 'F' ? 'Feminino' : (item.sexo || 'Prefiro não dizer')} • {(item.dataNascimento || '').includes('-') 
                          ? item.dataNascimento.split('-').reverse().join('/') 
                          : (item.dataNascimento || 'N/D')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <MapPin className="h-3.5 w-3.5 text-blue-500" />
                        <span>{item.bairro}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 pl-5">{item.cidade}-{item.estado}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {item.whatsapp && (
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                            <Phone className="h-3 w-3 text-emerald-500" />
                            <span>{formatPhoneNumber(item.whatsapp)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Mail className="h-3 w-3 text-slate-400" />
                          <span className="truncate max-w-[120px]">{item.email}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-slate-700">{item.responsavel}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1.5 justify-center">
                        {/* Contato Periódico */}
                        {item.lembrete_contato_ativo && item.data_proximo_contato && (() => {
                          const today = new Date().toISOString().split('T')[0];
                          const isLate = item.data_proximo_contato < today;
                          const isToday = item.data_proximo_contato === today;
                          return (
                            <div className="flex items-center gap-1" title="Mensagem Periódica de Acompanhamento">
                              <Badge className={`${
                                isLate ? 'bg-red-100 text-red-700 hover:bg-red-200' : 
                                isToday ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 
                                'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              } border-0 text-[10px] font-bold gap-1 flex items-center`}>
                                <RefreshCcw className="h-3 w-3 shrink-0" />
                                <span>Contato: {item.data_proximo_contato.split('-').reverse().join('/')}</span>
                              </Badge>
                            </div>
                          );
                        })()}

                        {/* Retorno de Demandas */}
                        {(() => {
                          const today = new Date().toISOString().split('T')[0];
                          const pendingDemands = Array.isArray(item.demands) ? item.demands.filter(d => d.atendido && !d.retorno_realizado && d.data_prevista_retorno) : [];
                          if (!pendingDemands || pendingDemands.length === 0) return null;

                          // Sort to show the closest/most late one first
                          const sorted = [...pendingDemands].sort((a, b) => (a.data_prevista_retorno || '').localeCompare(b.data_prevista_retorno || ''));
                          const nextDate = sorted[0].data_prevista_retorno;
                          const isLate = nextDate! < today;
                          const isToday = nextDate === today;

                          return (
                            <div className="flex items-center gap-1" title={`${pendingDemands.length} retorno(s) de demanda pendente(s)`}>
                              <Badge className={`${
                                isLate ? 'bg-red-100 text-red-700 hover:bg-red-200' : 
                                isToday ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 
                                'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              } border-0 text-[10px] font-bold gap-1 flex items-center`}>
                                <Clock className="h-3 w-3 shrink-0" />
                                <span>Demanda: {nextDate?.split('-').reverse().join('/')}</span>
                              </Badge>
                            </div>
                          );
                        })()}

                        {/* Se nenhum estiver ativo */}
                        {!item.lembrete_contato_ativo && (!item.demands || !Array.isArray(item.demands) || item.demands.filter(d => d.atendido && !d.retorno_realizado && d.data_prevista_retorno).length === 0) && (
                          <span className="text-xs text-slate-400 font-medium">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {(!item.demands || !Array.isArray(item.demands) || item.demands.length === 0) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-[10px] font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50 gap-1.5 flex shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPostContact(item);
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Baixar Pós-Contato
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-300 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(item);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-slate-300 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteId(item.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmDialog 
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={isDeleting}
        title="Excluir Registro"
        description="Esta ação é permanente e não poderá ser desfeita. O registro do eleitor será removido do banco de dados."
        confirmLabel="Sim, Excluir"
      />

      <ConfirmDialog 
        isOpen={toggleReturnData !== null}
        onClose={() => setToggleReturnData(null)}
        onConfirm={confirmToggleReturn}
        title="Confirmar Ação"
        description={`Deseja realmente ${toggleReturnData?.label} pós-contato desta demanda?`}
        variant="info"
        confirmLabel="Confirmar"
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
                    className="h-10 text-center font-bold text-blue-600 bg-white"
                  />
                  <p className="text-[10px] text-slate-400">Sugestão: Próxima semana</p>
                </div>
              </div>

              <div className="pt-2 border-t border-blue-100 flex items-center justify-center gap-2">
                <Checkbox 
                  id="list-modal-sync-google"
                  checked={conclusionForm.syncGoogle}
                  onCheckedChange={(checked) => setConclusionForm({ ...conclusionForm, syncGoogle: !!checked })}
                />
                <Label htmlFor="list-modal-sync-google" className="text-xs font-bold text-blue-700 cursor-pointer flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  Sincronizar no Google
                </Label>
              </div>
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

      <Dialog open={selectedItem !== null} onOpenChange={() => setSelectedItem(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto p-0 border-0 shadow-2xl">
          {selectedItem && (
            <>
              <div className="bg-blue-600 p-8 text-white relative">
                <DialogHeader>
                  <p className="text-blue-100 text-[10px] uppercase font-bold tracking-widest mb-1">Ficha de Registro</p>
                  <DialogTitle className="text-2xl font-bold text-white leading-tight">
                    {selectedItem.nome_completo}
                  </DialogTitle>
                  <DialogDescription className="text-blue-100/80 text-xs">
                    Cadastrado em {new Date(selectedItem.created_at).toLocaleString('pt-BR')}
                  </DialogDescription>
                </DialogHeader>
                <div className="absolute top-4 right-12 flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20 h-8 gap-1.5"
                    onClick={() => {
                      onEdit(selectedItem);
                      setSelectedItem(null);
                    }}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                </div>
              </div>

                <div className="p-6 space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Bell className="h-3 w-3" />
                        Linha do Tempo: Demandas / Assunto
                      </h4>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 text-[10px] font-bold text-blue-600 hover:bg-blue-50 gap-1"
                        onClick={() => setIsAddingDemand(!isAddingDemand)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        NOVA DEMANDA
                      </Button>
                    </div>

                    {isAddingDemand && (
                      <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase text-slate-500 font-semibold">Assunto / Pedido</Label>
                            <Input 
                              placeholder="Ex: Troca de lâmpada..."
                              value={newDemandForm.assunto}
                              onChange={(e) => setNewDemandForm({ ...newDemandForm, assunto: e.target.value })}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] uppercase text-slate-500 font-semibold">Prazo Retorno (Dias)</Label>
                            <Input 
                              type="number"
                              min="0"
                              value={newDemandForm.prazo_retorno_dias}
                              onChange={(e) => {
                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                setNewDemandForm({ ...newDemandForm, prazo_retorno_dias: val });
                              }}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-[10px] uppercase text-slate-500 font-semibold">Descrição / Observações</Label>
                            <Input 
                              placeholder="Detalhes adicionais da demanda..."
                              value={newDemandForm.observacoes}
                              onChange={(e) => setNewDemandForm({ ...newDemandForm, observacoes: e.target.value })}
                              className="h-9 text-sm"
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-2">
                            <Label className="text-[10px] uppercase text-slate-500 font-semibold flex items-center gap-1.5">
                              <Paperclip className="h-3.5 w-3.5 text-slate-400" /> Documentos Anexados
                            </Label>
                            <DemandFiles 
                              files={(newDemandForm as any).files || []} 
                              onChange={(updatedFiles) => setNewDemandForm({ ...newDemandForm, files: updatedFiles } as any)}
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center space-x-2">
                              <Checkbox 
                                id="add-atendido"
                                checked={newDemandForm.atendido}
                                onCheckedChange={(checked) => setNewDemandForm({ ...newDemandForm, atendido: !!checked })}
                              />
                              <Label htmlFor="add-atendido" className="text-xs text-slate-600 cursor-pointer">Marcar como já Atendido</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <Checkbox 
                                id="add-sync-google"
                                checked={newDemandForm.syncGoogle}
                                onCheckedChange={(checked) => setNewDemandForm({ ...newDemandForm, syncGoogle: !!checked })}
                              />
                              <Label htmlFor="add-sync-google" className="text-xs text-blue-600 font-semibold cursor-pointer flex items-center gap-1.5">
                                <Calendar className="h-3 w-3" />
                                Sincronizar com Google Agenda
                              </Label>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 text-xs"
                              onClick={() => setIsAddingDemand(false)}
                            >
                              Cancelar
                            </Button>
                            <Button 
                              size="sm" 
                              className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                              onClick={handleAddDemand}
                              disabled={isSavingDemand || !newDemandForm.assunto}
                            >
                              {isSavingDemand ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                              Gravar Pedido
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedItem.demands && Array.isArray(selectedItem.demands) && selectedItem.demands.length > 0 ? (
                      <div className="space-y-3">
                        {selectedItem.demands.map((demand) => {
                          const today = new Date().toISOString().split('T')[0];
                          const isLate = demand.atendido && !demand.retorno_realizado && demand.data_prevista_retorno && demand.data_prevista_retorno < today;
                          const isToday = demand.atendido && !demand.retorno_realizado && demand.data_prevista_retorno === today;

                          return (
                            <div key={demand.id} className={`p-4 rounded-xl border transition-all relative ${
                              demand.retorno_realizado ? 'bg-slate-50 border-slate-200' :
                              isLate ? 'bg-red-50 border-red-200 shadow-sm ring-1 ring-red-100' :
                              isToday ? 'bg-amber-50 border-amber-200' :
                              'bg-blue-50/30 border-blue-100'
                            } ${editingDemand?.demandId === demand.id ? 'ring-2 ring-blue-500 scale-[1.02] shadow-lg z-10' : ''}`}>
                              {editingDemand?.demandId === demand.id && editForm ? (
                                <div className="space-y-4">
                                  <div className="flex justify-between items-center mb-2">
                                     <h4 className="text-xs font-bold text-blue-600 uppercase">Editando Demanda</h4>
                                     <div className="flex gap-2">
                                       <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deleteDemand(selectedItem.id, demand.id)}>
                                         <Trash2 className="h-4 w-4" />
                                       </Button>
                                       <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingDemand(null)}>
                                         <X className="h-4 w-4" />
                                       </Button>
                                     </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2 space-y-1.5">
                                      <Label className="text-[10px] uppercase text-slate-500 font-bold">Assunto</Label>
                                      <Input 
                                        value={editForm.assunto} 
                                        onChange={(e) => setEditForm({ ...editForm, assunto: e.target.value })}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] uppercase text-slate-500 font-bold">Data Pedido</Label>
                                      <Input 
                                        type="date"
                                        value={editForm.data_pedido} 
                                        onChange={(e) => setEditForm({ ...editForm, data_pedido: e.target.value })}
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                    <div className="flex items-center space-x-2 pt-4">
                                      <Checkbox 
                                        id="edit-demand-atendido" 
                                        checked={editForm.atendido}
                                        onCheckedChange={(checked) => setEditForm({ 
                                          ...editForm, 
                                          atendido: !!checked,
                                          data_atendimento: checked ? (editForm.data_atendimento || today) : undefined
                                        })}
                                      />
                                      <Label htmlFor="edit-demand-atendido" className="text-xs font-bold">Atendido?</Label>
                                    </div>

                                    {editForm.atendido && (
                                      <div className="space-y-1.5">
                                        <Label className="text-[10px] uppercase text-slate-500 font-bold">Data Atendimento</Label>
                                        <Input 
                                          type="date"
                                          value={editForm.data_atendimento || ''} 
                                          onChange={(e) => setEditForm({ ...editForm, data_atendimento: e.target.value })}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                    )}

                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] uppercase text-slate-500 font-bold">Dias para Retorno</Label>
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
                                        className="h-8 text-xs"
                                      />
                                    </div>
                                    <div className="space-y-1.5">
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
                                        className="h-8 text-xs font-bold text-blue-600"
                                      />
                                    </div>

                                    <div className="md:col-span-2 space-y-1.5">
                                      <Label className="text-[10px] uppercase text-slate-500 font-bold">Observações</Label>
                                      <Input 
                                        value={editForm.observacoes || ''} 
                                        onChange={(e) => setEditForm({ ...editForm, observacoes: e.target.value })}
                                        className="h-8 text-xs"
                                      />
                                    </div>

                                    <div className="md:col-span-2 space-y-1.5">
                                      <Label className="text-[10px] uppercase text-slate-500 font-bold flex items-center gap-1">
                                        <Paperclip className="h-3 w-3 text-slate-400" /> Documentos Anexados
                                      </Label>
                                      <DemandFiles 
                                        files={editForm.files || []} 
                                        onChange={(updatedFiles) => setEditForm({ ...editForm, files: updatedFiles })}
                                      />
                                    </div>

                                    <div className="md:col-span-2 mt-1">
                                      <div className="flex items-start gap-3 p-2.5 rounded-lg border border-blue-100 bg-blue-50/70 transition-colors hover:bg-blue-50">
                                        <Checkbox 
                                          id="edit-demand-sync-google" 
                                          checked={!!editForm.syncGoogle}
                                          onCheckedChange={(checked) => setEditForm({ 
                                            ...editForm, 
                                            syncGoogle: !!checked
                                          })}
                                          className="mt-0.5"
                                        />
                                        <div className="space-y-0.5 cursor-pointer select-none flex-1">
                                          <Label htmlFor="edit-demand-sync-google" className="text-xs font-extrabold text-blue-900 flex items-center gap-1.5 cursor-pointer">
                                            <Clock className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                                            Sincronizar com Google Agenda
                                          </Label>
                                          <p className="text-[10px] text-blue-700/80 font-medium">
                                            Mantém a data programada para o pós-contato atualizada no seu calendário.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="flex justify-end gap-2 pt-2">
                                    <Button variant="outline" size="sm" className="h-8 text-[10px]" onClick={() => setEditingDemand(null)}>Cancelar</Button>
                                    <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-[10px]" onClick={saveEditDemand}>
                                      Salvar Demanda
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-3">
                                  {/* Header: Assunto and Status */}
                                  <div className="flex justify-between items-start gap-4">
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-bold text-sm text-slate-800 leading-tight">{demand.assunto}</span>
                                        {demand.atendido ? (
                                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 text-[9px] h-4 font-bold">ATENDIDO</Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-[9px] h-4 font-bold">PENDENTE</Badge>
                                        )}
                                        {demand.atrasado && !demand.retorno_realizado && (
                                           <Badge className="bg-red-600 text-white border-0 text-[9px] h-4 font-bold">VENCIDO</Badge>
                                        )}
                                        {demand.google_event_id ? (
                                          <Badge className="bg-green-100 text-green-800 border-0 text-[9px] h-4 font-bold flex items-center gap-1">
                                            <span className="w-1 h-1 rounded-full bg-green-500" />
                                            ✓ AGENDA
                                          </Badge>
                                        ) : (
                                          <Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[9px] h-4 font-black flex items-center gap-1 animate-pulse">
                                            <span className="w-1 h-1 rounded-full bg-amber-500" />
                                            ⚠️ FORA DA AGENDA
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1 items-center">
                                        <span className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          Pedido em: {demand.data_pedido.split('-').reverse().join('/')}
                                        </span>
                                        {demand.data_atendimento && (
                                          <span className="flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                            Atendido em: {demand.data_atendimento.split('-').reverse().join('/')}
                                          </span>
                                        )}
                                        {demand.data_prevista_retorno && (
                                          <span className="flex items-center gap-1 font-bold text-slate-700">
                                            <Clock className="h-3 w-3 text-blue-500" />
                                            Retorno: {demand.data_prevista_retorno.split('-').reverse().join('/')}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div className="flex gap-1 shrink-0">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 w-7 text-slate-400 hover:text-blue-600 p-0"
                                        onClick={() => startEditDemand(demand)}
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Meta section */}
                                  {demand.data_prevista_retorno && (
                                    <div className={`p-2 rounded-lg text-[10px] flex items-center gap-2 font-bold ${
                                      demand.retorno_realizado ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                                      isLate ? 'bg-red-100 text-red-700 font-extrabold' : 
                                      isToday ? 'bg-amber-100 text-amber-700' : 
                                      'bg-blue-100/50 text-blue-700'
                                    }`}>
                                      <Clock className="h-3.5 w-3.5" />
                                      <span>
                                        Pós-contato programado para: {demand.data_prevista_retorno?.split('-').reverse().join('/')}
                                        {demand.retorno_realizado && " (CONCLUÍDO)"}
                                        {!demand.retorno_realizado && isLate && " (ATRASADO)"}
                                        {!demand.retorno_realizado && isToday && " (HOJE)"}
                                      </span>
                                    </div>
                                  )}

                                  {!demand.google_event_id && (
                                    <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-2.5 text-[10px] leading-relaxed flex items-start gap-1.5 font-medium shadow-sm mb-2.5">
                                      <div className="p-0.5 bg-amber-100 rounded text-amber-700 mt-0.5 shrink-0">
                                        <AlertCircle className="h-3.5 w-3.5 animate-pulse" />
                                      </div>
                                      <div>
                                        <strong className="text-amber-950 block text-[10.5px]">Fora da Agenda do Gabinete:</strong> 
                                        Esta demanda não está agendada no Google Calendar. Para agendar a posteriori, reautorize o app no alerta vermelho do topo e clique em <strong className="text-amber-950 uppercase text-[9px] bg-amber-200 px-1 py-0.5 rounded border border-amber-300 select-all">⚠️ Sync Na Agenda</strong> abaixo no rodapé deste cartão.
                                      </div>
                                    </div>
                                  )}

                                  {demand.observacoes && (
                                    <div className="text-[10px] text-slate-500 bg-white/50 p-2 rounded border border-dashed italic">
                                      "{demand.observacoes}"
                                    </div>
                                  ) }

                                  {demand.files && demand.files.length > 0 && (
                                    <div className="space-y-1.5 pt-1">
                                      <p className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                                        <Paperclip className="h-2.5 w-2.5 text-slate-400" /> Documentos Anexados ({demand.files.length})
                                      </p>
                                      <DemandFiles 
                                        files={demand.files} 
                                        onChange={() => {}} 
                                        readOnly={true} 
                                      />
                                    </div>
                                  )}

                                  {/* Bottom row: Actions */}
                                  <div className="flex justify-between items-center pt-1">
                                    {demand.data_prevista_retorno && (
                                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                        RETORNO: {demand.data_prevista_retorno.split('-').reverse().slice(0,2).join('/')}
                                      </div>
                                    )}
                                    <div className="flex gap-2">
                                      {!demand.atendido && (
                                        <Button
                                          size="sm"
                                          className="h-7 px-3 text-[9px] font-black bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                                          onClick={() => {
                                            const defaultDate = new Date();
                                            defaultDate.setDate(defaultDate.getDate() + 7);
                                            setConclusionForm({
                                              ...conclusionForm,
                                              data_feedback: defaultDate.toISOString().split('T')[0]
                                            });
                                            setConcludingDemand({ regId: selectedItem.id, demandId: demand.id });
                                          }}
                                        >
                                          <CheckCircle2 className="h-3 w-3" />
                                          CONCLUIR AGORA
                                        </Button>
                                      )}

                                      {demand.atendido && (
                                        <Button
                                          size="sm"
                                          variant={demand.retorno_realizado ? "ghost" : "outline"}
                                          className={`h-7 px-3 text-[9px] font-black flex gap-1.5 ${
                                            demand.retorno_realizado ? 'text-emerald-600 hover:bg-emerald-50' : 'text-blue-600 border-blue-200 hover:bg-blue-50'
                                          }`}
                                          onClick={() => handleToggleReturn(selectedItem.id, demand.id)}
                                        >
                                          {demand.retorno_realizado ? (
                                            <><CheckCircle2 className="h-3 w-3" /> BAIXA CONCLUÍDA</>
                                          ) : (
                                            <><ArrowRight className="h-3 w-3" /> DAR BAIXA NO RETORNO</>
                                          )}
                                        </Button>
                                      )}

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={`h-7 px-3 text-[9px] font-black flex gap-1.5 transition-all ${
                                          demand.google_event_id 
                                            ? 'border-slate-200 text-slate-500 hover:bg-slate-50' 
                                            : 'bg-amber-50 border-2 border-amber-400 hover:bg-amber-100 text-amber-950 font-extrabold shadow-sm'
                                        }`}
                                        onClick={() => handleSyncDemandToGoogle(selectedItem.id, demand.id)}
                                        disabled={isSyncing}
                                      >
                                        <Calendar className={`h-3.5 w-3.5 ${demand.google_event_id ? 'text-slate-400' : 'text-amber-600 animate-bounce'}`} />
                                        {demand.google_event_id ? 'ATUALIZAR EXECUTADO' : '⚠️ SYNC NA AGENDA'}
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 border-2 border-dashed border-slate-100 rounded-xl">
                        <MessageSquare className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">Nenhum pedido registrado para este eleitor.</p>
                      </div>
                    )}
                  </div>

                  {selectedItem.possuiFilhos && selectedItem.filhos && selectedItem.filhos.length > 0 && (
                    <div className="space-y-4">
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <MessageSquare className="h-3 w-3" />
                        Filhos ({selectedItem.quantidade_filhos || selectedItem.filhos.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedItem.filhos.map((filho, idx) => (
                          <div key={idx} className="p-3 bg-blue-50/50 rounded-lg border border-blue-100 flex flex-col">
                            <span className="text-xs font-bold text-slate-700">{filho.nome}</span>
                            <span className="text-[10px] text-slate-500">
                              {(filho.dataNascimento || '').includes('-') ? filho.dataNascimento.split('-').reverse().join('/') : 'N/D'} • {filho.sexo}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <User className="h-3 w-3" />
                      Dados Pessoais
                    </h4>
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-medium">Sexo</span>
                        <span className="text-sm font-semibold text-slate-700 capitalize">{selectedItem.sexo === 'M' ? 'Masculino' : selectedItem.sexo === 'F' ? 'Feminino' : (selectedItem.sexo || 'Prefiro não dizer')}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-medium">Estado Civil</span>
                        <span className="text-sm font-semibold text-slate-700">{selectedItem.estado_civil || 'N/D'}</span>
                      </div>
                      {selectedItem.nome_conjuge && (
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase font-medium">Cônjuge</span>
                          <span className="text-sm font-semibold text-slate-700">{selectedItem.nome_conjuge}</span>
                        </div>
                      )}
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-medium">Data de Nascimento</span>
                        <span className="text-sm font-semibold text-slate-700 italic border-l-2 border-blue-100 pl-2">
                          {(selectedItem.dataNascimento || '').includes('-') 
                            ? selectedItem.dataNascimento.split('-').reverse().join('/') 
                            : (selectedItem.dataNascimento || 'N/D')}
                        </span>
                      </div>
                    </div>
                  </div>

                    <div className="space-y-4">
                      <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Phone className="h-3 w-3" />
                        Redes e Contato
                      </h4>
                      <div className="space-y-3">
                        {selectedItem.whatsapp && (
                          <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase font-medium">WhatsApp</span>
                            <span className="text-sm font-semibold text-emerald-600 flex items-center gap-1.5">
                              <MessageSquare className="h-3 w-3" />
                              {formatPhoneNumber(selectedItem.whatsapp)}
                            </span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase font-medium">E-mail</span>
                          <span className="text-sm font-semibold text-slate-700 truncate">{selectedItem.email || 'N/D'}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-400 uppercase font-medium">Instagram</span>
                          <span className="text-sm font-semibold text-blue-600 flex items-center gap-1">
                            <Instagram className="h-3 w-3" />
                            {selectedItem.instagram || 'N/D'}
                          </span>
                        </div>
                      </div>
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <MapPin className="h-3 w-3" />
                    Localização Detalhada
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 shadow-inner">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Logradouro</span>
                      <span className="text-sm font-semibold text-slate-700">{selectedItem.logradouro}, {selectedItem.numero}</span>
                      {selectedItem.complemento && (
                        <span className="text-[10px] text-slate-500 italic">{selectedItem.complemento}</span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Bairro</span>
                      <span className="text-sm font-semibold text-slate-700">{selectedItem.bairro}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-medium">Cidade / UF</span>
                      <span className="text-sm font-semibold text-slate-700">{selectedItem.cidade} - {selectedItem.estado}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-slate-400 uppercase font-medium">CEP</span>
                      <span className="text-sm font-semibold text-slate-700 font-mono tracking-tighter">{selectedItem.cep}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Info className="h-3 w-3" />
                      Gestão de Gabinete
                    </h4>
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-slate-400 uppercase font-medium">Cadastrado por (Inicial)</span>
                        <span className="text-sm font-semibold text-slate-700">{selectedItem.responsavel}</span>
                        {selectedItem.created_at && (
                          <span className="text-[9px] text-slate-400">
                            em {new Date(selectedItem.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      {selectedItem.atualizado_por && (
                        <div className="flex flex-col pt-1.5 border-t border-slate-100/50">
                          <span className="text-[10px] text-slate-400 uppercase font-medium">Última atualização por</span>
                          <span className="text-sm font-semibold text-slate-700">{selectedItem.atualizado_por}</span>
                          {selectedItem.updated_at && (
                            <span className="text-[9px] text-slate-400">
                              em {new Date(selectedItem.updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-3 w-3" />
                        Status do Sistema
                      </div>
                      {selectedItem.lembrete_contato_ativo && selectedItem.data_proximo_contato && new Date(selectedItem.data_proximo_contato) < new Date() && (
                        <span className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded-full shadow-lg animate-bounce uppercase tracking-tighter">
                          Atrasado
                        </span>
                      )}
                    </h4>
                    
                    {selectedItem.lembrete_contato_ativo && selectedItem.data_proximo_contato && (
                      <div className={`p-3 rounded-lg border flex flex-col gap-1 ${
                        new Date(selectedItem.data_proximo_contato) < new Date() ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'
                      }`}>
                        <div className={`flex items-center gap-2 font-bold text-[10px] uppercase ${
                          new Date(selectedItem.data_proximo_contato) < new Date() ? 'text-red-700' : 'text-emerald-700'
                        }`}>
                          <Clock className="h-3.5 w-3.5" />
                          Próximo Contato Periódico
                        </div>
                        <span className="text-sm font-bold text-slate-800">
                          {selectedItem.data_proximo_contato.split('-').reverse().join('/')}
                        </span>
                        <p className="text-[9px] text-slate-500">
                          Ciclo de conversas a cada {selectedItem.intervalo_contato_dias} dias.
                        </p>
                      </div>
                    )}

                    {(!selectedItem.demands || !Array.isArray(selectedItem.demands) || selectedItem.demands.length === 0) && (
                      <div className="p-3 rounded-lg border bg-emerald-50/50 border-emerald-100 flex flex-col gap-2">
                        <div className="flex items-center gap-2 font-bold text-[10px] uppercase text-emerald-800">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          Fluxo de Pós-Contato Isolado
                        </div>
                        <p className="text-[9px] text-slate-500 leading-relaxed">
                          Este eleitor não possui demandas cadastradas. Registre o contato direto realizado para manter o relacionamento atualizado.
                        </p>
                        <Button
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8 gap-1.5 shadow-sm rounded-lg"
                          onClick={() => {
                            setSelectedItem(null);
                            handleOpenPostContact(selectedItem);
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Dar Baixa no Pós-Contato
                        </Button>
                      </div>
                    )}

                    <div className="p-3 rounded-lg border bg-green-50/50 border-green-100">
                      <div className="flex items-center gap-2 text-green-700 mb-1">
                        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-[11px] font-bold uppercase tracking-tight">Registro Sincronizado</span>
                      </div>
                      <p className="text-[10px] text-green-600/70">
                        Os dados estão protegidos por criptografia de ponta a ponta no servidor Supabase.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-6 border-t border-slate-100">
                  <p className="text-[9px] text-slate-300 font-mono">
                    ID: {selectedItem.id}
                  </p>
                  <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold text-slate-500" onClick={() => setSelectedItem(null)}>
                    Fechar Detalhes
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 1: REGISTRAR BAIXA DE PÓS-CONTATO ISOLADA */}
      <Dialog open={postContactElector !== null} onOpenChange={() => setPostContactElector(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
              <Phone className="h-5 w-5 text-emerald-600" />
              Baixa de Pós-Contato Isolada
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Registre a conclusão do contato com o eleitor <strong>{postContactElector?.nome_completo}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">Data do Contato</Label>
              <Input
                type="date"
                value={postContactForm.data_contato}
                onChange={(e) => setPostContactForm({ ...postContactForm, data_contato: e.target.value })}
                className="h-10 text-slate-800 font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-600">Resumo / Observações da Conversa</Label>
              <textarea
                placeholder="Ex: Conversamos sobre o asfalto da rua, ele agradeceu o retorno..."
                value={postContactForm.observacoes}
                onChange={(e) => setPostContactForm({ ...postContactForm, observacoes: e.target.value })}
                rows={4}
                className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button variant="ghost" size="sm" onClick={() => setPostContactElector(null)}>
              Cancelar
            </Button>
            <Button 
              size="sm" 
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold" 
              onClick={handleSavePostContact}
            >
              Confirmar e Avançar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: GATILHO DE NOVO AGENDAMENTO DE PÓS-CONTATO */}
      <Dialog open={schedulingNextElector !== null} onOpenChange={() => setSchedulingNextElector(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Agendar Próximo Contato?
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Imediatamente após a baixa, defina uma nova data para conversar com <strong>{schedulingNextElector?.nome_completo}</strong> novamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 bg-blue-50/50 rounded-2xl border border-blue-100 p-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Intervalo Recomendado (Dias)</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  value={schedulingForm.intervalo_dias}
                  onChange={(e) => {
                    const dias = parseInt(e.target.value) || 30;
                    const nextDate = new Date();
                    nextDate.setDate(nextDate.getDate() + dias);
                    setSchedulingForm({
                      ...schedulingForm,
                      intervalo_dias: dias,
                      data_proximo: nextDate.toISOString().split('T')[0]
                    });
                  }}
                  className="h-10 w-24 text-center font-bold text-slate-800 bg-white"
                />
                <span className="text-xs text-slate-500">dias de intervalo periódico</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">Data Agendada</Label>
              <Input
                type="date"
                value={schedulingForm.data_proximo}
                onChange={(e) => setSchedulingForm({ ...schedulingForm, data_proximo: e.target.value })}
                className="h-10 text-slate-800 font-bold bg-white"
              />
            </div>

            <div className="pt-2 border-t border-blue-100 flex items-center gap-2">
              <Checkbox 
                id="schedule-sync-google"
                checked={schedulingForm.syncGoogle}
                onCheckedChange={(checked) => setSchedulingForm({ ...schedulingForm, syncGoogle: !!checked })}
              />
              <Label htmlFor="schedule-sync-google" className="text-xs font-bold text-blue-700 cursor-pointer flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Sincronizar no Google Agenda
              </Label>
            </div>
          </div>

          <div className="flex justify-between items-center border-t pt-4 w-full">
            <Button variant="ghost" size="sm" onClick={() => handleSkipScheduling()}>
              Não agendar agora
            </Button>
            <Button 
              size="sm" 
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold" 
              onClick={handleSaveNewSchedule}
              disabled={isSyncing}
            >
              {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Agendamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RegistrationForm } from './components/RegistrationForm';
import { RegistrationList } from './components/RegistrationList';
import { Dashboard } from './components/Dashboard';
import { AdvancedAnalysis } from './components/AdvancedAnalysis';
import { DemandManager } from './components/DemandManager';
import { getRegistrations, getLocalRegistrations } from './lib/storage';
import { Registration } from './types';
import { QuickRegistrationForm } from './components/QuickRegistrationForm';
import { Database, PlusCircle, Zap, LayoutDashboard, ListFilter, Users, Baby, LogOut, Loader2, MapPin, Shield, User, Mail, ShieldCheck, Lock, Eye, EyeOff, RefreshCcw, Bell, Calendar } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';
import { TeamManagement } from './components/TeamManagement';
import { supabase } from './lib/supabase';
import { googleCalendarService } from './services/googleCalendarService';
import { getApiUrl } from './lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";


interface ProfileContentProps {
  serverConfig?: {
    googleConfigured: boolean;
    googleTokenValid: boolean;
    googleTokenError: string | null;
    googleTokenErrorDetail?: any;
    clientId?: string;
    calendarId: string;
  } | null;
  loadingConfig?: boolean;
  onReauthorize?: () => Promise<void>;
  checkServerHealth?: () => Promise<void>;
}

function ProfileContent({ 
  serverConfig: propsServerConfig, 
  loadingConfig: propsLoadingConfig, 
  onReauthorize, 
  checkServerHealth: propsCheckServerHealth 
}: ProfileContentProps = {}) {
  const { user, profile, signOut } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  
  // Local fallback states if props are not supplied
  const [localServerConfig, setLocalServerConfig] = useState<any>(null);
  const [localLoadingConfig, setLocalLoadingConfig] = useState(false);

  const serverConfig = propsServerConfig !== undefined ? propsServerConfig : localServerConfig;
  const loadingConfig = propsLoadingConfig !== undefined ? propsLoadingConfig : localLoadingConfig;

  const [showManualConfigPanel, setShowManualConfigPanel] = useState(false);
  const [manualClientId, setManualClientId] = useState('');
  const [manualClientSecret, setManualClientSecret] = useState('');
  const [manualRefreshToken, setManualRefreshToken] = useState('');
  const [savingManualToken, setSavingManualToken] = useState(false);

  useEffect(() => {
    if (serverConfig?.clientId && serverConfig.clientId !== 'google-client-configured') {
      setManualClientId(serverConfig.clientId);
    }
  }, [serverConfig]);

  const handleSaveAllManualConfig = async () => {
    if (!manualRefreshToken.trim()) {
      toast.error('O Refresh Token é obrigatório.');
      return;
    }
    setSavingManualToken(true);
    try {
      const saveRes = await fetch(getApiUrl('calendar/save-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          refreshToken: manualRefreshToken.trim(),
          clientId: manualClientId.trim() || undefined,
          clientSecret: manualClientSecret.trim() || undefined
        })
      });
      const saveResult = await saveRes.json();
      if (saveResult.success) {
        toast.success('Configurações salvas e aplicadas com sucesso!');
        setShowManualConfigPanel(false);
        setManualClientSecret('');
        await checkServerHealth();
      } else {
        toast.error(saveResult.error || 'Erro ao salvar configurações.');
      }
    } catch (err) {
      console.error('Error saving manual Google configs:', err);
      toast.error('Erro ao salvar no servidor.');
    } finally {
      setSavingManualToken(false);
    }
  };

  const checkGoogle = async () => {
    try {
      const token = await googleCalendarService.getProviderToken();
      setIsGoogleConnected(!!token);
    } catch (e) {
      console.error('Error checking personal google connection:', e);
    }
  };

  const checkServerHealth = async () => {
    if (propsCheckServerHealth) {
      await propsCheckServerHealth();
      return;
    }
    try {
      const res = await fetch(getApiUrl('health'));
      if (res.ok) {
        const data = await res.json();
        setLocalServerConfig(data);
      }
    } catch (err) {
      console.error('Error fetching server health config:', err);
    }
  };

  useEffect(() => {
    checkGoogle();
    checkServerHealth();
  }, []);

  if (!user) return null;

  const handleGoogleConnect = async () => {
    setLoading(true);
    try {
      await googleCalendarService.connect();
      // After popup closes, refresh the session to get the provider_token
      await supabase.auth.getSession();
      await checkGoogle();
      
      const token = await googleCalendarService.getProviderToken();
      if (token) {
        toast.success('Google Agenda conectado com sucesso!');
      } else {
        toast.warning('Google Agenda não conectado. Verifique se autorizou o acesso.');
      }
    } catch (error) {
      toast.error('Erro ao conectar com Google');
    } finally {
      setLoading(false);
    }
  };

  const handleMasterReauthorize = async () => {
    if (onReauthorize) {
      setLoading(true);
      try {
        await onReauthorize();
      } finally {
        setLoading(false);
      }
      return;
    }

    let clientId = serverConfig?.clientId;
    if (!clientId || clientId === "google-client-configured") {
      clientId = "248457399459-hmpghd1oer1m7ri1d843ttel1g5uatcp.apps.googleusercontent.com";
    }

    setLocalLoadingConfig(true);
    toast.info("Carregando integrador de autenticação do Google...");

    try {
      // Load GSI script dynamically if not present
      await new Promise<void>((resolve, reject) => {
        if ((window as any).google?.accounts?.oauth2) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Erro ao carregar os scripts necessários do Google."));
        document.head.appendChild(script);
      });

      toast.info("Conectando de forma segura...");

      // Initialize code client for hybrid offline access flow on custom CLIENT_ID
      const client = (window as any).google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/calendar.events",
        ux_mode: "popup",
        select_account: true,
        prompt: "consent", // enforces offline-access refresh token on every authorization
        callback: async (response: any) => {
          if (response.error) {
            console.error("GSI Login Error:", response.error);
            toast.error(`Falha no Google: ${response.error}`);
            setLocalLoadingConfig(false);
            return;
          }

          if (response.code) {
            toast.info("Sincronizando chaves no servidor...");
            try {
              const res = await fetch(getApiUrl("calendar/exchange-code"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: response.code })
              });
              const authRes = await res.json();
              if (authRes.success) {
                toast.success(authRes.message || "Conexão estabelecida com sucesso!");
                await checkServerHealth();
              } else {
                toast.error(authRes.error || "Erro ao trocar códigos.");
              }
            } catch (err) {
              console.error("Error exchanging code:", err);
              toast.error("Falha ao comunicar com o servidor.");
            } finally {
              setLocalLoadingConfig(false);
            }
          } else {
            toast.error("Não foi possível gerar a autorização.");
            setLocalLoadingConfig(false);
          }
        }
      });

      client.requestCode();

    } catch (err: any) {
      console.error("Error during master reauth popup flow:", err);
      toast.error(err.message || "Erro na autenticação direta do Google.");
      setLocalLoadingConfig(false);
    }
  };

  const getRoleLabel = (role: string | undefined) => {
    switch (role) {
      case 'vereador': return 'Vereador';
      case 'chefe_de_gabinete': return 'Chefe de Gabinete';
      case 'acessor': return 'Assessor';
      case 'lider': return 'Líder';
      default: return 'Colaborador';
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Senha atualizada com sucesso!');
      setShowPasswordForm(false);
      setNewPassword('');
      setNewPassword(''); // correct clear
      setConfirmPassword('');
    } catch (error: any) {
      toast.error('Erro ao atualizar senha: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col items-center gap-2 pb-3 border-b border-slate-100">
        <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center border-4 border-white shadow-sm">
          <User className="h-8 w-8 text-blue-600" />
        </div>
        <div className="text-center">
          <h3 className="font-bold text-base text-slate-900">{profile?.full_name || 'Operador'}</h3>
          <Badge className="bg-blue-600 text-[10px] mt-0.5">{getRoleLabel(profile?.role)}</Badge>
        </div>
      </div>

      {!showPasswordForm ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
            <Mail className="h-3.5 w-3.5 text-slate-400" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold text-slate-400">E-mail</span>
              <span className="text-xs font-semibold text-slate-700">{user.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-100">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
            <div className="flex flex-col">
              <span className="text-[9px] uppercase font-bold text-slate-400">Nível de Acesso</span>
              <span className="text-xs font-semibold text-slate-700 capitalize">{getRoleLabel(profile?.role)}</span>
            </div>
          </div>

          {/* Sessão de Sincronização do Google Agenda */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3 mt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">Conexão Google Agenda</span>
              </div>
              <div>
                {serverConfig?.googleTokenValid ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Sincronizado
                  </span>
                ) : serverConfig?.googleConfigured ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-100 text-rose-800 border border-rose-200">
                    Expirado / Inválido
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700 border border-slate-300">
                    Não configurado
                  </span>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              {serverConfig?.googleTokenValid ? (
                "A conexão com o Google Agenda do gabinete está ativa e autorizada. Os agendamentos de retorno serão sincronizados automaticamente."
              ) : serverConfig?.googleConfigured ? (
                "O token de acesso do gabinete expirou ou foi revogado no Google Console. Por favor, re-autorize para restabelecer a sincronização automática."
              ) : (
                "Nenhum token ou configuração de integração automática de retorno do gabinete foi encontrada."
              )}
            </p>

            <div className="space-y-2">
              <Button 
                type="button" 
                variant="default" 
                className="w-full text-xs h-8 gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={onReauthorize}
                disabled={loadingConfig}
              >
                <RefreshCcw className={`h-3 w-3 ${loadingConfig ? 'animate-spin' : ''}`} />
                {loadingConfig ? "Carregando..." : "Regerar Token (Reautorizar)"}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-[10px] text-slate-500 hover:text-blue-600 underline"
                  onClick={() => setShowManualConfigPanel(!showManualConfigPanel)}
                >
                  {showManualConfigPanel ? "Ocultar Ajustes Manuais" : "Mostrar Ajustes Manuais (Token manual)"}
                </button>
              </div>

              {showManualConfigPanel && (
                <div className="bg-white border border-slate-200 p-2.5 rounded-md space-y-2.5 mt-2 text-[11px] text-left animate-in slide-in-from-top-1 duration-200">
                  <div className="p-2 border border-blue-200 bg-blue-50/50 rounded text-slate-700 space-y-1 text-[10px] leading-relaxed">
                    <span className="font-bold text-blue-800">🔑 Configuração para Vercel:</span>
                    <p>
                      Para evitar o erro <code>origin_mismatch</code> no Google, você deve usar suas próprias credenciais em produção. Crie um ID de Cliente no <strong>Google Cloud Console</strong> e registre a origem:
                    </p>
                    <div className="bg-slate-100 p-1.5 rounded font-mono text-[9px] select-all break-all border border-slate-200 text-slate-800">
                      https://{window.location.host}
                    </div>
                    <p>
                      Adicione como <strong>Origem JavaScript Autorizada</strong> no Console do Google Cloud.
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-slate-600">Client ID (Opcional)</Label>
                    <Input
                      type="text"
                      placeholder="Deixe em branco para usar o padrão"
                      value={manualClientId}
                      onChange={(e) => setManualClientId(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-slate-600">Client Secret (Opcional)</Label>
                    <Input
                      type="password"
                      placeholder="Deixe em branco para usar o padrão"
                      value={manualClientSecret}
                      onChange={(e) => setManualClientSecret(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-semibold text-slate-600">Refresh Token do Google Agenda (Obrigatório)</Label>
                    <Input
                      type="password"
                      placeholder="Cole o Refresh Token de forma manual"
                      value={manualRefreshToken}
                      onChange={(e) => setManualRefreshToken(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full h-8 bg-slate-900 hover:bg-slate-950 text-white text-[11px]"
                    onClick={handleSaveAllManualConfig}
                    disabled={savingManualToken}
                  >
                    {savingManualToken ? "Salvando..." : "Salvar Configuração Manual"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full text-xs gap-2 border-slate-200"
            onClick={() => setShowPasswordForm(true)}
          >
            <Lock className="h-3.5 w-3.5" />
            Alterar minha senha
          </Button>

          <div className="pt-2">
            <Button 
              variant="ghost" 
              className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 gap-2 text-xs"
              onClick={() => {
                signOut();
                toast.success('Sessão encerrada.');
              }}
            >
              <LogOut className="h-3 w-3" />
              Encerrar Sessão
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handlePasswordChange} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Nova Senha Pessoal</Label>
            <div className="relative">
              <Input 
                type={showPass ? "text" : "password"}
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 text-sm pr-10"
                required
              />
              <button 
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPass(!showPass)}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">Confirmar Nova Senha</Label>
            <Input 
              type="password"
              placeholder="Repita a nova senha"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-9 text-sm"
              required
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button 
              type="button" 
              variant="ghost" 
              className="flex-1 text-xs"
              onClick={() => setShowPasswordForm(false)}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-xs"
              disabled={loading}
            >
              {loading ? 'Salvando...' : 'Salvar Senha'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const { user, profile, loading, signOut, isAdmin, isHighLevel } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingRegistration, setEditingRegistration] = useState<Registration | null>(null);

  // Central cabinet agenda configs and status
  const [serverConfig, setServerConfig] = useState<{
    googleConfigured: boolean;
    googleTokenValid: boolean;
    googleTokenError: string | null;
    googleTokenErrorDetail?: {
      message?: string;
      code?: string;
      status?: number;
      response?: any;
    } | null;
    clientId?: string;
    calendarId: string;
  } | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [newMasterRefreshToken, setNewMasterRefreshToken] = useState<string | null>(null);
  const [showManualTokenDialog, setShowManualTokenDialog] = useState(false);
  const [manualTokenValue, setManualTokenValue] = useState('');
  const [savingManualToken, setSavingManualToken] = useState(false);

  const handleSaveManualToken = async () => {
    if (!manualTokenValue.trim()) {
      toast.error('Por favor, informe o token.');
      return;
    }
    setSavingManualToken(true);
    try {
      const saveRes = await fetch(getApiUrl('calendar/save-token'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: manualTokenValue.trim() })
      });
      const saveResult = await saveRes.json();
      if (saveResult.success) {
        toast.success('Token do gabinete atualizado e persistido com sucesso!');
        setShowManualTokenDialog(false);
        setManualTokenValue('');
        await checkServerHealth();
      } else {
        toast.error(saveResult.error || 'Erro ao persistir o token.');
      }
    } catch (err) {
      console.error('Error saving manual token inside AppContent:', err);
      toast.error('Erro ao conectar com o servidor para salvar o token.');
    } finally {
      setSavingManualToken(false);
    }
  };

  const checkServerHealth = async () => {
    try {
      const res = await fetch(getApiUrl('health'));
      if (res.ok) {
        const data = await res.json();
        setServerConfig(data);
      }
    } catch (err) {
      console.error('Error fetching server health config inside AppContent:', err);
    }
  };

  const handleMasterReauthorize = async () => {
    let clientId = serverConfig?.clientId;
    if (!clientId || clientId === "google-client-configured") {
      clientId = "248457399459-hmpghd1oer1m7ri1d843ttel1g5uatcp.apps.googleusercontent.com";
    }

    setLoadingConfig(true);
    toast.info("Carregando integrador de autenticação do Google...");

    try {
      await new Promise<void>((resolve, reject) => {
        if ((window as any).google?.accounts?.oauth2) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Erro ao carregar os scripts do Google."));
        document.head.appendChild(script);
      });

      toast.info("Conectando de forma segura...");

      const client = (window as any).google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/calendar.events",
        ux_mode: "popup",
        select_account: true,
        prompt: "consent",
        callback: async (response: any) => {
          if (response.error) {
            console.error("GSI Login Error from AppContent:", response.error);
            toast.error(`Falha no Google: ${response.error}`);
            setLoadingConfig(false);
            return;
          }

          if (response.code) {
            toast.info("Sincronizando chaves no servidor...");
            try {
              const res = await fetch(getApiUrl("calendar/exchange-code"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: response.code })
              });
              const authRes = await res.json();
              if (authRes.success) {
                toast.success(authRes.message || "Conexão do gabinete ativa e persistida!");
                await checkServerHealth();
              } else {
                toast.error(authRes.error || "Erro ao salvar chaves.");
              }
            } catch (err) {
              console.error("Error exchanging code inside AppContent:", err);
              toast.error("Erro ao negociar conexão.");
            } finally {
              setLoadingConfig(false);
            }
          } else {
            toast.error("Não foi possível gerar a autorização.");
            setLoadingConfig(false);
          }
        }
      });

      client.requestCode();

    } catch (err: any) {
      console.error("Error in Master Reauthorize inside AppContent:", err);
      toast.error(err.message || "Erro na autenticação direta.");
      setLoadingConfig(false);
    }
  };

  // Filter registrations based on role (vereador, chefe_de_gabinete, and assessor see all)
  const displayedRegistrations = isHighLevel 
    ? registrations 
    : registrations.filter(r => r.responsavel === (profile?.full_name || user?.email?.split('@')[0]));

  useEffect(() => {
    if (user) {
      console.log("[DIAGNOSTICS] Reading server status...");
      checkServerHealth();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user]);

  useEffect(() => {
    // If not high level (vereador, chefe_de_gabinete, assessor), and activeTab is dashboard, redirect to list
    if (!loading && user && !isHighLevel && activeTab === 'dashboard') {
      setActiveTab('list');
    }
  }, [isHighLevel, activeTab, loading, user]);

  const handleEdit = (registration: Registration) => {
    setEditingRegistration(registration);
    setActiveTab('new');
  };

  const refreshData = async (silent = false) => {
    setIsRefreshing(true);
    let toastId: string | number | undefined;
    
    if (!silent) {
       toastId = toast.loading('Sincronizando com o servidor...');
    }

    try {
      const data = await getRegistrations();
      setRegistrations(data);
      if (!silent && toastId) {
        toast.success('Dados sincronizados com sucesso!', { id: toastId });
      }
    } catch (error: any) {
      console.error('Refresh Data Error:', error);
      const fallbackData = getLocalRegistrations();
      setRegistrations(fallbackData);
      
      if (!silent && toastId) {
        toast.error('Erro de sincronização. Exibindo dados locais.', { 
          id: toastId,
          description: error?.message || 'Verifique sua conexão',
          duration: 4000
        });
      } else if (!silent) {
        toast.warning('Exibindo dados locais (erro de sincronização)');
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <p className="text-blue-400 font-bold text-[10px] uppercase tracking-widest animate-pulse">Estabelecendo Conexão...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <Login />
      </>
    );
  }

  const getRoleLabel = (role: string | undefined) => {
    switch (role) {
      case 'vereador': return 'Vereador';
      case 'chefe_de_gabinete': return 'Chefe de Gabinete';
      case 'acessor': return 'Assessor';
      case 'lider': return 'Líder';
      default: return 'Colaborador';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">DataLink</h1>
              <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Gestão e Análise</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Button 
              size="sm" 
              variant="outline"
              className="hidden sm:flex border-blue-200 text-blue-600 hover:bg-blue-50 rounded-lg gap-2"
              onClick={() => setActiveTab('quick')}
            >
              <Zap className="h-4 w-4" />
              Cadastro Rápido
            </Button>
            <Button 
              size="sm" 
              className="hidden sm:flex bg-blue-600 hover:bg-blue-700 text-white rounded-lg gap-2"
              onClick={() => setActiveTab('new')}
            >
              <PlusCircle className="h-4 w-4" />
              Novo Cadastro
            </Button>
            
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8 text-slate-400 hover:text-blue-600"
                  onClick={() => refreshData()}
                  disabled={isRefreshing}
                >
                  <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <div className="hidden lg:flex items-center gap-2 text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                  <Users className="h-4 w-4" />
                  <span>{registrations.length} cadastros ativos</span>
                </div>
              </div>
            
            <div className="h-8 w-px bg-slate-200 mx-2 hidden sm:block" />
            
            <div className="flex items-center gap-3">
              <Dialog>
                <DialogTrigger 
                  render={
                    <Button variant="ghost" className="p-0 hover:bg-transparent flex items-center gap-3 group h-auto">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs font-bold text-slate-900 leading-none group-hover:text-blue-600 transition-colors">{profile?.full_name || user.email?.split('@')[0]}</p>
                        <div className="flex justify-end mt-1">
                          <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 border-blue-200 bg-blue-50 text-blue-700 capitalize group-hover:bg-blue-100 transition-colors">
                            {getRoleLabel(profile?.role)}
                          </Badge>
                        </div>
                      </div>
                      <div className="h-9 w-9 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 group-hover:border-blue-300 transition-all">
                        <User className="h-5 w-5 text-slate-500 group-hover:text-blue-600" />
                      </div>
                    </Button>
                  }
                />
                <DialogContent className="sm:max-w-md bg-white max-h-[90vh] sm:max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <User className="h-5 w-5 text-blue-600" />
                      Perfil do Usuário
                    </DialogTitle>
                    <DialogDescription>
                      Informações da sua conta no sistema DataLink.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <ProfileContent 
                    serverConfig={serverConfig}
                    loadingConfig={loadingConfig}
                    onReauthorize={handleMasterReauthorize}
                    checkServerHealth={checkServerHealth}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {serverConfig?.googleConfigured && !serverConfig?.googleTokenValid && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="flex items-start gap-3">
              <div className="bg-amber-100 p-2.5 rounded-lg text-amber-700 mt-0.5 md:mt-0">
                <Calendar className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                  Revalidação do Google Agenda Necessária
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-200 text-amber-800 border border-amber-300 uppercase">
                    Ação Requerida
                  </span>
                </h4>
                <p className="text-xs text-amber-700 mt-1 max-w-2xl leading-relaxed">
                  O token de integração com a agenda de retorno do gabinete expirou ou foi revogado. 
                  Para garantir a sincronização automática e em tempo real das demandas dos eleitores, é preciso restabelecer a autorização da conta Google.
                </p>
                {serverConfig?.googleTokenError && (
                  <p className="text-[10px] text-amber-600/85 mt-1 font-mono">
                    Motivo: {serverConfig.googleTokenError}
                  </p>
                )}
              </div>
            </div>
            <div className="flex-shrink-0 w-full md:w-auto">
              <Button
                type="button"
                onClick={handleMasterReauthorize}
                disabled={loadingConfig}
                className="w-full md:w-auto bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-sm transition-all h-9"
              >
                {loadingConfig ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Autorizando...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-3.5 w-3.5 animate-spin-slow" />
                    Revalidar Token Agora
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-center md:text-left">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-900">
                {activeTab === 'dashboard' && 'Visão Estratégica'}
                {activeTab === 'analysis' && 'Indicadores de Família'}
                {activeTab === 'list' && 'Base de Dados'}
                {activeTab === 'quick' && 'Cadastro Express'}
                {activeTab === 'new' && 'Cadastro Completo'}
                {activeTab === 'demands' && 'Demandas do Eleitorado'}
                {activeTab === 'team' && 'Gestão de Equipe'}
              </h2>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto md:mx-0">
                {activeTab === 'dashboard' && 'Acompanhe os indicadores e tendências em tempo real.'}
                {activeTab === 'analysis' && 'Métricas detalhadas sobre mães, pais e crianças por bairro.'}
                {activeTab === 'list' && 'Gerencie e filtre todos os registros da plataforma.'}
                {activeTab === 'quick' && 'Capture apenas os dados essenciais para agilizar o atendimento.'}
                {activeTab === 'new' && 'Preencha o perfil detalhado do eleitor com todas as informações.'}
                {activeTab === 'demands' && 'Controle global de pedidos, prazos e pós-contatos.'}
                {activeTab === 'team' && 'Administre os acessos e permissões dos operadores.'}
              </p>
            </div>

            <div className="w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
              <TabsList className="bg-white border border-slate-200 p-1 rounded-xl h-auto inline-flex w-max md:w-auto">
                {isHighLevel && (
                  <TabsTrigger value="dashboard" className="rounded-lg py-2 px-3 md:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                    <LayoutDashboard className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Geral</span>
                  </TabsTrigger>
                )}
                {isHighLevel && (
                  <TabsTrigger value="analysis" className="rounded-lg py-2 px-3 md:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                    <Baby className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Famílias</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="list" className="rounded-lg py-2 px-3 md:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md relative">
                  <ListFilter className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Listagem</span>
                  {(() => {
                    const today = new Date().toISOString().split('T')[0];
                    const lateFollowUpCount = displayedRegistrations.filter(r => 
                      r.lembrete_contato_ativo && 
                      r.data_proximo_contato && 
                      r.data_proximo_contato < today
                    ).length;
                    
                    if (lateFollowUpCount > 0) return (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                        {lateFollowUpCount}
                      </span>
                    );
                    return null;
                  })()}
                </TabsTrigger>
                <TabsTrigger value="quick" className="rounded-lg py-2 px-3 md:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <Zap className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Express</span>
                </TabsTrigger>
                <TabsTrigger value="new" className="rounded-lg py-2 px-3 md:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                  <PlusCircle className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">{editingRegistration ? 'Editar' : 'Completo'}</span>
                </TabsTrigger>
                <TabsTrigger value="demands" className="rounded-lg py-2 px-3 md:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md relative">
                  <Bell className="h-4 w-4 md:mr-2" />
                  <span className="hidden md:inline">Demandas</span>
                  {(() => {
                    const today = new Date().toISOString().split('T')[0];
                    const lateCount = displayedRegistrations.flatMap(r => r.demands || []).filter(d => d.atendido && !d.retorno_realizado && d.data_prevista_retorno! < today).length;
                    if (lateCount > 0) return (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow-sm ring-2 ring-white">
                        {lateCount}
                      </span>
                    );
                    return null;
                  })()}
                </TabsTrigger>
                {isAdmin && (
                  <TabsTrigger value="team" className="rounded-lg py-2 px-3 md:px-4 data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md">
                    <Shield className="h-4 w-4 md:mr-2" />
                    <span className="hidden md:inline">Equipe</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
          </div>

          {isHighLevel && (
            <TabsContent value="dashboard" className="space-y-6 outline-none">
              <Dashboard data={displayedRegistrations} />
            </TabsContent>
          )}

          {isHighLevel && (
            <TabsContent value="analysis" className="space-y-6 outline-none">
              <AdvancedAnalysis data={displayedRegistrations} />
            </TabsContent>
          )}

          <TabsContent value="list" className="outline-none">
            <RegistrationList data={displayedRegistrations} onRefresh={refreshData} onEdit={handleEdit} />
          </TabsContent>

          <TabsContent value="quick" className="outline-none">
            <div className="max-w-4xl mx-auto">
              <QuickRegistrationForm 
                onSuccess={() => {
                  refreshData();
                  setActiveTab('list');
                }}
                onCancel={() => {
                  setActiveTab('list');
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="new" className="outline-none">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                  <MapPin className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-blue-900">{editingRegistration ? 'Editando Registro' : 'Preenchimento Inteligente'}</h4>
                  <p className="text-xs text-blue-700 mt-0.5">
                    {editingRegistration 
                      ? `Você está editando os dados de ${editingRegistration.nome_completo}`
                      : 'Insira o CEP para carregar automaticamente o logradouro, bairro, cidade e estado.'}
                  </p>
                </div>
              </div>
              <RegistrationForm 
                initialData={editingRegistration || undefined}
                onSuccess={() => {
                  refreshData();
                  setActiveTab('list');
                  setEditingRegistration(null);
                }} 
                onCancel={() => {
                  setActiveTab('list');
                  setEditingRegistration(null);
                }}
              />
            </div>
          </TabsContent>

          <TabsContent value="demands" className="outline-none">
            <DemandManager registrations={displayedRegistrations} onRefresh={refreshData} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="team" className="outline-none">
              <TeamManagement />
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="mt-12 py-8 bg-white border-t border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 opacity-50">
            <Database className="h-4 w-4" />
            <span className="text-xs font-bold uppercase tracking-widest">DataLink v1.0</span>
          </div>
          <p className="text-xs text-slate-400">© 2026 DataLink - Sistema de Gestão de Cadastros. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}


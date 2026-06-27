import React, { useState, useEffect } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/src/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { Profile, UserRole } from '@/src/types';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Shield, UserPlus, Mail, ShieldCheck, UserCheck, Copy, Check, Lock, Unlock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from './ConfirmDialog';

export function TeamManagement() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { profile: currentProfile, isAdmin } = useAuth();
  
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    role: 'acessor' as UserRole
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [roleChangeData, setRoleChangeData] = useState<{userId: string, role: UserRole} | null>(null);
  const [blockData, setBlockData] = useState<{userId: string, isBlocked: boolean} | null>(null);
  const [deleteData, setDeleteData] = useState<{userId: string, name: string} | null>(null);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      toast.error('Apenas administradores podem criar usuários.');
      return;
    }

    if (!newUser.email || !newUser.password || !newUser.confirmPassword || !newUser.fullName) {
      toast.error('Preencha todos os campos.');
      return;
    }

    if (newUser.password !== newUser.confirmPassword) {
      toast.error('As senhas não coincidem.');
      return;
    }

    if (newUser.password.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setCreatingUser(true);
    const toastId = toast.loading('Criando novo usuário...');
    
    try {
      const emailLower = newUser.email.trim().toLowerCase();
      
      // Query profiles including soft-deleted ones from database
      const { data: dbProfiles, error: dbError } = await supabase
        .from('profiles')
        .select('*')
        .ilike('email', emailLower);

      if (dbError) {
        console.error('Error checking database profiles:', dbError);
      }

      const existingProfile = dbProfiles && dbProfiles.length > 0 ? dbProfiles[0] : null;

      if (existingProfile) {
        if (existingProfile.is_deleted) {
          // If the profile exists but is soft-deleted, REACTIVATE IT!
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              is_deleted: false,
              is_blocked: false,
              full_name: newUser.fullName,
              role: newUser.role,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingProfile.id);

          if (updateError) {
            throw updateError;
          }

          toast.success(`Operador ${newUser.email} reativado com sucesso! Como a conta já existia no banco central de acessos, ele pode se conectar com a senha anterior ou redefini-la se necessário.`, { id: toastId });
          setNewUser({ email: '', password: '', confirmPassword: '', fullName: '', role: 'acessor' });
          fetchProfiles();
          setCreatingUser(false);
          return;
        } else {
          // Profile exists and is active
          throw new Error('User already registered');
        }
      }

      // 1. Create a non-persist session client to sign up the new user without logging out the current admin
      const tempSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      // Create the user in Auth
      let authResult = await tempSupabase.auth.signUp({
        email: newUser.email,
        password: newUser.password,
        options: {
          data: {
            full_name: newUser.fullName,
            role: newUser.role,
          }
        }
      });

      // Se der erro de banco de dados (geralmente por conta do ENUM do trigger), tenta fallback sem metadados de papel para garantir a criação
      const isDbError = authResult.error && (
        authResult.error.message.toLowerCase().includes('database error') || 
        authResult.error.message.toLowerCase().includes('erro de banco')
      );

      if (isDbError) {
        console.warn('Database error during signup, attempting fallback signup with default "lider" role metadata...');
        authResult = await tempSupabase.auth.signUp({
          email: newUser.email,
          password: newUser.password,
          options: {
            data: {
              full_name: newUser.fullName,
              role: 'lider', // sempre existe no enum de papéis e garante o sucesso do trigger
            }
          }
        });
      }

      const { data: authData, error: authError } = authResult;

      if (authError) {
        const isAuthRegError = authError.message === 'User already registered' || authError.message.includes('already registered');
        if (!isAuthRegError) {
          console.error('DETAILED_AUTH_ERROR:', authError);
        }
        throw authError;
      }

      if (authData.user) {
        // 2. Tentar criar o perfil. 
        // Nota: O AuthContext também criará o perfil no primeiro login se este passo falhar (comum devido a RLS).
        console.log('User created in Auth, attempting profile creation for:', authData.user.id);
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({ 
            id: authData.user.id,
            role: newUser.role,
            full_name: newUser.fullName,
            email: newUser.email,
            created_at: new Date().toISOString()
          });

        if (profileError) {
          console.error('DETAILED_PROFILE_ERROR:', profileError);
          console.warn('Profile creation sync warning, attempting fallback to "lider" role...', profileError);
          
          // Se falhou por conta do ENUM do perfil (por ex, acessor/assessor), tenta com lider
          const { error: fallbackProfileError } = await supabase
            .from('profiles')
            .upsert({ 
              id: authData.user.id,
              role: 'lider',
              full_name: newUser.fullName,
              email: newUser.email,
              created_at: new Date().toISOString()
            });

          if (fallbackProfileError) {
            console.error('Fallback profile creation failed too:', fallbackProfileError);
          } else {
            toast.warning(`Usuário criado com perfil 'Líder'. Para habilitar o papel de '${newUser.role}', execute o script 'supabase_migration.sql' no painel SQL do seu Supabase.`, { duration: 8000 });
          }
        } else {
          toast.success(`Operador ${newUser.email} registrado! O sistema enviou um e-mail de confirmação obrigatório.`, { id: toastId });
        }

        setNewUser({ email: '', password: '', confirmPassword: '', fullName: '', role: 'acessor' });
        fetchProfiles();
      }
    } catch (error: any) {
      const isRegError = error.message === 'User already registered' || error.message.includes('already registered');
      if (!isRegError) {
        console.error('CREATE_USER_FATAL_ERROR:', error);
      }
      let errorMessage = error.message || 'Verifique o console (F12) para detalhes';
      if (isRegError) {
        errorMessage = 'Este e-mail já está cadastrado no sistema por outro operador.';
      } else if (errorMessage.includes('Password should be')) {
        errorMessage = 'A senha não atende aos requisitos mínimos de segurança.';
      }
      toast.error(`Erro ao criar usuário: ${errorMessage}`, { id: toastId });
    } finally {
      setCreatingUser(false);
    }
  };

  const registrationLink = typeof window !== 'undefined' ? `${window.location.origin}` : '';

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const activeProfiles = (data || []).filter(p => !p.is_deleted);
      setProfiles(activeProfiles);
    } catch (error: any) {
      toast.error('Erro ao buscar perfis: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleRoleChange = async () => {
    if (!roleChangeData) return;
    const { userId, role: newRole } = roleChangeData;

    if (!isAdmin) {
      toast.error('Acesso negado. Apenas Vereadores e Chefes de Gabinete.');
      return;
    }

    const toastId = toast.loading('Atualizando cargo...');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) throw error;
      toast.success('Cargo atualizado!', { id: toastId });
      fetchProfiles();
    } catch (error: any) {
      toast.error('Erro: ' + error.message, { id: toastId });
    } finally {
      setRoleChangeData(null);
    }
  };

  const handleToggleBlock = async () => {
    if (!blockData) return;
    const { userId, isBlocked } = blockData;

    if (!isAdmin) {
      toast.error('Acesso negado.');
      return;
    }

    const toastId = toast.loading(isBlocked ? 'Bloqueando usuário...' : 'Desbloqueando usuário...');
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_blocked: isBlocked })
        .eq('id', userId);

      if (error) throw error;
      toast.success(isBlocked ? 'Usuário bloqueado!' : 'Usuário desbloqueado!', { id: toastId });
      fetchProfiles();
    } catch (error: any) {
      toast.error('Erro: ' + error.message, { id: toastId });
    } finally {
      setBlockData(null);
    }
  };

  const handleDeleteProfile = async () => {
    if (!deleteData) return;
    const { userId } = deleteData;

    if (!isAdmin) {
      toast.error('Acesso negado.');
      return;
    }

    const toastId = toast.loading('Removendo acesso...');
    try {
      // Soft-delete the profile by setting is_deleted: true and is_blocked: true.
      // This leaves the Auth user intact, but they cannot login or view the team list.
      const { error } = await supabase
        .from('profiles')
        .update({ 
          is_deleted: true, 
          is_blocked: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;
      toast.success('Acesso removido com sucesso!', { id: toastId });
      fetchProfiles();
    } catch (error: any) {
      toast.error('Erro: ' + error.message, { id: toastId });
    } finally {
      setDeleteData(null);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`${registrationLink}`);
    setCopied(true);
    toast.success('Link de cadastro copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'vereador': return <Badge className="bg-purple-600">Vereador</Badge>;
      case 'chefe_de_gabinete': return <Badge className="bg-blue-600">Chefe de Gabinete</Badge>;
      case 'acessor': return <Badge className="bg-emerald-600">Assessor</Badge>;
      case 'lider': return <Badge className="bg-slate-600">Líder</Badge>;
      default: return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-slate-200">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Shield className="h-5 w-5 text-blue-600" />
                  Controle de Operadores
                </CardTitle>
                <CardDescription>
                  Visualize e gerencie quem tem acesso ao sistema do gabinete.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
                {profiles.length} Ativos
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-slate-100 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700">Membro da Equipe</TableHead>
                    <TableHead className="font-bold text-slate-700 text-center">Nível de Acesso</TableHead>
                    <TableHead className="font-bold text-slate-700 text-center">Alterar Cargo</TableHead>
                    <TableHead className="text-right font-bold text-slate-700">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id} className={`hover:bg-slate-50/30 transition-colors ${p.is_blocked ? 'bg-red-50/20' : ''}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full shadow-sm ${p.is_blocked ? 'bg-red-100' : 'bg-blue-600'}`}>
                            {p.is_blocked ? (
                              <Lock className="h-4 w-4 text-red-600" />
                            ) : (
                              <UserCheck className="h-4 w-4 text-white" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-800">{p.full_name || 'Usuário em Ativação'}</p>
                              {p.is_blocked && (
                                <Badge variant="destructive" className="text-[8px] py-0 h-4 px-1 uppercase">Bloqueado</Badge>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono tracking-tighter">{p.email || p.id.slice(0, 12)}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {getRoleBadge(p.role)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Select 
                          value={p.role} 
                          onValueChange={(val) => setRoleChangeData({ userId: p.id, role: val as UserRole })}
                          disabled={!isAdmin || p.id === currentProfile?.id || p.is_blocked}
                        >
                          <SelectTrigger className="w-[150px] h-9 mx-auto text-xs bg-white border-slate-200 shadow-sm focus:ring-blue-500">
                            <SelectValue placeholder="Configurar" />
                          </SelectTrigger>
                          <SelectContent className="w-[200px]">
                            <SelectItem value="vereador">
                              <div className="flex items-center gap-2 py-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-purple-600" />
                                <span className="text-[11px] font-bold">Vereador (Admin)</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="chefe_de_gabinete">
                              <div className="flex items-center gap-2 py-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                                <span className="text-[11px] font-bold">Chefe de Gabinete</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="acessor">
                              <div className="flex items-center gap-2 py-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                                <span className="text-[11px] font-bold">Assessor (Edição)</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="lider">
                              <div className="flex items-center gap-2 py-1">
                                <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                                <span className="text-[11px] font-bold">Líder (Consulta)</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {p.id !== currentProfile?.id && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${p.is_blocked ? 'text-emerald-600 hover:text-emerald-700' : 'text-orange-600 hover:text-orange-700'}`}
                                onClick={() => setBlockData({ userId: p.id, isBlocked: !p.is_blocked })}
                                disabled={!isAdmin}
                                title={p.is_blocked ? "Desbloquear" : "Bloquear"}
                              >
                                {p.is_blocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:text-red-700"
                                onClick={() => setDeleteData({ userId: p.id, name: p.full_name || p.email || 'Usuário' })}
                                disabled={!isAdmin}
                                title="Remover Acesso"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {loading && (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-blue-100 shadow-lg shadow-blue-500/5 overflow-hidden">
            <div className="bg-blue-600 p-4 text-white">
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Novo Operador
              </CardTitle>
            </div>
            <CardContent className="pt-6">
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs font-bold text-slate-700">Nome Completo</Label>
                  <Input 
                    id="fullName"
                    placeholder="Ex: João Silva" 
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({...newUser, fullName: e.target.value})}
                    className="h-9 text-sm"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-bold text-slate-700">E-mail de Acesso</Label>
                  <Input 
                    id="email"
                    type="email"
                    placeholder="joao@exemplo.com" 
                    value={newUser.email}
                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-bold text-slate-700">Senha Provisória</Label>
                  <Input 
                    id="password"
                    type="password"
                    placeholder="Mínimo 6 caracteres" 
                    value={newUser.password}
                    onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-xs font-bold text-slate-700">Confirmar Senha</Label>
                  <Input 
                    id="confirmPassword"
                    type="password"
                    placeholder="Repita a senha" 
                    value={newUser.confirmPassword}
                    onChange={(e) => setNewUser({...newUser, confirmPassword: e.target.value})}
                    className="h-9 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-xs font-bold text-slate-700">Escopo da Função</Label>
                  <Select 
                    value={newUser.role} 
                    onValueChange={(val) => setNewUser({...newUser, role: val as UserRole})}
                  >
                    <SelectTrigger id="role" className="h-11 text-sm border-slate-200 focus:ring-blue-500">
                      <SelectValue placeholder="Selecione o cargo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acessor" className="py-2">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                             <div className="h-2 w-2 rounded-full bg-emerald-500" />
                             <span className="font-bold text-[11px] uppercase tracking-tight">Assessor de Gabinete</span>
                          </div>
                          <span className="text-[9px] text-slate-500 mt-0.5 leading-none">Acesso padrão para edição de registros</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="lider" className="py-2">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                             <div className="h-2 w-2 rounded-full bg-slate-400" />
                             <span className="font-bold text-[11px] uppercase tracking-tight">Líder Comunitário</span>
                          </div>
                          <span className="text-[9px] text-slate-500 mt-0.5 leading-none">Acesso de consulta e visualização analítica</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 transition-colors"
                  disabled={creatingUser}
                >
                  {creatingUser ? 'Criando...' : 'Cadastrar na Equipe'}
                </Button>
                
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400 text-center leading-tight">
                    O usuário precisará confirmar o e-mail (se habilitado no Supabase) antes do primeiro acesso.
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>


          <Card className="bg-slate-950 text-white border-0">
            <CardHeader>
              <CardTitle className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-blue-400">
                <ShieldCheck className="h-4 w-4" />
                Permissões Detalhadas
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-500">
                O que cada nível pode fazer no sistema
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Badge className="bg-blue-600 text-[10px]">Vereador / Chefe</Badge>
                    <span className="text-[10px] text-blue-400 font-bold">ADMIN</span>
                  </div>
                  <ul className="text-[10px] text-slate-400 list-disc list-inside space-y-1 ml-1">
                    <li>Gestão total da equipe (cargos)</li>
                    <li>Visualizar logs de segurança</li>
                    <li>Cadastrar, editar e excluir registros</li>
                    <li>Exportar relatórios completos</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Badge className="bg-emerald-600 text-[10px]">Assessor</Badge>
                    <span className="text-[10px] text-emerald-400 font-bold">OPERADOR</span>
                  </div>
                  <ul className="text-[10px] text-slate-400 list-disc list-inside space-y-1 ml-1">
                    <li>Cadastrar novos eleitores/cidadãos</li>
                    <li>Editar informações de registros</li>
                    <li>Visualizar listagem e dashboard</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Badge className="bg-slate-600 text-[10px]">Líder / Outros</Badge>
                    <span className="text-[10px] text-slate-500 font-bold">VIRTUAL</span>
                  </div>
                  <ul className="text-[10px] text-slate-500 list-disc list-inside space-y-1 ml-1">
                    <li>Apenas visualização de dados</li>
                    <li>Não pode editar ou excluir nada</li>
                    <li>Acesso restrito a relatórios</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog 
        isOpen={roleChangeData !== null}
        onClose={() => setRoleChangeData(null)}
        onConfirm={handleRoleChange}
        title="Alterar Nível de Acesso"
        description="Você está prestes a alterar o nível de acesso deste usuário. Isso impactará o que ele pode visualizar e editar no sistema."
        confirmLabel="Sim, Alterar"
        variant="info"
      />

      <ConfirmDialog 
        isOpen={blockData !== null}
        onClose={() => setBlockData(null)}
        onConfirm={handleToggleBlock}
        title={blockData?.isBlocked ? "Bloquear Usuário" : "Desbloquear Usuário"}
        description={blockData?.isBlocked ? "Este usuário não poderá mais acessar o sistema até ser desbloqueado." : "O acesso deste usuário ao sistema será restaurado."}
        confirmLabel={blockData?.isBlocked ? "Bloquear" : "Desbloquear"}
        variant={blockData?.isBlocked ? "danger" : "info"}
      />

      <ConfirmDialog 
        isOpen={deleteData !== null}
        onClose={() => setDeleteData(null)}
        onConfirm={handleDeleteProfile}
        title="Remover Acesso da Equipe"
        description={`Tem certeza que deseja remover o acesso de ${deleteData?.name}? O perfil dele será excluído, mas os registros criados por ele permanecerão.`}
        confirmLabel="Remover Acesso"
        variant="danger"
      />
    </div>
  );
}

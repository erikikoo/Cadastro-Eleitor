import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/src/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Mail, Lock, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const authSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
});

type AuthValues = z.infer<typeof authSchema>;

export function Login() {
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AuthValues>({
    resolver: zodResolver(authSchema),
  });

  const onSubmit = async (values: AuthValues) => {
    if (!supabase || !supabase.auth) {
      toast.error('Supabase não está configurado. Verifique as variáveis de ambiente.');
      return;
    }
    
    setIsLoading(true);
    const toastId = toast.loading('Autenticando...');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      
      if (error) {
        if (error.message.includes('Email not confirmed')) {
          throw new Error('Confirmação pendente. Verifique seu e-mail (procure por Supabase ou DataLink).');
        }
        if (error.message === 'Invalid login credentials') {
          throw new Error('E-mail ou senha incorretos. Verifique se o e-mail foi confirmado.');
        }
        throw error;
      }

      if (data.session) {
        toast.success('Bem-vindo ao DataLink!', { id: toastId });
      }
    } catch (error: any) {
      toast.error(error.message, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4 font-sans selection:bg-blue-500 selection:text-white">
      {/* Visual Accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-blue-600 rounded-2xl shadow-xl shadow-blue-900/50 mb-4">
            <Database className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white mb-1">DataLink</h1>
          <div className="flex items-center justify-center gap-2">
            <span className="h-px w-8 bg-blue-500/30"></span>
            <p className="text-[10px] text-blue-400 uppercase font-black tracking-[0.3em]">Ambiente Seguro</p>
            <span className="h-px w-8 bg-blue-500/30"></span>
          </div>
        </div>

        <Card className="border-white/5 bg-white/5 backdrop-blur-xl shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl text-white font-bold">
              Autenticação de Operador
            </CardTitle>
            <CardDescription className="text-slate-400">
              Identifique-se para gerenciar os dados do sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Identificador (E-mail)</Label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                  <Input
                    id="email"
                    placeholder="usuario@datalink.com"
                    className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
                    {...register('email')}
                  />
                </div>
                {errors.email && <p className="text-xs font-medium text-red-400">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" title="Senha" className="text-slate-300">Chave de Segurança</Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10 h-11 bg-white/5 border-white/10 text-white placeholder:text-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
                    {...register('password')}
                  />
                </div>
                {errors.password && <p className="text-xs font-medium text-red-400">{errors.password.message}</p>}
              </div>

              <Button type="submit" className="w-full h-11 bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-900/20" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Entrar Agora'
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 border-t border-white/5 pt-6 mt-4">
            <div className="text-[11px] text-center text-slate-500 bg-slate-900/50 p-3 rounded-lg border border-white/5">
              <p>A exclusividade de acesso é garantida pela administração.</p>
              <p className="mt-1">Caso não possua acesso, solicite ao <span className="text-blue-400 font-bold">Administrador do Sistema</span>.</p>
            </div>
            <div className="flex items-center justify-center gap-4 text-[10px] text-slate-600 font-bold uppercase tracking-widest mt-2">
              <span>GDPR/LGPD</span>
              <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
              <span>Encriptação AES-256</span>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

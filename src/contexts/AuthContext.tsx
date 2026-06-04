import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/src/lib/supabase';
import { User, Session } from '@supabase/supabase-js';
import { Profile, UserRole } from '@/src/types';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isConfigured: boolean;
  isAdmin: boolean;
  isHighLevel: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string, userAttributes?: { email?: string, full_name?: string, role?: UserRole }) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code === 'PGRST116') {
        // Profile not found, let's create a default one
        const userEmail = userAttributes?.email;
        const metaName = userAttributes?.full_name;
        const metaRole = userAttributes?.role;
        
        const isOwner = userEmail === 'paerik@gmail.com';
        const isStaff = userEmail === 'andersonmaroque@gmail.com';
        
        const defaultRole = metaRole || (isOwner ? 'vereador' : (isStaff ? 'chefe_de_gabinete' : 'lider'));
        
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .upsert({ 
            id: userId, 
            role: defaultRole, 
            full_name: metaName || userEmail?.split('@')[0] || 'Novo Operador',
            email: userEmail,
            is_blocked: false,
            created_at: new Date().toISOString()
          }, { onConflict: 'id' })
          .select()
          .single();
        
        if (createError) {
          console.error('Error creating default profile:', createError);
          return null;
        }
        return newProfile as Profile;
      }

      const p = data as Profile;
      if (p?.is_deleted) {
        toast.error('Sua conta foi removida do sistema.');
        await supabase.auth.signOut();
        return null;
      }

      if (p?.is_blocked) {
        toast.error('Sua conta está bloqueada. Entre em contato com o administrador.');
        await supabase.auth.signOut();
        return null;
      }

      // Ensure profile exists
      if (data) {
        // Just return existing
      }

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      return data as Profile;
    } catch (err) {
      console.error('Catch error fetching profile:', err);
      return null;
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    // Handle initial session and changes in one place
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth State Change:', event, session?.user?.email);
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setUser(session.user);
        setLoading(false);
        // Fetch profile in background
        fetchProfile(session.user.id, { 
          email: session.user.email, 
          full_name: session.user.user_metadata?.full_name,
          role: session.user.user_metadata?.role as UserRole
        }).then(prof => {
          setProfile(prof);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // Fallback getSession in case onAuthStateChange is slow to trigger initially
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !user) {
        setSession(session);
        setUser(session.user);
        fetchProfile(session.user.id, { 
          email: session.user.email, 
          full_name: session.user.user_metadata?.full_name,
          role: session.user.user_metadata?.role as UserRole
        }).then(setProfile);
      }
      // If we don't have a session after the getSession call, we should stop loading
      if (!session) {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
  };

  const isAdmin = profile?.role === 'vereador' || profile?.role === 'chefe_de_gabinete';
  const isHighLevel = isAdmin || profile?.role === 'acessor' || profile?.role === 'assessor';

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      session, 
      loading, 
      signOut, 
      isConfigured: isSupabaseConfigured,
      isAdmin,
      isHighLevel
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

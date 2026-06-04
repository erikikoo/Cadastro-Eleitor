import { Demand, Registration } from '@/src/types';
import { supabase } from '@/src/lib/supabase';
import { getApiUrl } from '@/src/lib/api';

/**
 * Service to handle Google Calendar integration
 */
export const googleCalendarService = {
  /**
   * Initiate Google OAuth sign-in flow via Supabase to request custom Calendar scopes
   */
  async connect() {
    console.log('[googleCalendarService] Connecting to Google through Supabase Auth...');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar.events',
        redirectTo: window.location.origin + '/api/auth/callback',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) {
      console.error('[googleCalendarService] Auth connection failed:', error);
      throw error;
    }

    return { success: true };
  },

  /**
   * Helper to get the personal user's provider token from the current session
   */
  async getProviderToken() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.provider_token || null;
    } catch (e) {
      console.error('[googleCalendarService] Error fetching provider token:', e);
      return null;
    }
  },

  /**
   * Helper to get the personal user's provider refresh token from the current session
   */
  async getProviderRefreshToken() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.provider_refresh_token || null;
    } catch (e) {
      console.error('[googleCalendarService] Error fetching provider refresh token:', e);
      return null;
    }
  },

  /**
   * Syncs custom details from the registration and demand model to a Google Calendar event.
   */
  async createEvent(
    registration: Registration, 
    demand: Demand, 
    creator?: { full_name?: string | null; role?: string } | null
  ): Promise<{ success: boolean; disabled?: boolean; data?: { id: string | null } | null; error?: string }> {
    try {
      const googleAccessToken = await this.getProviderToken();

      // Formulate detailed agenda metadata representing the active cabinet demand
      const event = {
        summary: `Retorno Demanda - ${registration.nome_completo}`,
        description: `🔹 Nome Completo: ${registration.nome_completo}\n🔹 Assunto/Demanda: ${demand.assunto}\n🔹 Observação: ${demand.observacoes || 'Nenhuma'}\n🔹 Responsável do Gabinete: ${creator?.full_name || 'Gabinete'}`,
        start: {
          date: demand.data_prevista_retorno || new Date().toISOString().split('T')[0],
        },
        end: {
          date: demand.data_prevista_retorno || new Date().toISOString().split('T')[0],
        },
      };

      const response = await fetch(getApiUrl('calendar/sync'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event,
          eventId: demand.google_event_id || undefined,
          googleAccessToken: googleAccessToken
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return { 
          success: false, 
          error: errData.error || `Erro HTTP ${response.status}` 
        };
      }

      const result = await response.ok ? await response.json() : {};
      return { 
        success: true, 
        data: { id: result.id || result.eventId || null } 
      };
    } catch (e: any) {
      console.error('[googleCalendarService] Sincronização falhou:', e);
      return { 
        success: false, 
        error: e.message || 'Erro inesperado ao sincronizar com o Google Agenda.' 
      };
    }
  }
};

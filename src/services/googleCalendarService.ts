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
   * Helper to combine a YYYY-MM-DD date with the current local clock and format for Google Calendar ISO-8601
   */
  getDateTimeWithCurrentTime(dateString: string): { start: string; end: string } {
    if (!dateString) {
      dateString = new Date().toISOString().split('T')[0];
    }
    
    // If it already has a full ISO datetime (containing 'T'), we can parse it
    if (dateString.includes('T')) {
      const parsedDate = new Date(dateString);
      if (!isNaN(parsedDate.getTime())) {
        const start = parsedDate.toISOString();
        const end = new Date(parsedDate.getTime() + 60 * 60 * 1000).toISOString();
        return { start, end };
      }
    }

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const tzOffsetMinutes = -now.getTimezoneOffset();
    const diffSign = tzOffsetMinutes >= 0 ? '+' : '-';
    const pad = (num: number) => String(Math.abs(num)).padStart(2, '0');
    const tzOffsetString = diffSign + pad(Math.floor(tzOffsetMinutes / 60)) + ':' + pad(tzOffsetMinutes % 60);

    const start = `${dateString}T${hours}:${minutes}:${seconds}${tzOffsetString}`;

    const endNow = new Date(now.getTime() + 60 * 60 * 1000);
    const endHours = String(endNow.getHours()).padStart(2, '0');
    const endMinutes = String(endNow.getMinutes()).padStart(2, '0');
    const endSeconds = String(endNow.getSeconds()).padStart(2, '0');
    const end = `${dateString}T${endHours}:${endMinutes}:${endSeconds}${tzOffsetString}`;

    return { start, end };
  },

  /**
   * Syncs custom details from the registration and demand model to a Google Calendar event.
   */
  async createEvent(
    registration: Registration, 
    demand: Demand, 
    creator?: { full_name?: string | null; role?: string } | null
  ): Promise<{ success: boolean; disabled?: boolean; data?: { id: string | null } | null; error?: string; fallbackToPrimaryUsed?: boolean }> {
    try {
      const googleAccessToken = await this.getProviderToken();

      const { start, end } = this.getDateTimeWithCurrentTime(demand.data_prevista_retorno || '');

      // Formulate detailed agenda metadata representing the active cabinet demand
      const event = {
        summary: `Retorno Demanda - ${registration.nome_completo}`,
        description: `✅ Cadastro de Eleitor e Demanda Realizado com Sucesso!\n\n🔹 Nome Completo: ${registration.nome_completo}\n🔹 Assunto/Demanda: ${demand.assunto}\n🔹 Observação: ${demand.observacoes || 'Nenhuma'}\n🔹 Responsável do Gabinete: ${creator?.full_name || 'Gabinete'}\n\n📢 Lembrete de retorno registrado de forma automática pelo sistema de Gabinete.`,
        start: {
          dateTime: start,
        },
        end: {
          dateTime: end,
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

      const result = await response.json().catch(() => ({}));
      return { 
        success: true, 
        data: { id: result.id || result.eventId || null },
        fallbackToPrimaryUsed: !!result.fallbackToPrimaryUsed
      };
    } catch (e: any) {
      console.error('[googleCalendarService] Sincronização falhou:', e);
      return { 
        success: false, 
        error: e.message || 'Erro inesperado ao sincronizar com o Google Agenda.' 
      };
    }
  },

  /**
   * Syncs the post-contact reminder (Pós-Contato) for a registered elector to Google Calendar.
   */
  async createPostContactEvent(
    registration: Registration,
    creator?: { full_name?: string | null; role?: string } | null
  ): Promise<{ success: boolean; data?: { id: string | null } | null; error?: string; fallbackToPrimaryUsed?: boolean }> {
    try {
      if (!registration.lembrete_contato_ativo || !registration.data_proximo_contato) {
        return { success: false, error: 'Lembrete de contato desativado para este eleitor.' };
      }

      const googleAccessToken = await this.getProviderToken();

      const { start, end } = this.getDateTimeWithCurrentTime(registration.data_proximo_contato);

      const event = {
        summary: `📞 Pós-Contato - ${registration.nome_completo}`,
        description: `✅ Cadastro de Eleitor Realizado com Sucesso!\n\n📢 Lembrete de Pós-Contato com o Eleitor:\n🔹 Nome Completo: ${registration.nome_completo}\n🔹 WhatsApp/Celular: ${registration.whatsapp || 'Não informado'}\n🔹 Responsável pelo Cadastro: ${creator?.full_name || 'Gabinete'}\n🔹 Cidade: ${registration.cidade || 'Não informada'}\n🔹 Bairro: ${registration.bairro || 'Não informado'}\n\nLembrete de retorno de contato sugerido em ${registration.intervalo_contato_dias} dias após o cadastro, registrado automaticamente pelo sistema de Gabinete.`,
        start: {
          dateTime: start,
        },
        end: {
          dateTime: end,
        },
      };

      const response = await fetch(getApiUrl('calendar/sync'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event,
          eventId: registration.google_contact_event_id || undefined,
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

      const result = await response.json().catch(() => ({}));
      return { 
        success: true, 
        data: { id: result.id || result.eventId || null },
        fallbackToPrimaryUsed: !!result.fallbackToPrimaryUsed
      };
    } catch (e: any) {
      console.error('[googleCalendarService] Sincronização de pós-contato falhou:', e);
      return { 
        success: false, 
        error: e.message || 'Erro inesperado ao sincronizar pós-contato.' 
      };
    }
  }
};

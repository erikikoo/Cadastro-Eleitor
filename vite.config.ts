import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import fs from 'fs';

export default defineConfig(({mode}) => {
  // Automatic .env creation from .env.example if missing
  const envPath = path.resolve(__dirname, '.env');
  const examplePath = path.resolve(__dirname, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
    try {
      fs.copyFileSync(examplePath, envPath);
      console.log('Successfully created .env from .env.example fallback for Vite');
    } catch (err) {
      console.error('Failed to copy .env.example to .env in ViteConfig:', err);
    }
  }

  const env = loadEnv(mode, '.', '');

  // Helper function to read request body stream
  const getReqBody = (req: any): Promise<any> => {
    if (req.body) {
      return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
    }
    if (req.readable === false || req.complete) {
      return Promise.resolve({});
    }
    return new Promise((resolve) => {
      let body = '';
      const timer = setTimeout(() => {
        resolve({});
      }, 2000); // safety fallback timeout to prevent hangs

      req.on('data', (chunk: any) => { body += chunk; });
      req.on('end', () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({});
        }
      });
    });
  };

  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'api-routes',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (!req.url) return next();

            const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            
            if (parsedUrl.pathname === '/api/health' && req.method === 'GET') {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
              const clientSecret = process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
              const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN;

              let isTokenValid = false;
              let tokenError = null;
              if (clientId && clientSecret && refreshToken) {
                try {
                  const { google } = await import('googleapis');
                  const oauth2ClientCheck = new google.auth.OAuth2(clientId, clientSecret);
                  oauth2ClientCheck.setCredentials({ refresh_token: refreshToken });
                  await oauth2ClientCheck.getAccessToken();
                  isTokenValid = true;
                } catch (err: any) {
                  tokenError = err.message || err.error || "invalid_grant";
                }
              }

              res.end(JSON.stringify({
                status: "ok",
                googleConfigured: !!(clientId && clientSecret && refreshToken),
                googleTokenValid: isTokenValid,
                googleTokenError: tokenError,
                clientId: clientId || "google-client-configured",
                calendarId: process.env.VITE_GOOGLE_CALENDAR_ID || env.VITE_GOOGLE_CALENDAR_ID || "not specified",
                source: "vite-dev-plugin"
              }));
              return;
            }

            if (parsedUrl.pathname === '/api/calendar/exchange-code' && req.method === 'POST') {
              try {
                const body = await getReqBody(req);
                const { code } = body;
                if (!code) {
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 400;
                  res.end(JSON.stringify({ success: false, error: "Missing authorization code" }));
                  return;
                }

                const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
                const clientSecret = process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;

                if (!clientId || !clientSecret) {
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 400;
                  res.end(JSON.stringify({ 
                    success: false, 
                    error: "Credenciais GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não estão configuradas no servidor." 
                  }));
                  return;
                }

                const { google } = await import('googleapis');
                const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "postmessage");
                const { tokens } = await oauth2.getToken(code);

                const rToken = tokens.refresh_token;
                if (rToken) {
                  // Update .env file physically
                  const fs = await import('fs');
                  const path = await import('path');
                  const envFilePath = path.resolve(process.cwd(), '.env');
                  let envContent = '';
                  if (fs.existsSync(envFilePath)) {
                    envContent = fs.readFileSync(envFilePath, 'utf8');
                  }

                  if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                    envContent = envContent.replace(
                      /GOOGLE_REFRESH_TOKEN=.*/,
                      `GOOGLE_REFRESH_TOKEN=${rToken}`
                    );
                  } else {
                    envContent += `\nGOOGLE_REFRESH_TOKEN=${rToken}`;
                  }

                  fs.writeFileSync(envFilePath, envContent, 'utf8');
                  process.env.GOOGLE_REFRESH_TOKEN = rToken;
                }

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({
                  success: true,
                  hasRefreshToken: !!rToken,
                  message: rToken 
                    ? "Conectado e gravado com sucesso na agenda do gabinete!" 
                    : "Autorizado com sucesso! (Por favor, se as sincronizações em segundo plano falharem, remova o app DataLink de sua conta do Google e tente novamente para forçar o consentimento)."
                }));
              } catch (err: any) {
                console.error("[VITE DEV SERVER API] Error exchanging code:", err);
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 500;
                res.end(JSON.stringify({ 
                  success: false, 
                  error: err.message || "Falha ao realizar a troca do código de autorização do Google." 
                }));
              }
              return;
            }

            if (parsedUrl.pathname === '/api/auth/callback' && req.method === 'GET') {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.statusCode = 200;
              res.end(`
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                  <meta charset="UTF-8">
                  <title>Autenticando...</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      background-color: #f8fafc;
                      color: #334155;
                    }
                    .card {
                      text-align: center;
                      padding: 2.5rem;
                      background: white;
                      border-radius: 12px;
                      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
                      max-width: 420px;
                      width: 90%;
                    }
                    .spinner {
                      border: 4px solid #f3f3f3;
                      border-top: 4px solid #2563eb;
                      border-radius: 50%;
                      width: 36px;
                      height: 36px;
                      animation: spin 1s linear infinite;
                      margin: 0 auto 1.5rem;
                    }
                    h3 {
                      margin: 0 0 0.5rem 0;
                      color: #1e293b;
                      font-size: 1.25rem;
                    }
                    p {
                      margin: 0;
                      color: #64748b;
                      font-size: 0.95rem;
                    }
                    @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                    }
                  </style>
                </head>
                <body>
                  <div class="card">
                    <div class="spinner"></div>
                    <h3>Conexão Autorizada (Dev)!</h3>
                    <p>Sincronizando com o painel central, esta janela fechará automaticamente...</p>
                  </div>
                  <script>
                    try {
                      const hash = window.location.hash || '';
                      const params = new URLSearchParams(hash.replace(/^#/, ''));
                      const accessToken = params.get('access_token');
                      const refreshToken = params.get('refresh_token');
                      const providerToken = params.get('provider_token');
                      const providerRefreshToken = params.get('provider_refresh_token');

                      console.log('[API POPUP DEV] Extracted tokens, posting to opener...');
                      
                      if (window.opener) {
                        window.opener.postMessage({
                          type: 'SUPABASE_OAUTH_SUCCESS',
                          accessToken,
                          refreshToken,
                          providerToken,
                          providerRefreshToken
                        }, '*');
                        
                        setTimeout(() => {
                          window.close();
                        }, 1200);
                      } else {
                        console.warn('[API POPUP DEV] No window.opener found. Redirecting to home...');
                        window.location.href = '/';
                      }
                    } catch (err) {
                      console.error(err);
                      document.body.innerHTML = '<div class="card"><h3 style="color:#ef4444">Erro na Autenticação</h3><p>' + err.message + '</p></div>';
                    }
                  </script>
                </body>
                </html>
              `);
              return;
            }

            if (parsedUrl.pathname === '/api/calendar/save-token' && req.method === 'POST') {
              try {
                const body = await getReqBody(req);
                const { refreshToken } = body;
                if (!refreshToken) {
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Missing refreshToken parameter" }));
                  return;
                }

                // Update .env file physically
                const fs = await import('fs');
                const path = await import('path');
                const envFilePath = path.resolve(process.cwd(), '.env');
                let envContent = '';
                if (fs.existsSync(envFilePath)) {
                  envContent = fs.readFileSync(envFilePath, 'utf8');
                }

                if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
                  envContent = envContent.replace(
                    /GOOGLE_REFRESH_TOKEN=.*/,
                    `GOOGLE_REFRESH_TOKEN=${refreshToken}`
                  );
                } else {
                  envContent += `\nGOOGLE_REFRESH_TOKEN=${refreshToken}`;
                }

                fs.writeFileSync(envFilePath, envContent, 'utf8');
                
                // Also update process.env for live session
                process.env.GOOGLE_REFRESH_TOKEN = refreshToken;

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 200;
                res.end(JSON.stringify({ success: true, message: "Token atualizado com sucesso no arquivo .env!" }));
              } catch (err: any) {
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message || "Erro ao salvar token" }));
              }
              return;
            }

            if (parsedUrl.pathname === '/api/calendar/sync' && req.method === 'POST') {
              try {
                const body = await getReqBody(req);
                const { event, calendarId, eventId, googleAccessToken } = body;

                const clientId = process.env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID;
                const clientSecret = process.env.GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET;
                const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN;

                const { google } = await import('googleapis');
                let oauthClientToUse;
                let isUsingFallback = false;

                // Validate if master token works
                let isMasterTokenValid = false;
                if (clientId && clientSecret && refreshToken) {
                  try {
                    const oauthCheck = new google.auth.OAuth2(clientId, clientSecret);
                    oauthCheck.setCredentials({ refresh_token: refreshToken });
                    await oauthCheck.getAccessToken();
                    isMasterTokenValid = true;
                  } catch (e) {
                    console.warn("[VITE API WARNING] Central master refresh token is invalid or expired.");
                  }
                }

                if (googleAccessToken && !isMasterTokenValid) {
                  console.log("[VITE API] Master token invalid/missing. Falling back to browser-provided user Google Access Token.");
                  const userClient = new google.auth.OAuth2();
                  userClient.setCredentials({ access_token: googleAccessToken });
                  oauthClientToUse = userClient;
                  isUsingFallback = true;
                } else {
                  if (!clientId || !clientSecret || !refreshToken) {
                    console.error("[VITE API ERROR] Missing Google credentials in configuration and no fallback token provided.");
                    res.setHeader('Content-Type', 'application/json');
                    res.statusCode = 500;
                    res.end(JSON.stringify({
                      error: "Google Master Account credentials not configured in environment, and no fallback Google Access Token provided."
                    }));
                    return;
                  }
                  const masterClient = new google.auth.OAuth2(clientId, clientSecret, "postmessage");
                  masterClient.setCredentials({ refresh_token: refreshToken });
                  oauthClientToUse = masterClient;
                }

                const calendar = google.calendar({ version: "v3", auth: oauthClientToUse });
                let targetCalendarId = calendarId || process.env.VITE_GOOGLE_CALENDAR_ID || env.VITE_GOOGLE_CALENDAR_ID || 'primary';
                console.log(`[VITE DEV SERVER API] Syncing to calendar ID: ${targetCalendarId} - Fallback Active: ${isUsingFallback}`);

                let response;
                let fallbackToPrimaryUsed = false;

                if (eventId) {
                  try {
                    console.log(`[VITE DEV SERVER API] Updating event: ${eventId} on calendar: ${targetCalendarId}`);
                    response = await calendar.events.update({
                      calendarId: targetCalendarId,
                      eventId: eventId,
                      requestBody: event,
                    });
                  } catch (updateError: any) {
                    console.warn("[VITE DEV SERVER API] Update failed, checking check for calendar exists or insert. Error:", updateError.message);
                    const is404 = updateError.code === 404 || updateError.status === 404 || (updateError.message && updateError.message.toLowerCase().includes("not found"));

                    if (is404) {
                      try {
                        console.log(`[VITE DEV SERVER API] Inserting event into target calendar: ${targetCalendarId}`);
                        response = await calendar.events.insert({
                          calendarId: targetCalendarId,
                          requestBody: event,
                        });
                      } catch (insertError: any) {
                        const isInsert404 = insertError.code === 404 || insertError.status === 404 || (insertError.message && insertError.message.toLowerCase().includes("not found"));
                        if (isInsert404 && targetCalendarId !== 'primary') {
                          console.warn(`[VITE DEV SERVER API] Target calendar ${targetCalendarId} not found (404) on insert. Falling back to 'primary'...`);
                          fallbackToPrimaryUsed = true;
                          response = await calendar.events.insert({
                            calendarId: 'primary',
                            requestBody: event,
                          });
                        } else {
                          throw insertError;
                        }
                      }
                    } else {
                      if (targetCalendarId !== 'primary' && updateError.message && updateError.message.toLowerCase().includes("not found")) {
                        console.warn(`[VITE DEV SERVER API] Potential calendar not found error. Retrying on 'primary' as final fallback.`);
                        fallbackToPrimaryUsed = true;
                        response = await calendar.events.insert({
                          calendarId: 'primary',
                          requestBody: event,
                        });
                      } else {
                        throw updateError;
                      }
                    }
                  }
                } else {
                  try {
                    console.log(`[VITE DEV SERVER API] Creating new event on calendar: ${targetCalendarId}`);
                    response = await calendar.events.insert({
                      calendarId: targetCalendarId,
                      requestBody: event,
                    });
                  } catch (insertError: any) {
                    const isInsert404 = insertError.code === 404 || insertError.status === 404 || (insertError.message && insertError.message.toLowerCase().includes("not found"));
                    if (isInsert404 && targetCalendarId !== 'primary') {
                      console.warn(`[VITE DEV SERVER API] Target calendar ${targetCalendarId} not found (404) on insert. Falling back to 'primary'...`);
                      fallbackToPrimaryUsed = true;
                      response = await calendar.events.insert({
                        calendarId: 'primary',
                        requestBody: event,
                      });
                    } else {
                      throw insertError;
                    }
                  }
                }

                let successStatus = 200;
                if (response && typeof response.status === 'number' && response.status >= 100 && response.status < 600) {
                  successStatus = response.status;
                }

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = successStatus;
                res.end(JSON.stringify({ 
                  ...(response?.data || response || {}), 
                  fallbackToPrimaryUsed 
                }));
              } catch (error: any) {
                console.error("[VITE DEV SERVER API] Error syncing to Google Calendar:", error);
                
                let statusCode = 500;
                if (error.code && typeof error.code === 'number' && error.code >= 100 && error.code < 600) {
                  statusCode = error.code;
                } else if (error.status && typeof error.status === 'number' && error.status >= 100 && error.status < 600) {
                  statusCode = error.status;
                }

                res.setHeader('Content-Type', 'application/json');
                res.statusCode = statusCode;
                res.end(JSON.stringify({ 
                  error: error.message || "Internal Server Error",
                  code: error.code || "UNKNOWN_ERROR"
                }));
              }
              return;
            }

            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

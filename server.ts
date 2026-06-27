import express from "express";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";
import fs from "fs";

// Resolve running context directory safely (handles Passenger changing Cwd on Hostgator)
const rootDir = process.cwd();
const scriptDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

// Locate the app's root correctly
const appRoot = fs.existsSync(path.join(rootDir, 'package.json'))
  ? rootDir
  : fs.existsSync(path.join(scriptDir, 'package.json'))
    ? scriptDir
    : fs.existsSync(path.join(scriptDir, '..', 'package.json'))
      ? path.join(scriptDir, '..')
      : rootDir;

const envPath = path.join(appRoot, '.env');
const examplePath = path.join(appRoot, '.env.example');

// 1. Force copying example to .env if .env doesn't exist yet
if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
  try {
    fs.copyFileSync(examplePath, envPath);
    console.log(`Successfully created .env from .env.example fallback at: ${envPath}`);
  } catch (err) {
    console.error('Failed to copy .env.example to .env:', err);
  }
}

// 2. Load `.env.example` as base configuration (useful if the user added new keys in .env.example)
if (fs.existsSync(examplePath)) {
  try {
    const exampleConfig = dotenv.parse(fs.readFileSync(examplePath));
    for (const k in exampleConfig) {
      if (exampleConfig[k] && !exampleConfig[k].startsWith("your-")) {
        process.env[k] = exampleConfig[k];
      }
    }
    console.log(`Loaded base configuration keys from .env.example`);
  } catch (err) {
    console.error('Failed parsing .env.example:', err);
  }
}

// 3. Load `.env` to override (useful for environment-specific differences)
if (fs.existsSync(envPath)) {
  try {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    for (const k in envConfig) {
      if (envConfig[k] && !envConfig[k].startsWith("your-")) {
        process.env[k] = envConfig[k];
      }
    }
    console.log(`Overridden/loaded configurations from .env`);
  } catch (err) {
    console.error('Failed parsing .env:', err);
  }
}

// 4. General fallback systems loading
dotenv.config();

console.log(`[STARTUP] GOOGLE_CLIENT_ID length: ${process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.length : 0}`);
console.log(`[STARTUP] GOOGLE_REFRESH_TOKEN length: ${process.env.GOOGLE_REFRESH_TOKEN ? process.env.GOOGLE_REFRESH_TOKEN.length : 0}`);

const app = express();
const PORT = 3000;

// Subdirectory/Reverse-Proxy auto-stripper middleware to support Hostgator subfolder environments
app.use((req, res, next) => {
  const urlToCheck = req.url || "";
  let prefix = "";
  
  // Detect prefix on a per-request basis
  const apiIndex = urlToCheck.indexOf('/api/');
  const assetsIndex = urlToCheck.indexOf('/assets/');
  const indexHtmlIndex = urlToCheck.indexOf('/index.html');
  
  if (apiIndex > 0) {
    prefix = urlToCheck.substring(0, apiIndex);
  } else if (assetsIndex > 0) {
    prefix = urlToCheck.substring(0, assetsIndex);
  } else if (indexHtmlIndex > 0) {
    prefix = urlToCheck.substring(0, indexHtmlIndex);
  }

  if (prefix) {
    const originalUrl = req.url;
    let cleanUrl = req.url.substring(prefix.length);
    if (!cleanUrl.startsWith('/')) {
      cleanUrl = '/' + cleanUrl;
    }
    req.url = cleanUrl;
    
    // Reset cached parsedurl so Express re-evaluates the path and query
    (req as any)._parsedUrl = undefined;
    
    console.log(`[SUBDIR REWRITE] Rewrote ${originalUrl} -> ${req.url} (Path: ${req.path}) with prefix: "${prefix}"`);
  } else {
    // If we didn't find a prefix based on api/assets/index.html, but the URL is still nested
    // (e.g., direct API fallback)
    const apiIndexFallback = urlToCheck.indexOf('/api/');
    if (apiIndexFallback > 0) {
      const originalUrl = req.url;
      req.url = req.url.substring(apiIndexFallback);
      (req as any)._parsedUrl = undefined;
      console.log(`[SUBDIR FALLBACK] Rewrote ${originalUrl} -> ${req.url} (Path: ${req.path})`);
    }
  }

  console.log(`[SERVER] Request received: ${req.method} ${req.path} (Original URL: ${req.originalUrl}, Rewritten URL: ${req.url})`);
  next();
});

app.use(express.json());

// Dynamic Google credentials loader to ensure instant updates in long-running processes (e.g. Passenger)
function getGoogleCredentials() {
  const envFilePath = path.resolve(appRoot, '.env');
  let fileClientId = "";
  let fileClientSecret = "";
  let fileRefreshToken = "";
  let fileCalendarId = "";

  if (fs.existsSync(envFilePath)) {
    try {
      const content = fs.readFileSync(envFilePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const equalIndex = trimmed.indexOf('=');
        if (equalIndex > 0) {
          const key = trimmed.substring(0, equalIndex).trim();
          let val = trimmed.substring(equalIndex + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (key === "GOOGLE_CLIENT_ID") fileClientId = val;
          if (key === "GOOGLE_CLIENT_SECRET") fileClientSecret = val;
          if (key === "GOOGLE_REFRESH_TOKEN") fileRefreshToken = val;
          if (key === "VITE_GOOGLE_CALENDAR_ID") fileCalendarId = val;
        }
      }
    } catch (e) {
      console.error("[SERVER] Error parsing .env dynamically:", e);
    }
  }

  const clientId = fileClientId || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = fileClientSecret || process.env.GOOGLE_CLIENT_SECRET || "";
  const refreshToken = fileRefreshToken || process.env.GOOGLE_REFRESH_TOKEN || "";
  const calendarId = fileCalendarId || process.env.VITE_GOOGLE_CALENDAR_ID || "primary";

  return { clientId, clientSecret, refreshToken, calendarId };
}

// API routes FIRST
app.get("/api/health", async (req, res) => {
  try {
    const { clientId, clientSecret, refreshToken } = getGoogleCredentials();
    
    let isTokenValid = false;
    let tokenError = null;
    let tokenErrorDetail: any = null;

    if (clientId && clientSecret && refreshToken) {
      try {
        const oauth2ClientCheck = new google.auth.OAuth2(clientId, clientSecret);
        oauth2ClientCheck.setCredentials({ refresh_token: refreshToken });
        await oauth2ClientCheck.getAccessToken();
        isTokenValid = true;
      } catch (err: any) {
        console.log("[SERVER] Google master token is currently invalid/expired (User action required to re-authenticate):", err.message || err.error || err);
        tokenError = err.message || err.error || "invalid_grant";
        tokenErrorDetail = {
          message: err.message,
          code: err.code || err.status,
          response: err.response?.data
        };
      }
    }

    res.json({
      status: "ok",
      googleConfigured: !!(clientId && clientSecret && refreshToken),
      googleTokenValid: isTokenValid,
      googleTokenError: tokenError,
      googleTokenErrorDetail: tokenErrorDetail,
      clientId: clientId || "google-client-configured",
      calendarId: process.env.VITE_GOOGLE_CALENDAR_ID || "not specified"
    });
  } catch (error: any) {
    console.error("[SERVER] Health check endpoint crashed:", error);
    res.status(500).json({
      status: "error",
      error: error.message || "Internal Server Error during health check",
      details: error.stack
    });
  }
});

/**
 * Endpoint callback target to capture Supabase OAuth hash fragments inside the popup frame
 * in an environment-isolated safe manner to avoid third-party cookie restrictions.
 */
app.get("/api/auth/callback", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`
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
        .close-btn {
          margin-top: 1.5rem;
          padding: 0.5rem 1.25rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          display: inline-block;
          font-size: 0.9rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
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
        <h3 id="status-title">Conexão Autorizada!</h3>
        <p id="status-desc">Salvando credenciais com segurança...</p>
        <button id="close-btn" class="close-btn" style="display: none;" onclick="window.close()">Fechar Janela</button>
      </div>
      <script>
        try {
          const hash = window.location.hash || '';
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          const providerToken = params.get('provider_token');
          const providerRefreshToken = params.get('provider_refresh_token');

          console.log('[API POPUP] Extracted tokens, persisting and closing popup...');

          // Save to localStorage for same-origin fallback communication (avoids losing opener in sandwich iframes)
          try {
            window.localStorage.setItem('GOOGLE_OAUTH_SUCCESS_RAW', JSON.stringify({
              accessToken,
              refreshToken,
              providerToken,
              providerRefreshToken,
              timestamp: Date.now()
            }));
          } catch (e) {
            console.error('Error writing to localStorage:', e);
          }
          
          if (window.opener) {
            window.opener.postMessage({
              type: 'SUPABASE_OAUTH_SUCCESS',
              accessToken,
              refreshToken,
              providerToken,
              providerRefreshToken
            }, '*');
          }

          // Close the pop-up window instantly so the focus stays entirely in the original screen
          setTimeout(() => {
            try {
              window.close();
            } catch (e) {}
          }, 50);

        } catch (err) {
          console.error(err);
          document.body.innerHTML = '<div class="card"><h3 style="color:#ef4444">Erro na Autenticação</h3><p>' + err.message + '</p></div>';
        }
      </script>
    </body>
    </html>
  `);
});

/**
 * Save master refresh token and other optional Google credentials to .env file dynamically
 */
app.post("/api/calendar/save-token", async (req, res) => {
  try {
    const { refreshToken, clientId, clientSecret } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Missing refreshToken parameter" });
    }

    const envFilePath = path.resolve(appRoot, '.env');
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

    if (clientId) {
      if (envContent.includes('GOOGLE_CLIENT_ID=')) {
        envContent = envContent.replace(/GOOGLE_CLIENT_ID=.*/, `GOOGLE_CLIENT_ID=${clientId}`);
      } else {
        envContent += `\nGOOGLE_CLIENT_ID=${clientId}`;
      }
      process.env.GOOGLE_CLIENT_ID = clientId;
    }
    if (clientSecret) {
      if (envContent.includes('GOOGLE_CLIENT_SECRET=')) {
        envContent = envContent.replace(/GOOGLE_CLIENT_SECRET=.*/, `GOOGLE_CLIENT_SECRET=${clientSecret}`);
      } else {
        envContent += `\nGOOGLE_CLIENT_SECRET=${clientSecret}`;
      }
      process.env.GOOGLE_CLIENT_SECRET = clientSecret;
    }

    try {
      fs.writeFileSync(envFilePath, envContent, 'utf8');
    } catch (writeErr: any) {
      console.warn("[SERVER API] Could not write to .env file (expected on read-only environments like Vercel). Operating in-memory.", writeErr.message || writeErr);
    }
    process.env.GOOGLE_REFRESH_TOKEN = refreshToken;

    res.json({ 
      success: true, 
      message: "Configurações de integração atualizadas com sucesso! (Salvo em memória temporária se o servidor for somente leitura)." 
    });
  } catch (err: any) {
    console.error("[SERVER API] Error saving manual token:", err);
    res.status(500).json({ success: false, error: err.message || "Erro ao salvar token" });
  }
});

/**
 * Exchange Google Authorization Code for permanent Refresh Token
 */
app.post("/api/calendar/exchange-code", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, error: "Missing authorization code" });
    }

    const { clientId, clientSecret } = getGoogleCredentials();

    if (!clientId || !clientSecret) {
      return res.status(400).json({ 
        success: false, 
        error: "Credenciais GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não estão configuradas no servidor de forma correta." 
      });
    }

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "postmessage");
    const { tokens } = await oauth2.getToken(code);

    const rToken = tokens.refresh_token;
    if (rToken) {
      const envFilePath = path.resolve(appRoot, '.env');
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

      try {
        fs.writeFileSync(envFilePath, envContent, 'utf8');
      } catch (writeErr: any) {
        console.warn("[SERVER API] Could not write to .env file during exchange code (expected on read-only environments like Vercel). Operating in-memory.", writeErr.message || writeErr);
      }
      process.env.GOOGLE_REFRESH_TOKEN = rToken;
    }

    res.json({
      success: true,
      hasRefreshToken: !!rToken,
      message: rToken 
        ? "Conexão de gabinete ativa e persistida com sucesso!" 
        : "Autorizado com sucesso! (Por favor, se as sincronizações em segundo plano falharem, remova o app do Google e tente novamente para forçar o consentimento de refresh token)."
    });
  } catch (err: any) {
    console.error("[SERVER API] Error exchanging code:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message || "Falha ao realizar a troca do código de autorização do Google." 
    });
  }
});

/**
 * Sync event to centralized Google Calendar using Master Account or user fallback Access Token
 */
app.post("/api/calendar/sync", async (req, res) => {
  try {
    const { event, calendarId, eventId, googleAccessToken } = req.body;

    const { clientId, clientSecret, refreshToken, calendarId: envCalendarId } = getGoogleCredentials();

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
      } catch (e: any) {
        console.log("[SERVER] Central master refresh token is invalid or expired (re-auth required):", e.message || e);
      }
    }

    if (googleAccessToken && !isMasterTokenValid) {
      console.log("[SERVER API] Master token invalid/missing. Falling back to browser-provided user Google Access Token.");
      const userClient = new google.auth.OAuth2();
      userClient.setCredentials({ access_token: googleAccessToken });
      oauthClientToUse = userClient;
      isUsingFallback = true;
    } else {
      if (!clientId || !clientSecret || !refreshToken) {
        console.log("[SERVER] Missing Google credentials in configuration and no fallback token provided.");
        return res.status(500).json({
          error: "Credenciais do Google do gabinete não configuradas no ambiente, e nenhum token alternativo da conta pessoal do Google foi fornecido."
        });
      }
      if (!isMasterTokenValid) {
        console.log("[SERVER] Google credentials exist but master token is invalid/expired. No fallback provided.");
        return res.status(401).json({
          error: "O Token de acesso do Google Agenda expirou ou foi revogado. Por favor, re-autorize a conexão com o Google nas configurações do painel.",
          code: "token_expired_or_revoked"
        });
      }
      const masterClient = new google.auth.OAuth2(clientId, clientSecret, "postmessage");
      masterClient.setCredentials({ refresh_token: refreshToken });
      oauthClientToUse = masterClient;
    }

    const calendar = google.calendar({ version: "v3", auth: oauthClientToUse });
    let targetCalendarId = calendarId || envCalendarId || 'primary';
    console.log(`[SERVER API] Syncing to calendar ID: ${targetCalendarId} - Fallback Active: ${isUsingFallback}`);

    let response;
    let fallbackToPrimaryUsed = false;

    if (eventId) {
      try {
        console.log(`[SERVER API] Updating event: ${eventId} on calendar: ${targetCalendarId}`);
        response = await calendar.events.update({
          calendarId: targetCalendarId,
          eventId: eventId,
          requestBody: event,
        });
      } catch (updateError: any) {
        console.log(`[SERVER API] Update did not find the event, attempting insert. Message: ${updateError.message || ""}`);
        const is404 = updateError.code === 404 || updateError.status === 404 || (updateError.message && updateError.message.toLowerCase().includes("not found"));

        if (is404) {
          try {
            console.log(`[SERVER API] Inserting new event into target calendar: ${targetCalendarId}`);
            response = await calendar.events.insert({
              calendarId: targetCalendarId,
              requestBody: event,
            });
          } catch (insertError: any) {
            const isInsert404 = insertError.code === 404 || insertError.status === 404 || (insertError.message && insertError.message.toLowerCase().includes("not found"));
            if (isInsert404 && targetCalendarId !== 'primary') {
              console.warn(`[SERVER API] Target calendar ${targetCalendarId} not found (404) on insert. Falling back to 'primary'...`);
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
            console.warn(`[SERVER API] Potential calendar not found error. Retrying on 'primary' as final fallback.`);
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
        console.log(`[SERVER API] Creating new event on calendar: ${targetCalendarId}`);
        response = await calendar.events.insert({
          calendarId: targetCalendarId,
          requestBody: event,
        });
      } catch (insertError: any) {
        const isInsert404 = insertError.code === 404 || insertError.status === 404 || (insertError.message && insertError.message.toLowerCase().includes("not found"));
        if (isInsert404 && targetCalendarId !== 'primary') {
          console.warn(`[SERVER API] Target calendar ${targetCalendarId} not found (404) on insert. Falling back to 'primary'...`);
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

    res.status(successStatus).json({ 
      ...(response?.data || response || {}), 
      fallbackToPrimaryUsed 
    });
  } catch (error: any) {
    const errorStr = ((error.message || "") + " " + (error.error || "")).toLowerCase();
    const isAuthError = errorStr.includes("invalid_grant") || errorStr.includes("invalid client") || errorStr.includes("expired") || errorStr.includes("revoked") || error.code === "invalid_grant" || error.status === 401;

    if (isAuthError) {
      console.log("[SERVER INFO] Google Calendar sync session expired or was revoked (user action required to re-authenticate):", error.message || error);
    } else {
      console.error("[SERVER API] Error syncing to Google Calendar:", error);
    }
    
    let statusCode = 500;
    if (error.code && typeof error.code === 'number' && error.code >= 100 && error.code < 600) {
      statusCode = error.code;
    } else if (error.status && typeof error.status === 'number' && error.status >= 100 && error.status < 600) {
      statusCode = error.status;
    } else if (isAuthError) {
      statusCode = 401;
    }

    res.status(statusCode).json({ 
      error: error.message || "Internal Server Error",
      code: error.code || (isAuthError ? "invalid_grant" : "UNKNOWN_ERROR")
    });
  }
});

// Vite middleware for development or static serving for production
async function startServer() {
  try {
    // Robust detection of production mode (strict NODE_ENV check or physical dist/index.html checks)
    const isProduction = process.env.NODE_ENV === "production" || 
                         !!process.env.VERCEL ||
                         fs.existsSync(path.join(appRoot, 'dist', 'index.html')) || 
                         !fs.existsSync(path.join(appRoot, 'src'));

    if (!isProduction) {
      console.log("Starting server in DEVELOPMENT mode with Vite middleware...");
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      console.log("Starting server in PRODUCTION mode, serving static files...");
      const distPath = path.join(appRoot, 'dist');
      app.use(express.static(distPath));
      
      // Serve index.html for all non-api routes
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/') || req.url.includes('/api/') || (req.originalUrl && req.originalUrl.includes('/api/'))) {
          return next();
        }
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    if (process.env.VERCEL) {
      console.log("Running on Vercel serverless environment - skipping app.listen");
    } else {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server successfully listening on http://0.0.0.0:${PORT}`);
      });
    }
  } catch (error) {
    console.error("CRITICAL error during server boot:", error);
    // Safe fallback to bind port and avoid container boot crashes
    if (!process.env.VERCEL) {
      try {
        app.listen(PORT, "0.0.0.0", () => {
          console.warn(`Fallback server listening on port ${PORT} to prevent platform boot fail.`);
        });
      } catch (fallbackErr) {
        console.error("Fallback server listen failed:", fallbackErr);
      }
    }
  }
}

startServer();

export default app;


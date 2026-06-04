export default async function handler(req: any, res: any) {
  try {
    const serverModule = await import('../server.js');
    const app = serverModule.default;
    return app(req, res);
  } catch (error: any) {
    console.error("[VERCEL LAMBDA ERROR] Failed to load or execute backend server:", error);
    res.status(500).json({
      error: "Failed to initialize backend server on Vercel",
      message: error.message || String(error),
      stack: error.stack,
    });
  }
}

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  DEFAULT_VIBE_AI_GATEWAY_URL,
  getGatewayReadinessStatus,
  handleTutorChatRequest,
} from './src/services/gatewayAdapter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  const currentGatewayDeps = () => ({
    gatewayUrl: process.env.VIBE_AI_GATEWAY_URL || DEFAULT_VIBE_AI_GATEWAY_URL,
    gatewayKey: process.env.VIBE_AI_GATEWAY_KEY,
  });

  app.get('/api/health', (_req, res) => {
    const readiness = getGatewayReadinessStatus(currentGatewayDeps());
    res.json({
      ready: true,
      status: 'ok',
      ...readiness,
    });
  });

  app.post('/api/v1/health', (_req, res) => {
    const readiness = getGatewayReadinessStatus(currentGatewayDeps());
    res.json({
      status: 'ok',
      ...readiness,
    });
  });

  app.get('/api/tutor/status', (_req, res) => {
    const readiness = getGatewayReadinessStatus(currentGatewayDeps());
    res.json(readiness);
  });

  /**
   * Application-side adapter route:
   * VibeTutor browser -> POST /api/tutor/chat -> Vibe AI Gateway (POST /v1/chat/completions) -> OpenRouter
   */
  app.post('/api/tutor/chat', async (req, res) => {
    const result = await handleTutorChatRequest(req.body, {
      ...currentGatewayDeps(),
      // Note: Web user authentication and durable server-side quota enforcement are not yet
      // provisioned in this preview runtime. Keep verifyUserSession and quotaStore undefined
      // so live AI stays honestly gated until those dependencies and VIBE_AI_GATEWAY_KEY are connected.
      onDiagnostics: (diag) => {
        console.info(
          `[VibeTutor Gateway] chatType=${diag.chatType} model=${diag.model ?? 'auto'} latencyMs=${diag.latencyMs}`,
        );
      },
    });

    res.status(result.status).json(result.body);
  });

  app.post('/api/v1/reports/message', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.post('/api/v1/analytics/Batch', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VibeTutor 2.0 server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

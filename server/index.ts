// Servidor SOC AI: API + interfaz en un solo proceso.
// Desarrollo: Vite en modo middleware (HMR). Producción: archivos compilados en dist/ con CSP estricta.

import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, ROOT } from './config.ts';
import { api } from './routes/api.ts';
import { purgeSessions, seedAdmin } from './auth.ts';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.behindProxy ? 1 : 'loopback');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.isProd) {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  next();
});

app.use('/api', api);
app.use('/api', (req, res) => { res.status(404).json({ error: 'Ruta no encontrada.' }); });

if (config.isProd) {
  const dist = path.join(ROOT, 'dist');
  if (!existsSync(dist)) {
    console.error('Falta la carpeta dist/. Ejecuta "npm run build" antes de "npm start".');
    process.exit(1);
  }
  app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true }));
  app.get(/.*/, (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: path.join(ROOT, 'web'), configFile: path.join(ROOT, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

setInterval(purgeSessions, 60 * 60_000).unref();

seedAdmin();

app.listen(config.port, config.host, () => {
  console.log(`SOC AI listo en http://localhost:${config.port}  (${config.isProd ? 'producción' : 'desarrollo'}; IA: ${config.anthropicKey ? config.model : 'motor de reglas'})`);
});

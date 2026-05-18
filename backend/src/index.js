import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth.js';
import { svpRouter } from './routes/svp.js';

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function validateEnv() {
  const required = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'DATABASE_URL',
    'SVP_BASE_URL',
  ];

  for (const key of required) requireEnv(key);
}

validateEnv();

const app = express();
const appName = process.env.APP_NAME || 'SVP Backend API';

// Railway sits behind a reverse proxy. Trust the first proxy so secure cookies,
// rate limiting, and request IP handling behave correctly in production.
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const hardcodedOrigins = [
  'https://svp-book.vercel.app',
  'https://svp-book-abdur-razzak-s-projects.vercel.app',
  'https://aci-root.vercel.app',
];
const origins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const allOrigins = [...new Set([...hardcodedOrigins, ...origins])];
const vercelProject = (process.env.VERCEL_PROJECT_SLUG || '').trim().toLowerCase();

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allOrigins.includes(origin)) return true;

  // Allow Vercel preview deployments for this project without listing each random URL.
  if (vercelProject) {
    try {
      const { hostname, protocol } = new URL(origin);
      if (protocol === 'https:' && hostname.endsWith('.vercel.app') && hostname.includes(`-${vercelProject}-`)) {
        return true;
      }
    } catch {
      return false;
    }
  }

  // Allow Lovable preview/published domains automatically
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol === 'https:' &&
        (hostname.endsWith('.lovable.app') || hostname.endsWith('.lovableproject.com'))) {
      return true;
    }
  } catch {
    // ignore
  }

  return false;
}

app.use(cors({
  origin: true,
  credentials: true,
}));

// Rate limit auth endpoints
app.use('/api/auth', rateLimit({ windowMs: 60_000, max: 30 }));

app.get('/health', (_, res) => res.json({
  ok: true,
  app: appName,
  env: process.env.NODE_ENV || 'development',
  publicDomain: process.env.RAILWAY_PUBLIC_DOMAIN || null,
  service: process.env.RAILWAY_SERVICE_NAME || null,
}));

app.get('/', (_, res) => res.json({
  ok: true,
  app: appName,
  env: process.env.NODE_ENV || 'development',
}));

app.use('/api/auth', authRouter);
app.use('/api/svp', svpRouter);

// global error handler
app.use((err, req, res, next) => {
  const status = err?.statusCode || err?.status || 500;
  res.status(status).json({
    message: err?.message || 'Server error',
    details: err?.details,
  });
});

const port = Number(process.env.PORT || 4000);
const host = '0.0.0.0';
app.listen(port, host, () => console.log(`${appName} listening on http://${host}:${port}`));

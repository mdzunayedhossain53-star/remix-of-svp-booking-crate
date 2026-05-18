import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { prisma } from '../lib/prisma.js';
import { encryptString, randomToken } from '../lib/crypto.js';
import { signAccess } from '../lib/jwt.js';
import { svpRequest } from '../lib/svpClient.js';

const router = Router();

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function extractOtpPayload(data) {
  const root = data?.data && typeof data.data === 'object' ? data.data : data;
  const user = root?.user || data?.user || null;

  const token = pickFirst(
    root?.access_payload?.access,
    data?.access_payload?.access,
    root?.access_payload?.token,
    data?.access_payload?.token,
    root?.accessToken,
    data?.accessToken,
    root?.access_token,
    data?.access_token,
    root?.token,
    data?.token,
  );

  const accessExpiresAt = pickFirst(
    root?.access_payload?.access_expires_at,
    data?.access_payload?.access_expires_at,
    root?.access_expires_at,
    data?.access_expires_at,
    root?.expires_at,
    data?.expires_at,
  );

  return { token, accessExpiresAt, user };
}

const LoginInputSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(3),
  otpMethod: z.enum(['email', 'sms']).optional(),
  recaptchaToken: z.string().min(1).optional(),
  recaptchaResponse: z.string().min(1).optional(),
  recaptcha_token: z.string().min(1).optional(),
  recaptcha_response: z.string().min(1).optional(),
  fe_app: z.string().min(1).optional(),
});

const OtpInputSchema = z.object({
  login: z.string().min(3),
  password: z.string().min(3),
  otpAttempt: z.string().min(4).max(10).optional(),
  otp_attempt: z.string().min(4).max(10).optional(),
  otpMethod: z.enum(['email', 'sms']).optional(),
  otp_method: z.enum(['email', 'sms']).optional(),
  recaptchaToken: z.string().min(1).optional(),
  recaptchaResponse: z.string().min(1).optional(),
  recaptcha_token: z.string().min(1).optional(),
  recaptcha_response: z.string().min(1).optional(),
  fe_app: z.string().min(1).optional(),
}).refine((v) => Boolean(v.otpAttempt || v.otp_attempt), {
  message: 'otpAttempt (or otp_attempt) is required',
});

const LoginSchema = z.union([
  LoginInputSchema,
  z.object({ user: LoginInputSchema }),
]);

const OtpSchema = z.union([
  OtpInputSchema,
  z.object({ user: OtpInputSchema }),
]);

function normalizeLoginBody(payload) {
  const input = payload.user ? payload.user : payload;
  return {
    login: input.login,
    password: input.password,
    otpMethod: input.otpMethod || input.otp_method || 'email',
    feApp: input.fe_app || process.env.SVP_FE_APP || 'legislator',
  };
}

function normalizeOtpBody(payload) {
  const input = payload.user ? payload.user : payload;
  return {
    login: input.login,
    password: input.password,
    otpAttempt: input.otpAttempt || input.otp_attempt,
    otpMethod: input.otpMethod || input.otp_method || 'email',
    recaptcha: pickFirst(
      input.recaptchaResponse,
      input.recaptcha_response,
      input.recaptchaToken,
      input.recaptcha_token,
    ),
    feApp: input.fe_app || process.env.SVP_FE_APP || 'legislator',
  };
}

const TokenLoginInputSchema = z.object({
  login: z.string().min(3),
  token: z.string().min(10),
});

const TokenLoginSchema = z.union([
  TokenLoginInputSchema,
  z.object({ user: TokenLoginInputSchema }),
]);

function normalizeTokenLoginBody(payload) {
  const input = payload.user ? payload.user : payload;
  return {
    login: input.login,
    token: input.token,
  };
}

async function createSessionForUser({ login, svpToken, svpExp }) {
  const user = await prisma.user.upsert({
    where: { login },
    update: {
      // Keep the same user record. We do not store raw token on User.
    },
    create: {
      login,
    },
  });

  const refreshRaw = randomToken(32);
  const refreshHash = await bcrypt.hash(refreshRaw, 10);
  const refreshDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 14);
  const refreshExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: refreshHash,
      refreshExpiresAt,
      svpAccessEnc: encryptString(svpToken),
      svpAccessExp: svpExp || null,
    },
  });

  const accessToken = signAccess({
    sub: user.id,
    login: user.login,
    sid: session.id,
  });

  return { user, session, refreshRaw, refreshDays, accessToken };
}

router.post('/token-login', async (req, res, next) => {
  try {
    const parsed = TokenLoginSchema.parse(req.body);
    const { login, token: svpToken } = normalizeTokenLoginBody(parsed);

    // Verify token by calling a basic authenticated SVP endpoint.
    await svpRequest('/api/v1/individual_labor_space/permissions', {
      method: 'GET',
      token: svpToken,
    });

    const svpExp = null;
    const { user, session, refreshRaw, refreshDays, accessToken } = await createSessionForUser({
      login,
      svpToken,
      svpExp,
    });

    const secure = String(process.env.COOKIE_SECURE) === 'true';
    const sameSite = process.env.COOKIE_SAMESITE || 'lax';
    res.cookie('svp_rt', refreshRaw, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/auth/refresh',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });
    res.cookie('svp_sid', session.id, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/auth/refresh',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        login: user.login,
        svpUserId: user.svpUserId,
        email: user.email,
        fullName: user.fullName,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginSchema.parse(req.body);
    const { login, password, otpMethod, feApp } = normalizeLoginBody(parsed);
    const userPayload = {
      login,
      password,
      otp_method: otpMethod,
      fe_app: feApp,
    };

    await svpRequest('/api/v1/sessions/login', {
      method: 'POST',
      body: {
        user: userPayload,
      },
    });

    res.json({ status: 'OTP_SENT' });
  } catch (e) {
    next(e);
  }
});

router.post('/otp-verify', async (req, res, next) => {
  try {
    const parsed = OtpSchema.parse(req.body);
    const { login, password, otpAttempt, otpMethod, recaptcha, feApp } = normalizeOtpBody(parsed);
    if (!otpAttempt) {
      return res.status(400).json({ message: 'otpAttempt (or otp_attempt) is required' });
    }
    const userPayload = {
      login,
      password,
      otp_attempt: otpAttempt,
      fe_app: feApp,
      otp_method: otpMethod,
      ...(recaptcha ? { recaptcha_response: recaptcha } : {}),
    };

    const data = await svpRequest('/api/v1/sessions/otp', {
      method: 'POST',
      body: {
        user: userPayload,
      },
    });

    const otpPayload = extractOtpPayload(data);
    const svpToken = otpPayload.token;
    const svpExp = otpPayload.accessExpiresAt ? new Date(otpPayload.accessExpiresAt) : null;

    if (!svpToken) {
      const err = new Error('SVP OTP verify succeeded but no access token was returned');
      err.statusCode = 502;
      err.details = data;
      throw err;
    }

    const svpUserId = otpPayload.user?.id ?? null;
    const email = otpPayload.user?.email ?? null;
    const fullName = otpPayload.user?.full_name ?? otpPayload.user?.fullName ?? null;

    const user = await prisma.user.upsert({
      where: { login },
      update: {
        svpUserId,
        email,
        fullName,
      },
      create: {
        login,
        svpUserId,
        email,
        fullName,
      },
    });

    const refreshRaw = randomToken(32);
    const refreshHash = await bcrypt.hash(refreshRaw, 10);
    const refreshDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 14);
    const refreshExpiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: refreshHash,
        refreshExpiresAt,
        svpAccessEnc: encryptString(svpToken),
        svpAccessExp: svpExp,
      },
    });

    const accessToken = signAccess({
      sub: user.id,
      login: user.login,
      sid: session.id,
    });

    const secure = String(process.env.COOKIE_SECURE) === 'true';
    const sameSite = process.env.COOKIE_SAMESITE || 'lax';

    res.cookie('svp_rt', refreshRaw, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/auth/refresh',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });
    res.cookie('svp_sid', session.id, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api/auth/refresh',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user: {
        id: user.id,
        login: user.login,
        svpUserId,
        email,
        fullName,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const sid = req.cookies?.svp_sid;
    const rt = req.cookies?.svp_rt;
    if (!sid || !rt) return res.status(401).json({ message: 'Missing refresh cookies' });

    const session = await prisma.session.findUnique({ where: { id: String(sid) }, include: { user: true } });
    if (!session || session.revokedAt) return res.status(401).json({ message: 'Session revoked' });
    if (session.refreshExpiresAt.getTime() < Date.now()) return res.status(401).json({ message: 'Refresh expired' });

    const ok = await bcrypt.compare(String(rt), session.refreshTokenHash);
    if (!ok) return res.status(401).json({ message: 'Invalid refresh token' });

    const accessToken = signAccess({
      sub: session.user.id,
      login: session.user.login,
      sid: session.id,
    });
    res.json({ accessToken });
  } catch (e) {
    next(e);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const sid = req.cookies?.svp_sid;
    if (sid) {
      await prisma.session.update({ where: { id: String(sid) }, data: { revokedAt: new Date() } }).catch(() => {});
    }
    res.clearCookie('svp_rt', { path: '/api/auth/refresh' });
    res.clearCookie('svp_sid', { path: '/api/auth/refresh' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export const authRouter = router;

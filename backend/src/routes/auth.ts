import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { config } from '../config';
import prisma from '../prisma';
import { ratingToLeague } from '@integrame/shared';

const router = Router();
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

async function isIpBanned(ip: string): Promise<boolean> {
  if (!ip || ip === 'unknown') return false;
  const entry = await prisma.bannedIP.findUnique({ where: { ip } });
  return !!entry;
}
// ─── Mailer ───────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
});

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// POST /api/auth/send-otp
router.post('/send-otp', async (req: Request, res: Response) => {
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email invalid' });

  const clientIp = getClientIp(req);
  if (await isIpBanned(clientIp)) return res.status(403).json({ error: 'Acces blocat.' });

  const { email } = parsed.data;
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + config.otpExpiresMins * 60 * 1000);

  await prisma.oTP.upsert({
    where: { email },
    update: { code: otp, expiresAt },
    create: { email, code: otp, expiresAt },
  });

  if (config.nodeEnv === 'production') {
    await transporter.sendMail({
      from: config.smtp.from,
      to: email,
      subject: 'Codul tău OTP – Integrame',
      html: `<h2>Codul tău de verificare</h2><p style="font-size:32px;letter-spacing:8px"><strong>${otp}</strong></p><p>Expiră în ${config.otpExpiresMins} minute.</p>`,
    });
  }

  return res.json({
    message: 'OTP trimis',
    // In development: return code directly so you don't need an SMTP server
    ...(config.nodeEnv !== 'production' && { otp }),
  });
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const schema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(20),
    otp: z.string().length(6),
    referralCode: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const clientIp = getClientIp(req);
  if (await isIpBanned(clientIp)) return res.status(403).json({ error: 'Acces blocat.' });

  const { email, username, otp, referralCode } = parsed.data;
  const rawPlatform = (req.headers['x-platform'] as string) || (req.body as { platform?: string }).platform || 'web';
  const platform = (['web', 'ios', 'android'] as string[]).includes(rawPlatform) ? rawPlatform : 'web';

  const otpRecord = await prisma.oTP.findUnique({ where: { email } });
  if (!otpRecord || otpRecord.code !== otp || new Date() > otpRecord.expiresAt) {
    return res.status(400).json({ error: 'OTP invalid sau expirat' });
  }

  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } });
  if (existing) return res.status(409).json({ error: 'Email sau username deja folosit' });

  const user = await prisma.user.create({
    data: {
      email,
      username,
      rating: 1000,
      xp: 0,
      league: 'bronze',
      referralCode: referralCode || null,
      platform,
    },
  });

  // Handle invite referral auto-join
  if (referralCode) {
    const invite = await prisma.invite.findUnique({ where: { code: referralCode } });
    if (invite) {
      const invUsedBy: string[] = JSON.parse(invite.usedBy as string);
      if (new Date() < invite.expiresAt && invUsedBy.length < invite.maxUses) {
        invUsedBy.push(user.id);
        await prisma.invite.update({
          where: { id: invite.id },
          data: { usedBy: JSON.stringify(invUsedBy) },
        });
      }
    }
  }

  await prisma.oTP.delete({ where: { email } });

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
  return res.status(201).json({ token, user: { ...user, league: ratingToLeague(user.rating) } });
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const schema = z.object({ email: z.string().email(), otp: z.string().length(6) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { email, otp } = parsed.data;

  const otpRecord = await prisma.oTP.findUnique({ where: { email } });
  if (!otpRecord || otpRecord.code !== otp || new Date() > otpRecord.expiresAt) {
    return res.status(400).json({ error: 'OTP invalid sau expirat' });
  }

  const clientIp = getClientIp(req);
  if (await isIpBanned(clientIp)) return res.status(403).json({ error: 'Acces blocat.' });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return res.status(404).json({ error: 'Utilizatorul nu există. Înregistrează-te.' });
  if (user.isBanned) return res.status(403).json({ error: 'Contul tău a fost suspendat.' });

  await prisma.oTP.delete({ where: { email } });

  // Save last known IP and platform for analytics
  const rawPlatformL = (req.headers['x-platform'] as string) || (req.body as { platform?: string }).platform || 'web';
  const platformL = (['web', 'ios', 'android'] as string[]).includes(rawPlatformL) ? rawPlatformL : 'web';
  await prisma.user.update({ where: { id: user.id }, data: { lastIp: clientIp, platform: platformL } });

  const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn } as jwt.SignOptions);
  return res.json({ token, user: { ...user, league: ratingToLeague(user.rating) } });
});

export default router;

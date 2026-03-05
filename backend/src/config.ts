import dotenv from 'dotenv';
dotenv.config();

function envBool(value: string | undefined, defaultValue = false): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'changeme',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  otpExpiresMins: parseInt(process.env.OTP_EXPIRES_MINUTES || '10', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Integrame <noreply@integrame.ro>',
  },
  features: {
    simPlayersEnabled: envBool(process.env.SIM_PLAYERS_ENABLED, false),
    ghostPlayersEnabled: envBool(process.env.GHOST_PLAYERS_ENABLED, false),
    botChatEnabled: envBool(process.env.BOT_CHAT_ENABLED, false),
    botActivityFeedEnabled: envBool(process.env.BOT_ACTIVITY_FEED_ENABLED, false),
  },
  simulatedOps: {
    maxLagForNonCriticalMs: parseInt(process.env.SIM_MAX_LAG_NON_CRITICAL_MS || '120', 10),
    decisionP95AlertMs: parseInt(process.env.SIM_DECISION_P95_ALERT_MS || '40', 10),
    eventLoopLagAlertMs: parseInt(process.env.SIM_EVENT_LOOP_LAG_ALERT_MS || '80', 10),
    generatorCircuitBreakerConsecutiveErrors: parseInt(process.env.SIM_CIRCUIT_BREAKER_ERRORS || '5', 10),
    generatorCircuitBreakerMs: parseInt(process.env.SIM_CIRCUIT_BREAKER_MS || '120000', 10),
  },
};

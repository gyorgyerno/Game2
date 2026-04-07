import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../prisma';
import { registerMatchHandlers } from './matchHandler';
import { contestEngine } from '../services/ContestEngine';

export let io: SocketServer;

// ─── Online user tracking ─────────────────────────────────────────────────────
// Map<userId, socketCount> — user is online while count > 0
const onlineUsers = new Map<string, number>();

export function getOnlineUserCount(): number {
  return onlineUsers.size;
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}

// ─── Notify friends when a user goes online/offline ──────────────────────────
async function notifyFriendsStatus(userId: string, online: boolean) {
  try {
    const friendships = await prisma.friendship.findMany({
      where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] },
      select: { senderId: true, receiverId: true },
    });
    for (const f of friendships) {
      const friendId = f.senderId === userId ? f.receiverId : f.senderId;
      io.to(`user:${friendId}`).emit('friend_status_changed', { userId, isOnline: online });
    }
  } catch { /* non-critical */ }
}

// ─── Throttled admin stats push (at most every 2s) ───────────────────────────
let _adminEmitTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAdminStatsEmit() {
  if (_adminEmitTimer) return; // already scheduled
  _adminEmitTimer = setTimeout(async () => {
    _adminEmitTimer = null;
    if (!io) return;
    try {
      const [activeMatches, waitingMatches] = await Promise.all([
        prisma.match.count({ where: { status: { in: ['active', 'countdown'] } } }),
        prisma.match.count({ where: { status: 'waiting' } }),
      ]);
      io.of('/admin-ws').emit('admin_stats_update', {
        onlineUsers: onlineUsers.size,
        activeMatches,
        waitingMatches,
      });
    } catch { /* non-critical */ }
  }, 2000);
}

export function initSocket(server: HttpServer) {
  io = new SocketServer(server, {
    cors: { origin: config.clientUrl, credentials: true },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // ── User socket auth middleware ───────────────────────────────────────────
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = jwt.verify(token as string, config.jwtSecret) as { userId: string };
      const user = await prisma.user.findUnique({ where: { id: payload.userId } }).catch(() => null);
      if (user?.isBanned) return next(new Error('Cont suspendat'));
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as string;
    console.log(`🔌 Socket connected: ${socket.id} (user: ${userId})`);

    // Track online — join personal room, notify friends only on first connection
    const wasOffline = !onlineUsers.has(userId);
    onlineUsers.set(userId, (onlineUsers.get(userId) ?? 0) + 1);
    socket.join(`user:${userId}`);
    if (wasOffline) notifyFriendsStatus(userId, true);
    scheduleAdminStatsEmit();

    registerMatchHandlers(io, socket, userId);

    // ── Contest Socket Rooms ──────────────────────────────────────────────────
    socket.on('join_contest_room', ({ contestId }: { contestId: string }) => {
      if (!contestId || typeof contestId !== 'string') return;
      socket.join(`contest:${contestId}`);
      contestEngine.markOnline(contestId, userId);
    });

    socket.on('leave_contest_room', ({ contestId }: { contestId: string }) => {
      if (!contestId || typeof contestId !== 'string') return;
      socket.leave(`contest:${contestId}`);
      contestEngine.markOffline(contestId, userId);
    });

    // ── Friend Match Invite ───────────────────────────────────────────────────
    socket.on('friend_invite', async ({ targetUserId, matchId, gameType, level }: {
      targetUserId: string; matchId: string; gameType: string; level: number;
    }) => {
      if (!targetUserId || !matchId || !gameType) return;
      try {
        // Verifică că sunt prieteni acceptați
        const friendship = await prisma.friendship.findFirst({
          where: {
            status: 'accepted',
            OR: [
              { senderId: userId, receiverId: targetUserId },
              { senderId: targetUserId, receiverId: userId },
            ],
          },
        });
        if (!friendship) return;

        const sender = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true, avatarUrl: true },
        });
        if (!sender) return;

        io.to(`user:${targetUserId}`).emit('friend_invite_received', {
          matchId,
          gameType,
          level,
          fromUserId: userId,
          fromUsername: sender.username,
          fromAvatarUrl: sender.avatarUrl,
        });
      } catch { /* non-critical */ }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      contestEngine.markOfflineFromAll(userId);
      // Untrack online — notify friends only when fully offline (all tabs closed)
      const remaining = (onlineUsers.get(userId) ?? 1) - 1;
      if (remaining <= 0) {
        onlineUsers.delete(userId);
        notifyFriendsStatus(userId, false);
      } else {
        onlineUsers.set(userId, remaining);
      }
      scheduleAdminStatsEmit();
    });
  });

  // ── Admin namespace (/admin-ws) ───────────────────────────────────────────
  const adminNs = io.of('/admin-ws');

  adminNs.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = jwt.verify(token as string, config.jwtSecret) as { role?: string };
      if (payload.role !== 'admin') return next(new Error('Forbidden'));
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  adminNs.on('connection', async (socket) => {
    console.log(`🛰️  Admin socket connected: ${socket.id}`);
    // Send current stats immediately on connect
    try {
      const [activeMatches, waitingMatches] = await Promise.all([
        prisma.match.count({ where: { status: { in: ['active', 'countdown'] } } }),
        prisma.match.count({ where: { status: 'waiting' } }),
      ]);
      socket.emit('admin_stats_update', {
        onlineUsers: onlineUsers.size,
        activeMatches,
        waitingMatches,
      });
    } catch { /* non-critical */ }
  });

  return io;
}

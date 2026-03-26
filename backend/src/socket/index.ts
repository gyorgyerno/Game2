import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../prisma';
import { registerMatchHandlers } from './matchHandler';

export let io: SocketServer;

export function initSocket(server: HttpServer) {
  io = new SocketServer(server, {
    cors: { origin: config.clientUrl, credentials: true },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // Auth middleware
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

    registerMatchHandlers(io, socket, userId);

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

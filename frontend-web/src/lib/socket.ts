import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS } from '@integrame/shared';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    let token: string | null = null;
    if (typeof window !== 'undefined') {
      try { token = localStorage.getItem('token'); } catch { /* Edge strict mode */ }
      if (!token) {
        try { token = sessionStorage.getItem('token'); } catch { /* ignore */ }
      }
    }
    socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket'],
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export { SOCKET_EVENTS };

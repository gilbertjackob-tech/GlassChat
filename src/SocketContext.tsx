import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { User } from './types';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children, currentUser }: { children: ReactNode; currentUser: User | null }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Initialize socket connection
    // In our setup, the socket server is on the same host/port 
    // as the Vite development server (port 3000)
    const socketInstance = io(window.location.origin, {
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
    });

    const identify = () => {
      if (currentUser?.id) {
        socketInstance.emit("identify", currentUser.id);
      }
    };

    socketInstance.on('connect', () => {
      setIsConnected(true);
      identify();
    });

    socketInstance.io.on("reconnect", identify);

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.io.off("reconnect", identify);
      socketInstance.disconnect();
    };
  }, [currentUser?.id]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

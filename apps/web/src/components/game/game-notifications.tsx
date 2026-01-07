"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { 
  CheckCircle, AlertCircle, Info, X, Swords, Home, 
  FlaskConical, Building2, Users, Zap
} from "lucide-react";

export type NotificationType = "success" | "error" | "info" | "combat" | "building" | "tech" | "unit";

export interface GameNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

interface GameNotificationsProps {
  notifications: GameNotification[];
  onDismiss: (id: string) => void;
}

const ICONS: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
  error: <AlertCircle className="w-5 h-5 text-red-400" />,
  info: <Info className="w-5 h-5 text-blue-400" />,
  combat: <Swords className="w-5 h-5 text-orange-400" />,
  building: <Building2 className="w-5 h-5 text-amber-400" />,
  tech: <FlaskConical className="w-5 h-5 text-purple-400" />,
  unit: <Users className="w-5 h-5 text-cyan-400" />,
};

const COLORS: Record<NotificationType, string> = {
  success: "border-emerald-500/50 bg-emerald-950/90",
  error: "border-red-500/50 bg-red-950/90",
  info: "border-blue-500/50 bg-blue-950/90",
  combat: "border-orange-500/50 bg-orange-950/90",
  building: "border-amber-500/50 bg-amber-950/90",
  tech: "border-purple-500/50 bg-purple-950/90",
  unit: "border-cyan-500/50 bg-cyan-950/90",
};

export function GameNotifications({ notifications, onDismiss }: GameNotificationsProps) {
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

function NotificationItem({ 
  notification, 
  onDismiss 
}: { 
  notification: GameNotification; 
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = notification.duration ?? 3000;
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
    }, duration - 300);

    const removeTimer = setTimeout(() => {
      onDismiss(notification.id);
    }, duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [notification, onDismiss]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md shadow-lg min-w-[280px] max-w-[400px]",
        "transition-all duration-300 ease-out",
        COLORS[notification.type],
        isExiting ? "opacity-0 translate-y-[-10px] scale-95" : "opacity-100 translate-y-0 scale-100",
        "animate-in slide-in-from-top-2 zoom-in-95"
      )}
    >
      {ICONS[notification.type]}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm font-bold text-white truncate">
          {notification.title}
        </p>
        {notification.message && (
          <p className="text-xs text-slate-300 truncate mt-0.5">
            {notification.message}
          </p>
        )}
      </div>
      <button
        onClick={() => onDismiss(notification.id)}
        className="p-1 hover:bg-white/10 rounded transition-colors"
      >
        <X className="w-4 h-4 text-slate-400" />
      </button>
    </div>
  );
}

// Hook for managing notifications
export function useGameNotifications() {
  const [notifications, setNotifications] = useState<GameNotification[]>([]);

  const addNotification = useCallback((notification: Omit<GameNotification, "id">) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setNotifications((prev) => [...prev.slice(-4), { ...notification, id }]); // Keep max 5
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = {
    success: (title: string, message?: string) => 
      addNotification({ type: "success", title, message, duration: 2500 }),
    error: (title: string, message?: string) => 
      addNotification({ type: "error", title, message, duration: 4000 }),
    info: (title: string, message?: string) => 
      addNotification({ type: "info", title, message, duration: 3000 }),
    combat: (title: string, message?: string) => 
      addNotification({ type: "combat", title, message, duration: 3000 }),
    building: (title: string, message?: string) => 
      addNotification({ type: "building", title, message, duration: 2500 }),
    tech: (title: string, message?: string) => 
      addNotification({ type: "tech", title, message, duration: 3000 }),
    unit: (title: string, message?: string) => 
      addNotification({ type: "unit", title, message, duration: 2500 }),
  };

  return {
    notifications,
    dismissNotification,
    notify,
  };
}


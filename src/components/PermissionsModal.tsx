import React, { useState } from "react";

export function PermissionsModal({ onDone }: { onDone: () => void }) {
  const [loading, setLoading] = useState(false);

  const requestPermissions = async () => {
    setLoading(true);

    try {
      // 1. Notification
      if ("Notification" in window && Notification.permission !== "granted") {
        await Notification.requestPermission();
      }

      // 2. Storage
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }

      // 3. Camera & Microphone (Video + Audio)
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          stream.getTracks().forEach((t) => t.stop()); // Stop immediately
        } catch (e) {
          console.warn("Camera/Mic denied or unavailable", e);
        }
      }

      // 4. Location
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          () => {},
          (err) => console.warn("Location denied or unavailable", err),
        );
      }
    } catch (error) {
      console.error("Error requesting permissions", error);
    } finally {
      setLoading(false);
      onDone();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-[#202c33] rounded-xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
        <div className="w-16 h-16 bg-blue-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-slate-800 dark:text-[#e9edef] mb-4">
          Permissions Needed
        </h2>

        <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm flex flex-col space-y-1">
          <span>To provide the full experience, we need access to:</span>
          <span className="font-medium mt-2">• Notifications</span>
          <span className="font-medium">• Location</span>
          <span className="font-medium">• Camera & Photos</span>
          <span className="font-medium">• Storage</span>
          <span className="font-medium">• Microphone</span>
        </p>

        <div className="flex flex-col w-full space-y-3">
          <button
            onClick={requestPermissions}
            disabled={loading}
            className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Requesting..." : "Allow All"}
          </button>

          <button
            onClick={onDone}
            disabled={loading}
            className="w-full text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 py-2 text-sm font-medium transition-colors"
          >
            Ask me later
          </button>
        </div>
      </div>
    </div>
  );
}

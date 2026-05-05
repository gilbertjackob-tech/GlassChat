import React, { useState } from "react";
import { X, MapPin, Navigation, Link as LinkIcon } from "lucide-react";

export function LocationShareModal({
  onClose,
  onShare,
}: {
  onClose: () => void;
  onShare: (isLive: boolean, durationMinutes?: number, manualLocation?: string) => void;
}) {
  const [liveLocation, setLiveLocation] = useState(false);
  const [duration, setDuration] = useState(15);
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState("");

  const isSecure = window.isSecureContext;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-[#202c33] rounded-xl w-full max-w-sm shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center px-4 py-3 border-b border-slate-100 dark:border-[#2f3b43]">
          <h3 className="font-semibold text-slate-800 dark:text-[#e9edef]">
            Share Location
          </h3>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 dark:hover:text-[#e9edef] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!isSecure && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-200 mb-4">
              <strong>Warning:</strong> Location, camera, and microphone require HTTPS. Use your Tailscale Serve HTTPS URL, or use manual location fallback below.
            </div>
          )}

          {!manualMode ? (
            <>
              <button
                className="flex items-center w-full space-x-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-[#111b21] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onShare(false)}
                disabled={!isSecure}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-medium text-slate-800 dark:text-[#e9edef]">
                    Send your current location {(!isSecure) && "(Requires HTTPS)"}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#8696a0]">
                    Accurate to a few meters
                  </span>
                </div>
              </button>

              <button
                className={`flex items-center w-full space-x-3 p-3 rounded-lg transition-colors ${liveLocation ? "bg-indigo-50 dark:bg-indigo-900/20" : "hover:bg-slate-50 dark:hover:bg-[#111b21]"} disabled:opacity-50 disabled:cursor-not-allowed`}
                onClick={() => setLiveLocation(!liveLocation)}
                disabled={!isSecure}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${liveLocation ? "bg-indigo-100 dark:bg-indigo-900/40" : "bg-slate-100 dark:bg-slate-800"}`}
                >
                  <Navigation
                    className={`w-5 h-5 ${liveLocation ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400"}`}
                  />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-medium text-slate-800 dark:text-[#e9edef]">
                    Share live location {(!isSecure) && "(Requires HTTPS)"}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#8696a0]">
                    Updates as you move
                  </span>
                </div>
              </button>

              {liveLocation && (
                <div className="pt-2 pl-14">
                  <label className="text-sm text-slate-600 dark:text-slate-400 mb-2 block">
                    Share for:
                  </label>
                  <div className="flex space-x-2">
                    {[15, 60, 480].map((mins) => (
                      <button
                        key={mins}
                        onClick={() => setDuration(mins)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium ${duration === mins ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"}`}
                      >
                        {mins === 15
                          ? "15 min"
                          : mins === 60
                            ? "1 hour"
                            : "8 hours"}
                      </button>
                    ))}
                  </div>
                  <button
                    className="mt-4 w-full bg-[#00a884] text-white py-2 rounded-lg font-medium hover:bg-[#008f6f]"
                    onClick={() => onShare(true, duration)}
                  >
                    Start Sharing
                  </button>
                </div>
              )}

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                <span className="flex-shrink-0 mx-4 text-xs text-slate-400">or</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
              </div>

              <button
                className="flex items-center w-full space-x-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-[#111b21] transition-colors"
                onClick={() => setManualMode(true)}
              >
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                  <LinkIcon className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-medium text-slate-800 dark:text-[#e9edef]">
                    Enter manual location
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#8696a0]">
                    Google Maps link, address, or coords
                  </span>
                </div>
              </button>
            </>
          ) : (
            <div className="space-y-4">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Location URL or Address
              </label>
              <textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="e.g., https://maps.google.com/... or 'Times Square, NY'"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none h-24"
              />
              <div className="flex space-x-3">
                <button
                  onClick={() => setManualMode(false)}
                  className="flex-1 py-2 rounded-lg font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  Back
                </button>
                <button
                  onClick={() => onShare(false, undefined, manualText)}
                  disabled={!manualText.trim()}
                  className="flex-1 py-2 rounded-lg font-medium bg-orange-500 text-white hover:bg-orange-600 transition disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

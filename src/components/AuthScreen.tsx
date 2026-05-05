import React, { useState, useEffect } from "react";
import { User } from "../types";

interface AuthScreenProps {
  onAuthSuccess: (user: User) => void;
}

type AuthMode = "login" | "register";

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState(
    "What was the name of your first pet?",
  );
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [fetchedQuestion, setFetchedQuestion] = useState("");
  const [step, setStep] = useState<"username" | "question">("username");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const commonQuestions = [
    "What was the name of your first pet?",
    "In what city where you born?",
    "What is your mother's maiden name?",
    "What was the name of your first school?",
    "What is your favorite book?",
  ];

  useEffect(() => {
    // If we have a saved username in localStorage, pre-fill it
    const savedName = localStorage.getItem("whatsclone_last_username");
    if (savedName) {
      setName(savedName);
    }
  }, []);

  const handleFetchQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch(
        `/api/user-question?name=${encodeURIComponent(name)}`,
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "User not found");
      }
      setFetchedQuestion(data.securityQuestion);
      setStep("question");
      localStorage.setItem("whatsclone_last_username", name);
    } catch (err: any) {
      setError(err.message);
      if (err.message === "User not found") {
        setMode("register");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, securityAnswer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      onAuthSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, securityQuestion, securityAnswer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");
      localStorage.setItem("whatsclone_last_username", name.trim());
      onAuthSuccess(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex bg-slate-100 dark:bg-[#0b141a] w-full min-h-screen items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111b21] rounded-2xl shadow-lg border border-slate-200 dark:border-[#2f3b43] max-w-sm w-full overflow-hidden p-8">
        <h2 className="text-2xl font-bold text-center text-slate-800 dark:text-[#e9edef] mb-6">
          {mode === "login" ? "Welcome Back" : "Create Account"}
        </h2>

        {error && (
          <div className="p-3 mb-4 text-sm text-red-500 bg-red-100 dark:bg-red-900/30 rounded">
            {error}
          </div>
        )}

        {mode === "login" ? (
          step === "username" ? (
            <form
              onSubmit={handleFetchQuestion}
              className="flex flex-col gap-4"
            >
              <input
                type="text"
                placeholder="Username"
                className="w-full bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2f3b43] rounded-lg px-4 py-3 text-slate-800 dark:text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none focus:border-[#00a884]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white font-medium py-3 rounded-lg transition-colors mt-2"
              >
                {loading ? "Checking..." : "Continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                Security Question: <br />
                <span className="text-lg text-slate-800 dark:text-slate-200">
                  {fetchedQuestion}
                </span>
              </div>
              <input
                type="text"
                placeholder="Your Answer"
                className="w-full bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2f3b43] rounded-lg px-4 py-3 text-slate-800 dark:text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none focus:border-[#00a884]"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white font-medium py-3 rounded-lg transition-colors mt-2"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("username");
                  setSecurityAnswer("");
                  setError("");
                }}
                className="w-full text-slate-500 hover:text-slate-700 dark:hover:text-[#e9edef] text-sm py-2"
              >
                Back
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Choose a Username"
              className="w-full bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2f3b43] rounded-lg px-4 py-3 text-slate-800 dark:text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none focus:border-[#00a884]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                Security Question
              </label>
              <select
                value={securityQuestion}
                onChange={(e) => setSecurityQuestion(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2f3b43] rounded-lg px-4 py-3 text-slate-800 dark:text-[#e9edef] focus:outline-none focus:border-[#00a884]"
              >
                {commonQuestions.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              placeholder="Your Answer (This will be your password)"
              className="w-full bg-slate-50 dark:bg-[#202c33] border border-slate-200 dark:border-[#2f3b43] rounded-lg px-4 py-3 text-slate-800 dark:text-[#e9edef] placeholder:text-[#8696a0] focus:outline-none focus:border-[#00a884]"
              value={securityAnswer}
              onChange={(e) => setSecurityAnswer(e.target.value)}
              required
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00a884] hover:bg-[#008f6f] text-white font-medium py-3 rounded-lg transition-colors mt-2"
            >
              {loading ? "Creating..." : "Sign Up"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-slate-500 dark:text-[#8696a0] flex flex-col gap-2">
          {mode === "login" ? (
            <div>
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
                className="text-[#00a884] hover:underline"
              >
                Sign up
              </button>
            </div>
          ) : (
            <div>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setStep("username");
                  setError("");
                }}
                className="text-[#00a884] hover:underline"
              >
                Sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

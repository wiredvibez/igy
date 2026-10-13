"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage, readPayload } from "@/lib/use-session";

export function PasswordDialog({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        setError(errorMessage(payload, "That password is not right."));
        return;
      }
      onSuccess();
    } catch {
      setError("Could not reach the board.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <h2>Admin</h2>
        <label htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          ref={inputRef}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button solid" disabled={busy || password.length === 0}>
            {busy ? "Checking" : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
}

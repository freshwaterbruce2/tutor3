import React, { useEffect, useRef, useState } from 'react';

import { parentPinRepository, type ParentPinState } from '../../services/parentPinRepository';

interface PinLockProps {
  onUnlock: () => void;
}

// Generate a cryptographically random 16-byte hex salt
function generateSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// PBKDF2 PIN hash — 310,000 iterations, SHA-256, 32-byte output
// NOTE: Hashes generated here are not backward-compatible with the old SHA-256(pin+salt) format.
// On first launch after this upgrade, users with an existing PIN must reset it.
async function hashPin(pin: string, salt: string): Promise<string> {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 310_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  return Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const SecurePinLock = ({ onUnlock }: PinLockProps) => {
  const [state, setState] = useState<ParentPinState | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageFailed, setStorageFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const submitting = useRef(false);
  const mounted = useRef(true);
  const isSetupMode = state?.hash === null;
  const lockout = state !== null && state.lockoutUntil > 0;
  const lockoutRemaining = Math.max(0, (state?.lockoutUntil ?? 0) - now);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    setLoading(true);
    setStorageFailed(false);
    void parentPinRepository.load().then((loaded) => {
      if (!cancelled) { setState(loaded); setNow(Date.now()); setLoading(false); }
    }).catch(() => {
      if (!cancelled) { setLoading(false); setStorageFailed(true); }
    });
    return () => { cancelled = true; mounted.current = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!lockout || storageFailed) return;
    let cancelled = false;
    let expiring = false;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (state && Date.now() >= state.lockoutUntil && !expiring) {
        expiring = true;
        void parentPinRepository.load().then((loaded) => {
          if (!cancelled) { setState(loaded); setError(''); }
        }).catch(() => { if (!cancelled) setStorageFailed(true); });
      }
    }, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [lockout, state, storageFailed]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPin = e.target.value;
    if (/^\d*$/.test(newPin) && newPin.length <= 6) {
      setPin(newPin);
      setError('');
    }
  };

  const handleConfirmPinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPin = e.target.value;
    if (/^\d*$/.test(newPin) && newPin.length <= 6) {
      setConfirmPin(newPin);
      setError('');
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || loading || storageFailed || !state || !isSetupMode) return;
    if (!/^\d{4,6}$/.test(pin)) { setError('PIN must be 4-6 digits.'); return; }
    if (pin !== confirmPin) { setError('PINs do not match.'); return; }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const salt = generateSalt();
      const hashedPin = await hashPin(pin, salt);
      const committed = await parentPinRepository.update((current) => {
        if (current.hash !== null) throw new Error('PIN is already configured');
        return { state: { version: 1, hashVersion: 'pbkdf2', hash: hashedPin, salt,
          attempts: 0, lockoutUntil: 0 }, result: undefined };
      });
      if (mounted.current) { setState(committed.state); onUnlock(); }
    } catch {
      if (mounted.current) { setStorageFailed(true); setError(''); }
    } finally {
      setPin(''); setConfirmPin('');
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || loading || storageFailed || !state || lockout) return;
    if (!/^\d{4,6}$/.test(pin)) { setError('PIN must be 4-6 digits.'); return; }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const committed = await parentPinRepository.update(async (current) => {
        if (!current.hash || !current.salt) throw new Error('PIN is not configured');
        if (current.lockoutUntil > Date.now()) return { state: current, result: 'locked' };
        const enteredHash = await hashPin(pin, current.salt);
        if (enteredHash === current.hash) {
          return { state: { ...current, attempts: 0, lockoutUntil: 0 }, result: 'unlocked' };
        }
        const attempts = current.attempts + 1;
        const lockoutDurations = [30000, 300000, 900000, 3600000];
        const failedSets = Math.min(Math.floor(attempts / 3) - 1, 3);
        const duration = attempts >= 3 ? (lockoutDurations[failedSets] ?? 3600000) : 0;
        return { state: { ...current, attempts, lockoutUntil: duration > 0 ? Date.now() + duration : 0 },
          result: 'incorrect' };
      });
      if (mounted.current) {
        setState(committed.state); setNow(Date.now());
        if (committed.result === 'unlocked') onUnlock();
        else if (committed.state.lockoutUntil === 0) {
          setError(`Incorrect PIN. ${3 - committed.state.attempts} attempts remaining.`);
        }
      }
    } catch {
      if (mounted.current) setStorageFailed(true);
    } finally {
      setPin(''); submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const formatLockoutTime = () => {
    if (!lockout || lockoutRemaining <= 0) return '';
    const minutes = Math.floor(lockoutRemaining / 60000);
    const seconds = Math.floor((lockoutRemaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (loading || storageFailed || !state) {
    return <div className="p-6" role={storageFailed ? 'alert' : 'status'}>
      <p>{storageFailed ? 'Parent PIN storage is unavailable. Access remains locked.' : 'Opening Parent PIN…'}</p>
      {storageFailed && <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Retry PIN storage</button>}
    </div>;
  }

  if (isSetupMode) {
    return (
      <div className="h-full min-h-0 box-border flex flex-col items-center overflow-y-auto px-8 pt-[max(2rem,env(safe-area-inset-top,0px))] pb-[max(2rem,env(safe-area-inset-bottom,0px))] bg-slate-800/50">
        <div className="my-auto w-full max-w-sm shrink-0 text-center">
          <h2 className="text-2xl font-bold text-text-primary mb-2">Set Up Parent PIN</h2>
          <p className="text-text-secondary mb-8">
            Create a secure 4-6 digit PIN to protect the Parent Zone.
          </p>
          <form onSubmit={(e) => { void handleSetupSubmit(e); }}>
            <input
              type="password"
              id="pin-entry"
              name="pin-entry"
              placeholder="Enter PIN"
              value={pin}
              onChange={handlePinChange}
              disabled={busy}
              maxLength={6}
              className="w-full p-4 mb-4 text-center text-3xl tracking-[0.5em] placeholder:text-base placeholder:tracking-normal bg-slate-700/50 border border-slate-600 rounded-lg text-text-primary focus:ring-2 focus:ring-[var(--primary-accent)] outline-none"
              autoFocus
              autoComplete="off"
            />
            <input
              type="password"
              id="pin-confirm"
              name="pin-confirm"
              placeholder="Confirm PIN"
              value={confirmPin}
              onChange={handleConfirmPinChange}
              disabled={busy}
              maxLength={6}
              className="w-full p-4 text-center text-3xl tracking-[0.5em] placeholder:text-base placeholder:tracking-normal bg-slate-700/50 border border-slate-600 rounded-lg text-text-primary focus:ring-2 focus:ring-[var(--primary-accent)] outline-none"
              autoComplete="off"
            />
            {error && <p className="text-red-400 mt-4">{error}</p>}
            <button
              type="submit"
              className="w-full mt-6 px-6 py-3 rounded-lg bg-[var(--primary-accent)] text-background-main font-semibold hover:opacity-80 disabled:opacity-50"
              disabled={busy || pin.length < 4 || pin !== confirmPin}
            >
              Set PIN
            </button>
          </form>
          <p className="text-xs text-text-muted mt-4">
            PIN is securely hashed and cannot be recovered if forgotten. Write it down in a safe
            place.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 box-border flex flex-col items-center overflow-y-auto px-8 pt-[max(2rem,env(safe-area-inset-top,0px))] pb-[max(2rem,env(safe-area-inset-bottom,0px))] bg-slate-800/50">
      <div className="my-auto w-full max-w-sm shrink-0 text-center">
        <h2 className="text-2xl font-bold text-text-primary mb-2">Parent Zone</h2>
        <p className="text-text-secondary mb-8">
          {lockout
            ? `Locked. Try again in ${formatLockoutTime()}`
            : 'Please enter the PIN to continue.'}
        </p>
        <form onSubmit={(e) => { void handleLoginSubmit(e); }}>
          <input
            type="password"
            id="current-pin"
            name="current-pin"
            value={pin}
            onChange={handlePinChange}
            maxLength={6}
            className="w-full p-4 text-center text-3xl tracking-[1em] bg-slate-700/50 border border-slate-600 rounded-lg text-text-primary focus:ring-2 focus:ring-[var(--primary-accent)] outline-none"
            autoFocus
            disabled={busy || lockout}
            autoComplete="off"
            placeholder={lockout ? 'LOCKED' : ''}
          />
          {error && !lockout && <p className="text-red-400 mt-4">{error}</p>}
          {lockout && (
            <div className="mt-4">
              <p className="text-orange-400">Too many failed attempts</p>
              <p className="text-2xl font-mono text-orange-400 mt-2">{formatLockoutTime()}</p>
            </div>
          )}
          <button
            type="submit"
            className="w-full mt-6 px-6 py-3 rounded-lg bg-[var(--primary-accent)] text-background-main font-semibold hover:opacity-80 disabled:opacity-50"
            disabled={busy || pin.length < 4 || lockout}
          >
            {lockout ? 'Locked' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SecurePinLock;

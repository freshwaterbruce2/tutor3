import { MessageSquare } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { dataStore } from '../../services/dataStore';

type ChatActivityState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; tutorMessages: number; buddyMessages: number };

const ChatAnalytics = () => {
  const [state, setState] = useState<ChatActivityState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState({ status: 'loading' });
      try {
        await dataStore.initialize();
        const [tutor, buddy] = await Promise.all([
          dataStore.getChatHistory('tutor'),
          dataStore.getChatHistory('friend'),
        ]);
        if (!Array.isArray(tutor) || !Array.isArray(buddy)) {
          throw new Error('Saved chat history is unavailable');
        }
        if (!cancelled) {
          setState({ status: 'ready', tutorMessages: tutor.length, buddyMessages: buddy.length });
        }
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <div className="p-6 bg-background-surface border border-[var(--border-color)] rounded-2xl">
      <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary-accent)] to-[var(--secondary-accent)] mb-4">
        Chat Activity
      </h3>
      {state.status === 'loading' && <p role="status">Loading saved chat activity…</p>}
      {state.status === 'error' && (
        <div role="alert">
          <p>Saved chat activity is unavailable.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 text-[var(--primary-accent)] underline">
            Retry chat activity
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Tutor Messages" value={state.tutorMessages} />
            <StatCard label="Buddy Messages" value={state.buddyMessages} />
          </div>
          {state.tutorMessages === 0 && state.buddyMessages === 0 && (
            <p className="mt-4 text-sm text-slate-400">No saved chat messages yet.</p>
          )}
        </>
      )}
    </div>
  );
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 bg-slate-800/50 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare className="w-5 h-5 text-[var(--primary-accent)]" />
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[var(--primary-accent)]">{value}</p>
    </div>
  );
}

export default ChatAnalytics;

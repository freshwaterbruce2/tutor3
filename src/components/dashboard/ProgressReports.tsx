import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { HomeworkItem } from '../../types';
import {
  getProgressReportInFlight,
  requestProgressReport,
  subscribeProgressReport,
  type ProgressSnapshot,
} from '../../services/reportGeneratorService';
import { dataStore } from '../../services/dataStore';
import { getTokenStats, initializeTokenLedger, subscribeToTokenChanges } from '../../services/tokenService';

interface ProgressReportsProps {
  items: HomeworkItem[];
}

type LocalStats =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; points: number; focusSessions: number };

type ReportState = { signature: string; text: string } | null;

function readNonnegativeSafeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function cloneItems(items: HomeworkItem[]): HomeworkItem[] {
  return items.map(({ id, subject, title, dueDate, completed, completedDate }) => ({
    id,
    subject,
    title,
    dueDate,
    completed,
    ...(completedDate === undefined ? {} : { completedDate }),
  }));
}

export default function ProgressReports({ items }: ProgressReportsProps) {
  const [localStats, setLocalStats] = useState<LocalStats>({ status: 'loading' });
  const [report, setReport] = useState<ReportState>(null);
  const [unavailableSignature, setUnavailableSignature] = useState<string | null>(null);
  const mounted = useRef(true);
  const loadEpoch = useRef(0);
  const requestEpoch = useRef(0);

  const generating = useSyncExternalStore(
    subscribeProgressReport,
    getProgressReportInFlight,
    () => false,
  );

  const stats = useMemo(() => {
    const subjectStats = Object.create(null) as Record<string, { total: number; completed: number }>;
    let completed = 0;

    for (const item of items) {
      const subject = subjectStats[item.subject] ?? { total: 0, completed: 0 };
      subject.total += 1;
      if (item.completed) {
        subject.completed += 1;
        completed += 1;
      }
      subjectStats[item.subject] = subject;
    }

    return {
      completed,
      total: items.length,
      subjectStats,
      points: localStats.status === 'ready' ? localStats.points : null,
      focusSessions: localStats.status === 'ready' ? localStats.focusSessions : null,
    };
  }, [items, localStats]);

  const signature = JSON.stringify({
    items: items.map(({ id, subject, title, dueDate, completed, completedDate }) => [
      id,
      subject,
      title,
      dueDate,
      completed,
      completedDate ?? null,
    ]),
    points: stats.points,
    focusSessions: stats.focusSessions,
    subjectStats: stats.subjectStats,
  });
  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  async function loadLocalStats(): Promise<void> {
    const currentLoad = ++loadEpoch.current;
    setLocalStats({ status: 'loading' });

    try {
      await dataStore.initialize();
      await initializeTokenLedger();
      const points = readNonnegativeSafeInteger(getTokenStats().totalEarned);
      const focusRecords: unknown = await dataStore.getFocusSessions();

      if (!Array.isArray(focusRecords) || points === null) {
        throw new Error('Invalid local progress statistics');
      }

      let focusSessions = 0;
      for (const record of focusRecords) {
        const focusRecord = record as { completed?: unknown } | null;
        if (
          focusRecord === null ||
          typeof focusRecord !== 'object' ||
          Array.isArray(focusRecord) ||
          typeof focusRecord.completed !== 'boolean'
        ) {
          throw new Error('Invalid focus session record');
        }
        if (focusRecord.completed) {
          focusSessions += 1;
        }
      }

      if (mounted.current && currentLoad === loadEpoch.current) {
        setLocalStats({ status: 'ready', points, focusSessions });
      }
    } catch {
      if (mounted.current && currentLoad === loadEpoch.current) {
        setLocalStats({ status: 'error' });
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeToTokenChanges(() => { void loadLocalStats(); });
    void loadLocalStats();

    return () => {
      mounted.current = false;
      requestEpoch.current += 1;
      unsubscribe();
    };
  }, []);

  // Layout timing: a click after the new UI paints must see the bumped epoch, or its result is dropped.
  useLayoutEffect(() => {
    requestEpoch.current += 1;
    setReport(null);
    setUnavailableSignature(null);
  }, [signature]);

  const noData =
    localStats.status === 'ready' &&
    stats.total === 0 &&
    stats.points === 0 &&
    stats.focusSessions === 0;

  async function generateSummary(): Promise<void> {
    if (localStats.status !== 'ready' || noData || generating) {
      return;
    }

    const requestSignature = signatureRef.current;
    const requestId = ++requestEpoch.current;
    const snapshot: ProgressSnapshot = {
      items: cloneItems(items),
      points: stats.points!,
      focusSessions: stats.focusSessions!,
      subjectStats: Object.fromEntries(
        Object.entries(stats.subjectStats).map(([subject, values]) => [subject, { ...values }]),
      ),
    };

    setReport(null);
    setUnavailableSignature(null);

    try {
      const result = await requestProgressReport(snapshot);
      if (
        !mounted.current ||
        requestId !== requestEpoch.current ||
        requestSignature !== signatureRef.current
      ) {
        return;
      }

      if (result.status === 'success') {
        setReport({ signature: requestSignature, text: result.report });
      } else {
        setUnavailableSignature(requestSignature);
      }
    } catch {
      if (
        mounted.current &&
        requestId === requestEpoch.current &&
        requestSignature === signatureRef.current
      ) {
        setUnavailableSignature(requestSignature);
      }
    }
  }

  function localValue(value: number | null): number | string {
    if (value !== null) {
      return value;
    }
    return localStats.status === 'error' ? 'Unavailable' : 'Loading…';
  }

  const showReport = report?.signature === signature ? report.text : null;
  const showUnavailable = unavailableSignature === signature;

  return (
    <div className="p-6 bg-background-surface border border-[var(--border-color)] rounded-2xl">
      <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary-accent)] to-[var(--secondary-accent)] mb-4">
        Progress Report
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="p-4 bg-slate-800/50 rounded-lg">
          <p className="text-sm text-slate-400">Assignments Completed</p>
          <p className="text-3xl font-bold text-[var(--primary-accent)]">
            {stats.completed} / {stats.total}
          </p>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-lg">
          <p className="text-sm text-slate-400">Focus Sessions</p>
          <p className="text-3xl font-bold text-[var(--secondary-accent)]">
            {localValue(stats.focusSessions)}
          </p>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-lg">
          <p className="text-sm text-slate-400">Total Tokens Earned</p>
          <p className="text-3xl font-bold text-yellow-400">{localValue(stats.points)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h4 className="text-lg font-semibold text-text-primary mb-2">Subject Breakdown</h4>
          {stats.total === 0 ? (
            <p>No assignment data yet.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.subjectStats).map(([subject, values]) => (
                <div key={subject}>
                  <div className="flex justify-between mb-1">
                    <span className="text-base font-medium text-slate-300">{subject}</span>
                    <span className="text-sm font-medium text-slate-400">
                      {values.completed} / {values.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2.5">
                    <div
                      className="bg-[var(--primary-accent)] h-2.5 rounded-full"
                      style={{ width: `${(values.completed / values.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-lg font-semibold text-text-primary mb-2">AI-Generated Summary</h4>
          {localStats.status === 'loading' && <p role="status">Loading local statistics…</p>}
          {localStats.status === 'error' && (
            <>
              <p role="alert">Local statistics could not be loaded.</p>
              <button
                className="glass-button mt-2 px-4 min-h-11 disabled:opacity-50"
                onClick={() => void loadLocalStats()}
              >
                Retry local loading
              </button>
            </>
          )}
          {localStats.status === 'ready' && (
            <>
              <p>A successful generation uses the shared AI allowance.</p>
              {noData && <p>No progress data is available for a summary.</p>}
              <button
                className="glass-button mt-3 px-4 min-h-11 disabled:opacity-50"
                disabled={generating || noData}
                onClick={() => void generateSummary()}
              >
                {generating ? 'Generating summary…' : 'Generate summary'}
              </button>
              {showReport && <p className="text-text-secondary whitespace-pre-wrap">{showReport}</p>}
              {showUnavailable && <p role="alert">Summary is unavailable. Please try again.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

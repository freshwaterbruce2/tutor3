import React, { useEffect, useRef, useState, useTransition } from 'react';
import {
    readAchievementLifecycleRecord,
    rebuildAchievementLifecycleFromLegacy,
    resetAchievementLifecycle,
    writeAchievementLifecycleRecord,
} from '../../services/achievementService';
import { dataStore } from '../../services/dataStore';
import { secureClient } from '../../services/secureClient';
import {
    applySensoryPreferences,
    DEFAULT_SENSORY_PREFERENCES,
    persistSensoryPreferences,
    requireValidSensoryPreferences,
} from '../../services/sensoryPreferences';
import { soundEffects } from '../../services/soundEffects';
import { exportThemeProfile, importThemeProfile } from '../../services/themeProfile';
import { logger } from '../../utils/logger';
import PrivacyPolicy from './PrivacyPolicy';

const DataManagement = () => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cancelServerDeleteRef = useRef<HTMLButtonElement>(null);
    const serverDeleteButtonRef = useRef<HTMLButtonElement>(null);
    const serverDeleteDialogRef = useRef<HTMLDivElement>(null);
    const [, startTransition] = useTransition();
    const [showServerDeleteConfirm, setShowServerDeleteConfirm] = useState(false);
    const [serverDeletePending, setServerDeletePending] = useState(false);
    const [serverDeleteResult, setServerDeleteResult] = useState<string | null>(null);

    useEffect(() => {
        if (showServerDeleteConfirm) {
            cancelServerDeleteRef.current?.focus({ preventScroll: true });
            serverDeleteDialogRef.current?.scrollIntoView?.({ block: 'start' });
        }
    }, [showServerDeleteConfirm]);

    useEffect(() => {
        if (!serverDeletePending && serverDeleteResult) serverDeleteButtonRef.current?.focus();
    }, [serverDeletePending, serverDeleteResult]);

    const closeServerDeleteConfirm = () => {
        setShowServerDeleteConfirm(false);
        serverDeleteButtonRef.current?.focus();
    };

    const handleServerDelete = async () => {
        if (serverDeletePending) return;
        setShowServerDeleteConfirm(false);
        setServerDeletePending(true);
        setServerDeleteResult(null);
        try {
            await secureClient.deleteMyServerData();
            setServerDeleteResult('Deletion request completed for server records this app can identify. Older usage counters, platform logs, and backups may remain. Data on this phone is separate.');
        } catch {
            setServerDeleteResult('Could not confirm server data deletion. Please try again later.');
        } finally {
            setServerDeletePending(false);
        }
    };

    const handleExport = () => {
        startTransition(async () => {
            try {
                const data: Record<string, unknown> = {};

                // Export from dataStore (single source of truth)
                const homeworkItems = await dataStore.getHomeworkItems();
                if (homeworkItems.length > 0) {
                    data['homeworkItems'] = homeworkItems;
                }

                const achievementLifecycle = await readAchievementLifecycleRecord();
                if (achievementLifecycle) {
                    data['achievementLifecycle'] = achievementLifecycle;
                }

                const achievements = await dataStore.getAchievements();
                if (achievements.length > 0) {
                    data['achievements'] = achievements;
                }

                const studentPoints = await dataStore.getStudentPoints();
                if (studentPoints > 0) {
                    data['studentPoints'] = studentPoints;
                }

                const rewards = await dataStore.getRewards();
                if (rewards.length > 0) {
                    data['parentRewards'] = rewards;
                }

                const claimedRewards = await dataStore.getClaimedRewards();
                if (claimedRewards.length > 0) {
                    data['claimedRewards'] = claimedRewards;
                }

                const focusSessions = await dataStore.getFocusSessions();
                if (focusSessions.length > 0) {
                    data['focusSessions'] = focusSessions;
                }

                const sensoryPrefs = await dataStore.getSensoryPreferences();
                if (sensoryPrefs) {
                    data['sensory-prefs'] = sensoryPrefs;
                }

                const themeProfile = exportThemeProfile();
                if (themeProfile) {
                    data['theme_profile_v1'] = themeProfile;
                }

                const jsonString = JSON.stringify(data, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `vibe-tutor-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                alert('Data exported successfully!');
            } catch (error) {
                logger.error('Failed to export data:', error);
                alert('An error occurred during export.');
            }
        });
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            startTransition(async () => {
                try {
                    const text = e.target?.result;
                    if (typeof text !== 'string') throw new Error("Invalid file format");

                    const data = JSON.parse(text);
                    const importedSensory = Object.hasOwn(data, 'sensory-prefs')
                        ? requireValidSensoryPreferences(data['sensory-prefs'])
                        : null;
                    const confirmed = window.confirm(
                        'Are you sure you want to import this data? This will overwrite all current progress.'
                    );

                    if (confirmed) {
                        if (importedSensory) {
                            const sensoryResult = await persistSensoryPreferences(importedSensory);
                            if (sensoryResult.status !== 'confirmed') {
                                throw new Error('Imported sensory preferences could not be verified.');
                            }
                            applySensoryPreferences(sensoryResult.prefs);
                            soundEffects.applyPreferences(sensoryResult.prefs);
                        }

                        // Import data through dataStore (single source of truth)
                        if (data.homeworkItems && Array.isArray(data.homeworkItems)) {
                            await dataStore.saveHomeworkItems(data.homeworkItems);
                        }

                        if (typeof data.achievementLifecycle === 'string') {
                            await writeAchievementLifecycleRecord(data.achievementLifecycle);
                        } else if (data.achievements && Array.isArray(data.achievements)) {
                            await dataStore.saveAchievements(data.achievements);
                            await rebuildAchievementLifecycleFromLegacy();
                        }

                        if (data.studentPoints) {
                            await dataStore.saveStudentPoints(data.studentPoints);
                        }

                        if (data.parentRewards && Array.isArray(data.parentRewards)) {
                            await dataStore.saveRewards(data.parentRewards);
                        }

                        if (Object.hasOwn(data, 'theme_profile_v1')) {
                            await importThemeProfile(data['theme_profile_v1']);
                        }

                        if (data.focusSessions && Array.isArray(data.focusSessions)) {
                            for (const session of data.focusSessions) {
                                await dataStore.saveFocusSession(session);
                            }
                        }

                        alert('Data imported successfully! The app will now reload.');
                        window.location.reload();
                    }
                } catch (error) {
                    logger.error('Failed to import data:', error);
                    alert('Failed to import data. Please ensure it is a valid backup file.');
                } finally {
                    // Reset file input
                    if(fileInputRef.current) {
                        fileInputRef.current.value = '';
                    }
                }
            });
        };
        reader.readAsText(file);
    };

    const handleReset = () => {
        const confirmed = window.confirm(
            'Reset App clears homework, achievements, points, rewards, and sensory settings. It keeps chat history, schedules, learning statistics, the installation identifier, the token ledger, your avatar, your companion theme, switch history, and the Steady Light switch. This action cannot be undone.'
        );
        if (confirmed) {
            startTransition(async () => {
                try {
                    const sensoryResult = await persistSensoryPreferences(DEFAULT_SENSORY_PREFERENCES);
                    if (sensoryResult.status !== 'confirmed') {
                        throw new Error('Reset sensory preferences could not be verified.');
                    }
                    applySensoryPreferences(sensoryResult.prefs);
                    soundEffects.applyPreferences(sensoryResult.prefs);

                    // Reset all data through dataStore
                    await dataStore.saveHomeworkItems([]);
                    await dataStore.saveAchievements([]);
                    await resetAchievementLifecycle();
                    await dataStore.saveStudentPoints(0);
                    await dataStore.saveRewards([]);
                    alert('Application data has been reset. The app will now reload.');
                    window.location.reload();
                } catch (error) {
                    logger.error('Failed to reset data:', error);
                    alert('An error occurred while resetting data. Please try again.');
                }
            });
        }
    };

  return (
    <div className="p-6 bg-background-surface border border-[var(--border-color)] rounded-2xl">
      <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[var(--primary-accent)] to-[var(--secondary-accent)] mb-4">Data Management</h3>
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={handleExport} className="px-5 py-3 font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                Export Data
            </button>
            <button onClick={handleImportClick} className="px-5 py-3 font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors">
                Import Data
            </button>
            <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button onClick={handleReset} className="px-5 py-3 font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
                Reset App
            </button>
       </div>
       <button
         ref={serverDeleteButtonRef}
         type="button"
         onClick={() => { setServerDeleteResult(null); setShowServerDeleteConfirm(true); }}
         disabled={serverDeletePending}
         className="mt-4 px-5 py-3 font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50"
       >
         {serverDeletePending ? 'Requesting deletion...' : 'Delete my server data'}
       </button>
       {serverDeleteResult && <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">{serverDeleteResult}</p>}
       {showServerDeleteConfirm && (
         <div ref={serverDeleteDialogRef} role="dialog" aria-labelledby="server-delete-title" aria-describedby="server-delete-description" onKeyDown={(event) => { if (event.key === 'Escape') closeServerDeleteConfirm(); }} className="mt-4 rounded-xl border border-red-500/50 bg-background-main p-4">
           <h4 id="server-delete-title" className="font-bold">Delete my server data?</h4>
           <p id="server-delete-description" className="mt-2 text-sm">
             This requests deletion of your identifiable server reports, pending AI request records,
             and current usage counters. Older usage counters, platform logs, and backups may remain.
             This cannot be undone. Data saved on this phone is separate and will not be cleared.
           </p>
           <div className="mt-4 flex flex-wrap gap-3">
             <button ref={cancelServerDeleteRef} type="button" onClick={closeServerDeleteConfirm} className="px-4 py-2 rounded-lg border border-[var(--border-color)]">Cancel</button>
             <button type="button" onClick={() => { void handleServerDelete(); }} className="px-4 py-2 rounded-lg bg-red-700 text-white">Delete server data</button>
           </div>
         </div>
       )}
       <PrivacyPolicy />
    </div>
  );
};

export default DataManagement;

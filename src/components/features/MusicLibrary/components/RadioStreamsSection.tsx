/**
 * RadioStreamsSection — Study shelf and break shelf.
 * Study is listed first. Either shelf can be played. Nothing here claims a station helps homework.
 */

import { AlertCircle, Pause, Play, Radio } from 'lucide-react';
import { RADIO_STATIONS } from '../../../../services/curatedMusicData';
import type { RadioStation, RadioStatus } from '../types';

interface RadioStreamsSectionProps {
  radioStatus: RadioStatus;
  onPlayRadio: (station: RadioStation) => Promise<void>;
  onStopRadio: () => Promise<void>;
}

const SHELVES = [
  {
    id: 'study',
    title: 'While you study',
    note: 'Quieter stations. Most have no lyrics. You can stop anytime, or pick a station from the other list.',
  },
  {
    id: 'break',
    title: 'For a break',
    note: 'Louder stations, and stations with words.',
  },
] as const;

export function RadioStreamsSection({
  radioStatus,
  onPlayRadio,
  onStopRadio,
}: RadioStreamsSectionProps) {
  return (
    <div className="space-y-6">
      {SHELVES.map((shelf) => {
        const stations = RADIO_STATIONS.filter((station) => station.shelf === shelf.id);
        return (
          <section key={shelf.id} aria-labelledby={`radio-shelf-${shelf.id}`} className="space-y-2">
            <div className="px-1">
              <h2 id={`radio-shelf-${shelf.id}`} className="text-base font-semibold text-white">
                {shelf.title}
              </h2>
              <p className="text-xs text-gray-400 mt-1">{shelf.note}</p>
            </div>
            {stations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                isActive={radioStatus.station?.id === station.id && radioStatus.isPlaying}
                onPlayRadio={onPlayRadio}
                onStopRadio={onStopRadio}
              />
            ))}
          </section>
        );
      })}

      {radioStatus.error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{radioStatus.error}</span>
        </div>
      )}
    </div>
  );
}

function StationRow({
  station,
  isActive,
  onPlayRadio,
  onStopRadio,
}: {
  station: RadioStation;
  isActive: boolean;
  onPlayRadio: (station: RadioStation) => Promise<void>;
  onStopRadio: () => Promise<void>;
}) {
  return (
    <button
      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98] ${
        isActive
          ? 'bg-blue-500/15 border border-blue-500/40'
          : 'bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/15'
      }`}
      onClick={() => {
        if (isActive) {
          void onStopRadio();
        } else {
          void onPlayRadio(station);
        }
      }}
      aria-label={isActive ? `Stop ${station.name}` : `Play ${station.name}`}
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          isActive ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'
        }`}
      >
        {isActive ? (
          <div className="flex items-end gap-[3px] h-4">
            <span
              className="w-[3px] bg-white rounded-full animate-bounce"
              style={{ height: '60%', animationDelay: '0ms' }}
            />
            <span
              className="w-[3px] bg-white rounded-full animate-bounce"
              style={{ height: '100%', animationDelay: '150ms' }}
            />
            <span
              className="w-[3px] bg-white rounded-full animate-bounce"
              style={{ height: '40%', animationDelay: '300ms' }}
            />
          </div>
        ) : (
          <Radio className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`font-medium text-sm truncate ${isActive ? 'text-blue-300' : 'text-white'}`}>
          {station.name}
        </div>
        <div className="text-xs text-gray-500 truncate">{station.genre}</div>
      </div>

      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isActive ? 'text-blue-400' : 'text-gray-500'
        }`}
      >
        {isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </div>
    </button>
  );
}

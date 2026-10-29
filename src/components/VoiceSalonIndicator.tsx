import React from 'react';
import { Mic, MicOff, Lock, Volume2 } from 'lucide-react';
import { GamePhase, Player, TalkieWalkieState } from '../game/types.ts';

interface VoiceSalonIndicatorProps {
  phase: GamePhase;
  channelName: string;
  isChannelEnabled: boolean;
  isNightChannel: boolean;
  allowedPeerIds: string[];
  players: Record<string, Partial<Player>>;
  myPlayerId: string;
  hasMic: boolean;
  isMuted: boolean;
  talkieWalkie?: TalkieWalkieState | null;
  onToggleMic: () => void;
  onRequestMic: () => void;
  onRequestTalkie: (duration?: number) => void;
  onReleaseTalkie: () => void;
}

export const VoiceSalonIndicator: React.FC<VoiceSalonIndicatorProps> = ({
  phase,
  isNightChannel,
  players,
  myPlayerId,
  hasMic,
  isMuted,
  onToggleMic,
  onRequestMic,
}) => {
  const me = players[myPlayerId];
  const isMeAlive = me?.isAlive ?? true;
  const isNight = phase.startsWith('NIGHT_');

  // En pleine nuit (hors salon secret Bobel) : simple bandeau discret
  if (isNight && !isNightChannel) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-stone-900/80 border border-stone-800 text-xs text-stone-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <span>Nuit : le village dort, les micros sont coupés.</span>
        </div>
        <span className="text-stone-500 font-mono text-[11px]">Silence</span>
      </div>
    );
  }

  // Pendant le vote secret : micros coupés
  if (phase === 'VOTE_CASTING') {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-red-950/40 border border-red-900/50 text-xs text-red-200">
        <div className="flex items-center gap-2">
          <MicOff className="w-4 h-4 text-red-400" />
          <span className="font-semibold">Vote en cours : micros coupés pour voter en silence.</span>
        </div>
      </div>
    );
  }

  // Débat de jour ou salon Bobel la nuit : contrôle direct et clair du micro
  const containerClass = isNightChannel
    ? 'flex items-center justify-between px-4 py-3 rounded-xl border transition bg-red-950/30 border-red-800/60 text-red-200'
    : 'flex items-center justify-between px-4 py-3 rounded-xl border transition bg-stone-900/90 border-stone-800 text-stone-200';

  const micBtnClass = !isMuted
    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm'
    : 'bg-stone-800 hover:bg-stone-700 text-stone-300 border-stone-700';

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-2.5">
        {isNightChannel ? (
          <div className="flex items-center gap-2 text-red-300 font-semibold text-xs">
            <Lock className="w-4 h-4 text-red-400" />
            <span>Salon secret des Bobel (vous seuls vous entendez)</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-stone-300">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <span>Salon vocal du village</span>
          </div>
        )}
      </div>

      {isMeAlive ? (
        <div className="flex items-center gap-2">
          {!hasMic ? (
            <button
              onClick={onRequestMic}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Activer micro</span>
            </button>
          ) : (
            <button
              onClick={onToggleMic}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border cursor-pointer transition ${micBtnClass}`}
            >
              {!isMuted ? <Mic className="w-3.5 h-3.5 animate-pulse" /> : <MicOff className="w-3.5 h-3.5" />}
              <span>{!isMuted ? 'Micro actif' : 'Micro coupé'}</span>
            </button>
          )}
        </div>
      ) : (
        <span className="text-xs text-stone-500 italic">Éliminé (observateur)</span>
      )}
    </div>
  );
};

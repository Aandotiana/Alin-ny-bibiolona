import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  LogOut,
  Home,
  Copy,
  Check,
  Flame,
} from 'lucide-react';
import { GamePhase } from '../game/types.ts';

interface HeaderProps {
  roomId: string;
  phase: GamePhase;
  roundNumber: number;
  timeRemaining: number;
  isSoundEnabled: boolean;
  onToggleSound: () => void;
  hasMic: boolean;
  isMuted: boolean;
  onToggleMic: () => void;
  onRequestMic: () => void;
  onReturnToLobby?: () => void;
  onLeaveRoom?: () => void;
  isInRoom?: boolean;
  isHost?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  roomId,
  phase,
  roundNumber,
  timeRemaining,
  isSoundEnabled,
  onToggleSound,
  hasMic,
  isMuted,
  onToggleMic,
  onRequestMic,
  onReturnToLobby,
  onLeaveRoom,
  isInRoom,
  isHost,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyRoom = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(roomId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // ignore
    }
  };

  const getPhaseTitle = (p: GamePhase) => {
    switch (p) {
      case 'LOBBY':
        return 'Lobby (Attente des joueurs)';
      case 'NIGHT_INTRO':
        return 'La nuit tombe...';
      case 'NIGHT_MPANGALATRA':
        return 'Nuit - Tour du Voleur';
      case 'NIGHT_DADARABE':
        return 'Nuit - Tour de Dadarabe';
      case 'NIGHT_BOBEL':
        return 'Nuit - Chasse des Bobel';
      case 'NIGHT_MPAMOSAVY':
        return 'Nuit - Potions de la Mpamosavy';
      case 'DAY_REVEAL':
        return 'Le jour se lève (Bilan de la nuit)';
      case 'DAY_ELECTION':
        return 'Élection du Chef de village';
      case 'DAY_DEBATE':
      case 'VOTE_DISCUSSION':
        return 'Débat du Village (60s)';
      case 'DAY_VOTE':
      case 'VOTE_CASTING':
        return 'Vote du Village (30s)';
      case 'DAY_EXECUTION':
        return 'Résultat du vote';
      case 'GAME_OVER':
        return 'Fin de partie';
      default:
        return p;
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-stone-900 border-b border-stone-800 px-4 py-2.5">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
        {/* Titre & Phase courante */}
        <div className="flex items-center gap-3">
          <span className="text-xl">🐺</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-white">
                Ny Alin'ny Bibiolona
              </span>
              {roundNumber > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 font-semibold uppercase">
                  Tour {roundNumber}
                </span>
              )}
            </div>
            <p className="text-xs text-amber-400 font-medium">
              {getPhaseTitle(phase)}
            </p>
          </div>
        </div>

        {/* Chrono au centre si actif */}
        {phase !== 'LOBBY' && phase !== 'GAME_OVER' && timeRemaining > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-stone-800 border border-stone-700 text-xs font-mono font-bold text-amber-300">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className={timeRemaining <= 5 ? 'text-red-400 animate-pulse' : ''}>
              {timeRemaining}s
            </span>
          </div>
        )}

        {/* Actions à droite */}
        <div className="flex items-center gap-2">
          {/* Code salon copiable */}
          {roomId && isInRoom && (
            <button
              onClick={handleCopyRoom}
              title="Copier le code salon"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition cursor-pointer"
            >
              <span>{copied ? 'Copié !' : roomId}</span>
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-stone-400" />}
            </button>
          )}

          {/* Son */}
          <button
            onClick={onToggleSound}
            title={isSoundEnabled ? 'Couper sons' : 'Activer sons'}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition cursor-pointer"
          >
            {isSoundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-stone-500" />}
          </button>

          {/* Micro */}
          {hasMic ? (
            <button
              onClick={onToggleMic}
              title={isMuted ? 'Activer micro' : 'Couper micro'}
              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 transition cursor-pointer"
            >
              {!isMuted ? <Mic className="w-4 h-4 text-emerald-400 animate-pulse" /> : <MicOff className="w-4 h-4 text-stone-400" />}
            </button>
          ) : (
            <button
              onClick={onRequestMic}
              title="Activer micro vocal"
              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 border border-stone-700 transition cursor-pointer"
            >
              <MicOff className="w-4 h-4" />
            </button>
          )}

          {/* Retour Lobby (Hôte uniquement) */}
          {phase !== 'LOBBY' && isHost && onReturnToLobby && (
            <button
              onClick={onReturnToLobby}
              title="Retourner au Lobby (Hôte)"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-stone-800 hover:bg-stone-700 text-red-300 border border-stone-700 transition cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lobby</span>
            </button>
          )}

          {/* Quitter salon */}
          {isInRoom && onLeaveRoom && (
            <button
              onClick={onLeaveRoom}
              title="Quitter la partie"
              className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-red-300 border border-stone-700 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import { speechNarrator } from '../services/speechNarrator.ts';
import { GamePhase } from '../game/types.ts';

interface MpitantaraNarrationProps {
  narrationText: string;
  narrationMalagasy: string;
  phase: GamePhase;
  roundNumber: number;
}

export const MpitantaraNarration: React.FC<MpitantaraNarrationProps> = ({
  narrationText,
  narrationMalagasy,
  phase,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (narrationText && phase !== 'LOBBY') {
      setIsPlaying(true);
      speechNarrator.speak(narrationText, () => {
        setIsPlaying(false);
      });
    }

    return () => {
      speechNarrator.stop();
      setIsPlaying(false);
    };
  }, [narrationText, phase]);

  const handleToggleSpeak = () => {
    if (isPlaying) {
      speechNarrator.stop();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      speechNarrator.speak(narrationText, () => {
        setIsPlaying(false);
      });
    }
  };

  if (!narrationText) return null;

  return (
    <div className="rounded-xl p-3.5 bg-stone-900/90 border border-stone-800 text-stone-200 shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
          <span>📜 Mpitantara</span>
        </span>

        <button
          onClick={handleToggleSpeak}
          aria-label={isPlaying ? 'Muter la voix' : 'Écouter la narration'}
          className="text-xs px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center gap-1.5 cursor-pointer transition"
        >
          {isPlaying ? <VolumeX className="w-3.5 h-3.5 text-amber-400" /> : <Volume2 className="w-3.5 h-3.5 text-amber-400" />}
          <span>{isPlaying ? 'Muter voix' : 'Écouter'}</span>
        </button>
      </div>

      <p className="text-sm font-medium leading-relaxed text-stone-100">
        « {narrationText} »
      </p>

      {narrationMalagasy && (
        <p className="text-xs text-amber-300/80 italic flex items-center gap-1 pt-1 border-t border-stone-800/80">
          <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
          <span>{narrationMalagasy}</span>
        </p>
      )}
    </div>
  );
};

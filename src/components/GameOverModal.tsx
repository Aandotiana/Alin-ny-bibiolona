import React from 'react';
import { Trophy, Skull, Users, RotateCcw, Sparkles } from 'lucide-react';
import { Player, ROLE_DEFINITIONS } from '../game/types.ts';

interface GameOverModalProps {
  winner: 'VILLAGE' | 'BOBEL' | 'DRAW';
  players: Record<string, Partial<Player>>;
  narrationText: string;
  onRestart: () => void;
  onReturnToLobby: () => void;
  onLeaveRoom?: () => void;
  isHost: boolean;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  players,
  narrationText,
  onRestart,
  onReturnToLobby,
  onLeaveRoom,
  isHost,
}) => {
  const isVillageWin = winner === 'VILLAGE';
  const playerList = Object.values(players);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-lg rounded-3xl border border-stone-800 bg-stone-900/95 p-6 shadow-2xl space-y-5 text-center">
        {/* Victory Icon & Title */}
        <div className="flex flex-col items-center">
          <div
            className={`w-16 h-16 rounded-3xl flex items-center justify-center border shadow-xl mb-3 ${
              isVillageWin
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-950/60'
                : 'bg-red-500/20 text-red-400 border-red-500/40 shadow-red-950/60'
            }`}
          >
            {isVillageWin ? <Trophy className="w-8 h-8" /> : <Skull className="w-8 h-8" />}
          </div>

          <h2 className="font-serif font-black text-2xl tracking-wide text-white uppercase">
            {isVillageWin ? "Fandresen'ny Fokonolona !" : "Fandresen'ny Bobel !"}
          </h2>
          <p className="text-xs font-semibold text-amber-400/90 mt-0.5">
            {isVillageWin ? 'Victoire des Villageois' : 'Victoire des Prédateurs Bobel'}
          </p>
        </div>

        {/* Narrative Epilogue */}
        <div className="p-3.5 rounded-2xl bg-stone-950/60 border border-stone-800 text-xs text-stone-300 leading-relaxed italic">
          « {narrationText} »
        </div>

        {/* Full Roles Reveal Table */}
        <div className="space-y-2 text-left">
          <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5 px-1">
            <Users className="w-3.5 h-3.5" />
            <span>Fampiharihariana ny anjara (Rôles Révélés)</span>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
            {playerList.map((p) => {
              if (!p.id) return null;
              const roleDef = p.role ? ROLE_DEFINITIONS[p.role] : null;
              const isPredator = roleDef?.team === 'PREDATOR';
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-stone-950/40 border border-stone-800/80 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span>{p.avatar}</span>
                    <span className="font-bold text-stone-200">{p.name}</span>
                    {!p.isAlive && (
                      <span className="text-[10px] text-red-400 font-semibold">(Mort)</span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                      isPredator
                        ? 'bg-red-950 text-red-300 border-red-700'
                        : 'bg-stone-800 text-stone-300 border-stone-700'
                    }`}
                  >
                    {roleDef?.name || 'Inconnu'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 space-y-2">
          {isHost && (
            <>
              <button
                onClick={onRestart}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-serif font-black text-sm uppercase tracking-wider shadow-xl shadow-amber-950/40 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Hiverina hilalao (Rejouer une partie)</span>
              </button>
              <button
                onClick={onReturnToLobby}
                className="w-full py-2.5 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-serif font-bold text-xs uppercase tracking-wider border border-stone-700 transition cursor-pointer"
              >
                Hiverina ao amin'ny Lobby (Retour au Lobby)
              </button>
            </>
          )}
          {onLeaveRoom && (
            <button
              onClick={onLeaveRoom}
              className="w-full py-2 rounded-2xl bg-red-950/40 hover:bg-red-950/70 text-red-300 font-serif font-bold text-xs uppercase tracking-wider border border-red-900/60 transition cursor-pointer"
            >
              Miala amin'ny efitrano (Quitter le salon)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

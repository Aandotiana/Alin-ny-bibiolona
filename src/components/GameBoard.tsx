import React from 'react';
import {
  Skull,
  Crown,
  Heart,
  Volume2,
  Check,
  Vote,
} from 'lucide-react';
import { GamePhase, Player, ROLE_DEFINITIONS, RoleType } from '../game/types.ts';
import { soundFX } from '../services/soundEffects.ts';

interface GameBoardProps {
  players: Record<string, Partial<Player>>;
  myPlayerId: string;
  myRole?: RoleType;
  phase: GamePhase;
  hasUsedLifePotion?: boolean;
  hasUsedDeathPotion?: boolean;
  bobelVictimForMpamosavy?: string | null;
  centerCards?: RoleType[];
  onBobelTarget: (targetId: string) => void;
  onDadarabeInspect: (targetId: string) => void;
  onMpamosavyHeal: () => void;
  onMpamosavyPoison: (targetId: string) => void;
  onMpangalatraSwap: (chosenRole: RoleType) => void;
  onCastVote: (targetId: string) => void;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  players,
  myPlayerId,
  myRole,
  phase,
  hasUsedLifePotion,
  hasUsedDeathPotion,
  bobelVictimForMpamosavy,
  centerCards,
  onBobelTarget,
  onDadarabeInspect,
  onMpamosavyHeal,
  onMpamosavyPoison,
  onMpangalatraSwap,
  onCastVote,
}) => {
  const playerList = Object.values(players);
  const me = players[myPlayerId];
  const isMeAlive = me?.isAlive ?? true;

  // Calcul des votes en direct
  const voteCounts: Record<string, number> = {};
  playerList.forEach((p) => {
    if (p.vote) {
      voteCounts[p.vote] = (voteCounts[p.vote] || 0) + (p.isSefo ? 2 : 1);
    }
  });

  const handleVote = (id: string | null) => {
    soundFX.playVoteDrum();
    onCastVote(id || '');
  };

  const isVotingPhase =
    phase === 'VOTE_CASTING' ||
    phase === 'DAY_VOTE' ||
    phase === 'DAY_ELECTION';

  // =========================================================================
  // 1. PHASE DE VOTE (SIMPLE : LES JOUEURS DEVANT NOUS, UN CLIC POUR VOTER)
  // =========================================================================
  if (isVotingPhase) {
    const candidates = playerList.filter((p) => {
      if (!p.id || !p.isAlive) return false;
      if (phase !== 'DAY_ELECTION') return p.id !== myPlayerId;
      return true;
    });

    return (
      <div className="rounded-xl border border-stone-800 bg-stone-900 p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-800 pb-3">
          <div>
            <h2 className="font-bold text-base text-amber-300 flex items-center gap-2">
              <Vote className="w-4 h-4 text-amber-400" />
              <span>
                {phase === 'DAY_ELECTION'
                  ? 'Élection du Chef (Sefom-pokotany)'
                  : 'Vote du Village : Qui est un Bobel ?'}
              </span>
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Cliquez sur un joueur pour voter contre lui.
            </p>
          </div>

          {isMeAlive && (
            <div className="text-xs bg-stone-950 px-3 py-1.5 rounded-lg border border-stone-800 flex items-center gap-2">
              <span className="text-stone-400">Votre vote :</span>
              {me?.vote && players[me.vote] ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  {players[me.vote]?.name}
                </span>
              ) : (
                <span className="text-amber-400 font-semibold">Aucun</span>
              )}
            </div>
          )}
        </div>

        {/* Grille des joueurs à voter */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {candidates.map((c) => {
            if (!c.id) return null;
            const isSelected = me?.vote === c.id;
            const count = voteCounts[c.id] || 0;

            return (
              <button
                key={c.id}
                disabled={!isMeAlive}
                onClick={() => handleVote(c.id!)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-amber-950/70 border-amber-500 shadow-md ring-2 ring-amber-500/30'
                    : 'bg-stone-950/60 hover:bg-stone-800 border-stone-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">{c.avatar || '👤'}</span>
                  <div className="truncate">
                    <span className="font-bold text-sm text-white block truncate">
                      {c.name}
                    </span>
                    {c.isSefo && (
                      <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                        <Crown className="w-2.5 h-2.5" /> Chef
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-800/60">
                  <span className={count > 0 ? 'text-amber-300 font-bold' : 'text-stone-500'}>
                    {count} {count > 1 ? 'voix' : 'voix'}
                  </span>
                  {isSelected && (
                    <span className="text-[11px] font-bold text-emerald-400">Sélectionné</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Option voter blanc / annuler */}
        {isMeAlive && me?.vote && (
          <div className="text-center pt-1">
            <button
              onClick={() => handleVote(null)}
              className="text-xs text-stone-400 hover:text-white px-3 py-1 rounded-lg bg-stone-950 border border-stone-800 transition cursor-pointer"
            >
              Annuler mon vote
            </button>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 2. PHASES DE NUIT SPÉCIFIQUES AUX RÔLES
  // =========================================================================

  // Chasse des Bobel
  if (phase === 'NIGHT_BOBEL' && myRole === 'BOBEL' && isMeAlive) {
    const preyCandidates = playerList.filter((p) => p.isAlive && p.role !== 'BOBEL' && p.id !== myPlayerId);

    return (
      <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4 space-y-3">
        <div>
          <h2 className="font-bold text-base text-red-300">🐺 Chasse des Bobel</h2>
          <p className="text-xs text-stone-400">
            Cliquez sur un habitant pour désigner la victime de la meute.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {preyCandidates.map((p) => {
            if (!p.id) return null;
            const isTarget = me?.targetVictim === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  soundFX.playBobelRoar();
                  onBobelTarget(p.id!);
                }}
                className={`p-3 rounded-xl border text-left transition flex items-center justify-between gap-2 cursor-pointer ${
                  isTarget
                    ? 'bg-red-900/60 border-red-500 text-white shadow'
                    : 'bg-stone-900 hover:bg-stone-850 border-stone-800 text-stone-300'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="text-xl">{p.avatar || '👤'}</span>
                  <span className="font-bold text-xs truncate">{p.name}</span>
                </div>
                {isTarget && <Check className="w-4 h-4 text-red-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Vision de Dadarabe
  if (phase === 'NIGHT_DADARABE' && myRole === 'DADARABE' && isMeAlive) {
    const inspectCandidates = playerList.filter((p) => p.isAlive && p.id !== myPlayerId);

    return (
      <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-4 space-y-3">
        <div>
          <h2 className="font-bold text-base text-indigo-300">🔮 Vision de Dadarabe</h2>
          <p className="text-xs text-stone-400">
            {me?.inspectedRole
              ? 'Rôle découvert pour cette nuit :'
              : 'Cliquez sur un joueur pour découvrir son vrai rôle :'}
          </p>
        </div>

        {me?.inspectedRole ? (
          <div className="p-3 rounded-xl bg-stone-900 border border-indigo-700/60 text-sm">
            <span className="font-bold text-white">{players[me.inspectedRole.targetId]?.name}</span> est :{' '}
            <span className="text-amber-400 font-bold uppercase">{ROLE_DEFINITIONS[me.inspectedRole.role]?.name}</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {inspectCandidates.map((p) => {
              if (!p.id) return null;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    soundFX.playMagicSparkle();
                    onDadarabeInspect(p.id!);
                  }}
                  className="p-3 rounded-xl bg-stone-900 hover:bg-indigo-950/70 border border-stone-800 hover:border-indigo-600 text-left transition flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xl">{p.avatar || '👤'}</span>
                    <span className="font-bold text-xs text-stone-200 truncate">{p.name}</span>
                  </div>
                  <span className="text-[11px] text-indigo-400 font-semibold shrink-0">Voir →</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Potions de la Mpamosavy
  if (phase === 'NIGHT_MPAMOSAVY' && myRole === 'MPAMOSAVY' && isMeAlive) {
    const poisonCandidates = playerList.filter((p) => p.isAlive && p.id !== myPlayerId);

    return (
      <div className="rounded-xl border border-purple-900/60 bg-purple-950/20 p-4 space-y-3">
        <div>
          <h2 className="font-bold text-base text-purple-300">🧪 Potions de la Mpamosavy</h2>
        </div>

        {/* Potion de vie */}
        <div className="p-3 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-emerald-400 block">Potion de Vie</span>
            <span className="text-xs text-stone-300">
              {bobelVictimForMpamosavy
                ? `Victime ciblée : ${players[bobelVictimForMpamosavy]?.name}`
                : 'Aucune victime cette nuit'}
            </span>
          </div>
          {bobelVictimForMpamosavy && !hasUsedLifePotion && (
            <button
              onClick={() => {
                soundFX.playMagicSparkle();
                onMpamosavyHeal();
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition"
            >
              <Heart className="w-3.5 h-3.5" /> Sauver
            </button>
          )}
        </div>

        {/* Potion de mort */}
        {!hasUsedDeathPotion && (
          <div className="space-y-2 pt-1">
            <span className="text-xs font-bold text-red-400 block">Potion de Mort (Optionnelle)</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {poisonCandidates.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    soundFX.playMagicSparkle();
                    onMpamosavyPoison(p.id!);
                  }}
                  className="p-2 rounded-lg bg-stone-900 hover:bg-red-950/60 border border-stone-800 hover:border-red-600 text-left text-xs text-stone-300 flex items-center gap-2 cursor-pointer transition"
                >
                  <span>{p.avatar}</span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Rôle Mpangalatra (Voleur)
  if (phase === 'NIGHT_MPANGALATRA' && myRole === 'MPANGALATRA' && isMeAlive) {
    return (
      <div className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 space-y-3">
        <div>
          <h2 className="font-bold text-base text-emerald-300">✨ Pouvoir du Voleur</h2>
          <p className="text-xs text-stone-400">
            Choisissez l'une des 2 cartes au centre pour changer de rôle :
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {centerCards?.map((roleCard, idx) => (
            <button
              key={idx}
              onClick={() => {
                soundFX.playMagicSparkle();
                onMpangalatraSwap(roleCard);
              }}
              className="p-3 rounded-xl bg-stone-900 hover:bg-emerald-950/70 border border-stone-800 hover:border-emerald-500 text-left transition cursor-pointer"
            >
              <span className="font-bold text-sm text-white block">
                {ROLE_DEFINITIONS[roleCard]?.name}
              </span>
              <span className="text-xs text-stone-400">
                {ROLE_DEFINITIONS[roleCard]?.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Autres joueurs pendant la nuit
  if (phase.startsWith('NIGHT_')) {
    return (
      <div className="rounded-xl border border-stone-800 bg-stone-900/50 p-6 text-center text-xs text-stone-400">
        Nuit en cours... Patientez pendant que les esprits agissent.
      </div>
    );
  }

  // =========================================================================
  // 3. TABLE DU VILLAGE (LISTE SIMPLE ET CLAIRE DES JOUEURS)
  // =========================================================================
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-stone-800 pb-2">
        <h2 className="font-bold text-sm text-stone-200">
          Habitants du Village ({playerList.filter((p) => p.isAlive).length} vivants / {playerList.length})
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {playerList.map((player) => {
          if (!player.id) return null;
          const isMe = player.id === myPlayerId;
          const isAlive = player.isAlive ?? true;

          return (
            <div
              key={player.id}
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 transition ${
                !isAlive
                  ? 'bg-stone-950/40 border-stone-900 opacity-60'
                  : isMe
                  ? 'bg-stone-850 border-amber-600/40'
                  : 'bg-stone-950/70 border-stone-800'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-2xl shrink-0">{player.avatar || '👤'}</span>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-white truncate">{player.name}</span>
                    {isMe && (
                      <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold shrink-0">
                        Vous
                      </span>
                    )}
                    {player.isSefo && (
                      <span title="Chef" className="inline-flex items-center">
                        <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] mt-0.5">
                    {isAlive ? (
                      <span className="text-emerald-400 font-medium">Vivant</span>
                    ) : (
                      <span className="text-red-400 font-medium flex items-center gap-1">
                        <Skull className="w-3 h-3" /> Éliminé
                      </span>
                    )}
                    {player.role && (
                      <span className="ml-1.5 text-stone-400">({ROLE_DEFINITIONS[player.role]?.name})</span>
                    )}
                  </div>
                </div>
              </div>

              {player.isSpeaking && (
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-semibold shrink-0 animate-pulse">
                  <Volume2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Parle</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

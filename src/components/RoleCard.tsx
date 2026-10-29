import React, { useState } from 'react';
import { Eye, EyeOff, Shield, Skull, Crown } from 'lucide-react';
import { ROLE_DEFINITIONS, RoleType } from '../game/types.ts';

interface RoleCardProps {
  role?: RoleType;
  isAlive: boolean;
  isSefo: boolean;
  playerName: string;
  avatar: string;
}

export const RoleCard: React.FC<RoleCardProps> = ({
  role,
  isAlive,
  isSefo,
  playerName,
  avatar,
}) => {
  const [isRevealed, setIsRevealed] = useState(false);

  if (!role) {
    return (
      <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-3 text-center text-xs text-stone-400">
        Rôle en cours d'attribution...
      </div>
    );
  }

  const roleDef = ROLE_DEFINITIONS[role];
  const isPredator = roleDef.team === 'PREDATOR';

  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900 p-3.5 space-y-3">
      {/* Ligne d'en-tête utilisateur */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{avatar}</span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-white">{playerName}</span>
              {isSefo && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" /> Chef
                </span>
              )}
            </div>
            <div className="text-[11px]">
              {isAlive ? (
                <span className="text-emerald-400 font-medium">Vivant</span>
              ) : (
                <span className="text-red-400 font-medium flex items-center gap-1">
                  <Skull className="w-3 h-3" /> Éliminé
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsRevealed(!isRevealed)}
          className="text-xs px-2.5 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 flex items-center gap-1.5 cursor-pointer transition"
        >
          {isRevealed ? <EyeOff className="w-3.5 h-3.5 text-stone-400" /> : <Eye className="w-3.5 h-3.5 text-amber-400" />}
          <span>{isRevealed ? 'Cacher' : 'Voir rôle'}</span>
        </button>
      </div>

      {/* Contenu du rôle */}
      {isRevealed ? (
        <div className="p-3 rounded-lg bg-stone-950/70 border border-stone-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-base text-amber-300">
              {roleDef.name} ({roleDef.malagasyName})
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
              isPredator ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-stone-800 text-stone-300'
            }`}>
              {isPredator ? 'Loup' : 'Village'}
            </span>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed">
            {roleDef.description}
          </p>
        </div>
      ) : (
        <div
          onClick={() => setIsRevealed(true)}
          className="p-3 rounded-lg bg-stone-950/40 border border-dashed border-stone-800 hover:border-amber-500/50 flex items-center justify-center gap-2 cursor-pointer text-stone-400 hover:text-stone-200 text-xs transition"
        >
          <Shield className="w-4 h-4 text-amber-400" />
          <span>Touchez pour regarder discrètement votre carte secrète</span>
        </div>
      )}
    </div>
  );
};

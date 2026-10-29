import React, { useState } from 'react';
import {
  Users,
  Bot,
  Play,
  Shield,
  Sparkles,
  Info,
  Crown,
  ChevronRight,
  UserPlus,
  Trash2,
  Share2,
  Check,
  Copy,
} from 'lucide-react';
import { VillageChat } from './VillageChat.tsx';
import { ChatMessage, Player, ROLE_DEFINITIONS, RoleType } from '../game/types.ts';

interface LobbyViewProps {
  roomId: string;
  setRoomId: (id: string) => void;
  playerName: string;
  setPlayerName: (name: string) => void;
  playerAvatar: string;
  setPlayerAvatar: (av: string) => void;
  players: Record<string, Partial<Player>>;
  myPlayerId: string;
  onJoinRoom: () => void;
  onQuickSoloStart: () => void;
  onAddBot: () => void;
  onRemoveBot: (botId: string) => void;
  onStartGame: (includeThief: boolean) => void;
  onLeaveRoom: () => void;
  onDissolveRoom?: () => void;
  isInRoom: boolean;
  activeRooms?: Array<{ roomId: string; playerCount: number; hostName: string; hostAvatar: string }>;
  onSelectAndJoinRoom?: (roomId: string) => void;
  chatMessages?: ChatMessage[];
  onSendMessage?: (msg: string) => void;
}

const AVATAR_OPTIONS = ['🐂', '🦎', '🌴', '🌳', '🔥', '🌙', '🎭', '🌺', '🦅', '🦉', '🪵', '⭐'];

export const LobbyView: React.FC<LobbyViewProps> = ({
  roomId,
  setRoomId,
  playerName,
  setPlayerName,
  playerAvatar,
  setPlayerAvatar,
  players,
  myPlayerId,
  onJoinRoom,
  onQuickSoloStart,
  onAddBot,
  onRemoveBot,
  onStartGame,
  onLeaveRoom,
  onDissolveRoom,
  isInRoom,
  activeRooms = [],
  onSelectAndJoinRoom,
  chatMessages = [],
  onSendMessage,
}) => {
  const [includeThief, setIncludeThief] = useState(true);
  const [showRoleInfo, setShowRoleInfo] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const playerList = Object.values(players);
  const me = players[myPlayerId];
  const isHost = me?.isHost ?? false;
  const canStart = playerList.length >= 4;

  const handleShareInvite = async () => {
    const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: "Ny Alin'ny Bibiolona - Loup-Garou Malgache",
          text: `Rejoins ma partie de Loup-Garou ! Code chambre: ${roomId}`,
          url: inviteUrl,
        });
        return;
      } catch {
        // Fallback
      }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(inviteUrl);
        setInviteCopied(true);
        setTimeout(() => setInviteCopied(false), 2500);
        return;
      }
    } catch {
      // Fallback below
    }

    try {
      const el = document.createElement('textarea');
      el.value = inviteUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleFillBotsTo4 = () => {
    const toAdd = Math.max(0, 4 - playerList.length);
    for (let i = 0; i < toAdd; i++) {
      setTimeout(() => onAddBot(), i * 150);
    }
  };

  const handleFillBotsTo6 = () => {
    const toAdd = Math.max(0, 6 - playerList.length);
    for (let i = 0; i < toAdd; i++) {
      setTimeout(() => onAddBot(), i * 150);
    }
  };

  return (
    <div className={`${isInRoom ? 'max-w-5xl' : 'max-w-2xl'} mx-auto space-y-5 animate-fadeIn`}>
      {/* Hero Welcome Card */}
      <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-b from-stone-900/90 via-stone-900/60 to-stone-950/90 border border-stone-800 shadow-2xl text-center relative overflow-hidden backdrop-blur-md">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-600 via-orange-500 to-red-600" />

        <span className="text-4xl mb-2 inline-block animate-bounce">🌕</span>
        <h2 className="font-serif font-black text-2xl sm:text-3xl tracking-wide bg-gradient-to-r from-amber-200 via-stone-100 to-orange-300 bg-clip-text text-transparent">
          NY ALIN'NY BIBIOLONA
        </h2>
        <p className="text-xs sm:text-sm text-amber-400 font-serif font-semibold mt-1">
          Loup-Garou du Folklore Malgache en Temps Réel
        </p>
        <p className="text-xs text-stone-400 max-w-md mx-auto mt-2 leading-relaxed">
          Sous le ciel étoilé des Hautes Terres, l'IA Mpitantara conte la destinée du village.
          Chaque joueur reçoit son rôle secret sur son téléphone, avec des salons vocaux WebRTC adaptés jour et nuit.
        </p>

        {/* Not joined yet: Room entry form */}
        {!isInRoom && (
          <div className="mt-6 max-w-sm mx-auto space-y-4 text-left">
            {/* Instant Solo Play Button for easy testing */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/80 to-stone-900 border border-amber-600/50 shadow-lg text-center space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block">
                ⚡ Tester Seul(e) Immédiatement
              </span>
              <p className="text-[11px] text-stone-300">
                Pas besoin d'attendre d'autres joueurs : lancez une partie instantanée avec 3 villageois IA (4 joueurs minimum requis, rôles aléatoires).
              </p>
              <button
                type="button"
                onClick={onQuickSoloStart}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 via-orange-500 to-amber-600 hover:brightness-110 text-white font-serif font-black text-xs uppercase tracking-wider shadow-md shadow-amber-950/60 flex items-center justify-center gap-2 transition"
              >
                <Bot className="w-4 h-4 text-amber-200" />
                <span>Jouer en Solo (1 Joueur + 3 IA)</span>
              </button>
            </div>

            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-stone-800" />
              <span className="text-[10px] text-stone-500 uppercase tracking-widest">ou en multijoueur</span>
              <div className="flex-1 h-px bg-stone-800" />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-stone-300 mb-1.5">
                Anarana (Votre Nom)
              </label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Ex: Andry, Soa, Rabe..."
                className="w-full px-4 py-2.5 rounded-xl bg-stone-950/80 border border-stone-700 text-stone-100 placeholder-stone-500 text-sm focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-stone-300 mb-1.5">
                Sary famantarana (Avatar)
              </label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_OPTIONS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setPlayerAvatar(av)}
                    className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center border transition ${
                      playerAvatar === av
                        ? 'bg-amber-600 border-amber-400 ring-2 ring-amber-400/50 scale-110'
                        : 'bg-stone-950/60 border-stone-800 hover:border-stone-700'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-stone-300 mb-1.5">
                Kaody efitrano (Code Chambre)
              </label>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="Ex: BIBY7"
                className="w-full px-4 py-2.5 rounded-xl bg-stone-950/80 border border-stone-700 text-stone-100 placeholder-stone-500 text-sm font-mono tracking-wider focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              onClick={onJoinRoom}
              disabled={!playerName.trim()}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-serif font-black text-sm uppercase tracking-wider disabled:opacity-50 transition cursor-pointer shadow-lg"
            >
              Miditra ao an-tanàna (Rejoindre la chambre)
            </button>

            {/* List of active rooms created by friends */}
            {activeRooms.length > 0 && (
              <div className="pt-3 border-t border-stone-800/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <span>🏘️ Salons ouverts en ce moment :</span>
                </div>
                <div className="space-y-2">
                  {activeRooms.map((r) => (
                    <button
                      key={r.roomId}
                      type="button"
                      onClick={() => {
                        setRoomId(r.roomId);
                        if (onSelectAndJoinRoom) {
                          onSelectAndJoinRoom(r.roomId);
                        } else {
                          onJoinRoom();
                        }
                      }}
                      className="w-full p-3 rounded-2xl bg-stone-950/90 hover:bg-stone-900 border border-amber-600/50 hover:border-amber-400 text-left transition flex items-center justify-between gap-3 shadow-md group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl p-1.5 rounded-xl bg-stone-900 border border-stone-800">{r.hostAvatar}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-amber-300 group-hover:text-amber-200">
                              {r.roomId}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-800 text-stone-300 border border-stone-700">
                              Hôte : {r.hostName}
                            </span>
                          </div>
                          <span className="text-xs text-stone-400 mt-0.5 block">
                            {r.playerCount} joueur{r.playerCount > 1 ? 's' : ''} dans le salon
                          </span>
                        </div>
                      </div>

                      <div className="px-3 py-1.5 rounded-xl bg-amber-600 group-hover:bg-amber-500 text-stone-950 font-bold text-xs flex items-center gap-1 shadow">
                        <span>Rejoindre</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inside Room Lobby */}
      {isInRoom && (
        <div className="space-y-4">
          {/* Quick Friend Invite Card */}
          <div className="rounded-2xl p-3.5 bg-gradient-to-r from-amber-950/40 via-stone-900 to-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2.5 text-center sm:text-left">
              <span className="text-xl">📲</span>
              <div>
                <span className="font-bold text-xs sm:text-sm text-amber-200 block">
                  Inviter vos amis à rejoindre la partie
                </span>
                <span className="text-[11px] text-stone-300">
                  Partagez le lien avec le code <strong className="font-mono text-amber-400 font-bold">{roomId}</strong>
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleShareInvite}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow transition cursor-pointer"
            >
              {inviteCopied ? (
                <>
                  <Check className="w-4 h-4 text-stone-950" />
                  <span>Lien copié !</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-stone-950" />
                  <span>Copier le lien d'invitation</span>
                </>
              )}
            </button>
          </div>

          {/* Grid Layout: Left Players & Start / Right Lobby Chat */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column (7 cols): Players Joined Card */}
            <div className="lg:col-span-7 rounded-3xl p-5 sm:p-6 bg-stone-900/80 border border-stone-800 shadow-xl backdrop-blur-md space-y-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  <h3 className="font-serif font-black text-sm uppercase tracking-wide text-white">
                    Mpilalao ({playerList.length} / 12)
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 font-semibold">
                    Min. 4 joueurs
                  </span>
                </div>

                {/* Bot controls and leave room */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isHost && (
                    <>
                      <button
                        onClick={onAddBot}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700 transition cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>+1 IA</span>
                      </button>
                      <button
                        onClick={handleFillBotsTo4}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-xl bg-amber-950/80 hover:bg-amber-900 text-amber-200 border border-amber-700/60 transition cursor-pointer"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Remplir à 4</span>
                      </button>
                      <button
                        onClick={handleFillBotsTo6}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Remplir à 6</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={onLeaveRoom}
                    title={isHost ? "Quitter le salon (le rôle d'hôte sera transféré au prochain joueur humain)" : "Quitter la chambre"}
                    className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 border border-stone-700 transition cursor-pointer"
                  >
                    Quitter
                  </button>
                  {isHost && onDissolveRoom && (
                    <button
                      onClick={onDissolveRoom}
                      title="Fermer et dissoudre complètement ce salon"
                      className="px-2.5 py-1 text-xs font-semibold rounded-xl bg-red-950/80 hover:bg-red-900 text-red-300 border border-red-800/80 transition cursor-pointer"
                    >
                      Dissoudre
                    </button>
                  )}
                </div>
              </div>

              {/* Players list grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {playerList.map((p) => {
                  if (!p.id) return null;
                  const isMe = p.id === myPlayerId;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-2.5 rounded-2xl border transition ${
                        p.isSpeaking
                          ? 'bg-emerald-950/70 border-emerald-500 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-400'
                          : isMe
                          ? 'bg-amber-950/30 border-amber-600/50 text-white'
                          : 'bg-stone-950/50 border-stone-800 text-stone-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span
                          className={`text-xl shrink-0 p-1 rounded-xl transition ${
                            p.isSpeaking ? 'bg-emerald-900/90 ring-2 ring-emerald-400 animate-pulse' : ''
                          }`}
                        >
                          {p.avatar}
                        </span>
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs truncate block">
                              {p.name} {isMe && '(Vous)'}
                            </span>
                            {p.isSpeaking && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-400 text-stone-950 font-black animate-pulse">
                                🎙️ Parle
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-stone-400">
                            {p.isHost ? '👑 Hôte' : p.isBot ? '🤖 IA Bot' : 'Joueur'}
                          </span>
                        </div>
                      </div>

                      {isHost && p.isBot && (
                        <button
                          onClick={() => onRemoveBot(p.id!)}
                          className="text-stone-500 hover:text-red-400 p-1 transition cursor-pointer"
                          title="Retirer ce bot"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Game Options */}
              {isHost && (
                <div className="mt-4 pt-4 border-t border-stone-800 space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeThief}
                      onChange={(e) => setIncludeThief(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-600"
                    />
                    <span className="text-xs font-semibold text-stone-300">
                      Inclure le rôle « Mpangalatra » (Le Voleur & 2 cartes mystères au centre)
                    </span>
                  </label>

                  {/* Launch button */}
                  <button
                    onClick={() => onStartGame(includeThief)}
                    disabled={!canStart}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-600 via-orange-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-serif font-black text-sm uppercase tracking-wider shadow-xl shadow-red-950/40 disabled:opacity-40 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {canStart
                        ? 'Manomboka ny lalao (Lancer la nuit)'
                        : `En attente de joueurs (min. 4 joueurs - actuellement ${playerList.length})`}
                    </span>
                  </button>
                </div>
              )}

              {!isHost && (
                <div className="mt-4 p-3 rounded-2xl bg-stone-950/60 border border-stone-800 text-center text-xs text-stone-400">
                  En attente que l'hôte lance la partie...
                </div>
              )}
            </div>

            {/* Right Column (5 cols): Lobby Live Chat */}
            <div className="lg:col-span-5">
              {onSendMessage && (
                <VillageChat
                  messages={chatMessages}
                  onSendMessage={onSendMessage}
                  myPlayerId={myPlayerId}
                  isAlive={true}
                  isLobby={true}
                  title="Resaka ao amin'ny Lobby"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Role Guide Accordion */}
      <div className="rounded-3xl border border-stone-800 bg-stone-900/60 p-5 shadow-lg backdrop-blur-md">
        <button
          onClick={() => setShowRoleInfo(!showRoleInfo)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2 text-xs font-serif font-bold text-amber-300 uppercase tracking-wider">
            <Info className="w-4 h-4" />
            <span>Fampahafantarana ny anjara (Guide des Rôles Malgaches)</span>
          </div>
          <ChevronRight
            className={`w-4 h-4 text-stone-400 transition-transform ${showRoleInfo ? 'rotate-90' : ''}`}
          />
        </button>

        {showRoleInfo && (
          <div className="mt-4 pt-4 border-t border-stone-800 space-y-3 animate-fadeIn">
            {(Object.keys(ROLE_DEFINITIONS) as RoleType[]).map((rType) => {
              const rDef = ROLE_DEFINITIONS[rType];
              return (
                <div
                  key={rType}
                  className="p-3 rounded-2xl bg-stone-950/50 border border-stone-800/80 flex items-start gap-3"
                >
                  <div className="w-8 h-8 rounded-xl bg-stone-900 border border-stone-700 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-200">{rDef.name}</span>
                      <span className="text-[10px] text-amber-400 font-serif">« {rDef.malagasyName} »</span>
                    </div>
                    <p className="text-stone-300 leading-snug">{rDef.description}</p>
                    <p className="text-[11px] text-stone-400 italic font-sans">{rDef.malagasyDesc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

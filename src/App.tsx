/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { GamePhase, Player, RoleType, TalkieWalkieState } from './game/types.ts';
import { WebRTCVoiceManager, cleanupWebRTC, registerActiveVoiceManager } from './services/voiceWebRTC.ts';
import { soundFX } from './services/soundEffects.ts';
import { Header } from './components/Header.tsx';
import { LobbyView } from './components/LobbyView.tsx';
import { MpitantaraNarration } from './components/MpitantaraNarration.tsx';
import { VoiceSalonIndicator } from './components/VoiceSalonIndicator.tsx';
import { RoleCard } from './components/RoleCard.tsx';
import { GameBoard } from './components/GameBoard.tsx';
import { VillageChat } from './components/VillageChat.tsx';
import { GameOverModal } from './components/GameOverModal.tsx';

interface ChatMessage {
  senderId: string;
  senderName: string;
  senderAvatar: string;
  isAlive: boolean;
  message: string;
  timestamp: number;
}

const SESSION_STORAGE_KEY = 'biby_player_session';

interface SavedSession {
  playerId: string;
  roomId: string;
  playerName: string;
  playerAvatar: string;
}

function persistSession(data: SavedSession) {
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function retrieveSavedSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function purgeSavedSession() {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {}
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomId, setRoomId] = useState('ALINA1');
  const [playerName, setPlayerName] = useState('Rabe');
  const [playerAvatar, setPlayerAvatar] = useState('🐂');
  const [isInRoom, setIsInRoom] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Game state
  const [phase, setPhase] = useState<GamePhase>('LOBBY');
  const [roundNumber, setRoundNumber] = useState(0);
  const [players, setPlayers] = useState<Record<string, Partial<Player>>>({});
  const [myPlayerId, setMyPlayerId] = useState<string>('');
  const [myRole, setMyRole] = useState<RoleType | undefined>(undefined);
  const [hasUsedLifePotion, setHasUsedLifePotion] = useState(false);
  const [hasUsedDeathPotion, setHasUsedDeathPotion] = useState(false);
  const [bobelVictimForMpamosavy, setBobelVictimForMpamosavy] = useState<string | null>(null);
  const [centerCards, setCenterCards] = useState<RoleType[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [narrationText, setNarrationText] = useState("Tongasoa eto amin'ny Ny Alin'ny Bibiolona...");
  const [narrationMalagasy, setNarrationMalagasy] = useState('');
  const [winner, setWinner] = useState<'VILLAGE' | 'BOBEL' | 'DRAW' | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [talkieWalkie, setTalkieWalkie] = useState<TalkieWalkieState | null>(null);
  const [activeTab, setActiveTab] = useState<'board' | 'chat'>('board');
  const [activeRooms, setActiveRooms] = useState<
    Array<{ roomId: string; playerCount: number; hostName: string; hostAvatar: string }>
  >([]);

  // Voice channel state
  const [voiceChannelState, setVoiceChannelState] = useState({
    channelName: 'Le Village Dort...',
    allowedPeerIds: [] as string[],
    isNightChannel: false,
    enabled: false,
  });

  // Audio / Mic controls
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [hasMic, setHasMic] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const voiceManagerRef = useRef<WebRTCVoiceManager | null>(null);

  // Connect to Socket.io with reconnection configured
  useEffect(() => {
    const s = io({
      reconnection: true,
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
      timeout: 20000,
    });
    setSocket(s);

    s.on('connect', () => {
      setMyPlayerId(s.id || '');
      if (voiceManagerRef.current && s.id) {
        voiceManagerRef.current.setMyPlayerId(s.id);
      }

      // If returning after micro-cut, automatically reconnect to the game session
      const saved = retrieveSavedSession();
      if (saved && saved.roomId) {
        s.emit('reconnect_player', {
          prevPlayerId: saved.playerId,
          roomId: saved.roomId,
          playerName: saved.playerName,
          playerAvatar: saved.playerAvatar,
        });
      }
    });

    s.on('reconnect_success', ({ playerId, roomId: recRoomId }: { playerId: string; roomId: string }) => {
      setIsInRoom(true);
      setRoomId(recRoomId);
      setMyPlayerId(playerId);
      const saved = retrieveSavedSession();
      if (saved) {
        persistSession({ ...saved, playerId, roomId: recRoomId });
      }
    });

    s.on('reconnect_failed', () => {
      purgeSavedSession();
    });

    // Handle game state updates from server
    s.on('game_state_update', (data: any) => {
      setPhase(data.phase);
      setRoundNumber(data.roundNumber);
      setPlayers(data.players || {});
      setMyPlayerId(data.myPlayerId);
      setMyRole(data.myRole);
      setHasUsedLifePotion(data.hasUsedLifePotion || false);
      setHasUsedDeathPotion(data.hasUsedDeathPotion || false);
      setBobelVictimForMpamosavy(data.bobelVictimForMpamosavy);
      setCenterCards(data.centerCards || []);
      setTimeRemaining(data.phaseTimeRemaining || 0);
      setNarrationText(data.narrationText || '');
      setNarrationMalagasy(data.narrationMalagasy || '');
      setWinner(data.winner);
      setTalkieWalkie(data.talkieWalkie || null);

      if (data.players && data.myPlayerId && data.players[data.myPlayerId]) {
        setIsInRoom(true);
        persistSession({
          playerId: data.myPlayerId,
          roomId: data.roomId,
          playerName: data.players[data.myPlayerId]?.name || playerName,
          playerAvatar: data.players[data.myPlayerId]?.avatar || playerAvatar,
        });
      }

      if (voiceManagerRef.current && data.myPlayerId) {
        voiceManagerRef.current.setMyPlayerId(data.myPlayerId);
      }

      // Play audio cues on phase change
      if (data.phase === 'DAY_REVEAL') {
        soundFX.playDawnChime();
      } else if (data.phase === 'NIGHT_BOBEL' && data.myRole === 'BOBEL') {
        soundFX.playBobelRoar();
      } else if (data.phase === 'NIGHT_INTRO') {
        soundFX.playGong();
      }
    });

    s.on('talkie_walkie_update', (tw: TalkieWalkieState | null) => {
      setTalkieWalkie(tw);
    });

    s.on('talkie_tick', ({ timeRemaining }: { timeRemaining: number }) => {
      setTalkieWalkie((prev) => (prev ? { ...prev, timeRemaining } : null));
    });

    s.on('timer_tick', ({ phaseTimeRemaining }: { phaseTimeRemaining: number }) => {
      setTimeRemaining(phaseTimeRemaining);
    });

    s.on(
      'voice_channel_state',
      (vData: { channelName: string; allowedPeerIds: string[]; isNightChannel: boolean; enabled: boolean }) => {
        setVoiceChannelState(vData);
        if (voiceManagerRef.current && s.id) {
          voiceManagerRef.current.updateChannelState(vData.enabled, vData.allowedPeerIds, s.id);
        }
      }
    );

    s.on('host_assigned', () => {
      soundFX.playDawnChime();
    });

    s.on('room_dissolved', ({ message }: { message: string }) => {
      cleanupWebRTC(voiceManagerRef.current);
      purgeSavedSession();
      setIsInRoom(false);
      setPhase('LOBBY');
      setPlayers({});
      setWinner(null);
      setErrorMessage(message || "Le salon a été dissous.");
    });

    s.on('clear_chat', ({ messages }: { messages?: ChatMessage[] }) => {
      setChatMessages(messages || []);
    });

    s.on('chat_history', ({ messages }: { messages?: ChatMessage[] }) => {
      setChatMessages(messages || []);
    });

    s.on('left_room_success', () => {
      cleanupWebRTC(voiceManagerRef.current);
      purgeSavedSession();
      setIsInRoom(false);
      setPhase('LOBBY');
      setPlayers({});
      setWinner(null);
      setChatMessages([]);
    });

    s.on('chat_message', (msg: ChatMessage) => {
      setChatMessages((prev) => [...prev, msg]);
    });

    s.on('active_rooms_list', (data: { rooms: any[] }) => {
      setActiveRooms(data?.rooms || []);
    });

    s.on('player_speaking', ({ playerId, isSpeaking }: { playerId: string; isSpeaking: boolean }) => {
      setPlayers((prev) => {
        if (!prev[playerId]) return prev;
        return {
          ...prev,
          [playerId]: { ...prev[playerId], isSpeaking },
        };
      });
    });

    // Listen for server errors
    s.on('error_message', (msg: string) => {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4000);
    });

    // Initialize WebRTC Voice manager
    const vm = new WebRTCVoiceManager(s);
    voiceManagerRef.current = vm;
    registerActiveVoiceManager(vm);

    vm.onMicStatusChanged = (has, muted) => {
      setHasMic(has);
      setIsMuted(muted);
    };

    vm.onSpeakingChanged = (isSpeaking) => {
      const myId = s.id;
      if (myId) {
        setPlayers((prev) => {
          if (!prev[myId]) return prev;
          return {
            ...prev,
            [myId]: { ...prev[myId], isSpeaking },
          };
        });
      }
    };

    // Check room query param for friends joining via link
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setRoomId(roomParam.toUpperCase());
    }

    if (params.get('autostart') === '1') {
      const autoRoom = 'TEST' + Math.floor(Math.random() * 900 + 100);
      setRoomId(autoRoom);
      setTimeout(() => {
        s.emit('join_room', {
          roomId: autoRoom,
          playerName: 'Hôte_Test',
          playerAvatar: '🐂',
        });
        setIsInRoom(true);
        // Automatically add 3 bots to reach 4 players and start game
        setTimeout(() => {
          s.emit('add_bot');
          setTimeout(() => {
            s.emit('add_bot');
            setTimeout(() => {
              s.emit('add_bot');
              setTimeout(() => {
                s.emit('start_game', { includeThief: false });
              }, 300);
            }, 100);
          }, 100);
        }, 150);
      }, 300);
    }

    const handleBeforeUnload = () => {
      cleanupWebRTC(voiceManagerRef.current);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      s.disconnect();
      cleanupWebRTC(vm);
    };
  }, []);

  const handleJoinRoom = () => {
    if (!socket || !playerName.trim()) return;
    socket.emit('join_room', {
      roomId,
      playerName: playerName.trim(),
      playerAvatar,
    });
  };

  const handleSelectAndJoinRoom = (targetRoomId: string) => {
    if (!socket) return;
    const name = playerName.trim() || 'Mpilalao';
    setPlayerName(name);
    const cleanId = targetRoomId.toUpperCase().trim();
    setRoomId(cleanId);
    socket.emit('join_room', {
      roomId: cleanId,
      playerName: name,
      playerAvatar,
    });
  };

  const handleQuickSoloStart = () => {
    if (!socket) return;
    const soloName = playerName.trim() || 'Mpilalao';
    setPlayerName(soloName);
    const soloRoom = 'SOLO' + Math.floor(Math.random() * 900 + 100);
    setRoomId(soloRoom);

    socket.emit('join_room', {
      roomId: soloRoom,
      playerName: soloName,
      playerAvatar,
    });

    // Automatically add 3 AI village bots to reach 4 players and start
    setTimeout(() => {
      socket.emit('add_bot');
      setTimeout(() => {
        socket.emit('add_bot');
        setTimeout(() => {
          socket.emit('add_bot');
          setTimeout(() => {
            socket.emit('start_game', { includeThief: false });
          }, 350);
        }, 150);
      }, 150);
    }, 200);
  };

  const handleReturnToLobby = () => {
    socket?.emit('return_to_lobby');
    setPhase('LOBBY');
    setWinner(null);
    setRoundNumber(0);
  };

  const handleLeaveRoom = () => {
    cleanupWebRTC(voiceManagerRef.current);
    purgeSavedSession();
    socket?.emit('leave_room');
    setIsInRoom(false);
    setPhase('LOBBY');
    setPlayers({});
    setWinner(null);
    setChatMessages([]);
  };

  const handleDissolveRoom = () => {
    cleanupWebRTC(voiceManagerRef.current);
    purgeSavedSession();
    socket?.emit('dissolve_room');
    setIsInRoom(false);
    setPhase('LOBBY');
    setPlayers({});
    setWinner(null);
    setChatMessages([]);
  };

  const handleAddBot = () => {
    socket?.emit('add_bot');
  };

  const handleRemoveBot = (botId: string) => {
    socket?.emit('remove_bot', { botId });
  };

  const handleStartGame = (includeThief: boolean) => {
    socket?.emit('start_game', { includeThief });
  };

  const handleBobelTarget = (targetId: string) => {
    socket?.emit('bobel_target', { targetId });
  };

  const handleDadarabeInspect = (targetId: string) => {
    socket?.emit('dadarabe_inspect', { targetId });
  };

  const handleMpamosavyHeal = () => {
    socket?.emit('mpamosavy_heal');
  };

  const handleMpamosavyPoison = (targetId: string) => {
    socket?.emit('mpamosavy_poison', { targetId });
  };

  const handleMpangalatraSwap = (chosenRole: RoleType) => {
    socket?.emit('mpangalatra_swap', { chosenRole });
  };

  const handleCastVote = (targetId: string) => {
    socket?.emit('cast_vote', { targetId });
  };

  const handleSendMessage = (message: string) => {
    socket?.emit('send_chat', { message });
  };

  const handleToggleSound = () => {
    soundFX.enabled = !isSoundEnabled;
    setIsSoundEnabled(!isSoundEnabled);
  };

  const handleToggleMic = () => {
    if (voiceManagerRef.current) {
      const muted = voiceManagerRef.current.toggleMute();
      setIsMuted(muted);
    }
  };

  const handleRequestMic = async () => {
    if (voiceManagerRef.current) {
      const granted = await voiceManagerRef.current.initMicrophone();
      if (granted && socket && myPlayerId) {
        voiceManagerRef.current.updateChannelState(
          voiceChannelState.enabled,
          voiceChannelState.allowedPeerIds,
          myPlayerId
        );
      }
    }
  };

  const me = players[myPlayerId];
  const isMeAlive = me?.isAlive ?? true;
  const isHost = me?.isHost ?? false;
  const isVotingPhase =
    phase === 'VOTE_DISCUSSION' ||
    phase === 'VOTE_CASTING' ||
    phase === 'DAY_VOTE' ||
    phase === 'DAY_ELECTION';

  // Synchronize mic open/mute state across game phases
  // Strictly mutes microphone during VOTE_CASTING phase
  useEffect(() => {
    if (!voiceManagerRef.current) return;
    if (phase === 'VOTE_CASTING') {
      // Phase 2 : VOTE_CASTING - Micros coupés pour le vote secret
      voiceManagerRef.current.setMicEnabled(false);
    } else if (phase === 'VOTE_DISCUSSION' || phase.startsWith('DAY_')) {
      // Phase 1 : VOTE_DISCUSSION & Débats - Micro ouvert et talkie-walkie pour les vivants
      voiceManagerRef.current.setMicEnabled(isMeAlive && hasMic && !isMuted);
    } else if (phase === 'LOBBY') {
      voiceManagerRef.current.setMicEnabled(hasMic && !isMuted);
    } else if (phase === 'NIGHT_BOBEL') {
      const isBobel = myRole === 'BOBEL' && isMeAlive;
      voiceManagerRef.current.setMicEnabled(isBobel && hasMic && !isMuted);
    } else {
      voiceManagerRef.current.setMicEnabled(false);
    }
  }, [phase, myPlayerId, hasMic, isMuted, myRole, isMeAlive]);

  const handleRequestTalkie = async (duration?: number) => {
    if (!hasMic) {
      await handleRequestMic();
    }
    soundFX.playVoteDrum();
    socket?.emit('request_talkie', { duration: duration || 15 });
  };

  const handleReleaseTalkie = () => {
    socket?.emit('release_talkie');
  };

  return (
    <div className="min-h-screen bg-[#0c0d12] text-[#e0e2ec] flex flex-col font-sans selection:bg-amber-600 selection:text-white">
      {/* Global Header */}
      <Header
        roomId={roomId}
        phase={phase}
        roundNumber={roundNumber}
        timeRemaining={timeRemaining}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={handleToggleSound}
        hasMic={hasMic}
        isMuted={isMuted}
        onToggleMic={handleToggleMic}
        onRequestMic={handleRequestMic}
        onReturnToLobby={handleReturnToLobby}
        onLeaveRoom={handleLeaveRoom}
        isInRoom={isInRoom}
        isHost={isHost}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 sm:py-8 space-y-6">
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-red-950/90 border border-red-500/50 text-red-200 shadow-xl flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <span className="text-sm font-semibold">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs text-red-300 hover:text-white px-2.5 py-1 rounded-lg bg-red-900/60 transition"
            >
              Fermer
            </button>
          </div>
        )}

        {phase === 'LOBBY' ? (
          <LobbyView
            roomId={roomId}
            setRoomId={setRoomId}
            playerName={playerName}
            setPlayerName={setPlayerName}
            playerAvatar={playerAvatar}
            setPlayerAvatar={setPlayerAvatar}
            players={players}
            myPlayerId={myPlayerId}
            onJoinRoom={handleJoinRoom}
            onQuickSoloStart={handleQuickSoloStart}
            onAddBot={handleAddBot}
            onRemoveBot={handleRemoveBot}
            onStartGame={handleStartGame}
            onLeaveRoom={handleLeaveRoom}
            onDissolveRoom={handleDissolveRoom}
            isInRoom={isInRoom}
            activeRooms={activeRooms}
            onSelectAndJoinRoom={handleSelectAndJoinRoom}
            chatMessages={chatMessages}
            onSendMessage={handleSendMessage}
          />
        ) : (
          <div className="space-y-6">
            {/* Storytelling Narration by Mpitantara */}
            <MpitantaraNarration
              narrationText={narrationText}
              narrationMalagasy={narrationMalagasy}
              phase={phase}
              roundNumber={roundNumber}
            />

            {/* WebRTC Voice Salon Live Status */}
            <VoiceSalonIndicator
              phase={phase}
              channelName={voiceChannelState.channelName}
              isChannelEnabled={voiceChannelState.enabled}
              isNightChannel={voiceChannelState.isNightChannel}
              allowedPeerIds={voiceChannelState.allowedPeerIds}
              players={players}
              myPlayerId={myPlayerId}
              hasMic={hasMic}
              isMuted={isMuted}
              talkieWalkie={talkieWalkie}
              onToggleMic={handleToggleMic}
              onRequestMic={handleRequestMic}
              onRequestTalkie={handleRequestTalkie}
              onReleaseTalkie={handleReleaseTalkie}
            />

            {/* Mobile / Compact View Switcher */}
            <div className="flex lg:hidden items-center justify-center p-1 rounded-2xl bg-stone-900 border border-stone-800 text-xs">
              <button
                onClick={() => setActiveTab('board')}
                className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'board'
                    ? 'bg-amber-600 text-stone-950 shadow'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                <span>🏕️ Table de Jeu</span>
                {isVotingPhase && (
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
                  activeTab === 'chat'
                    ? 'bg-amber-600 text-stone-950 shadow'
                    : 'text-stone-400 hover:text-white'
                }`}
              >
                <span>💬 Chat du Village</span>
                {chatMessages.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-stone-800 text-stone-300 text-[10px]">
                    {chatMessages.length}
                  </span>
                )}
              </button>
            </div>

            {/* Layout: Left/Main Game Board & Right Private Card + Chat */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Interactive Village Seats & Actions (2 cols on lg) */}
              <div className={`lg:col-span-2 space-y-6 ${activeTab !== 'board' ? 'hidden lg:block' : ''}`}>
                <GameBoard
                  players={players}
                  myPlayerId={myPlayerId}
                  myRole={myRole}
                  phase={phase}
                  hasUsedLifePotion={hasUsedLifePotion}
                  hasUsedDeathPotion={hasUsedDeathPotion}
                  bobelVictimForMpamosavy={bobelVictimForMpamosavy}
                  centerCards={centerCards}
                  onBobelTarget={handleBobelTarget}
                  onDadarabeInspect={handleDadarabeInspect}
                  onMpamosavyHeal={handleMpamosavyHeal}
                  onMpamosavyPoison={handleMpamosavyPoison}
                  onMpangalatraSwap={handleMpangalatraSwap}
                  onCastVote={handleCastVote}
                />
              </div>

              {/* Right Column: Private Role Card & Village Chat */}
              <div className={`space-y-6 ${activeTab !== 'chat' ? 'hidden lg:block' : ''}`}>
                {/* Secret Identity Card */}
                <RoleCard
                  role={myRole}
                  isAlive={isMeAlive}
                  isSefo={me?.isSefo ?? false}
                  playerName={me?.name || playerName}
                  avatar={me?.avatar || playerAvatar}
                />

                {/* Village Chat & Reactions */}
                <VillageChat
                  messages={chatMessages}
                  onSendMessage={handleSendMessage}
                  myPlayerId={myPlayerId}
                  isAlive={isMeAlive}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Game Over Modal */}
      {phase === 'GAME_OVER' && winner && (
        <GameOverModal
          winner={winner}
          players={players}
          narrationText={narrationText}
          onRestart={() => handleStartGame(true)}
          onReturnToLobby={handleReturnToLobby}
          onLeaveRoom={handleLeaveRoom}
          isHost={isHost}
        />
      )}
    </div>
  );
}

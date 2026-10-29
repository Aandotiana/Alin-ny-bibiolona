import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express, { Request, Response } from 'express';
import { Server as SocketIOServer, Socket } from 'socket.io';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import {
  ChatMessage,
  GamePhase,
  GameState,
  NightVictims,
  Player,
  RoleType,
} from './src/game/types.ts';
import {
  assignRolesToPlayers,
  calculateNightDeaths,
  checkWinCondition,
  determineNightSteps,
  resolveBobelTarget,
  tallyVotes,
  determineIsHostOnJoin,
  transferHostOrDissolve,
  validateActionTarget,
  getSmartBotBobelTarget,
  getSmartBotDadarabeInspect,
  getSmartBotDayVote,
  generateBotDebateDialogue,
} from './src/game/rules.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(express.json());

// Initialize Google Gemini AI
let geminiAI: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    geminiAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  } catch (err) {
    console.warn('Gemini AI initialization notice:', err);
  }
}

// In-memory Game Rooms store
const rooms: Record<string, GameState> = {};
const roomTimers: Record<string, NodeJS.Timeout> = {};
const talkieTimers: Record<string, NodeJS.Timeout> = {};
const disconnectGraceTimers: Record<string, NodeJS.Timeout> = {};
const TALKIE_DURATION = 15; // 15 seconds per person as requested (10-15s)

// Default Bot names inspired by Madagascar
const BOT_NAMES = [
  { name: 'Soa', avatar: '🌺' },
  { name: 'Koto', avatar: '🌿' },
  { name: 'Rasoa', avatar: '🌾' },
  { name: 'Naivo', avatar: '🪵' },
  { name: 'Bako', avatar: '🍃' },
  { name: 'Dera', avatar: '🦅' },
  { name: 'Miora', avatar: '🌙' },
  { name: 'Toky', avatar: '🔥' },
  { name: 'Faly', avatar: '⭐' },
];

// Rate-limit guard for Gemini AI narration (prevent 429 Rate exceeded errors)
let lastGeminiCallTimestamp = 0;
const GEMINI_COOLDOWN_MS = 25000;

/**
 * Helper to generate dramatic Mpitantara narration using Gemini AI or folklore fallback
 */
async function generateMpitantaraNarration(
  phase: GamePhase,
  details: {
    round: number;
    deaths?: string[];
    condemned?: string | null;
    players?: Record<string, Player>;
    winner?: string | null;
  }
): Promise<{ textFr: string; textMg: string }> {
  const deathsText = details.deaths && details.deaths.length > 0
    ? details.deaths.map((id) => details.players?.[id]?.name).join(', ')
    : 'Aucune victime ce matin.';
  const condemnedText = details.condemned
    ? details.players?.[details.condemned]?.name || 'Personne'
    : 'Égalité ou personne';

  // Only invoke Gemini on key dramatic beats (reveal, execution, game over) and adhere to cooldown
  const isDramaticBeat = phase === 'DAY_REVEAL' || phase === 'DAY_EXECUTION' || phase === 'GAME_OVER';
  const hasValidKey = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY';
  const ai = geminiAI;
  const canCallGemini = ai && hasValidKey && isDramaticBeat && (Date.now() - lastGeminiCallTimestamp > GEMINI_COOLDOWN_MS);

  if (ai && canCallGemini) {
    try {
      lastGeminiCallTimestamp = Date.now();
      const prompt = `Tu es le Mpitantara (Narrateur du jeu 'Ny Alin\'ny Bibiolona', Loup-Garou adapté des contes et folklore malgache des Hautes Terres et forêts de Madagascar).
Génère une narration solennelle, captivante, courte et mystique (maximum 3 phrases) pour la phase actuelle : ${phase}.
Contexte:
- Nuit/Jour numéro : ${details.round}
- Victimes de la nuit : ${deathsText}
- Condamné par le village : ${condemnedText}
- Vainqueur éventuel : ${details.winner || 'Partie en cours'}

Fournis la réponse au format JSON strict avec les clés:
{
  "textFr": "Court récit en Français captivant avec métaphores malgaches (forêt, ravinala, esprits, lamba, afo)",
  "textMg": "Tantara fohy amin'ny teny Malagasy (ohatra: Ny alina nangingina, ny bibiolona nivoaka...)"
}`;

      const timeoutPromise = new Promise<{ text?: string }>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), 2500)
      );

      const generatePromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.8,
        },
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const rawText = response.text?.trim() || '{}';
      
      // Make sure response is not an error string like "Rate exceeded"
      if (!rawText.includes('Rate exceeded') && !rawText.includes('RESOURCE_EXHAUSTED')) {
        const parsed = JSON.parse(rawText);
        if (parsed.textFr && parsed.textMg) {
          return { textFr: parsed.textFr, textMg: parsed.textMg };
        }
      }
    } catch {
      // Catch any rate limit or API error cleanly without showing error to user
    }
  }

  // Atmospheric fallbacks in Malagasy & French
  switch (phase) {
    case 'NIGHT_INTRO':
      return {
        textFr: `La nuit tombe sur les collines rouges d'Imerina. Le vent siffle entre les ravinalas, le feu du village s'éteint et les habitants s'endorment dans l'angoisse.`,
        textMg: `Milentika ny masoandro, maty ny afo ao an-tanàna. Mikatona ny varavaran'ny trano hazo, ary renoky ny torimaso ny mponina.`,
      };
    case 'NIGHT_MPANGALATRA':
      return {
        textFr: `Dans l'ombre feutrée, le Mpangalatra se faufile pieds nus pour observer les destins oubliés...`,
        textMg: `Ao anatin'ny haizina, mandady moramora ny Mpangalatra hijery ny anjarany...`,
      };
    case 'NIGHT_DADARABE':
      return {
        textFr: `Dadarabe, le sage gardien des présages, consulte le sikidy pour sonder l'âme d'un habitant...`,
        textMg: `Mifoha Dadarabe, mijery ny sikidy sy ny fambara hahitana ny marina...`,
      };
    case 'NIGHT_BOBEL':
      return {
        textFr: `L'air se glace. Les Bobel aux yeux de braise rôdent en silence entre les cases et choisissent leur proie...`,
        textMg: `Mirohondrohona ny alina. Mifoha ny Bobel masiaka, mifampijery ary mifidy izay ho lasibatry ny nifiny...`,
      };
    case 'NIGHT_MPAMOSAVY':
      return {
        textFr: `La Mpamosavy réveille ses décoctions secrètes. Sauvera-t-elle la victime ou frappera-t-elle un suspect ?`,
        textMg: `Mifoha ny Mpamosavy miaraka amin'ny fanafodiny mahery vaika...`,
      };
    case 'DAY_REVEAL':
      if (details.deaths && details.deaths.length > 0) {
        return {
          textFr: `Le coq chante à l'aube. Le village se réveille dans les pleurs : ${deathsText} ne répond plus à l'appel.`,
          textMg: `Maran-drano ny andro, maneno ny akoho. Mitomany ny fokonolona: ${deathsText} no tsy nifoha intsony.`,
        };
      }
      return {
        textFr: `L'aube dorée se lève sur le village. Miracle des ancêtres : personne n'a péri cette nuit !`,
        textMg: `Masoandro mamiratra no mitsidika. Soa ihany, tsy nisy namoy ny ainy omaly alina!`,
      };
    case 'DAY_DEBATE':
    case 'VOTE_DISCUSSION':
      return {
        textFr: `Le Fokonolona se rassemble sous le grand manguier pour 60 secondes de débat ! Les voix s'élèvent au micro et au talkie-walkie pour démasquer le Bobel avant le vote !`,
        textMg: `Mivory ny Fokonolona eo ambany hazo lehibe handinika mandritra ny 60 segondra! Mifampiahiahy ny rehetra alohan'ny latsa-bato mangina.`,
      };
    case 'DAY_VOTE':
    case 'VOTE_CASTING':
      return {
        textFr: `Silence absolu dans le village : les micros sont coupés pendant 30 secondes ! Chaque habitant vote en secret pour désigner le coupable.`,
        textMg: `Mangina tanteraka ny tanàna: tapaka ny feo mandritra ny 30 segondra! Tonga ny fotoam-pitsarana sy latsa-bato mangina.`,
      };
    case 'DAY_EXECUTION':
      return {
        textFr: details.condemned
          ? `Le verdict est tombé ! ${condemnedText} est banni du village pour apaiser la terre.`
          : `Le village n'a pas réussi à s'accorder. Personne n'est condamné aujourd'hui.`,
        textMg: details.condemned
          ? `Tapaka ny hevitra! Esorina ao an-tanàna ${condemnedText}.`
          : `Tsy niray saina ny Fokonolona, tsy nisy voasazy androany.`,
      };
    case 'GAME_OVER':
      if (details.winner === 'VILLAGE') {
        return {
          textFr: `Victoire éclatante du Village ! Les prédateurs Bobel ont été éradiqués, la paix revient sur les terres.`,
          textMg: `Fandresen'ny Fokonolona! Resy sy ripaka ny Bobel rehetra, milamina ny tanàna.`,
        };
      }
      return {
        textFr: `Les Bobel triomphent ! L'ombre a dévoré le village, plus personne ne peut leur résister.`,
        textMg: `Fandresen'ny Bobel! Nanjaka ny haizina sy ny bibiolona, lany tamingana ny mponina.`,
      };
    default:
      return {
        textFr: `Le destin du village se tisse au fil des ombres...`,
        textMg: `Mizotra ny tantaran'ny tanàna...`,
      };
  }
}

/**
 * Clean and emit sanitized game state:
 * Each player only receives their OWN secret role, except Bobels who see other Bobels,
 * and dead players who see all roles.
 */
function sendPlayerSpecificState(room: GameState) {
  const playerList = Object.values(room.players);

  playerList.forEach((player) => {
    // Determine what roles this player is allowed to see
    const isBobel = player.role === 'BOBEL';
    const isDead = !player.isAlive;
    const isGameOver = room.phase === 'GAME_OVER';

    const sanitizedPlayers: Record<string, Partial<Player>> = {};
    for (const [id, p] of Object.entries(room.players)) {
      const showRole =
        isGameOver ||
        isDead ||
        id === player.id ||
        (isBobel && p.role === 'BOBEL');

      sanitizedPlayers[id] = {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isHost: p.isHost,
        isBot: p.isBot,
        isAlive: p.isAlive,
        isSefo: p.isSefo,
        vote: room.phase === 'DAY_DEBATE' || room.phase === 'DAY_VOTE' || room.phase === 'VOTE_CASTING' || room.phase === 'DAY_ELECTION' ? p.vote : null,
        targetVictim: isBobel ? p.targetVictim : null,
        role: showRole ? p.role : undefined,
        inspectedRole: id === player.id ? p.inspectedRole : null,
        isSpeaking: p.isSpeaking,
        isMuted: p.isMuted,
      };
    }

    const payload = {
      roomId: room.roomId,
      phase: room.phase,
      roundNumber: room.roundNumber,
      players: sanitizedPlayers,
      myPlayerId: player.id,
      myRole: player.role,
      hasUsedLifePotion: player.hasUsedLifePotion,
      hasUsedDeathPotion: player.hasUsedDeathPotion,
      sefomPokotanyId: room.sefomPokotanyId,
      winner: room.winner,
      phaseTimeRemaining: room.phaseTimeRemaining,
      narrationText: room.narrationText,
      narrationMalagasy: room.narrationMalagasy,
      eliminatedTonight: room.eliminatedTonight,
      eliminatedToday: room.eliminatedToday,
      centerCards: player.role === 'MPANGALATRA' && room.phase === 'NIGHT_MPANGALATRA' ? room.centerCards : [],
      bobelVictimForMpamosavy:
        player.role === 'MPAMOSAVY' && room.phase === 'NIGHT_MPAMOSAVY'
          ? room.nightVictims.bobelTargetId
          : null,
      talkieWalkie: room.talkieWalkie,
      historyLog: room.historyLog.slice(-10),
    };

    io.to(player.id).emit('game_state_update', payload);
  });

  if (room.phase === 'LOBBY') {
    broadcastActiveRooms();
  }
}

/**
 * Release Talkie-Walkie microphone
 */
function releaseTalkie(roomId: string) {
  if (talkieTimers[roomId]) {
    clearInterval(talkieTimers[roomId]);
    delete talkieTimers[roomId];
  }
  const room = rooms[roomId];
  if (room && room.talkieWalkie) {
    room.talkieWalkie = {
      activeSpeakerId: null,
      speakerName: undefined,
      speakerAvatar: undefined,
      timeRemaining: 0,
    };
    io.to(roomId).emit('talkie_walkie_update', room.talkieWalkie);
  }
}

/**
 * Handle Phase transitions
 */
async function transitionPhase(roomId: string, nextPhase: GamePhase) {
  const room = rooms[roomId];
  if (!room) return;

  if (roomTimers[roomId]) {
    clearInterval(roomTimers[roomId]);
    delete roomTimers[roomId];
  }

  // Release any active talkie-walkie turn when changing phase
  releaseTalkie(roomId);
  if (
    nextPhase === 'DAY_DEBATE' ||
    nextPhase === 'VOTE_DISCUSSION' ||
    nextPhase === 'DAY_VOTE' ||
    nextPhase === 'DAY_ELECTION'
  ) {
    room.talkieWalkie = {
      activeSpeakerId: null,
      speakerName: undefined,
      speakerAvatar: undefined,
      timeRemaining: 0,
    };
  } else {
    room.talkieWalkie = null;
  }

  room.phase = nextPhase;

  // Clear votes from previous phase
  Object.values(room.players).forEach((p) => {
    p.vote = null;
    if (nextPhase.startsWith('NIGHT_')) {
      p.targetVictim = null;
    }
  });

  // Calculate durations based on phase
  let duration = 20;
  if (nextPhase === 'NIGHT_INTRO') duration = 8;
  else if (nextPhase === 'NIGHT_MPANGALATRA') duration = 15;
  else if (nextPhase === 'NIGHT_DADARABE') duration = 20;
  else if (nextPhase === 'NIGHT_BOBEL') duration = 25;
  else if (nextPhase === 'NIGHT_MPAMOSAVY') duration = 20;
  else if (nextPhase === 'DAY_REVEAL') duration = 10;
  else if (nextPhase === 'DAY_ELECTION') duration = 25;
  else if (nextPhase === 'DAY_DEBATE') duration = 45;
  else if (nextPhase === 'VOTE_DISCUSSION') duration = 60; // 60s discussion with talkie-walkie
  else if (nextPhase === 'VOTE_CASTING') duration = 30; // 30s vote casting with mic muted
  else if (nextPhase === 'DAY_VOTE') duration = 30;
  else if (nextPhase === 'DAY_EXECUTION') duration = 10;
  else if (nextPhase === 'GAME_OVER') duration = 999999;

  room.phaseTimeRemaining = duration;

  // Generate Mpitantara narration
  const narration = await generateMpitantaraNarration(nextPhase, {
    round: room.roundNumber,
    deaths: room.eliminatedTonight,
    condemned: room.eliminatedToday,
    players: room.players,
    winner: room.winner,
  });

  room.narrationText = narration.textFr;
  room.narrationMalagasy = narration.textMg;

  room.historyLog.push({
    phase: nextPhase,
    round: room.roundNumber,
    text: narration.textFr,
    timestamp: Date.now(),
  });

  // Emit Voice Channel configuration according to phase
  updateVoiceChannelForRoom(room);

  // Send state update
  sendPlayerSpecificState(room);

  // Trigger automated actions for bots
  handleBotActionsForPhase(room, nextPhase);

  // Start countdown timer
  roomTimers[roomId] = setInterval(() => {
    room.phaseTimeRemaining -= 1;
    if (room.phaseTimeRemaining <= 0) {
      clearInterval(roomTimers[roomId]);
      delete roomTimers[roomId];
      advancePhase(roomId);
    } else {
      io.to(roomId).emit('timer_tick', { phaseTimeRemaining: room.phaseTimeRemaining });
    }
  }, 1000);
}

/**
 * WebRTC Voice salon access control with strict privacy
 * - Lobby: free conversation without limits
 * - Night Bobel: ONLY Bobels hear/see each other. Villagers see nothing!
 * - Day Debate / Vote: alive players connected with 15s Talkie-Walkie in debates
 */
function updateVoiceChannelForRoom(room: GameState) {
  const alivePlayers = Object.values(room.players).filter((p) => p.isAlive);

  if (room.phase === 'LOBBY') {
    const humanIds = Object.values(room.players).filter((p) => !p.isBot).map((p) => p.id);
    io.to(room.roomId).emit('voice_channel_state', {
      channelName: 'Lobby - Salon Vocal Libre (Sans limite)',
      allowedPeerIds: humanIds,
      isNightChannel: false,
      enabled: true,
    });
    return;
  }

  if (room.phase === 'NIGHT_BOBEL') {
    // Only alive Bobel can talk and hear each other
    // IMPORTANT: Non-Bobels are kept completely in the dark!
    const bobelIds = alivePlayers.filter((p) => p.role === 'BOBEL' && !p.isBot).map((p) => p.id);

    Object.values(room.players).forEach((p) => {
      if (p.isBot) return;
      if (p.role === 'BOBEL' && p.isAlive) {
        io.to(p.id).emit('voice_channel_state', {
          channelName: 'Conseil Secret des Bobel (Feo Mangingina)',
          allowedPeerIds: bobelIds,
          isNightChannel: true,
          enabled: true,
        });
      } else {
        io.to(p.id).emit('voice_channel_state', {
          channelName: 'Nuit Sombre - Le village dort...',
          allowedPeerIds: [],
          isNightChannel: false,
          enabled: false,
        });
      }
    });
    return;
  }

  // During VOTE_CASTING: Microphone is strictly muted for all players to vote in silence
  if (room.phase === 'VOTE_CASTING') {
    io.to(room.roomId).emit('voice_channel_state', {
      channelName: 'Latsa-bato Mangina (Vote Secret - Micros Coupés)',
      allowedPeerIds: [],
      isNightChannel: false,
      enabled: false,
    });
    return;
  }

  // During VOTE_DISCUSSION and Day phases (Debate, Election, Reveal, Execution):
  // Open mic for all alive human players with talkie-walkie support
  if (room.phase === 'VOTE_DISCUSSION' || room.phase.startsWith('DAY_')) {
    const aliveHumanIds = alivePlayers.filter((p) => !p.isBot).map((p) => p.id);
    io.to(room.roomId).emit('voice_channel_state', {
      channelName: "Fivorian'ny Tanàna (Débat & Talkie-Walkie Ouvert)",
      allowedPeerIds: aliveHumanIds,
      isNightChannel: false,
      enabled: true,
    });
    return;
  }

  // Other quiet night phases: all muted
  io.to(room.roomId).emit('voice_channel_state', {
    channelName: 'Nuit Sombre - Le village dort...',
    allowedPeerIds: [],
    isNightChannel: false,
    enabled: false,
  });
}

/**
 * Handle automated actions for bot players during any phase
 */
function handleBotActionsForPhase(room: GameState, phase: GamePhase) {
  const aliveBots = Object.values(room.players).filter((p) => p.isAlive && p.isBot);
  const alivePlayers = Object.values(room.players).filter((p) => p.isAlive);

  setTimeout(() => {
    if (phase === 'NIGHT_BOBEL') {
      const bobelBots = aliveBots.filter((b) => b.role === 'BOBEL');
      if (bobelBots.length > 0) {
        bobelBots.forEach((b) => {
          const target = getSmartBotBobelTarget(b.id, room.players);
          if (target) {
            b.targetVictim = target;
          }
        });
        sendPlayerSpecificState(room);
      }
    } else if (phase === 'NIGHT_DADARABE') {
      const dadarabeBot = aliveBots.find((b) => b.role === 'DADARABE');
      if (dadarabeBot && !dadarabeBot.inspectedRole) {
        const inspectedId = getSmartBotDadarabeInspect(dadarabeBot.id, room.players);
        if (inspectedId && room.players[inspectedId]?.role) {
          dadarabeBot.inspectedRole = { targetId: inspectedId, role: room.players[inspectedId].role! };
          sendPlayerSpecificState(room);
        }
      }
    } else if (phase === 'NIGHT_MPANGALATRA') {
      const thiefBot = aliveBots.find((b) => b.role === 'MPANGALATRA');
      if (thiefBot && !thiefBot.hasThiefActed && room.centerCards.length > 0) {
        // Swap with a special role if available
        const powerCard = room.centerCards.find((c) => c === 'BOBEL' || c === 'DADARABE' || c === 'MPAMOSAVY');
        const chosenCard = powerCard || room.centerCards[0];
        const cardIdx = room.centerCards.indexOf(chosenCard);
        if (cardIdx !== -1) {
          room.centerCards[cardIdx] = 'MPANGALATRA';
          thiefBot.role = chosenCard;
          thiefBot.hasThiefActed = true;
          sendPlayerSpecificState(room);
        }
      }
    } else if (phase === 'NIGHT_MPAMOSAVY') {
      const mpamosavyBot = aliveBots.find((b) => b.role === 'MPAMOSAVY');
      if (mpamosavyBot) {
        const victimId = room.nightVictims.bobelTargetId;
        // Potion of Life
        if (victimId && !mpamosavyBot.hasUsedLifePotion) {
          const isSelf = victimId === mpamosavyBot.id;
          const isSefo = room.players[victimId]?.isSefo;
          const isDadarabe = room.players[victimId]?.role === 'DADARABE';
          if (isSelf || isSefo || isDadarabe || Math.random() < 0.65) {
            room.nightVictims.savedByPotion = true;
            mpamosavyBot.hasUsedLifePotion = true;
          }
        }
        // Potion of Death: strategic use if not used
        if (!mpamosavyBot.hasUsedDeathPotion && Math.random() < 0.25) {
          const aliveSuspects = alivePlayers.filter(
            (p) => p.id !== mpamosavyBot.id && p.id !== victimId && p.isAlive
          );
          if (aliveSuspects.length > 0) {
            const poisonTarget = aliveSuspects[Math.floor(Math.random() * aliveSuspects.length)].id;
            room.nightVictims.poisonTargetId = poisonTarget;
            mpamosavyBot.hasUsedDeathPotion = true;
          }
        }
        sendPlayerSpecificState(room);
      }
    } else if (phase === 'DAY_ELECTION') {
      aliveBots.forEach((b) => {
        b.vote = getSmartBotDayVote(b.id, room.players, [], true);
      });
      sendPlayerSpecificState(room);
    } else if (phase === 'DAY_VOTE' || phase === 'VOTE_CASTING') {
      // Find any known Bobels revealed by Dadarabe bot
      const dadarabeBot = Object.values(room.players).find((p) => p.role === 'DADARABE');
      const knownBobels: string[] = [];
      if (dadarabeBot?.inspectedRole && dadarabeBot.inspectedRole.role === 'BOBEL') {
        knownBobels.push(dadarabeBot.inspectedRole.targetId);
      }
      aliveBots.forEach((b) => {
        b.vote = getSmartBotDayVote(b.id, room.players, knownBobels, false);
      });
      sendPlayerSpecificState(room);
    } else if (phase === 'DAY_DEBATE' || phase === 'VOTE_DISCUSSION') {
      // Send 1 or 2 authentic Malagasy/French chat messages from AI bots
      const dadarabeBot = aliveBots.find((b) => b.role === 'DADARABE');
      let knownBobelId: string | null = null;
      if (dadarabeBot?.inspectedRole && dadarabeBot.inspectedRole.role === 'BOBEL') {
        knownBobelId = dadarabeBot.inspectedRole.targetId;
      }

      const speakingBots = aliveBots.slice(0, Math.min(2, aliveBots.length));
      speakingBots.forEach((bot, idx) => {
        setTimeout(() => {
          if (room.phase === 'DAY_DEBATE' || room.phase === 'VOTE_DISCUSSION') {
            const dialogue = generateBotDebateDialogue(bot, room.players, knownBobelId);
            const chatMsg: ChatMessage = {
              id: `msg_bot_${Date.now()}_${bot.id}`,
              senderId: bot.id,
              senderName: bot.name,
              senderAvatar: bot.avatar,
              isAlive: true,
              message: dialogue,
              timestamp: Date.now(),
            };
            if (!room.chatMessages) room.chatMessages = [];
            room.chatMessages.push(chatMsg);
            io.to(room.roomId).emit('chat_message', chatMsg);
          }
        }, 3000 + idx * 4500);
      });

      // If room has bots and no human has taken the floor after 6s, a bot takes the mic for 3.5s
      setTimeout(() => {
        if ((room.phase === 'DAY_DEBATE' || room.phase === 'VOTE_DISCUSSION') && !room.talkieWalkie?.activeSpeakerId) {
          const aliveBotList = Object.values(room.players).filter((p) => p.isAlive && p.isBot);
          if (aliveBotList.length > 0) {
            const speakingBot = aliveBotList[Math.floor(Math.random() * aliveBotList.length)];
            room.talkieWalkie = {
              activeSpeakerId: speakingBot.id,
              speakerName: speakingBot.name,
              speakerAvatar: speakingBot.avatar,
              timeRemaining: 4,
            };
            io.to(room.roomId).emit('talkie_walkie_update', room.talkieWalkie);

            setTimeout(() => {
              if (room.talkieWalkie?.activeSpeakerId === speakingBot.id) {
                releaseTalkie(room.roomId);
              }
            }, 3500);
          }
        }
      }, 6000);
    }
  }, 2000);
}

/**
 * Advance to next logical game phase
 */
async function advancePhase(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  switch (room.phase) {
    case 'NIGHT_INTRO': {
      room.currentNightStepIndex = 1;
      const nextStep = room.nightOrder[room.currentNightStepIndex] || 'DAY_REVEAL';
      transitionPhase(roomId, nextStep);
      break;
    }

    case 'NIGHT_MPANGALATRA':
    case 'NIGHT_DADARABE':
    case 'NIGHT_BOBEL': {
      // If Bobel step just finished, consolidate target
      if (room.phase === 'NIGHT_BOBEL') {
        room.nightVictims.bobelTargetId = resolveBobelTarget(room.players);
      }
      room.currentNightStepIndex += 1;
      const nextStep = room.nightOrder[room.currentNightStepIndex];
      if (nextStep) {
        transitionPhase(roomId, nextStep);
      } else {
        advanceToDay(roomId);
      }
      break;
    }

    case 'NIGHT_MPAMOSAVY': {
      advanceToDay(roomId);
      break;
    }

    case 'DAY_REVEAL': {
      // Check win condition right after night reveal
      const win = checkWinCondition(room.players);
      if (win) {
        room.winner = win;
        transitionPhase(roomId, 'GAME_OVER');
        return;
      }

      // If round 1 and no Sefom-pokotany elected, go to election
      if (room.roundNumber === 1 && !room.sefomPokotanyId) {
        transitionPhase(roomId, 'DAY_ELECTION');
      } else {
        // Enchaîne sur la phase 1 du vote: VOTE_DISCUSSION (60 secondes avec micro/talkie)
        transitionPhase(roomId, 'VOTE_DISCUSSION');
      }
      break;
    }

    case 'DAY_ELECTION': {
      // Elect Sefom-Pokotany
      const electionResult = tallyVotes(room.players, null);
      if (electionResult.winnerId) {
        room.sefomPokotanyId = electionResult.winnerId;
        if (room.players[electionResult.winnerId]) {
          room.players[electionResult.winnerId].isSefo = true;
        }
      } else {
        // Fallback: pick first alive candidate
        const alive = Object.values(room.players).filter((p) => p.isAlive);
        if (alive.length > 0) {
          room.sefomPokotanyId = alive[0].id;
          alive[0].isSefo = true;
        }
      }
      // Enchaîne sur la phase 1 du vote: VOTE_DISCUSSION (60 secondes)
      transitionPhase(roomId, 'VOTE_DISCUSSION');
      break;
    }

    case 'DAY_DEBATE':
    case 'VOTE_DISCUSSION': {
      // Phase 1 (Débat 60s) se termine -> Enchaîne sur la Phase 2 : VOTE_CASTING (30s sans micro)
      transitionPhase(roomId, 'VOTE_CASTING');
      break;
    }

    case 'DAY_VOTE':
    case 'VOTE_CASTING': {
      // Phase 2 (Vote 30s) se termine -> Dépouillement des votes et exécution
      const voteResult = tallyVotes(room.players, room.sefomPokotanyId);
      if (voteResult.winnerId && room.players[voteResult.winnerId]) {
        room.eliminatedToday = voteResult.winnerId;
        room.players[voteResult.winnerId].isAlive = false;

        // If executed was Sefom-pokotany, pass title to another alive player
        if (room.sefomPokotanyId === voteResult.winnerId) {
          const remainingAlive = Object.values(room.players).filter((p) => p.isAlive);
          if (remainingAlive.length > 0) {
            room.sefomPokotanyId = remainingAlive[0].id;
            remainingAlive[0].isSefo = true;
          } else {
            room.sefomPokotanyId = null;
          }
        }
      } else {
        room.eliminatedToday = null;
      }
      transitionPhase(roomId, 'DAY_EXECUTION');
      break;
    }

    case 'DAY_EXECUTION': {
      // Check win condition
      const win = checkWinCondition(room.players);
      if (win) {
        room.winner = win;
        transitionPhase(roomId, 'GAME_OVER');
      } else {
        // Loop back to next Night!
        startNextNight(roomId);
      }
      break;
    }

    default:
      break;
  }
}

/**
 * Handle Night ending and Day arriving
 */
function advanceToDay(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  const deaths = calculateNightDeaths(room.nightVictims, room.players);
  room.eliminatedTonight = deaths;

  deaths.forEach((id) => {
    if (room.players[id]) {
      room.players[id].isAlive = false;
      // If Sefo died, pass title
      if (room.sefomPokotanyId === id) {
        const remainingAlive = Object.values(room.players).filter((p) => p.isAlive && p.id !== id);
        if (remainingAlive.length > 0) {
          room.sefomPokotanyId = remainingAlive[0].id;
          remainingAlive[0].isSefo = true;
        } else {
          room.sefomPokotanyId = null;
        }
      }
    }
  });

  transitionPhase(roomId, 'DAY_REVEAL');
}

/**
 * Setup and start the next night
 */
function startNextNight(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  room.roundNumber += 1;
  room.eliminatedTonight = [];
  room.eliminatedToday = null;
  room.nightVictims = {
    bobelTargetId: null,
    savedByPotion: false,
    poisonTargetId: null,
  };

  // Reset player night action states so Dadarabe and Bobels can act every night
  Object.values(room.players).forEach((p) => {
    p.vote = null;
    p.targetVictim = null;
    p.inspectedRole = null;
  });

  room.nightOrder = determineNightSteps(room.roundNumber, room.players);
  room.currentNightStepIndex = 0;

  transitionPhase(roomId, 'NIGHT_INTRO');
}

// REST API for rooms and health
function getActiveRoomsList() {
  return Object.values(rooms)
    .filter((r) => r.phase === 'LOBBY')
    .map((r) => {
      const playerList = Object.values(r.players);
      const host = playerList.find((p) => p.isHost) || playerList.find((p) => !p.isBot) || playerList[0];
      return {
        roomId: r.roomId,
        playerCount: playerList.length,
        hostName: host ? host.name : 'Inconnu',
        hostAvatar: host ? host.avatar : '👤',
      };
    });
}

function broadcastActiveRooms() {
  io.emit('active_rooms_list', { rooms: getActiveRoomsList() });
}

/**
 * Dissolve a room cleanly, clearing timers and notifying all sockets
 */
function dissolveRoom(roomId: string, reason?: string) {
  if (roomTimers[roomId]) {
    clearInterval(roomTimers[roomId]);
    delete roomTimers[roomId];
  }
  if (talkieTimers[roomId]) {
    clearInterval(talkieTimers[roomId]);
    delete talkieTimers[roomId];
  }
  if (rooms[roomId]) {
    io.to(roomId).emit('room_dissolved', {
      message: reason || "Le salon a été dissous car l'hôte et les participants ont quitté.",
    });
    delete rooms[roomId];
    broadcastActiveRooms();
  }
}

/**
 * Handles a player leaving or disconnecting:
 * - Dissolves room if no human players remain
 * - Automatically reassigns host role to another human player (NEVER a bot) in priority
 */
function handlePlayerDeparture(socketOrId: Socket | string, roomId: string) {
  const playerId = typeof socketOrId === 'string' ? socketOrId : socketOrId.id;
  const room = rooms[roomId];
  if (!room) return;

  const leavingPlayer = room.players[playerId];
  if (!leavingPlayer) return;

  // Release talkie mic if this player was actively speaking
  if (room.talkieWalkie?.activeSpeakerId === playerId) {
    releaseTalkie(roomId);
  }

  // Calculate host transfer or dissolution
  const transfer = transferHostOrDissolve(room.players, playerId);

  if (transfer.shouldDissolve) {
    // Only bots or no one left -> dissolve room
    dissolveRoom(roomId, "Le salon a été dissous car il n'y a plus aucun joueur humain.");
    return;
  }

  const wasHost = leavingPlayer.isHost;

  // 1. Prominent system notification that the player left the game
  const departureMsg: ChatMessage = {
    id: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    senderId: 'system',
    senderName: 'Mpitantara',
    senderAvatar: '🚪',
    isAlive: true,
    isSystem: true,
    message: `🚪 ${leavingPlayer.name} a quitté la partie ! (Nandao ny tanàna)`,
    timestamp: Date.now(),
  };
  if (!room.chatMessages) room.chatMessages = [];
  room.chatMessages.push(departureMsg);
  io.to(roomId).emit('chat_message', departureMsg);

  // 2. If game is actively playing, keep player as Bot so game does not collapse instantly
  if (room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER') {
    leavingPlayer.isBot = true;
    leavingPlayer.name = `${leavingPlayer.name} (IA)`;
    leavingPlayer.isHost = false;

    const botNotice: ChatMessage = {
      id: `bot_sub_${Date.now()}`,
      senderId: 'system',
      senderName: 'Mpitantara',
      senderAvatar: '🤖',
      isAlive: true,
      isSystem: true,
      message: `🤖 Un esprit du village (IA) prend le relais de ${leavingPlayer.name.replace(' (IA)', '')} pour que la partie continue sereinement !`,
      timestamp: Date.now(),
    };
    room.chatMessages.push(botNotice);
    io.to(roomId).emit('chat_message', botNotice);
  } else {
    // In Lobby, remove player from room completely
    delete room.players[playerId];
  }

  // If leaving player was host, transfer to the chosen human player
  if (wasHost && transfer.newHostId && room.players[transfer.newHostId]) {
    // Ensure all other players are not marked as host
    Object.values(room.players).forEach((p) => {
      p.isHost = p.id === transfer.newHostId;
    });

    const newHost = room.players[transfer.newHostId];
    const hostNotice = `👑 L'hôte a quitté le village. ${newHost.name} est maintenant le nouvel hôte !`;

    const hostMsg: ChatMessage = {
      id: `host_trans_${Date.now()}`,
      senderId: 'system',
      senderName: 'Mpitantara',
      senderAvatar: '👑',
      isAlive: true,
      isSystem: true,
      message: hostNotice,
      timestamp: Date.now(),
    };
    room.chatMessages.push(hostMsg);
    io.to(roomId).emit('chat_message', hostMsg);
    io.to(transfer.newHostId).emit('host_assigned', { isHost: true });
  }

  // If during active game, check win condition
  if (room.phase !== 'LOBBY' && room.phase !== 'GAME_OVER') {
    const win = checkWinCondition(room.players);
    if (win) {
      room.winner = win;
      transitionPhase(roomId, 'GAME_OVER');
      return;
    }
  }

  // Update voice channels for remaining players
  updateVoiceChannelForRoom(room);
  sendPlayerSpecificState(room);
  broadcastActiveRooms();
}

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', activeRooms: Object.keys(rooms).length });
});

app.get('/api/rooms', (req: Request, res: Response) => {
  res.json({ rooms: getActiveRoomsList() });
});

// Socket.io Real-Time Synchronization & WebRTC Mesh Signaling
io.on('connection', (socket: Socket) => {
  let currentRoomId: string | null = null;
  let currentPlayerId: string = socket.id;

  // Immediately send open rooms on connection
  socket.emit('active_rooms_list', { rooms: getActiveRoomsList() });

  socket.on('get_active_rooms', () => {
    socket.emit('active_rooms_list', { rooms: getActiveRoomsList() });
  });

  // Player joins room
  socket.on('join_room', ({ roomId, playerName, playerAvatar }: { roomId: string; playerName: string; playerAvatar: string }) => {
    const cleanRoomId = (roomId || 'BIBY').toUpperCase().trim();
    currentRoomId = cleanRoomId;

    if (!rooms[cleanRoomId]) {
      // Create new game state
      rooms[cleanRoomId] = {
        roomId: cleanRoomId,
        phase: 'LOBBY',
        roundNumber: 0,
        players: {},
        nightOrder: [],
        currentNightStepIndex: 0,
        centerCards: [],
        nightVictims: { bobelTargetId: null, savedByPotion: false, poisonTargetId: null },
        eliminatedTonight: [],
        eliminatedToday: null,
        sefomPokotanyId: null,
        winner: null,
        phaseTimeRemaining: 0,
        narrationText: 'Bienvenue dans Ny Alin\'ny Bibiolona. En attente des villageois...',
        narrationMalagasy: 'Tongasoa eto amin\'ny Ny Alin\'ny Bibiolona. Miandry ny mponina...',
        talkieWalkie: null,
        chatMessages: [],
        historyLog: [],
      };
    }

    const room = rooms[cleanRoomId];

    // Prevent new players from joining mid-game without reconnect flow
    if (room.phase !== 'LOBBY' && !room.players[socket.id]) {
      socket.emit('error_message', "Cette partie a déjà commencé. Vous pourrez rejoindre le salon au prochain tour.");
      return;
    }

    // Maximum 12 players per room
    if (Object.keys(room.players).length >= 12 && !room.players[socket.id]) {
      socket.emit('error_message', "Ce salon a atteint la capacité maximale de 12 joueurs.");
      return;
    }

    socket.join(cleanRoomId);

    if (!room.chatMessages) room.chatMessages = [];

    // Automatically determine host: first human joining the room is host
    const isHost = determineIsHostOnJoin(room.players, socket.id);

    room.players[socket.id] = {
      id: socket.id,
      name: playerName || `Mpilalao_${socket.id.slice(-4)}`,
      avatar: playerAvatar || '🌕',
      isHost,
      isBot: false,
      isAlive: true,
      isSefo: false,
    };

    updateVoiceChannelForRoom(room);
    sendPlayerSpecificState(room);
    socket.emit('chat_history', { messages: room.chatMessages });
    broadcastActiveRooms();
  });

  // Player reconnects automatically after micro-cut
  socket.on(
    'reconnect_player',
    ({
      prevPlayerId,
      roomId,
      playerName,
      playerAvatar,
    }: {
      prevPlayerId: string;
      roomId: string;
      playerName: string;
      playerAvatar: string;
    }) => {
      const cleanRoomId = (roomId || '').toUpperCase().trim();
      const room = rooms[cleanRoomId];
      if (!room) {
        socket.emit('reconnect_failed', { message: "Le salon n'existe plus." });
        return;
      }

      // Check for existing player record by previous ID or player name
      let player =
        room.players[prevPlayerId] ||
        Object.values(room.players).find(
          (p) => p.name === playerName || p.name === `${playerName} (IA)`
        );

      if (player) {
        const oldId = player.id;

        // Cancel any pending disconnect grace timer
        if (disconnectGraceTimers[oldId]) {
          clearTimeout(disconnectGraceTimers[oldId]);
          delete disconnectGraceTimers[oldId];
        }

        // Restore human status if was temporarily converted to bot
        if (player.isBot) {
          player.isBot = false;
          player.name = player.name.replace(' (IA)', '');
        }

        // Re-bind to current socket ID if changed
        if (oldId !== socket.id) {
          delete room.players[oldId];
          player.id = socket.id;
          room.players[socket.id] = player;

          if (room.sefomPokotanyId === oldId) room.sefomPokotanyId = socket.id;
          if (room.talkieWalkie?.activeSpeakerId === oldId) {
            room.talkieWalkie.activeSpeakerId = socket.id;
          }

          Object.values(room.players).forEach((p) => {
            if (p.vote === oldId) p.vote = socket.id;
            if (p.targetVictim === oldId) p.targetVictim = socket.id;
          });
        }

        currentRoomId = cleanRoomId;
        currentPlayerId = socket.id;
        socket.join(cleanRoomId);

        const recMsg: ChatMessage = {
          id: `rec_${Date.now()}`,
          senderId: 'system',
          senderName: 'Mpitantara',
          senderAvatar: '🔄',
          isAlive: true,
          isSystem: true,
          message: `⚡ ${player.name} s'est reconnecté avec succès ! (Tafaverina ny mpilalao)`,
          timestamp: Date.now(),
        };
        if (!room.chatMessages) room.chatMessages = [];
        room.chatMessages.push(recMsg);
        io.to(cleanRoomId).emit('chat_message', recMsg);

        socket.emit('reconnect_success', { playerId: socket.id, roomId: cleanRoomId });
        updateVoiceChannelForRoom(room);
        sendPlayerSpecificState(room);
        socket.emit('chat_history', { messages: room.chatMessages });
        broadcastActiveRooms();
      } else {
        // Fallback for lobby
        if (room.phase === 'LOBBY') {
          currentRoomId = cleanRoomId;
          currentPlayerId = socket.id;
          socket.join(cleanRoomId);
          const isHost = determineIsHostOnJoin(room.players, socket.id);
          room.players[socket.id] = {
            id: socket.id,
            name: playerName || `Mpilalao_${socket.id.slice(-4)}`,
            avatar: playerAvatar || '🌕',
            isHost,
            isBot: false,
            isAlive: true,
            isSefo: false,
          };
          updateVoiceChannelForRoom(room);
          sendPlayerSpecificState(room);
          socket.emit('chat_history', { messages: room.chatMessages || [] });
          broadcastActiveRooms();
        } else {
          socket.emit('reconnect_failed', {
            message: 'Session de jeu expirée. Veuillez rejoindre le salon.',
          });
        }
      }
    }
  );

  // Client requests server-side Mpitantara Gemini AI narration safely without exposing API keys
  socket.on('request_narration', async () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    try {
      const narration = await generateMpitantaraNarration(room.phase, {
        round: room.roundNumber,
        deaths: room.eliminatedTonight,
        condemned: room.eliminatedToday,
        players: room.players,
        winner: room.winner,
      });
      room.narrationText = narration.textFr;
      room.narrationMalagasy = narration.textMg;
      io.to(currentRoomId).emit('narration_update', {
        narrationText: room.narrationText,
        narrationMalagasy: room.narrationMalagasy,
      });
      sendPlayerSpecificState(room);
    } catch (e) {
      console.warn('Narration request error:', e);
    }
  });

  // Host adds Bot / AI Villagers
  socket.on('add_bot', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.phase !== 'LOBBY') return;

    if (!room.players[socket.id]?.isHost) {
      socket.emit('error_message', "Seul l'hôte du salon peut ajouter des villageois IA.");
      return;
    }

    const existingNames = new Set(Object.values(room.players).map((p) => p.name));
    const available = BOT_NAMES.filter((b) => !existingNames.has(b.name));
    const botData = available.length > 0 ? available[0] : { name: `Bot_${Date.now() % 1000}`, avatar: '🤖' };

    const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    room.players[botId] = {
      id: botId,
      name: botData.name,
      avatar: botData.avatar,
      isHost: false,
      isBot: true,
      isAlive: true,
      isSefo: false,
    };

    sendPlayerSpecificState(room);

    // Bot greets the lobby chat
    setTimeout(() => {
      const targetRoom = rooms[currentRoomId || ''];
      if (targetRoom && targetRoom.phase === 'LOBBY') {
        const botGreetings = [
          'Manao ahoana daholo! 👋',
          'Faly miaraka aminareo! 🛖',
          'Vonona aho hilalao! ⚡',
          'Manahoana ny fokonolona! 🌾',
        ];
        const greeting = botGreetings[Math.floor(Math.random() * botGreetings.length)];
        const botMsg: ChatMessage = {
          id: `msg_${Date.now()}_${botId}`,
          senderId: botId,
          senderName: botData.name,
          senderAvatar: botData.avatar,
          isAlive: true,
          message: greeting,
          timestamp: Date.now(),
        };
        if (!targetRoom.chatMessages) targetRoom.chatMessages = [];
        targetRoom.chatMessages.push(botMsg);
        io.to(targetRoom.roomId).emit('chat_message', botMsg);
      }
    }, 350);
  });

  // Host removes a bot
  socket.on('remove_bot', ({ botId }: { botId: string }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.phase !== 'LOBBY') return;

    if (!room.players[socket.id]?.isHost) {
      socket.emit('error_message', "Seul l'hôte du salon peut retirer des villageois IA.");
      return;
    }

    if (room.players[botId] && room.players[botId].isBot) {
      delete room.players[botId];
      sendPlayerSpecificState(room);
    }
  });

  // Host starts the game (minimum 4 players)
  socket.on('start_game', ({ includeThief }: { includeThief: boolean }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    if (!room.players[socket.id]?.isHost) {
      socket.emit('error_message', "Seul l'hôte du salon peut lancer la partie.");
      return;
    }

    const playerList = Object.values(room.players);

    if (playerList.length < 4) {
      socket.emit('error_message', 'Il faut au moins 4 joueurs pour lancer la partie (ajoutez des villageois IA pour tester !)');
      return;
    }

    // Clear any timers or active talkie state from previous game
    if (roomTimers[currentRoomId]) {
      clearInterval(roomTimers[currentRoomId]);
      delete roomTimers[currentRoomId];
    }
    if (talkieTimers[currentRoomId]) {
      clearInterval(talkieTimers[currentRoomId]);
      delete talkieTimers[currentRoomId];
    }
    releaseTalkie(currentRoomId);
    room.talkieWalkie = null;
    room.nightVictims = { bobelTargetId: null, savedByPotion: false, poisonTargetId: null };
    room.eliminatedTonight = [];
    room.eliminatedToday = null;

    // Reset and clear chat on new game start so old messages never persist
    const gameStartMsg: ChatMessage = {
      id: `sys_${Date.now()}`,
      senderId: 'system',
      senderName: 'Mpitantara',
      senderAvatar: '📜',
      isAlive: true,
      isSystem: true,
      message: "🔥 Nanomboka ny lalao ! Rehefa matory ny tanàna, dia mikatona ny mason'ny mponina... (Nouvelle partie : silence dans le village)",
      timestamp: Date.now(),
    };
    room.chatMessages = [gameStartMsg];
    io.to(currentRoomId).emit('clear_chat', { messages: room.chatMessages });

    // Assign roles strictly: 1 role per socket ID
    const { players: assigned, centerCards } = assignRolesToPlayers(playerList, includeThief);
    assigned.forEach((p) => {
      room.players[p.id] = p;
    });
    room.centerCards = centerCards;
    room.roundNumber = 1;
    room.winner = null;
    room.sefomPokotanyId = null;

    room.nightOrder = determineNightSteps(1, room.players);
    room.currentNightStepIndex = 0;

    transitionPhase(currentRoomId, 'NIGHT_INTRO');
  });

  // Return to Lobby button that really works (Host only)
  socket.on('return_to_lobby', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    if (!room.players[socket.id]?.isHost) {
      socket.emit('error_message', "Seul l'hôte du salon peut réinitialiser la partie et revenir au salon.");
      return;
    }

    if (roomTimers[currentRoomId]) {
      clearInterval(roomTimers[currentRoomId]);
      delete roomTimers[currentRoomId];
    }

    releaseTalkie(currentRoomId);
    room.talkieWalkie = null;

    room.phase = 'LOBBY';
    room.roundNumber = 0;
    room.winner = null;
    room.sefomPokotanyId = null;
    room.nightVictims = { bobelTargetId: null, savedByPotion: false, poisonTargetId: null };
    room.eliminatedTonight = [];
    room.eliminatedToday = null;
    room.narrationText = 'Retour au village. En attente des villageois...';
    room.narrationMalagasy = 'Tafaverina ao an-tanàna...';

    // Clear and reset chat for lobby return
    const lobbyMsg: ChatMessage = {
      id: `sys_${Date.now()}`,
      senderId: 'system',
      senderName: 'Mpitantara',
      senderAvatar: '🌾',
      isAlive: true,
      isSystem: true,
      message: "🛖 Tafaverina ao an-tanàna (Retour au Salon). Vonona amin'ny lalao vaovao !",
      timestamp: Date.now(),
    };
    room.chatMessages = [lobbyMsg];
    io.to(currentRoomId).emit('clear_chat', { messages: room.chatMessages });

    // Reset all players
    Object.values(room.players).forEach((p) => {
      p.isAlive = true;
      p.role = undefined;
      p.initialRole = undefined;
      p.isSefo = false;
      p.vote = null;
      p.targetVictim = null;
      p.inspectedRole = null;
      p.hasUsedLifePotion = false;
      p.hasUsedDeathPotion = false;
      p.hasThiefActed = false;
    });

    updateVoiceChannelForRoom(room);
    sendPlayerSpecificState(room);
  });

  // Leave room completely and return to welcome screen
  socket.on('leave_room', () => {
    if (currentRoomId && rooms[currentRoomId]) {
      const roomToLeave = currentRoomId;
      const departingId = socket.id;
      currentRoomId = null;
      if (disconnectGraceTimers[departingId]) {
        clearTimeout(disconnectGraceTimers[departingId]);
        delete disconnectGraceTimers[departingId];
      }
      socket.leave(roomToLeave);
      socket.emit('left_room_success');
      handlePlayerDeparture(departingId, roomToLeave);
    }
  });

  // Host explicitly dissolves the room
  socket.on('dissolve_room', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.players[socket.id]?.isHost) {
      dissolveRoom(currentRoomId, "Le salon a été dissous par l'hôte.");
    } else {
      socket.emit('error_message', "Seul l'hôte peut dissoudre le salon.");
    }
  });

  // Action: Bobel targets a victim
  socket.on('bobel_target', ({ targetId }: { targetId: string }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.phase !== 'NIGHT_BOBEL') return;
    const me = room.players[socket.id];
    if (!me || me.role !== 'BOBEL' || !me.isAlive) return;

    const validation = validateActionTarget('BOBEL_TARGET', socket.id, targetId, room.players);
    if (!validation.valid) {
      socket.emit('error_message', validation.reason);
      return;
    }

    me.targetVictim = targetId;
    sendPlayerSpecificState(room);
  });

  // Action: Dadarabe inspects a player
  socket.on('dadarabe_inspect', ({ targetId }: { targetId: string }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.phase !== 'NIGHT_DADARABE') return;
    const me = room.players[socket.id];
    if (!me || me.role !== 'DADARABE' || !me.isAlive) return;

    if (me.inspectedRole) {
      socket.emit('error_message', "Vous avez déjà sondé les esprits pour cette nuit.");
      return;
    }

    const validation = validateActionTarget('DADARABE_INSPECT', socket.id, targetId, room.players);
    if (!validation.valid) {
      socket.emit('error_message', validation.reason);
      return;
    }

    const target = room.players[targetId];
    if (target && target.role) {
      me.inspectedRole = { targetId, role: target.role };
      sendPlayerSpecificState(room);
    }
  });

  // Action: Mpamosavy potions
  socket.on('mpamosavy_heal', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.phase !== 'NIGHT_MPAMOSAVY') return;
    const me = room.players[socket.id];
    if (!me || me.role !== 'MPAMOSAVY' || !me.isAlive) return;

    if (me.hasUsedLifePotion) {
      socket.emit('error_message', "Votre Potion de Vie a déjà été utilisée dans cette partie.");
      return;
    }

    if (!room.nightVictims.bobelTargetId) {
      socket.emit('error_message', "Aucune victime n'a été attaquée par les Bobel cette nuit.");
      return;
    }

    room.nightVictims.savedByPotion = true;
    me.hasUsedLifePotion = true;
    sendPlayerSpecificState(room);
  });

  socket.on('mpamosavy_poison', ({ targetId }: { targetId: string }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.phase !== 'NIGHT_MPAMOSAVY') return;
    const me = room.players[socket.id];
    if (!me || me.role !== 'MPAMOSAVY' || !me.isAlive) return;

    if (me.hasUsedDeathPotion) {
      socket.emit('error_message', "Votre Potion de Mort a déjà été utilisée dans cette partie.");
      return;
    }

    const validation = validateActionTarget('MPAMOSAVY_POISON', socket.id, targetId, room.players);
    if (!validation.valid) {
      socket.emit('error_message', validation.reason);
      return;
    }

    room.nightVictims.poisonTargetId = targetId;
    me.hasUsedDeathPotion = true;
    sendPlayerSpecificState(room);
  });

  // Action: Mpangalatra swaps role
  socket.on('mpangalatra_swap', ({ chosenRole }: { chosenRole: RoleType }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (room.phase !== 'NIGHT_MPANGALATRA') return;
    const me = room.players[socket.id];
    if (!me || me.role !== 'MPANGALATRA' || me.hasThiefActed) return;

    const allBobel = room.centerCards.length > 0 && room.centerCards.every((c) => c === 'BOBEL');
    if (allBobel && chosenRole !== 'BOBEL') {
      socket.emit('error_message', "Les 2 cartes du centre étant des Bobel, vous devez obligatoirement devenir Bobel !");
      return;
    }

    if (chosenRole && room.centerCards.includes(chosenRole)) {
      const cardIdx = room.centerCards.indexOf(chosenRole);
      room.centerCards[cardIdx] = 'MPANGALATRA';
      me.role = chosenRole;
      me.hasThiefActed = true;
      sendPlayerSpecificState(room);
    }
  });

  // Action: Day vote
  socket.on('cast_vote', ({ targetId }: { targetId: string }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    if (
      room.phase !== 'VOTE_CASTING' &&
      room.phase !== 'DAY_VOTE' &&
      room.phase !== 'DAY_ELECTION'
    )
      return;
    const me = room.players[socket.id];
    if (!me || !me.isAlive) return;

    const actionType = room.phase === 'DAY_ELECTION' ? 'DAY_ELECTION' : 'DAY_VOTE';
    const validation = validateActionTarget(actionType, socket.id, targetId, room.players);
    if (!validation.valid) {
      socket.emit('error_message', validation.reason);
      return;
    }

    me.vote = targetId || null;
    sendPlayerSpecificState(room);
  });

  // Action: Village chat / reaction
  socket.on('send_chat', ({ message }: { message: string }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];
    const me = room.players[socket.id];
    if (!me || !message?.trim()) return;

    const chatMsg: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: socket.id,
      senderName: me.name,
      senderAvatar: me.avatar,
      isAlive: me.isAlive,
      message: message.trim(),
      timestamp: Date.now(),
    };
    if (!room.chatMessages) room.chatMessages = [];
    room.chatMessages.push(chatMsg);
    if (room.chatMessages.length > 80) {
      room.chatMessages.shift();
    }
    io.to(currentRoomId).emit('chat_message', chatMsg);
  });

  // Talkie-Walkie: Request floor for 10s or 15s during DAY_DEBATE, VOTE_DISCUSSION, DAY_VOTE, DAY_ELECTION
  socket.on('request_talkie', (data?: { duration?: number }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const targetRoomId = currentRoomId;
    const room = rooms[targetRoomId];
    const isTalkiePhase =
      room.phase === 'DAY_DEBATE' ||
      room.phase === 'VOTE_DISCUSSION' ||
      room.phase === 'DAY_VOTE' ||
      room.phase === 'DAY_ELECTION';

    if (!isTalkiePhase) return;
    const me = room.players[socket.id];
    if (!me || !me.isAlive) return;

    // Reject if another player currently holds the mic
    if (room.talkieWalkie?.activeSpeakerId && room.talkieWalkie.activeSpeakerId !== socket.id) {
      return;
    }

    if (talkieTimers[targetRoomId]) {
      clearInterval(talkieTimers[targetRoomId]);
      delete talkieTimers[targetRoomId];
    }

    const duration = data?.duration === 10 ? 10 : 15;

    room.talkieWalkie = {
      activeSpeakerId: socket.id,
      speakerName: me.name,
      speakerAvatar: me.avatar,
      timeRemaining: duration,
    };

    io.to(targetRoomId).emit('talkie_walkie_update', room.talkieWalkie);

    talkieTimers[targetRoomId] = setInterval(() => {
      if (!room.talkieWalkie || room.talkieWalkie.activeSpeakerId !== socket.id) {
        if (talkieTimers[targetRoomId]) {
          clearInterval(talkieTimers[targetRoomId]);
          delete talkieTimers[targetRoomId];
        }
        return;
      }

      room.talkieWalkie.timeRemaining -= 1;
      if (room.talkieWalkie.timeRemaining <= 0) {
        releaseTalkie(targetRoomId);
      } else {
        io.to(targetRoomId).emit('talkie_tick', {
          timeRemaining: room.talkieWalkie.timeRemaining,
        });
      }
    }, 1000);
  });

  // Talkie-Walkie: Release floor early
  socket.on('release_talkie', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const targetRoomId = currentRoomId;
    const room = rooms[targetRoomId];
    if (room.talkieWalkie?.activeSpeakerId === socket.id) {
      releaseTalkie(targetRoomId);
    }
  });

  // WebRTC Mesh Signaling Relay
  socket.on(
    'webrtc_signal',
    ({ targetPeerId, signalData }: { targetPeerId: string; signalData: any }) => {
      io.to(targetPeerId).emit('webrtc_signal', {
        senderPeerId: socket.id,
        signalData,
      });
    }
  );

  // Speaking indicator with strict privacy for Bobel night meetings
  socket.on('speaking_state', ({ isSpeaking }: { isSpeaking: boolean }) => {
    if (!currentRoomId || !rooms[currentRoomId] || !rooms[currentRoomId].players[socket.id]) return;
    const room = rooms[currentRoomId];
    if (!room.players[socket.id].isAlive) return;
    room.players[socket.id].isSpeaking = isSpeaking;

    if (room.phase === 'NIGHT_BOBEL') {
      // ONLY notify other Bobels! Non-Bobels are kept completely unaware of who is speaking!
      if (room.players[socket.id].role === 'BOBEL') {
        Object.values(room.players).forEach((p) => {
          if (p.role === 'BOBEL' && !p.isBot) {
            io.to(p.id).emit('player_speaking', { playerId: socket.id, isSpeaking });
          }
        });
      }
    } else {
      io.to(currentRoomId).emit('player_speaking', { playerId: socket.id, isSpeaking });
    }
  });

  // Player disconnects (with grace period for micro-cuts in active games)
  socket.on('disconnect', () => {
    if (currentRoomId && rooms[currentRoomId]) {
      const roomToLeave = currentRoomId;
      const departingId = socket.id;
      currentRoomId = null;

      // In Lobby, departure is immediate to allow real-time lobby updates
      if (rooms[roomToLeave].phase === 'LOBBY') {
        handlePlayerDeparture(departingId, roomToLeave);
      } else {
        // In active game, provide a 4.5s grace period for micro-cuts and automatic reconnection
        disconnectGraceTimers[departingId] = setTimeout(() => {
          delete disconnectGraceTimers[departingId];
          handlePlayerDeparture(departingId, roomToLeave);
        }, 4500);
      }
    }
  });
});

// Configure Vite integration
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`Ny Alin'ny Bibiolona server running on http://localhost:${PORT}`);
  });
}

startServer();

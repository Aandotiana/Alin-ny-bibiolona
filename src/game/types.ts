export type RoleType = 'BOBEL' | 'OLONA' | 'DADARABE' | 'MPAMOSAVY' | 'MPANGALATRA';

export type GamePhase =
  | 'LOBBY'
  | 'NIGHT_INTRO'
  | 'NIGHT_MPANGALATRA'
  | 'NIGHT_DADARABE'
  | 'NIGHT_BOBEL'
  | 'NIGHT_MPAMOSAVY'
  | 'DAY_REVEAL'
  | 'DAY_ELECTION'
  | 'DAY_DEBATE'
  | 'VOTE_DISCUSSION'
  | 'VOTE_CASTING'
  | 'DAY_VOTE'
  | 'DAY_EXECUTION'
  | 'GAME_OVER';

export interface Player {
  id: string; // Socket ID or bot ID
  name: string;
  avatar: string;
  isHost: boolean;
  isBot: boolean;
  isAlive: boolean;
  role?: RoleType;
  initialRole?: RoleType;
  isSefo: boolean; // Sefom-pokotany (Maire/Capitaine)
  hasUsedLifePotion?: boolean; // For Mpamosavy
  hasUsedDeathPotion?: boolean; // For Mpamosavy
  hasThiefActed?: boolean; // For Mpangalatra
  vote?: string | null; // ID of player voted for
  targetVictim?: string | null; // For Bobel or Mpamosavy
  inspectedRole?: { targetId: string; role: RoleType } | null; // For Dadarabe
  isSpeaking?: boolean;
  isMuted?: boolean;
}

export interface NightVictims {
  bobelTargetId: string | null;
  savedByPotion: boolean;
  poisonTargetId: string | null;
}

export interface TalkieWalkieState {
  activeSpeakerId: string | null;
  speakerName?: string;
  speakerAvatar?: string;
  timeRemaining: number;
}

export interface ChatMessage {
  id?: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  isAlive: boolean;
  message: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface GameState {
  roomId: string;
  phase: GamePhase;
  roundNumber: number;
  players: Record<string, Player>;
  nightOrder: GamePhase[];
  currentNightStepIndex: number;
  centerCards: RoleType[]; // Extra cards for Mpangalatra
  nightVictims: NightVictims;
  eliminatedTonight: string[];
  eliminatedToday: string | null;
  sefomPokotanyId: string | null;
  winner: 'VILLAGE' | 'BOBEL' | 'DRAW' | null;
  phaseTimeRemaining: number;
  narrationText: string;
  narrationMalagasy: string;
  talkieWalkie: TalkieWalkieState | null;
  chatMessages: ChatMessage[];
  historyLog: Array<{
    phase: GamePhase;
    round: number;
    text: string;
    timestamp: number;
  }>;
}

export interface RoleDefinition {
  type: RoleType;
  name: string;
  malagasyName: string;
  team: 'VILLAGE' | 'PREDATOR';
  description: string;
  malagasyDesc: string;
  iconName: string;
  badgeColor: string;
  awakensAtNight: boolean;
}

export const ROLE_DEFINITIONS: Record<RoleType, RoleDefinition> = {
  BOBEL: {
    type: 'BOBEL',
    name: 'Bobel (Loup-Garou)',
    malagasyName: 'Bobel (Bibiolona)',
    team: 'PREDATOR',
    description: 'Prédateur nocturne terrifiant du folklore malgache. Se réveille la nuit avec ses congénères pour dévorer un villageois. Canal vocal secret actif la nuit.',
    malagasyDesc: 'Bibiolona masiaka amin\'ny alina. Mifoha miaraka amin\'ny namany mba hihaza sy hifidy izay hohanina. Miresaka mangingina amin\'ny feo.',
    iconName: 'MoonStar',
    badgeColor: 'bg-red-950 text-red-200 border-red-700',
    awakensAtNight: true,
  },
  OLONA: {
    type: 'OLONA',
    name: 'Olona (Villageois)',
    malagasyName: 'Olona tsotra',
    team: 'VILLAGE',
    description: 'Simple habitant du village. Dort paisiblement la nuit. Participe activement aux débats et aux votes le jour pour démasquer les Bobel.',
    malagasyDesc: 'Mponina tsotra ao an-tanàna. Matory milamina amin\'ny alina. Mandray anjara amin\'ny fivoriana sy latsa-bato amin\'ny andro.',
    iconName: 'Home',
    badgeColor: 'bg-amber-950 text-amber-200 border-amber-700',
    awakensAtNight: false,
  },
  DADARABE: {
    type: 'DADARABE',
    name: 'Dadarabe (La Voyante)',
    malagasyName: 'Dadarabe (Mpamantatra)',
    team: 'VILLAGE',
    description: 'Le sage ancien et devin. Chaque nuit, il peut sonder les esprits et découvrir le rôle secret d\'un joueur de son choix.',
    malagasyDesc: 'Olo-kendry sy mpitazana fambara. Isan\'alina dia afaka mahita ny tena toetry ny mpilalao iray tiany hofidina.',
    iconName: 'Eye',
    badgeColor: 'bg-indigo-950 text-indigo-200 border-indigo-700',
    awakensAtNight: true,
  },
  MPAMOSAVY: {
    type: 'MPAMOSAVY',
    name: 'Mpamosavy (La Sorcière)',
    malagasyName: 'Mpamosavy / Mpanasitrana',
    team: 'VILLAGE',
    description: 'Maîtresse des potions mystiques. Possède une Potion de Vie (pour sauver la victime des Bobel) et une Potion de Mort (pour éliminer un suspect). Chacune utilisable 1 fois par partie.',
    malagasyDesc: 'Mpamorona fanafody mahery vaika. Manana fanafody famonjena aina 1 sy fanafody fanesorana 1.',
    iconName: 'FlaskConical',
    badgeColor: 'bg-purple-950 text-purple-200 border-purple-700',
    awakensAtNight: true,
  },
  MPANGALATRA: {
    type: 'MPANGALATRA',
    name: 'Mpangalatra (Le Voleur)',
    malagasyName: 'Mpangalatra',
    team: 'VILLAGE',
    description: 'Rôdeur agile. Lors de la première nuit (Nuit 0), il peut découvrir les cartes restantes non distribuées et échanger son rôle s\'il le souhaite.',
    malagasyDesc: 'Mpilalao mailaka. Amin\'ny alina voalohany dia afaka mijery ny karatra sisa tavela ka manakalo ny anjarany raha tiany.',
    iconName: 'Mask',
    badgeColor: 'bg-emerald-950 text-emerald-200 border-emerald-700',
    awakensAtNight: true,
  },
};

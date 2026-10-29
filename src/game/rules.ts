import type { GamePhase, NightVictims, Player, RoleType } from './types.ts';

/**
 * Fisher-Yates array shuffle (deterministic with random seed or standard Math.random)
 */
export function shuffleArray<T>(array: T[], rng = Math.random): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Build deck of roles according to player count:
 * - Always 1 Bobel if 4-5 players, 2 Bobels if 6-8 players, 3 Bobels if 9+ players.
 * - Always 1 Dadarabe (Voyante) if >= 4 players.
 * - Always 1 Mpamosavy (Sorcière) if >= 5 players.
 * - If includeThief (Mpangalatra), adds Mpangalatra and 2 extra cards to centerCards.
 * - Rest filled with Olona (Villageois).
 */
export function buildRoleDeck(
  playerCount: number,
  includeThief: boolean = false
): { playerRoles: RoleType[]; centerCards: RoleType[]; fullDeck?: RoleType[] } {
  if (playerCount < 4) {
    throw new Error("Il faut au moins 4 joueurs pour jouer à Ny Alin'ny Bibiolona.");
  }

  const bobelCount = playerCount >= 9 ? 3 : playerCount >= 6 ? 2 : 1;
  const roles: RoleType[] = [];

  for (let i = 0; i < bobelCount; i++) {
    roles.push('BOBEL');
  }
  roles.push('DADARABE');

  if (playerCount >= 5) {
    roles.push('MPAMOSAVY');
  }

  if (includeThief && playerCount >= 4) {
    roles.push('MPANGALATRA');
    // Le voleur ajoute 2 cartes supplémentaires au jeu (N + 2 cartes au total)
    while (roles.length < playerCount + 2) {
      roles.push('OLONA');
    }
    return {
      playerRoles: roles.slice(0, playerCount),
      centerCards: roles.slice(playerCount),
      fullDeck: roles,
    };
  }

  // Complete player deck with Olona
  while (roles.length < playerCount) {
    roles.push('OLONA');
  }

  return { playerRoles: roles, centerCards: [] };
}

/**
 * Assign roles strictly (1 player = 1 unique role) with complete randomness
 */
export function assignRolesToPlayers(
  playersList: Player[],
  includeThief: boolean = false,
  rng = Math.random
): { players: Player[]; centerCards: RoleType[] } {
  const { playerRoles, centerCards, fullDeck } = buildRoleDeck(playersList.length, includeThief);

  let distributedPlayerRoles: RoleType[];
  let finalCenterCards: RoleType[];

  if (includeThief && fullDeck) {
    // Mélanger l'ensemble des N+2 cartes ensemble pour une vraie incertitude
    const shuffledAll = shuffleArray(fullDeck, rng);
    distributedPlayerRoles = shuffledAll.slice(0, playersList.length);
    finalCenterCards = shuffledAll.slice(playersList.length);
  } else {
    distributedPlayerRoles = shuffleArray(playerRoles, rng);
    finalCenterCards = shuffleArray(centerCards, rng);
  }

  const updatedPlayers = playersList.map((player, idx) => ({
    ...player,
    role: distributedPlayerRoles[idx],
    initialRole: distributedPlayerRoles[idx],
    isAlive: true,
    isSefo: false,
    hasUsedLifePotion: false,
    hasUsedDeathPotion: false,
    hasThiefActed: false,
    vote: null,
    targetVictim: null,
    inspectedRole: null,
  }));

  return { players: updatedPlayers, centerCards: finalCenterCards };
}

/**
 * Determine ordered steps for the night according to alive roles and round number
 */
export function determineNightSteps(
  round: number,
  players: Record<string, Player>
): GamePhase[] {
  const steps: GamePhase[] = ['NIGHT_INTRO'];
  const alivePlayers = Object.values(players).filter((p) => p.isAlive);

  // Mpangalatra acts only on round 1 (Night 0/1)
  const hasAliveMpangalatra = alivePlayers.some((p) => p.role === 'MPANGALATRA' && !p.hasThiefActed);
  if (round === 1 && hasAliveMpangalatra) {
    steps.push('NIGHT_MPANGALATRA');
  }

  // Dadarabe (Voyante)
  const hasAliveDadarabe = alivePlayers.some((p) => p.role === 'DADARABE');
  if (hasAliveDadarabe) {
    steps.push('NIGHT_DADARABE');
  }

  // Bobel (Loup-Garou)
  const hasAliveBobel = alivePlayers.some((p) => p.role === 'BOBEL');
  if (hasAliveBobel) {
    steps.push('NIGHT_BOBEL');
  }

  // Mpamosavy (Sorcière)
  const hasAliveMpamosavy = alivePlayers.some((p) => p.role === 'MPAMOSAVY');
  if (hasAliveMpamosavy) {
    steps.push('NIGHT_MPAMOSAVY');
  }

  return steps;
}

/**
 * Resolve Bobels' target based on votes from alive Bobel players
 */
export function resolveBobelTarget(players: Record<string, Player>): string | null {
  const aliveBobels = Object.values(players).filter((p) => p.isAlive && p.role === 'BOBEL');
  if (aliveBobels.length === 0) return null;

  const targetVotes: Record<string, number> = {};
  for (const bobel of aliveBobels) {
    if (bobel.targetVictim && players[bobel.targetVictim]?.isAlive) {
      targetVotes[bobel.targetVictim] = (targetVotes[bobel.targetVictim] || 0) + 1;
    }
  }

  let topTarget: string | null = null;
  let maxVotes = 0;
  for (const [targetId, votes] of Object.entries(targetVotes)) {
    if (votes > maxVotes) {
      maxVotes = votes;
      topTarget = targetId;
    }
  }

  return topTarget;
}

/**
 * Compute the casualties of the night based on Bobel hunt and Mpamosavy potions
 */
export function calculateNightDeaths(
  nightVictims: NightVictims,
  players: Record<string, Player>
): string[] {
  const deaths = new Set<string>();

  // If Bobel attacked someone and not saved by Potion of Life
  if (
    nightVictims.bobelTargetId &&
    !nightVictims.savedByPotion &&
    players[nightVictims.bobelTargetId]?.isAlive
  ) {
    deaths.add(nightVictims.bobelTargetId);
  }

  // If Mpamosavy used Potion of Death
  if (
    nightVictims.poisonTargetId &&
    players[nightVictims.poisonTargetId]?.isAlive
  ) {
    deaths.add(nightVictims.poisonTargetId);
  }

  return Array.from(deaths);
}

/**
 * Tally day village votes.
 * Sefom-pokotany's vote counts for 2 (or serves as tie-breaker).
 */
export function tallyVotes(
  players: Record<string, Player>,
  sefomPokotanyId: string | null
): {
  winnerId: string | null;
  voteCounts: Record<string, number>;
  isTie: boolean;
} {
  const alivePlayers = Object.values(players).filter((p) => p.isAlive);
  const voteCounts: Record<string, number> = {};

  // Initialize vote counts for all alive candidates
  alivePlayers.forEach((p) => {
    voteCounts[p.id] = 0;
  });

  alivePlayers.forEach((voter) => {
    if (voter.vote && voteCounts[voter.vote] !== undefined) {
      // If voter is Sefom-Pokotany, their vote weight is 2 (as specified in rule: counts double in case of equality)
      const weight = voter.id === sefomPokotanyId ? 2 : 1;
      voteCounts[voter.vote] += weight;
    }
  });

  let highestVotes = 0;
  let topCandidates: string[] = [];

  for (const [targetId, votes] of Object.entries(voteCounts)) {
    if (votes > highestVotes) {
      highestVotes = votes;
      topCandidates = [targetId];
    } else if (votes === highestVotes && votes > 0) {
      topCandidates.push(targetId);
    }
  }

  if (highestVotes === 0 || topCandidates.length === 0) {
    return { winnerId: null, voteCounts, isTie: false };
  }

  if (topCandidates.length === 1) {
    return { winnerId: topCandidates[0], voteCounts, isTie: false };
  }

  // If there is still a tie, check if Sefom-pokotany voted for one of the tied candidates
  if (sefomPokotanyId && players[sefomPokotanyId]?.isAlive) {
    const sefoVote = players[sefomPokotanyId].vote;
    if (sefoVote && topCandidates.includes(sefoVote)) {
      return { winnerId: sefoVote, voteCounts, isTie: false };
    }
  }

  // Equality persists: no one eliminated
  return { winnerId: null, voteCounts, isTie: true };
}

/**
 * Check win condition
 * Village wins if all Bobels are dead.
 * Bobels win if Bobel count >= Village alive count.
 * Draw if all players are dead.
 */
export function checkWinCondition(
  players: Record<string, Player>
): 'VILLAGE' | 'BOBEL' | 'DRAW' | null {
  const allPlayers = Object.values(players);
  if (allPlayers.length === 0) return null;

  // If roles have not been assigned yet, never declare game over
  const playersWithRoles = allPlayers.filter((p) => p.role !== undefined || p.initialRole !== undefined);
  if (playersWithRoles.length === 0) {
    return null;
  }

  // Ensure game originally had at least one Bobel assigned before checking Bobel extinction
  const hadBobel = allPlayers.some((p) => p.role === 'BOBEL' || p.initialRole === 'BOBEL');
  if (!hadBobel) {
    return null;
  }

  const alive = allPlayers.filter((p) => p.isAlive);

  if (alive.length === 0) {
    return 'DRAW';
  }

  const aliveBobels = alive.filter((p) => p.role === 'BOBEL');
  const aliveVillage = alive.filter((p) => p.role !== 'BOBEL');

  if (aliveBobels.length === 0) {
    return 'VILLAGE';
  }

  if (aliveBobels.length >= aliveVillage.length) {
    return 'BOBEL';
  }

  return null;
}

/**
 * Determines whether a joining player should be host.
 * If there are NO other human players in the room, they become host.
 * If an existing human player is already host, they do not.
 * If human players exist but none is marked host, the first human becomes host.
 */
export function determineIsHostOnJoin(
  players: Record<string, Partial<Player>>,
  joiningPlayerId: string
): boolean {
  const existingHumans = Object.values(players).filter(
    (p) => !p.isBot && p.id && p.id !== joiningPlayerId
  );
  if (existingHumans.length === 0) {
    return true;
  }
  const hasExistingHost = existingHumans.some((p) => p.isHost);
  return !hasExistingHost;
}

/**
 * Handles host departure or player leaving:
 * - If NO human players remain in the room (only bots or 0 players), the room should be dissolved.
 * - If human players remain and the leaving player was the host (or no host is set),
 *   the host role is automatically transferred to the next human player (never a bot/AI).
 */
export function transferHostOrDissolve(
  players: Record<string, Partial<Player>>,
  leavingPlayerId: string
): {
  newHostId: string | null;
  shouldDissolve: boolean;
  remainingHumanCount: number;
} {
  const remainingPlayers = Object.values(players).filter(
    (p) => p.id && p.id !== leavingPlayerId
  );
  const remainingHumans = remainingPlayers.filter((p) => !p.isBot);

  if (remainingHumans.length === 0) {
    return {
      newHostId: null,
      shouldDissolve: true,
      remainingHumanCount: 0,
    };
  }

  const leavingPlayer = players[leavingPlayerId];
  const wasHost = leavingPlayer?.isHost ?? false;
  const currentHost = remainingHumans.find((p) => p.isHost);

  if (wasHost || !currentHost) {
    // Transfer to the first available human player (strictly not a bot)
    const newHost = remainingHumans[0];
    return {
      newHostId: newHost.id || null,
      shouldDissolve: false,
      remainingHumanCount: remainingHumans.length,
    };
  }

  return {
    newHostId: currentHost.id || null,
    shouldDissolve: false,
    remainingHumanCount: remainingHumans.length,
  };
}

/**
 * Validates server actions to prevent forbidden or illegal moves:
 * - Ensures target exists and is alive
 * - Prevents self-targeting for execution votes and inspections
 * - Prevents Bobels from devouring fellow Bobels
 */
export function validateActionTarget(
  action: 'BOBEL_TARGET' | 'DADARABE_INSPECT' | 'MPAMOSAVY_POISON' | 'DAY_VOTE' | 'DAY_ELECTION',
  actorId: string,
  targetId: string | null | undefined,
  players: Record<string, Partial<Player>>
): { valid: boolean; reason?: string } {
  // Abstaining is valid in day votes
  if (!targetId && (action === 'DAY_VOTE' || action === 'DAY_ELECTION')) {
    return { valid: true };
  }

  if (!targetId || !players[targetId]) {
    return { valid: false, reason: 'Cible introuvable dans le village.' };
  }

  const target = players[targetId];
  if (!target.isAlive) {
    return { valid: false, reason: 'Impossible de cibler un joueur déjà éliminé.' };
  }

  if (action === 'BOBEL_TARGET') {
    if (target.role === 'BOBEL') {
      return { valid: false, reason: 'Un Bobel ne peut pas chasser un autre Bobel de sa meute.' };
    }
    if (targetId === actorId) {
      return { valid: false, reason: 'Un Bobel ne peut pas se dévorer lui-même.' };
    }
  }

  if (action === 'DADARABE_INSPECT') {
    if (targetId === actorId) {
      return { valid: false, reason: 'Dadarabe ne peut pas sonder son propre esprit.' };
    }
  }

  if (action === 'MPAMOSAVY_POISON') {
    if (targetId === actorId) {
      return { valid: false, reason: 'La Mpamosavy ne peut pas s\'empoisonner elle-même.' };
    }
  }

  if (action === 'DAY_VOTE') {
    if (targetId === actorId) {
      return { valid: false, reason: 'Un habitant ne peut pas voter contre lui-même lors du jugement.' };
    }
  }

  return { valid: true };
}

/**
 * Smart Bobel Pack Target selection:
 * Bobels coordinate together. If another Bobel already chose an alive target,
 * subsequent Bobel bots join the vote to avoid splitting the pack.
 */
export function getSmartBotBobelTarget(
  botId: string,
  players: Record<string, Player>
): string | null {
  const alivePlayers = Object.values(players).filter((p) => p.isAlive);
  const eligiblePrey = alivePlayers.filter((p) => p.role !== 'BOBEL' && p.id !== botId);
  if (eligiblePrey.length === 0) return null;

  // 1. Check if another Bobel has already targeted an alive eligible prey
  const otherBobels = alivePlayers.filter((p) => p.role === 'BOBEL' && p.id !== botId);
  for (const b of otherBobels) {
    if (b.targetVictim && eligiblePrey.some((p) => p.id === b.targetVictim)) {
      return b.targetVictim;
    }
  }

  // 2. High-value priority: Dadarabe or Sefom-pokotany
  const priorityTarget = eligiblePrey.find((p) => p.role === 'DADARABE' || p.isSefo);
  if (priorityTarget && Math.random() < 0.65) {
    return priorityTarget.id;
  }

  // 3. Human player priority for exciting gameplay (50% bias)
  const humanPrey = eligiblePrey.filter((p) => !p.isBot);
  if (humanPrey.length > 0 && Math.random() < 0.5) {
    return humanPrey[Math.floor(Math.random() * humanPrey.length)].id;
  }

  // 4. Default random eligible prey
  return eligiblePrey[Math.floor(Math.random() * eligiblePrey.length)].id;
}

/**
 * Smart Dadarabe Inspection:
 * Inspects an alive player not yet inspected, prioritizing human or mysterious players.
 */
export function getSmartBotDadarabeInspect(
  botId: string,
  players: Record<string, Player>,
  alreadyInspectedIds: string[] = []
): string | null {
  const aliveOthers = Object.values(players).filter((p) => p.isAlive && p.id !== botId);
  if (aliveOthers.length === 0) return null;

  const notYetInspected = aliveOthers.filter((p) => !alreadyInspectedIds.includes(p.id));
  const pool = notYetInspected.length > 0 ? notYetInspected : aliveOthers;

  // Prioritize humans to assist the game dynamic
  const humanPool = pool.filter((p) => !p.isBot);
  if (humanPool.length > 0 && Math.random() < 0.6) {
    return humanPool[Math.floor(Math.random() * humanPool.length)].id;
  }

  return pool[Math.floor(Math.random() * pool.length)].id;
}

/**
 * Smart Day Vote selection:
 * - Bobels NEVER vote against Bobels unless they are sacrificing a lone teammate to disguise themselves.
 * - Villagers who know Bobels (e.g. Dadarabe) vote against the discovered Bobel.
 * - Follows general suspicion patterns instead of pure blind randomness.
 */
export function getSmartBotDayVote(
  botId: string,
  players: Record<string, Player>,
  knownBobelIds: string[] = [],
  isElection: boolean = false
): string | null {
  const me = players[botId];
  if (!me || !me.isAlive) return null;

  const alivePlayers = Object.values(players).filter((p) => p.isAlive);
  if (isElection) {
    // In Sefo election, bot votes for itself or a respected village member
    if (Math.random() < 0.45) return botId;
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
  }

  // In Execution vote, candidates must NOT be oneself
  const candidates = alivePlayers.filter((p) => p.id !== botId);
  if (candidates.length === 0) return null;

  const isBobel = me.role === 'BOBEL';

  if (isBobel) {
    // Bobel bots vote against a NON-BOBEL to protect the pack
    const nonBobelCandidates = candidates.filter((p) => p.role !== 'BOBEL');
    if (nonBobelCandidates.length > 0) {
      // Coordinate against candidate with most existing votes
      const voteCounts: Record<string, number> = {};
      alivePlayers.forEach((p) => {
        if (p.vote && nonBobelCandidates.some((c) => c.id === p.vote)) {
          voteCounts[p.vote] = (voteCounts[p.vote] || 0) + 1;
        }
      });
      let topTarget: string | null = null;
      let maxVotes = 0;
      for (const [id, count] of Object.entries(voteCounts)) {
        if (count > maxVotes) {
          maxVotes = count;
          topTarget = id;
        }
      }
      if (topTarget && Math.random() < 0.7) return topTarget;
      return nonBobelCandidates[Math.floor(Math.random() * nonBobelCandidates.length)].id;
    }
  } else {
    // Village bots: If Dadarabe revealed a Bobel or bot knows a Bobel, target that Bobel!
    const activeKnownBobels = candidates.filter((p) => knownBobelIds.includes(p.id));
    if (activeKnownBobels.length > 0 && Math.random() < 0.85) {
      return activeKnownBobels[0].id;
    }

    // Follow Sefom-pokotany or highest suspected target
    const currentVotes: Record<string, number> = {};
    alivePlayers.forEach((p) => {
      if (p.vote && candidates.some((c) => c.id === p.vote)) {
        currentVotes[p.vote] = (currentVotes[p.vote] || 0) + (p.isSefo ? 2 : 1);
      }
    });
    let topSuspect: string | null = null;
    let maxVotes = 0;
    for (const [id, count] of Object.entries(currentVotes)) {
      if (count > maxVotes) {
        maxVotes = count;
        topSuspect = id;
      }
    }
    if (topSuspect && Math.random() < 0.6) {
      return topSuspect;
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

/**
 * Authentic Malagasy & French dialogues for AI village bots during debates
 */
export function generateBotDebateDialogue(
  bot: Player,
  players: Record<string, Player>,
  knownBobelId?: string | null
): string {
  const aliveOthers = Object.values(players).filter((p) => p.isAlive && p.id !== bot.id);
  const randomSuspect = aliveOthers[Math.floor(Math.random() * aliveOthers.length)]?.name || 'olona iray';

  if (bot.role === 'DADARABE' && knownBobelId && players[knownBobelId]?.isAlive) {
    const bobelName = players[knownBobelId].name;
    const dadarabeLines = [
      `🔮 Hitako tamin'ny sikidy: i ${bobelName} dia Bobel mpiremby! (Mes présages révèlent que ${bobelName} est un Bobel !)`,
      `🔮 Tsy mandainga ny fambara: mampiahiahy loatra i ${bobelName}, aza mangina fokonolona! (Les esprits désignent ${bobelName} !)`,
    ];
    return dadarabeLines[Math.floor(Math.random() * dadarabeLines.length)];
  }

  if (bot.role === 'BOBEL') {
    const bobelBluffLines = [
      `🌾 Tsy izaho mihitsy no bibiolona! Nahoana i ${randomSuspect} no mibanjina ahy hafahafa? (Je suis un simple villageois, observez plutôt ${randomSuspect} !)`,
      `🛖 Arovy ny tanàna fa aza mandatsaka olona tsy manan-tsiny! (Ne tuez pas un innocent, cherchons le vrai loup !)`,
      `👀 Miahiahy an'i ${randomSuspect} aho, tsy nandray fitenenana mihitsy izy! (Je suspecte ${randomSuspect}, pourquoi reste-t-il si calme ?)`,
    ];
    return bobelBluffLines[Math.floor(Math.random() * bobelBluffLines.length)];
  }

  // Simple villager lines
  const villagerLines = [
    `🌾 Miahiahy an'i ${randomSuspect} aho, hafahafa ny fihetsiny omaly hariva. (J'ai des doutes sur ${randomSuspect}, son attitude était étrange hier soir.)`,
    `⚖️ Andao hiray saina ny Fokonolona, iza no tena mampiahiahy? (Unissons nos voix, qui a entendu des bruits cette nuit ?)`,
    `🛖 Tsy maintsy vonoina ny Bobel mba handry feizay ny tanàna! (Le village doit démasquer le Bobel avant la prochaine nuit !)`,
    `🔥 Tsy izaho no meloka, matory milamina foana aho rehefa alina. (Je suis innocent, j'ai dormi paisiblement toute la nuit.)`,
  ];
  return villagerLines[Math.floor(Math.random() * villagerLines.length)];
}

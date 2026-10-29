import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRoleDeck,
  assignRolesToPlayers,
  resolveBobelTarget,
  calculateNightDeaths,
  tallyVotes,
  checkWinCondition,
  determineNightSteps,
  determineIsHostOnJoin,
  transferHostOrDissolve,
  validateActionTarget,
  getSmartBotBobelTarget,
  getSmartBotDadarabeInspect,
  getSmartBotDayVote,
  generateBotDebateDialogue,
} from './rules.ts';
import type { Player, RoleType } from './types.ts';

const mockPlayer = (id: string, name: string, role?: RoleType): Player => ({
  id,
  name,
  avatar: '🐺',
  isHost: false,
  isBot: false,
  isAlive: true,
  role,
  initialRole: role,
  isSefo: false,
  vote: null,
  targetVictim: null,
});

test('buildRoleDeck distributes correct roles based on player count', () => {
  const deck4 = buildRoleDeck(4, false);
  assert.equal(deck4.playerRoles.length, 4);
  assert.equal(deck4.playerRoles.filter((r) => r === 'BOBEL').length, 1);
  assert.equal(deck4.playerRoles.filter((r) => r === 'DADARABE').length, 1);
  assert.equal(deck4.playerRoles.filter((r) => r === 'OLONA').length, 2);

  const deck6 = buildRoleDeck(6, true);
  assert.equal(deck6.playerRoles.length, 6);
  assert.equal(deck6.playerRoles.filter((r) => r === 'BOBEL').length, 2);
  assert.equal(deck6.playerRoles.filter((r) => r === 'MPAMOSAVY').length, 1);
  assert.equal(deck6.playerRoles.filter((r) => r === 'MPANGALATRA').length, 1);
  assert.equal(deck6.centerCards.length, 2);
});

test('assignRolesToPlayers ensures strict 1 role per player', () => {
  const players = [
    mockPlayer('p1', 'Koto'),
    mockPlayer('p2', 'Soa'),
    mockPlayer('p3', 'Rabe'),
    mockPlayer('p4', 'Bako'),
    mockPlayer('p5', 'Naivo'),
  ];
  const { players: assigned } = assignRolesToPlayers(players, false);
  assert.equal(assigned.length, 5);
  assigned.forEach((p) => {
    assert.ok(p.role, `Player ${p.name} must have a role assigned`);
  });
  const roles = assigned.map((p) => p.role);
  assert.ok(roles.includes('BOBEL'));
  assert.ok(roles.includes('DADARABE'));
  assert.ok(roles.includes('MPAMOSAVY'));
});

test('determineNightSteps includes Mpangalatra on round 1 and skips when absent', () => {
  const players: Record<string, Player> = {
    p1: mockPlayer('p1', 'Bobel', 'BOBEL'),
    p2: mockPlayer('p2', 'Dadarabe', 'DADARABE'),
    p3: mockPlayer('p3', 'Thief', 'MPANGALATRA'),
    p4: mockPlayer('p4', 'Witch', 'MPAMOSAVY'),
  };

  const stepsR1 = determineNightSteps(1, players);
  assert.deepEqual(stepsR1, [
    'NIGHT_INTRO',
    'NIGHT_MPANGALATRA',
    'NIGHT_DADARABE',
    'NIGHT_BOBEL',
    'NIGHT_MPAMOSAVY',
  ]);

  const stepsR2 = determineNightSteps(2, players);
  assert.deepEqual(stepsR2, [
    'NIGHT_INTRO',
    'NIGHT_DADARABE',
    'NIGHT_BOBEL',
    'NIGHT_MPAMOSAVY',
  ]);
});

test('resolveBobelTarget elects top target from alive Bobels', () => {
  const players: Record<string, Player> = {
    b1: { ...mockPlayer('b1', 'Bobel 1', 'BOBEL'), targetVictim: 'v1' },
    b2: { ...mockPlayer('b2', 'Bobel 2', 'BOBEL'), targetVictim: 'v1' },
    v1: mockPlayer('v1', 'Victim 1', 'OLONA'),
    v2: mockPlayer('v2', 'Victim 2', 'OLONA'),
  };

  const target = resolveBobelTarget(players);
  assert.equal(target, 'v1');
});

test('calculateNightDeaths handles healing and poisoning', () => {
  const players: Record<string, Player> = {
    p1: mockPlayer('p1', 'Target 1', 'OLONA'),
    p2: mockPlayer('p2', 'Target 2', 'OLONA'),
  };

  // Target 1 attacked, not healed
  const deaths1 = calculateNightDeaths(
    { bobelTargetId: 'p1', savedByPotion: false, poisonTargetId: null },
    players
  );
  assert.deepEqual(deaths1, ['p1']);

  // Target 1 attacked, saved by potion
  const deaths2 = calculateNightDeaths(
    { bobelTargetId: 'p1', savedByPotion: true, poisonTargetId: null },
    players
  );
  assert.deepEqual(deaths2, []);

  // Target 1 attacked & saved, but Target 2 poisoned
  const deaths3 = calculateNightDeaths(
    { bobelTargetId: 'p1', savedByPotion: true, poisonTargetId: 'p2' },
    players
  );
  assert.deepEqual(deaths3, ['p2']);
});

test('tallyVotes correctly breaks ties with Sefom-Pokotany', () => {
  const players: Record<string, Player> = {
    p1: { ...mockPlayer('p1', 'P1', 'OLONA'), vote: 'p3' },
    p2: { ...mockPlayer('p2', 'P2', 'OLONA'), vote: 'p4' },
    p3: mockPlayer('p3', 'P3', 'OLONA'),
    p4: mockPlayer('p4', 'P4', 'OLONA'),
  };

  // Without Sefo vote: 1 vs 1 tie
  const resTie = tallyVotes(players, null);
  assert.equal(resTie.winnerId, null);
  assert.equal(resTie.isTie, true);

  // If p1 is Sefo, p1 vote for p3 has weight 2 -> p3 eliminated
  const resSefo = tallyVotes(players, 'p1');
  assert.equal(resSefo.winnerId, 'p3');
  assert.equal(resSefo.isTie, false);
});

test('checkWinCondition identifies Village and Bobel victory', () => {
  const villageWins: Record<string, Player> = {
    p1: { ...mockPlayer('p1', 'P1', 'BOBEL'), isAlive: false },
    p2: { ...mockPlayer('p2', 'P2', 'OLONA'), isAlive: true },
    p3: { ...mockPlayer('p3', 'P3', 'DADARABE'), isAlive: true },
  };
  assert.equal(checkWinCondition(villageWins), 'VILLAGE');

  const bobelWins: Record<string, Player> = {
    p1: { ...mockPlayer('p1', 'P1', 'BOBEL'), isAlive: true },
    p2: { ...mockPlayer('p2', 'P2', 'OLONA'), isAlive: true },
  };
  assert.equal(checkWinCondition(bobelWins), 'BOBEL');

  const ongoing: Record<string, Player> = {
    p1: { ...mockPlayer('p1', 'P1', 'BOBEL'), isAlive: true },
    p2: { ...mockPlayer('p2', 'P2', 'OLONA'), isAlive: true },
    p3: { ...mockPlayer('p3', 'P3', 'OLONA'), isAlive: true },
  };
  assert.equal(checkWinCondition(ongoing), null);
});

test('determineIsHostOnJoin assigns host to first human and not subsequent humans', () => {
  // First human player entering empty room or room with only bots
  assert.equal(determineIsHostOnJoin({}, 'p1'), true);
  assert.equal(determineIsHostOnJoin({ bot1: { id: 'bot1', isBot: true, isHost: false } }, 'p1'), true);

  // Second human joining room that already has a human host
  const roomWithHost = {
    p1: { id: 'p1', isBot: false, isHost: true },
    bot1: { id: 'bot1', isBot: true, isHost: false },
  };
  assert.equal(determineIsHostOnJoin(roomWithHost, 'p2'), false);
});

test('transferHostOrDissolve transfers to next human player in priority and never a bot', () => {
  const room = {
    host: { id: 'host', name: 'Andry', isHost: true, isBot: false },
    human2: { id: 'human2', name: 'Soa', isHost: false, isBot: false },
    bot1: { id: 'bot1', name: 'Bot_1', isHost: false, isBot: true },
    bot2: { id: 'bot2', name: 'Bot_2', isHost: false, isBot: true },
  };

  // Host leaves: must transfer to human2, NOT bot1 or bot2
  const transferRes = transferHostOrDissolve(room, 'host');
  assert.equal(transferRes.shouldDissolve, false);
  assert.equal(transferRes.newHostId, 'human2');
  assert.equal(transferRes.remainingHumanCount, 1);
});

test('transferHostOrDissolve dissolves room if no human players remain', () => {
  const roomOnlyBotsLeft = {
    host: { id: 'host', name: 'Andry', isHost: true, isBot: false },
    bot1: { id: 'bot1', name: 'Bot_1', isHost: false, isBot: true },
    bot2: { id: 'bot2', name: 'Bot_2', isHost: false, isBot: true },
  };

  const dissolveRes = transferHostOrDissolve(roomOnlyBotsLeft, 'host');
  assert.equal(dissolveRes.shouldDissolve, true);
  assert.equal(dissolveRes.newHostId, null);
  assert.equal(dissolveRes.remainingHumanCount, 0);
});

test('4-human player start initializes with null win condition (not instant game over)', () => {
  const fourHumans = [
    mockPlayer('h1', 'Player 1'),
    mockPlayer('h2', 'Player 2'),
    mockPlayer('h3', 'Player 3'),
    mockPlayer('h4', 'Player 4'),
  ];

  const { players: assigned } = assignRolesToPlayers(fourHumans, false);
  const playerMap: Record<string, Player> = {};
  assigned.forEach((p) => {
    playerMap[p.id] = p;
  });

  // Verify roles
  const bobels = Object.values(playerMap).filter((p) => p.role === 'BOBEL');
  const villagers = Object.values(playerMap).filter((p) => p.role !== 'BOBEL');
  assert.equal(bobels.length, 1, '4-player game must have exactly 1 Bobel');
  assert.equal(villagers.length, 3, '4-player game must have 3 village members');

  // Verify win condition at game start is null (game must not finish instantly)
  const initialWin = checkWinCondition(playerMap);
  assert.equal(initialWin, null, 'Game must not finish instantly at start with 4 players');
});

test('substituting departed player with bot maintains active game without instant termination', () => {
  const playerMap: Record<string, Player> = {
    h1: { ...mockPlayer('h1', 'Player 1', 'BOBEL'), isBot: false },
    h2: { ...mockPlayer('h2', 'Player 2', 'DADARABE'), isBot: false },
    h3: { ...mockPlayer('h3', 'Player 3', 'OLONA'), isBot: false },
    h4: { ...mockPlayer('h4', 'Player 4', 'OLONA'), isBot: false },
  };

  // Suppose h4 leaves: instead of deleting, converting to Bot keeps game alive
  playerMap.h4.isBot = true;
  playerMap.h4.name = 'Player 4 (IA)';

  const win = checkWinCondition(playerMap);
  assert.equal(win, null, 'Converting to bot preserves game state without triggering premature game over');
});

test('checkWinCondition returns null when roles are unassigned or before game start', () => {
  const unassignedLobby: Record<string, Player> = {
    p1: mockPlayer('p1', 'Player 1'),
    p2: mockPlayer('p2', 'Player 2'),
    p3: mockPlayer('p3', 'Player 3'),
    p4: mockPlayer('p4', 'Player 4'),
  };

  assert.equal(checkWinCondition(unassignedLobby), null, 'Lobby with unassigned roles must not trigger victory');
  assert.equal(checkWinCondition({}), null, 'Empty player map must return null');
});

test('validateActionTarget prevents illegal actions and self-targeting', () => {
  const players: Record<string, Player> = {
    b1: mockPlayer('b1', 'Bobel 1', 'BOBEL'),
    b2: mockPlayer('b2', 'Bobel 2', 'BOBEL'),
    v1: mockPlayer('v1', 'Villager 1', 'OLONA'),
    dead1: { ...mockPlayer('dead1', 'Dead', 'OLONA'), isAlive: false },
  };

  // Bobel targeting fellow Bobel -> REJECTED
  const resFellowBobel = validateActionTarget('BOBEL_TARGET', 'b1', 'b2', players);
  assert.equal(resFellowBobel.valid, false);

  // Bobel targeting themselves -> REJECTED
  const resSelfBobel = validateActionTarget('BOBEL_TARGET', 'b1', 'b1', players);
  assert.equal(resSelfBobel.valid, false);

  // Bobel targeting dead player -> REJECTED
  const resDeadTarget = validateActionTarget('BOBEL_TARGET', 'b1', 'dead1', players);
  assert.equal(resDeadTarget.valid, false);

  // Bobel targeting alive villager -> ACCEPTED
  const resValidBobel = validateActionTarget('BOBEL_TARGET', 'b1', 'v1', players);
  assert.equal(resValidBobel.valid, true);

  // Day vote against oneself in execution -> REJECTED
  const resSelfVote = validateActionTarget('DAY_VOTE', 'v1', 'v1', players);
  assert.equal(resSelfVote.valid, false);

  // Day vote abstain (null or '') -> ACCEPTED
  const resAbstain = validateActionTarget('DAY_VOTE', 'v1', null, players);
  assert.equal(resAbstain.valid, true);

  // Dadarabe self-inspect -> REJECTED
  const resSelfInspect = validateActionTarget('DADARABE_INSPECT', 'v1', 'v1', players);
  assert.equal(resSelfInspect.valid, false);
});

test('getSmartBotBobelTarget builds consensus with existing pack target', () => {
  const players: Record<string, Player> = {
    b1: { ...mockPlayer('b1', 'Bobel 1', 'BOBEL'), targetVictim: 'v2' },
    b2: mockPlayer('b2', 'Bobel 2', 'BOBEL'),
    v1: mockPlayer('v1', 'Villager 1', 'OLONA'),
    v2: mockPlayer('v2', 'Villager 2', 'OLONA'),
  };

  // b2 should align with b1's choice of v2 to create pack consensus
  const target = getSmartBotBobelTarget('b2', players);
  assert.equal(target, 'v2', 'Bobel bot should unite with fellow Bobel on common target');
});

test('getSmartBotDayVote ensures Bobel never votes for a fellow Bobel', () => {
  const players: Record<string, Player> = {
    b1: mockPlayer('b1', 'Bobel 1', 'BOBEL'),
    b2: mockPlayer('b2', 'Bobel 2', 'BOBEL'),
    v1: mockPlayer('v1', 'Villager 1', 'OLONA'),
    v2: mockPlayer('v2', 'Villager 2', 'OLONA'),
  };

  for (let i = 0; i < 20; i++) {
    const vote = getSmartBotDayVote('b1', players, [], false);
    assert.notEqual(vote, 'b2', 'Bobel bot must never vote against fellow Bobel teammate b2');
    assert.notEqual(vote, 'b1', 'Bobel bot must never vote against itself');
    assert.ok(vote === 'v1' || vote === 'v2', 'Bobel bot must vote against a village member');
  }
});

test('getSmartBotDadarabeInspect prioritizes uninspected alive players', () => {
  const players: Record<string, Player> = {
    d1: mockPlayer('d1', 'Dadarabe', 'DADARABE'),
    p1: mockPlayer('p1', 'Player 1', 'OLONA'),
    p2: mockPlayer('p2', 'Player 2', 'BOBEL'),
  };

  // If p1 already inspected, should inspect p2
  const nextTarget = getSmartBotDadarabeInspect('d1', players, ['p1']);
  assert.equal(nextTarget, 'p2', 'Dadarabe bot should choose uninspected player');
});

test('generateBotDebateDialogue produces authentic text for different roles', () => {
  const players: Record<string, Player> = {
    d1: mockPlayer('d1', 'Dadarabe', 'DADARABE'),
    b1: mockPlayer('b1', 'Bobel 1', 'BOBEL'),
    v1: mockPlayer('v1', 'Villager 1', 'OLONA'),
  };

  const dadarabeText = generateBotDebateDialogue(players.d1, players, 'b1');
  assert.ok(dadarabeText.includes('Bobel') || dadarabeText.includes('sikidy'), 'Dadarabe reveals suspect');

  const bobelText = generateBotDebateDialogue(players.b1, players);
  assert.ok(bobelText.length > 10, 'Bobel generates bluff/defense dialogue');

  const villagerText = generateBotDebateDialogue(players.v1, players);
  assert.ok(villagerText.length > 10, 'Villager generates suspicion dialogue');
});



test('Mpangalatra shuffle integrates thief cards into the center pool with true unpredictability', () => {
  const players = [
    mockPlayer('p1', 'Player 1'),
    mockPlayer('p2', 'Player 2'),
    mockPlayer('p3', 'Player 3'),
    mockPlayer('p4', 'Player 4'),
  ];

  let centerHadNonOlona = false;
  // Over several random distributions, center cards should not strictly be fixed to OLONA
  for (let i = 0; i < 50; i++) {
    const { centerCards } = assignRolesToPlayers(players, true);
    assert.equal(centerCards.length, 2, 'Center must always contain exactly 2 cards for Mpangalatra');
    if (centerCards.some((c) => c !== 'OLONA')) {
      centerHadNonOlona = true;
    }
  }
  assert.ok(centerHadNonOlona, 'Center cards should draw unpredictably from the full shuffled deck');
});

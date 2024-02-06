import { PhaseType, DiceType } from "@gi-tcg/typings";

import { CardDefinition } from "./card";
import { CharacterDefinition, CharacterVariables } from "./character";
import { EntityArea, EntityDefinition, EntityVariables } from "./entity";
import { Mutation } from "./mutation";
import { ActionInfo, DamageInfo, SkillDefinition } from "./skill";
import { ReadonlyDataStore } from "../builder/registry";

export interface GameConfig {
  readonly randomSeed: number;
  readonly initialHands: number;
  readonly maxHands: number;
  readonly maxRounds: number;
  readonly maxSupports: number;
  readonly maxSummons: number;
  readonly initialDice: number;
  readonly maxDice: number;
}

export interface IteratorState {
  readonly random: Int32Array;
  readonly id: number;
}

export interface MutationLogEntry {
  readonly roundNumber: number;
  readonly mutation: Mutation;
}

export interface ActionLogEntry {
  readonly roundNumber: number;
  readonly who: 0 | 1;
  readonly action: ActionInfo;
}

export interface GameState {
  readonly data: ReadonlyDataStore;
  readonly config: GameConfig;
  readonly iterators: IteratorState;
  readonly phase: PhaseType;
  readonly roundNumber: number;
  readonly currentTurn: 0 | 1;
  readonly winner: 0 | 1 | null;
  readonly players: readonly [PlayerState, PlayerState];
  readonly mutationLog: readonly MutationLogEntry[];
  readonly globalActionLog: readonly ActionLogEntry[];
}

export interface PlayerState {
  readonly initialPiles: readonly CardDefinition[];
  readonly piles: readonly CardState[];
  readonly activeCharacterId: number;
  readonly hands: readonly CardState[];
  readonly characters: readonly CharacterState[];
  readonly combatStatuses: readonly EntityState[];
  readonly supports: readonly EntityState[];
  readonly summons: readonly EntityState[];
  readonly dice: readonly DiceType[];
  readonly declaredEnd: boolean;
  readonly hasDefeated: boolean;
  readonly canPlunging: boolean;
  readonly canCharged: boolean;
  readonly legendUsed: boolean;
  readonly skipNextTurn: boolean;
}

export interface CardState {
  readonly id: number;
  readonly definition: CardDefinition;
}

export interface CharacterState {
  readonly id: number;
  readonly definition: CharacterDefinition;
  readonly entities: readonly EntityState[];
  readonly variables: CharacterVariables;
  readonly damageLog: DamageInfo[];
}

export interface EntityState {
  readonly id: number;
  readonly definition: EntityDefinition;
  readonly variables: EntityVariables;
}

export type AnyState = CharacterState | EntityState;

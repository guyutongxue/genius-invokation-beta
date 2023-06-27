import { DiceType } from "@gi-tcg/typings";
import {
  Context,
  SkillDescriptionContext,
  SwitchActiveContext,
} from "./contexts";

export type UseSkillAction = (c: SkillDescriptionContext) => void;

export interface NormalSkillInfo {
  type: "normal" | "elemental";
  gainEnergy: boolean;
  costs: DiceType[];
  action: UseSkillAction;
}

export interface BurstSkillInfo {
  type: "burst";
  gainEnergy: false;
  costs: DiceType[];
  action: UseSkillAction;
}

export interface PrepareSkillInfo {
  type: "prepare";
  prepareRound: number;
  action: UseSkillAction;
}

export interface PassiveSkillEvents {
  onBattleBegin?: (c: Context) => void;
  onSwitchActive?: (c: SwitchActiveContext) => void;
  onSwitchActiveFrom?: (c: SwitchActiveContext) => void;
}

export interface PassiveSkillInfo {
  type: "passive";
  actions: PassiveSkillEvents;
}

export type SkillInfo =
  | NormalSkillInfo
  | BurstSkillInfo
  | PrepareSkillInfo
  | PassiveSkillInfo;
export type SkillInfoWithId = Readonly<SkillInfo & { id: number; }>;

const allSkills = new Map<number, SkillInfoWithId>();
export function registerSkill(id: number, info: SkillInfo) {
  allSkills.set(id, { ...info, id });
}
export function getSkill(id: number) : SkillInfoWithId {
  if (!allSkills.has(id)) {
    throw new Error(`Skill ${id} not found`);
  }
  return allSkills.get(id)!;
}

// //@ts-nocheck
import {
  CardTag,
  CharacterContext,
  CharacterInfoWithId,
  Context,
  ElementTag,
  EquipmentInfoWithId,
  SpecialBits,
  StatusContext,
  StatusInfoWithId,
  SummonContext,
  SummonInfoWithId,
  Target,
  TargetInfo,
  UseDiceContext,
  getTargetInfo,
} from "@gi-tcg/data";
import { GameState, flip } from "./state.js";
import { DamageType, DiceType } from "@gi-tcg/typings";
import { CharacterPosition } from "./player.js";
import { Character } from "./character.js";
import { Equipment } from "./equipment.js";
import { Status } from "./status.js";
import { Summon } from "./summon.js";
import { Card } from "./card.js";

export type ContextFactory<T> = (entityId: number) => T | null;

export class ContextImpl implements Context {
  constructor(
    protected state: GameState,
    public readonly who: 0 | 1,
    public readonly sourceId: number
  ) {}

  get currentPhase(): "action" | "end" | "other" {
    const phase = this.state.getPhase();
    if (phase === "action" || phase === "end") {
      return phase;
    } else {
      return "other";
    }
  }
  get currentTurn(): number {
    return this.state.getCurrentTurn();
  }
  isMyTurn(): boolean {
    return this.currentTurn === this.who;
  }
  checkSpecialBit(bit: SpecialBits): boolean {
    return this.state.getPlayer(this.who).getSpecialBit(bit);
  }

  protected createCharacterContext(ch: Character): CharacterContextImpl {
    return new CharacterContextImpl(this.state, this.who, ch, this.sourceId);
  }
  private createSummonContext(s: Summon): SummonContextImpl {
    return new SummonContextImpl(this.state, this.who, s, this.sourceId);
  }
  private getCharacterFromTarget(
    t: Target | TargetInfo
  ): CharacterContextImpl[] {
    const info = t instanceof Target ? getTargetInfo(t) : t;
    switch (info.type) {
      case "byPos": {
        const player = this.state.getPlayer(
          info.opp ? flip(this.who) : this.who
        );
        let positions: CharacterPosition[];
        if (info.pos === "all") {
          positions = ["prev", "active", "next"];
        } else if (info.pos === "standby") {
          positions = ["prev", "next"];
        } else {
          positions = [info.pos];
        }
        const characters = new Set(
          positions.map((pos) => player.getCharacter(pos))
        );
        return [...characters].map(this.createCharacterContext);
      }
      case "oneEnergyNotFull": {
        const player = this.state.getPlayer(this.who);
        const try1 = player.getCharacter("active");
        if (!try1.fullEnergy()) return [this.createCharacterContext(try1)];
        const try2 = player.getCharacter("next");
        if (!try2.fullEnergy()) return [this.createCharacterContext(try2)];
        const try3 = player.getCharacter("prev");
        if (!try3.fullEnergy()) return [this.createCharacterContext(try3)];
        return [];
      }
      case "byEntityId": {
        const player = this.state.getPlayer(this.who);
        const character = player.getCharacterById(info.entityId);
        return character ? [this.createCharacterContext(character)] : [];
      }
      case "byId": {
        const player = this.state.getPlayer(this.who);
        const character = player.getCharacterById(info.id, true);
        return character ? [this.createCharacterContext(character)] : [];
      }
      case "recentOpp": {
        const relativeCtx = this.getCharacterFromTarget(info.relativeTo);
        if (relativeCtx.length === 0) return [];
        const relative = relativeCtx[0];
        const targetPlayer = this.state.getPlayer(flip(relative.who));
        const targetCharacter = targetPlayer.getCharacterByPos(
          relative.indexOfPlayer()
        );
        return [this.createCharacterContext(targetCharacter)];
      }
      default: {
        const _: never = info;
        throw new Error(`Unknown target info type: ${_}`);
      }
    }
  }

  hasCharacter(ch: number | Target): CharacterContext | null {
    const t: Target =
      typeof ch === "number" ? Target.ofCharacter(ch as any) : ch;
    const ctx = this.getCharacterFromTarget(t);
    if (ctx.length === 0) return null;
    return ctx[0];
  }
  allCharacters(
    opp?: boolean | undefined,
    includesDefeated?: boolean | undefined
  ): CharacterContext[] {
    let characters = this.state.getPlayer(
      opp ? flip(this.who) : this.who
    ).characters;
    if (!includesDefeated) {
      characters = characters.filter((ch) => ch.isAlive());
    }
    return characters.map(this.createCharacterContext);
  }
  fullSupportArea(opp: boolean): boolean {
    const player = this.state.getPlayer(opp ? flip(this.who) : this.who);
    return player.fullSupportArea();
  }
  hasSummon(summon: number): SummonContext | null {
    const s = this.state
      .getPlayer(this.who)
      .summons.find((s) => s.info.id === summon);
    return s ? this.createSummonContext(s) : null;
  }
  allSummons(): SummonContext[] {
    const mySummons = this.state.getPlayer(this.who).summons;
    const oppSummons = this.state.getPlayer(flip(this.who)).summons;
    return [...mySummons, ...oppSummons].map(this.createSummonContext);
  }

  hasCombatStatus(status: number): StatusContext | null {
    const combatStatuses = this.state.getPlayer(this.who).combatStatuses;
    const s = combatStatuses.find((s) => s.info.id === status);
    return s ? new StatusContextImpl(s, this.sourceId) : null;
  }
  hasCombatShield(): StatusContext | null {
    const combatStatuses = this.state.getPlayer(this.who).combatStatuses;
    const s = combatStatuses.find((s) => s.shield !== null);
    return s ? new StatusContextImpl(s, this.sourceId) : null;
  }

  dealDamage(
    value: number,
    type: DamageType,
    target?: Target | undefined
  ): void {}
  applyElement(type: DamageType, target?: Target | undefined): void {}
  heal(value: number, target: Target): void {}
  gainEnergy(value?: number | undefined, target?: Target | undefined): number {
    target ??= Target.myActive();
    const ctx = this.getCharacterFromTarget(target);
    let sum = 0;
    for (const ch of ctx) {
      sum += ch.gainEnergy(value ?? 0);
    }
    return sum;
  }
  loseEnergy(value?: number | undefined, target?: Target | undefined): number {
    target ??= Target.myActive();
    const ctx = this.getCharacterFromTarget(target);
    let sum = 0;
    for (const ch of ctx) {
      sum += ch.loseEnergy(value ?? 0);
    }
    return sum;
  }

  createStatus(status: number, target?: Target | undefined): StatusContext {
    target ??= Target.myActive();
    const ctx = this.getCharacterFromTarget(target);
    if (ctx.length !== 1) {
      throw new Error(
        `Expected to create status on exactly one character, but got ${ctx.length}`
      );
    }
    return ctx[0].createStatus(status);
  }
  removeStatus(status: number, target?: Target | undefined): boolean {
    target ??= Target.myActive();
    const ctx = this.getCharacterFromTarget(target);
    let removed = false;
    for (const ch of ctx) {
      removed ||= ch.removeStatus(status);
    }
    return removed;
  }
  createCombatStatus(
    status: number,
    opp?: boolean | undefined
  ): StatusContext {
    const player = this.state.getPlayer(opp ? flip(this.who) : this.who);
    const st = new Status(status);
    player.combatStatuses.push(st);
    return new StatusContextImpl(st, this.sourceId);
  }

  summon(summon: number): void {}
  summonOneOf(...summons: number[]): void {}
  createSupport(support: number, opp?: boolean | undefined): void {}

  getDice(): DiceType[] {
    return this.state.getPlayer(this.who).dice;
  }
  rollDice(count: number): Promise<void> {
    return this.state.getPlayer(this.who).rollDice(count);
  }
  generateDice(...dice: DiceType[]): void {
    this.state.getPlayer(this.who).dice.push(...dice);
  }
  removeAllDice(): DiceType[] {
    const old = this.state.getPlayer(this.who).dice;
    this.state.getPlayer(this.who).dice = [];
    return old;
  }

  getCardCount(opp?: boolean | undefined): number {
    return this.state.getPlayer(opp ? flip(this.who) : this.who).hands.length;
  }
  drawCards(
    count: number,
    opp?: boolean | undefined,
    tag?: CardTag | undefined
  ): void {
    const player = this.state.getPlayer(opp ? flip(this.who) : this.who);
    const controlled = tag ? player.cardsWithTagFromPile(tag) : [];
    player.drawHands(count, controlled);
  }
  createCards(...ids: number[]): void {
    const cards = ids.map((id) => new Card(id));
    this.state.getPlayer(this.who).hands.push(...cards);
  }
  switchCards(): Promise<void> {
    return this.state.getPlayer(this.who).switchHands();
  }

  switchActive(target: Target): void {
    const ctx = this.getCharacterFromTarget(target);
    if (ctx.length === 0) {
      throw new Error(`Switching active: Target not exists: ${target}`);
    }
    const chCtx = ctx[0];
    const player = this.state.getPlayer(
      chCtx.isMine() ? this.who : flip(this.who)
    );
    player.switchActive(chCtx.entityId);
  }
  useSkill(skill: number | "normal"): void {
    // TODO
  }

  flipNextTurn(): void {
    this.state.nextTurn = flip(this.state.nextTurn);
  }

  getMaster(): CharacterContext {
    throw new Error("Cannot call getMaster in raw Context");
  }
  asStatus(): StatusContext {
    throw new Error("This context is not a status");
  }
  dispose(): void {
    throw new Error("Cannot dispose raw Context");
  }
}

export const ELEMENT_TAG_MAP: Record<ElementTag, DiceType> = {
  cryo: DiceType.Cryo,
  hydro: DiceType.Hydro,
  pyro: DiceType.Pyro,
  electro: DiceType.Electro,
  anemo: DiceType.Anemo,
  geo: DiceType.Geo,
  dendro: DiceType.Dendro,
};

class CharacterContextImpl implements CharacterContext {
  constructor(
    private state: GameState,
    public readonly who: 0 | 1,
    protected character: Character,
    public readonly sourceId = character.entityId
  ) {}
  get entityId() {
    return this.character.entityId;
  }
  get info(): CharacterInfoWithId {
    return this.character.info;
  }
  get health() {
    return this.character.health;
  }
  get energy() {
    return this.character.energy;
  }
  get aura() {
    return this.character.applied;
  }
  isAlive() {
    return this.character.isAlive();
  }

  indexOfPlayer() {
    return this.state
      .getPlayer(this.who)
      .characters.findIndex((c) => c.entityId === this.entityId);
  }

  hasEquipment(
    equipment: number | "artifact" | "weapon"
  ): EquipmentInfoWithId | null {
    let eq: Equipment | undefined;
    if (typeof equipment === "number") {
      eq = this.character.equipments.find((e) => e.info.id === equipment);
    } else {
      eq = this.character.equipments.find((e) => e.info.type === equipment);
    }
    return eq?.info ?? null;
  }
  equip(equipment: number | EquipmentInfoWithId): void {
    const eqId = typeof equipment === "number" ? equipment : equipment.id;
    const eq = new Equipment(eqId);
    this.character.equipments.push(eq);
  }
  removeEquipment(equipment: number | EquipmentInfoWithId): void {
    const eqId = typeof equipment === "number" ? equipment : equipment.id;
    this.character.equipments = this.character.equipments.filter(
      (e) => e.info.id !== eqId
    );
  }

  heal(amount: number): void {
    const newHealth = this.character.health + amount;
    const realHealth = Math.min(newHealth, this.character.info.maxHealth);
    const diff = realHealth - this.character.health;
    this.character.health = realHealth;
    this.state.addDamageLog({
      target: this.entityId,
      type: DamageType.Heal,
      value: diff,
      log: [
        {
          source: this.entityId,
          what: `+${diff} HP`,
        },
      ],
    });
  }
  gainEnergy(amount: number): number {
    const newEnergy = this.character.energy + amount;
    const realEnergy = Math.min(newEnergy, this.character.info.maxEnergy);
    const diff = realEnergy - this.character.energy;
    this.character.energy = realEnergy;
    return diff;
  }
  loseEnergy(amount: number): number {
    const newEnergy = this.character.energy - amount;
    const realEnergy = Math.max(newEnergy, 0);
    const diff = this.character.energy - realEnergy;
    this.character.energy = realEnergy;
    return diff;
  }
  createStatus(status: number): StatusContext {
    const st = new Status(status);
    this.character.statuses.push(st);
    return new StatusContextImpl(st, this.sourceId);
  }
  removeStatus(status: number): boolean {
    const st = this.character.statuses.findIndex((s) => s.info.id === status);
    if (st === -1) return false;
    this.character.statuses.splice(st, 1);
    return true;
  }
  hasStatus(status: number): StatusContext | null {
    const st = this.character.statuses.find((s) => s.info.id === status);
    if (!st) return null;
    return new StatusContextImpl(st, this.entityId);
  }
  hasShield(): StatusContext {
    const st = this.character.statuses.find((s) => s.shield !== null);
    if (!st) throw new Error("No shield");
    return new StatusContextImpl(st, this.entityId);
  }

  isActive() {
    return (
      this.state.getPlayer(this.who).getCharacter("active").entityId ===
      this.entityId
    );
  }
  isMine() {
    return !!this.state
      .getPlayer(this.who)
      .characters.find((c) => c.entityId === this.entityId);
  }
  asTarget(): Target {
    return Target.ofCharacter(this.character.info.id as any);
  }
  elementType(): DiceType {
    const elementTag = this.character.info.tags.filter((t): t is ElementTag =>
      Object.keys(ELEMENT_TAG_MAP).includes(t)
    );
    if (elementTag.length === 0) return DiceType.Void;
    const elementType = ELEMENT_TAG_MAP[elementTag[0]] ?? DiceType.Void;
    return elementType;
  }
}

class StatusContextImpl implements StatusContext {
  constructor(private status: Status, private sourceId: number) {}

  get entityId() {
    return this.status.entityId;
  }

  get info(): StatusInfoWithId {
    return this.status.info;
  }

  getVisibleValue(): number | null {
    return this.status.visibleValue;
  }
  addVisibleValue(added: number): number {
    const v = this.status.visibleValue ?? 0;
    return (this.status.visibleValue = v + added);
  }

  gainUsage() {
    this.status.usage++;
  }
  gainShield(value: number): void {
    if (this.status.shield === null) {
      return;
    }
    this.status.shield += value;
  }
}

export class StatusDescriptionContextImpl extends ContextImpl {
  constructor(
    state: GameState,
    who: 0 | 1,
    private master: Character | null,
    private status: Status,
    public readonly sourceId = status.entityId
  ) {
    super(state, who, sourceId);
  }
  override getMaster() {
    if (this.master === null) {
      throw new Error("Master not exists; maybe this is a combat status");
    }
    return this.createCharacterContext(this.master);
  }
  override asStatus() {
    return new StatusContextImpl(this.status, this.sourceId);
  }
}

class SummonContextImpl implements SummonContext {
  constructor(
    private state: GameState,
    private readonly who: 0 | 1,
    private summon: Summon,
    private sourceId: number
  ) {}

  get entityId() {
    return this.summon.entityId;
  }

  get info(): SummonInfoWithId {
    return this.summon.info;
  }

  isMine() {
    return !!this.state
      .getPlayer(this.who)
      .summons.find((s) => s.entityId === this.entityId);
  }

  get usage() {
    return this.summon.getUsage();
  }
  set usage(value: number) {
    this.summon.setUsage(value);
  }

  dispose() {
    this.summon.shouldDispose = true;
  }
}

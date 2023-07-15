import {
  DiceType,
  Event,
  MyPlayerData,
  OppPlayerData,
  PlayerDataBase,
  RpcMethod,
  RpcRequest,
  RpcResponse,
} from "@gi-tcg/typings";
import { verifyRpcRequest, verifyRpcResponse } from "@gi-tcg/typings";
import * as _ from "lodash-es";

import { Card } from "./card.js";
import { GameOptions, PlayerConfig } from "./game.js";
import { Character } from "./character.js";
import { Status } from "./status.js";
import { Support } from "./support.js";
import { Summon } from "./summon.js";
import { ClonedObj, shallowClone } from "./entity.js";
import { GlobalOperations } from "./state.js";
import { CardTag, SpecialBits } from "@gi-tcg/data";
import { EventCreatorArgsForCharacter, EventCreatorArgsForPlayer, EventFactory, EventHandlerNames1, RollPhaseConfig } from "./context.js";
import {
  ActionConfig,
  SwitchActiveConfig,
  UseSkillConfig,
  actionToRpcRequest,
  checkRpcResponse,
} from "./action.js";

interface PlayerConfigWithGame extends PlayerConfig {
  game: GameOptions;
}

export type CharacterPosition = "active" | "prev" | "next";

export class Player {
  piles: Card[];
  activeIndex: number | null = null;
  hands: Card[] = [];
  characters: Character[];
  combatStatuses: Status[] = [];
  supports: Support[] = [];
  summons: Summon[] = [];
  dice: DiceType[] = [];
  specialBits: number = 0;

  constructor(
    private readonly config: PlayerConfigWithGame,
    private ops: GlobalOperations
  ) {
    this.piles = config.deck.actions.map((id) => new Card(id));
    this.characters = config.deck.characters.map((id) => new Character(id, this));
    if (!config.noShuffle) {
      this.piles = _.shuffle(this.piles);
    }
  }

  initHands() {
    const legends = this.piles
      .map((c, i) => [c, i] as const)
      .filter(([c]) => c.isLegend())
      .map(([c, i]) => i);
    this.drawHands(this.config.game.initialHands, legends);
  }

  cardsWithTagFromPile(tag: CardTag): number[] {
    return this.piles
      .filter((c) => c.info.tags.includes(tag))
      .map((c) => c.entityId);
  }

  async drawHands(count: number, controlled: number[] = []) {
    const drawn: Card[] = [];
    for (const cardIdx of controlled) {
      drawn.push(...this.piles.splice(cardIdx, 1));
      if (drawn.length === count) {
        break;
      }
    }
    if (drawn.length < count) {
      drawn.push(...this.piles.splice(0, count - drawn.length));
    }
    this.hands.push(...drawn);
    // "爆牌"
    const discardedCount = this.hands.length - this.config.game.maxHands;
    this.hands.splice(this.config.game.maxHands, discardedCount);

    this.ops.notifyMe({ type: "stateUpdated", damages: [] });
    this.ops.notifyOpp({
      type: "oppChangeHands",
      removed: 0,
      added: this.hands.length,
      discarded: discardedCount,
    });
  }

  async switchHands() {
    const { removedHands } = await this.rpc("switchHands", {});
    const removed: Card[] = [];
    for (let i = 0; i < this.hands.length; i++) {
      if (removedHands.includes(this.hands[i].entityId)) {
        removed.push(this.hands[i]);
        this.hands.splice(i, 1);
        i--;
      }
    }
    this.piles.push(...removed);
    if (!this.config.noShuffle) {
      this.piles = _.shuffle(this.piles);
    }
    this.ops.notifyOpp({
      type: "oppChangeHands",
      removed: removed.length,
      added: 0,
      discarded: 0,
    });
    this.drawHands(removed.length);
  }

  async chooseActive(delayNotify: false): Promise<void>;
  async chooseActive(delayNotify: true): Promise<() => void>;
  async chooseActive(delayNotify = false): Promise<any> {
    const activeId =
      this.activeIndex === null
        ? null
        : this.characters[this.activeIndex].entityId;
    const { active } = await this.rpc("chooseActive", {
      candidates: this.characters
        .filter((c) => {
          return c.isAlive() && c.entityId !== activeId;
        })
        .map((c) => c.entityId),
    });
    return this.switchActive(active, delayNotify);
  }

  async rollDice() {
    const config: RollPhaseConfig = {
      controlled: [],
      times: 1,
    };
    await this.ops.sendEvent("onRollPhase", config);
    this.dice = new Array(this.config.game.initialDice).fill(DiceType.Omni);
    if (!this.config.alwaysOmni) {
      this.doRollDice(config.controlled);
    }
    await this.rerollDice(config.times);
  }
  async sortDice() {
    this.dice.sort((a, b) => this.diceValue(b) - this.diceValue(a));
  }
  private diceValue(x: DiceType): number {
    if (x === DiceType.Omni) {
      return 10000;
    } else if (x === this.getCharacter("active").elementType()) {
      return 1000;
    } else if (x === this.getCharacter("next").elementType()) {
      return 100;
    } else if (x === this.getCharacter("prev").elementType()) {
      return 10;
    } else {
      return -x;
    }
  }
  private doRollDice(controlled: DiceType[]) {
    const rerollCount = this.dice.length - controlled.length;
    this.dice = [...controlled];
    for (let i = 0; i < rerollCount; i++) {
      this.dice.push(Math.floor(Math.random() * 8) + 1);
    }
    this.sortDice();
    this.ops.notifyMe({ type: "stateUpdated", damages: [] });
  }

  async rerollDice(times: number) {
    for (let i = 0; i < times; i++) {
      if (this.dice.length !== 0) {
        const { rerollIndexes } = await this.rpc("rerollDice", {});
        if (rerollIndexes.length === 0) {
          break;
        }
        const controlled = [...this.dice];
        _.pullAt(controlled, rerollIndexes);
        this.doRollDice(controlled);
      }
    }
  }

  getCharacter(target: CharacterPosition): Character {
    let chIndex = this.activeIndex ?? 0;
    while (true) {
      switch (target) {
        case "next": {
          chIndex++;
          const ch = this.characters[chIndex % this.characters.length];
          if (!ch.isAlive()) continue;
          return ch;
        }
        case "prev": {
          chIndex--;
          const ch = this.characters[chIndex % this.characters.length];
          if (!ch.isAlive()) continue;
          return ch;
        }
        case "active":
          return this.characters[chIndex];
      }
    }
  }
  getCharacterById(id: number, useStaticId = false): Character | undefined {
    return this.characters.find((c) =>
      useStaticId ? c.info.id === id : c.entityId === id
    );
  }
  getCharacterByPos(posIndex: number): Character {
    const ch = this.characters[posIndex % 3];
    if (!ch.isAlive()) {
      return this.getCharacterByPos(posIndex + 1);
    } else {
      return ch;
    }
  }

  /**
   * @returns nontrivial action `ActionConfig`; `null` for elemental tuning & declare end
   */
  async action(): Promise<ActionConfig | null> {
    const actions: ActionConfig[] = [];
    const ch = this.getCharacter("active");
    actions.push(
      ...ch.skills.map(
        (s): UseSkillConfig => ({
          type: "useSkill",
          dice: [...s.info.costs],
          skill: s,
        })
      )
    );
    actions.push(...this.ops.getCardActions());
    actions.push(
      ...this.characters
        .filter((c) => c.isAlive() && c.entityId !== ch.entityId)
        .map(
          (c): SwitchActiveConfig => ({
            type: "switchActive",
            dice: [DiceType.Void],
            from: ch,
            to: c,
            fast: false,
          })
        )
    );
    // TODO handle "beforeUseDice"
    const request = actionToRpcRequest(actions, this.hands);
    const response = await this.rpc("action", request);
    if (response.type === "declareEnd") {
      this.setSpecialBit(SpecialBits.DeclaredEnd, true);
      this.ops.notifyMe({ type: "declareEnd", opp: false });
      this.ops.notifyOpp({ type: "declareEnd", opp: true });
      await this.ops.sendEvent("onDeclareEnd");
      return null;
    }
    // TODO consume dice
    if (response.type === "elementalTuning") {
      const cardIdx = this.hands.findIndex(
        (c) => c.entityId === response.discardedCard
      );
      if (cardIdx === -1) {
        throw new Error("Invalid card");
      }
      this.hands.splice(cardIdx, 1);
      this.ops.notifyOpp({
        type: "oppChangeHands",
        removed: 0,
        added: 0,
        discarded: 1,
      });
      this.dice.push(this.getCharacter("active").elementType());
      this.sortDice();
      this.ops.notifyMe({ type: "stateUpdated", damages: [] });
      return null;
    }
    const selectedAction = checkRpcResponse(actions, response);
    if (selectedAction === null) {
      throw new Error("Invalid action");
    }
    return selectedAction;
  }

  switchActive(targetEntityId: number, delayNotify = false): any {
    this.activeIndex = this.characters.findIndex(
      (c) => c.entityId === targetEntityId
    );
    this.ops.notifyMe({
      type: "switchActive",
      opp: false,
      target: targetEntityId,
    });
    // TODO handle "onSwitchActive"
    const oppNotify = () => {
      this.ops.notifyOpp({
        type: "switchActive",
        opp: true,
        target: targetEntityId,
      });
    };
    if (delayNotify) {
      return oppNotify;
    } else {
      oppNotify();
    }
  }

  fullSupportArea(): boolean {
    return this.supports.length >= this.config.game.maxSupports;
  }

  sendEventFromCharacter<K extends EventHandlerNames1>(ch: Character, event: K, ...rest: EventCreatorArgsForCharacter<K>) {
    // @ts-expect-error TS sucks
    this.ops.sendEvent(event, ch, ...rest);
  }

  async *handleEvent(event: EventFactory) {
    const activeIndex = this.activeIndex ?? 0;
    for (let i = 0; i < this.characters.length; i++) {
      const character =
        this.characters[(activeIndex + i) % this.characters.length];
      if (character.isAlive()) {
        for await (const r of character.handleEvent(event)) {
          yield;
        }
      }
    }
    for (const status of this.combatStatuses) {
      await status.handleEvent(event);
      yield;
    }
    for (const summon of this.summons) {
      await summon.handleEvent(event);
      yield;
    }
    for (const support of this.supports) {
      await support.handleEvent(event);
      yield;
    }
  }

  private async rpc<M extends RpcMethod>(
    method: M,
    data: RpcRequest[M]
  ): Promise<RpcResponse[M]> {
    if (ClonedObj in this) {
      throw new Error("Cannot call rpc in cloned player");
    }
    verifyRpcRequest(method, data);
    const resp = await this.config.handler(method, data);
    verifyRpcResponse(method, resp);
    return resp;
  }

  public getSpecialBit(bit: SpecialBits): boolean {
    return (this.specialBits & (1 << bit)) !== 0;
  }
  private setSpecialBit(bit: SpecialBits, value = true) {
    if (value) {
      this.specialBits |= 1 << bit;
    } else {
      this.specialBits &= ~(1 << bit);
    }
  }
  public cleanSpecialBits(...bits: SpecialBits[]) {
    for (const bit of bits) {
      this.specialBits &= ~(1 << bit);
    }
  }

  private getDataBase(): PlayerDataBase {
    return {
      pileNumber: this.piles.length,
      active:
        this.activeIndex === null
          ? null
          : this.characters[this.activeIndex].entityId,
      characters: this.characters.map((c) => c.getData()),
      combatStatuses: this.combatStatuses.map((s) => s.getData()),
      supports: this.supports.map((s) => s.getData()),
      summons: this.summons.map((s) => s.getData()),
      legendUsed: this.getSpecialBit(SpecialBits.LegendUsed),
    };
  }
  getData(): MyPlayerData {
    return {
      type: "my",
      hands: this.hands.map((c) => c.getData()),
      dice: [...this.dice],
      ...this.getDataBase(),
    };
  }
  getDataForOpp(): OppPlayerData {
    return {
      type: "opp",
      hands: this.hands.length,
      dice: this.dice.length,
      ...this.getDataBase(),
    };
  }

  clone() {
    const clone = shallowClone(this);
    // Card is not stateful, no need to deep clone (FOR NOW)
    // clone.piles = this.piles.map(c => c.clone());
    // clone.hands = this.hands.map(c => c.clone());
    // Cloned object shouldn't have side effects
    clone.ops.notifyMe = () => {};
    clone.ops.notifyOpp = () => {};
    clone.characters = this.characters.map((c) => c.clone());
    clone.combatStatuses = this.combatStatuses.map((s) => s.clone());
    clone.supports = this.supports.map((s) => s.clone());
    clone.summons = this.summons.map((s) => s.clone());
    return clone;
  }
}

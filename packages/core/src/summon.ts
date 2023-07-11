import { ContextOfEvent, EventHandlers, getSummon, SummonInfoWithId } from "@gi-tcg/data";
import { Entity, shallowClone } from "./entity.js";
import { SummonData } from "@gi-tcg/typings";
import { ContextFactory } from "./context.js";

export class Summon extends Entity {
  public readonly info: SummonInfoWithId;
  private handler: EventHandlers;
  private usage: number;
  shouldDispose = false;

  constructor(id: number) {
    super(id);
    this.info = getSummon(id);
    this.handler = new this.info.handlerCtor();
    this.usage = this.info.usage;
  }

  getUsage() {
    return this.usage;
  }
  setUsage(value: number) {
    this.usage = Math.min(this.info.maxUsage, value);
  }

  getData(): SummonData {
    return {
      entityId: this.entityId,
      id: this.id,
      value: this.usage,
    };
  }

  async handleEvent<E extends keyof EventHandlers>(
    e: E,
    cf: ContextFactory<ContextOfEvent<E>>
  ) {
    const ctx = cf(this.entityId);
    if (ctx) {
      const result = await Entity.handleEvent(this.handler, e, ctx);
      if (result) {
        this.usage--;
        if (this.usage === 0) {
          this.shouldDispose = true;
        }
      }
    }
  }

  clone() {
    const clone = shallowClone(this);
    clone.handler = shallowClone(this.handler);
    return clone;
  }
}

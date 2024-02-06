import { character, skill, summon, combatStatus, card, DamageType, SummonHandle } from "@gi-tcg/core/builder";

/**
 * @id 121011
 * @name 冰萤
 * @description
 * 结束阶段：造成1点冰元素伤害。
 * 可用次数：2（可叠加，最多叠加到3次）
 * 愚人众·冰萤术士「普通攻击」后：此牌可用次数+1。
 * 愚人众·冰萤术士受到元素反应伤害后：此牌可用次数-1。
 */
export const CryoCicins: SummonHandle = summon(121011)
  .endPhaseDamage(DamageType.Cryo, 1)
  .usage(2, { recreateMax: 3 })
  .on("useSkill", (c, e) => e.action.skill.caller.definition.id === FatuiCryoCicinMage && e.isSkillType("normal"))
  .addVariable("usage", 1)
  .on("damaged", (c, e) => c.self.master().state.definition.id === FatuiCryoCicinMage && e.getReaction())
  .addVariable("usage", -1)
  .if((c) => c.getVariable("usage") <= 0)
  .dispose()
  .done();

/**
 * @id 121012
 * @name 流萤护罩
 * @description
 * 为我方出战角色提供1点护盾。
 * 创建时：如果我方场上存在冰萤，则额外提供其可用次数的护盾。（最多额外提供3点护盾）
 */
export const FlowingCicinShield = combatStatus(121012)
  .shield(1)
  .on("enter")
  .do((c) => {
    const cicins = c.$(`my summons with definition id ${CryoCicins}`);
    if (cicins) {
      const extraShield = Math.min(cicins.getVariable("usage"), 3);
      c.addVariable("shield", extraShield);
    }
  })
  .done();

/**
 * @id 121013
 * @name 叛逆的守护
 * @description
 * 提供1点护盾，保护我方出战角色。（可叠加，最多叠加到2点）
 */
export const RebelliousShield = combatStatus(121013)
  .shield(1, 2)
  .done();

/**
 * @id 21011
 * @name 冰萤棱锥
 * @description
 * 造成1点冰元素伤害。
 */
export const CicinIcicle = skill(21011)
  .type("normal")
  .costCryo(1)
  .costVoid(2)
  .damage(DamageType.Cryo, 1)
  .done();

/**
 * @id 21012
 * @name 雾虚摇唤
 * @description
 * 造成1点冰元素伤害，召唤冰萤。
 */
export const MistySummons = skill(21012)
  .type("elemental")
  .costCryo(3)
  .damage(DamageType.Cryo, 1)
  .summon(CryoCicins)
  .done();

/**
 * @id 21013
 * @name 冰枝白花
 * @description
 * 造成5点冰元素伤害，本角色附着冰元素，生成流萤护罩。
 */
export const BlizzardBranchBlossom = skill(21013)
  .type("burst")
  .costCryo(3)
  .costEnergy(3)
  .damage(DamageType.Cryo, 5)
  .apply(DamageType.Cryo, "@self")
  .combatStatus(FlowingCicinShield)
  .done();

/**
 * @id 2101
 * @name 愚人众·冰萤术士
 * @description
 * 至少在雾虚草耗尽之前，冰萤不会离她而去。
 */
export const FatuiCryoCicinMage = character(2101)
  .tags("cryo", "fatui")
  .health(10)
  .energy(3)
  .skills(CicinIcicle, MistySummons, BlizzardBranchBlossom)
  .done();

/**
 * @id 221011
 * @name 冰萤寒光
 * @description
 * 战斗行动：我方出战角色为愚人众·冰萤术士时，装备此牌。
 * 愚人众·冰萤术士装备此牌后，立刻使用一次雾虚摇唤。
 * 装备有此牌的愚人众·冰萤术士使用技能后：如果冰萤的可用次数被叠加到超过上限，则造成2点冰元素伤害。
 * （牌组中包含愚人众·冰萤术士，才能加入牌组）
 */
export const CicinsColdGlare = card(221011)
  .costCryo(3)
  .talent(FatuiCryoCicinMage)
  .on("enter")
  .useSkill(MistySummons)
  .on("useSkill")
  .do((c) => {
    const cicins = c.$(`my summons with definition id ${CryoCicins}`);
    if (cicins && cicins?.getVariable("usage") > 3) {
      c.damage(DamageType.Cryo, 2);
    }
  })
  .done();

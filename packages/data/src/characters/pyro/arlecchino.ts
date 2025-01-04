// Copyright (C) 2024 Guyutongxue
// 
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
// 
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
// 
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

import { character, skill, card, DamageType, combatStatus } from "@gi-tcg/core/builder";
import { BondOfLife } from "../../commons";

/**
 * @id 113141
 * @name 血债勒令
 * @description
 * 我方前台受到伤害后：我方前台角色和敌方阿蕾奇诺均附属2层生命之契。
 * 可用次数：3（可叠加，没有上限）
 */
export const BlooddebtDirective = combatStatus(113141)
  .since("v5.3.50-beta")
  .on("damaged", (c, e) => c.of(e.target).isActive())
  .usageCanAppend(3, Infinity)
  .do((c) => {
    c.characterStatus(BondOfLife, "my active", {
      overrideVariables: { usage: 2 }
    });
    c.characterStatus(BondOfLife, `opp characters with definition id ${Arlecchino}`, {
      overrideVariables: { usage: 2 }
    });
  })
  .done();

/**
 * @id 13141
 * @name 斩首之邀
 * @description
 * 造成2点物理伤害，若可能，消耗目标至多4层生命之契，提高等量伤害。
 */
export const InvitationToABeheading = skill(13141)
  .type("normal")
  .costPyro(1)
  .costVoid(2)
  .do((c) => {
    let increasedValue = 0;
    const bond = c.$(`status with definition id ${BondOfLife} at opp active`);
    if (bond) {
      increasedValue = Math.min(4, bond.getVariable("usage"));
      c.consumeUsage(increasedValue, bond.state);
    }
    c.damage(DamageType.Physical, 2 + increasedValue);
  })
  .done();

/**
 * @id 13142
 * @name 万相化灰
 * @description
 * 生成3层血债勒令，然后造成2点火元素伤害。
 */
export const AllIsAsh = skill(13142)
  .type("elemental")
  .costPyro(3)
  .combatStatus(BlooddebtDirective, "opp") // 应该是在对方场上生成，否则说不通
  .damage(DamageType.Pyro, 2)
  .done();

/**
 * @id 13143
 * @name 厄月将升
 * @description
 * 造成4点火元素伤害，移除自身所有生命之契，每移除1层，治疗自身1点。
 */
export const BalemoonRising = skill(13143)
  .type("burst")
  .costPyro(3)
  .costEnergy(2)
  .damage(DamageType.Pyro, 4)
  .do((c) => {
    const bond = c.$(`status with definition id ${BondOfLife} at my active`);
    let healValue = 0;
    if (bond) {
      healValue = bond.getVariable("usage");
      bond.dispose();
    }
    c.heal(healValue, "@self");
  })
  .done();

/**
 * @id 13144
 * @name 唯厄月可知晓
 * @description
 * 角色不会受到S13143以外的治疗。
 * 自身附属生命之契时：角色造成的物理伤害变为火元素伤害。
 */
export const TheBalemoonAloneMayKnowPassive0 = skill(13144)
  .type("passive")
  .on("cancelHealed", (c, e) => e.via.definition.id !== BalemoonRising)
  .cancel()
  .on("modifySkillDamageType", (c, e) => e.type === DamageType.Physical && c.self.hasStatus(BondOfLife))
  .changeDamageType(DamageType.Pyro)
  .done();

/**
 * @id 13146
 * @name 唯厄月可知晓
 * @description
 * 角色不会受到S13143以外的治疗。
 * 自身附属生命之契时：角色造成的物理伤害变为火元素伤害。
 */
export const TheBalemoonAloneMayKnowPassive1 = skill(13146)
  .type("passive")
  .reserve();

/**
 * @id 13147
 * @name 唯厄月可知晓
 * @description
 * 角色不会受到S13143以外的治疗。
 * 自身附属生命之契时：角色造成的物理伤害变为火元素伤害。
 */
export const TheBalemoonAloneMayKnowPassive2 = skill(13147)
  .type("passive")
  .reserve();

/**
 * @id 1314
 * @name 阿蕾奇诺
 * @description
 * 
 */
export const Arlecchino = character(1314)
  .since("v5.3.50-beta")
  .tags("pyro", "pole", "fatui")
  .health(10)
  .energy(2)
  .skills(InvitationToABeheading, AllIsAsh, BalemoonRising, TheBalemoonAloneMayKnowPassive0)
  .done();

/**
 * @id 213141
 * @name 所有的仇与债皆由我偿还
 * @description
 * 战斗行动：我方出战角色为所有的仇与债皆由我偿还时，对该角色打出。使所有的仇与债皆由我偿还附属3层生命之契。
 * 装备有此牌的所有的仇与债皆由我偿还受到伤害时，若可能，消耗一层生命之契，以抵消1点伤害。
 * （牌组中包含所有的仇与债皆由我偿还，才能加入牌组）
 */
export const AllReprisalsAndArrearsMineToBear = card(213141)
  .since("v5.3.50-beta")
  .costPyro(1)
  .talent(Arlecchino)
  .on("enter")
  .characterStatus(BondOfLife, "@master", {
    overrideVariables: { usage: 3 }
  })
  .on("decreaseDamaged")
  .do((c, e) => {
    const bond = c.self.master().hasStatus(BondOfLife);
    if (bond) {
      e.decreaseDamage(1)
      c.addVariable("usage", -1, bond);
    }
  })
  .done();

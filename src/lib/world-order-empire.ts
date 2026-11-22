import { COUNTRY_NAMES, COUNTRY_RECORDS, type ForeignCountry } from "./world-order-countries";
import type { ConquestWorld, TerritoryStatus } from "./world-order-conquest";

/**
 * Lightweight empire contribution model. Controlled territories give full
 * yields; partners and protectorates offer smaller benefits. Country strength
 * uses a stable, fictional balancing score rather than real-world military data.
 * All calculations are derived from canonical saved territory status, so a
 * country can never be paid twice by repeated integration clicks.
 */
export type EmpireContribution = {
  incomePerDay: number;
  militaryStrength: number;
  influence: number;
  power: number;
};
export type EmpireTotals = EmpireContribution & {
  controlled: number;
  partners: number;
  protectorates: number;
  contributors: number;
};
const EMPTY:EmpireContribution={incomePerDay:0,militaryStrength:0,influence:0,power:0};
export function nationContribution(country:ForeignCountry,status:TerritoryStatus):EmpireContribution {
  if(status==="independent") return {...EMPTY};
  // A little inherent strength for small countries, without making one
  // large country outweigh the rest of the entire game.
  const rating=COUNTRY_RECORDS[country].resistance;
  const base={
    incomePerDay:750 + rating*95,
    militaryStrength:3 + Math.ceil(rating/9),
    influence:2 + Math.ceil(rating/12),
    power:4 + Math.ceil(rating/8),
  };
  const factor=status==="controlled"?1:status==="protectorate"?0.45:0.2;
  return {
    incomePerDay:Math.round(base.incomePerDay*factor),
    militaryStrength:Math.round(base.militaryStrength*factor),
    influence:Math.round(base.influence*factor),
    power:Math.round(base.power*factor),
  };
}
export function empireTotals(world:Pick<ConquestWorld,"territory">):EmpireTotals {
  const total:EmpireTotals={...EMPTY,controlled:0,partners:0,protectorates:0,contributors:0};
  for(const name of COUNTRY_NAMES){
    const status=world.territory[name]??"independent";
    if(status==="independent")continue;
    if(status==="controlled")total.controlled++;
    else if(status==="partner")total.partners++;
    else if(status==="protectorate")total.protectorates++;
    total.contributors++;
    const amount=nationContribution(name,status);
    total.incomePerDay+=amount.incomePerDay;
    total.militaryStrength+=amount.militaryStrength;
    total.influence+=amount.influence;
    total.power+=amount.power;
  }
  return total;
}
/**
 * The snapshot comes from the state at the beginning of the game day.
 * Newly controlled countries start producing on the following day, and
 * already-controlled countries pay only once per real game-day advance.
 */
export function empireDailyIncome(world:Pick<ConquestWorld,"territory">):number {
 return empireTotals(world).incomePerDay;
}

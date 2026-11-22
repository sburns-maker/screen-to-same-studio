/**
 * Compact alternate-history country roster. Keeps the strategy layer affordable:
 * countries are data, not 80 autonomous AI sessions.
 */
export const COUNTRY_CATALOG = [
 ["United States","North America",95],["Canada","North America",71],["Mexico","North America",60],
 ["Guatemala","North America",31],["Belize","North America",22],["Honduras","North America",26],
 ["El Salvador","North America",29],["Nicaragua","North America",30],["Costa Rica","North America",30],
 ["Panama","North America",35],["Jamaica","Caribbean",27],["Haiti","Caribbean",32],
 ["Dominican Republic","Caribbean",35],["Bahamas","Caribbean",24],["Trinidad and Tobago","Caribbean",29],
 ["Barbados","Caribbean",20],["Colombia","South America",50],["Venezuela","South America",46],
 ["Brazil","South America",75],["Argentina","South America",55],["Chile","South America",47],
 ["Peru","South America",44],["Ecuador","South America",38],["Bolivia","South America",34],
 ["Paraguay","South America",29],["Uruguay","South America",31],["Guyana","South America",26],
 ["Suriname","South America",22],["United Kingdom","Europe",83],["Ireland","Europe",39],
 ["France","Europe",82],["Germany","Europe",81],["Spain","Europe",61],["Portugal","Europe",42],
 ["Italy","Europe",70],["Netherlands","Europe",49],["Belgium","Europe",43],["Switzerland","Europe",53],
 ["Austria","Europe",46],["Poland","Europe",56],["Czechia","Europe",38],["Slovakia","Europe",31],
 ["Hungary","Europe",36],["Romania","Europe",40],["Greece","Europe",39],["Sweden","Europe",47],
 ["Norway","Europe",46],["Denmark","Europe",40],["Finland","Europe",42],["Ukraine","Europe",69],
 ["Türkiye","Europe / Asia",67],["Morocco","Africa",40],["Algeria","Africa",43],
 ["Tunisia","Africa",29],["Egypt","Africa",55],["Nigeria","Africa",56],
 ["Ghana","Africa",36],["Kenya","Africa",40],["Ethiopia","Africa",48],
 ["South Africa","Africa",56],["Senegal","Africa",32],["Uganda","Africa",34],
 ["Tanzania","Africa",36],["Rwanda","Africa",29],["Saudi Arabia","Middle East",59],
 ["United Arab Emirates","Middle East",52],["Jordan","Middle East",31],
 ["Israel","Middle East",60],["India","Asia",90],["Pakistan","Asia",71],
 ["Bangladesh","Asia",49],["China","Asia",98],["Japan","Asia",87],
 ["South Korea","Asia",77],["Indonesia","Asia",66],["Malaysia","Asia",47],
 ["Singapore","Asia",54],["Thailand","Asia",49],["Vietnam","Asia",55],
 ["Philippines","Asia",52],["Australia","Oceania",68],["New Zealand","Oceania",43],
] as const;
export type ForeignCountry = (typeof COUNTRY_CATALOG)[number][0];
export type WorldRegion = (typeof COUNTRY_CATALOG)[number][1];
export const COUNTRY_NAMES: ForeignCountry[] = COUNTRY_CATALOG.map(c=>c[0]);
export const COUNTRY_REGIONS: WorldRegion[] = Array.from(new Set(COUNTRY_CATALOG.map(c=>c[1])));
export const COUNTRY_RECORDS: Record<ForeignCountry,{region:WorldRegion; resistance:number}> =
 Object.fromEntries(COUNTRY_CATALOG.map(([name,region,resistance])=>[name,{region,resistance}])) as Record<ForeignCountry,{region:WorldRegion;resistance:number}>;
export function isForeignCountry(name:unknown):name is ForeignCountry {
 return typeof name==="string" && Object.prototype.hasOwnProperty.call(COUNTRY_RECORDS,name);
}

// User-verified rates supplied 2026-10-22; not independently fetched in this workspace.
// USD, standard API; reference-image inputs, hosting/storage and paid retries excluded.
const rates={luna:{input:0.10,cached:0.01,output:0.50},vision:{input:0.40,cached:0.10,output:1.60},portrait:{low:0.006,medium:0.015,high:0.052}};
const textCost=(input,output,rate,cachedFraction=0)=>(input*((1-cachedFraction)*rate.input+cachedFraction*rate.cached)+output*rate.output)/1e6;
const perText=textCost(4500,350,rates.luna);
const perVisual=textCost(4500,100,rates.vision);
const perLettering=textCost(2500,80,rates.vision);
const rows=[];
for(const npcs of [10,25,50,100])for(const [name,primaryCalls,npcCallsPerDay] of [['low',5,0.02],['moderate',10,0.1],['active',30,0.5]]){
 const calls=primaryCalls+npcs*npcCallsPerDay;
 rows.push({primaryCharacters:5,supportingNpcs:npcs,activity:name,uncappedCallsDaily:calls,textDailyUSD:+(calls*perText).toFixed(6),textMonthlyUSD:+(calls*perText*30).toFixed(6),withinCurrent12CallDailyQuota:calls<=12,cappedMonthlyUSD:+(Math.min(calls,12)*perText*30).toFixed(6)});
}
const images=[0,15,30,60].map(count=>({monthlyImages:count,mediumBaseUSD:count*rates.portrait.medium,withVisualAnd25PercentLetteringUSD:+(count*(rates.portrait.medium+perVisual+0.25*perLettering)).toFixed(6),highWithSameChecksUSD:+(count*(rates.portrait.high+perVisual+0.25*perLettering)).toFixed(6),referenceInputUSD:'additional, not supplied'}));
console.log(JSON.stringify({pricingSource:'User-verified official rates, 2026-10-22; https://developers.openai.com/api/docs/pricing',assumedTokens:{text:{input:4500,output:350},visual:{input:4500,output:100},lettering:{input:2500,output:80}},perText,perVisual,perLettering,cachedTextAt60Percent:textCost(4500,350,rates.luna,0.6),textScenarios:rows,imageScenarios:images},null,2));

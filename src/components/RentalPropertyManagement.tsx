import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { money, type FinanceSnapshot } from "@/lib/finance";
import { loadRentalProperties, updateRentalProperty, type RentalProperty } from "@/lib/finance-rentals.functions";

function RentalEditor({property,finances,onChange}:{property:RentalProperty;finances:FinanceSnapshot;onChange:()=>void}) {
 const save=useServerFn(updateRentalProperty);
 const [units,setUnits]=useState(String(property.unitCount??""));
 const [occupied,setOccupied]=useState(String(property.occupiedUnits??""));
 const [rent,setRent]=useState(property.monthlyRentCents===null?"":String(property.monthlyRentCents/100));
 const [cost,setCost]=useState(String(property.monthlyOperatingCostCents/100));
 const [pending,setPending]=useState(false);
 const monthlyRevenue=Number(occupied)*Number(rent);
 const monthlyCosts=Number(cost);
 const currentRevenue=property.monthlyRevenueCents/100;
 const projected=monthlyRevenue-monthlyCosts;
 const renovationCost=Math.max(500,Math.floor((finances.assets.find(a=>a.key===property.assetKey)?.priceCents??0)/200)/100*(property.renovationLevel+1));
 async function submit(action:"configure"|"renovate") {
   if(pending)return;
   const unitCount=Number(units),occupiedUnits=Number(occupied);
   const monthlyRentCents=Math.round(Number(rent)*100);
   const monthlyOperatingCostCents=Math.round(Number(cost)*100);
   if(action==="configure"&&(!Number.isInteger(unitCount)||unitCount<1||unitCount>10000||
     !Number.isInteger(occupiedUnits)||occupiedUnits<0||occupiedUnits>unitCount||
     !Number.isSafeInteger(monthlyRentCents)||monthlyRentCents<0||monthlyRentCents>1000000000||
     !Number.isSafeInteger(monthlyOperatingCostCents)||monthlyOperatingCostCents<0||monthlyOperatingCostCents>100000000000||
     monthlyRentCents*occupiedUnits>100000000000)) {
     toast.error("Check unit count, occupancy, rent and costs."); return;
   }
   if(action==="renovate"&&!window.confirm("Spend "+money(Math.round(renovationCost*100))+" on this fictional renovation?"))return;
   setPending(true);
   try {
     await save({data:{requestId:crypto.randomUUID(),action:action==="configure"?
       {command:"configure",assetKey:property.assetKey,unitCount,occupiedUnits,monthlyRentCents,monthlyOperatingCostCents}:
       {command:"renovate",assetKey:property.assetKey}}});
     toast.success(action==="configure"?"Rental operating plan saved":"Renovation completed");
     onChange();
   } catch(e){toast.error(e instanceof Error?e.message:"Property update failed");}
   finally{setPending(false);}
 }
 return <section className="rounded-xl border bg-background p-4 space-y-3" aria-label={property.label+" rental operations"}>
   <div><h4 className="font-semibold">{property.label}</h4><p className="text-xs text-muted-foreground">{property.configured?"Operating plan active":"Set up the rental units and rent to start managing this property"}</p></div>
   <div className="grid grid-cols-2 gap-2 text-sm">
     <div>Current monthly revenue: <strong>{money(property.monthlyRevenueCents)}</strong></div>
     <div>Current operating costs: <strong>{money(property.monthlyCostCents)}</strong></div>
     <div>Operating net: <strong>{money(property.monthlyRevenueCents-property.monthlyCostCents)}</strong></div>
     <div>Reserves: <strong>{money(property.reservesCents)}</strong></div>
   </div>
   <div className="grid grid-cols-2 gap-3">
     {[
       {id:"units",label:"Total rental units",value:units,change:setUnits,step:"1"},
       {id:"occupied",label:"Occupied units",value:occupied,change:setOccupied,step:"1"},
       {id:"rent",label:"Monthly rent per occupied unit ($)",value:rent,change:setRent,step:"0.01"},
       {id:"cost",label:"Monthly maintenance, taxes, insurance & utilities ($)",value:cost,change:setCost,step:"0.01"},
     ].map(f=><label key={f.id} className="text-xs font-medium">{f.label}
       <input aria-label={f.label} type="number" min="0" step={f.step} value={f.value}
        onChange={e=>f.change(e.target.value)} className="mt-1 w-full min-h-11 rounded-lg border bg-background px-2 text-sm"/>
     </label>)}
   </div>
   <p className="text-sm">Projected gross rent: <strong>{Number.isFinite(monthlyRevenue)?money(Math.round(monthlyRevenue*100)):"—"}</strong> ·
    projected operating net: <strong>{Number.isFinite(projected)?money(Math.round(projected*100)):"—"}</strong></p>
   <p className="text-xs text-muted-foreground">Net excludes loan payments and monthly demand variation. Occupancy is aggregate simulated tenancy, not a change to any character's home or consent. Saved changes apply after previously completed financial months.</p>
   <button type="button" onClick={()=>void submit("configure")} disabled={pending}
     className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50">{pending?"Saving…":"Save rent, occupancy & expenses"}</button>
   {property.configured&&<div className="border-t pt-3 space-y-2 text-sm">
     <p>Renovation level: <strong>{property.renovationLevel}/5</strong></p>
     <p className="text-xs text-muted-foreground">Each renovation costs 0.5% of the property price times its next level (minimum $500) and lowers current operating costs by 5%. It does not automatically increase tenants or rent.</p>
     <button type="button" disabled={pending||property.renovationLevel>=5||finances.cashCents<renovationCost*100}
       onClick={()=>void submit("renovate")} className="min-h-11 rounded-xl border px-4 text-sm disabled:opacity-50">
       Renovate for {money(Math.round(renovationCost*100))}
     </button>
   </div>}
 </section>;
}
export function RentalPropertyManagement({finances}:{finances:FinanceSnapshot}){
 const load=useServerFn(loadRentalProperties);
 const qc=useQueryClient();
 const q=useQuery({queryKey:["finance-rentals"],queryFn:()=>load(),retry:false});
 function refresh(){void qc.invalidateQueries({queryKey:["finance-rentals"]});void qc.invalidateQueries({queryKey:["player-finances"]});}
 return <section className="mt-7 space-y-3" aria-label="Rental property management">
   <h2 className="text-xl font-semibold">Rental property management</h2>
   <p className="text-sm text-muted-foreground">Set rent and vacancy, track property-level cash flow, pay for renovations and improve loss-making rental properties. Your existing acquisitions remain yours.</p>
   {q.isLoading&&<p role="status">Loading rental properties…</p>}
   {q.error&&<p role="alert" className="text-sm">Rental controls need migration 0090. <button type="button" className="underline" onClick={()=>void q.refetch()}>Retry</button></p>}
   {q.data?.length===0&&<p className="text-sm">No owned residential properties yet. Purchase one from the marketplace above.</p>}
   {q.data?.map(property=><RentalEditor key={property.assetKey+String(property.configured)+property.renovationLevel}
     property={property} finances={finances} onChange={refresh}/>)}
 </section>;
}

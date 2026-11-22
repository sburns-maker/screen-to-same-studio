import type { CampaignActor, CampaignChoice, CampaignRoute, CampaignScene } from "./world-order-campaign";
/** New, standalone chapters after each route's first three scenes.
 * No scene from the original introduction is recycled.
 */
type Pick = [id:string,title:string,detail:string,support:number,influence:number,stability:number,actor:CampaignActor,trust:number,outcome:string];
const choice=(x:Pick):CampaignChoice=>({id:x[0],title:x[1],detail:x[2],support:x[3],influence:x[4],stability:x[5],actor:x[6],trust:x[7],outcome:x[8]});
const make=(id:string,title:string,location:string,character:string,objective:string,setup:string,options:Pick[]):CampaignScene=>({id,title,location,character,objective,setup,choices:options.map(choice)});
const episodes: Record<CampaignRoute, CampaignScene[]> = {
 reform: [
  make("reform-clinic","The clinic without medicine","Havana · Neighborhood clinic","Dr. Amalia Cruz","Protect essential care while building a viable public plan","A clinic director shows you half-empty supply cabinets. A rival coalition claims your transition is already neglecting patients. Reporters arrive as families line up outside.",[
   ["clinic","Make emergency medicine distribution transparent","Publish allocations and bring independent clinics into planning.",12,2,8,"Rafael",11,"Clinics receive priority shipments; inspectors identify bottlenecks and your rivals ask who controls the supply chain."],
   ["donor","Negotiate emergency donations","Secure supplies with public oversight.",7,6,4,"Lucía",9,"Local clinicians accept emergency donations with conditions. Critics question donor influence."],
   ["deny","Blame the previous administration","Attack your rivals rather than solve the shortage.",-11,8,-9,"Sofía",-12,"The confrontation dominates the headlines while nurses demand immediate answers."],
  ]),
  make("reform-strike","The port falls silent","Havana · Container terminal","Rafael Morales","Find a workable labor agreement","Dockworkers have stopped loading cargo. Rafael says the wage proposal excludes overtime protections; business owners warn that supplies may spoil. The strike has spread beyond the original port.",[
   ["arbitrate","Put wages and safety into binding arbitration","Recognize workers and independent mediators.",11,3,7,"Rafael",13,"Workers return in stages after both sides sign an arbitration timetable."],
   ["management","Back management's emergency terms","Restart shipping quickly at a political cost.",-8,8,-9,"Lucía",-10,"Port operations resume unevenly, but another union joins the protest."],
   ["deal","Offer a temporary agreement and public review","Buy time without discarding either side.",6,6,3,"Rafael",7,"A limited agreement protects essential cargo while negotiations continue."],
  ]),
  make("reform-education","Students surround the ministry","Havana · University square","Isabel Navarro","Resolve a student demand for freedom of expression","Students have occupied a university courtyard after administrators suspended a student newspaper. Isabel Navarro, a young organizer, asks whether the reform coalition actually protects dissent.",[
   ["restore","Call for the paper's restoration and due process","Accept public criticism as part of reform.",12,3,6,"Sofía",12,"The university agrees to review its suspension policy as students keep organizing."],
   ["mediate","Meet students and university leaders together","Build consensus through an open forum.",8,5,5,"Elena",8,"A joint panel forms, but the student editors demand firmer guarantees."],
   ["discipline","Support the administration's restrictions","Prioritize order over student demands.",-12,7,-7,"Sofía",-11,"New demonstrations form outside the ministry and civil liberties groups issue statements."],
  ]),
  make("reform-housing","The housing registry dispute","Havana · Municipal offices","Lucía Herrera","Set fair rules for disputed property claims","A leaked property registry lists homes with competing ownership claims. Lucía warns that an influential developer is lobbying to fast-track evictions before the transition adopts protections.",[
   ["moratorium","Suspend disputed evictions pending review","Prioritize residents and due process.",13,2,6,"Lucía",12,"Families remain housed while a public claims board begins examining cases."],
   ["court","Create an independent arbitration tribunal","Treat property rights and residents as competing claims.",9,5,8,"Elena",10,"The assembly appoints arbitrators, but a backlog develops quickly."],
   ["developer","Allow expedited private redevelopment","Favor investment with a risk of displacement.",-12,11,-11,"Rafael",-14,"Investors announce projects as neighborhood associations organize resistance."],
  ]),
  make("reform-rival","A rival enters the race","Santiago de Cuba · Civic auditorium","María Salcedo","Respond to an unexpectedly popular challenger","María Salcedo, a provincial mayor, announces a rival reform coalition. She accuses your allies of running Havana from television studios and challenges you to an open debate.",[
   ["debate","Accept her invitation to debate","Earn credibility through public scrutiny.",10,6,4,"Nora",9,"The debate draws national attention. María gains supporters too, but your willingness to appear earns respect."],
   ["coalition","Invite María to negotiate shared reform goals","Look for common ground without assuming she joins.",7,5,6,"Elena",10,"María agrees to explore an issue-by-issue partnership while keeping her campaign independent."],
   ["attack","Launch a personal publicity attack","Risk a polarizing political feud.",-10,9,-9,"Sofía",-13,"Your remarks go viral, but even allies complain about the tone."],
  ]),
  make("reform-constitution","The court challenges your plan","Havana · Constitutional court","Elena Valdés","Respect checks and balances under pressure","A court panel questions whether your coalition's temporary emergency powers exceed the transitional charter. Protesters gather outside as Elena asks whether you'll accept a limit on your authority.",[
   ["comply","Accept the ruling and revise the plan","Protect institutional legitimacy.",11,2,8,"Elena",14,"The coalition rewrites its proposal under judicial scrutiny, losing time but gaining credibility."],
   ["appeal","Appeal through the established process","Challenge the decision without dismantling the court.",6,6,2,"Elena",6,"The appeal proceeds and competing legal scholars debate the outcome."],
   ["defy","Ignore the panel's limits","Concentrate power and provoke a constitutional fight.",-15,14,-16,"Elena",-18,"Judges and civic groups challenge your authority as regional allies distance themselves."],
  ]),
  make("reform-hurricane","Storm warnings across the coast","Matanzas · Emergency operations center","Rafael Morales","Coordinate a disaster response","A powerful storm threatens coastal towns. Emergency officials warn that shelters are short on supplies; Rafael brings volunteers while Lucía offers trucks on uncertain terms.",[
   ["evacuate","Put shelter access and evacuation support first","Focus on people at immediate risk.",14,2,10,"Rafael",13,"Volunteers and municipal teams open additional shelters before the worst weather arrives."],
   ["logistics","Negotiate a public-private logistics network","Scale distribution under oversight.",9,7,8,"Lucía",11,"Businesses and responders coordinate supplies while watchdogs monitor pricing."],
   ["delay","Wait for a central directive","Avoid acting beyond formal authority.",-9,1,-11,"Rafael",-12,"Local officials act independently and criticize your hesitation."],
  ]),
  make("reform-media","A broadcaster demands independence","Havana · Television studio","Sofía Reyes","Protect media independence","A major television broadcaster wants to become a public-interest institution rather than a government mouthpiece. Senior officials object, saying state broadcasting is necessary for stability.",[
   ["independent","Support independent governance and funding","Give journalists safeguards against interference.",11,3,8,"Sofía",15,"The broadcaster publishes a charter and critics scrutinize the funding model."],
   ["phased","Propose a transitional oversight board","Phase in autonomy carefully.",7,5,5,"Sofía",8,"Broadcasters accept a roadmap while insisting on published milestones."],
   ["control","Keep editorial appointments under the executive","Hold onto a useful political megaphone.",-12,10,-10,"Sofía",-15,"Journalists resign and rival outlets publish accusations of censorship."],
  ]),
  make("reform-rural","The farmers' convoy","Camagüey · Agricultural cooperative","Lucía Herrera","Respond to rural producers left out of reforms","Farmers drive tractors into the town center, saying the proposed distribution rules were written without them. Food prices are rising and urban organizers are blaming rural suppliers.",[
   ["coops","Negotiate directly with farmer cooperatives","Include rural voices and shared standards.",12,3,7,"Lucía",11,"Cooperatives sign a joint delivery framework and agree to publish prices."],
   ["imports","Prioritize emergency food imports","Address shortages before structural reform.",6,7,3,"Mercer",7,"Imports ease pressure, though farmers warn that domestic producers still need a long-term plan."],
   ["mandate","Impose a mandatory delivery schedule","Use central authority to force supplies.",-10,8,-12,"Rafael",-12,"Supplies reach some cities, but farms launch coordinated protests."],
  ]),
  make("reform-security","The police oversight hearing","Havana · Public inquiry","Nora Wells","Balance public safety with independent scrutiny","A video showing disputed police conduct spreads online. Families demand an independent hearing; officers say the footage lacks context. Nora asks for your public position.",[
   ["inquiry","Back an independent public inquiry","Seek facts and protect due process.",12,2,6,"Sofía",13,"Witnesses are heard in an open inquiry and police representatives request procedural protections."],
   ["retraining","Fund oversight and training immediately","Pair reforms with an operational plan.",8,5,5,"Elena",10,"A pilot oversight program begins while the investigation remains open."],
   ["dismiss","Dismiss the allegations without review","Try to preserve institutional support.",-13,8,-11,"Sofía",-14,"Families stage a vigil and international observers demand transparency."],
  ]),
  make("reform-budget","An empty treasury report","Havana · Budget committee","Elena Valdés","Prioritize services without promising impossible spending","An independent audit reveals fewer available public funds than expected. Elena asks you to choose what to protect first. Your critics are already accusing you of hiding costs.",[
   ["essentials","Protect clinics and food programs","Tackle immediate needs with visible tradeoffs.",11,2,5,"Rafael",10,"Essential programs receive priority while infrastructure projects face delays."],
   ["audit","Publish the audit and seek cross-party compromise","Make tradeoffs public.",8,6,9,"Elena",12,"The coalition publishes a staged spending plan and negotiates shared oversight."],
   ["spin","Discredit the report and promise everything","Win applause at the cost of credibility.",-12,10,-10,"Sofía",-15,"Investigators request records and former allies accuse you of hiding the shortfall."],
  ]),
  make("reform-referendum","The island prepares to vote","Havana · National election office","María Salcedo","Honor the choice of an increasingly divided electorate","Election monitors identify contradictory referendum instructions across several provinces. María, now a formidable rival, calls for a transparent fix before any result is recognized.",[
   ["delay","Correct instructions before holding the vote","Choose legitimacy over an easy headline.",10,2,9,"Elena",13,"Electoral officials delay certification until voters have clear, consistent instructions."],
   ["observers","Invite independent monitors and publish precinct data","Make the process verifiable.",12,5,8,"Sofía",12,"Observers publish a verification plan while campaigns argue over the details."],
   ["rush","Demand immediate certification","Seek speed, invite a disputed outcome.",-13,11,-14,"Elena",-17,"Rival coalitions challenge the certification and demonstrations spread."],
  ]),
 ],
 investment: [
  make("investment-harbor","The harbor redevelopment bid","Mariel · Port authority","Lucía Herrera","Set fair terms for a major infrastructure investment","Lucía brings three competing proposals for harbor upgrades. Mercer favors a foreign consortium that excludes local maintenance contractors.",[
   ["openbid","Require transparent competing bids","Increase trust and local participation.",11,4,7,"Lucía",12,"Local firms win subcontracting rights as the port authority publishes the bids."],
   ["foreign","Favor Mercer's foreign consortium","Move quickly but accept a concentration of influence.",-7,12,-8,"Mercer",12,"A major contract advances and workers demand public disclosure."],
   ["joint","Negotiate a shared investment structure","Balance capital with local ownership.",8,7,6,"Lucía",10,"A joint venture emerges with public performance conditions."],
  ]),
  make("investment-housing","Housing prices surge","Havana · Tenant association","Rafael Morales","Keep reconstruction from displacing residents","New investment has pushed up rents. Rafael brings tenants facing eviction to your office, asking why growth has not improved their lives.",[
   ["tenants","Back tenant protections and fair hearings","Address displacement risks.",13,2,8,"Rafael",16,"Tenants gain review rights, while property investors challenge the policy."],
   ["construction","Subsidize affordable construction with local firms","Grow supply with public benchmarks.",9,6,6,"Lucía",10,"Several local builders sign affordability agreements."],
   ["market","Let developers set rents freely","Prioritize fast construction and returns.",-12,12,-12,"Rafael",-17,"Construction announcements accelerate as neighborhood protests grow."],
  ]),
  make("investment-bank","The bank's warning","Havana · Commercial bank","Daniel Mercer","Keep major projects solvent","A lender says your largest development cannot meet its next payment. Mercer proposes a risky refinancing deal that may shift liabilities onto local taxpayers.",[
   ["audit","Demand an independent debt audit","Find the exposure before committing funds.",8,3,8,"Lucía",10,"Auditors uncover avoidable costs and the refinancing deadline moves."],
   ["bridge","Negotiate limited bridge financing","Prevent an immediate collapse with controls.",6,8,3,"Mercer",8,"The project stays afloat while creditors insist on tighter terms."],
   ["guarantee","Guarantee the debt without public review","Preserve your project and take the political risk.",-13,13,-14,"Rafael",-12,"The deal moves quickly, but public watchdogs challenge the guarantee."],
  ]),
  make("investment-energy","The solar grid challenge","Cienfuegos · Utility control room","Lucía Herrera","Develop reliable power without monopoly control","Engineers propose regional solar microgrids, but a foreign supplier wants an exclusive maintenance contract. Lucía fears local technicians will be shut out.",[
   ["localtech","Train local technicians and publish maintenance terms","Invest in long-term independence.",10,4,9,"Lucía",13,"Training agreements move ahead and suppliers must compete on service standards."],
   ["exclusive","Accept the exclusive contract","Gain speed while creating dependency.",-7,11,-8,"Mercer",12,"The first systems go live; maintenance costs become a new political fight."],
   ["pilot","Run a monitored demonstration first","Limit risk and collect performance data.",7,6,7,"Lucía",9,"A pilot microgrid opens with public reporting requirements."],
  ]),
  make("investment-tourism","A resort divides the coast","Varadero · Town meeting","Sofía Reyes","Weigh jobs against environmental and community costs","A major resort proposal promises thousands of jobs. Fishermen warn that the project would block public beach access. Sofía asks who would actually benefit.",[
   ["access","Require beach access and environmental protections","Set enforceable community conditions.",10,4,8,"Sofía",13,"Developers amend the proposal and residents gain oversight seats."],
   ["proceed","Approve the project immediately","Take the jobs headline while risking opposition.",-9,11,-10,"Mercer",10,"Groundbreaking is announced as coastal residents organize demonstrations."],
   ["redesign","Ask for a smaller community-led plan","Sacrifice scale for local trust.",12,3,5,"Lucía",11,"Local businesses propose an alternative, but backers question financing."],
  ]),
  make("investment-digital","Who owns the data?","Havana · Technology forum","Nora Wells","Set clear privacy rules for public technology","A startup offers free digital identity services during the transition. Nora uncovers plans to monetize citizens' records, and the company denies wrongdoing.",[
   ["privacy","Require independent privacy protections","Limit data extraction and build trust.",11,3,9,"Sofía",14,"The procurement pauses for a public privacy review."],
   ["contract","Approve the platform as offered","Speed up access at a cost of oversight.",-13,11,-11,"Nora",-15,"The platform rolls out and privacy advocates challenge its terms."],
   ["open","Commission an open standards approach","Seek competition and meaningful consent.",9,6,6,"Lucía",10,"Local developers join a standards project with voluntary participation."],
  ]),
  make("investment-water","The water system fails","Holguín · Water works","Rafael Morales","Repair critical water infrastructure","Several neighborhoods lose clean water after aging pumps break down. Residents ask why high-profile investment projects seem more important than basic services.",[
   ["water","Redirect resources to emergency water repairs","Put immediate services first.",14,2,10,"Rafael",16,"Emergency crews restore service in phases while residents demand a permanent plan."],
   ["publicprivate","Form a transparent water repair consortium","Bring specialists under public accountability.",9,6,7,"Lucía",11,"Local utilities and contractors publish a repair timetable."],
   ["defer","Keep current commercial priorities","Delay repairs and protect project funding.",-15,10,-13,"Rafael",-18,"Protesters gather outside the project office as shortages continue."],
  ]),
  make("investment-smuggling","The missing shipments","Santiago de Cuba · Warehouse","Sofía Reyes","Investigate missing reconstruction goods","Sofía traces vanished building materials to a warehouse linked to a prominent partner. Mercer insists a rival contractor is planting rumors.",[
   ["inspect","Invite an independent inventory investigation","Follow the records regardless of allies.",11,3,8,"Sofía",16,"Inspectors secure the manifests and several contracts face review."],
   ["mediate","Meet all contractors before making accusations","Give everyone a fair hearing.",7,5,4,"Lucía",8,"A temporary audit team forms and competing explanations emerge."],
   ["bury","Suppress the inquiry to protect the project","Avoid a scandal now, risk a larger one later.",-14,12,-12,"Sofía",-18,"Leaked documents circulate and reporters demand public records."],
  ]),
  make("investment-trade","A trade partner changes the terms","Havana · Customs ministry","Daniel Mercer","Respond to a sudden contract renegotiation","An overseas buyer seeks new export terms after a market shift. Mercer recommends accepting immediately; Lucía asks for guarantees protecting local suppliers.",[
   ["suppliers","Renegotiate with supplier protections","Protect smaller producers.",10,5,7,"Lucía",11,"Suppliers gain price safeguards while trade volumes recover slowly."],
   ["deal","Sign the buyer's terms","Prioritize immediate commercial scale.",-7,12,-7,"Mercer",11,"The new agreement moves forward as producers question the concessions."],
   ["diversify","Seek multiple smaller trade partners","Reduce dependence on one buyer.",9,7,6,"Lucía",10,"The export network diversifies but requires more coordination."],
  ]),
  make("investment-health","The hospital partnership","Santa Clara · Medical campus","Lucía Herrera","Build a healthcare partnership without undermining access","A medical equipment supplier offers a new hospital wing but wants exclusive pricing rights. Doctors say that could make basic treatments unaffordable.",[
   ["publiccare","Guarantee public access and fair prices","Anchor care in clear patient safeguards.",13,3,9,"Lucía",14,"The supplier revises its terms after clinicians and residents review the plan."],
   ["fastdeal","Accept the supplier's first offer","Open the project quickly but invite pricing concerns.",-9,12,-9,"Rafael",-10,"Construction begins while patient advocates demand revised pricing."],
   ["alternatives","Invite competitive proposals from several suppliers","Trade speed for better conditions.",8,6,7,"Lucía",9,"Three suppliers submit bids with different access guarantees."],
  ]),
  make("investment-market","The price-fixing allegation","Havana · Competition authority","Nora Wells","Protect competition as your network expands","A rival accuses one of your business allies of manipulating construction prices. Nora demands to know whether you will support independent enforcement.",[
   ["regulator","Back a transparent competition inquiry","Apply scrutiny to your own partners.",10,3,8,"Nora",13,"Regulators open an evidence-led inquiry and issue public procedures."],
   ["private","Ask the companies to resolve it privately","Avoid publicity while risking public confidence.",-5,7,-6,"Lucía",-7,"A closed-door settlement angers smaller suppliers."],
   ["protect","Defend your ally without reviewing the evidence","Concentrate commercial power.",-12,11,-11,"Nora",-15,"Rival firms organize a formal legal challenge."],
  ]),
  make("investment-summit","Your economic vision faces a vote","Havana · Reconstruction council","Rafael Morales","Secure lasting public consent for your investment model","Council representatives debate whether your expanding network is helping families or simply replacing an old elite with a new one. Rafael asks for a measurable public commitment.",[
   ["benchmarks","Publish employment and service benchmarks","Tie future approvals to results.",12,4,8,"Rafael",13,"The council approves a monitored plan and schedules a performance review."],
   ["shares","Offer community investment shares","Share ownership with local residents.",10,6,5,"Lucía",12,"Residents gain a proposed ownership mechanism while legal details remain under review."],
   ["lobby","Seek council approval through private alliances","Gain influence but attract allegations of favoritism.",-12,13,-12,"Nora",-13,"The council remains divided and journalists question the process."],
  ]),
 ],
 diplomacy: [
  make("diplomacy-border","A maritime dispute","Havana · Foreign affairs office","Elena Valdés","Prevent an international dispute from escalating","Two governments dispute fishing access in shared waters. A detained civilian crew has become the subject of angry speeches, and Elena wants an independent mediator.",[
   ["mediate","Invite neutral maritime mediators","Lower tensions and protect civilians.",11,4,9,"Elena",13,"Both sides agree to talks and a civilian protection mechanism."],
   ["trade","Offer a temporary resource-sharing accord","Build compromise through practical terms.",9,6,6,"Lucía",10,"Fishing groups support a temporary arrangement with joint oversight."],
   ["threaten","Issue an ultimatum to both sides","Try to force compliance and risk backlash.",-13,11,-14,"Elena",-16,"The delegations suspend talks and regional leaders demand restraint."],
  ]),
  make("diplomacy-envoys","The unauthorized envoy","Havana · Diplomatic residence","Sofía Reyes","Respond to a secret diplomatic channel","Sofía reveals that a self-described envoy has been claiming to speak for your coalition overseas. Several foreign offices are asking whether the promises were real.",[
   ["disavow","Publish the official negotiating authority","Clarify who can make commitments.",10,3,8,"Sofía",14,"Foreign offices receive formal clarification and the envoy faces questions."],
   ["investigate","Invite oversight of all back channels","Create a durable diplomatic process.",11,4,7,"Elena",12,"A verification panel begins documenting unauthorized promises."],
   ["quiet","Handle the envoy privately","Preserve flexibility at a reputational cost.",-8,9,-9,"Sofía",-10,"Speculation spreads as partners question your coalition's credibility."],
  ]),
  make("diplomacy-refugees","Families at the crossing","Eastern Cuba · Aid coordination hub","Rafael Morales","Coordinate humane aid across borders","Families displaced by the transition need supplies and safe temporary housing. Neighboring officials disagree over responsibility, while Rafael brings a delegation of volunteers.",[
   ["aid","Coordinate humanitarian relief with civic groups","Put displaced families first.",14,2,10,"Rafael",15,"Local volunteers and regional aid workers open additional support centers."],
   ["agreement","Negotiate shared aid responsibilities","Create a sustainable regional agreement.",10,6,7,"Elena",11,"Officials agree to a temporary funding and distribution framework."],
   ["defer","Leave the issue to neighboring governments","Preserve political attention at a human cost.",-12,5,-11,"Rafael",-17,"Aid organizations criticize the delay and demand a joint response."],
  ]),
  make("diplomacy-sanctions","The sanctions negotiation","Havana · Trade delegation","Daniel Mercer","Pursue economic relief without trading away public accountability","Negotiators offer partial sanctions relief if an oversight process is accepted. Some factions call it interference, while businesses want immediate access to markets.",[
   ["oversight","Negotiate transparent oversight and limited relief","Balance independence and verification.",10,5,8,"Elena",12,"A phased proposal wins support from several delegations."],
   ["full","Demand full relief without conditions","Make a high-profile demand with limited leverage.",-7,12,-9,"Elena",-9,"Talks stall as economic groups press for a more practical plan."],
   ["pilot","Start with a monitored pilot agreement","Test cooperation and build trust.",8,7,5,"Lucía",9,"A trial commerce framework moves forward under public review."],
  ]),
  make("diplomacy-summit","The rival summit","Kingston · Regional conference","Nora Wells","Preserve relationships with skeptical regional partners","A regional bloc invites you to explain your growing influence. A rival delegation accuses you of using Cuba as a platform for personal power.",[
   ["answer","Take questions and publish your commitments","Respond openly to criticism.",12,4,7,"Nora",12,"Several leaders welcome the openness while withholding formal endorsements."],
   ["bilateral","Meet skeptical governments privately","Work through specific grievances.",7,8,5,"Elena",8,"Exploratory talks begin without immediate recognition."],
   ["walkout","Walk out and denounce the bloc","Assert independence at diplomatic cost.",-12,11,-13,"Nora",-14,"The walkout dominates headlines and potential partners postpone meetings."],
  ]),
  make("diplomacy-media","A televised allegation","Miami · News studio","Nora Wells","Respond to claims that your diplomacy hides commercial interests","An investigative program connects a private investor to an undisclosed advisory meeting. Nora asks whether your team will release its conflict-of-interest records.",[
   ["disclose","Publish advisor and funding disclosures","Accept public scrutiny.",12,3,8,"Nora",15,"The disclosures prompt fresh questions but improve confidence in the process."],
   ["review","Commission an independent ethics review","Build an institutional response.",9,5,7,"Sofía",11,"Reviewers gain access to records and promise a public report."],
   ["refuse","Refuse to answer financial questions","Protect private deals and risk legitimacy.",-13,9,-12,"Nora",-16,"The story dominates coverage and delegates demand transparency."],
  ]),
  make("diplomacy-health","An international health emergency","Havana · Joint health command","Lucía Herrera","Cooperate with neighboring governments under pressure","Hospitals face a regional supply shortage. Health agencies propose a cross-border purchasing effort, but delegations disagree about who controls distribution.",[
   ["shared","Support joint procurement with published allocations","Build trust across borders.",12,3,9,"Elena",12,"Health agencies coordinate supplies under independent monitoring."],
   ["bilateral","Broker a small bilateral supply agreement","Find a narrower solution quickly.",8,7,5,"Lucía",9,"A limited shipment arrives as broader talks continue."],
   ["national","Reserve all available supply for your own coalition","Prioritize domestic needs and strain alliances.",-10,8,-9,"Elena",-12,"Regional partners protest the exclusion and seek alternatives."],
  ]),
  make("diplomacy-elections","The observers' report","Havana · Election commission","Sofía Reyes","Protect confidence in electoral procedures","International observers publish a mixed report on the transition's elections. Some polling sites performed well; others lacked independent verification.",[
   ["audit","Open disputed precinct records to review","Address shortcomings publicly.",12,4,8,"Sofía",14,"Auditors publish a correction plan and independent observers remain involved."],
   ["reform","Negotiate stronger monitoring standards","Build a reliable process for future votes.",10,6,7,"Elena",12,"Delegations adopt a proposed monitoring framework."],
   ["reject","Reject the report without investigation","Dispute outside criticism.",-12,10,-13,"Sofía",-15,"Regional partners demand evidence while opposition groups mobilize."],
  ]),
  make("diplomacy-ambassadors","The ambassadorial dispute","Havana · State guesthouse","Elena Valdés","Resolve recognition and diplomatic protocol issues","A proposed diplomatic representative has been rejected by one regional partner after controversial remarks. Elena wants a replacement process that doesn't look like capitulation.",[
   ["replace","Propose a respected independent representative","Keep channels open.",10,5,8,"Elena",12,"The partner agrees to reconsider a new nominee."],
   ["consult","Ask both sides for a shared selection process","Seek an unusual diplomatic compromise.",8,7,5,"Nora",8,"Informal consultations resume with cautious optimism."],
   ["insist","Insist on the original nominee","Make a symbolic stand despite stalled talks.",-9,9,-10,"Elena",-11,"The dispute drags on and other initiatives slow."],
  ]),
  make("diplomacy-climate","The storm recovery compact","Bridgetown · Regional aid summit","Rafael Morales","Build a regional disaster response alliance","Several Caribbean communities are recovering from destructive storms. A proposed regional compact would pool emergency supplies, but smaller islands fear being sidelined.",[
   ["equal","Give smaller members equal oversight","Build trust across the region.",12,4,9,"Elena",12,"Delegations accept a governance plan with protections for smaller members."],
   ["resources","Prioritize shared logistics and training","Start with practical cooperation.",9,7,7,"Lucía",10,"A joint logistics initiative gains preliminary support."],
   ["centralize","Demand leadership of the new compact","Seek control at a cost to regional confidence.",-12,12,-12,"Elena",-16,"Several delegations reject the proposal and propose their own compact."],
  ]),
  make("diplomacy-currency","The payment network proposal","Havana · Economic forum","Daniel Mercer","Negotiate access to international payment systems","Businesses request a regional settlement network to reduce costly transfers. Regulators warn that weak safeguards could expose residents to fraud.",[
   ["rules","Build the network with independent consumer safeguards","Balance access and accountability.",11,5,8,"Lucía",12,"Financial regulators agree to draft shared standards."],
   ["pilot","Run a limited regulated pilot","Test the system before expansion.",8,8,5,"Mercer",9,"Participating businesses enroll under published limits."],
   ["rush","Launch immediately under private management","Claim speed without sufficient oversight.",-11,12,-12,"Nora",-14,"Consumer groups demand a suspension pending regulatory review."],
  ]),
  make("diplomacy-federation","The federation question","Havana · Continental dialogue","Elena Valdés","Consider a deeper alliance without bypassing citizens","Representatives propose an ambitious regional federation. Elena warns that shared institutions could improve cooperation—or concentrate power beyond democratic reach.",[
   ["referenda","Require popular ratification in each member state","Build a legitimate framework over time.",13,4,9,"Elena",15,"Delegates agree to explore public consultations rather than announcing a union."],
   ["charter","Draft a limited voluntary charter first","Begin cooperation with enforceable limits.",10,7,7,"Elena",12,"A draft charter circulates among civil society and partner governments."],
   ["declare","Declare federation leadership immediately","Try to seize the moment despite objections.",-14,14,-15,"Elena",-18,"Several delegations publicly reject your claim and withdraw from the dialogue."],
  ]),
 ],
};
export function campaignEpisode(route: CampaignRoute,index:number):CampaignScene|undefined {
 return episodes[route][index];
}
export function availableCampaignEpisodes(route: CampaignRoute):number { return episodes[route].length; }

/** Curated snapshot of arena-published listings; verify schedule on the venue site before describing a future event as current. */
export const PPG_ARENA = {id:"pittsburgh:ppg-paints-arena",name:"PPG Paints Arena",address:"1001 Fifth Avenue, Pittsburgh, PA 15219",timezone:"America/New_York",website:"https://www.ppgpaintsarena.com",calendarUrl:"https://www.ppgpaintsarena.com/events",verifiedOn:"2026-10-24"} as const;
export type ArenaEvent={id:string;venueId:string;date:string;time:string|null;title:string;kind:"concert"|"sports"|"comedy";source:"official_calendar_snapshot"|"fictional_game_event";sourceUrl:string};
export const PPG_ARENA_EVENTS:ArenaEvent[]=[
  {
    "id": "ppg:2026-10-24:pittsburgh-penguins-vs-nashville-predators",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-10-24",
    "time": "19:00",
    "title": "Pittsburgh Penguins vs. Nashville Predators",
    "kind": "sports",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-10-26:jonas-brothers-the-burning-up-tour-all-over-agai",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-10-26",
    "time": "19:30",
    "title": "Jonas Brothers: The Burning Up Tour All Over Again",
    "kind": "concert",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-10-28:disney-descendants-zombies-camp-rock-worlds-coll",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-10-28",
    "time": "19:00",
    "title": "Disney Descendants, ZOMBIES & Camp Rock: Worlds Collide Concert Tour",
    "kind": "concert",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-10-29:pittsburgh-penguins-vs-utah-mammoth",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-10-29",
    "time": "19:00",
    "title": "Pittsburgh Penguins vs. Utah Mammoth",
    "kind": "sports",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-03:pittsburgh-penguins-vs-vegas-golden-knights",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-03",
    "time": "19:00",
    "title": "Pittsburgh Penguins vs. Vegas Golden Knights",
    "kind": "sports",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-05:pittsburgh-penguins-vs-boston-bruins",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-05",
    "time": "19:00",
    "title": "Pittsburgh Penguins vs. Boston Bruins",
    "kind": "sports",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-07:jim-gaffigan",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-07",
    "time": "19:00",
    "title": "Jim Gaffigan",
    "kind": "comedy",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-12:sombr-with-dove-cameron-hannah-jadagu",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-12",
    "time": "19:00",
    "title": "SOMBR with Dove Cameron & Hannah Jadagu",
    "kind": "concert",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-14:pittsburgh-penguins-vs-ottawa-senators",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-14",
    "time": "19:00",
    "title": "Pittsburgh Penguins vs. Ottawa Senators",
    "kind": "sports",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-15:rush",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-15",
    "time": "19:30",
    "title": "RUSH",
    "kind": "concert",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-19:pittsburgh-penguins-vs-st-louis-blues",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-19",
    "time": "19:00",
    "title": "Pittsburgh Penguins vs. St. Louis Blues",
    "kind": "sports",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-20:motionless-in-white-with-dayseeker-the-devil-wea",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-20",
    "time": "18:30",
    "title": "Motionless In White with Dayseeker, The Devil Wears Prada & Dark Divine",
    "kind": "concert",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-21:pentatonix",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-21",
    "time": "19:00",
    "title": "Pentatonix",
    "kind": "concert",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-25:pittsburgh-penguins-vs-calgary-flames",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-25",
    "time": "19:00",
    "title": "Pittsburgh Penguins vs. Calgary Flames",
    "kind": "sports",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-11-28:pittsburgh-penguins-vs-toronto-maple-leafs",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-11-28",
    "time": "19:00",
    "title": "Pittsburgh Penguins vs. Toronto Maple Leafs",
    "kind": "sports",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  },
  {
    "id": "ppg:2026-12-19:trans-siberian-orchestra",
    "venueId": "pittsburgh:ppg-paints-arena",
    "date": "2026-12-19",
    "time": null,
    "title": "Trans-Siberian Orchestra",
    "kind": "concert",
    "source": "official_calendar_snapshot",
    "sourceUrl": "https://www.ppgpaintsarena.com/events"
  }
] as ArenaEvent[];
/** Alternate-universe game concert; deliberately NOT on the arena's real calendar. */
export const FICTIONAL_PPG_EVENTS:ArenaEvent[]=[{
 id:"ppg:2026-10-26:green-day-fictional",
 venueId:PPG_ARENA.id,
 date:"2026-10-26",time:"19:30",title:"Green Day — Fictional Concert",
 kind:"concert",source:"fictional_game_event",sourceUrl:""
}];
export const ALL_PPG_GAME_EVENTS=[...PPG_ARENA_EVENTS,...FICTIONAL_PPG_EVENTS];
export function eventsForVenue(venueId:string,from="2026-10-24"){return venueId===PPG_ARENA.id?ALL_PPG_GAME_EVENTS.filter(e=>e.date>=from).sort((a,b)=>a.date.localeCompare(b.date)||String(a.time).localeCompare(String(b.time))):[];}
export function nextArenaEvent(date:string){return PPG_ARENA_EVENTS.find(e=>e.date===date);}

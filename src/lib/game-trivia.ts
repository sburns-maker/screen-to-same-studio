export type TriviaQuestion = { category: string; question: string; choices: [string,string,string,string]; correct: number };
export const QUESTION_BANK: TriviaQuestion[] = [
  {category:"Movies",question:"Who played Rick O'Connell in The Mummy (1999)?",choices:["Tom Cruise","Brendan Fraser","Harrison Ford","Keanu Reeves"],correct:1},
  {category:"Science",question:"Which planet has the largest moon in the Solar System?",choices:["Saturn","Neptune","Jupiter","Mars"],correct:2},
  {category:"Music",question:"Which band recorded Bohemian Rhapsody?",choices:["Queen","ABBA","The Beatles","Fleetwood Mac"],correct:0},
  {category:"Geography",question:"What is the capital of Australia?",choices:["Sydney","Melbourne","Canberra","Perth"],correct:2},
  {category:"History",question:"What year did the Berlin Wall fall?",choices:["1985","1989","1991","1994"],correct:1},
  {category:"Nature",question:"Which animal has three hearts?",choices:["Octopus","Dolphin","Sea turtle","Penguin"],correct:0},
  {category:"Movies",question:"In The Princess Bride, who says 'As you wish'?",choices:["Inigo","Vizzini","Westley","Fezzik"],correct:2},
  {category:"Science",question:"Which element has the symbol Au?",choices:["Silver","Gold","Argon","Aluminum"],correct:1},
  {category:"History",question:"Who was the first woman to win a Nobel Prize?",choices:["Ada Lovelace","Marie Curie","Rosalind Franklin","Jane Goodall"],correct:1},
  {category:"Geography",question:"On which continent is the Atacama Desert?",choices:["Africa","Asia","South America","Australia"],correct:2},
  {category:"Sports",question:"How many players does a baseball team field on defense?",choices:["7","8","9","10"],correct:2},
  {category:"Science",question:"What gas do plants absorb in photosynthesis?",choices:["Oxygen","Nitrogen","Carbon dioxide","Helium"],correct:2},
  {category:"Movies",question:"Which movie features the line 'There's no place like home'?",choices:["Casablanca","The Wizard of Oz","Titanic","E.T."],correct:1},
  {category:"History",question:"Who painted the ceiling of the Sistine Chapel?",choices:["Michelangelo","Raphael","Da Vinci","Rembrandt"],correct:0},
  {category:"Geography",question:"Which ocean is the deepest?",choices:["Atlantic","Indian","Pacific","Arctic"],correct:2},
  {category:"Music",question:"Which instrument has 88 keys in its standard form?",choices:["Harp","Piano","Accordion","Organ"],correct:1},
  {category:"Science",question:"What is the hardest naturally occurring mineral?",choices:["Quartz","Diamond","Topaz","Corundum"],correct:1},
  {category:"Nature",question:"What is a group of crows traditionally called?",choices:["A pride","A murder","A pod","A colony"],correct:1},
  {category:"History",question:"The ancient city of Pompeii was buried by which volcano?",choices:["Etna","Stromboli","Vesuvius","Fuji"],correct:2},
  {category:"Geography",question:"Which country has the city of Kyoto?",choices:["China","Japan","South Korea","Thailand"],correct:1},
  {category:"Movies",question:"Who directed Jurassic Park (1993)?",choices:["James Cameron","Steven Spielberg","Tim Burton","Ridley Scott"],correct:1},
  {category:"Music",question:"Which musician was known as the King of Pop?",choices:["Prince","Elvis Presley","Michael Jackson","David Bowie"],correct:2},
  {category:"Sports",question:"How many points is a touchdown worth before any conversion?",choices:["3","5","6","7"],correct:2},
  {category:"Science",question:"Which part of a cell contains most of its genetic material?",choices:["Nucleus","Membrane","Ribosome","Cytoplasm"],correct:0},
  {category:"Geography",question:"What is the capital of Canada?",choices:["Toronto","Ottawa","Montreal","Vancouver"],correct:1},
  {category:"Nature",question:"What is the fastest land animal?",choices:["Pronghorn","Cheetah","Ostrich","Lion"],correct:1},
  {category:"History",question:"Which ancient civilization built Machu Picchu?",choices:["Maya","Aztec","Inca","Olmec"],correct:2},
  {category:"Movies",question:"What is the name of the cowboy toy in Toy Story?",choices:["Buzz","Woody","Rex","Slinky"],correct:1},
  {category:"Music",question:"Which singer released the album 21 in 2011?",choices:["Adele","Rihanna","Beyoncé","Taylor Swift"],correct:0},
  {category:"Science",question:"Which planet is commonly called the Red Planet?",choices:["Venus","Mars","Mercury","Jupiter"],correct:1},
  {category:"Geography",question:"Which mountain range includes Mount Everest?",choices:["Andes","Alps","Himalayas","Rockies"],correct:2},
  {category:"Nature",question:"What type of animal is an axolotl?",choices:["Fish","Amphibian","Reptile","Mammal"],correct:1},
  {category:"Movies",question:"What fictional African country appears in Black Panther?",choices:["Zamunda","Genovia","Wakanda","Latveria"],correct:2},
  {category:"Sports",question:"What sport uses the terms birdie and eagle?",choices:["Tennis","Golf","Cricket","Baseball"],correct:1},
  {category:"History",question:"In what year did the Titanic sink?",choices:["1905","1912","1918","1923"],correct:1},
  {category:"Music",question:"Which city is associated with the birth of Motown Records?",choices:["Chicago","Detroit","Nashville","Memphis"],correct:1},
  {category:"Science",question:"What is the chemical formula for water?",choices:["CO2","H2O","NaCl","O2"],correct:1},
  {category:"Geography",question:"Which river flows through Paris?",choices:["Danube","Thames","Seine","Rhine"],correct:2},
  {category:"Nature",question:"Which mammal lays eggs?",choices:["Otter","Platypus","Koala","Sloth"],correct:1},
  {category:"Movies",question:"What was the first feature-length animated Disney film?",choices:["Pinocchio","Fantasia","Snow White and the Seven Dwarfs","Dumbo"],correct:2},
];
function shuffled(n:number):number[]{
 const a=Array.from({length:n},(_,i)=>i);
 for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}
 return a;
}
export function nextTriviaDeck(previous:number[]=[],count=10):number[]{
 const forbidden=new Set(previous.slice(-Math.min(count,QUESTION_BANK.length-count)));
 const candidates=shuffled(QUESTION_BANK.length).filter(i=>!forbidden.has(i));
 return candidates.slice(0,count);
}

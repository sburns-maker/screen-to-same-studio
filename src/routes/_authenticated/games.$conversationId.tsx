import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react";
import { conversationQuery } from "@/lib/tess-queries";
import { characterFor } from "@/lib/characters";
import { useQuery } from "@tanstack/react-query";
import { QUESTION_BANK, nextTriviaDeck, type TriviaQuestion } from "@/lib/game-trivia";
import { WordHunt } from "@/components/games/WordHunt";
import { EightBall } from "@/components/games/EightBall";
import { GameChat } from "@/components/games/GameChat";

export const Route = createFileRoute("/_authenticated/games/$conversationId")({
  component: GameRoom,
});

type Game = "trivia" | "four" | "words" | "pool";
type Question = TriviaQuestion;
type TriviaProgress = { answers: number[]; deck: number[]; previous: number[]; round: number };
type FourState = { board: number[]; ended: number | null };
type Saved = { game: Game; trivia: TriviaProgress; four: FourState; fourRound?: number };
const fresh = (): Saved => ({
  game: "trivia",
  trivia: { answers: [], deck: nextTriviaDeck(), previous: [], round: 0 },
  four: { board: Array(42).fill(0), ended: null },
  fourRound: 0,
});
const index = (r: number, c: number) => r * 7 + c;
function winner(board: number[]): number | null {
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const n = board[index(r, c)];
    if (!n) continue;
    for (const [dr, dc] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      if (Array.from({ length: 4 }, (_, k) => [r + k * dr, c + k * dc]).every(([rr, cc]) =>
        rr >= 0 && rr < 6 && cc >= 0 && cc < 7 && board[index(rr, cc)] === n)) return n;
    }
  }
  return board.every(Boolean) ? 0 : null;
}
function place(board: number[], col: number, player: number): number[] | null {
  const copy = [...board];
  for (let row = 5; row >= 0; row--) if (!copy[index(row, col)]) {
    copy[index(row, col)] = player;
    return copy;
  }
  return null;
}
function computerColumn(board: number[]): number {
  const legal = [3, 2, 4, 1, 5, 0, 6].filter((c) => place(board, c, 2));
  for (const player of [2, 1]) {
    const winning = legal.find((c) => winner(place(board, c, player)!) === player);
    if (winning !== undefined) return winning;
  }
  return legal[0] ?? -1;
}
function opponentCorrect(question: Question, round: number, key: string): boolean {
  // A reproducible, fallible baseline opponent. Replace with server-managed character skill later.
  const favored = key === "maya" ? "Movies" : key === "tess" ? "Science" : "";
  const threshold = question.category === favored ? 8 : 6;
  return (round * 7 + question.question.length + key.length) % 10 < threshold;
}
function GameRoom() {
  const { conversationId } = Route.useParams();
  const conv = useQuery(conversationQuery(conversationId));
  const character = characterFor((conv.data?.character as { key?: string } | null)?.key);
  const storageKey = `aitown:games:prototype:${conversationId}`;
  const [saved, setSaved] = useState<Saved>(fresh);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (s && ["trivia", "four", "words", "pool"].includes(s.game) && Array.isArray(s.four?.board) && s.four.board.length === 42 && Array.isArray(s.trivia?.answers)) setSaved({ ...s, trivia: Array.isArray(s.trivia.deck) && s.trivia.deck.length === 10 ? s.trivia : { answers: [], deck: nextTriviaDeck(), previous: [], round: 0 } });
    } catch { /* damaged local draft: start fresh */ }
    setReady(true);
  }, [storageKey]);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(saved)); }, [saved, storageKey, ready]);
  function answer(choice: number) {
    setSaved((s) => s.trivia.answers.length >= s.trivia.deck.length ? s : ({
      ...s, trivia: { ...s.trivia, answers: [...s.trivia.answers, choice], round: s.trivia.round + 1 },
    }));
  }
  function drop(column: number) {
    setSaved((s) => {
      if (s.four.ended !== null) return s;
      const first = place(s.four.board, column, 1);
      if (!first) return s;
      let outcome = winner(first), board = first;
      if (outcome === null) {
        const response = computerColumn(first);
        board = response < 0 ? first : place(first, response, 2)!;
        outcome = winner(board);
      }
      return { ...s, four: { board, ended: outcome } };
    });
  }
  const deck = saved.trivia.deck.map((i) => QUESTION_BANK[i]).filter(Boolean);
  const total = saved.trivia.answers.length;
  const playerScore = saved.trivia.answers.filter((a, i) => deck[i] && a === deck[i].correct).length;
  const computerScore = deck.slice(0, total).filter((q, i) => opponentCorrect(q, i, character.key)).length;
  const finished = total === deck.length;
  const question = deck[total];
  const [extraResult,setExtraResult] = useState<{game:Game;key:string;description:string}|null>(null);
  const [extraResult,setExtraResult] = useState<{game:Game;key:string;description:string}|null>(null);
  const result = saved.game === "trivia" && finished
    ? {key:"trivia:"+saved.trivia.round+":"+saved.trivia.deck.join("-"),description:"We just finished a 10-question trivia match. I scored "+playerScore+" and you scored "+computerScore+". "+(playerScore>computerScore?"I won.":playerScore<computerScore?"You won.":"It was a tie.")+" (Game result from AI Town.)"}
    : saved.game === "four" && saved.four.ended !== null
    ? {key:"four:"+(saved.fourRound??0)+":"+saved.four.board.join(""),description:"We just finished a Four in a Row match. "+(saved.four.ended===0?"It was a draw.":saved.four.ended===1?"I won.":"You won.")+" (Game result from AI Town.)"}
    : extraResult?.game===saved.game ? extraResult : null;
  return (
    <main className="mx-auto min-h-dvh max-w-xl bg-background px-4 pb-24 pt-safe">
      <header className="flex h-16 items-center gap-3">
        <Link to="/chat/$conversationId" params={{ conversationId }} aria-label="Back to conversation" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"><ArrowLeft /></Link>
        <div className="flex-1"><h1 className="text-xl font-semibold">Game room</h1><p className="text-sm text-muted-foreground">Playing with {character.preferredName}</p></div>
        <Trophy className="text-primary" />
      </header>
      <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Choose a game">
        {(["trivia", "four", "words", "pool"] as const).map((g) => <button key={g} type="button" onClick={() => setSaved((s) => ({ ...s, game: g }))} aria-pressed={saved.game === g} className={`min-h-12 rounded-xl border p-3 font-medium ${saved.game === g ? "border-primary bg-primary/10" : "bg-card"}`}>{g === "trivia" ? "🧠 Trivia" : g === "four" ? "🔴 Four in a Row" : g === "words" ? "🔤 Word Hunt" : "🎱 8 Ball"}</button>)}
      </div>
      {saved.game === "trivia" ? (
        <section className="mt-6 space-y-5" aria-label="Trivia game">
          <div className="flex justify-between rounded-xl bg-muted p-4 text-center"><div><div className="text-sm">You</div><div className="text-2xl font-bold">{playerScore}</div></div><div className="self-center text-sm text-muted-foreground">Question {Math.min(total + 1, deck.length)}/{deck.length}</div><div><div className="text-sm">{character.preferredName}</div><div className="text-2xl font-bold">{computerScore}</div></div></div>
          {finished ? (
            <div className="space-y-4 rounded-xl border bg-card p-5 text-center">
              <h2 className="text-2xl font-semibold">{playerScore > computerScore ? "You win!" : playerScore < computerScore ? `${character.preferredName} wins!` : "It's a tie!"}</h2>
              <p className="text-muted-foreground">Answer scores are computed from the actual question bank. Chat during games uses the same relationship engine as Messages.</p>
              <button type="button" className="w-full rounded-xl bg-primary p-3 text-primary-foreground" onClick={() => setSaved((s) => ({ ...s, trivia: { answers: [], deck: nextTriviaDeck(s.trivia.deck), previous: s.trivia.deck, round: s.trivia.round + 1 } }))}>Rematch</button>
            </div>
          ) : (
            <div className="space-y-4 rounded-xl border bg-card p-5">
              <div className="text-sm font-medium text-primary">{question.category}</div><h2 className="text-xl font-semibold">{question.question}</h2>
              <div className="grid gap-3">{question.choices.map((choice, i) => <button type="button" key={choice} onClick={() => answer(i)} className="min-h-14 rounded-xl border bg-background px-4 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{String.fromCharCode(65 + i)}. {choice}</button>)}</div>
            </div>
          )}
        </section>
      ) : saved.game === "words" ? <WordHunt character={character.preferredName} onFinish={(score,target,round)=>setExtraResult({game:"words",key:"words:"+round+":"+Date.now(),description:"We finished Word Hunt. My score was "+score+" points against your computer benchmark of "+target+" points. (AI Town game result.)"})} /> : saved.game === "pool" ? <EightBall onFinish={(won,shots)=>setExtraResult({game:"pool",key:"pool:"+shots+":"+Date.now(),description:"We finished an 8 Ball match. "+(won?"I won.":"You won.")+" I took "+shots+" shots. (AI Town game result.)"})} /> : (
        <section className="mt-6 space-y-4" aria-label="Four in a Row game">
          <div className="rounded-xl bg-muted p-4 text-center font-medium">{saved.four.ended === null ? "Your turn · Red" : saved.four.ended === 0 ? "Draw!" : saved.four.ended === 1 ? "You win!" : `${character.preferredName} wins!`}</div>
          <div className="grid grid-cols-7 gap-1 rounded-2xl bg-blue-700 p-2" role="group" aria-label="Game board">
            {saved.four.board.map((piece, i) => <button type="button" key={i} onClick={() => drop(i % 7)} disabled={saved.four.ended !== null} aria-label={`Drop in column ${(i % 7) + 1}`} className="aspect-square min-w-0 rounded-full bg-blue-900/40 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-default"><span className={`block h-full w-full rounded-full ${piece === 1 ? "bg-red-400" : piece === 2 ? "bg-yellow-300" : "bg-background"}`} /></button>)}
          </div>
          <p className="text-center text-sm text-muted-foreground">Tap any hole in a column to drop a red piece. {character.preferredName} plays yellow.</p>
          <button type="button" onClick={() => setSaved((s) => ({ ...s, fourRound: (s.fourRound??0)+1, four: { board: Array(42).fill(0), ended: null } }))} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border bg-card"><RotateCcw size={16}/> New game</button>
        </section>
      )}
      <GameChat conversationId={conversationId} name={character.preferredName} game={saved.game} result={result} />
      <p className="mt-8 text-center text-xs text-muted-foreground">Playable prototypes · Trivia and Four in a Row save locally · Multiplayer and AI-driven characters coming next</p>
    </main>
  );
}

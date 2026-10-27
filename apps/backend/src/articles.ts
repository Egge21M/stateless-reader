// Publisher-only fixtures. IDs and offers are permanent: corrections may change
// a body, but an ID must never be reassigned to an unrelated article.
const mint = "https://mint.minibits.cash/Bitcoin";

export const articles = [
  {
    id: "the-quiet-web",
    title: "The quiet web",
    preview: "What happens when we build places to read, instead of places to scroll?",
    offer: { amount: 21, unit: "sat", mint },
    body: "A quiet website begins with a stopping point. The reader arrives for one idea, follows it to its conclusion, and leaves with something to consider. There is no next item waiting to replace the thought.\n\nDesigning for that ending changes the whole page. Navigation becomes a map instead of a conveyor belt. A clear price makes the exchange visible. Typography and space do the work that urgency once did.\n\nSmall publications can test this approach without rebuilding the internet. Publish a finite collection, make each piece useful on its own, and measure whether readers return deliberately. Attention given freely is a better foundation than attention held by friction.",
  },
  {
    id: "a-library-in-your-pocket",
    title: "A library in your pocket",
    preview: "A field guide to keeping the things you read useful long after the tab is closed.",
    offer: { amount: 34, unit: "sat", mint },
    body: "The most useful library is not the largest one. It is the collection in which you can find the passage that changed your mind. Start with a short note about why a piece matters, written while its argument is still fresh.\n\nOrganize around questions rather than subjects. A folder called cities can contain almost anything; a question about making streets safer gives each saved article a purpose. Let a piece belong to several questions when it needs to.\n\nRevisit the collection occasionally and remove what no longer serves you. A library is a working instrument, not proof that you have kept up. Its value lies in the connections you can make when a new question arrives.",
  },
  {
    id: "the-price-of-a-page",
    title: "The price of a page",
    preview: "Between advertising and subscriptions, there is room for a smaller exchange.",
    offer: { amount: 21, unit: "sat", mint },
    body: "One page can be the right unit of exchange. A reader with a single question may value one careful answer without wanting a recurring commitment. A publisher can make that answer available at an explicit price.\n\nThe challenge is not only moving money. Readers need to know what they are buying, how they can return, and what happens when their device changes. Those promises belong beside the price, in language that does not require a technical background.\n\nThis model will not suit every publication. Reporting has shared costs and uncertain outcomes. But individual access offers another experiment: a direct relationship between the usefulness of an article and the reader who chooses it.",
  },
  {
    id: "repair-as-a-habit",
    title: "Repair as a habit",
    preview: "What a neighborhood repair table can teach us about durable digital tools.",
    offer: { amount: 55, unit: "sat", mint },
    body: "At a repair table, the first tool is a question: what changed before this stopped working? The answer narrows the problem and gives the owner a role in solving it. Repair becomes a shared investigation.\n\nDigital tools can invite the same habit. Explain failures plainly, keep useful work recoverable, and make the next step visible. A retry button is helpful only when the person understands what it will attempt again.\n\nDurability also depends on restraint. A tool with fewer moving parts has fewer ways to surprise its owner. Maintenance starts at design time, with choices that leave future readers and builders room to understand the system.",
  },
  {
    id: "notes-from-a-slow-train",
    title: "Notes from a slow train",
    preview: "On distance, observation, and the value of taking the longer route.",
    offer: { amount: 34, unit: "sat", mint },
    body: "The slow train reveals the seams between places. Shops give way to workshops, then gardens, then fields. What a fast journey turns into a single transition becomes a sequence of small decisions about how people live.\n\nObservation improves when there is time to revise a first impression. A station that looks empty fills at the next stop. An ordinary bridge frames a river that has shaped the town for centuries. The route becomes an argument for looking twice.\n\nSlowness is not always a choice, and speed has real value. But when the timetable allows it, a longer route can change the purpose of a journey. Arrival remains important; it no longer contains the whole experience.",
  },
  {
    id: "tools-that-let-you-leave",
    title: "Tools that let you leave",
    preview: "Good software should make an exit as understandable as an entrance.",
    offer: { amount: 55, unit: "sat", mint },
    body: "An exit is part of a product. Exporting work, clearing a session, and understanding what remains behind are ordinary needs rather than exceptional events. Treating them as first-class actions makes trust easier to assess.\n\nA useful exit explains its limits. Clearing active application state does not erase every copy that might exist elsewhere. A backup restores only what the system actually promises to preserve. Precise language helps people make choices they can live with.\n\nTools that permit departure can earn return visits for better reasons. Their value becomes the work they help people do, rather than the cost of leaving. That is a demanding standard, and a practical one.",
  },
] as const;

// Explicit projection prevents future private fields from entering the catalogue.
export function publicCatalogue(mintOverride?: string) {
  return articles.map(({ id, title, preview, offer }) => ({
    id, title, preview,
    offer: { amount: offer.amount, unit: offer.unit, mint: mintOverride ?? offer.mint },
  }));
}

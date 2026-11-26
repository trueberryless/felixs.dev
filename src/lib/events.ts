import { actorDid } from "./const";

interface EventLike {
  endDate: string;
  locationText: string;
  people: {
    avatar: string | undefined;
    did: string;
    handle: string;
    name: string;
  }[];
}

export interface Person {
  avatar: string | undefined;
  /** How many of my events they went to as well. */
  count: number;
  did: string;
  handle: string;
  name: string;
}

/** Everyone I met at the events I went to, most met first, without me. */
export function getPeopleMet(events: EventLike[], nowMs: number): Person[] {
  const people = new Map<string, Person>();
  for (const event of events) {
    if (Date.parse(event.endDate) > nowMs) continue;
    for (const person of event.people) {
      if (person.did === actorDid) continue;
      const known = people.get(person.did) ?? { ...person, count: 0 };
      known.count++;
      people.set(person.did, known);
    }
  }
  return [...people.values()].toSorted(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
}

/** The places of my events, most visited first. */
export function getPlaces(
  events: EventLike[]
): { count: number; name: string }[] {
  const places = new Map<string, number>();
  for (const event of events) {
    const name = event.locationText.trim();
    if (name) places.set(name, (places.get(name) ?? 0) + 1);
  }
  return [...places]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, count]) => ({ count, name }));
}

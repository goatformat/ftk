import {DATA} from './data';

// An ID is just a branded single character string chosen to represent each card in question (see
// Ids below). A DeckID is an ID or an ID surrounded by parantheses to indicate that it is either
// known in the deck or facedown a zone. A FieldID further extends the concept of the DeckID,
// optionally allowing for a number to be appended to the ID character in question to indicate
// additional state (eg. whether a card has been activated, which monster an Equip Spell is attached
// to, the number of Spell Counters on a card, etc),
interface As<T> { __brand: T }
export type ID = string & As<'ID'>;
export type DeckID = ID | string & As<'DeckID'>;
export type FieldID = ID | string & As<'FieldID'>;

// Utilities for encoding and decoding IDs. Storing state in minimal string representations results
// in mimimal memory and serialization overhead.
export const ID = new class {
  facedown(id?: FieldID | DeckID) {
    return !!id && id.charAt(0) === '(';
  }
  known(id?: DeckID) {
    return this.facedown(id);
  }
  data(id: FieldID) {
    if (this.facedown(id)) id = id.slice(1, -1) as FieldID;
    return (id.length > 1) ? +id.slice(1) : 0;
  }
  id(id: ID | FieldID | DeckID) {
    return id.charAt(this.facedown(id) ? 1 : 0) as ID;
  }
  decode(id: ID | FieldID | DeckID) {
    return DATA[this.id(id)];
  }
  pretty(id: ID | FieldID | DeckID) {
    const card = this.decode(id);
    const data = this.data(id as FieldID);
    const name = data ? `${card.name}:${data}` : card.name;
    return this.facedown(id) ? `(${name})` : name;
  }
  names(ids: (ID | FieldID | DeckID)[]) {
    if (!ids.length) throw new RangeError();
    const names = ids.map(id => `"${this.decode(id).name}"`);
    if (names.length === 1) return names[0];
    const last = names.pop()!;
    return `${names.join(', ')} and ${last}`;
  }
};

export const Ids = {
  LevelLimitAreaB: 'A' as ID,
  BlackPendant: 'B' as ID,
  CardDestruction: 'C' as ID,
  DifferentDimensionCapsule: 'D' as ID,
  AFeatherOfThePhoenix: 'F' as ID,
  GracefulCharity: 'G' as ID,
  HeavyStorm: 'H' as ID,
  CyberJar: 'J' as ID,
  PrematureBurial: 'K' as ID,
  RoyalMagicalLibrary: 'L' as ID,
  ArchfiendsOath: 'O' as ID,
  PotOfGreed: 'P' as ID,
  ReversalQuiz: 'Q' as ID,
  Reload: 'R' as ID,
  Sangan: 'S' as ID,
  GiantTrunade: 'T' as ID,
  UpstartGoblin: 'U' as ID,
  ConvulsionOfNature: 'V' as ID,
  ToonWorld: 'W' as ID,
  ToonTableOfContents: 'X' as ID,
  ThunderDragon: 'Y' as ID,
  SpellReproduction: 'Z' as ID,
};

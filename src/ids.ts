import {CARDS} from './data';

// All cards are stored internal as an 'ID', which is a single character code in the ASCII range
// that encodes not only the card in question but also its state (ie. whether its face down, whether
// its been activated, how many counters it has, etc). This encoding is *not* generic - each ID is
// carefully chosen and can only be used to represent that cards and states that are used by Library
// FTK.
//
// Choosing an efficient representation for IDs is crucial - by encoding most of the simulator's
// data types as small integers we become eligible for V8's Smi optimizations (eg. all of our
// locations get to be PACKED_SMI_ELEMENTS) and use the fastest operations. Importantly, it also
// reduces memory overhead which is important as GC dominates the run time cost of search due to
// the amount of encodes States we need to keep around tp dedupe.
//
// For type-safety, we brand the character codes:
//
//  - An ID represents a card in any location with no additional state (eg. face up on the field)
//  - A DeckID is an ID or a facedown / known ID, represented by the lower-case character (or in
//    human-readable encoding, by the ID being surrounded by parentheses)
//  - A FieldID further extends the concept of the DeckID, optionally allowing for a number to be
//    associated with the ID in question to indicate additional state (eg. whether a card has been
//    activated, which monster an Equip Spell is attached to, the number of Spell Counters on a
//    card, etc)
//
interface As<T> { __brand: T }
export type ID = number & As<'ID'>;
export type DeckID = ID | number & As<'DeckID'>;
export type FieldID = ID | number & As<'FieldID'>;

// Alias for turning a single character into its character code - the compiler should be able to
// turn all of these calls into constants for us so that the source file doesn't have to be littered
// with ASCII codes...
// TODO: confirm V8 isn't actually dumb...
const $ = (s: string) => s.charCodeAt(0);

// The various encodings for a face-up Royal Magical Library with 0-3 Spell Counters
const LIBRARY = [$('L'), $('<'), $('='), $('>')] as FieldID[];

// Drops the data associated with a FieldID, returning the 'raw' ID
const raw = (id: FieldID) => {
  if (id >= $('<') && id <= $('>')) return Ids.RoyalMagicalLibrary;
  if (id === $('@')) return Ids.ArchfiendsOath;
  if (id >= $('0') && id <= $('4')) return Ids.BlackPendant;
  if (id >= $('5') && id <= $('9')) return Ids.PrematureBurial;
  if (id === $('*')) return Ids.DifferentDimensionCapsule;
  throw new RangeError(`Invalid ID: ${String.fromCharCode(id)}`);
};

// Utilities for handling IDs
export const ID = new class {
  // Determines whether an ID represents a face-down card
  facedown(this: void, id?: FieldID | DeckID) {
    return !!id && id >= $('a') && id <= $('z');
  }
  // Flips a card from face-up to face-down or vice-versa. If a card had state it loses it when it
  // gets flipped down (NB: face-down cards cannot have state due to the rules of Yu-Gi-Oh!)
  toggle(this: void, id: FieldID | DeckID): ID | DeckID | FieldID {
    return (((id >= $('A') && id <= $('Z') || id >= $('a') && id <= $('z'))
      ? id : raw(id as FieldID)) ^ 0x20) as ID | DeckID | FieldID;
  }
  // Determines whether an ID represents a known card in the Deck (or a card banished face-down)
  known(this: void, id?: DeckID) {
    return ID.facedown(id);
  }
  // Retrieves data associated with the card - this might be a Spell Counter, an indication of
  // whether a card was activated, a bit used for counting turns, or an index of Zone the Monster an
  // Equip Spell is equipped to is located
  get(this: void, id: FieldID) {
    if (id >= $('A') && id <= $('Z') || id >= $('a') && id <= $('z')) return 0;
    if (id >= $('<') && id <= $('>')) return id - $('<') + 1;
    if (id === $('@') || id === $('*')) return 1;
    if (id >= $('0') && id <= $('9')) return (id - $('0')) % 5;
    return 0;
  }
  // Sets data associated with a card
  // PRECONDITION: data is in valid range for the ID in question
  set(this: void, id: ID, data: number) {
    switch (id) {
    case Ids.RoyalMagicalLibrary: return LIBRARY[data];
    case Ids.ArchfiendsOath: return data ? $('@') as FieldID : Ids.ArchfiendsOath;
    case Ids.BlackPendant: return ($('0') + data) as FieldID;
    case Ids.PrematureBurial: return ($('5') + data) as FieldID;
    case Ids.DifferentDimensionCapsule:
      return data ? Ids.DifferentDimensionCapsule : $('*') as FieldID;
    }
    throw new RangeError(`Invalid ID: ${id}`);
  }
  // Returns the raw ID given an ID of any type
  id(this: void, id: ID | FieldID | DeckID) {
    if (id >= $('A') && id <= $('Z')) return id as ID;
    if (id >= $('a') && id <= $('z')) return (id ^ 0x20) as ID;
    return raw(id as FieldID);
  }
  // Determines the Card that an ID is meant to represent
  decode(this: void, id: ID | FieldID | DeckID) {
    return CARDS[ID.id(id)];
  }
};

// Formatter supports alternate (more human readable) ways of encoding/displaying IDs
export const Formatter = new class {
  // Encodes ids in a more human friendly (but still compact) format
  encode(this: void, ids: (ID | FieldID | DeckID)[]) {
    let s = '';
    for (const id of ids) s += Formatter.human(id);
    return s;
  }
  // Decodes an array of IDs that were encoded in the human readable format described below
  decode(this: void, s: string) {
    const ids: (ID | FieldID | DeckID)[] = [];
    let id = '';
    let ok = true;
    for (let i = 0; i < s.length; i++) {
      if (ok && id) {
        ids.push(Formatter.unhuman(id));
        id = '';
      }
      id += s[i];
      ok = i < s.length - 1 && s[i + 1] === '(' ||
        (id[0] === '(' ? id[id.length - 1] === ')' : (s[i + 1] >= 'A' && s[i + 1] <= 'Z'));
    }
    if (id) ids.push(Formatter.unhuman(id));
    return ids;
  }
  // Encodes an ID in a more human-readable format than the default encoding. Raw IDs are encoded
  // the same way, but face-down/known IDs get wrapped in parentheses instead of being turned to
  // lower-case, and additional data gets appended as a number instead of being represented by an
  // entirely different character. The IDs are still compact but are less efficient and only should
  // be used for debugging purposes.
  human(this: void, id: ID | FieldID | DeckID) {
    if (id >= $('A') && id <= $('Z')) return String.fromCharCode(id);
    if (id >= $('a') && id <= $('z')) return `(${String.fromCharCode((id ^ 0x20))})`;
    if (id >= $('<') && id <= $('>')) return `L${id - $('<') + 1}`;
    if (id === $('@')) return 'O1';
    if (id >= $('0') && id <= $('4')) return `B${id - $('0')}`;
    if (id >= $('5') && id <= $('9')) return `K${id - $('5')}`;
    if (id === $('*')) return 'D1';
    throw new RangeError(`Invalid ID: ${String.fromCharCode(id)}`);
  }
  // Decodes an ID encoded in the human readable format
  unhuman(this: void, s: string) {
    if (s.length === 1) return $(s[0]) as ID;
    if (s.startsWith('(')) return ($(s[1]) ^ 0x20) as DeckID | FieldID;
    switch (s[0]) {
    case 'L': return LIBRARY[+s[1]];
    case 'O': return $('@') as FieldID;
    case 'B': return ($('0') + +s[1]) as FieldID;
    case 'K': return ($('5') + +s[1]) as FieldID;
    case 'D': $('*') as FieldID;
    }
    throw new RangeError(`Invalid legacy ID: ${s}`);
  }
  // Takes the human encoding one step further by additionally rendering the name of the card
  // encoded instead of the ID
  pretty(this: void, id: ID | FieldID | DeckID) {
    const card = ID.decode(id);
    const data = ID.get(id as FieldID);
    const name = data ? `${card.name}:${data}` : card.name;
    return ID.facedown(id) ? `(${name})` : name;
  }
  // Turns an array of IDs into a displayable string with the card's names
  names(this: void, ids: (ID | FieldID | DeckID)[]) {
    if (!ids.length) throw new RangeError();
    const names = ids.map(id => `"${ID.decode(id).name}"`);
    if (names.length === 1) return names[0];
    const last = names.pop()!;
    return `${names.join(', ')} and ${last}`;
  }
};

// The table of character codes which represent each card. Most of these were chosen to be based off
// of the card name, though conflicts mean some cards have less than memorable encodings. Several
// cards have additional encodings for when then store data - these all need to be handled specially
// in the functions above. One unfortunate side effect of this encoding is that cards with data may
// 'jump around', as their sort order changes when activated, but finding relatively
// readable/debuggable sequential encodings is difficult in the ASCII range and a consitent and
// logical encoding scheme is more valuable then complete stable sorting of cards across state
// changes.
export const Ids = {
  LevelLimitAreaB: $('A') as ID,
  BlackPendant: $('B') as ID, // 0 1 2 3 4 5
  CardDestruction: $('C') as ID,
  DifferentDimensionCapsule: $('D') as ID, // *
  RoyalDecree: $('E') as ID,
  AFeatherOfThePhoenix: $('F') as ID,
  GracefulCharity: $('G') as ID,
  HeavyStorm: $('H') as ID,
  CyberJar: $('J') as ID,
  PrematureBurial: $('K') as ID, // 5 6 7 8 9
  RoyalMagicalLibrary: $('L') as ID, // < = >
  ArchfiendsOath: $('O') as ID, // @
  PotOfGreed: $('P') as ID,
  ReversalQuiz: $('Q') as ID,
  Reload: $('R') as ID,
  Sangan: $('S') as ID,
  GiantTrunade: $('T') as ID,
  UpstartGoblin: $('U') as ID,
  ConvulsionOfNature: $('V') as ID,
  ToonWorld: $('W') as ID,
  ToonTableOfContents: $('X') as ID,
  ThunderDragon: $('Y') as ID,
  SpellReproduction: $('Z') as ID,
};

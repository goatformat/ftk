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

// The table of character codes which represent each card. Most of these were chosen to be based off
// of the card name, though conflicts mean some cards have less than memorable encodings. Several
// cards have additional encodings for when then store data - these all need to be handled specially
// in the functions above. One unfortunate side effect of this encoding is that cards with data may
// 'jump around', as their sort order changes when activated, but finding relatively
// readable/debuggable sequential encodings is difficult in the ASCII range and a consitent and
// logical encoding scheme is more valuable then complete stable sorting of cards across state
// changes.
const LevelLimitAreaB = 65 as ID; // A
const BlackPendant = 66 as ID; // B (0 1 2 3 4 5)
const CardDestruction = 67 as ID; // C
const DifferentDimensionCapsule = 68 as ID; // D (*)
const RoyalDecree = 69 as ID; // E
const AFeatherOfThePhoenix = 70 as ID; // F
const GracefulCharity = 71 as ID; // G
const HeavyStorm = 72 as ID; // H
const CyberJar = 74 as ID; // J
const PrematureBurial = 75 as ID; // K (5 6 7 8 9)
const RoyalMagicalLibrary = 76 as ID; // L (< = >)
const SpellbookOrganization = 77 as ID; // M
const CardShuffle = 78 as ID; // N (#)
const ArchfiendsOath = 79 as ID; // O (@)
const PotOfGreed = 80 as ID; // P
const ReversalQuiz = 81 as ID; // Q
const Reload = 82 as ID; // R
const Sangan = 83 as ID; // S
const GiantTrunade = 84 as ID; // T
const UpstartGoblin = 85 as ID; // U
const ConvulsionOfNature = 86 as ID; // V
const ToonWorld = 87 as ID; // W
const ToonTableOfContents = 88 as ID; // X
const ThunderDragon = 89 as ID; // Y
const SpellReproduction = 90 as ID; // Z

const RoyalMagicalLibrary1 = 60 as FieldID; // <
const RoyalMagicalLibrary2 = 61 as FieldID; // =
const RoyalMagicalLibrary3 = 62 as FieldID; // >
const LIBRARY = [
  RoyalMagicalLibrary, RoyalMagicalLibrary1, RoyalMagicalLibrary2, RoyalMagicalLibrary3,
];

const ArchfiendsOath1 = 64 as FieldID; // @
const CardShuffle1 = 35 as FieldID; // #
const DifferentDimensionCapsule1 = 42 as FieldID; // *

const BlackPendant0 = 48 as FieldID; // 0
const BlackPendant4 = 52 as FieldID; // 4
const PrematureBurial0 = 53 as FieldID; // 5
const PrematureBurial4 = 57 as FieldID; // 9

// Drops the data associated with a FieldID, returning the 'raw' ID
const raw = (id: FieldID) => {
  if (id >= RoyalMagicalLibrary1 && id <= RoyalMagicalLibrary3) return RoyalMagicalLibrary;
  if (id === ArchfiendsOath1) return ArchfiendsOath;
  if (id >= BlackPendant0 && id <= BlackPendant4) return BlackPendant;
  if (id >= PrematureBurial0 && id <= PrematureBurial4) return PrematureBurial;
  if (id === DifferentDimensionCapsule1) return DifferentDimensionCapsule;
  if (id === CardShuffle1) return CardShuffle;
  throw new RangeError(`Invalid ID: ${id}`);
};

// Utilities for handling IDs
export const ID = new class {
  // Determines whether an ID represents a face-down card
  facedown(this: void, id?: FieldID | DeckID) {
    return !!id && id >= 97 /* a */ && id <= 122;
  }
  // Flips a card from face-up to face-down or vice-versa. If a card had state it loses it when it
  // gets flipped down (NB: face-down cards cannot have state due to the rules of Yu-Gi-Oh!)
  toggle(this: void, id: FieldID | DeckID): ID | DeckID | FieldID {
    return (((id >= 65 /* A */ && id <= 90 /* Z */ || id >= 97 /* a */ && id <= 122 /* z */)
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
    if (id >= 65 /* A */ && id <= 90 /* Z */ || id >= 97 /* a */ && id <= 122 /* z */) return 0;
    if (id >= RoyalMagicalLibrary1 && id <= RoyalMagicalLibrary3) return id - RoyalMagicalLibrary1 + 1;
    if (id === ArchfiendsOath1 || id === DifferentDimensionCapsule1 || id === CardShuffle1) return 1;
    if (id >= BlackPendant0 && id <= PrematureBurial4) return (id - BlackPendant0) % 5;
    return 0;
  }
  // Sets data associated with a card
  // PRECONDITION: data is in valid range for the ID in question
  set(this: void, id: ID, data: number) {
    switch (id) {
    case RoyalMagicalLibrary: return LIBRARY[data];
    case ArchfiendsOath: return data ? ArchfiendsOath1 : ArchfiendsOath;
    case BlackPendant: return (BlackPendant0 + data) as FieldID;
    case PrematureBurial: return (PrematureBurial0 + data) as FieldID;
    case DifferentDimensionCapsule: return data ? DifferentDimensionCapsule : DifferentDimensionCapsule1;
    case CardShuffle: return data ? CardShuffle1 : CardShuffle;
    }

    throw new RangeError(`Invalid ID: ${id}`);
  }
  // Returns the raw ID given an ID of any type
  id(this: void, id: ID | FieldID | DeckID) {
    if (id >= 65 /* A */ && id <= 90 /* Z */) return id as ID;
    if (id >= 97 /* a */ && id <= 122 /* z */) return (id ^ 0x20) as ID;
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
    if (id >= 65 /* A */ && id <= 90 /* Z */) return String.fromCharCode(id);
    if (id >= 97 /* a */ && id <= 122 /* z */) return `(${String.fromCharCode((id ^ 0x20))})`;
    if (id >= RoyalMagicalLibrary1 && id <= RoyalMagicalLibrary3) return `L${id - RoyalMagicalLibrary1 + 1}`;
    if (id === ArchfiendsOath1) return 'O1';
    if (id >= BlackPendant0 && id <= BlackPendant4) return `B${id - BlackPendant0}`;
    if (id >= PrematureBurial0 && id <= PrematureBurial4) return `K${id - PrematureBurial0}`;
    if (id === DifferentDimensionCapsule1) return 'D1';
    if (id === CardShuffle1) return 'N1';
    throw new RangeError(`Invalid ID: ${String.fromCharCode(id)}`);
  }
  // Decodes an ID encoded in the human readable format
  unhuman(this: void, s: string) {
    if (s.length === 1) return s[0].charCodeAt(0) as ID;
    if (s.startsWith('(')) return (s[1].charCodeAt(0) ^ 0x20) as DeckID | FieldID;
    switch (s[0]) {
    case 'L': return LIBRARY[+s[1]];
    case 'O': return ArchfiendsOath1;
    case 'B': return (BlackPendant0 + +s[1]) as FieldID;
    case 'K': return (PrematureBurial0 + +s[1]) as FieldID;
    case 'D': return DifferentDimensionCapsule1;
    case 'N': return CardShuffle1;
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

// Export all of the IDs under a namespace to avoid having ugly imports
export const Ids = {
  LevelLimitAreaB: LevelLimitAreaB,
  BlackPendant: BlackPendant,
  CardDestruction: CardDestruction,
  DifferentDimensionCapsule: DifferentDimensionCapsule,
  RoyalDecree: RoyalDecree,
  AFeatherOfThePhoenix: AFeatherOfThePhoenix,
  GracefulCharity: GracefulCharity,
  HeavyStorm: HeavyStorm,
  CyberJar: CyberJar,
  PrematureBurial: PrematureBurial,
  RoyalMagicalLibrary: RoyalMagicalLibrary,
  SpellbookOrganization: SpellbookOrganization,
  CardShuffle: CardShuffle,
  ArchfiendsOath: ArchfiendsOath,
  PotOfGreed: PotOfGreed,
  ReversalQuiz: ReversalQuiz,
  Reload: Reload,
  Sangan: Sangan,
  GiantTrunade: GiantTrunade,
  UpstartGoblin: UpstartGoblin,
  ConvulsionOfNature: ConvulsionOfNature,
  ToonWorld: ToonWorld,
  ToonTableOfContents: ToonTableOfContents,
  ThunderDragon: ThunderDragon,
  SpellReproduction: SpellReproduction,
};

type Type = 'Normal Monster' | 'Effect Monster' | 'Ritual Monster' | 'Fusion Monster' | 'Token Monster' | 'Spell' | 'Trap';
type SubType = 'Continuous' | 'Counter' | 'Equip' | 'Field' | 'Normal' | 'Quick-Play' | 'Ritual';
type Attribute = 'Dark' | 'Earth' | 'Fire' | 'Light' | 'Water' | 'Wind';
type MonsterType =
  'Aqua' | 'Beast' | 'Beast-Warrior' | 'Dinosaur' | 'Dragon' | 'Fairy' | 'Fiend' | 'Fish' | 'Insect' | 'Machine' |
  'Plant' | 'Pyro' | 'Reptile' | 'Rock' | 'Sea Serpent' | 'Spellcaster' | 'Thunder' | 'Warrior' | 'Winged Beast' | 'Zombie';

type Data = {
  type: Type;
  text: string;
} & ({
  subType: SubType;
} | {
  attribute: Attribute;
  level: number;
  atk: number;
  def: number;
});

const MAIN: {[name: string]: Data} = {
  'A Feather of the Phoenix': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Discard 1 card, then target 1 card in your Graveyard; return that target to the top of your Deck.'
  },
  'Archfiend\'s Oath': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Once per turn: You can pay 500 Life Points, then declare 1 card name; excavate the top card of your Deck, and if it is the declared card, add it to your hand. Otherwise, send it to the Graveyard.',
  },
  'Black Pendant': {
    type: 'Spell',
    subType: 'Equip',
    text: 'The equipped monster gains 500 ATK. If this card is sent from the field to the Graveyard: Inflict 500 damage to your opponent.',
  },
  'Card Destruction': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Both players discard as many cards as possible from their hands, then each player draws the same number of cards they discarded.',
  },
  'Convulsion of Nature': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Both players must turn their Decks upside down.',
  },
  'Cyber Jar': {
    type: 'Effect Monster',
    attribute: 'Dark',
    level: 3,
    atk: 900,
    def: 900,
    text: 'Rock/Flip/Effect – FLIP: Destroy all monsters on the field, then both players reveal the top 5 cards from their Decks, then Special Summon all revealed Level 4 or lower monsters in face-up Attack Position or face-down Defense Position, also add any remaining cards to their hand. (If either player has less than 5 cards in their Deck, reveal as many as possible).',
  },
  'Giant Trunade': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Return all Spells/Traps on the field to the hand.'
  },
  'Graceful Charity': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 3 cards, then discard 2 cards.',
  },
  'Level Limit - Area B': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Change all face-up Level 4 or higher monsters to Defense Position.',
  },
  'Pot of Greed': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 2 cards.',
  },
  'Premature Burial': {
    type: 'Spell',
    subType: 'Equip',
    text: 'Activate this card by paying 800 Life Points, then target 1 monster in your Graveyard; Special Summon that target in Attack Position and equip it with this card. When this card is destroyed, destroy the equipped monster.',
  },
  'Reload': {
    type: 'Spell',
    subType: 'Quick-Play',
    text: 'Send all cards from your hand to the Deck, then shuffle. Then, draw the same number of cards you added to the Deck.',
  },
  'Reversal Quiz': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Send all cards from your hand and your field to the Graveyard, then call Spell, Trap, or Monster; reveal the top card of your Deck. If you called it right, both players exchange Life Points.',
  },
  'Royal Magical Library': {
    type: 'Effect Monster',
    attribute: 'Light',
    level: 4,
    atk: 0,
    def: 2000,
    text: 'Spellcaster/Effect – Each time a Spell is activated, place 1 Spell Counter on this card when that Spell resolves (max. 3). You can remove 3 Spell Counters from this card; draw 1 card.'
  },
  'Spell Economics': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'You do not pay Life Points to activate Spells.'
  },
  'Spell Reproduction': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Send 2 Spells from your hand to the Graveyard, then target 1 Spell in your Graveyard; add it to your hand.',
  },
  'Thunder Dragon': {
    type: 'Effect Monster',
    attribute: 'Light',
    level: 5,
    atk: 1600,
    def: 1500,
    text: 'Thunder/Effect – You can discard this card; add up to 2 "Thunder Dragon" from your Deck to your hand.',
  },
  'Toon Table of Contents': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Add 1 "Toon" card from your Deck to your hand.',
  },
  'Toon World': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Activate this card by paying 1000 Life Points.',
  },
  'Upstart Goblin': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Draw 1 card, then your opponent gains 1000 Life Points.',
  }
};

const SIDE: {[name: string]: Data} = {
  'Dark Magician of Chaos': {
    type: 'Effect Monster',
    attribute: 'Dark',
    level: 8,
    atk: 2800,
    def: 2600,
    text: 'Spellcaster/Effect – When this card is Normal or Special Summoned: You can target 1 Spell in your Graveyard; add that target to your hand. Banish any monster destroyed by battle with this card. If this face-up card would leave the field, banish it instead.',
  },
  'Dimension Fusion': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Pay 2000 Life Points; both players Special Summon as many of their banished monsters as possible.',
  },
  'Heavy Storm': {
    type: 'Spell',
    subType: 'Normal',
    text: 'Destroy all Spells/Traps on the field.',
  },
  'Mass Driver': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'You can Tribute 1 monster; inflict 400 damage to your opponent.',
  },
  'Messenger of Peace': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Monsters with 1500 or more ATK cannot declare an attack. Once per turn, during your Standby Phase, pay 100 Life Points or destroy this card.',
  },
  'Mystical Space Typhoon': {
    type: 'Spell',
    subType: 'Quick-Play',
    text: 'Target 1 Spell/Trap on the field; destroy that target.',
  },
  'Prohibition': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Activate this card by declaring 1 card name; cards with that name, and their effects, cannot be used. Cards already on the field are not affected (including face-down cards).'
  },
  'Royal Decree': {
    type: 'Trap',
    subType: 'Continuous',
    'text': 'Negate all other Trap effects on the field.'
  },
  'Sangan': {
    type: 'Effect Monster',
    attribute: 'Dark',
    level: 3,
    atk: 1000,
    def: 600,
    text: 'Fiend/Effect – If this card is sent from the field to the Graveyard: Add 1 monster with 1500 or less ATK from your Deck to your hand.',
  },
  'Swords of Concealing Light': {
    type: 'Spell',
    subType: 'Continuous',
    text: 'Destroy this card during your 2nd Standby Phase after activation. When this card resolves, change all monsters your opponent controls to face-down Defense Position. Monsters your opponent controls cannot change their battle positions.'
  },
};

const DECK = {
  main: {
    'A Feather of the Phoenix': 3,
    'Archfiend\'s Oath': 3,
    'Black Pendant': 1,
    'Card Destruction': 1,
    'Convulsion of Nature': 3,
    'Cyber Jar': 1,
    'Giant Trunade': 3,
    'Graceful Charity': 1,
    'Level Limit - Area B': 2,
    'Pot of Greed': 1,
    'Premature Burial': 1,
    'Reload': 3,
    'Reversal Quiz': 1,
    'Royal Magical Library': 3,
    'Spell Reproduction': 3,
    'Thunder Dragon': 3,
    'Toon Table of Contents': 3,
    'Toon World': 2,
    'Upstart Goblin': 2,
  },
  side: {
    'Dark Magician of Chaos': 1,
    'Dimension Fusion': 1,
    'Heavy Storm': 1,
    'Mass Driver': 1,
    'Messenger of Peace': 2,
    'Mystical Space Typhoon': 1,
    'Prohibition': 1,
    'Royal Decree': 1,
    'Sangan': 1,
    'Spell Economics': 1,
    'Swords of Concealing Light': 3,
  }
}
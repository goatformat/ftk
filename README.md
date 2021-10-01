# Library FTK

<p align="center">
  <img alt="pkmn/ps" src="https://user-images.githubusercontent.com/117249/134454031-9836e216-8cb5-4648-a288-dde569e9fca3.png" />
</p>

["Goat Format"](https://www.goatformat.com/whatisgoat.html) refers to a legacy [Yu-Gi-Oh!
TCG](https://en.wikipedia.org/wiki/Yu-Gi-Oh!_Trading_Card_Game) format that existed in 2005, named
after the prevalance of the card
[Scapegoat](https://www.db.yugioh-card.com/yugiohdb/card_search.action?ope=2&cid=4818) during this
time period. It is a format that is still widely played today using the same card pool, ruleset, and
banlist, though in the intervening years a variety of new decks have surfaced, perhaps the most
notorious of which being "[**Library FTK**](https://www.goatformat.com/home/january-31st-2019)".
"[FTK](https://yugioh.fandom.com/wiki/First_Turn_Kill)" decks are historically stigmatized by the
community as they typically TODO

The project exists to fully explore "Library FTK"

TODO stats
- theoretical win rates
  - comparing options
- chance of going off on turn 1 (2, 3, etc)
  - with various cards
- what (combination) cards needed in hand to go off
- optimal strategies (determine flow chart for human play?)

## Design

- consistent RNG (aggregate over N games, can't play out from every possible seed unless doing MCTS)
- minimal state representation
  - equips
- insertion short (lists < 40)
- all assumptions hardcoded (limited card pool = only 2 equips, all interactions can be considered, sangan)
- card by card highlights
- symmetry (also cull redundant states like Set)
- state generation
- state space (heuristic ranking, BULB search)
- "known" final card for Oath/Quiz

## Heuristics

In all cases, keep set for in location, same ID in same location = same score?

combination of immediate value + potential value - trunade with td td td sangan in hand is low value, but
with oath oath oath convulsion its very high value

deck thin = value depends on value of cards left in deck + how it helps get to win condition

everything is expected value
- +1/3 not that useful if the card to be drawn isn't very good

- **A Feather of the Phoenix**:
  - can get rid of dead weight monsters (and potentially bring them back with prema)
  - can help with known for win con
  -_can
- **Archfiend's Oath**:
  - if known top card = super for reusabe +1, otherwise low value (can still blindly manipulate RNG)
- **Black Pendant**:
  - reusuable 1/3, technically same as Level Limit
  - required for win condition
- **Card Destructuon**:
  - value depends on value of current hand, higher if low value cards cant summon
- **Convulsion of Nature**:
  - reusable 1/3
  - increases power of shuffle cards (can force reshuffles to get better draws)
  - large booster for archfiends oath
- **Giant Trunade**:
  - can reuse all current activated spell cards
  = always want to get spell counters as high as possible by playing all continuous beforehand
  - should be able to judge next state after trunade was played to tell how positive
- **Graceful Charity**:
  - can use to get more cards and get rid of bad cards = ie. graceful - 2 TD = "+3"
- **Level Limit - Area B**:
  - reusuable 1/3
- **Pot of Greed**:
  - value isn't just as good as what you draw into, also want it to be higher value due to POTENTIAL value
- **Premature Burial**:
  - needs monsters in graveyard
  - huge plus if can get a second/third library onto the field
  - reusable 1/3
- **Reload**:
  - depends on exchanging value of current hand for value of what you draw into
  - value is higher if current hand is low value. but that should already be implicit
  - may be more useful than Card Destruction if dont have a lot of pure zero value cards (TDs, monsters if already summoned)
- **Reversal Quiz**:
  - very low value unless win condition (though should be easy to see because wipes rest of hand etc)
- **Royal Magical Library**:
  - if not summoned, summoning should always be priority to start getting counters
  - if summoned, high discard to be able to get back on field
  - monsters need to have some value on the field to incentvize summoning/discarding
  - has "potential value" in hand if not summoned (but should be less than summoned to force summoning)
  - when at 3/3, need to be
- **Sangan**:
  - generally low value unless need a monster for win condition
  - can be procced via thunder dragon/reversal quiz
- **Spell Reproduction**:
  - useful for bringing back high value draw spells, win con pieces, trunade, premature
  - better late game when things in graveyard
- **Thunder Dragon**:
  - can force shuffles
  - value = deck thinning (n/N)
  - can force shuffles
  - useful for card D
  - can tribute over to proc Sangan brought back via Premature
- **Toon Table of Contents**:
  - value = deck thining (n/N)
  - can fetch reusable 1/3 + 1000 LP card
  - can force shuffles
- **Toon World**:
  - reusable 1/3 + 1000 LP card
- **Upstart Goblin**:
  - deck thin by (1/n) + value relative to card brought in

- **Cyber Jar**:
  - potentially draw 5/bypass symmon limits, but very hard to pull off
- **Different Dimension Capsule**:
  - pure deck thin, though reusable by trunade
- **Heavy Storm**:
  - low value, wipes existing cards (cant be returned via trunade)

## Future Work

### Multi-turn

### Probabilistic

### Monte Carlo Tree Search (MCTS)

- fully random MCTS selections dont work, need to be heuristic guided to find path at all
- random playouts part of MCTS involves not knowing what true starting state is
  - play N
- full length MCTS (search from root multiple times with different shuffles)

### Simulator UI

- "solitaire"
- ui generates only legal games, lets you play out (or reset/undo)
- click and play available options, auto tracks counters and convulsion etc = fully automated simulator for very confined space
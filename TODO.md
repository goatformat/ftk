```
include "probabalistic" Reversal Quiz in win % (do breakdown of with and without guessing)
 - Archfiend could also blind guess probabilistically

when probabalistic guessing - can figure out exact ratio by figuring out cards in deck and dont need to try all possible states (other incorrect states are covered by blue eyes mill already)

win condition for termination removes known check in probabalistic instance

play out all paths to exhaustion, if can get non probabablistic win = good, otherwise need to figure out how to merge probabilities from all other paths

---

support multi turns
- need to reset summoned limit
- need to draw card
- any state can have a turn inserted after it
- need to actually implement flip (currently no way to tribute over a set jar because double summon)
- need to support setting cards to avoid discarding due to hand limit


// github.com/nodejs/node#37320

---

Different Dimension Capsule
Heavy Storm
```

## Heuristic

defense mode after level limit area b?

monsters dont have value in hand after summoned is sert, encourages discard and premature
if a card draws one other card by default it is 1 (upstart can be fracrionally more than 1 because no cost?)
cards in hand worth more than on the field (doesnt clog zones and discard fodder)

heuristic - need to determine whether card is playable at all to count (ie cnd is valid)
prune activating ao or llab etc without a library on the field
# Library FTK

<p align="center">
  <img alt="pkmn/ps" src="https://user-images.githubusercontent.com/117249/134454031-9836e216-8cb5-4648-a288-dde569e9fca3.png" />
</p>

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


---

Different Dimension Capsule
Heavy Storm
```

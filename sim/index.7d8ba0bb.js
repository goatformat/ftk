var e="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},n={},t={},a=e.parcelRequireb545;null==a&&((a=function(e){if(e in n)return n[e].exports;if(e in t){var a=t[e];delete t[e];var d={id:e,exports:{}};return n[e]=d,a.call(d.exports,d,d.exports),d.exports}var o=new Error("Cannot find module '"+e+"'");throw o.code="MODULE_NOT_FOUND",o}).register=function(e,n){t[e]=n},e.parcelRequireb545=a),a("bXuNP").register(JSON.parse('{"gcU1a":"index.7d8ba0bb.js","4bfU0":"worker.f8fc40e1.js","ftUP3":"index.57cffd17.js","77teK":"index.69b6619e.css","1Lmeo":"index.c8c2c55e.js"}'));var d=a("ahpAG"),o=a("l7khe"),r=a("iPHaw");(()=>{let e=null,n=null,t=0,a=0,d=null,o=null;"function"!=typeof window.CustomEvent&&(window.CustomEvent=(e,n)=>{n=n||{bubbles:!1,cancelable:!1,detail:void 0};const t=document.createEvent("CustomEvent");return t.initCustomEvent(e,n.bubbles,n.cancelable,n.detail),t},window.CustomEvent.prototype=window.Event.prototype),document.addEventListener("touchstart",(function(r){o=r.target,d=Date.now(),e=r.touches[0].clientX,n=r.touches[0].clientY,t=0,a=0}),!1),document.addEventListener("touchmove",(function(d){e&&n&&(t=e-d.touches[0].clientX,a=n-d.touches[0].clientY)}),!1),document.addEventListener("touchend",(function(r){if(o!==r.target)return;const i=Date.now()-d;let s="";Math.abs(t)>Math.abs(a)?Math.abs(t)>100&&i<500&&(s=t>0?"swiped-left":"swiped-right"):Math.abs(a)>100&&i<500&&(s=a>0?"swiped-up":"swiped-down"),s&&o.dispatchEvent(new CustomEvent(s,{bubbles:!0,cancelable:!0})),e=null,n=null,d=null}),!1)})();const i=window.location.hash&&+window.location.hash.slice(1)||window.location.search&&+window.location.search.slice(1)||~~(Math.random()*(2**31-1));console.log("Seed:",i);const s=o.State.create(new o.Random(o.Random.seed(i)),!0),c={stack:[{state:s,banished:[],graveyard:[],action:{type:"play"}}],index:0};function l(e=!0){const n=document.getElementById("content");for(;n.firstChild;)n.removeChild(n.firstChild);const{state:t,banished:a,graveyard:d,action:s}=c.stack[c.index],m=function(e,n,t,a=!0){if(!e.trace?.length)return;const d=r.createElement("div","trace");let i=r.createElement("p"),s=r.createElement("ul"),c="",l=0;for(const n of e.trace){if(n.startsWith("  ")){const e=r.createElement("li");e.textContent=n,s.appendChild(e)}else{l&&(i.appendChild(s),s=r.createElement("ul"),d.appendChild(i),i=r.createElement("p")),c=n,l++;const e=r.createElement("span");e.innerHTML=n.replace(/"(.*?)"/g,((e,n)=>`"<b>${n}</b>"`)),i.appendChild(e)}}if(i.appendChild(s),s=r.createElement("ul"),d.appendChild(i),c&&a){const a=c.startsWith("Activate")?o.DATA[/"(.*?)"/.exec(c)[1]].id:c.startsWith("Set")&&!c.endsWith("face-down")?o.DATA[/then activate(?: face-down)? "(.*?)"/.exec(c)[1]].id:void 0;r.track(e.banished,n,a),r.track(e.graveyard,t,a)}return d}(t,a,d,e),h=r.createElement("div","wrapper");if(h.appendChild(r.renderState(t,a,d,y,f,!0,i)),"win"===s.type||"play"===s.type&&!t.clone().next().length){const e=r.createElement("div","modal","end","win"===s.type?"win":"lose"),n=r.createElement("a");n.href=`../trace?${i}`;const t=r.createElement("h1");t.textContent="You "+("win"===s.type?"Win":"Lose"),n.appendChild(t),e.appendChild(n),h.appendChild(e);const a=r.createElement("div","modal-overlay");h.appendChild(a)}else if("search"===s.type){const e=r.createElement("div","modal"),n=r.createElement("div","zone","search");for(const[e,a]of s.options.sort(((e,n)=>t[e[0]][e[1]].localeCompare(t[n[0]][n[1]])))){const d=t[e][a],i=o.ID.decode(d);n.appendChild(r.makeCard(i,(()=>y(e,d,a)),{hold:!0,className:f(e,d,a,!0)}))}e.appendChild(n),h.appendChild(e);const a=r.createElement("div","modal-overlay");a.addEventListener("click",(()=>{if(c.stack[c.index].action={type:"play"},s.num>1&&s.targets.length)return s.fn(s.targets[0][0],s.targets[0][1]);l()}),{once:!0}),h.appendChild(a)}n.appendChild(h),m&&(n.appendChild(m),m.scrollTop=m.scrollHeight)}function f(e,n,t,a=!1){const{state:d,action:r}=c.stack[c.index],i=["banished","graveyard","deck"].includes(e);if("play"===r.type){if(i)return;const t=o.ID.decode(n);if(t.id===o.Ids.ReversalQuiz&&!u(d))return"disabled";return("Monster"===t.type?"hand"===e?!d.summoned&&d.monsters.length<5||t.id===o.Ids.ThunderDragon&&d.deck.length:3===o.ID.data(n)&&d.deck.length:"hand"===e?d.spells.length<5&&t.can(d,e):o.ID.facedown(n)?t.can(d,e):t.id===o.Ids.ArchfiendsOath&&!o.ID.data(n)&&d.deck.length)?void 0:"disabled"}if("target"!==r.type&&"search"!==r.type);else{if(e===r.origin.location&&t===r.origin.i)return"selected";if(!r.filter(e,n))return i?void 0:"disabled";if(r.targets.find((([n,a])=>n===e&&a===t))){if(!a&&"search"===r.type&&e===r.options[0][0])return;return"option"}}}function m(e){return(n,t,a,d)=>{n.remove(t,a),n.major(`Activate${"spells"===t?" face-down":""} "${d.name}"`),"Spell"===d.type&&"Continuous"===d.subType?n.add("spells",d.id):n.add("graveyard",d.id),e&&e(n),n.inc(),l()}}function h(e,n){const t=o.ID.decode(n);return"deck"===e&&"Monster"===t.type&&t.atk<=1500}function p(e){return(n,t,a,d)=>{const r=n.spells.length;let i;if("hand"===t){const e=n.hand.filter(((e,n)=>a!==n&&"Monster"!==o.ID.decode(e).type));i=Math.min(5-r-1,e.length,n.hand.length-2)}else{const e=n.hand.filter((e=>"Monster"!==o.ID.decode(e).type));i=Math.min(5-r,e.length,n.hand.length-1)}const s=n.hand.slice();D({location:t,i:a},((e,n)=>"hand"===e&&"Monster"!==o.ID.decode(n).type),((r,...i)=>{n.remove(t,a),n.add("graveyard",d.id);const c=[];for(const[e,d]of i.entries()){const o=s[d];c.push(o),n.add("spells",`(${o})`),n.remove("hand",d-e-("hand"===t&&a<d?1:0))}c.length?n.major(`Set ${o.ID.names(c)} face-down then activate${"spells"===t?" face-down":""} "${d.name}"`):n.major(`Activate${"spells"===t?" face-down":""} "${d.name}"`);const f=n.hand.length;e(n),n.hand=[],n.draw(f),n.inc(),l()}),-i)}}function u(e){return!!e.clone().end(!1)&&e.spells.some((e=>o.ID.id(e)===o.Ids.BlackPendant&&!o.ID.facedown(e)))}function g(e,n){if(!u(e))return;const t=e.known(!0);e.major(`Activate${"spells"===n?" face-down":""} "Reversal Quiz"`);const a=e.hand.filter((e=>o.ID.id(e)!==o.Ids.ReversalQuiz));a.length&&e.minor(`Send ${o.ID.names(a)} from hand to Graveyard`),e.graveyard.push(...a),e.hand=[];const d=e.monsters.map((e=>o.ID.id(e)));e.graveyard.push(...d),e.monsters=[];for(const n of e.spells){const t=o.ID.decode(n);t.id===o.Ids.ReversalQuiz&&(o.ID.facedown(n)||(t.id===o.Ids.ConvulsionOfNature?e.reverse(!0):t.id===o.Ids.DifferentDimensionCapsule&&e.banish()),e.graveyard.push(t.id),d.push(t.id))}e.spells=[],e.graveyard.sort(),d.length&&e.minor(`Send ${o.ID.names(d)} from field to Graveyard`),e.add("spells",o.Ids.ReversalQuiz),e.minor(`Call "${o.ID.decode(t).type}", reveal "${o.ID.decode(e.deck[e.deck.length-1]).name}"`),e.major(`After exchanging Life Points, opponent has ${e.lifepoints} LP and then takes 500 damage from "Black Pendant" being sent from the field to the Graveyard`),c.stack[c.index].action={type:"win"},l()}const v={"A Feather of the Phoenix":(e,n,t,a)=>{D({location:n,i:t},(e=>"hand"===e),((d,r)=>{I({location:n,i:t},(e=>"graveyard"===e),((d,i)=>{e.major(`Activate${"spells"===n?" face-down":""} "${a.name}"`),e.minor(`Discard "${o.ID.decode(e.hand[r]).name}"`);const s=e.remove("graveyard",i);e.minor(`Return "${o.ID.decode(s).name}" in the Graveyard to the top of the Deck`),"hand"===n?e.discard(t<r?[t,r]:[r,t]):(e.remove(n,t),e.add("graveyard",a.id),e.add("graveyard",e.remove("hand",r))),e.deck.push(`(${s})`),e.inc(),l()}))}))},"Archfiend's Oath":m(),"Black Pendant":(e,n,t,a)=>{D({location:n,i:t},(e=>"monsters"===e),((d,r)=>{e.remove(n,t),e.major(`${"spells"===n?`Flip face-down "${a.name}" and equip`:`Equip "${a.name}"`} to "${o.ID.decode(e.monsters[r]).name}"`),e.add("spells",`${a.id}${r}`),e.inc(),l()}))},"Card Destruction":p((e=>{for(const n of e.hand)e.add("graveyard",n);e.minor(`Discard ${o.ID.names(e.hand)}`)})),"Convulsion of Nature":m((e=>e.reverse())),"Different Dimension Capsule":(e,n,t,a)=>{I({location:n,i:t},(e=>"deck"===e),((d,r)=>{e.major(`Activate${"spells"===n?" face-down":""} "${a.name}"`),e.remove(n,t),e.add("spells",`${a.id}${e.turn}`),e.minor(`Banish ${o.ID.decode(e.deck[r]).name} from the deck face-down`),e.add("banished",`(${o.ID.id(e.deck.splice(r,1)[0])})`),e.shuffle(),e.inc(),l()}))},"Giant Trunade":m((e=>{for(const n of e.spells){const t=o.ID.decode(n);e.add("hand",t.id),o.ID.facedown(n)||(t.id===o.Ids.ConvulsionOfNature?e.reverse(!0):t.id===o.Ids.DifferentDimensionCapsule&&e.banish())}e.minor(`Return ${o.ID.names(e.spells)} to hand`),e.spells=[]})),"Graceful Charity":(e,n,t,a)=>{e.major(`Activate${"spells"===n?" face-down":""} "${a.name}"`),e.remove(n,t),t=e.add("spells",a.id),e.draw(3),l(),D({location:"spells",i:-1},(e=>"hand"===e),((n,d,r)=>{e.minor(`Discard "${o.ID.decode(e.hand[d]).name}" and "${o.ID.decode(e.hand[r]).name}"`),e.discard([d,r]),e.remove("spells",t),e.add("graveyard",a.id),e.inc(),l()}),2)},"Level Limit - Area B":m(),"Pot of Greed":m((e=>e.draw(2))),"Premature Burial":(e,n,t,a)=>{I({location:n,i:t},((e,n)=>"graveyard"===e&&"Monster"===o.ID.decode(n).type),((d,r)=>{e.major(`Pay 800 LP (${e.lifepoints} -> ${e.lifepoints-800}) to activate effect of "${a.name}"`),e.minor(`Special Summon "${o.ID.decode(e.graveyard[r]).name}" in Attack Position from Graveyard`),e.lifepoints-=800;const i=e.remove("graveyard",r),s=e.summon(i,!0);e.remove(n,t),e.add("spells",`${a.id}${s}`),e.inc(s),l()}))},"Heavy Storm":m((e=>{for(const n of e.spells){const t=o.ID.decode(n);if(e.add("graveyard",t.id),!o.ID.facedown(n))if(t.id===o.Ids.ConvulsionOfNature)e.reverse(!0);else if(t.id===o.Ids.BlackPendant)e.mclear(o.ID.data(n));else if(t.id===o.Ids.PrematureBurial){const t=e.mremove(o.ID.data(n));e.add("graveyard",t.id),e.minor(`Sending "${o.ID.decode(t.id).name}" to the Graveyard after its equipped "${o.ID.decode(n).name}" was destroyed`)}else t.id===o.Ids.DifferentDimensionCapsule&&e.banish()}e.minor(`Send ${o.ID.names(e.spells)} to Graveyard`),e.spells=[]})),Reload:p((e=>{e.deck.push(...e.hand),e.minor(`Return ${o.ID.names(e.hand)} to Deck`),e.shuffle()})),"Reversal Quiz":(e,n,t,a)=>{let d=!1;e.major(`Activate${"spells"===n?" face-down":""} "${a.name}"`),e.hand.length&&e.minor(`Send ${o.ID.names(e.hand)} from hand to Graveyard`),(e.monsters.length||e.spells.length)&&e.minor(`Send ${o.ID.names([...e.monsters,...e.spells])} from field to Graveyard`),e.graveyard.push(...e.hand),e.hand=[];for(const n of e.monsters){const t=o.ID.decode(n);t.id===o.Ids.Sangan&&(d=!0),e.graveyard.push(t.id)}e.monsters=[];for(const n of e.spells){const t=o.ID.decode(n);o.ID.facedown(n)||(t.id===o.Ids.ConvulsionOfNature?e.reverse(!0):t.id===o.Ids.DifferentDimensionCapsule&&e.banish()),e.graveyard.push(t.id)}e.spells=[],e.graveyard.sort();const r=e.deck[e.deck.length-1];o.ID.known(r)||(e.deck[e.deck.length-1]=`(${r})`);const i=o.ID.decode(r);if(e.minor(`Call "${"Trap"===i.type?"Monster":"Trap"}", reveal "${i.name}"`),!d)return l();I({location:n,i:t},h,((n,t)=>{if(t<0)e.minor('Fail to find "Sangan" target in Deck');else{const n=o.ID.id(e.deck.splice(t,1)[0]);e.minor(`Add "${o.ID.decode(n).name}" from Deck to hand after "Sangan" was sent to the Graveyard`),e.add("hand",n)}e.shuffle(),l()}))},"Royal Decree":(e,n,t,a)=>{e.remove(n,t),"hand"===n&&(e.major(`Set "${a.name}" face-down`),e.add("spells",`(${a.id})`)),l()},"Spell Reproduction":(e,n,t,a)=>{D({location:n,i:t},((e,n)=>"hand"===e&&"Spell"===o.ID.decode(n).type),((d,i,s)=>{I({location:n,i:t},((e,n)=>"graveyard"===e&&"Spell"===o.ID.decode(n).type),((d,c)=>{e.major(`Activate${"spells"===n?" face-down":""} "${a.name}"`),e.minor(`Discard "${o.ID.decode(e.hand[i]).name}" and "${o.ID.decode(e.hand[s]).name}"`);const f=e.remove("graveyard",c);"hand"===n?e.discard([t,i,s].sort(r.CMP)):(e.remove(n,t),e.add("graveyard",a.id),e.discard([i,s])),e.minor(`Add "${o.ID.decode(f).name}" in the Graveyard to hand`),e.add("hand",f),e.inc(),l()}))}),2)},"Toon Table of Contents":(e,n,t,a)=>{I({location:n,i:t},((e,n)=>"deck"===e&&o.ID.decode(n).name.startsWith("Toon")),((d,r)=>{e.major(`Activate${"spells"===n?" face-down":""} "${a.name}"`),e.remove(n,t),e.add("graveyard",a.id),r<0?e.minor('Fail to find "Toon" card in Deck'):(e.minor(`Add "${o.ID.decode(e.deck[r]).name}" from Deck to hand`),e.add("hand",o.ID.id(e.deck.splice(r,1)[0]))),e.shuffle(),e.inc(),l()}))},"Toon World":m((e=>{e.minor(`Pay 1000 LP (${e.lifepoints} -> ${e.lifepoints-1e3})`),e.lifepoints-=1e3})),"Upstart Goblin":m((e=>e.draw()))};function y(e,n,t){const a=c.stack[c.index].action;switch(console.log(a,e,n,t),a.type){case"play":return function(e,n,t){const a=c.stack[c.index].state,d=o.ID.decode(n);switch(e){case"monsters":if(d.id===o.Ids.RoyalMagicalLibrary){if(o.ID.facedown(n)||3!==o.ID.data(n)||!a.deck.length)return;return a.major(`Remove 3 Spell Counters from "${d.name}"`),a.mclear(t),a.draw(),l()}return;case"spells":if("Monster"===d.type||!d.can(a,e))return;if(d.id===o.Ids.ReversalQuiz)g(a,e);else if(o.ID.facedown(n)){const n=v[d.name];n&&n(a,e,t,d)}else d.id!==o.Ids.ArchfiendsOath||o.ID.data(n)||function(e,n,t,a){const d="hand"===n||o.ID.facedown(e[n][t]),r=d?`Activate${"spells"===n?" face-down":""} "${a.name}" then pay`:"Pay";if(e.major(`${r} 500 LP (${e.lifepoints} -> ${e.lifepoints-500}) to activate effect of "${a.name}"`),e.lifepoints-=500,e.known())e.minor(`Declare "${o.ID.decode(e.deck[e.deck.length-1]).name}"`),e.draw();else{e.minor('Declare "Blue-Eyes White Dragon"');const n=o.ID.decode(e.deck.pop());e.minor(`Excavate "${n.name}"`),e.add("graveyard",n.id)}e.remove(n,t),e.add("spells",`${a.id}1`),d&&e.inc(),l()}(a,e,t,d);return;case"hand":if(d.id===o.Ids.ReversalQuiz)g(a,e);else if(d.id===o.Ids.ThunderDragon){const n=n=>{I({location:e,i:t},((e,n)=>"deck"===e&&o.ID.id(n)===o.Ids.ThunderDragon),((e,...a)=>{n.major(`Discard "${d.name}"`),n.remove("hand",t),n.add("graveyard",d.id),2===a.length?(n.minor(`Add 2 "${d.name}" from Deck to hand`),n.add("hand",o.ID.id(n.deck.splice(a[0],1)[0])),n.add("hand",o.ID.id(n.deck.splice(a[1]-1,1)[0]))):a[0]>=0?(n.minor(`Add "${d.name}" from Deck to hand`),n.add("hand",o.ID.id(n.deck.splice(a[0],1)[0]))):n.minor(`Fail to find "${d.name}" in Deck`),n.shuffle(),l()}),2)};a.monsters.length&&a.monsters.length<5&&!a.summoned?D({location:e,i:t},(e=>"deck"===e||"monsters"===e),((e,d)=>{if("deck"===e)n(a);else{const e=o.ID.decode(a.monsters[d]);a.major(`Tribute "${e.name}" to Summon "${self.name}"`),a.tribute(d,t),e.id===o.Ids.Sangan?I({location:"graveyard",i:-1},h,((e,n)=>{if(n<0)a.minor('Fail to find "Sangan" target in Deck');else{const e=o.ID.id(a.deck.splice(n,1)[0]);a.minor(`Add "${o.ID.decode(e).name}" from Deck to hand after "Sangan" was sent to the Graveyard`),a.add("hand",e)}a.shuffle(),l()})):l()}})):n(a)}else{if("Monster"===d.type){if(a.monsters.length>=5||a.summoned)return;return a.remove(e,t),a.major(`Summon "${d.name}" in Attack Position`),a.summon(d.id),l()}{if(a.spells.length>=5||!d.can(a,e))return;const n=v[d.name];n&&n(a,e,t,d)}}}}(e,n,t);case"target":return function(e,n,t){const a=c.stack[c.index].action;if("target"!==a.type)throw new Error(`Invalid action type ${a.type}`);if(e===a.origin.location&&t===a.origin.i){if(c.stack[c.index].action={type:"play"},a.num<0)return a.targets.length?a.fn(a.targets[0][0],...a.targets.map((e=>e[1])).sort(r.CMP)):a.fn(e);l()}else if(a.filter(e,n)){const n=a.targets.findIndex((([n,a])=>n===e&&a===t));if(n>=0?a.targets.splice(n,1):a.targets.push([e,t]),a.targets.length===Math.abs(a.num))return c.stack[c.index].action={type:"play"},a.fn(a.targets[0][0],...a.targets.map((e=>e[1])).sort(r.CMP));l()}}(e,n,t);case"search":return function(e,n,t){const a=c.stack[c.index].action;if("search"!==a.type)throw new Error(`Invalid action type ${a.type}`);if(e===a.origin.location&&t===a.origin.i){if(c.stack[c.index].action={type:"play"},a.num>1&&a.targets.length)return a.fn(a.targets[0][0],a.targets[0][1]);l()}else if(a.filter(e,n)){const n=a.targets.findIndex((([n,a])=>n===e&&a===t));if(n>=0?a.targets.splice(n,1):a.targets.push([e,t]),a.targets.length===Math.abs(a.num))return c.stack[c.index].action={type:"play"},a.fn(a.targets[0][0],...a.targets.map((e=>e[1])).sort(r.CMP));l()}}(e,n,t)}}function D(e,n,t,a=1){if(0===a)return t(e.location);const d=c.stack[c.index].state,o=[];for(const t of["hand","spells","monsters"])for(const[a,r]of d[t].entries())t===e.location&&a===e.i||n(t,r)&&o.push([t,a]);if(d.deck.length&&n("deck",d.deck[d.deck.length-1])&&o.push(["deck",d.deck.length-1]),a>0&&o.length===a)return t(o[0][0],...o.map((e=>e[1])).sort(r.CMP));c.stack[c.index].action={type:"target",origin:e,filter:n,fn:t,num:a,targets:[]},l()}function I(e,n,t,a=1){const d=c.stack[c.index].state,r=[],i=new Set;for(const t of["graveyard","deck"])for(const[s,c]of d[t].entries()){const d=o.ID.id(c);t===e.location&&s===e.i||i.has(d)||n(t,d)&&(1===a&&i.add(d),r.push([t,s]))}if(0===r.length)t("hand",-1);else{if(1===r.length)return t(r[0][0],r[0][1]);c.stack[c.index].action={type:"search",origin:e,filter:n,fn:t,num:a,targets:[],options:r},l()}}l();const k=()=>{},w=()=>{},$=()=>{const e=c.stack[c.index].action;("target"===e.type||"search"===e.type)&&e.origin.i>=0&&(c.stack[c.index].action={type:"play"},l())},b=["modal","modal-overlay","card"];document.addEventListener("click",(e=>{if(e.target instanceof Element)for(let n=e.target;n;n=n.parentElement)if(b.some((e=>n.classList.contains(e))))return!0;return $(),e.preventDefault(),e.stopPropagation(),!1})),document.addEventListener("swiped-left",k),document.addEventListener("swiped-right",w),document.addEventListener("keydown",(e=>{switch(e.which||e.keyCode){case 27:$();break;case 37:case 39:break;default:return!0}return e.preventDefault(),e.stopPropagation(),!1}));var C;C=a("kPq84").getBundleURL("gcU1a")+"../"+a("bXuNP").resolve("4bfU0");const E=d.pool(new URL(C).pathname);E.exec("search",[s.toString(),42,1e6,!1,.5]).then((e=>{console.log("Path:",e)})).catch((e=>{console.error(e)})).then((()=>{E.terminate()}));
//# sourceMappingURL=index.7d8ba0bb.js.map

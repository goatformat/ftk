var e="undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:"undefined"!=typeof window?window:"undefined"!=typeof global?global:{},t={},n={},a=e.parcelRequireb545;null==a&&((a=function(e){if(e in t)return t[e].exports;if(e in n){var a=n[e];delete n[e];var d={id:e,exports:{}};return t[e]=d,a.call(d.exports,d,d.exports),d.exports}var i=new Error("Cannot find module '"+e+"'");throw i.code="MODULE_NOT_FOUND",i}).register=function(e,t){n[e]=t},e.parcelRequireb545=a);var d=a("l7khe"),i=a("iPHaw");const r=window.location.hash&&+window.location.hash.slice(1)||window.location.search&&+window.location.search.slice(1)||~~(Math.random()*(2**31-1)),l=d.State.create(new d.Random(d.Random.seed(r)),!0).search({cutoff:1e7,prescient:!1,width:.5});if("path"in l){const e=document.getElementById("content"),t=i.createElement("div");t.textContent=`Found a path of length ${l.path.length} after searching ${l.visited} states:`,e.appendChild(t),e.appendChild(i.createElement("br")),e.appendChild(((e,t)=>{const n=[],a=[],r=i.createElement("div");let l=i.createElement("div","trace"),o="",c=0,p=i.createElement("ul");for(const s of t)if(s.startsWith("  ")){const e=i.createElement("li");e.textContent=s,p.appendChild(e)}else{if(c&&(l.appendChild(p),p=i.createElement("ul"),r.appendChild(l),l=i.createElement("div","trace")),e[c-1]){const t=d.State.fromString(e[c-1]),l=o.startsWith("Activate")?d.DATA[/"(.*?)"/.exec(o)[1]].id:o.startsWith("Set")?d.DATA[/then activate(?: face-down)? "(.*?)"/.exec(o)[1]].id:void 0;i.track(t.banished,n,l),i.track(t.graveyard,a,l);const p=i.createElement("div","state");p.appendChild(i.renderState(t,n,a));const s=i.createElement("div","wrapper"),h=i.createElement("details"),f=i.createElement("summary");let m=i.createElement("code"),C=i.createElement("pre");C.textContent=e[c-1],m.appendChild(C),f.appendChild(m),h.appendChild(f),m=i.createElement("code"),C=i.createElement("pre"),C.textContent=t.next().map((({key:e,score:t})=>`${e} = ${t.toFixed(2)}`)).join("\n"),m.appendChild(C),h.appendChild(m),s.appendChild(h),p.appendChild(s),r.appendChild(p)}o=s,c++;const t=i.createElement("span");t.innerHTML=s.replace(/"(.*?)"/g,((e,t)=>`"<b>${t}</b>"`)),l.appendChild(t)}return r.appendChild(l),r})(l.path,l.trace))}else console.error(`Unsuccessfully searched ${l.visited} states`);
//# sourceMappingURL=index.bbebac0d.js.map

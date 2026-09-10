(()=>{
  const reset=document.querySelector('#reset');
  if(!reset)return;
  reset.onclick=async()=>{
    if(reset.disabled)return;
    pushUndo();
    reset.disabled=true;
    setStatus('Standardwerte werden geladen …');
    restore(defaults);
    try{showCards(await json('repertoire.json'))}catch{showCards(fallbackShows)}
    try{eventCards(await json('termine.json'))}catch{eventCards([])}
    try{ensembleCards(await json('ensemble.json'))}catch{}
    try{referenceCards(await json('referenzen.json'))}catch{}
    wireEditable();wireImages();wireSections();
    if(editing)setEditable(true);
    markDirty('Vollständige Standardwerte geladen – noch speichern');
    reset.disabled=false;
  };
})();

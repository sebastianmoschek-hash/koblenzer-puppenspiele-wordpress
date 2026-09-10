(()=>{
  let selectedCard=null;
  const cardSelector='article,.person,.show-card';
  function cardsIn(section){
    if(!section)return [];
    return [...section.querySelectorAll(cardSelector)].filter(card=>card.closest('section')===section);
  }
  function clearCard(){
    if(selectedCard)selectedCard.classList.remove('card-selected');
    selectedCard=null;
    updateCardControls();
  }
  function selectCard(card){
    if(selectedCard)selectedCard.classList.remove('card-selected');
    selectedCard=card||null;
    if(selectedCard){
      selectedCard.classList.add('card-selected');
      selectSection(selectedCard.closest('section'));
    }
    updateCardControls();
  }
  function updateCardControls(){
    const add=document.querySelector('#addCard');
    const dup=document.querySelector('#duplicateCard');
    const del=document.querySelector('#deleteCard');
    const container=selectedSection?.querySelector('.cards');
    if(add)add.disabled=!selectedSection||!container;
    if(dup)dup.disabled=!selectedCard;
    if(del)del.disabled=!selectedCard;
  }
  function cleanClone(card){
    const copy=card.cloneNode(true);
    copy.classList.remove('card-selected');
    copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    copy.querySelectorAll('[data-editor-wired],[data-image-wired],[data-section-wired],[data-card-wired]').forEach(el=>{
      el.removeAttribute('data-editor-wired');
      el.removeAttribute('data-image-wired');
      el.removeAttribute('data-section-wired');
      el.removeAttribute('data-card-wired');
    });
    return copy;
  }
  function wireCards(){
    document.querySelectorAll(`main ${cardSelector}`).forEach(card=>{
      if(card.dataset.cardWired)return;
      card.dataset.cardWired='1';
      card.addEventListener('click',event=>{
        if(!editing)return;
        if(event.target.closest('a,button,summary,img'))return;
        selectCard(card);
      });
    });
    updateCardControls();
  }
  function addCard(){
    const container=selectedSection?.querySelector('.cards');
    if(!container){setStatus('Dieser Abschnitt hat keinen Kartenbereich');return;}
    pushUndo();
    const card=document.createElement('article');
    card.innerHTML='<p class="eyebrow">Neue Karte</p><h3>Neue Überschrift</h3><p>Hier können Sie den Inhalt der neuen Karte bearbeiten.</p>';
    container.append(card);
    wireEditable();wireImages();wireCards();
    setEditable(true);selectCard(card);
    markDirty('Neue Karte erstellt – noch speichern');
    card.scrollIntoView({behavior:'smooth',block:'center'});
    setTimeout(()=>card.querySelector('h3')?.focus(),300);
  }
  function duplicateCard(){
    if(!selectedCard)return;
    pushUndo();
    const copy=cleanClone(selectedCard);
    selectedCard.after(copy);
    wireEditable();wireImages();wireCards();
    selectCard(copy);
    markDirty('Karte dupliziert – noch speichern');
    copy.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function deleteCard(){
    if(!selectedCard)return;
    const title=(selectedCard.querySelector('h3,h2,strong')?.textContent||'diese Karte').trim();
    if(!confirm(`„${title}“ wirklich löschen?\n\nMit „Rückgängig“ kannst du sie wiederherstellen.`))return;
    pushUndo();
    const next=selectedCard.nextElementSibling||selectedCard.previousElementSibling;
    selectedCard.remove();selectedCard=null;
    if(next&&next.matches(cardSelector))selectCard(next);else updateCardControls();
    markDirty('Karte gelöscht – mit Rückgängig wiederherstellbar');
  }
  const originalCapture=capture;
  capture=()=>{
    if(selectedCard)selectedCard.classList.remove('card-selected');
    const html=originalCapture();
    if(selectedCard)selectedCard.classList.add('card-selected');
    return html.replace(/\sdata-card-wired="1"/g,'').replace(/\scard-selected/g,'');
  };
  const originalRestore=restore;
  restore=html=>{clearCard();originalRestore(html);wireCards();};
  const originalSetEditable=setEditable;
  setEditable=on=>{if(!on)clearCard();originalSetEditable(on);wireCards();};
  const originalSelectSection=selectSection;
  selectSection=section=>{if(selectedCard&&selectedCard.closest('section')!==section)clearCard();originalSelectSection(section);updateCardControls();};
  document.querySelector('#addCard')?.addEventListener('click',addCard);
  document.querySelector('#duplicateCard')?.addEventListener('click',duplicateCard);
  document.querySelector('#deleteCard')?.addEventListener('click',deleteCard);
  wireCards();
})();

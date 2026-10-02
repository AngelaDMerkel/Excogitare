/* Prepared maps and bookmarks for isolated selection studies. */
(() => {
  const original=current;
  history=[...samples.slice(1,4).map(sampleWorld),original,...samples.slice(4).map(sampleWorld)];
  for(const world of [history[1],history.at(-1)])world.kept=true;
  const note=document.createElement('small');note.className='selection-study-note';note.textContent='Mockup · selection and bookmarks reset on reload';document.querySelector('.workspace').append(note);
  setCurrent(original);
})();

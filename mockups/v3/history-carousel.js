/* The right history fades at the measured lower edge of the menu. */
(() => {
  const panel=document.querySelector('.panel'),workspace=document.querySelector('.workspace');
  function align(){
    if(document.body.dataset.historyLayout!=='right'||!panel.offsetHeight)return;
    const p=panel.getBoundingClientRect(),w=workspace.getBoundingClientRect(),scale=workspace.clientHeight/w.height;
    const end=Math.max(96,Math.min(workspace.clientHeight-16,(p.bottom-w.top)*scale));
    const value=`${end}px`;if(document.body.style.getPropertyValue('--history-menu-end')!==value){document.body.style.setProperty('--history-menu-end',value);document.querySelector('#world-list .current')?.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  new ResizeObserver(align).observe(panel);window.addEventListener('resize',align);window.addEventListener('v3:sidebar-fit',align);align();
})();

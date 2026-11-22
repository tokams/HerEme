'use strict';
(()=>{
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const control='button,a[href],[role="button"],summary';
  const tip='.action-icon-button,.icon-button,.back-button,.details-button,.attachment-button,.viewer-icon-button,.viewer-nav';
  function label(target){const element=target?.closest?.(tip);if(!element)return;const value=element.getAttribute('aria-label')||element.getAttribute('title');if(value)element.dataset.motionTip=value;if(element.hasAttribute('title'))element.removeAttribute('title');}
  document.addEventListener('pointerover',event=>label(event.target),{passive:true});
  document.addEventListener('focusin',event=>label(event.target));
  document.addEventListener('keydown',event=>{if(!['Enter',' '].includes(event.key)||event.repeat)return;const element=event.target.closest?.(control);if(element&&!element.matches(':disabled,[aria-disabled=true]'))element.classList.add('motion-key-press');});
  for(const name of ['keyup','blur'])document.addEventListener(name,event=>event.target.closest?.(control)?.classList.remove('motion-key-press'),true);
  const enter=(element,name)=>{if(!element||reduced())return;element.classList.remove(name);void element.offsetWidth;element.classList.add(name);element.addEventListener('animationend',()=>element.classList.remove(name),{once:true});};
  window.HeremeMotion={enter,reduced};
})();

/* The YouTube iframe handles its own keys before the study document can see
   them. Route its seek controls to the same subtitle navigation as the reader. */
(() => {
  if (!['www.youtube.com','www.youtube-nocookie.com'].includes(location.hostname) || !location.pathname.startsWith('/embed/')) return;
  const jump = direction => window.webkit?.messageHandlers?.immersedPlayer?.postMessage({direction});
  document.addEventListener('keydown', event => {
    if(event.ctrlKey||event.altKey||event.metaKey||event.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
    const direction = ['ArrowLeft','j','J'].includes(event.key) ? -1 : ['ArrowRight','l','L'].includes(event.key) ? 1 : 0;
    if(!direction)return;
    event.preventDefault();event.stopImmediatePropagation();jump(direction);
  },true);
  const labelButtons = () => {
    for(const button of document.querySelectorAll('button[aria-label]')) {
      if(button.dataset.immersedJump)continue;
      const label=button.getAttribute('aria-label')||'';
      const direction=/^(?:Rewind\b|巻き戻し)|\d+\s*秒.*戻/u.test(label)?-1:/^(?:Fast forward\b|早送り)|\d+\s*秒.*進/u.test(label)?1:0;
      if(!direction)continue;
      button.dataset.immersedJump=String(direction);
      button.setAttribute('aria-label',direction<0?'Previous subtitle':'Next subtitle');
      button.title=direction<0?'Previous subtitle':'Next subtitle';
    }
  };
  document.addEventListener('click', event => {
    const button=event.target.closest?.('[data-immersed-jump]');
    if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();jump(Number(button.dataset.immersedJump));
  },true);
  new MutationObserver(labelButtons).observe(document,{childList:true,subtree:true});
  labelButtons();
})();

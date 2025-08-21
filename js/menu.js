import { $, on, state, update, subscribe } from './ui.js';

export function initMenu(homeSection){
  const codeInput = $('#syncCode', homeSection);
  const btn = $('#connectCloudBtn', homeSection);
  const msg = $('#cloudMsg', homeSection);

  // show existing code
  if(state.sync?.code) codeInput.value = state.sync.code;

  on(btn, 'click', async ()=>{
    const code = codeInput.value.trim();
    if(!code){ msg.textContent = 'Enter a code to sync.'; return; }
    try{
      await connectCloud(false, code);
      msg.textContent = 'Connected.';
    }catch(e){
      console.error(e);
      msg.textContent = 'Could not connect.';
    }
  });

  subscribe('sync', synced=>{
    $('#syncChip').classList.toggle('hidden', !synced);
  });
}

// dummy “cloud” hooks (you can wire Firebase here)
export async function connectCloud(silent=false, code=null){
  if(code===null) code = state.sync?.code || '';
  if(!code){
    if(!silent) throw new Error('no code');
    return;
  }
  update(s=>{ s.sync = {code}; });
  // emit to subscribers
  const event = new Event('sync-change');
  window.dispatchEvent(event);
  return true;
}

export function pushToCloud(payload){
  // no-op here; place your Firebase write call
  void payload;
}

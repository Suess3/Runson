// Sync UI + Firebase connect/push + “✓ Synced” chip
import { $, on, state, update, getState, go } from './ui.js';

// Firebase (CDN modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

let app, auth, db, docRef, unsub;

const firebaseConfig = {
  apiKey: "AIzaSyAHd5uyDJF7bKNjfJIRPGQuh7k2W6tDcE8",
  authDomain: "runson-83a3b.firebaseapp.com",
  projectId: "runson-83a3b",
  storageBucket: "runson-83a3b.firebasestorage.app",
  messagingSenderId: "659521632447",
  appId: "1:659521632447:web:ba3960e5c5b5494e77ae0a",
  measurementId: "G-08E9MT3JC3"
};

function ensureFirebase(){
  if(app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db   = getFirestore(app);
}

export function initMenu(){
  // Nav buttons
  on($('#navHome'),  'click', ()=>go('home'));
  on($('#navRun'),   'click', ()=>go('run'));
  on($('#navStats'), 'click', ()=>go('stats'));
  on($('#navTracks'),'click', ()=>go('tracks'));

  // Sync UI
  const syncCodeInput = $('#syncCode');
  if(syncCodeInput) syncCodeInput.value = state.sync.code || 'Run';
  on($('#connectCloudBtn'), 'click', async ()=>{
    const code = (syncCodeInput?.value||'Run').trim() || 'Run';
    update(s => { s.sync.code = code; s.sync.connected = false; });
    await connectCloud();
  });

  // Persistent ✓ chip visibility is toggled whenever state.sync.connected changes
  const syncChip = $('#syncChip');
  const updateChip = () => syncChip?.classList.toggle('hidden', !state.sync.connected);
  updateChip();
  // main.js also re-renders on state changes; this keeps chip in sync.
}

export async function connectCloud(){
  ensureFirebase();
  const cloudMsg = $('#cloudMsg');
  const code = (state.sync.code || 'Run').trim() || 'Run';
  try{
    await signInAnonymously(auth);
    if(unsub) unsub();
    docRef = doc(db, 'runtracker', code);
    unsub = onSnapshot(docRef, snap => {
      if(!snap.exists()){
        const s = getState();
        setDoc(docRef, { tracks: s.tracks, runs: s.runs, goals: s.goals, updatedAt: serverTimestamp() });
        cloudMsg.textContent = 'Created cloud doc. Synced.'; setTimeout(()=>cloudMsg.textContent='', 1500);
      }else{
        const cloud = snap.data();
        if(cloud && cloud.tracks && cloud.runs && cloud.goals){
          update(s=>{
            s.tracks = cloud.tracks;
            s.runs   = cloud.runs;
            s.goals  = cloud.goals;
          });
          cloudMsg.textContent = 'Synced from cloud.'; setTimeout(()=>cloudMsg.textContent='', 1200);
        }
      }
      // mark connected and show chip
      update(s=>{ s.sync.connected = true; });
      const chip = $('#syncChip'); chip?.classList.remove('hidden');
    });
  }catch(e){
    if(cloudMsg) cloudMsg.textContent = 'Cloud error: ' + (e?.message||e);
  }
}

export async function pushToCloud(){
  if(!docRef) return; // not connected yet
  try{
    const s = getState();
    await setDoc(docRef, { tracks:s.tracks, runs:s.runs, goals:s.goals, updatedAt: serverTimestamp() }, { merge:true });
  }catch(e){
    console.warn('pushToCloud error', e);
  }
}

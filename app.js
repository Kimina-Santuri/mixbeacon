/* MixBeacon v0.1. All audio remains in the browser. */
const F0 = 17200, F1 = 18400, SYMBOL_SECONDS = .25;
const BEACON_SPEEDS = [
  {id:'1', label:'1× baseline', seconds:.25},
  {id:'2', label:'2× experimental', seconds:.125},
  {id:'4', label:'4× experimental', seconds:.0625}
];
function selectedSpeed() { return BEACON_SPEEDS.find(speed=>speed.id===$('beaconSpeed').value) || BEACON_SPEEDS[0]; }
function updateSpeedHint() {
  const speed=selectedSpeed(), duration=FRAME_BITS*speed.seconds;
  $('speedHint').textContent=`${speed.label}: ${duration.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')} s per frame. Two full frames need about ${(2*duration).toFixed(1)}–${(3*duration).toFixed(1)} s from an arbitrary playback position. Faster modes need phone testing.`;
}
const PREAMBLE = '1100101011110000';
const FRAME_BITS = PREAMBLE.length + 42; // 16-bit sync + six Hamming(7,4) codewords

const REQUIRED_CONFIRMATIONS = 2;
const $ = (id) => document.getElementById(id);
const registry = JSON.parse(localStorage.getItem('mixbeacon-registry') || '{}');

function randomCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
function crc8(bits) { let crc=0; for(const character of bits) { const top=(crc >> 7) & 1; crc=(crc << 1) & 255; if(top !== Number(character)) crc ^= 0x07; } return crc.toString(2).padStart(8,'0'); }
function legacyParity(bits) { return String(bits.split('').filter(bit=>bit==='1').length % 2); }
function hammingEncode(nibble) { const [d1,d2,d3,d4]=nibble.split('').map(Number), p1=d1^d2^d4, p2=d1^d3^d4, p4=d2^d3^d4; return `${p1}${p2}${d1}${p4}${d2}${d3}${d4}`; }
function hammingDecode(word) { const b=word.split('').map(Number), syndrome=(b[0]^b[2]^b[4]^b[6]) + 2*(b[1]^b[2]^b[5]^b[6]) + 4*(b[3]^b[4]^b[5]^b[6]); if(syndrome) b[syndrome-1]^=1; return { bits:`${b[2]}${b[4]}${b[5]}${b[6]}`, corrected: Boolean(syndrome) }; }
function bitsFor(code) { const message=Number(code).toString(2).padStart(16,'0') + crc8(Number(code).toString(2).padStart(16,'0')); return PREAMBLE + message.match(/.{4}/g).map(hammingEncode).join(''); }
function getCode() { let code = $('mixCode').value.replace(/\D/g, ''); if (!code) code = randomCode(); $('mixCode').value = code; return code; }
function saveRegistry(code, name) { registry[code] = { name, savedAt: new Date().toISOString() }; localStorage.setItem('mixbeacon-registry', JSON.stringify(registry)); }
const yieldUi = () => new Promise(requestAnimationFrame);

async function wavBlob(buffer, onProgress) {
  const channels = buffer.numberOfChannels, frames = buffer.length, bytes = 44 + frames * channels * 2;
  const view = new DataView(new ArrayBuffer(bytes)); let p = 0;
  const w = (v, n) => { for(let i=0;i<n;i++) view.setUint8(p++, (v >> (i*8)) & 255); };
  w(0x46464952,4); w(bytes-8,4); w(0x45564157,4); w(0x20746d66,4); w(16,4); w(1,2); w(channels,2); w(buffer.sampleRate,4); w(buffer.sampleRate*channels*2,4); w(channels*2,2); w(16,2); w(0x61746164,4); w(bytes-44,4);
  const audio = Array.from({length: channels}, (_, c) => buffer.getChannelData(c));
  const CHUNK = 32768;
  for(let start=0;start<frames;start+=CHUNK) {
    const end = Math.min(start + CHUNK, frames);
    for(let i=start;i<end;i++) for(let c=0;c<channels;c++) { const x=audio[c][i]; view.setInt16(p, x<0?Math.max(-32768,x*32768):Math.min(32767,x*32767), true); p+=2; }
    onProgress?.(end / frames); await yieldUi();
  }
  return new Blob([view], { type:'audio/wav' });
}
function download(blob, name, speed) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'') + `-mixbeacon-${speed.id}x.wav`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

$('encodeButton').addEventListener('click', async () => {
  const file = $('audioFile').files[0], name = $('mixName').value.trim();
  if (!file || !name) return alert('Add a mix name and choose an audio file first.');
  const button=$('encodeButton'), progress=$('encodeProgress'), bar=progress.querySelector('i'), label=progress.querySelector('span');
  button.disabled=true; progress.classList.remove('hidden');
  try {
    label.textContent='Decoding audio locally…'; bar.style.width='14%';
    const ctx=new AudioContext(), source=await ctx.decodeAudioData(await file.arrayBuffer());
    label.textContent='Writing the repeating ultrasonic beacon…'; bar.style.width='33%';
    if (source.sampleRate < 40000) throw new Error('Source sample rate is too low for this ultrasonic test.');
    const output=new AudioBuffer({length:source.length, numberOfChannels:source.numberOfChannels, sampleRate:source.sampleRate});
    const speed=selectedSpeed(), code=getCode(), bits=bitsFor(code), amp=Number($('strength').value), sr=source.sampleRate, symbolSamples=Math.round(sr*speed.seconds);
    const frameSamples = symbolSamples * bits.length, beacon = new Float32Array(frameSamples);
    for(let i=0;i<frameSamples;i++) { const f=bits[Math.floor(i/symbolSamples)]==='1'?F1:F0; beacon[i]=amp*Math.sin(2*Math.PI*f*i/sr); }
    const CHUNK=32768;
    for(let c=0;c<source.numberOfChannels;c++) {
      const from=source.getChannelData(c), to=output.getChannelData(c);
      for(let start=0;start<from.length;start+=CHUNK) {
        const end=Math.min(start+CHUNK,from.length);
        for(let i=start;i<end;i++) { const mixed=from[i]+beacon[i%frameSamples]; to[i]=mixed>1?1:mixed<-1?-1:mixed; }
        const done=(c*from.length+end)/(source.numberOfChannels*from.length);
        bar.style.width=`${33+done*43}%`; label.textContent=`Writing beacon… ${Math.round(done*100)}%`; await yieldUi();
      }
    }
    bar.style.width='77%'; label.textContent='Creating WAV download… 0%';
    const blob=await wavBlob(output, done => { bar.style.width=`${77+done*21}%`; label.textContent=`Creating WAV download… ${Math.round(done*100)}%`; });
    download(blob, name, speed); saveRegistry(code,name);
    bar.style.width='100%'; label.textContent=`Done — mix code ${code}, ${speed.label}. Verify this WAV, then test with Listen.`; ctx.close();
  } catch(e) { console.error(e); alert('This browser could not decode that file, or its sample rate is too low. Use a 44.1 kHz+ WAV or MP3.'); progress.classList.add('hidden'); }
  finally { button.disabled=false; }
});

let audioContext, micStream, processor, scanner, listening=false, confirmations=new Map();
let diagnostic, diagnosticTimer;
function resetDiagnostic() {
  diagnostic={callbacks:0,lastAudio:null,frames:0,code:null,settings:{},mic:null,zero:null,one:null,started:performance.now(),speed:null,firstIdentification:null};
  for(const id of ['diagMic','diagZero','diagOne','diagCode','diagRates','diagProcessing','diagContext','diagSpeed','diagTime']) $(id).textContent='—';
  for(const id of ['diagMicMeter','diagZeroMeter','diagOneMeter']) $(id).value=-100;
  $('diagCallbacks').textContent='0'; $('diagFrames').textContent='0'; $('diagCopyState').textContent='';
}
function powerDb(power) { return power>0 ? 10*Math.log10(power) : -Infinity; }
function showLevel(id, value) {
  $(id).textContent=Number.isFinite(value) ? `${value.toFixed(1)} dBFS` : 'Below measurement floor';
  $(`${id}Meter`).value=Number.isFinite(value) ? Math.max(-100,Math.min(0,value)) : -100;
}
function measureSymbol(frame, rate) {
  let energy=0; for(const sample of frame) energy+=sample*sample;
  diagnostic.mic=powerDb(energy/frame.length);
  const measurable=rate/2>F1;
  diagnostic.zero=measurable ? powerDb(2*Math.max(0,goertzel(frame,F0,rate))/(frame.length*frame.length)) : null;
  diagnostic.one=measurable ? powerDb(2*Math.max(0,goertzel(frame,F1,rate))/(frame.length*frame.length)) : null;
}
function renderDiagnostic() {
  if(!diagnostic) return;
  $('diagCallbacks').textContent=String(diagnostic.callbacks);
  $('diagFrames').textContent=String(diagnostic.frames);
  $('diagCode').textContent=diagnostic.code || '—';
  $('diagSpeed').textContent=diagnostic.speed?.label || 'Searching 1× / 2× / 4×';
  $('diagTime').textContent=diagnostic.firstIdentification===null ? '—' : `${diagnostic.firstIdentification.toFixed(1)} s from microphone start`;
  $('diagContext').textContent=audioContext?.state || 'Not started';
  for(const [id,value] of [['diagMic',diagnostic.mic],['diagZero',diagnostic.zero],['diagOne',diagnostic.one]]) {
    if(value!==null) showLevel(id,value);
  }
  if(!listening) return;
  const now=performance.now(), settings=diagnostic.settings;
  let message;
  if(audioContext.state!=='running') message=`Audio engine ${audioContext.state} — stop and restart the microphone with this page visible.`;
  else if(diagnostic.lastAudio===null) message=now-diagnostic.started>3000 ? 'Microphone opened, but no audio callbacks are arriving. Stop and restart the microphone.' : 'Microphone opened — waiting for audio callbacks…';
  else if(now-diagnostic.lastAudio>2000) message='Audio callbacks have stalled. Keep this page visible; stop and restart if needed.';
  else if(audioContext.sampleRate/2<=F1 || (settings.sampleRate && settings.sampleRate/2<=F1)) message='Reported sample rate is too low to capture both beacon carriers.';
  else if(diagnostic.mic===null) message='Audio callbacks arriving — collecting the first signal window…';
  else if(diagnostic.mic < -90) message='Audio callbacks arriving, but input is near silent. Check the microphone route and playback.';
  else message='Audio samples arriving. Compare the carrier levels with playback off and on; valid frames confirm decoding.';
  $('micDiagnosticStatus').textContent=message;
}
function showMicSettings() {
  const settings=diagnostic.settings;
  $('diagRates').textContent=`Mic: ${settings.sampleRate ? settings.sampleRate+' Hz' : 'not reported'} / engine: ${audioContext.sampleRate} Hz`;
  const describe=key=>settings[key]===true?'on':settings[key]===false?'off':'not reported';
  $('diagProcessing').textContent=`Echo: ${describe('echoCancellation')}; noise: ${describe('noiseSuppression')}; auto gain: ${describe('autoGainControl')}`;
}
$('copyDiagnostic').addEventListener('click', async () => {
  renderDiagnostic();
  const rows=[['Status','micDiagnosticStatus'],['Callbacks','diagCallbacks'],['Microphone','diagMic'],['17.2 kHz','diagZero'],['18.4 kHz','diagOne'],['Valid frames','diagFrames'],['Latest code','diagCode'],['Detected speed','diagSpeed'],['First identification','diagTime'],['Audio engine','diagContext'],['Sample rates','diagRates'],['Processing','diagProcessing']];
  const report=['MixBeacon microphone diagnostic',new Date().toISOString(),`Browser: ${navigator.userAgent}`,...rows.map(([label,id])=>`${label}: ${$(id).textContent}`),'No audio is included in this report.'].join('\n');
  try { await navigator.clipboard.writeText(report); $('diagCopyState').textContent='Report copied — paste it into the chat.'; }
  catch { $('diagCopyState').textContent='Clipboard unavailable. Copy this report:'; const output=document.createElement('textarea'); output.value=report; output.readOnly=true; output.setAttribute('aria-label','Diagnostic report'); output.style.width='100%'; output.rows=12; $('diagCopyState').appendChild(output); output.select(); }
});
function goertzel(data, frequency, sampleRate) { const omega=2*Math.PI*frequency/sampleRate, coeff=2*Math.cos(omega); let q0=0,q1=0,q2=0; for(const x of data){q0=coeff*q1-q2+x;q2=q1;q1=q0;} return q1*q1+q2*q2-coeff*q1*q2; }
function analyseFrame(frame, rate) { return goertzel(frame,F1,rate)>goertzel(frame,F0,rate)?'1':'0'; }
function decodeFrame(candidate) { let syncErrors=0; for(let i=0;i<PREAMBLE.length;i++) if(candidate[i]!==PREAMBLE[i]) syncErrors++; if(syncErrors>1) return null; let message='', corrections=0; const coded=candidate.slice(PREAMBLE.length); for(let i=0;i<coded.length;i+=7) { const decoded=hammingDecode(coded.slice(i,i+7)); message+=decoded.bits; corrections+=Number(decoded.corrected); } const payload=message.slice(0,16), receivedCrc=message.slice(16); if(crc8(payload)!==receivedCrc) return null; const code=String(parseInt(payload,2)); if(Number(code)<1000 || Number(code)>9999) return null; return {code, corrections, syncErrors}; }
function decodeLegacyFrame(candidate) { if(candidate.length<31 || candidate.slice(0,PREAMBLE.length)!==PREAMBLE) return null; const payload=candidate.slice(16,30), code=String(parseInt(payload,2)); return legacyParity(payload)===candidate[30] && Number(code)>=1000 && Number(code)<=9999 ? code : null; }
// Four phase offsets per speed sample the middle half of a symbol, so starting
// between symbol boundaries does not force the decoder to mix adjacent bits.
function createBeaconScanner(rate, onFrame) {
  let pool=[], base=0;
  const accepted=new Map();
  const lanes=BEACON_SPEEDS.flatMap(speed=>Array.from({length:4},(_,phase)=>{
    const symbolSamples=Math.round(rate*speed.seconds);
    return {speed,symbolSamples,next:Math.round(phase*symbolSamples/4),bits:''};
  }));
  return {
    push(data) {
      pool.push(...data);
      const available=base+pool.length;
      for(const lane of lanes) {
        const n=lane.symbolSamples;
        while(Math.round(lane.next+n*.75)<=available) {
          const start=Math.round(lane.next+n*.25), end=Math.round(lane.next+n*.75);
          const bit=analyseFrame(pool.slice(start-base,end-base),rate);
          lane.bits=(lane.bits+bit).slice(-FRAME_BITS);
          if(lane.bits.length===FRAME_BITS) {
            const frame=decodeFrame(lane.bits);
            if(frame) {
              const startSample=Math.round(lane.next-(FRAME_BITS-1)*n+n*.25);
              const key=`${lane.speed.id}:${frame.code}`, previousEnd=accepted.get(key);
              // Offset lanes see the same physical frame. Only accept windows
              // that do not overlap the previous accepted frame for this ID/speed.
              if(previousEnd===undefined || startSample>=previousEnd) {
                accepted.set(key,end);
                onFrame({...frame,speed:lane.speed,startSample,endSample:end,frameSamples:FRAME_BITS*n});
              }
            }
          }
          lane.next+=n;
        }
      }
      const keepFrom=Math.min(...lanes.map(lane=>Math.round(lane.next+lane.symbolSamples*.25)));
      const discard=Math.max(0,Math.min(pool.length,keepFrom-base));
      pool.splice(0,discard); base+=discard;
    }
  };
}
function confirm(frame) {
  const key=`${frame.speed.id}:${frame.code}`, previous=confirmations.get(key);
  const count=previous && frame.startSample-previous.endSample<=frame.frameSamples*2 ? previous.count+1 : 1;
  confirmations.set(key,{count,endSample:frame.endSample});
  diagnostic.frames++; diagnostic.code=frame.code; diagnostic.speed=frame.speed;
  if(count>=REQUIRED_CONFIRMATIONS) {
    if(diagnostic.firstIdentification===null) diagnostic.firstIdentification=(performance.now()-diagnostic.started)/1000;
    return found(frame.code,frame.speed);
  }
  $('result').className='result'; $('result').textContent=`Valid ${frame.speed.label} beacon — confirming (${count}/${REQUIRED_CONFIRMATIONS})`;
}
function found(code,speed) {
  const entry=registry[code]; $('result').className='result found';
  $('result').textContent=(entry ? `Identified: ${entry.name}` : `Verified beacon — mix code ${code}`)+` / ${speed.label}`;
  if(navigator.vibrate)navigator.vibrate(80);
  confirmations.clear();
}
async function verifyMarkedFile() {
  const file=$('verifyFile').files[0], button=$('verifyButton'), state=$('verifyState');
  if(!file) return state.textContent='Choose the processed WAV or MP4 first.';
  button.disabled=true; state.textContent='Decoding file locally…';
  let ctx;
  try {
    ctx=new AudioContext(); const audio=await ctx.decodeAudioData(await file.arrayBuffer());
    if(audio.sampleRate<40000) throw new Error('sample rate too low');
    state.textContent='Checking 1×, 2× and 4× beacons in the first 60 seconds…';
    const channel=audio.getChannelData(0), valid=new Map(); let match;
    const verifier=createBeaconScanner(audio.sampleRate,frame=>{
      const key=`${frame.speed.id}:${frame.code}`, previous=valid.get(key);
      if(previous && frame.startSample-previous.endSample<=frame.frameSamples*2) match=frame;
      valid.set(key,frame);
    });
    const limit=Math.min(channel.length,Math.round(audio.sampleRate*60));
    for(let offset=0;offset<limit && !match;offset+=32768) {
      verifier.push(channel.subarray(offset,Math.min(offset+32768,limit)));
      await yieldUi();
    }
    if(match) {
      const entry=registry[match.code];
      state.textContent=(entry ? `Verified: ${entry.name} (${match.code})` : `Verified marker — mix code ${match.code}`)+` / ${match.speed.label}`;
      state.style.color='var(--ink)';
    } else {
      const symbolSamples=Math.round(audio.sampleRate*SYMBOL_SECONDS);
      const legacyBits=Array.from({length:31},(_,bit)=>analyseFrame(channel.subarray(bit*symbolSamples,(bit+1)*symbolSamples),audio.sampleRate)).join('');
      const legacyCode=decodeLegacyFrame(legacyBits);
      state.textContent=legacyCode ? `Legacy marker found (${legacyCode}) — refresh the site and re-encode.` : 'No two matching frames in the first 60 seconds. Use a longer file, or re-encode from the unmarked source at 1×.';
      state.style.color='#a33';
    }
  } catch(error) { console.error(error); state.textContent='Could not read this file. Try the original processed WAV first.'; state.style.color='#a33'; }
  finally { ctx?.close(); button.disabled=false; }
}
$('verifyButton').addEventListener('click',verifyMarkedFile);
$('verifyFile').addEventListener('change', event => { $('verifyFileName').textContent=event.target.files[0]?.name || 'Choose marked WAV or MP4'; $('verifyState').textContent=event.target.files[0] ? 'Ready to verify this file directly.' : 'Checks the encoded audio directly.'; $('verifyState').style.color=''; });
async function startListening(){
  const button=$('listenButton'); button.disabled=true;
  resetDiagnostic(); confirmations.clear();
  $('micDiagnosticStatus').textContent='Requesting microphone access…';
  try {
    audioContext=new AudioContext();
    // Resume during the user gesture; do not assume an opened mic means a running engine.
    audioContext.resume().catch(console.error);
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    diagnostic.settings=micStream.getAudioTracks()[0]?.getSettings?.() || {};
    showMicSettings();
    const src=audioContext.createMediaStreamSource(micStream);
    processor=audioContext.createScriptProcessor(4096,1,1);
    scanner=createBeaconScanner(audioContext.sampleRate,confirm);
    let pool=[]; const needed=Math.round(audioContext.sampleRate*.0625);
    processor.onaudioprocess=e=>{
      if(!listening) return;
      diagnostic.callbacks++; diagnostic.lastAudio=performance.now();
      const input=e.inputBuffer.getChannelData(0);
      scanner.push(input);
      pool.push(...input);
      while(pool.length>=needed){
        const frame=pool.splice(0,needed);
        measureSymbol(frame,audioContext.sampleRate);
      }
    };
    src.connect(processor); processor.connect(audioContext.destination);
    listening=true; diagnostic.started=performance.now();
    $('radar').classList.add('listening'); button.textContent='Stop microphone'; button.classList.add('stop');
    $('listenState').textContent='Listening for 17.2 / 18.4 kHz — auto 1× / 2× / 4×…';
    $('result').className='result'; $('result').textContent='Searching for a verified beacon';
    renderDiagnostic(); diagnosticTimer=setInterval(renderDiagnostic,250);
  } catch(e){
    stopListening();
    $('micDiagnosticStatus').textContent=`Microphone could not start (${e.name || 'Error'}). Use HTTPS, allow microphone access, and try again.`;
    console.error(e);
  } finally { button.disabled=false; }
}
function stopListening(){
  listening=false; clearInterval(diagnosticTimer);
  if(processor){ processor.onaudioprocess=null; processor.disconnect(); processor=null; }
  micStream?.getTracks().forEach(t=>t.stop()); micStream=null;
  const closing=audioContext;
  if(closing && closing.state!=='closed') closing.close().then(()=>{if(audioContext===closing)renderDiagnostic();}).catch(console.error);
  scanner=null; confirmations.clear();
  $('radar').classList.remove('listening'); $('listenButton').textContent='Start microphone'; $('listenButton').classList.remove('stop'); $('listenState').textContent='Ready to listen';
  renderDiagnostic(); $('micDiagnosticStatus').textContent='Microphone stopped. Last readings are retained until the next test.';
}
$('listenButton').addEventListener('click',()=>listening?stopListening():startListening());

$('beaconSpeed').addEventListener('change',updateSpeedHint);
updateSpeedHint();

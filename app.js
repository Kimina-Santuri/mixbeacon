/* MixBeacon v0.1. All audio remains in the browser. */
const F0 = 17200, F1 = 18400, SYMBOL_SECONDS = .25;
const PREAMBLE = '1100101011110000';
const FRAME_BITS = PREAMBLE.length + 42; // 16-bit sync + six Hamming(7,4) codewords
const FRAME_DURATION_MS = FRAME_BITS * SYMBOL_SECONDS * 1000;
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
function download(blob, name) { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'') + '-mixbeacon.wav'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

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
    const code=getCode(), bits=bitsFor(code), amp=Number($('strength').value), sr=source.sampleRate, symbolSamples=Math.round(sr*SYMBOL_SECONDS);
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
    download(blob, name); saveRegistry(code,name);
    bar.style.width='100%'; label.textContent=`Done — mix code ${code}. Test it with Listen.`; ctx.close();
  } catch(e) { console.error(e); alert('This browser could not decode that file, or its sample rate is too low. Use a 44.1 kHz+ WAV or MP3.'); progress.classList.add('hidden'); }
  finally { button.disabled=false; }
});

let audioContext, micStream, processor, samples=[], listening=false, confirmations=new Map();
function goertzel(data, frequency, sampleRate) { const k=Math.round(data.length*frequency/sampleRate), omega=2*Math.PI*k/data.length, coeff=2*Math.cos(omega); let q0=0,q1=0,q2=0; for(const x of data){q0=coeff*q1-q2+x;q2=q1;q1=q0;} return q1*q1+q2*q2-coeff*q1*q2; }
function analyseFrame(frame, rate) { return goertzel(frame,F1,rate)>goertzel(frame,F0,rate)?'1':'0'; }
function decodeFrame(candidate) { let syncErrors=0; for(let i=0;i<PREAMBLE.length;i++) if(candidate[i]!==PREAMBLE[i]) syncErrors++; if(syncErrors>1) return null; let message='', corrections=0; const coded=candidate.slice(PREAMBLE.length); for(let i=0;i<coded.length;i+=7) { const decoded=hammingDecode(coded.slice(i,i+7)); message+=decoded.bits; corrections+=Number(decoded.corrected); } const payload=message.slice(0,16), receivedCrc=message.slice(16); if(crc8(payload)!==receivedCrc) return null; const code=String(parseInt(payload,2)); if(Number(code)<1000 || Number(code)>9999) return null; return {code, corrections, syncErrors}; }
function decodeLegacyFrame(candidate) { if(candidate.length<31 || candidate.slice(0,PREAMBLE.length)!==PREAMBLE) return null; const payload=candidate.slice(16,30), code=String(parseInt(payload,2)); return legacyParity(payload)===candidate[30] && Number(code)>=1000 && Number(code)<=9999 ? code : null; }
function confirm(frame) { const now=performance.now(), previous=confirmations.get(frame.code); let count=1; if(previous) count=now-previous.last > FRAME_DURATION_MS*.6 ? previous.count+1 : previous.count; confirmations.set(frame.code,{count,last:now}); if(count>=REQUIRED_CONFIRMATIONS) return found(frame.code); $('result').className='result'; $('result').textContent=`Valid beacon found — confirming (${count}/${REQUIRED_CONFIRMATIONS})`; }
function tryDecode() { const frameBits=samples.join(''); if(frameBits.length<FRAME_BITS)return; for(let start=Math.max(0,frameBits.length-FRAME_BITS-3);start<=frameBits.length-FRAME_BITS;start++){ const frame=decodeFrame(frameBits.slice(start,start+FRAME_BITS)); if(frame) return confirm(frame); } }
function found(code) { const entry=registry[code]; $('result').className='result found'; $('result').textContent=entry ? `Identified: ${entry.name}` : `Verified beacon — mix code ${code}`; if(navigator.vibrate)navigator.vibrate(80); samples=[]; confirmations.clear(); }
async function verifyMarkedFile() {
  const file=$('verifyFile').files[0], button=$('verifyButton'), state=$('verifyState');
  if(!file) return state.textContent='Choose the processed WAV or MP4 first.';
  button.disabled=true; state.textContent='Decoding file locally…';
  let ctx;
  try {
    ctx=new AudioContext(); const audio=await ctx.decodeAudioData(await file.arrayBuffer());
    if(audio.sampleRate<40000) throw new Error('sample rate too low');
    state.textContent='Reading the first two beacon frames…';
    const channel=audio.getChannelData(0), symbolSamples=Math.round(audio.sampleRate*SYMBOL_SECONDS), frameSamples=FRAME_BITS*symbolSamples;
    const valid=[];
    for(let frameStart=0;frameStart+frameSamples<=channel.length && valid.length<2;frameStart+=frameSamples) {
      let bits='';
      for(let bit=0;bit<FRAME_BITS;bit++) bits+=analyseFrame(channel.subarray(frameStart+bit*symbolSamples,frameStart+(bit+1)*symbolSamples),audio.sampleRate);
      const decoded=decodeFrame(bits); if(decoded) valid.push(decoded);
    }
    if(valid.length===2 && valid[0].code===valid[1].code) { const entry=registry[valid[0].code]; state.textContent=entry ? `Verified: ${entry.name} (${valid[0].code})` : `Verified marker — mix code ${valid[0].code}`; state.style.color='var(--ink)'; }
    else { const legacyBits=Array.from({length:31},(_,bit)=>analyseFrame(channel.subarray(bit*symbolSamples,(bit+1)*symbolSamples),audio.sampleRate)).join(''); const legacyCode=decodeLegacyFrame(legacyBits); state.textContent=legacyCode ? `Legacy marker found (${legacyCode}) — refresh the site and re-encode.` : 'No current-protocol marker found. Re-encode this file after refreshing the site.'; state.style.color='#a33'; }
  } catch(error) { console.error(error); state.textContent='Could not read this file. Try the original processed WAV first.'; state.style.color='#a33'; }
  finally { ctx?.close(); button.disabled=false; }
}
$('verifyButton').addEventListener('click',verifyMarkedFile);
$('verifyFile').addEventListener('change', event => { $('verifyFileName').textContent=event.target.files[0]?.name || 'Choose marked WAV or MP4'; $('verifyState').textContent=event.target.files[0] ? 'Ready to verify this file directly.' : 'Checks the encoded audio directly.'; $('verifyState').style.color=''; });
async function startListening(){
  try { confirmations.clear(); audioContext=new AudioContext(); micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}); const src=audioContext.createMediaStreamSource(micStream); processor=audioContext.createScriptProcessor(4096,1,1); let pool=[]; const needed=Math.round(audioContext.sampleRate*SYMBOL_SECONDS); processor.onaudioprocess=e=>{pool.push(...e.inputBuffer.getChannelData(0)); while(pool.length>=needed){samples.push(analyseFrame(pool.splice(0,needed),audioContext.sampleRate)); if(samples.length>160)samples.shift(); tryDecode();}}; src.connect(processor); processor.connect(audioContext.destination); listening=true; $('radar').classList.add('listening'); $('listenButton').textContent='Stop microphone'; $('listenButton').classList.add('stop'); $('listenState').textContent='Listening for 17.2 / 18.4 kHz…'; $('result').className='result'; $('result').textContent='Searching for a verified beacon'; }
  catch(e){ alert('Microphone access is needed to identify a mix. Use HTTPS or localhost, then allow microphone access.'); console.error(e); }
}
function stopListening(){listening=false; processor?.disconnect(); micStream?.getTracks().forEach(t=>t.stop()); audioContext?.close(); $('radar').classList.remove('listening'); $('listenButton').textContent='Start microphone'; $('listenButton').classList.remove('stop'); $('listenState').textContent='Ready to listen';}
$('listenButton').addEventListener('click',()=>listening?stopListening():startListening());

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('app.js','utf8');
function harness(rate=48000,settings={},failure=false) {
  const elements=new Map(); let time=0, stopped=false, copied='';
  const element=id=>{
    if(!elements.has(id)) elements.set(id,{textContent:'',value:0,style:{},classList:{add(){},remove(){}},addEventListener(event,fn){this[event]=fn;}});
    return elements.get(id);
  };
  const track={getSettings:()=>settings,stop(){stopped=true;}};
  class Context {
    constructor(){this.state='suspended';this.sampleRate=rate;}
    async resume(){this.state='running';}
    async close(){this.state='closed';}
    createMediaStreamSource(){return {connect(){}};}
    createScriptProcessor(){return {connect(){},disconnect(){}};}
  }
  const context=vm.createContext({document:{getElementById:element},localStorage:{getItem:()=>null},AudioContext:Context,performance:{now:()=>time},navigator:{userAgent:'Synthetic test',clipboard:{async writeText(s){copied=s;}},mediaDevices:{async getUserMedia(){if(failure)throw Object.assign(new Error('denied'),{name:'NotAllowedError'});return {getAudioTracks:()=>[track],getTracks:()=>[track]};}}},setInterval:()=>1,clearInterval(){},console:{error(){}},Float32Array});
  const run=code=>vm.runInContext(code,context);
  run(source);
  return {run,element,context,advance(ms){time+=ms;},get stopped(){return stopped;},get copied(){return copied;}};
}
test('tone levels are normalized and distinguish carriers at 44.1 and 48 kHz',()=>{
  for(const rate of [44100,48000]) {
    const h=harness(rate);h.run('resetDiagnostic()');
    for(const frequency of [17200,18400]) {
      h.context.signal=Float32Array.from({length:rate/4},(_,i)=>0.1*Math.sin(2*Math.PI*frequency*i/rate));
      h.run(`measureSymbol(signal,${rate})`);
      assert.ok(Math.abs(h.run('diagnostic.mic')+23.0103)<0.02);
      assert.ok(Math.abs(h.run(frequency===17200?'diagnostic.zero':'diagnostic.one')+23.0103)<0.02);
      assert.ok(h.run(frequency===17200?'diagnostic.one':'diagnostic.zero') < -100);
    }
    h.context.signal=new Float32Array(rate/4); h.run(`measureSymbol(signal,${rate}); renderDiagnostic()`);
    assert.equal(h.element('diagMic').textContent,'Below measurement floor');
  }
});
test('reports missing callbacks, silence, stalled input, suspension and actual settings',async()=>{
  const h=harness(48000,{sampleRate:48000,echoCancellation:false,noiseSuppression:true});
  await h.run('startListening()');h.advance(3100);h.run('renderDiagnostic()');
  assert.match(h.element('micDiagnosticStatus').textContent,/no audio callbacks/);
  assert.match(h.element('diagProcessing').textContent,/Echo: off; noise: on; auto gain: not reported/);
  h.context.signal=new Float32Array(12000);
  h.run('processor.onaudioprocess({inputBuffer:{getChannelData:()=>signal}}); renderDiagnostic()');
  assert.equal(h.element('diagCallbacks').textContent,'1');
  assert.match(h.element('micDiagnosticStatus').textContent,/near silent/);
  h.advance(2100);h.run('renderDiagnostic()');assert.match(h.element('micDiagnosticStatus').textContent,/stalled/);
  h.run("audioContext.state='suspended'; renderDiagnostic()");assert.match(h.element('micDiagnosticStatus').textContent,/engine suspended/);
  h.run('stopListening()');assert.equal(h.stopped,true);
  await h.run("$('copyDiagnostic').click()");assert.match(h.copied,/No audio is included/);
  await h.run('startListening()');assert.equal(h.run('diagnostic.callbacks'),0);assert.equal(h.run('samples.length'),0);
});
test('two synthesized beacon frames count once each and identify the mix',async()=>{
  const h=harness();await h.run('startListening()');
  const bits=h.run("bitsFor('4321')").repeat(2)+'0000';
  const signals={};for(const bit of ['0','1']) signals[bit]=Float32Array.from({length:12000},(_,i)=>0.03*Math.sin(2*Math.PI*(bit==='0'?17200:18400)*i/48000));
  for(const bit of bits){h.advance(250);h.context.signal=signals[bit];h.run('processor.onaudioprocess({inputBuffer:{getChannelData:()=>signal}})');}
  h.run('renderDiagnostic()');assert.equal(h.element('diagFrames').textContent,'2');
  assert.equal(h.element('diagCode').textContent,'4321');
  assert.match(h.element('result').textContent,/Verified beacon — mix code 4321/);
});
test('low sample rates and permission failures produce useful status and cleanup',async()=>{
  const h=harness(32000,{sampleRate:32000});await h.run('startListening()');
  h.context.signal=new Float32Array(8000);h.run('processor.onaudioprocess({inputBuffer:{getChannelData:()=>signal}});renderDiagnostic()');
  assert.match(h.element('micDiagnosticStatus').textContent,/too low/);
  const denied=harness(48000,{},true);await denied.run('startListening()');
  assert.match(denied.element('micDiagnosticStatus').textContent,/NotAllowedError/);
  assert.equal(denied.run('audioContext.state'),'closed');
  assert.equal(denied.element('listenButton').disabled,false);
});

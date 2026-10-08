import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync('deployments/kp-code-editor/kp-ai-audio-worklet.js','utf8');
for(const rate of [16000,44100,48000]){
 let Processor,frames=[];
 const sandbox={sampleRate:rate,AudioWorkletProcessor:class{constructor(){this.port={postMessage:buffer=>frames.push(buffer)};}},registerProcessor:(_,P)=>Processor=P};
 vm.runInNewContext(code,sandbox);const p=new Processor();
 for(let i=0;i<Math.ceil(rate/128);i++)p.process([[new Float32Array(128).fill(.5)]]);
 assert.ok(frames.length>=9&&frames.length<=10,`${rate}: one second yields about ten 100ms frames`);
 for(const frame of frames){assert.equal(frame.byteLength,3200);assert.equal(new DataView(frame).getInt16(0,true),16384);}
 assert.ok(p.input.length<5,'resampler does not retain unbounded input');
}
console.log('PCM framing, sample-rate conversion and bounded buffers passed.');

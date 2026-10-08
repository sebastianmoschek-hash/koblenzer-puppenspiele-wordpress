class KPPCMInput extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];this.position=0;this.input=[];}
  process(inputs){
    const data=inputs[0]?.[0];if(!data)return true;
    this.input.push(...data);
    const ratio=sampleRate/16000;
    while(this.position+1<this.input.length){
      const i=Math.floor(this.position),f=this.position-i;
      this.samples.push(Math.max(-1,Math.min(1,this.input[i]*(1-f)+this.input[i+1]*f)));
      this.position+=ratio;
      if(this.samples.length===1600){
        const buffer=new ArrayBuffer(3200),view=new DataView(buffer);
        this.samples.forEach((v,j)=>view.setInt16(j*2,Math.round(v<0?v*32768:v*32767),true));
        this.port.postMessage(buffer,[buffer]);this.samples=[];
      }
    }
    const used=Math.floor(this.position);this.input.splice(0,used);this.position-=used;
    return true;
  }
}
registerProcessor('kp-pcm-input',KPPCMInput);

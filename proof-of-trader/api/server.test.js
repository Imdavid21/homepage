import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
test('API fails closed without a ZK verifier',async t=>{
const port=38000+Math.floor(Math.random()*2000);
const child=spawn(process.execPath,['server.js'],{cwd:new URL('.',import.meta.url),env:{...process.env,PORT:String(port)},stdio:'ignore'});
t.after(()=>child.kill());
let up=false;
for(let i=0;i<40;i++){try{const r=await fetch('http://127.0.0.1:'+port+'/health');if(r.ok){up=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
assert.ok(up,'server starts');
const proof=await fetch('http://127.0.0.1:'+port+'/api/proofs/verify',{method:'POST'});
assert.equal(proof.status,503);
const admission=await fetch('http://127.0.0.1:'+port+'/api/admissions',{method:'POST'});
assert.equal(admission.status,503);
const policy=await (await fetch('http://127.0.0.1:'+port+'/api/events/hl-mumbai-2026/policy')).json();
assert.equal(policy.volumeUsdMinimum,100000);assert.equal(policy.accountAgeDaysMinimum,30);assert.equal(policy.fillsMinimum,10);assert.equal(policy.logic,'AND');
});

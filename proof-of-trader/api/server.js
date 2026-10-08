import http from 'node:http';
import { randomUUID } from 'node:crypto';
const PORT=Number(process.env.PORT||3000);
const policy=Object.freeze({eventId:'hl-mumbai-2026',version:1,volumeUsdMinimum:100000,accountAgeDaysMinimum:30,fillsMinimum:10,logic:'AND',capacity:150});
const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','access-control-allow-origin':process.env.ALLOWED_ORIGIN||'https://proof-of-trader-hl.onrender.com','vary':'Origin'});res.end(JSON.stringify(body));};
const server=http.createServer(async(req,res)=>{
const path=new URL(req.url,'http://localhost').pathname;
if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':process.env.ALLOWED_ORIGIN||'https://proof-of-trader-hl.onrender.com','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'600'});return res.end();}
if(req.method==='GET'&&path==='/health')return json(res,200,{status:'ok',mode:'verification-disabled',admissionsEnabled:false});
if(req.method==='GET'&&path==='/api/events/hl-mumbai-2026/policy')return json(res,200,policy);
if(req.method==='POST'&&path==='/api/proofs/verify')return json(res,503,{error:'PROVER_NOT_CONFIGURED',message:'No audited ZK verifier and authenticated historical data root are configured. Approval is disabled.'});
if(req.method==='POST'&&path==='/api/admissions')return json(res,503,{error:'ADMISSIONS_DISABLED',message:'Admissions remain disabled until cryptographic verification, atomic capacity control and replay protection are operational.'});
if(req.method==='POST'&&path==='/api/checkin')return json(res,503,{error:'CHECKIN_DISABLED'});
return json(res,404,{error:'NOT_FOUND',requestId:randomUUID()});
});
server.listen(PORT,'0.0.0.0',()=>console.log('Proof of Trader API listening on '+PORT));

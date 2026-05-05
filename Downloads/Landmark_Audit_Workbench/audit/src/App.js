import React,{useState,useCallback,useReducer,useRef,useEffect,useMemo}from 'react';
import * as XLSX from 'xlsx';
import './index.css';
import{parseWorkbook}from'./utils/parser';
import{runEngine}from'./utils/engine';
import{runPeriodicEngine}from'./utils/periodicEngine';
import{scoreAnomalies}from'./utils/anomalyApi';
import{Logger,fmtNum,fmtDate,toNum,toDate,monthKey,buildTransactionIds}from'./utils/helpers';
import{DEFAULT_CONFIG,EXPECTED_SHEETS,SHORTLISTED_GL,AUDIT_PROTOCOLS,ACCOUNT_META,TX_RULE_LABELS,STEPS,PREVIEW_COLS,ANOMALY_MODEL_OPTIONS}from'./constants';
import AccountCharts from'./components/AccountCharts';
import BenfordAnalysis from'./components/BenfordAnalysis';
import ValueHistogram from'./components/ValueHistogram';
import MlAnomalyDashboard from'./components/MlAnomalyDashboard';

// ─── Design tokens ────────────────────────────────────────────
const T={
  bg:'#F2EDE6',card:'#FFFFFF',mid:'#EDE8E1',hover:'#F8F5F1',border:'rgba(0,0,0,0.08)',borderHi:'rgba(0,0,0,0.15)',
  text:'#111827',sub:'#6B7280',dim:'#9CA3AF',
  orange:'#E8630A',orangeLt:'#FFF0E6',orangeMid:'rgba(232,99,10,0.12)',
  green:'#059669',red:'#DC2626',amber:'#D97706',blue:'#2563EB',purple:'#7C3AED',teal:'#0D9488',
  sm:'0 1px 3px rgba(0,0,0,0.08)',md:'0 4px 12px rgba(0,0,0,0.09)',
};
const LC={RED:T.red,AMBER:T.amber,GREEN:T.green,GREY:T.dim};
const LBG={RED:'#FEF2F2',AMBER:'#FFFBEB',GREEN:'#ECFDF5',GREY:'#F3F4F6'};
const LI={RED:'🔴',AMBER:'🟡',GREEN:'🟢',GREY:'⚫'};
const SC={CRITICAL:{bg:'#FEF2F2',bo:'#FECACA',c:T.red},HIGH:{bg:'#FFFBEB',bo:'#FDE68A',c:T.amber},MEDIUM:{bg:'#EFF6FF',bo:'#BFDBFE',c:T.blue}};
const fmtBHD=n=>n!=null?(Math.abs(n)<1000?Math.round(n).toLocaleString():Math.abs(n)>=1000000?(Math.round(n/1000)/1000).toFixed(2)+'M':Math.abs(n)>=1000?(Math.round(n/100)/10).toFixed(1)+'K':n.toString()):'—';

// ─── Shared primitives ────────────────────────────────────────
const Card=({ch,style={}})=><div style={{background:T.card,borderRadius:12,boxShadow:T.sm,border:`1px solid ${T.border}`,padding:16,...style}}>{ch}</div>;
const SevBadge=({sev})=>{const s=SC[sev]||SC.MEDIUM;return<span style={{display:'inline-block',padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:700,fontFamily:'var(--fb)',background:s.bg,border:`1px solid ${s.bo}`,color:s.c,letterSpacing:'0.03em'}}>{sev}</span>;};
const Mono=({ch,c=T.orange,size=11})=><span style={{fontFamily:'var(--fm)',fontSize:size,color:c}}>{ch}</span>;
const Lbl=({ch})=><div style={{fontSize:9,color:T.dim,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:3,fontFamily:'var(--fb)',fontWeight:600}}>{ch}</div>;
const Btn=({ch,onClick,variant='primary',style={},disabled=false})=>{
  const v={primary:{background:T.orange,color:'#fff',border:'none'},ghost:{background:'transparent',color:T.sub,border:`1px solid ${T.borderHi}`},success:{background:T.green,color:'#fff',border:'none'},link:{background:'none',color:T.orange,border:'none',padding:'2px 0',fontWeight:500}};
  return<button disabled={disabled} onClick={onClick} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:8,fontSize:13,fontWeight:600,cursor:disabled?'not-allowed':'pointer',fontFamily:'var(--fb)',transition:'opacity 0.15s',opacity:disabled?0.5:1,...v[variant],...style}} onMouseEnter={e=>{if(!disabled)e.currentTarget.style.opacity='0.85';}} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>{ch}</button>;
};

// ─── Log console ──────────────────────────────────────────────
const LS={head:{c:T.orange},info:{c:T.blue},ok:{c:T.green},warn:{c:T.amber},error:{c:T.red},data:{c:T.purple},sep:{c:'#D1D5DB'}};
const LV={head:'>>>>',info:'INFO',ok:'OK  ',warn:'WARN',error:'ERR!',data:'DATA',sep:'----'};
function LogConsole({logs,onClear}){
  const[open,setOpen]=useState(false);const ref=useRef();
  useEffect(()=>{if(ref.current&&open)ref.current.scrollTop=ref.current.scrollHeight;},[logs,open]);
  return(<div style={{borderRadius:12,overflow:'hidden',border:`1px solid ${T.border}`}}>
    <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 14px',background:T.card,border:'none',cursor:'pointer',fontFamily:'var(--fb)',fontSize:12,color:T.dim}}>
      <span style={{display:'flex',alignItems:'center',gap:7}}><span style={{color:T.green,animation:'pulse 1.5s infinite'}}>●</span>Console {logs.length>0&&<span style={{background:T.mid,padding:'1px 6px',borderRadius:10,fontSize:11}}>{logs.length}</span>}</span>
      <span style={{fontSize:11}}>{open?'▲':'▼'}</span>
    </button>
    {open&&<div style={{background:'#111827',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
      <div style={{display:'flex',justifyContent:'flex-end',padding:'4px 10px'}}><button onClick={onClear} style={{fontFamily:'var(--fb)',fontSize:11,color:'#6B7280',background:'none',border:'1px solid rgba(255,255,255,0.1)',padding:'2px 9px',borderRadius:4,cursor:'pointer'}}>Clear</button></div>
      <div ref={ref} style={{padding:'8px 14px',height:130,overflowY:'auto',fontFamily:'var(--fm)',fontSize:11,lineHeight:1.8}}>
        {logs.map((l,i)=><div key={i} style={{display:'flex',gap:10}}><span style={{color:'#4B5563',minWidth:68}}>{l.time}</span><span style={{color:(LS[l.level]||LS.info).c,minWidth:40}}>[{LV[l.level]||'INFO'}]</span><span style={{color:l.level==='head'?T.orange:l.level==='error'?'#FCA5A5':'#CBD5E1',flex:1,wordBreak:'break-word'}}>{l.msg}</span></div>)}
      </div>
    </div>}
  </div>);
}

// ─── MODULE 1: UPLOAD ─────────────────────────────────────────
function UploadModule({onComplete}){
  const[drag,setDrag]=useState(false);const[parsing,setParsing]=useState(false);
  const[prog,setProg]=useState(0);const[result,setResult]=useState(null);const fileRef=useRef();
  const handle=useCallback(async file=>{
    if(!file?.name.match(/\.(xlsx|xls)$/i))return alert('Please upload an .xlsx file');
    setParsing(true);setProg(10);
    try{const p=await parseWorkbook(file);setProg(100);setResult(p);onComplete(p);}
    catch(e){alert(`Error: ${e.message}`);}finally{setParsing(false);}
  },[onComplete]);
  const s=result?.summary||{};
  return(<div style={{maxWidth:760,margin:'0 auto',display:'flex',flexDirection:'column',gap:18}}>
    <div style={{textAlign:'center',padding:'8px 0 0'}}>
      <div style={{fontFamily:'var(--fh)',fontSize:22,fontWeight:800,marginBottom:5}}>Load Audit Data</div>
      <div style={{fontSize:13,color:T.sub}}>Drop your Landmark GL export (.xlsx). Everything runs locally — no data leaves your browser.</div>
    </div>
    <div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);handle(e.dataTransfer.files[0])}} onClick={()=>!parsing&&fileRef.current?.click()} style={{border:`2px dashed ${drag?T.orange:T.borderHi}`,borderRadius:12,padding:'40px 24px',textAlign:'center',cursor:parsing?'wait':'pointer',background:drag?T.orangeLt:T.card,transition:'all 0.2s',position:'relative',overflow:'hidden',boxShadow:T.sm}}>
      <div style={{fontSize:36,marginBottom:10}}>{parsing?'⏳':result?'✅':'📂'}</div>
      <div style={{fontFamily:'var(--fb)',fontSize:15,fontWeight:600,marginBottom:5}}>{parsing?'Processing...' : result?result.fileName : 'Drop your Excel file here'}</div>
      <div style={{fontSize:13,color:T.sub,marginBottom:16}}>{parsing?'Parsing sheets and validating schema...' : result?`${fmtNum(result.glData.length)} GL rows · ${result.fileSize}` : '.xlsx · GL Transactions + COA sheets auto-detected'}</div>
      {!parsing&&<Btn variant={result?'ghost':'primary'} ch={result?'↺ Load another file':'Browse File'} onClick={e=>{e.stopPropagation();fileRef.current?.click();}}/>}
      {parsing&&<div style={{position:'absolute',bottom:0,left:0,right:0,height:4,background:T.mid}}><div style={{height:'100%',width:`${prog}%`,background:T.orange,transition:'width 0.4s'}}/></div>}
    </div>
    <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e=>handle(e.target.files[0])}/>
    {result&&<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
        {[['Records',fmtNum(s.totalRecords)],['JVs',fmtNum(s.jvCount)],['Manual',fmtNum(s.manualJVs)],['Accounts',fmtNum(s.accountCount)],['Users',s.userCount],['Risk GLs',`${s.shortlistedFound||0}/${SHORTLISTED_GL.size}`]].map(([l,v])=>(
          <div key={l} style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:'12px 14px',textAlign:'center'}}>
            <div style={{fontSize:9,color:T.dim,fontFamily:'var(--fb)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>{l}</div>
            <div style={{fontFamily:'var(--fb)',fontSize:20,fontWeight:600,color:T.text}}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:'14px 18px',boxShadow:T.sm}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10,fontFamily:'var(--fb)'}}>Sheet Detection</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:7}}>
          {Object.entries(EXPECTED_SHEETS).map(([name,cfg])=>{const found=result.sheetNames.includes(name);const m=result.sheetMeta[name]||{};return(
            <div key={name} style={{borderLeft:`3px solid ${found?(cfg.role==='primary'?T.orange:T.green):T.dim}`,padding:'8px 10px',background:found?T.hover:T.bg,borderRadius:6}}>
              <div style={{fontSize:12,fontWeight:600,color:found?T.text:T.dim}}>{name}</div>
              <div style={{fontSize:11,color:T.sub}}>{found?`${fmtNum(name==='GL Transactions'?result.glData.length:m.rows||0)} rows`:cfg.desc}</div>
            </div>
          );})}
        </div>
      </div>
      {result.validation.some(c=>!c.ok&&c.critical)&&<div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:10,padding:'12px 16px',fontSize:13,color:T.red,fontFamily:'var(--fb)'}}>⚠️ Critical validation failures — check console before proceeding.</div>}
      <div style={{display:'flex',justifyContent:'flex-end'}}><Btn ch="Continue to Configuration →" onClick={()=>onComplete(result,true)}/></div>
    </>}
  </div>);
}

// ─── MODULE 2: CONFIGURE ──────────────────────────────────────
function ConfigModule({onReady,isRerun}){
  const[cfg,setCfg]=useState(DEFAULT_CONFIG);const[tab,setTab]=useState('protocols');
  const num=(field,label,suffix,hint)=>(<div key={field} style={{marginBottom:14}}>
    <label style={{display:'block',fontSize:11,color:T.sub,fontFamily:'var(--fm)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{label}</label>
    <div style={{display:'flex'}}><input type="number" value={cfg[field]} onChange={e=>setCfg(p=>({...p,[field]:parseFloat(e.target.value)||0}))} style={{flex:1,background:T.bg,border:`1px solid ${T.borderHi}`,borderRight:suffix?'none':undefined,borderRadius:suffix?'7px 0 0 7px':7,color:T.text,padding:'7px 10px',fontSize:12,fontFamily:'var(--fm)',outline:'none'}} onFocus={e=>e.target.style.borderColor=T.orange} onBlur={e=>e.target.style.borderColor=T.borderHi}/>
    {suffix&&<div style={{background:T.orangeMid,border:`1px solid ${T.borderHi}`,borderLeft:'none',borderRadius:'0 7px 7px 0',padding:'7px 10px',fontSize:10,color:T.orange,fontFamily:'var(--fm)',whiteSpace:'nowrap'}}>{suffix}</div>}</div>
    {hint&&<div style={{fontSize:10,color:T.dim,marginTop:3}}>{hint}</div>}
  </div>);
  const toggle=(id,on)=>setCfg(p=>({...p,enabledRules:{...(p.enabledRules||{}),[id]:on}}));
  return(<div style={{display:'flex',flexDirection:'column',gap:14}}>
    <div style={{textAlign:'center',padding:'6px 0'}}><div style={{fontFamily:'var(--fh)',fontSize:20,fontWeight:800,marginBottom:4}}>{isRerun?'Reconfigure':'Audit Configuration'}</div><div style={{fontSize:13,color:T.sub}}>Review rule logic, adjust thresholds, then run.</div></div>
    <div style={{display:'flex',gap:6,background:T.mid,borderRadius:10,padding:3,alignSelf:'flex-start'}}>
      {[{id:'protocols',label:'1. Protocols'},{id:'thresholds',label:'2. Thresholds'},{id:'ml',label:'3. ML models'}].map(t=>(
        <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'7px 16px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'var(--fb)',fontSize:13,fontWeight:600,background:tab===t.id?T.card:'transparent',color:tab===t.id?T.orange:T.sub,boxShadow:tab===t.id?T.sm:'none',transition:'all 0.2s'}}>{t.label}</button>
      ))}
    </div>
    {tab==='protocols'&&<div style={{display:'flex',flexDirection:'column',gap:10}}>
      {AUDIT_PROTOCOLS.map((proto,i)=>{const locked=proto.status==='LOCKED';const on=locked||(cfg.enabledRules?.[proto.id]!==false);return(
        <div key={proto.id} style={{background:T.card,borderRadius:10,boxShadow:T.sm,border:`1px solid ${T.border}`,overflow:'hidden',opacity:(!locked&&!on)?0.5:1,transition:'opacity 0.2s',animation:`fadeUp 0.3s ease ${i*0.025}s both`}}>
          <div style={{display:'grid',gridTemplateColumns:'180px 1fr 1fr 1fr'}}>
            <div style={{padding:'14px',borderRight:`1px solid ${T.border}`,background:T.hover,position:'relative',display:'flex',flexDirection:'column',gap:7}}>
              {!locked&&<button onClick={()=>toggle(proto.id,!on)} style={{position:'absolute',top:12,right:10,width:36,height:20,borderRadius:10,border:'none',cursor:'pointer',background:on?T.green:T.borderHi,transition:'background 0.2s',padding:0,flexShrink:0}}><div style={{width:14,height:14,borderRadius:'50%',background:'white',position:'absolute',top:3,left:on?19:3,transition:'left 0.2s'}}/></button>}
              <div style={{fontSize:13,fontWeight:600,color:T.text,lineHeight:1.25,paddingRight:locked?0:40,fontFamily:'var(--fb)'}}>{proto.label}</div>
              <Mono ch={proto.id} size={11}/>
              <SevBadge sev={proto.sev}/>
              <span style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',borderRadius:20,fontSize:10,fontWeight:600,fontFamily:'var(--fb)',background:locked?'#FEF2F2':'#ECFDF5',border:`1px solid ${locked?'#FECACA':'#A7F3D0'}`,color:locked?T.red:T.green,alignSelf:'flex-start'}}>{locked?'🔒 Locked':'● Active'}</span>
            </div>
            <div style={{padding:'14px',borderRight:`1px solid ${T.border}`}}><Lbl ch="Objective"/><div style={{fontSize:12,color:T.text,lineHeight:1.6,fontFamily:'var(--fb)'}}>{proto.objective}</div></div>
            <div style={{padding:'14px',borderRight:`1px solid ${T.border}`,background:'#F9FAFB'}}><Lbl ch="Algorithm"/><div style={{background:'#111827',borderRadius:7,padding:'9px 11px',fontFamily:'var(--fm)',fontSize:10,color:'#A3E635',lineHeight:1.7,whiteSpace:'pre',overflowX:'auto'}}>{proto.algorithm}</div></div>
            <div style={{padding:'14px',background:'#FFFBEB'}}><Lbl ch="Business Impact"/><div style={{fontSize:12,color:'#92400E',lineHeight:1.6,fontFamily:'var(--fb)'}}>{proto.impact}</div></div>
          </div>
        </div>
      );})}
    </div>}
    {tab==='thresholds'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      {[
        {title:'Timing & Clearing',fields:[['clearingWindowDays','Clearing window','days','Max age before unmatched clearing debit flagged'],['postingLagDays','Posting lag','days','GL → creation gap that triggers timing rules'],['duplicateWindowDays','Duplicate window','days','Look-back for duplicate posting check'],['advanceRecoveryDays','Advance recovery','days','Days before unrecovered advance flagged']]},
        {title:'Amount Thresholds',fields:[['roundNumberThreshold','Round number','BHD','Provision multiples flagged'],['highValueManualThreshold','High-value manual','BHD','SoD and after-hours checks trigger above this'],['employeeAdvanceLimit','Advance limit','BHD','Per-advance policy limit'],['blankDescMinAmount','Blank desc minimum','BHD','Flag blank description above this only'],['capitalizationThreshold','Capitalisation threshold','BHD','CWIP below this should be expensed']]},
        {title:'Provisions & CWIP',fields:[['provisionConcentrationPct','Period-end concentration','%','Flag if this % of monthly provisions in last 7 days'],['cwipAgeingDays','CWIP ageing','days','CWIP older than this flagged']]},
        {title:'Business Hours',fields:[['businessHoursStart','Hours start','hr','Before this = after hours'],['businessHoursEnd','Hours end','hr','At or after this = after hours']]},
      ].map(grp=>(
        <div key={grp.title} style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:'14px 16px'}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:12,fontFamily:'var(--fb)'}}>{grp.title}</div>
          {grp.fields.map(([f,l,s,h])=>num(f,l,s,h))}
        </div>
      ))}
      <div style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:'14px 16px'}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:10,fontFamily:'var(--fb)'}}>Weekend Days (GCC)</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
          {[{l:'Sun',v:0},{l:'Mon',v:1},{l:'Tue',v:2},{l:'Wed',v:3},{l:'Thu',v:4},{l:'Fri',v:5},{l:'Sat',v:6}].map(d=>(
            <label key={d.v} style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',fontSize:12,padding:'5px 12px',borderRadius:20,border:`1px solid ${cfg.weekendDays.includes(d.v)?T.orange:T.borderHi}`,background:cfg.weekendDays.includes(d.v)?T.orangeLt:T.bg,color:cfg.weekendDays.includes(d.v)?T.orange:T.sub,transition:'all 0.15s',fontFamily:'var(--fb)'}}>
              <input type="checkbox" checked={cfg.weekendDays.includes(d.v)} style={{display:'none'}} onChange={e=>setCfg(p=>({...p,weekendDays:e.target.checked?[...p.weekendDays,d.v]:p.weekendDays.filter(x=>x!==d.v)}))}/>
              {d.l}
            </label>
          ))}
        </div>
      </div>
    </div>}
    {tab==='ml'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:'16px 18px',boxShadow:T.sm}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:6,fontFamily:'var(--fb)'}}>Anomaly detectors (optional API)</div>
        <div style={{fontSize:12,color:T.sub,lineHeight:1.55,marginBottom:14}}>
          Choose which models the scoring service fits. <b style={{color:T.text}}>One or two</b> active: rows are flagged from the <b>weighted ensemble score</b> vs your threshold (votes are shown but do not decide the row). <b style={{color:T.text}}>Three or more</b>: full behaviour — ensemble score <i>and</i> the vote-count rule apply.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          {num('anomalyModelTimeoutSeconds','Model timeout','sec','Per-model max runtime before the backend stops a slow model and continues with neutral score/vote. Use 0 to disable timeout.')}
          <div style={{display:'flex',flexDirection:'column',justifyContent:'center',fontSize:11,color:T.sub,lineHeight:1.5,padding:'0 6px'}}>
            Default is 0 (no timeout): models run until completion. Set a value only when you prefer speed over completeness.
          </div>
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:12}}>
          <Btn variant="ghost" ch="Select all" onClick={()=>setCfg(p=>({...p,anomalyActiveModels:ANOMALY_MODEL_OPTIONS.map(m=>m.id)}))}/>
          <Btn variant="ghost" ch="Clear" onClick={()=>setCfg(p=>({...p,anomalyActiveModels:[]}))}/>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {ANOMALY_MODEL_OPTIONS.map(m=>{
            const ids=cfg.anomalyActiveModels||[];
            const on=ids.includes(m.id);
            return(
              <label key={m.id} style={{display:'flex',alignItems:'flex-start',gap:10,cursor:'pointer',padding:'10px 12px',borderRadius:8,border:`1px solid ${on?T.teal:T.borderHi}`,background:on?'rgba(13,148,136,0.06)':T.bg,transition:'all 0.15s'}}>
                <input type="checkbox" checked={on} style={{marginTop:3}} onChange={e=>setCfg(p=>{
                  const cur=[...(p.anomalyActiveModels||[])];
                  if(e.target.checked)return{...p,anomalyActiveModels:[...new Set([...cur,m.id])]};
                  return{...p,anomalyActiveModels:cur.filter(x=>x!==m.id)};
                })}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)',color:T.text}}>{m.label}</div>
                  <Mono ch={m.id} size={10}/>
                  <div style={{fontSize:11,color:T.sub,marginTop:4,lineHeight:1.45}}>{m.hint}</div>
                </div>
              </label>
            );
          })}
        </div>
        {(!cfg.anomalyActiveModels||cfg.anomalyActiveModels.length===0)&&<div style={{marginTop:10,fontSize:11,color:T.amber,fontFamily:'var(--fb)'}}>None selected — the API will run all five models (same as “select all”).</div>}
        {(cfg.anomalyActiveModels?.length===1||cfg.anomalyActiveModels?.length===2)&&<div style={{marginTop:10,fontSize:11,color:T.teal,fontFamily:'var(--fb)'}}>Ensemble-only gating: vote threshold does not flag rows; use ensemble cut-off on the Analyse screen.</div>}
      </div>
    </div>}
    <div style={{display:'flex',justifyContent:'space-between',paddingTop:4}}>
      <Btn variant="ghost" ch="↺ Reset Defaults" onClick={()=>setCfg(DEFAULT_CONFIG)}/>
      <Btn ch={isRerun?'▶ Save & Re-run':'▶ Save & Run Analysis'} onClick={()=>onReady(cfg)} style={{padding:'10px 26px',fontSize:14}}/>
    </div>
  </div>);
}

// ─── MODULE 3: ANALYSE ────────────────────────────────────────
function AnalysisModule({parsedData,config,onComplete}){
  const[prog,setProg]=useState(0);const[label,setLabel]=useState('Starting...');
  const[done,setDone]=useState(false);const[perR,setPerR]=useState(null);const[txR,setTxR]=useState(null);const[anomR,setAnomR]=useState(null);
  const ran=useRef(false);
  useEffect(()=>{
    if(ran.current)return;ran.current=true;
    (async()=>{
      try{
        const per=await runPeriodicEngine(parsedData,config,(p,s)=>{setProg(Math.round(p*0.55));setLabel(`[Period] ${s}`);});setPerR(per);
        const tx=await runEngine(parsedData,config,(p,s)=>{setProg(55+Math.round(p*0.45));setLabel(`[Transaction] ${s}`);});setTxR(tx);
        setLabel('[Anomaly] Ensemble scoring...');
        let an=null;
        try{
          an=await scoreAnomalies({transactions:parsedData?.glData||[],findings:tx?.findings||[],periodicProfiles:per?.profiles||[],config});
          setAnomR(an);
        }catch(err){
          Logger.warn(`Anomaly API unavailable: ${err.message}`);
        }
        setDone(true);onComplete({periodic:per,transaction:tx,anomaly:an});
      }catch(e){console.error(e);}
    })();
  },[]);
  const ps=perR?.stats;const ts=txR?.stats;const as=anomR?.summary;
  const guidanceEntries=Object.entries(as?.config_guidance||{});
  return(<div style={{maxWidth:900,margin:'0 auto',display:'flex',flexDirection:'column',gap:18}}>
    <div style={{textAlign:'center',padding:'6px 0'}}><div style={{fontFamily:'var(--fh)',fontSize:20,fontWeight:800,marginBottom:4}}>Analysing GL Data</div><div style={{fontSize:13,color:T.sub}}>{done?'Both engines complete':'Running: '+label}</div></div>
    {!done&&<div style={{background:T.card,borderRadius:12,padding:44,textAlign:'center',boxShadow:T.sm,border:`1px solid ${T.border}`}}>
      <div style={{fontSize:40,marginBottom:12,animation:'float 2s ease-in-out infinite'}}>⚙️</div>
      <div style={{fontSize:14,fontWeight:600,marginBottom:6,fontFamily:'var(--fb)'}}>{label}</div>
      <div style={{width:'100%',maxWidth:400,margin:'0 auto 8px',height:8,background:T.mid,borderRadius:4,overflow:'hidden'}}><div style={{height:'100%',width:`${prog}%`,background:'linear-gradient(90deg,'+T.orange+','+T.amber+')',borderRadius:4,transition:'width 0.4s'}}/></div>
      <div style={{fontSize:12,color:T.dim,fontFamily:'var(--fm)'}}>{prog}% — {prog<55?'Account-level pattern analysis':'Transaction-level rule testing'}</div>
    </div>}
    {done&&ps&&ts&&<>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:'16px',boxShadow:T.sm}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12,fontFamily:'var(--fh)',borderBottom:`2px solid ${T.orange}`,paddingBottom:8}}>📡 Account Pulse</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {[['RED',ps.red,T.red,LBG.RED],['AMBER',ps.amber,T.amber,LBG.AMBER],['GREEN',ps.green,T.green,LBG.GREEN],['GREY',ps.grey,T.dim,LBG.GREY]].map(([l,v,c,bg])=>(
              <div key={l} style={{background:bg,borderRadius:8,padding:'10px 8px',textAlign:'center'}}>
                <div style={{fontSize:16,marginBottom:3}}>{LI[l]}</div>
                <div style={{fontFamily:'var(--fb)',fontSize:22,fontWeight:600,color:c,lineHeight:1}}>{v}</div>
                <div style={{fontSize:9,color:c,opacity:0.7,marginTop:3}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:T.sub,marginTop:10,fontFamily:'var(--fb)'}}>{ps.criticalFlags} critical · {ps.highFlags} high period flags</div>
        </div>
        <div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:'16px',boxShadow:T.sm}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12,fontFamily:'var(--fh)',borderBottom:`2px solid ${T.blue}`,paddingBottom:8}}>🔬 Transaction Rules</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {[['CRITICAL',ts.bySev?.CRITICAL||0,T.red,'#FEF2F2'],['HIGH',ts.bySev?.HIGH||0,T.amber,'#FFFBEB'],['MEDIUM',ts.bySev?.MEDIUM||0,T.blue,'#EFF6FF']].map(([l,v,c,bg])=>(
              <div key={l} style={{background:bg,borderRadius:8,padding:'10px 8px',textAlign:'center'}}>
                <div style={{fontFamily:'var(--fb)',fontSize:22,fontWeight:600,color:c,lineHeight:1,marginBottom:3}}>{v}</div>
                <div style={{fontSize:9,color:c,opacity:0.7}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:T.sub,marginTop:10,fontFamily:'var(--fb)'}}>{fmtNum(ts.total)} findings · {ts.glCount} accounts · {ts.userCount} users</div>
        </div>
      </div>
      {perR?.journalIntel&&<div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:'16px',boxShadow:T.sm}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12,fontFamily:'var(--fh)',borderBottom:`2px solid ${T.purple}`,paddingBottom:8}}>👤 Journal Intelligence</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
          {[['Manual JVs',fmtNum(perR.journalIntel.total),`${perR.journalIntel.shareOfAll.toFixed(1)}% of all entries`],['SoD Violations',fmtNum(perR.journalIntel.sodViolations),`${perR.journalIntel.sodPct.toFixed(0)}% single-user JVs`],['Period-End Surge',fmtNum(perR.journalIntel.periodEnd),`${perR.journalIntel.periodEndPct.toFixed(0)}% of manual JVs`],['High-Risk Users',perR.journalIntel.users.filter(u=>u.riskLevel==='HIGH').length,'require investigation']].map(([l,v,sub])=>(
            <div key={l} style={{textAlign:'center',padding:'12px',background:T.mid,borderRadius:8}}>
              <div style={{fontSize:9,color:T.sub,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5,fontFamily:'var(--fb)'}}>{l}</div>
              <div style={{fontFamily:'var(--fb)',fontSize:22,fontWeight:600,color:T.text,lineHeight:1,marginBottom:4}}>{v}</div>
              <div style={{fontSize:10,color:T.sub}}>{sub}</div>
            </div>
          ))}
        </div>
      </div>}
      {as&&<div style={{background:T.card,borderRadius:12,border:`1px solid ${T.border}`,padding:'16px',boxShadow:T.sm}}>
        <div style={{fontSize:13,fontWeight:700,marginBottom:12,fontFamily:'var(--fh)',borderBottom:`2px solid ${T.teal}`,paddingBottom:8}}>🧠 Anomaly Ensemble</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
          {[['Rows',fmtNum(as.total_rows||0),'scored'],['Anomalies',fmtNum(as.anomalies||0),`${(((as.anomaly_rate||0)*100)).toFixed(1)}% rate`],['Threshold',String(as.threshold??'0.65'),'ensemble cut-off'],['Vote rule',String(as.vote_count_threshold??3),'models required']].map(([l,v,sub])=>(
            <div key={l} style={{textAlign:'center',padding:'12px',background:T.mid,borderRadius:8}}>
              <div style={{fontSize:9,color:T.sub,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5,fontFamily:'var(--fb)'}}>{l}</div>
              <div style={{fontFamily:'var(--fb)',fontSize:22,fontWeight:600,color:T.text,lineHeight:1,marginBottom:4}}>{v}</div>
              <div style={{fontSize:10,color:T.sub}}>{sub}</div>
            </div>
          ))}
        </div>
        {as.active_anomaly_models?.length>0&&<div style={{marginTop:10,fontSize:11,color:T.sub,fontFamily:'var(--fb)',lineHeight:1.45}}>
          <b style={{color:T.text}}>Detectors:</b> {as.active_anomaly_models.map((k)=>k.replace(/_/g,' ')).join(', ')}.
          {as.ml_vote_rule_applies===false?' Ensemble-only gating (1–2 models): threshold applies; per-model votes are informational.':' Vote-count rule applies (3+ models).'}
        </div>}
        {(as.stalled_models?.length>0)&&<div style={{marginTop:10,fontSize:11,color:T.orange,fontFamily:'var(--fb)',lineHeight:1.45}}>
          Model timeout ({as.model_timeout_seconds ?? '—'}s per model): skipped {as.stalled_models.join(', ')} — neutral scores/votes used for those models.
        </div>}
        {as.all_models_stalled&&<div style={{marginTop:10,fontSize:11,color:T.red,fontFamily:'var(--fb)',lineHeight:1.5,background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,padding:'8px 10px'}}>
          <b>ML warning:</b> all selected anomaly models stalled or timed out. Ensemble/model-vote signals are neutralized for this run; only rule-based override logic remains effective.
        </div>}
        {(as.warnings?.length>0)&&<div style={{marginTop:8,fontSize:11,color:T.sub,fontFamily:'var(--fb)',lineHeight:1.45}}>
          {as.warnings.map((w,i)=><div key={i}>• {w}</div>)}
        </div>}
        {guidanceEntries.length>0&&<div style={{marginTop:12}}>
          <div style={{fontSize:11,fontFamily:'var(--fb)',fontWeight:700,color:T.teal,marginBottom:8}}>Suggested configuration ranges (percentile + 3SD)</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
            {guidanceEntries.slice(0,8).map(([k,v])=>(
              <div key={k} style={{background:T.hover,border:`1px solid ${T.border}`,borderRadius:8,padding:'8px 10px'}}>
                <div style={{fontSize:10,color:T.sub,fontFamily:'var(--fm)'}}>{k}</div>
                <div style={{fontSize:12,fontFamily:'var(--fb)',fontWeight:600,color:T.text}}>
                  {v.suggested_lower} - {v.suggested_upper} {v.unit||''}
                </div>
                <div style={{fontSize:10,color:T.dim,fontFamily:'var(--fb)'}}>p95: {v.p95} · 3SD up: {v.three_sd_upper}</div>
              </div>
            ))}
          </div>
        </div>}
      </div>}
      <div style={{display:'flex',justifyContent:'flex-end'}}><Btn ch="Open Findings Dashboard →" variant="success" onClick={()=>onComplete({periodic:perR,transaction:txR,anomaly:anomR},true)} style={{padding:'10px 24px',fontSize:14}}/></div>
    </>}
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// MODULE 4: FINDINGS DASHBOARD — two-panel workspace
// Left panel = always-visible account list
// Right panel = detail with tabbed content
// ═══════════════════════════════════════════════════════════════

// ─── GL CATEGORY GROUPS ───────────────────────────────────────
const GL_GROUPS = [
  { id:'ALL',       label:'All Accounts',  icon:'⊙' },
  { id:'DUMMY',     label:'Dummy / Unknown', icon:'⚠' },
  { id:'CLEARING',  label:'Clearing',      icon:'↔' },
  { id:'PROVISION', label:'Provisions',    icon:'📦' },
  { id:'ADVANCE',   label:'Advances',      icon:'👤' },
  { id:'CWIP',      label:'CWIP',          icon:'🏗' },
  { id:'IC',        label:'Intercompany',  icon:'🔗' },
  { id:'LOYALTY',   label:'Loyalty / GV',  icon:'🎁' },
  { id:'REVENUE',   label:'Revenue',       icon:'💰' },
  { id:'CASH',      label:'Cash',          icon:'💵' },
];

// ─── GROUP DASHBOARD — aggregate view for a category ──────────
function GroupDashboard({ profiles, txFindings, groupId, groupLabel }) {
  const inGroup = useMemo(() => groupId === 'ALL'
    ? profiles
    : profiles.filter(p => p.meta.type === groupId),
    [profiles, groupId]);

  const totalDR  = inGroup.reduce((s,p) => s+p.totalDR,  0);
  const totalCR  = inGroup.reduce((s,p) => s+p.totalCR,  0);
  const net      = totalDR - totalCR;
  const red      = inGroup.filter(p=>p.light==='RED').length;
  const amber    = inGroup.filter(p=>p.light==='AMBER').length;
  const green    = inGroup.filter(p=>p.light==='GREEN').length;
  const totalRows= inGroup.reduce((s,p) => s+p.totalRows, 0);
  const manRows  = inGroup.reduce((s,p) => s+p.monthly.reduce((ms,m)=>ms+m.manualCount,0), 0);
  const manPct   = totalRows>0 ? (manRows/totalRows*100) : 0;

  // Top-10 by gross volume — Pareto
  const sorted = [...inGroup]
    .map(p => ({ glCode:p.glCode, label:p.meta.label, light:p.light, gross:p.totalDR+p.totalCR, net:p.totalDR-p.totalCR, flags:p.flags.length }))
    .sort((a,b) => b.gross - a.gross)
    .slice(0, 10);
  const totalGross = inGroup.reduce((s,p)=>s+p.totalDR+p.totalCR, 0);
  const maxGross   = sorted[0]?.gross || 1;

  // Cumulative for Pareto line
  let cumPct = 0;
  const paretoPts = sorted.map(p => { cumPct += p.gross/totalGross*100; return Math.round(cumPct); });

  // Tx findings in this group
  const groupGLs = new Set(inGroup.map(p=>String(p.glCode)));
  const groupTx  = txFindings.filter(f => groupGLs.has(String(f.glCode)));
  const txBySev  = { CRITICAL:0, HIGH:0, MEDIUM:0 };
  groupTx.forEach(f => { if(txBySev[f.severity]!==undefined) txBySev[f.severity]++; });

  const kpi = (label, val, sub, c=T.text, bg=T.mid) => (
    <div style={{background:bg,borderRadius:8,padding:'11px 14px'}}>
      <div style={{fontSize:10,color:T.sub,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4,fontFamily:'var(--fb)'}}>{label}</div>
      <div style={{fontSize:20,fontWeight:500,fontFamily:'var(--fm)',color:c,lineHeight:1}}>{val}</div>
      {sub&&<div style={{fontSize:10,color:T.dim,marginTop:3,fontFamily:'var(--fb)'}}>{sub}</div>}
    </div>
  );

  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
      {/* Header */}
      <div style={{padding:'14px 20px',borderBottom:`1px solid ${T.border}`,background:T.hover,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
          <span style={{fontFamily:'var(--fh)',fontSize:17,fontWeight:700,color:T.text}}>{groupLabel}</span>
          <span style={{fontSize:11,color:T.purple,background:'#F5F3FF',padding:'2px 9px',borderRadius:20,fontFamily:'var(--fb)',fontWeight:600}}>{inGroup.length} accounts</span>
          <span style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>Group aggregate view</span>
        </div>
        <div style={{fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>{red} red · {amber} amber · {green} green · {totalRows.toLocaleString()} total entries · {Math.round(manPct)}% manual</div>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:14}}>

        {/* KPI row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10}}>
          {kpi('Total DR',   fmtBHD(totalDR),  'BHD debits',   T.blue,  '#EFF6FF')}
          {kpi('Total CR',   fmtBHD(totalCR),  'BHD credits',  T.green, '#ECFDF5')}
          {kpi('Net total',  (net>=0?'+':'')+fmtBHD(net), net>=0?'net debit':'net credit', net>=0?T.orange:T.green, net>=0?T.orangeLt:'#ECFDF5')}
          {kpi('Red',        red,   'immediate attention', T.red,   '#FEF2F2')}
          {kpi('Amber',      amber, 'warrants review',     T.amber, '#FFFBEB')}
          {kpi('Tx findings',groupTx.length, `${txBySev.CRITICAL} crit · ${txBySev.HIGH} high`, T.purple, '#F5F3FF')}
        </div>

        {/* Top-10 Pareto + traffic light distribution side by side */}
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:12}}>

          {/* Pareto / top-10 */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px 16px'}}>
            <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)',marginBottom:4}}>Top 10 accounts by gross volume — Pareto</div>
            <div style={{fontSize:11,color:T.dim,fontFamily:'var(--fb)',marginBottom:12}}>
              {sorted.length>0&&`Top ${Math.min(3,sorted.length)} accounts = ${Math.round(sorted.slice(0,3).reduce((s,p)=>s+p.gross,0)/totalGross*100)}% of group exposure`}
            </div>
            {sorted.map((p,i) => {
              const barW = Math.round(p.gross/maxGross*100);
              const cumW = paretoPts[i];
              return (
                <div key={p.glCode} style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                  <span style={{fontSize:10,fontFamily:'var(--fm)',color:T.orange,minWidth:40,textAlign:'right'}}>{p.glCode}</span>
                  <div style={{flex:1,position:'relative',height:18,background:T.mid,borderRadius:3,overflow:'hidden'}}>
                    <div style={{position:'absolute',left:0,top:0,height:'100%',width:`${barW}%`,background:p.light==='RED'?T.red:p.light==='AMBER'?T.amber:T.orange,opacity:0.7,borderRadius:3}}/>
                    <span style={{position:'absolute',left:6,top:1,fontSize:10,color:T.text,fontFamily:'var(--fb)',lineHeight:'16px',whiteSpace:'nowrap',overflow:'hidden',maxWidth:'95%',display:'block'}}>{p.label}</span>
                  </div>
                  <span style={{fontSize:10,fontFamily:'var(--fm)',color:T.sub,minWidth:52,textAlign:'right'}}>{fmtBHD(p.gross)}</span>
                  <span style={{fontSize:10,fontFamily:'var(--fm)',color:T.purple,minWidth:32,textAlign:'right'}}>{cumW}%</span>
                </div>
              );
            })}
            <div style={{display:'flex',gap:16,marginTop:8,fontSize:10,color:T.dim,fontFamily:'var(--fb)'}}>
              <span>Bar = gross volume</span>
              <span style={{color:T.purple}}>% = cumulative (Pareto)</span>
            </div>
          </div>

          {/* Traffic light + manual breakdown */}
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px 16px',flex:1}}>
              <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)',marginBottom:12}}>Traffic light distribution</div>
              {[['RED',red,T.red,'#FEF2F2'],['AMBER',amber,T.amber,'#FFFBEB'],['GREEN',green,T.green,'#ECFDF5'],['GREY',inGroup.filter(p=>p.light==='GREY').length,T.dim,'#F3F4F6']].map(([l,v,c,bg])=>(
                <div key={l} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <span style={{fontSize:12}}>{LI[l]}</span>
                  <div style={{flex:1,height:8,background:T.mid,borderRadius:4,overflow:'hidden'}}>
                    <div style={{height:'100%',width:inGroup.length>0?`${v/inGroup.length*100}%`:'0%',background:c,borderRadius:4}}/>
                  </div>
                  <span style={{fontSize:11,fontFamily:'var(--fb)',fontWeight:600,color:c,minWidth:20,textAlign:'right'}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px 16px'}}>
              <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)',marginBottom:8}}>Tx findings by severity</div>
              {[['CRITICAL',txBySev.CRITICAL,T.red,'#FEF2F2'],['HIGH',txBySev.HIGH,T.amber,'#FFFBEB'],['MEDIUM',txBySev.MEDIUM,T.blue,'#EFF6FF']].map(([l,v,c,bg])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 8px',background:bg,borderRadius:6,marginBottom:5}}>
                  <span style={{fontSize:11,color:c,fontFamily:'var(--fb)',fontWeight:600}}>{l}</span>
                  <span style={{fontSize:14,fontFamily:'var(--fm)',color:c,fontWeight:600}}>{v.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {inGroup.length === 0 && (
          <div style={{textAlign:'center',padding:40,color:T.dim,fontFamily:'var(--fb)',fontSize:13}}>
            No accounts in this group.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COMPARISON VIEW — multiple selected accounts ────────────
function ComparisonView({profiles,selectedSet,txFindings,onClear}){
  const sel=useMemo(()=>profiles.filter(p=>selectedSet.has(p.glCode)),[profiles,selectedSet]);
  const txByGL=useMemo(()=>{const m={};txFindings.forEach(f=>{if(f.glCode&&f.glCode!=='MULTIPLE')m[f.glCode]=(m[f.glCode]||0)+1;});return m;},[txFindings]);
  const allGLs=useMemo(()=>new Set(sel.map(p=>String(p.glCode))),[sel]);
  const combTx=useMemo(()=>txFindings.filter(f=>allGLs.has(String(f.glCode))),[txFindings,allGLs]);
  if(!sel.length)return null;
  const maxGross=Math.max(...sel.map(p=>p.totalDR+p.totalCR),1);
  return(<div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
    <div style={{padding:'12px 18px',borderBottom:`1px solid ${T.border}`,background:T.mid,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div>
        <div style={{fontFamily:'var(--fh)',fontSize:15,fontWeight:700,marginBottom:3}}>Comparing {sel.length} accounts</div>
        <div style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>Combined transaction findings: {combTx.length} · uncheck accounts to remove from comparison</div>
      </div>
      <button onClick={onClear} style={{fontSize:12,padding:'5px 14px',borderRadius:20,border:`1px solid ${T.borderHi}`,background:T.card,cursor:'pointer',color:T.sub,fontFamily:'var(--fb)'}}>✕ Clear selection</button>
    </div>
    <div style={{flex:1,overflowY:'auto',padding:'16px 18px',display:'flex',flexDirection:'column',gap:14}}>
      {/* Chips */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {sel.map(p=><div key={p.glCode} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 12px',borderRadius:20,border:`1px solid ${LC[p.light]}44`,background:LBG[p.light],fontSize:12,fontFamily:'var(--fb)',color:LC[p.light],fontWeight:600}}>{LI[p.light]} {p.glCode} — {p.meta.label}</div>)}
      </div>
      {/* KPI table */}
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',background:T.card,borderRadius:10,overflow:'hidden',boxShadow:T.sm}}>
          <thead><tr>
            {['Metric',...sel.map(p=>p.glCode)].map((h,i)=>(
              <th key={i} style={{padding:'8px 12px',textAlign:i===0?'left':'right',fontSize:10,color:i===0?T.dim:LC[sel[i-1]?.light]||T.orange,textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:`1px solid ${T.border}`,fontWeight:600,background:i===0?T.mid:LBG[sel[i-1]?.light]||T.mid,whiteSpace:'nowrap'}}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[['Traffic light',p=>LI[p.light]+' '+p.light],['Total DR',p=>fmtBHD(p.totalDR)],['Total CR',p=>fmtBHD(p.totalCR)],['Net',p=>(p.totalDR-p.totalCR>=0?'+':'')+fmtBHD(p.totalDR-p.totalCR)],['Period flags',p=>String(p.flags.length)],['Critical',p=>String(p.flags.filter(f=>f.severity==='CRITICAL').length)],['Tx findings',p=>String(txByGL[String(p.glCode)]||0)],['Active months',p=>String(p.activeMonths)],['Entries',p=>fmtNum(p.totalRows)]].map(([label,fn],ri)=>(
              <tr key={label} style={{background:ri%2===0?T.card:T.hover}}>
                <td style={{padding:'7px 12px',fontSize:12,fontWeight:600,color:T.sub,fontFamily:'var(--fb)',borderBottom:`1px solid ${T.border}`}}>{label}</td>
                {sel.map(p=><td key={p.glCode} style={{padding:'7px 12px',fontSize:12,fontFamily:'var(--fm)',textAlign:'right',color:T.text,borderBottom:`1px solid ${T.border}`}}>{fn(p)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pareto */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:'13px 16px',boxShadow:T.sm}}>
        <div style={{fontSize:12,fontWeight:600,fontFamily:'var(--fb)',marginBottom:10}}>Gross volume comparison</div>
        {sel.map(p=>{const gross=p.totalDR+p.totalCR;const pct=Math.round(gross/maxGross*100);return(
          <div key={p.glCode} style={{display:'flex',alignItems:'center',gap:10,marginBottom:7}}>
            <span style={{fontSize:10,fontFamily:'var(--fm)',color:T.orange,minWidth:44,textAlign:'right'}}>{p.glCode}</span>
            <div style={{flex:1,height:18,background:T.mid,borderRadius:3,overflow:'hidden',position:'relative'}}>
              <div style={{position:'absolute',left:0,top:0,height:'100%',width:pct+'%',background:LC[p.light],opacity:0.7,borderRadius:3}}/>
              <span style={{position:'absolute',left:6,top:1,fontSize:10,color:T.text,fontFamily:'var(--fb)',lineHeight:'16px'}}>{p.meta.label}</span>
            </div>
            <span style={{fontSize:10,fontFamily:'var(--fm)',color:T.sub,minWidth:60,textAlign:'right'}}>{fmtBHD(gross)}</span>
          </div>);
        })}
      </div>
      {/* Combined tx severity */}
      {combTx.length>0&&<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:'13px 16px',boxShadow:T.sm}}>
        <div style={{fontSize:12,fontWeight:600,fontFamily:'var(--fb)',marginBottom:8}}>Combined findings ({combTx.length})</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
          {['CRITICAL','HIGH','MEDIUM'].map(sv=>{const cnt=combTx.filter(f=>f.severity===sv).length;const s=SC[sv];return(
            <div key={sv} style={{background:s.bg,borderRadius:8,padding:'10px',textAlign:'center'}}>
              <div style={{fontSize:9,color:s.c,opacity:0.7,textTransform:'uppercase',marginBottom:4,fontFamily:'var(--fb)'}}>{sv}</div>
              <div style={{fontFamily:'var(--fb)',fontSize:22,fontWeight:500,color:s.c}}>{cnt}</div>
            </div>
          );})}
        </div>
      </div>}
    </div>
  </div>);
}

// ─── LEFT PANEL: Account list with GL group filter ─────────────
function AccountList({profiles,selected,onSelect,txFindings,groupFilter,onGroupFilter,selectedSet,onToggleCheck}){
  const[lightFilter,setLightFilter]=useState('ALL');
  const[search,setSearch]=useState('');
  const inGroup=useMemo(()=>groupFilter==='ALL'?profiles:profiles.filter(p=>p.meta.type===groupFilter),[profiles,groupFilter]);
  const counts=useMemo(()=>({RED:inGroup.filter(p=>p.light==='RED').length,AMBER:inGroup.filter(p=>p.light==='AMBER').length,GREEN:inGroup.filter(p=>p.light==='GREEN').length,GREY:inGroup.filter(p=>p.light==='GREY').length}),[inGroup]);
  const groupCounts=useMemo(()=>{const m={ALL:profiles.length};GL_GROUPS.slice(1).forEach(g=>{m[g.id]=profiles.filter(p=>p.meta.type===g.id).length;});return m;},[profiles]);
  const allChecked=useMemo(()=>{const sh=inGroup.filter(p=>{if(lightFilter!=='ALL'&&p.light!==lightFilter)return false;if(search){const q=search.toLowerCase();return String(p.glCode).includes(q)||p.meta.label.toLowerCase().includes(q);}return true;});return sh.length>0&&sh.every(p=>selectedSet.has(p.glCode));},[inGroup,lightFilter,search,selectedSet]);

  const shown=useMemo(()=>inGroup.filter(p=>{
    if(lightFilter!=='ALL'&&p.light!==lightFilter)return false;
    if(search){const q=search.toLowerCase();return String(p.glCode).includes(q)||p.meta.label.toLowerCase().includes(q)||p.meta.category.toLowerCase().includes(q);}
    return true;
  }),[inGroup,lightFilter,search]);

  const txByGL=useMemo(()=>{const m={};txFindings.forEach(f=>{if(f.glCode&&f.glCode!=='MULTIPLE')m[f.glCode]=(m[f.glCode]||0)+1;});return m;},[txFindings]);

  return(<div style={{width:300,flexShrink:0,display:'flex',flexDirection:'column',background:T.card,borderRight:`1px solid ${T.border}`,height:'100%',overflow:'hidden'}}>
    {/* GL Group pills */}
    <div style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,overflowX:'auto',flexShrink:0}}>
      <div style={{display:'flex',gap:5,width:'max-content'}}>
        {GL_GROUPS.filter(g=>g.id==='ALL'||(groupCounts[g.id]||0)>0).map(g=>{const active=groupFilter===g.id;return(
          <button key={g.id} onClick={()=>{onGroupFilter(g.id);setLightFilter('ALL');}} style={{display:'flex',alignItems:'center',gap:4,padding:'3px 9px',borderRadius:20,border:`1px solid ${active?T.orange:T.border}`,background:active?T.orangeLt:'transparent',cursor:'pointer',whiteSpace:'nowrap',fontFamily:'var(--fb)',fontSize:10,color:active?T.orange:T.sub,fontWeight:active?600:400}}>
            <span style={{fontSize:10}}>{g.icon}</span><span>{g.label}</span><span style={{fontSize:9,opacity:0.7}}>({groupCounts[g.id]||0})</span>
          </button>);})}
      </div>
    </div>
    {/* Group overview row */}
    {groupFilter!=='ALL'&&(<div onClick={()=>onSelect({__groupView:true})} style={{padding:'7px 12px',borderBottom:`1px solid ${T.border}`,background:selected?.__groupView?'#F5F3FF':T.hover,cursor:'pointer',borderLeft:`3px solid ${T.purple}`,display:'flex',alignItems:'center',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='#F5F3FF'} onMouseLeave={e=>e.currentTarget.style.background=selected?.__groupView?'#F5F3FF':T.hover}>
      <span style={{fontSize:12}}>📊</span>
      <div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:T.purple,fontFamily:'var(--fb)'}}>Group Overview</div><div style={{fontSize:10,color:T.sub,fontFamily:'var(--fb)'}}>{inGroup.length} accounts</div></div>
      <span style={{color:T.purple}}>›</span>
    </div>)}
    {/* Traffic lights + select-all */}
    <div style={{padding:'5px 10px',borderBottom:`1px solid ${T.border}`,display:'flex',gap:4,alignItems:'center'}}>
      <label style={{display:'flex',alignItems:'center',cursor:'pointer',padding:'2px 3px',flexShrink:0}} title="Select/deselect all visible">
        <input type="checkbox" checked={allChecked} onChange={()=>shown.forEach(p=>onToggleCheck(p.glCode,!allChecked))} style={{width:12,height:12,accentColor:T.orange,cursor:'pointer'}}/>
      </label>
      {['ALL','RED','AMBER','GREEN','GREY'].map(l=>{const active=lightFilter===l;const cnt=l==='ALL'?inGroup.length:counts[l];return(
        <button key={l} onClick={()=>setLightFilter(l)} style={{flex:1,padding:'4px 2px',borderRadius:7,border:`1px solid ${active?(l==='ALL'?T.orange:LC[l]||T.orange):T.border}`,background:active?(l==='ALL'?T.orangeLt:LBG[l]||T.orangeLt):'transparent',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
          <span style={{fontSize:l==='ALL'?10:12}}>{l==='ALL'?'⊙':LI[l]}</span>
          <span style={{fontSize:9,fontFamily:'var(--fm)',color:active?(l==='ALL'?T.orange:LC[l]||T.orange):T.dim,fontWeight:active?700:400}}>{cnt}</span>
        </button>
      );})}
    </div>
    {/* Selected banner */}
    {selectedSet.size>0&&(<div style={{padding:'4px 12px',background:T.orangeLt,borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
      <span style={{fontSize:11,color:T.orange,fontFamily:'var(--fb)',fontWeight:600}}>{selectedSet.size} selected — comparison view</span>
      <button onClick={()=>shown.forEach(p=>onToggleCheck(p.glCode,false))} style={{fontSize:10,color:T.orange,background:'none',border:'none',cursor:'pointer',fontFamily:'var(--fb)'}}>✕ Clear</button>
    </div>)}
    {/* Search */}
    <div style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search account..." style={{width:'100%',padding:'5px 9px',border:`1px solid ${T.borderHi}`,borderRadius:7,fontSize:12,fontFamily:'var(--fb)',background:T.bg,color:T.text,outline:'none',boxSizing:'border-box'}} onFocus={e=>e.target.style.borderColor=T.orange} onBlur={e=>e.target.style.borderColor=T.borderHi}/>
    </div>
    {/* Rows */}
    <div style={{flex:1,overflowY:'auto'}}>
      {shown.map(p=>{
        const isSel=selected?.glCode===p.glCode;
        const isChk=selectedSet.has(p.glCode);
        const txCount=txByGL[String(p.glCode)]||0;
        const topFlag=p.flags[0];
        return(<div key={p.glCode} style={{padding:'8px 10px',borderBottom:`1px solid ${T.border}`,cursor:'pointer',background:isSel?T.orangeLt:isChk?'#FFF8F1':T.card,borderLeft:`3px solid ${isSel?T.orange:isChk?T.amber:LC[p.light]||T.dim}`,display:'flex',alignItems:'flex-start',gap:5}} onMouseEnter={e=>e.currentTarget.style.background=isSel?T.orangeLt:T.hover} onMouseLeave={e=>e.currentTarget.style.background=isSel?T.orangeLt:isChk?'#FFF8F1':T.card}>
          <label onClick={e=>e.stopPropagation()} style={{paddingTop:2,flexShrink:0}}>
            <input type="checkbox" checked={isChk} onChange={e=>{e.stopPropagation();onToggleCheck(p.glCode,e.target.checked);}} style={{width:12,height:12,accentColor:T.orange,cursor:'pointer'}}/>
          </label>
          <div style={{flex:1,minWidth:0}} onClick={()=>onSelect(p)}>
            <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
              <span style={{fontSize:12}}>{LI[p.light]}</span>
              <span style={{fontFamily:'var(--fm)',fontSize:10,color:T.orange}}>{p.glCode}</span>
              {txCount>0&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:10,background:'#EFF6FF',color:T.blue,fontFamily:'var(--fm)',fontWeight:600}}>{txCount}tx</span>}
            </div>
            <div style={{fontSize:11,fontWeight:600,color:T.text,fontFamily:'var(--fb)',marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.meta.label}</div>
            <div style={{fontSize:10,color:T.sub,fontFamily:'var(--fb)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.meta.category}</div>
            {topFlag&&<div style={{fontSize:10,color:LC[p.light],fontFamily:'var(--fb)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>⚑ {topFlag.title}</div>}
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0}}>
            {p.flags.filter(f=>f.severity==='CRITICAL').length>0&&<span style={{fontSize:9,padding:'1px 4px',borderRadius:10,background:'#FEF2F2',color:T.red,fontFamily:'var(--fm)',fontWeight:700}}>{p.flags.filter(f=>f.severity==='CRITICAL').length}C</span>}
            {p.flags.filter(f=>f.severity==='HIGH').length>0&&<span style={{fontSize:9,padding:'1px 4px',borderRadius:10,background:'#FFFBEB',color:T.amber,fontFamily:'var(--fm)',fontWeight:700}}>{p.flags.filter(f=>f.severity==='HIGH').length}H</span>}
          </div>
        </div>);
      })}
      {shown.length===0&&<div style={{padding:24,textAlign:'center',color:T.dim,fontSize:12,fontFamily:'var(--fb)'}}>No accounts match filters</div>}
    </div>
  </div>);
}

// ─── RIGHT PANEL: Account detail workspace ────────────────────
function AccountWorkspace({profile,txFindings,allRows,journalIntel,config}){
  const[tab,setTab]=useState('overview');
  const[selectedMonth,setSelectedMonth]=useState(null);

  // Reset tab and month when account changes
  useEffect(()=>{setTab('overview');setSelectedMonth(null);},[profile?.glCode]);

  // All hooks must be called unconditionally before any early return
  const monthly=profile?.monthly||[];
  const flags=profile?.flags||[];
  const meta=profile?.meta||{label:'',type:'',category:'',txRules:[]};
  const glCode=profile?.glCode;
  const applicableTxRules=profile?.applicableTxRules||[];
  const totalDR=profile?.totalDR||0;const totalCR=profile?.totalCR||0;
  const totalRows=profile?.totalRows||0;const activeMonths=profile?.activeMonths||0;

  const maxAbs=useMemo(()=>monthly.length>0?Math.max(...monthly.map(m=>Math.abs(m.netMovement)),1):1,[monthly]);
  const acctTxFindings=useMemo(()=>!glCode?[]:txFindings.filter(f=>String(f.glCode)===String(glCode)||f.glCode==='MULTIPLE'),[txFindings,glCode]);
  const monthTxFindings=useMemo(()=>{
    if(!selectedMonth)return[];
    return acctTxFindings.filter(f=>{
      if(!f.glDate)return false;
      const d=f.glDate instanceof Date?f.glDate:new Date(f.glDate);
      return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`===selectedMonth;
    });
  },[acctTxFindings,selectedMonth]);
  const selMonthData=useMemo(()=>monthly.find(m=>m.month===selectedMonth),[monthly,selectedMonth]);
  const acctUsers=useMemo(()=>{
    if(!journalIntel?.users||!glCode)return[];
    return journalIntel.users.filter(u=>u.topAccts.some(a=>String(a.code)===String(glCode)));
  },[journalIntel,glCode]);

  if(!profile)return(
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:16,color:T.dim,padding:40}}>
      <div style={{fontSize:48}}>👈</div>
      <div style={{fontFamily:'var(--fh)',fontSize:18,fontWeight:700,color:T.sub}}>Select an account</div>
      <div style={{fontSize:13,color:T.dim,textAlign:'center',maxWidth:280}}>Click any account in the left panel to inspect its period-level patterns, monthly movements, and transaction evidence.</div>
    </div>
  );

  const tabs=[
    {id:'overview',label:'Overview',icon:'📊',badge:flags.length>0?flags.length:null,badgeC:flags.some(f=>f.severity==='CRITICAL')?T.red:T.amber},
    {id:'monthly', label:'Monthly',icon:'📅',badge:null},
    {id:'transactions',label:'Transactions',icon:'🔬',badge:acctTxFindings.length>0?acctTxFindings.length:null,badgeC:T.blue},
    {id:'users',label:'Users',icon:'👤',badge:acctUsers.length>0?acctUsers.length:null,badgeC:T.purple},
  ];

  return(<div style={{flex:1,display:'flex',flexDirection:'column',minWidth:0,overflow:'hidden'}}>
    {/* Account header — always visible */}
    <div style={{padding:'14px 20px',borderBottom:`1px solid ${T.border}`,background:LBG[profile.light],flexShrink:0}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:5}}>
            <span style={{fontSize:22}}>{LI[profile.light]}</span>
            <span style={{fontFamily:'var(--fh)',fontSize:17,fontWeight:700,color:LC[profile.light]}}>{meta.label}</span>
            <span style={{fontFamily:'var(--fm)',fontSize:11,color:T.orange,background:T.orangeLt,padding:'2px 8px',borderRadius:20}}>{glCode}</span>
            <span style={{fontSize:11,color:T.sub,background:T.mid,padding:'2px 8px',borderRadius:20,fontFamily:'var(--fb)'}}>{meta.type}</span>
          </div>
          <div style={{fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>{meta.category} · {activeMonths} active months · {fmtNum(totalRows)} entries · DR {fmtBHD(totalDR)} / CR {fmtBHD(totalCR)} BHD</div>
        </div>
        {flags.some(f=>f.severity==='CRITICAL')&&<span style={{padding:'4px 14px',borderRadius:20,background:'#FEF2F2',border:'1px solid #FECACA',color:T.red,fontFamily:'var(--fb)',fontSize:12,fontWeight:700,flexShrink:0}}>⚠ CRITICAL FLAGS</span>}
      </div>
    </div>

    {/* Tab bar */}
    <div style={{display:'flex',borderBottom:`1px solid ${T.border}`,background:T.card,flexShrink:0}}>
      {tabs.map(t=>{const active=tab===t.id;return(
        <button key={t.id} onClick={()=>setTab(t.id)} style={{display:'flex',alignItems:'center',gap:6,padding:'11px 18px',border:'none',borderBottom:`2px solid ${active?T.orange:'transparent'}`,background:'transparent',cursor:'pointer',fontFamily:'var(--fb)',fontSize:13,fontWeight:active?600:400,color:active?T.orange:T.sub,transition:'all 0.2s',whiteSpace:'nowrap'}}>
          <span>{t.icon}</span><span>{t.label}</span>
          {t.badge!=null&&<span style={{fontSize:10,padding:'1px 7px',borderRadius:10,background:active?t.badgeC+'22':T.mid,color:active?t.badgeC:T.dim,fontFamily:'var(--fm)',fontWeight:700}}>{t.badge}</span>}
        </button>
      );})}
    </div>

    {/* Tab content — scrollable */}
    <div style={{flex:1,overflowY:'auto',padding:'18px 20px',display:'flex',flexDirection:'column',gap:16}}>

      {/* ── OVERVIEW TAB ──────────────────────────────────── */}
      {tab==='overview'&&<>
        {/* Period flags */}
        {flags.length===0&&<div style={{padding:'12px 16px',background:'#ECFDF5',border:'1px solid #A7F3D0',borderRadius:10,fontSize:13,fontFamily:'var(--fb)',color:T.green}}>✅ No period-level flags detected for this account.</div>}
        {flags.map((fl,i)=>{const s=SC[fl.severity]||SC.MEDIUM;return(
          <div key={i} style={{background:s.bg,border:`1px solid ${s.bo}`,borderRadius:10,padding:'12px 16px'}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
              <SevBadge sev={fl.severity}/>
              <span style={{fontFamily:'var(--fm)',fontSize:10,color:T.dim,padding:'2px 8px',background:'rgba(0,0,0,0.05)',borderRadius:20}}>{fl.ruleId}</span>
              <span style={{fontSize:13,fontWeight:600,color:s.c,fontFamily:'var(--fb)'}}>{fl.title}</span>
            </div>
            <div style={{fontSize:12,color:T.text,lineHeight:1.6,fontFamily:'var(--fb)',marginBottom:fl.months?.length?8:0}}>{fl.detail}</div>
            {fl.months?.length>0&&<div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
              <span style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>Affected months:</span>
              {fl.months.map(mk=>(
                <button key={mk} onClick={()=>{setSelectedMonth(mk);setTab('monthly');}} style={{fontFamily:'var(--fm)',fontSize:11,padding:'3px 10px',borderRadius:20,border:`1px solid ${s.bo}`,background:T.card,color:s.c,cursor:'pointer',fontWeight:600}}>
                  {mk} →
                </button>
              ))}
            </div>}
          </div>
        );})}

        {/* v9 dual-chart system: KPIs + narrative + net trend + DR/CR breakdown */}
        <AccountCharts
          monthly={monthly}
          flags={flags}
          txFindings={acctTxFindings}
          glCode={glCode}
          totalDR={totalDR}
          totalCR={totalCR}
          totalRows={totalRows}
          meta={meta}
          activeMonths={activeMonths}
          onMonthClick={mk=>{setSelectedMonth(mk);setTab('monthly');}}
        />

        {/* v11 — Value distribution histogram */}
        {monthly.flatMap(m=>m.rows||[]).length>0&&(
          <ValueHistogram
            rows={monthly.flatMap(m=>m.rows||[])}
            txFindings={acctTxFindings}
            config={config||{}}
            title={`Value distribution — ${meta.label}`}
            onBucketClick={()=>setTab('transactions')}
          />
        )}

        {/* v11 — Ageing buckets for clearing/provision accounts */}
        {profile.agingBuckets&&(()=>{
          const ag=profile.agingBuckets;
          const total=ag.d30+ag.d60+ag.d90+ag.d180+ag.d180p;
          if(!total)return null;
          return(
            <div style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:'12px 16px',boxShadow:T.sm}}>
              <div style={{fontSize:12,fontWeight:600,fontFamily:'var(--fb)',marginBottom:10}}>Open debit ageing — approximate</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8,marginBottom:8}}>
                {[['0–30d',ag.d30,'#ECFDF5',T.green],['31–60d',ag.d60,'#FFFBEB',T.amber],['61–90d',ag.d90,'#FFF0E6',T.orange],['91–180d',ag.d180,'#FEF2F2',T.red],['180d+',ag.d180p,'#FEF2F2',T.red]].map(([l,v,bg,c])=>(
                  <div key={l} style={{background:bg,borderRadius:8,padding:'9px',textAlign:'center'}}>
                    <div style={{fontSize:9,color:c,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,fontFamily:'var(--fb)',opacity:0.8}}>{l}</div>
                    <div style={{fontFamily:'var(--fm)',fontSize:15,fontWeight:500,color:c}}>{fmtBHD(v)}</div>
                    <div style={{fontSize:9,color:T.dim,marginTop:2}}>{Math.round(v/total*100)}%</div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:10,color:T.dim,fontFamily:'var(--fb)'}}>Based on GL DATE of open debit entries. Approximate only — does not account for partial matching. Total: {fmtBHD(total)} BHD.</div>
            </div>
          );
        })()}

        {/* Applicable tx rules */}
        {applicableTxRules.length>0&&<div style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:'12px 14px'}}>
          <div style={{fontSize:12,fontWeight:600,fontFamily:'var(--fb)',marginBottom:8}}>Transaction rules applicable to {meta.type} accounts</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
            {applicableTxRules.map(r=><span key={r} style={{fontFamily:'var(--fm)',fontSize:10,padding:'3px 9px',borderRadius:20,background:T.mid,border:`1px solid ${T.borderHi}`,color:T.sub}} title={TX_RULE_LABELS?.[r]||r}>{r}</span>)}
          </div>
          <div style={{fontSize:11,color:T.dim,marginTop:6,fontFamily:'var(--fb)'}}>Switch to Transactions tab — findings pre-filtered to this account type.</div>
        </div>}
      </>}

      {/* ── MONTHLY TAB ───────────────────────────────────── */}
      {tab==='monthly'&&<>
        {/* Month selector */}
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {monthly.filter(m=>m.rowCount>0).map(m=>{
            const isSel=selectedMonth===m.month;const isFl=flags.some(f=>f.months?.includes(m.month));
            return(<button key={m.month} onClick={()=>setSelectedMonth(isSel?null:m.month)} style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${isSel?T.orange:isFl?T.red:T.borderHi}`,background:isSel?T.orangeLt:isFl?'#FEF2F2':T.card,color:isSel?T.orange:isFl?T.red:T.sub,fontFamily:'var(--fm)',fontSize:11,fontWeight:isSel||isFl?700:400,cursor:'pointer'}}>{m.month}{isFl?' ⚑':''}</button>);
          })}
          {monthly.every(m=>m.rowCount===0)&&<div style={{fontSize:12,color:T.dim,fontFamily:'var(--fb)'}}>No activity in this account for the loaded period.</div>}
        </div>

        {/* Monthly summary table */}
        <div style={{overflowX:'auto',borderRadius:10,border:`1px solid ${T.border}`,boxShadow:T.sm}}>
          <table style={{width:'100%',borderCollapse:'collapse',background:T.card,whiteSpace:'nowrap'}}>
            <thead><tr>{['Month','Entries','JVs','Manual','DR (BHD)','CR (BHD)','Net (BHD)','Users','Flags'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9,color:T.dim,textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:`1px solid ${T.border}`,fontWeight:600,background:T.mid}}>{h}</th>)}</tr></thead>
            <tbody>{monthly.map((m,i)=>{
              const isSel=selectedMonth===m.month;const isFl=flags.some(f=>f.months?.includes(m.month));const hasTx=monthTxFindings.length>0&&isSel;
              return(<tr key={m.month} onClick={()=>setSelectedMonth(isSel?null:m.month)} style={{background:isSel?T.orangeLt:isFl?'#FFF8F1':i%2===0?T.card:T.hover,cursor:'pointer',fontFamily:'var(--fb)'}}
                onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=T.hover;}} onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background=isFl?'#FFF8F1':i%2===0?T.card:T.hover;}}>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`,fontFamily:'var(--fm)',fontWeight:isSel?700:400,color:isSel?T.orange:isFl?T.red:T.text}}>{m.month}{isFl?' ⚑':''}</td>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`}}>{m.rowCount||'—'}</td>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`}}>{m.jvCount||'—'}</td>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`,color:m.manualCount>0?T.amber:T.dim}}>{m.manualCount>0?m.manualCount:'—'}</td>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`,fontFamily:'var(--fm)',textAlign:'right',color:T.blue}}>{m.totalDR>0?Math.round(m.totalDR).toLocaleString():'—'}</td>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`,fontFamily:'var(--fm)',textAlign:'right',color:T.green}}>{m.totalCR>0?Math.round(m.totalCR).toLocaleString():'—'}</td>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`,fontFamily:'var(--fm)',textAlign:'right',color:m.netMovement>0?T.orange:m.netMovement<0?T.green:T.dim,fontWeight:600}}>{m.rowCount?Math.round(m.netMovement).toLocaleString():'—'}</td>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`,color:T.sub,fontSize:11}}>{m.users.slice(0,3).join(', ')}{m.users.length>3?` +${m.users.length-3}`:''}</td>
                <td style={{padding:'8px 12px',borderBottom:`1px solid ${T.border}`}}>{isFl?<span style={{fontSize:10,color:T.red}}>⚑</span>:hasTx?<span style={{fontSize:10,color:T.blue}}>●</span>:'—'}</td>
              </tr>);
            })}</tbody>
          </table>
        </div>

        {/* Selected month detail */}
        {selectedMonth&&selMonthData&&<>
          <div style={{padding:'12px 16px',background:'#EFF6FF',border:`1px solid ${T.blue}33`,borderRadius:10}}>
            <div style={{fontSize:13,fontWeight:700,fontFamily:'var(--fh)',color:T.blue,marginBottom:8}}>🔍 {selectedMonth} — Detail</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))',gap:10,marginBottom:12}}>
              {[['Entries',selMonthData.rowCount],['JVs',selMonthData.jvCount],['Manual',selMonthData.manualCount||'None'],['DR',Math.round(selMonthData.totalDR).toLocaleString()+' BHD'],['CR',Math.round(selMonthData.totalCR).toLocaleString()+' BHD'],['Net',Math.round(selMonthData.netMovement).toLocaleString()+' BHD'],['Last 7 days',Math.round(selMonthData.last7Amt).toLocaleString()+' BHD'],].map(([l,v])=>(
                <div key={l}><Lbl ch={l}/><div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)',color:T.text}}>{v}</div></div>
              ))}
            </div>
            {selMonthData.users.length>0&&<div><Lbl ch="Users who posted"/><div style={{fontSize:12,fontFamily:'var(--fb)',color:T.text}}>{selMonthData.users.join(', ')}</div></div>}
          </div>

          {/* Transaction findings for this month */}
          {monthTxFindings.length>0&&<div>
            <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)',marginBottom:8,color:T.red}}>⚠ {monthTxFindings.length} Transaction Finding{monthTxFindings.length!==1?'s':''} — {selectedMonth}</div>
            {monthTxFindings.map((fi,i)=>{const s=SC[fi.severity]||SC.MEDIUM;return(
              <div key={i} style={{background:s.bg,border:`1px solid ${s.bo}`,borderRadius:9,padding:'12px 14px',marginBottom:8}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
                  <SevBadge sev={fi.severity}/><Mono ch={fi.ruleId}/>
                  <span style={{fontSize:13,fontWeight:600,color:s.c,fontFamily:'var(--fb)',flex:1}}>{fi.ruleLabel}</span>
                  {fi.amount>0&&<span style={{fontFamily:'var(--fm)',fontSize:13,color:T.amber,flexShrink:0}}>{fi.amount.toLocaleString('en-US',{minimumFractionDigits:2})} BHD</span>}
                </div>
                <div style={{fontSize:12,color:T.text,lineHeight:1.55,fontFamily:'var(--fb)',marginBottom:8}}>{fi.detail}</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8}}>
                  {[['JV',fi.jvNumber],['GL Date',fmtDate(fi.glDate)],['User',fi.user],['Source',fi.source],['CC',fi.costCentre],['Description',fi.description]].map(([l,v])=>v&&v!=='—'&&<div key={l}><Lbl ch={l}/><div style={{fontSize:12,color:T.text,fontFamily:'var(--fb)'}}>{v}</div></div>)}
                </div>
              </div>
            );})}
          </div>}
          {monthTxFindings.length===0&&acctTxFindings.length>0&&<div style={{padding:'12px 16px',background:'#ECFDF5',border:'1px solid #A7F3D0',borderRadius:9,fontSize:12,fontFamily:'var(--fb)',color:T.green}}>✅ No transaction findings for this account in {selectedMonth}. Period-level flags (shown in Overview) still apply.</div>}

          {/* All GL rows for selected month */}
          {selMonthData.rows.length>0&&<div>
            <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)',marginBottom:8}}>All GL Entries — {selectedMonth} ({selMonthData.rows.length} rows)</div>
            <div style={{overflowX:'auto',borderRadius:9,border:`1px solid ${T.border}`,boxShadow:T.sm}}>
              <table style={{width:'100%',borderCollapse:'collapse',whiteSpace:'nowrap',background:T.card}}>
                <thead><tr>{['JV Number','Date','Source','DR','CR','Net','User','Description'].map(h=><th key={h} style={{padding:'7px 10px',textAlign:'left',fontSize:9,color:T.dim,textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:`1px solid ${T.border}`,fontWeight:600,background:T.mid}}>{h}</th>)}</tr></thead>
                <tbody>{selMonthData.rows.map((row,i)=>{
                  // Highlight rows that have tx findings
                  const hasFinding=monthTxFindings.some(f=>f.jvNumber===row['JV VOUCHER NUMBER']);
                  return(<tr key={i} style={{background:hasFinding?'#FFFBEB':i%2===0?T.card:T.hover}}>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,fontFamily:'var(--fm)',fontSize:11,color:hasFinding?T.amber:T.orange}}>{row['JV VOUCHER NUMBER']||'—'}{hasFinding&&' ⚑'}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.sub}}>{fmtDate(row['GL DATE']?new Date(row['GL DATE']):null)}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,fontSize:11,fontWeight:row['SOURCE']==='MANUAL'?600:400,color:row['SOURCE']==='MANUAL'?T.amber:T.text}}>{row['SOURCE']||'—'}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,fontFamily:'var(--fm)',fontSize:11,textAlign:'right',color:T.blue}}>{toNum(row['ENTERED DR'])>0?Math.round(toNum(row['ENTERED DR'])).toLocaleString():'—'}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,fontFamily:'var(--fm)',fontSize:11,textAlign:'right',color:T.green}}>{toNum(row['ENTERED CR'])>0?Math.round(toNum(row['ENTERED CR'])).toLocaleString():'—'}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,fontFamily:'var(--fm)',fontSize:11,textAlign:'right',color:T.amber}}>{toNum(row['NET AMOUNT'])!==0?Math.round(toNum(row['NET AMOUNT'])).toLocaleString():'—'}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,fontSize:11}}>{row['USERS']||'—'}</td>
                    <td style={{padding:'6px 10px',borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.sub,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis'}}>{String(row['DESCRIPTION']||'—').slice(0,60)}</td>
                  </tr>);
                })}</tbody>
              </table>
            </div>
            {monthTxFindings.length>0&&<div style={{fontSize:11,color:T.amber,marginTop:6,fontFamily:'var(--fb)'}}>⚑ Highlighted rows have transaction findings</div>}
          </div>}
        </>}
      </>}

      {/* ── TRANSACTIONS TAB ──────────────────────────────── */}
      {tab==='transactions'&&<>
        {acctTxFindings.length===0&&<div style={{padding:'20px',background:'#ECFDF5',border:'1px solid #A7F3D0',borderRadius:10,fontSize:13,fontFamily:'var(--fb)',color:T.green}}>✅ No transaction-level findings for this account across the entire period.</div>}
        {acctTxFindings.length>0&&<>
          <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:4}}>
            <span style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)'}}>{acctTxFindings.length} finding{acctTxFindings.length!==1?'s':''} — all periods</span>
            <span style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>Applicable rules: {applicableTxRules.map(r=><Mono key={r} ch={r+' '} c={T.sub}/>)}</span>
          </div>
          {/* Group by month */}
          {[...new Set(acctTxFindings.map(f=>{if(!f.glDate)return null;const d=f.glDate instanceof Date?f.glDate:new Date(f.glDate);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}).filter(Boolean))].sort().reverse().map(mk=>{
            const mFindings=acctTxFindings.filter(f=>{if(!f.glDate)return false;const d=f.glDate instanceof Date?f.glDate:new Date(f.glDate);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`===mk;});
            return(<div key={mk} style={{marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <button onClick={()=>{setSelectedMonth(mk);setTab('monthly');}} style={{fontFamily:'var(--fm)',fontSize:11,padding:'3px 10px',borderRadius:20,border:`1px solid ${T.orange}44`,background:T.orangeLt,color:T.orange,cursor:'pointer',fontWeight:600}}>{mk} →</button>
                <span style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>{mFindings.length} finding{mFindings.length!==1?'s':''}</span>
              </div>
              {mFindings.map((fi,i)=>{const s=SC[fi.severity]||SC.MEDIUM;return(
                <div key={i} style={{background:s.bg,border:`1px solid ${s.bo}`,borderRadius:9,padding:'10px 14px',marginBottom:6}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:5,flexWrap:'wrap'}}>
                    <SevBadge sev={fi.severity}/><Mono ch={fi.ruleId}/>
                    <span style={{fontSize:12,fontWeight:600,color:s.c,fontFamily:'var(--fb)',flex:1}}>{fi.ruleLabel}</span>
                    {fi.amount>0&&<span style={{fontFamily:'var(--fm)',fontSize:12,color:T.amber}}>{fi.amount.toLocaleString('en-US',{minimumFractionDigits:2})} BHD</span>}
                  </div>
                  <div style={{fontSize:12,color:T.text,lineHeight:1.5,fontFamily:'var(--fb)',marginBottom:6}}>{fi.detail}</div>
                  <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
                    {[['JV',fi.jvNumber],['User',fi.user],['Source',fi.source],['Date',fmtDate(fi.glDate)]].map(([l,v])=>v&&v!=='—'&&<div key={l}><Lbl ch={l}/><div style={{fontSize:11,color:T.text,fontFamily:'var(--fb)'}}>{v}</div></div>)}
                  </div>
                </div>
              );})}
            </div>);
          })}
        </>}
      </>}

      {/* ── USERS TAB ─────────────────────────────────────── */}
      {tab==='users'&&<>
        {acctUsers.length===0&&<div style={{padding:'20px',background:T.mid,borderRadius:10,fontSize:13,fontFamily:'var(--fb)',color:T.sub}}>No manual journal activity found for this account from the user profiling data.</div>}
        {acctUsers.map((u,i)=>{const lvlC=u.riskLevel==='HIGH'?T.red:u.riskLevel==='MEDIUM'?T.amber:T.green;const lvlBg=u.riskLevel==='HIGH'?'#FEF2F2':u.riskLevel==='MEDIUM'?'#FFFBEB':'#ECFDF5';return(
          <div key={i} style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,padding:'14px 16px',boxShadow:T.sm}}>
            <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,fontFamily:'var(--fb)',marginBottom:3}}>{u.user}</div>
                <div style={{fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>{u.count} manual JVs · {u.share.toFixed(0)}% of all manual activity · {Math.round(u.value).toLocaleString()} BHD</div>
              </div>
              <span style={{padding:'4px 14px',borderRadius:20,background:lvlBg,color:lvlC,fontFamily:'var(--fb)',fontSize:12,fontWeight:700}}>{u.riskLevel} RISK</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:u.riskFlags.length>0?10:0}}>
              {[['After hours',`${u.ahPct.toFixed(0)}%`,u.ahPct>20?T.red:T.sub],['Weekends',`${u.wePct.toFixed(0)}%`,u.wePct>10?T.amber:T.sub],['Period-end',`${u.ldPct.toFixed(0)}%`,u.ldPct>30?T.amber:T.sub],['Risk score',u.riskScore,T.text]].map(([l,v,c])=>(
                <div key={l} style={{textAlign:'center',padding:'8px',background:T.mid,borderRadius:7}}>
                  <Lbl ch={l}/><div style={{fontFamily:'var(--fb)',fontSize:18,fontWeight:600,color:c}}>{v}</div>
                </div>
              ))}
            </div>
            {u.riskFlags.length>0&&<div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:8}}>
              {u.riskFlags.map((f,j)=><span key={j} style={{fontSize:11,padding:'2px 10px',borderRadius:20,background:'#FEF2F2',color:T.red,fontFamily:'var(--fb)',border:'1px solid #FECACA'}}>{f}</span>)}
            </div>}
          </div>
        );})}
      </>}

    </div>
  </div>);
}

// ─── JOURNAL INTELLIGENCE FULL PAGE ───────────────────────────
function JournalIntelPage({intel}){
  const[expanded,setExpanded]=useState(null);
  if(!intel||intel.total===0)return<div style={{padding:40,textAlign:'center',color:T.dim,fontFamily:'var(--fb)'}}>No manual journal entries in dataset.</div>;
  return(<div style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
      {[['Manual JVs',fmtNum(intel.total),`${intel.shareOfAll.toFixed(1)}% of all entries`,T.text,T.mid],['SoD Violations',fmtNum(intel.sodViolations),`${intel.sodPct.toFixed(0)}% single-user JVs`,intel.sodViolations>0?T.red:T.green,intel.sodViolations>0?'#FEF2F2':'#ECFDF5'],['Period-End Surge',fmtNum(intel.periodEnd),`${intel.periodEndPct.toFixed(0)}% of manual JVs`,intel.periodEndPct>25?T.amber:T.green,intel.periodEndPct>25?'#FFFBEB':'#ECFDF5'],['High-Risk Users',intel.users.filter(u=>u.riskLevel==='HIGH').length,'require attention',T.red,'#FEF2F2']].map(([l,v,sub,c,bg])=>(
      <div key={l} style={{background:bg,borderRadius:10,padding:'14px',textAlign:'center',boxShadow:T.sm,border:`1px solid ${T.border}`}}>
        <div style={{fontSize:10,color:c,fontFamily:'var(--fb)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:7,opacity:0.8}}>{l}</div>
        <div style={{fontFamily:'var(--fb)',fontSize:26,fontWeight:600,color:c,lineHeight:1,marginBottom:4}}>{v}</div>
        <div style={{fontSize:11,color:T.sub}}>{sub}</div>
      </div>
    ))}
    </div>
    {intel.patterns.length>0&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)'}}>Systemic Patterns</div>
      {intel.patterns.map((p,i)=>{const s=SC[p.severity]||SC.HIGH;return(<div key={i} style={{background:s.bg,border:`1px solid ${s.bo}`,borderRadius:9,padding:'12px 16px'}}><div style={{display:'flex',gap:8,alignItems:'center',marginBottom:5}}><SevBadge sev={p.severity}/><span style={{fontSize:13,fontWeight:600,color:s.c,fontFamily:'var(--fb)'}}>{p.title}</span></div><div style={{fontSize:12,color:T.text,lineHeight:1.55,fontFamily:'var(--fb)'}}>{p.detail}</div></div>);})}
    </div>}
    <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)'}}>User Risk Profiles — ranked by risk score</div>
    {intel.users.map((u,i)=>{const isExp=expanded===u.user;const lvlC=u.riskLevel==='HIGH'?T.red:u.riskLevel==='MEDIUM'?T.amber:T.green;const lvlBg=u.riskLevel==='HIGH'?'#FEF2F2':u.riskLevel==='MEDIUM'?'#FFFBEB':'#ECFDF5';return(
      <div key={u.user} style={{background:T.card,borderRadius:10,border:`1px solid ${T.border}`,overflow:'hidden',boxShadow:T.sm}}>
        <div onClick={()=>setExpanded(isExp?null:u.user)} style={{display:'grid',gridTemplateColumns:'2fr 80px 80px 80px 80px 120px',gap:12,padding:'12px 16px',cursor:'pointer',alignItems:'center',background:isExp?T.hover:T.card}} onMouseEnter={e=>e.currentTarget.style.background=T.hover} onMouseLeave={e=>e.currentTarget.style.background=isExp?T.hover:T.card}>
          <div><div style={{fontWeight:600,fontSize:13,fontFamily:'var(--fb)'}}>{u.user}</div><div style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>{u.count} JVs · {u.share.toFixed(0)}% · {Math.round(u.value).toLocaleString()} BHD</div></div>
          {[['After hrs',`${u.ahPct.toFixed(0)}%`,u.ahPct>20?T.red:T.sub],['Weekend',`${u.wePct.toFixed(0)}%`,u.wePct>10?T.amber:T.sub],['Period-end',`${u.ldPct.toFixed(0)}%`,u.ldPct>30?T.amber:T.sub],['Score',u.riskScore,T.text]].map(([l,v,c])=><div key={l} style={{textAlign:'center'}}><div style={{fontSize:9,color:T.dim,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:3}}>{l}</div><div style={{fontFamily:'var(--fb)',fontSize:18,fontWeight:600,color:c,lineHeight:1}}>{v}</div></div>)}
          <div style={{textAlign:'center'}}><span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700,background:lvlBg,color:lvlC,fontFamily:'var(--fb)'}}>{u.riskLevel}</span></div>
        </div>
        {isExp&&<div style={{padding:'12px 16px',borderTop:`1px solid ${T.border}`,background:T.hover}}>
          {u.riskFlags.length>0&&<div style={{marginBottom:10,display:'flex',gap:7,flexWrap:'wrap'}}>{u.riskFlags.map((f,j)=><span key={j} style={{fontSize:11,padding:'2px 9px',borderRadius:20,background:'#FEF2F2',color:T.red,border:'1px solid #FECACA',fontFamily:'var(--fb)'}}>{f}</span>)}</div>}
          <div style={{fontSize:11,color:T.dim,marginBottom:8,fontFamily:'var(--fb)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Top accounts by manual volume</div>
          {u.topAccts.map(a=><div key={a.code} style={{display:'flex',alignItems:'center',gap:10,marginBottom:5,fontSize:12,fontFamily:'var(--fb)'}}><Mono ch={a.code} size={11}/><span style={{flex:1}}>{a.label}</span><span style={{color:T.sub}}>{a.count} ({a.pct}%)</span><div style={{width:60,height:4,background:T.mid,borderRadius:2,overflow:'hidden'}}><div style={{height:'100%',width:`${a.pct}%`,background:T.orange,borderRadius:2}}/></div></div>)}
        </div>}
      </div>
    );})}
  </div>);
}

// ─── TAG INPUT — multi-select dropdown ───────────────────────
function TagInput({options,selected,onAdd,onRemove,placeholder}){
  const[q,setQ]=useState('');const[open,setOpen]=useState(false);
  const filtered=useMemo(()=>options.filter(o=>!selected.has(o)&&o.toLowerCase().includes(q.toLowerCase())).slice(0,20),[options,selected,q]);
  return(<div style={{position:'relative',display:'flex',flexWrap:'wrap',gap:4,alignItems:'center',minWidth:80,flex:1,padding:'3px 6px',border:`1px solid ${T.borderHi}`,borderRadius:7,background:T.bg,cursor:'text'}} onClick={()=>document.activeElement?.tagName!=='INPUT'&&setOpen(true)}>
    {[...selected].map(v=><span key={v} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'1px 7px',borderRadius:20,background:T.orangeLt,border:`1px solid ${T.orange}44`,fontSize:11,color:T.orange,fontFamily:'var(--fb)',fontWeight:600}}>{v}<button onMouseDown={e=>{e.preventDefault();onRemove(v);}} style={{background:'none',border:'none',cursor:'pointer',color:T.orange,fontSize:12,lineHeight:1,padding:0,marginLeft:1}}>×</button></span>)}
    <input value={q} onChange={e=>{setQ(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>setOpen(false),150)} placeholder={selected.size===0?placeholder:''} style={{border:'none',outline:'none',fontSize:12,fontFamily:'var(--fb)',background:'transparent',color:T.text,minWidth:60,flex:1}}/>
    {open&&filtered.length>0&&<div style={{position:'absolute',top:'100%',left:0,zIndex:200,background:T.card,border:`1px solid ${T.borderHi}`,borderRadius:8,boxShadow:T.sm,maxHeight:180,overflowY:'auto',minWidth:160,marginTop:3,width:'100%'}}>
      {filtered.map(o=><div key={o} onMouseDown={()=>{onAdd(o);setQ('');}} style={{padding:'7px 12px',fontSize:12,cursor:'pointer',fontFamily:'var(--fb)',color:T.text}} onMouseEnter={e=>e.target.style.background=T.hover} onMouseLeave={e=>e.target.style.background=''}>{o}</div>)}
    </div>}
  </div>);
}

// ─── TRANSACTION FINDINGS FULL PAGE ───────────────────────────
function TxFindingsPage({txResult,onExport,anomalyResult}){
  const[sev,    setSev]    =useState('');
  const[search, setSearch] =useState('');
  const[descQ,  setDescQ]  =useState('');
  const[glTags, setGlTags] =useState(new Set());
  const[ruleF,  setRuleF]  =useState('');
  const[userF,  setUserF]  =useState('');
  const[sortCol,setSortCol]=useState('amount');
  const[sortDir,setSortDir]=useState('desc');
  const[page,   setPage]   =useState(1);
  const[expanded,setExpanded]=useState(null);

  const PAGE=30;
  const findings=txResult?.findings||[];
  const stats=txResult?.stats||{};
  const anomalySummary=anomalyResult?.summary||null;

  const allRules=useMemo(()=>[...new Set(findings.map(f=>f.ruleId).filter(Boolean))].sort(),[findings]);
  const allGLs  =useMemo(()=>[...new Set(findings.map(f=>String(f.glCode)).filter(Boolean))].sort(),[findings]);
  const allUsers=useMemo(()=>[...new Set(findings.map(f=>f.user).filter(Boolean))].sort(),[findings]);

  const filtered=useMemo(()=>{
    let out=findings;
    if(sev)         out=out.filter(f=>f.severity===sev);
    if(ruleF)       out=out.filter(f=>f.ruleId===ruleF);
    if(glTags.size) out=out.filter(f=>glTags.has(String(f.glCode)));
    if(userF)       out=out.filter(f=>f.user===userF);
    if(descQ)       out=out.filter(f=>String(f.description||'').toLowerCase().includes(descQ.toLowerCase()));
    if(search){const q=search.toLowerCase();out=out.filter(f=>[f.glCode,f.glDesc,f.ruleLabel,f.detail,f.user,f.ruleId,f.jvNumber].some(v=>String(v||'').toLowerCase().includes(q)));}
    out=[...out].sort((a,b)=>{
      let av,bv;
      if(sortCol==='amount'){av=a.amount||0;bv=b.amount||0;}
      else if(sortCol==='date'){av=a.glDate?new Date(a.glDate).getTime():0;bv=b.glDate?new Date(b.glDate).getTime():0;}
      else if(sortCol==='gl'){av=String(a.glCode||'');bv=String(b.glCode||'');}
      else if(sortCol==='sev'){const o={CRITICAL:0,HIGH:1,MEDIUM:2};av=o[a.severity]??3;bv=o[b.severity]??3;}
      else if(sortCol==='user'){av=a.user||'';bv=b.user||'';}
      else if(sortCol==='rule'){av=a.ruleId||'';bv=b.ruleId||'';}
      else{av=a.amount||0;bv=b.amount||0;}
      if(typeof av==='string')return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av);
      return sortDir==='asc'?av-bv:bv-av;
    });
    return out;
  },[findings,sev,ruleF,glTags,userF,descQ,search,sortCol,sortDir]);

  const total=Math.ceil(filtered.length/PAGE)||1;
  const rows=filtered.slice((page-1)*PAGE,page*PAGE);
  const hasFilters=sev||ruleF||glTags.size||userF||descQ||search;

  const sort=col=>{if(sortCol===col){setSortDir(d=>d==='asc'?'desc':'asc');}else{setSortCol(col);setSortDir(col==='date'?'asc':'desc');}setPage(1);};
  const SortIcon=({col})=>sortCol===col?<span style={{color:T.orange,fontSize:9,marginLeft:3}}>{sortDir==='asc'?'↑':'↓'}</span>:<span style={{color:T.border,fontSize:9,marginLeft:3}}>⇅</span>;
  const th=(label,col,extra={})=><th onClick={col?()=>sort(col):undefined} style={{padding:'8px 10px',textAlign:'left',fontSize:9,color:sortCol===col?T.orange:T.dim,textTransform:'uppercase',letterSpacing:'0.05em',borderBottom:`1px solid ${T.border}`,fontWeight:sortCol===col?700:600,background:T.mid,whiteSpace:'nowrap',cursor:col?'pointer':'default',userSelect:'none',...extra}}>{label}{col&&<SortIcon col={col}/>}</th>;
  const td=(ex={})=>({padding:'7px 10px',borderBottom:`1px solid ${T.border}`,fontSize:12,fontFamily:'var(--fb)',verticalAlign:'top',color:T.text,...ex});
  const selStyle={fontSize:11,padding:'5px 8px',border:`1px solid ${T.borderHi}`,borderRadius:7,background:T.bg,color:T.text,fontFamily:'var(--fb)',cursor:'pointer',outline:'none'};

  return(<div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div>
        <div style={{fontFamily:'var(--fh)',fontSize:16,fontWeight:700}}>All Transaction Findings</div>
        <div style={{fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>{fmtNum(findings.length)} findings · 29 rules · {stats.glCount} accounts · {stats.userCount} users</div>
        {anomalySummary&&<div style={{fontSize:11,color:T.teal,fontFamily:'var(--fb)',marginTop:3}}>Ensemble anomalies: {fmtNum(anomalySummary.anomalies||0)} / {fmtNum(anomalySummary.total_rows||0)} ({(((anomalySummary.anomaly_rate||0)*100)).toFixed(1)}%)</div>}
      </div>
      <Btn ch="↓ Export Excel" variant="success" onClick={onExport}/>
    </div>
    {/* Severity tiles */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
      {[{l:'All',v:findings.length,c:T.text,bg:T.mid,sv:''},{l:'CRITICAL',v:stats.bySev?.CRITICAL||0,c:T.red,bg:'#FEF2F2',sv:'CRITICAL'},{l:'HIGH',v:stats.bySev?.HIGH||0,c:T.amber,bg:'#FFFBEB',sv:'HIGH'},{l:'MEDIUM',v:stats.bySev?.MEDIUM||0,c:T.blue,bg:'#EFF6FF',sv:'MEDIUM'}].map(sc=>(
        <div key={sc.l} onClick={()=>{setSev(p=>p===sc.sv&&sc.sv?'':sc.sv);setPage(1);}} style={{background:sc.bg,borderRadius:9,padding:'11px',textAlign:'center',cursor:'pointer',border:`1px solid ${sev===sc.sv&&sc.sv?sc.c+'66':'transparent'}`}}>
          <div style={{fontSize:9,color:sc.c,opacity:0.7,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4,fontFamily:'var(--fb)'}}>{sc.l}</div>
          <div style={{fontFamily:'var(--fb)',fontSize:22,fontWeight:600,color:sc.c,lineHeight:1}}>{sc.v.toLocaleString()}</div>
        </div>
      ))}
    </div>
    {/* Filters */}
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)',fontWeight:600,flexShrink:0}}>Search:</span>
        <input placeholder="Rule, JV, user, detail..." value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} style={{flex:1,minWidth:140,padding:'5px 10px',border:`1px solid ${T.borderHi}`,borderRadius:7,fontSize:12,fontFamily:'var(--fb)',outline:'none',background:T.bg,color:T.text}} onFocus={e=>e.target.style.borderColor=T.orange} onBlur={e=>e.target.style.borderColor=T.borderHi}/>
        <input placeholder="Description text..." value={descQ} onChange={e=>{setDescQ(e.target.value);setPage(1);}} style={{flex:1,minWidth:120,padding:'5px 10px',border:`1px solid ${T.borderHi}`,borderRadius:7,fontSize:12,fontFamily:'var(--fb)',outline:'none',background:T.bg,color:T.text}} onFocus={e=>e.target.style.borderColor=T.orange} onBlur={e=>e.target.style.borderColor=T.borderHi}/>
      </div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)',fontWeight:600,flexShrink:0}}>Filter:</span>
        <div style={{flex:2,minWidth:140,display:'flex',alignItems:'center'}}>
          <TagInput options={allGLs} selected={glTags} onAdd={v=>{setGlTags(p=>new Set([...p,v]));setPage(1);}} onRemove={v=>{setGlTags(p=>{const n=new Set(p);n.delete(v);return n;});setPage(1);}} placeholder="GL codes (multi-select)..."/>
        </div>
        <select value={ruleF} onChange={e=>{setRuleF(e.target.value);setPage(1);}} style={selStyle}><option value="">All rules</option>{allRules.map(r=><option key={r} value={r}>{r}</option>)}</select>
        <select value={userF} onChange={e=>{setUserF(e.target.value);setPage(1);}} style={selStyle}><option value="">All users</option>{allUsers.map(u=><option key={u} value={u}>{u.length>24?u.slice(0,24)+'…':u}</option>)}</select>
        {hasFilters&&<Btn variant="ghost" ch="✕ Clear" onClick={()=>{setSev('');setSearch('');setDescQ('');setGlTags(new Set());setRuleF('');setUserF('');setPage(1);}} style={{padding:'5px 12px',fontSize:11}}/>}
      </div>
    </div>
    <div style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>{fmtNum(filtered.length)} results{filtered.length!==findings.length?` of ${fmtNum(findings.length)}`:''} · Page {page}/{total} · Sorted by {sortCol} {sortDir==='desc'?'↓':'↑'}</div>
    {/* Table */}
    <div style={{overflowX:'auto',borderRadius:10,border:`1px solid ${T.border}`,boxShadow:T.sm}}>
      <table style={{width:'100%',borderCollapse:'collapse',whiteSpace:'nowrap',background:T.card}}>
        <thead><tr>
          {th('#',null,{minWidth:32})}{th('Sev','sev',{minWidth:80})}{th('Rule','rule',{minWidth:90})}{th('GL','gl',{minWidth:60})}
          {th('Description',null,{minWidth:130,whiteSpace:'normal'})}{th('Amount','amount',{minWidth:90,textAlign:'right'})}
          {th('Date','date',{minWidth:85})}{th('User','user',{minWidth:90})}{th('Detail',null,{minWidth:200,whiteSpace:'normal'})}
        </tr></thead>
        <tbody>{rows.map((fi,i)=>{
          const isExp=expanded===fi.id;const rb=i%2===0?T.card:T.hover;
          return(<React.Fragment key={fi.id}>
            <tr onClick={()=>setExpanded(isExp?null:fi.id)} style={{background:isExp?T.orangeLt:rb,cursor:'pointer',borderLeft:isExp?`3px solid ${T.orange}`:'3px solid transparent'}} onMouseEnter={e=>{if(!isExp)e.currentTarget.style.background=T.hover;}} onMouseLeave={e=>{if(!isExp)e.currentTarget.style.background=rb;}}>
              <td style={td({color:T.dim,fontSize:10})}>{(page-1)*PAGE+i+1}</td>
              <td style={td()}><SevBadge sev={fi.severity}/></td>
              <td style={td()}><Mono ch={fi.ruleId}/></td>
              <td style={td({fontWeight:600})}>{fi.glCode}</td>
              <td style={td({color:T.sub,whiteSpace:'normal',maxWidth:130})}>{(fi.glDesc||'—').slice(0,40)}</td>
              <td style={td({fontFamily:'var(--fm)',textAlign:'right',color:T.amber})}>{fi.amount>0?fi.amount.toLocaleString('en-US',{minimumFractionDigits:2}):'—'}</td>
              <td style={td({color:T.sub})}>{fmtDate(fi.glDate)}</td>
              <td style={td({fontSize:11})}>{(fi.user||'—').slice(0,22)}</td>
              <td style={td({color:T.sub,whiteSpace:'normal',maxWidth:240})}>{(fi.detail||'').slice(0,90)}{(fi.detail||'').length>90?'…':''}</td>
            </tr>
            {isExp&&<tr style={{background:T.orangeLt}}><td colSpan={9} style={{padding:'12px 14px',borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10}}>
                {[['Rule',fi.ruleLabel],['Full detail',fi.detail],['JV',fi.jvNumber],['GL date',fmtDate(fi.glDate)],['Created',fmtDate(fi.creationDate)],['Cost centre',fi.costCentre],['User',fi.user],['Source',fi.source],['Concept',fi.concept],['Description',fi.description]].map(([l,v])=><div key={l}><Lbl ch={l}/><div style={{fontSize:12,color:T.text,fontFamily:'var(--fb)',wordBreak:'break-word',lineHeight:1.4}}>{v||'—'}</div></div>)}
              </div>
            </td></tr>}
          </React.Fragment>);
        })}
        {!rows.length&&<tr><td colSpan={9} style={{padding:32,textAlign:'center',color:T.dim,fontFamily:'var(--fb)',fontSize:12}}>No findings match current filters</td></tr>}
        </tbody>
      </table>
    </div>
    {total>1&&<div style={{display:'flex',justifyContent:'center',gap:8,alignItems:'center'}}>
      <Btn variant="ghost" ch="← Prev" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{padding:'6px 14px',fontSize:12}}/>
      <span style={{fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>{page} / {total}</span>
      <Btn variant="ghost" ch="Next →" onClick={()=>setPage(p=>Math.min(total,p+1))} disabled={page===total} style={{padding:'6px 14px',fontSize:12}}/>
    </div>}
  </div>);
}

// ─── FINDINGS HUB — two-panel workspace ───────────────────────
function FindingsModule({results,config,parsedData}){
  const[mainView,    setMainView]    =useState('accounts');
  const[selected,    setSelected]    =useState(null);
  const[groupFilter, setGroupFilter] =useState('ALL');
  const[selectedSet, setSelectedSet] =useState(new Set());

  const profiles  =results?.periodic?.profiles||[];
  const intel     =results?.periodic?.journalIntel;
  const txResult  =results?.transaction;
  const anomalyResult=results?.anomaly;
  const allRows   =parsedData?.glData||[];
  const txFindings=txResult?.findings||[];

  useEffect(()=>{ setSelected({__groupView:true}); },[profiles]);

  const handleGroupFilter=useCallback(gid=>{ setGroupFilter(gid); setSelected({__groupView:true}); },[]);
  const handleSelectAccount=useCallback(p=>setSelected(p),[]);
  const handleToggleCheck=useCallback((glCode,checked)=>{
    setSelectedSet(prev=>{ const n=new Set(prev); checked?n.add(glCode):n.delete(glCode); return n; });
  },[]);
  const handleClearSelection=useCallback(()=>setSelectedSet(new Set()),[]);

  const groupLabel=useMemo(()=>groupFilter==='ALL'?'All Accounts — Overview':GL_GROUPS.find(g=>g.id===groupFilter)?.label||groupFilter,[groupFilter]);

  const exportExcel=async()=>{
    const wb=XLSX.utils.book_new();
    const per=results?.periodic?.stats; const tx=results?.transaction?.stats;
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Landmark Audit Workbench v11'],['Generated:',new Date().toLocaleString()],
      ['Red accounts',per?.red||0],['Amber accounts',per?.amber||0],
      ['Critical flags',per?.criticalFlags||0],['High flags',per?.highFlags||0],
      ['Tx findings',tx?.total||0],['Critical',tx?.bySev?.CRITICAL||0],['High',tx?.bySev?.HIGH||0],['Medium',tx?.bySev?.MEDIUM||0],
      ['Anomalies',results?.anomaly?.summary?.anomalies||0],['Anomaly rate',`${(((results?.anomaly?.summary?.anomaly_rate)||0)*100).toFixed(1)}%`],
    ]),'Summary');
    const pRows=profiles.map(p=>[p.glCode,p.meta.label,p.meta.type,p.meta.category,p.light,p.flags.length,p.activeMonths,Math.round(p.totalDR),Math.round(p.totalCR),p.flags.map(f=>f.title).join(' | ')]);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['GL Code','Label','Type','Category','Status','Flags','Active Months','Total DR','Total CR','Flag Summaries'],...pRows]),'Account Pulse');
    if(intel){const ji=intel.users.map(u=>[u.user,u.count,Math.round(u.value),u.share.toFixed(1)+'%',u.ahPct.toFixed(0)+'%',u.wePct.toFixed(0)+'%',u.ldPct.toFixed(0)+'%',u.riskScore,u.riskLevel,u.riskFlags.join('; ')]);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['User','Count','Value','Share','After Hrs','Weekend','Period-End','Score','Level','Flags'],...ji]),'Journal Intelligence');}
    const cols=['ID','Severity','Rule','Category','GL Code','GL Desc','Amount','GL Date','JV','User','Source','Description','Rule Label','Detail'];
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([cols,...txFindings.map(f=>[f.id,f.severity,f.ruleId,f.category,f.glCode,f.glDesc,f.amount,fmtDate(f.glDate),f.jvNumber,f.user,f.source,f.description,f.ruleLabel,f.detail])]),'Transaction Findings');
    const glRows=parsedData?.glData||[];
    const glHeaders=(parsedData?.glHeaders&&parsedData.glHeaders.length)?parsedData.glHeaders:PREVIEW_COLS;
    if(anomalyResult?.transactions?.length&&glRows.length){
      const ann=anomalyResult.transactions;
      const byId=new Map(ann.map(a=>[a.transaction_id,a]));
      const alignIdx=ann.length===glRows.length;
      const rowIds=alignIdx?null:await buildTransactionIds(glRows);
      const tidAt=i=>(alignIdx?ann[i].transaction_id:rowIds[i]);
      const sum=anomalyResult.summary||{};
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
        ['Run_Metadata'],['Key','Value'],
        ['generated_at_utc',new Date().toISOString()],
        ['model_version',anomalyResult.model_version||''],
        ['feature_version',anomalyResult.feature_version||''],
        ['gl_row_count',glRows.length],
        ['scored_transactions',ann.length],
        ['join_method',alignIdx?'index_aligned_with_gl':'sha1_transaction_id'],
        ['threshold',sum.threshold??''],
        ['vote_count_threshold',sum.vote_count_threshold??''],
        ['contamination',sum.contamination??''],
        ['include_rule_flags_in_ml',sum.include_rule_flags_in_ml??''],
        ['ml_feature_count',sum.ml_feature_count??''],
        ['anomalies_flagged',sum.anomalies??''],
        ['anomaly_rate',sum.anomaly_rate??''],
        ['active_anomaly_models',(sum.active_anomaly_models||[]).join('|')],
        ['ml_vote_rule_applies',sum.ml_vote_rule_applies===true?'Y':sum.ml_vote_rule_applies===false?'N':''],
      ]),'Run_Metadata');
      const sample=ann[0]||{};
      const voteKeys=Object.keys(sample.model_votes||{});
      const scoreKeys=Object.keys(sample.model_scores||{});
      const labelHeader=['transaction_id','is_anomaly','ensemble_score','detection_type','critical_rule_triggered','vote_count','vote_disagreement','models_fired','expert_signal_score','generic_signal_score','reasons','top_generic_drivers','rules_fired',...voteKeys.map(k=>`vote_${k}`),...scoreKeys.map(k=>`score_${k}`)];
      const labelRows=ann.map(a=>{
        const rulesFired=Object.entries(a.rule_flags||{}).filter(([,v])=>v).map(([k])=>k.replace(/^flag_/,''));
        const tg=(a.top_generic_features||[]).slice(0,3).map(x=>`${x.feature}=${x.value}(z=${x.z_score})`).join(' | ');
        return[a.transaction_id,a.is_anomaly?'Y':'N',a.ensemble_score,a.detection_type||'',a.critical_rule_triggered?'Y':'N',a.vote_count??'',a.vote_disagreement??'',(a.models_fired||[]).join(','),a.expert_signal_score,a.generic_signal_score,(a.reasons||[]).join('|'),tg,rulesFired.join(','),...voteKeys.map(k=>a.model_votes?.[k]),...scoreKeys.map(k=>a.model_scores?.[k])];
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([labelHeader,...labelRows]),'Anomaly_Labels');
      const extraCols=['transaction_id','is_anomaly','ensemble_score','detection_type','vote_count','models_fired','reasons','rules_fired_count'];
      const glHead=[...glHeaders,...extraCols];
      const glOut=glRows.map((row,i)=>{
        const tid=tidAt(i);
        const sc=byId.get(tid);
        const base=glHeaders.map(h=>row[h]??'');
        if(!sc) return[...base,'','','','','','','',0];
        const nRules=Object.values(sc.rule_flags||{}).filter(v=>v).length;
        return[...base,sc.transaction_id,sc.is_anomaly?'Y':'N',sc.ensemble_score,sc.detection_type||'',sc.vote_count??'',(sc.models_fired||[]).join(','),(sc.reasons||[]).join('|'),nRules];
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([glHead,...glOut]),'GL_with_Anomaly');
    }else if(anomalyResult?.transactions?.length){
      const ann=anomalyResult.transactions;
      const sum=anomalyResult.summary||{};
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
        ['Run_Metadata'],['Key','Value'],
        ['generated_at_utc',new Date().toISOString()],
        ['model_version',anomalyResult.model_version||''],
        ['feature_version',anomalyResult.feature_version||''],
        ['note','No GL rows in session — labels only'],
        ['threshold',sum.threshold??''],
        ['vote_count_threshold',sum.vote_count_threshold??''],
        ['contamination',sum.contamination??''],
        ['active_anomaly_models',(sum.active_anomaly_models||[]).join('|')],
        ['ml_vote_rule_applies',sum.ml_vote_rule_applies===true?'Y':sum.ml_vote_rule_applies===false?'N':''],
      ]),'Run_Metadata');
      const sample=ann[0]||{};
      const voteKeys=Object.keys(sample.model_votes||{});
      const scoreKeys=Object.keys(sample.model_scores||{});
      const labelHeader=['transaction_id','is_anomaly','ensemble_score','detection_type','critical_rule_triggered','vote_count','vote_disagreement','models_fired','expert_signal_score','generic_signal_score','reasons','top_generic_drivers','rules_fired',...voteKeys.map(k=>`vote_${k}`),...scoreKeys.map(k=>`score_${k}`)];
      const labelRows=ann.map(a=>{
        const rulesFired=Object.entries(a.rule_flags||{}).filter(([,v])=>v).map(([k])=>k.replace(/^flag_/,''));
        const tg=(a.top_generic_features||[]).slice(0,3).map(x=>`${x.feature}=${x.value}(z=${x.z_score})`).join(' | ');
        return[a.transaction_id,a.is_anomaly?'Y':'N',a.ensemble_score,a.detection_type||'',a.critical_rule_triggered?'Y':'N',a.vote_count??'',a.vote_disagreement??'',(a.models_fired||[]).join(','),a.expert_signal_score,a.generic_signal_score,(a.reasons||[]).join('|'),tg,rulesFired.join(','),...voteKeys.map(k=>a.model_votes?.[k]),...scoreKeys.map(k=>a.model_scores?.[k])];
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([labelHeader,...labelRows]),'Anomaly_Labels');
    }
    if(anomalyResult?.summary?.config_guidance){
      const gRows=Object.entries(anomalyResult.summary.config_guidance).map(([name,g])=>[
        name,g.unit||'',g.suggested_lower,g.suggested_upper,g.p95,g.three_sd_upper,g.method||''
      ]);
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Parameter','Unit','Suggested Lower','Suggested Upper','P95','3SD Upper','Method'],...gRows]),'Config Guidance');
    }
    if(config){XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Parameter','Value'],...Object.entries(config).filter(([k])=>k!=='enabledRules').map(([k,v])=>[k,Array.isArray(v)?v.join(','):v])]),'Config');}
    XLSX.writeFile(wb,`Landmark_Audit_v11_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const rightPanel=()=>{
    if(selectedSet.size>=2) return<ComparisonView profiles={profiles} selectedSet={selectedSet} txFindings={txFindings} onClear={handleClearSelection}/>;
    if(selected?.__groupView) return<GroupDashboard profiles={profiles} txFindings={txFindings} groupId={groupFilter} groupLabel={groupLabel}/>;
    return<AccountWorkspace profile={selected} txFindings={txFindings} allRows={allRows} journalIntel={intel} config={config}/>;
  };

  return(<div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 120px)',gap:0}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 0 12px 0',flexShrink:0}}>
      <div>
        <div style={{fontFamily:'var(--fh)',fontSize:18,fontWeight:800,marginBottom:2}}>Audit Findings</div>
        <div style={{fontSize:12,color:T.sub}}>Account Pulse · Journal Intelligence · Transactions · ML anomalies · Benford</div>
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <div style={{display:'flex',background:T.mid,borderRadius:9,padding:3,gap:3}}>
          {[{id:'accounts',icon:'📡',label:'Accounts'},{id:'journal',icon:'👤',label:'Journal'},{id:'transactions',icon:'🔬',label:'Transactions'},{id:'ml',icon:'🧠',label:'ML'},{id:'benford',icon:'📐',label:'Benford'}].map(v=>(
            <button key={v.id} onClick={()=>setMainView(v.id)} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:7,border:'none',cursor:'pointer',fontFamily:'var(--fb)',fontSize:12,fontWeight:600,background:mainView===v.id?T.card:'transparent',color:mainView===v.id?T.orange:T.sub,boxShadow:mainView===v.id?T.sm:'none',transition:'all 0.2s'}}>{v.icon} {v.label}</button>
          ))}
        </div>
        <Btn variant="success" ch="↓ Export" onClick={()=>void exportExcel()} style={{padding:'7px 14px',fontSize:12}}/>
      </div>
    </div>
    {mainView==='accounts'&&<div style={{display:'flex',flex:1,minHeight:0,borderRadius:12,overflow:'hidden',border:`1px solid ${T.border}`,boxShadow:T.md}}>
      <AccountList profiles={profiles} selected={selected} onSelect={handleSelectAccount} txFindings={txFindings} groupFilter={groupFilter} onGroupFilter={handleGroupFilter} selectedSet={selectedSet} onToggleCheck={handleToggleCheck}/>
      {rightPanel()}
    </div>}
    {mainView==='journal'      &&<div style={{flex:1,overflowY:'auto',paddingRight:4}}><JournalIntelPage intel={intel}/></div>}
    {mainView==='transactions' &&<div style={{flex:1,overflowY:'auto',paddingRight:4}}><TxFindingsPage txResult={txResult} anomalyResult={anomalyResult} onExport={()=>void exportExcel()}/></div>}
    {mainView==='ml'           &&<div style={{flex:1,overflowY:'auto',paddingRight:4}}><MlAnomalyDashboard anomalyResult={anomalyResult} allRows={allRows}/></div>}
    {mainView==='benford'      &&<div style={{flex:1,overflowY:'auto',paddingRight:4}}><BenfordAnalysis allRows={allRows} profiles={profiles} txFindings={txFindings}/></div>}
  </div>);
}

// ─── APP SHELL ────────────────────────────────────────────────
function logReducer(s,a){return a.type==='CLEAR'?[]:a.type==='ADD'?[...s,a.payload]:s;}

export default function App(){
  const[logs,dispatchLog]=useReducer(logReducer,[]);
  const[step,setStep]=useState(1);const[done,setDone]=useState([]);
  const[status,setStatus]=useState('idle');
  const[parsed,setParsed]=useState(null);const[config,setConfig]=useState(null);const[results,setResults]=useState(null);

  useEffect(()=>{
    Logger.init(e=>dispatchLog({type:'ADD',payload:e}));
    Logger.head('LANDMARK AUDIT WORKBENCH v11 · datakulture / Sedin Technologies');
    Logger.info('Benford · Histogram · Threshold avoidance · Deferred expense · Vendor dormancy · Multi-select');
    Logger.sep();Logger.info('Awaiting file...');
  },[]);

  const onIngestion=useCallback((data,proceed=false)=>{setParsed(data);setStatus('ready');if(proceed){setDone(d=>[...new Set([...d,1])]);setStep(2);}},[]);
  const onConfig=useCallback(cfg=>{setConfig(cfg);Logger.sep();Logger.head('CONFIGURATION SAVED');Logger.ok('Starting both engines...');setDone(d=>[...new Set([...d,2])]);setStep(3);},[]);
  const onAnalysis=useCallback((res,proceed=false)=>{setResults(res);if(proceed){setDone(d=>[...new Set([...d,3])]);setStep(4);}},[]);
  const reconfig=useCallback(()=>{setStep(2);Logger.sep();Logger.info('Reconfiguring...');},[]);

  const render=()=>{
    if(step===1)return<UploadModule onComplete={onIngestion}/>;
    if(step===2)return<ConfigModule onReady={onConfig} isRerun={done.includes(2)}/>;
    if(step===3)return<AnalysisModule parsedData={parsed} config={config} onComplete={onAnalysis}/>;
    if(step===4)return<FindingsModule results={results} config={config} parsedData={parsed}/>;
  };

  return(<div style={{minHeight:'100vh',display:'flex',flexDirection:'column',background:T.bg}}>
    <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 24px',borderBottom:`1px solid ${T.border}`,background:T.card,boxShadow:T.sm,position:'sticky',top:0,zIndex:200,flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:34,height:34,background:T.text,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>📊</div>
        <div>
          <div style={{fontFamily:'var(--fh)',fontSize:13,fontWeight:800,color:T.text}}>Landmark Audit Workbench</div>
          <div style={{fontSize:9,color:T.dim,fontFamily:'var(--fb)',textTransform:'uppercase',letterSpacing:'0.04em'}}>v11 · Final · datakulture / Sedin</div>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:3,background:T.mid,borderRadius:28,padding:3}}>
        {STEPS.map((s,i)=>{const isDone=done.includes(s.id);const isActive=s.id===step;const clickable=s.id===2&&(isDone||(status==='ready'&&step>2));return(<React.Fragment key={s.id}>
          <button onClick={()=>clickable&&reconfig()} style={{display:'flex',alignItems:'center',gap:5,padding:'6px 14px',borderRadius:24,border:'none',cursor:clickable?'pointer':'default',fontFamily:'var(--fb)',fontSize:12,fontWeight:600,background:isActive?T.text:isDone?T.orangeLt:'transparent',color:isActive?'#fff':isDone?T.orange:T.dim,transition:'all 0.2s'}}>
            <span style={{width:16,height:16,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,background:isActive?'rgba(255,255,255,0.2)':isDone?T.orange:T.border,color:isDone?'#fff':isActive?'#fff':T.dim}}>{isDone?'✓':s.id}</span>
            {s.label}
          </button>
          {i<STEPS.length-1&&<span style={{color:T.borderHi,fontSize:10}}>›</span>}
        </React.Fragment>);})}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
        {(step===3||step===4)&&parsed&&<Btn variant="ghost" ch="⚙ Reconfigure" onClick={reconfig} style={{padding:'5px 12px',fontSize:11}}/>}
        <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:6,height:6,borderRadius:'50%',background:status==='ready'?T.green:T.dim}}/><div style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>{status==='ready'?'File loaded':'Awaiting file'}</div></div>
      </div>
    </header>
    <main style={{flex:1,padding:'20px 24px',maxWidth:1440,width:'100%',margin:'0 auto',alignSelf:'stretch',display:'flex',flexDirection:'column'}}>{render()}</main>
    <div style={{padding:'0 24px 16px',maxWidth:1440,width:'100%',margin:'0 auto',alignSelf:'stretch'}}><LogConsole logs={logs} onClear={()=>{dispatchLog({type:'CLEAR'});Logger.info('Cleared.');}}/></div>
  </div>);
}

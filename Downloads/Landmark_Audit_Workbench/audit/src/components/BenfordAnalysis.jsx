import React,{useEffect,useRef,useState,useMemo}from'react';
import{Chart,registerables}from'chart.js';
Chart.register(...registerables);

const T={orange:'#E8630A',orangeLt:'#FFF0E6',green:'#059669',red:'#DC2626',amber:'#D97706',blue:'#2563EB',text:'#111827',sub:'#6B7280',dim:'#9CA3AF',mid:'#EDE8E1',card:'#FFFFFF',border:'rgba(0,0,0,0.08)',sm:'0 1px 3px rgba(0,0,0,0.08)'};
const BENFORD=[1,2,3,4,5,6,7,8,9].map(d=>Math.log10(1+1/d)*100);

function leadingDigit(a){
  if(!a||a<=0)return null;
  const s=Math.abs(a).toFixed(2).replace('.','').replace(/^0+/,'');
  if(!s)return null;
  const d=parseInt(s[0]);
  return d>=1&&d<=9?d:null;
}

function benford(amounts){
  const counts=[0,0,0,0,0,0,0,0,0];let total=0;
  for(const a of amounts){const d=leadingDigit(a);if(d){counts[d-1]++;total++;}}
  if(!total)return null;
  const observed=counts.map(c=>(c/total)*100);
  return{
    total,counts,observed,
    chiSq:counts.reduce((s,c,i)=>{const e=BENFORD[i]/100*total;return s+(e>0?Math.pow(c-e,2)/e:0);},0),
    maxDev:Math.max(...observed.map((o,i)=>Math.abs(o-BENFORD[i]))),
  };
}

function amtOf(r){const n=Math.abs(parseFloat(r['NET AMOUNT']||0));return n>0?n:Math.max(parseFloat(r['ENTERED DR']||0),parseFloat(r['ENTERED CR']||0));}

function BenfordChart({result,title,subtitle}){
  const ref=useRef();const chart=useRef();
  useEffect(()=>{
    if(!ref.current||!result)return;
    if(chart.current){chart.current.destroy();chart.current=null;}
    const deviations=result.observed.map((o,i)=>Math.abs(o-BENFORD[i]));
    const barColors=result.observed.map((_,i)=>deviations[i]>10?'#DC262699':deviations[i]>5?'#D9770699':'#2563EB66');
    chart.current=new Chart(ref.current,{
      type:'bar',
      data:{labels:['1','2','3','4','5','6','7','8','9'],datasets:[
        {label:'Observed %',data:result.observed.map(v=>+v.toFixed(1)),backgroundColor:barColors,borderRadius:2,order:2},
        {type:'line',label:"Expected %",data:BENFORD.map(v=>+v.toFixed(1)),borderColor:'#059669',borderWidth:2,borderDash:[4,3],pointRadius:4,pointBackgroundColor:'#059669',fill:false,tension:0.3,order:1},
      ]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>{if(ctx.datasetIndex===0){const dev=Math.abs(ctx.raw-BENFORD[ctx.dataIndex]);return`Observed: ${ctx.raw.toFixed(1)}% (expected ${BENFORD[ctx.dataIndex].toFixed(1)}%, dev ${dev.toFixed(1)}pp)`;}return`Expected: ${ctx.raw.toFixed(1)}%`;},}}},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#9CA3AF'}},y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:9},color:'#9CA3AF',callback:v=>v+'%'},title:{display:true,text:'Frequency %',font:{size:9},color:'#9CA3AF'}}}},
    });
    return()=>{if(chart.current){chart.current.destroy();chart.current=null;}};
  },[result]);
  if(!result)return null;
  const riskLevel=result.maxDev>10?'HIGH':result.maxDev>5?'MEDIUM':'NORMAL';
  const rC=riskLevel==='HIGH'?T.red:riskLevel==='MEDIUM'?T.amber:T.green;
  const rBg=riskLevel==='HIGH'?'#FEF2F2':riskLevel==='MEDIUM'?'#FFFBEB':'#ECFDF5';
  return(<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:'14px 16px',boxShadow:T.sm}}>
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
      <div>
        <div style={{fontSize:13,fontWeight:600,fontFamily:'var(--fb)',color:T.text,marginBottom:3}}>{title}</div>
        <div style={{fontSize:11,color:T.sub,fontFamily:'var(--fb)'}}>{subtitle} · {result.total.toLocaleString()} amounts</div>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <div style={{textAlign:'right'}}><div style={{fontSize:10,color:T.dim,marginBottom:2,fontFamily:'var(--fb)'}}>Max deviation</div><div style={{fontFamily:'var(--fm)',fontSize:16,color:rC,fontWeight:600}}>{result.maxDev.toFixed(1)}pp</div></div>
        <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:rBg,color:rC,fontFamily:'var(--fb)'}}>{riskLevel}</span>
      </div>
    </div>
    <div style={{position:'relative',width:'100%',height:160}}><canvas ref={ref} role="img" aria-label={`Benford analysis: ${title}`}>Benford chart</canvas></div>
    <div style={{display:'flex',gap:14,marginTop:8,flexWrap:'wrap'}}>
      {[['#2563EB66','Observed'],['#059669','Expected (Benford)'],['#DC262699','Significant deviation >10pp'],['#D9770699','Moderate deviation >5pp']].map(([c,l])=>(
        <span key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:T.sub,fontFamily:'var(--fb)'}}><span style={{width:9,height:9,borderRadius:2,background:c,display:'inline-block'}}/>{l}</span>
      ))}
    </div>
    {riskLevel!=='NORMAL'&&(
      <div style={{marginTop:10,padding:'8px 12px',background:rBg,borderRadius:8,fontSize:11,color:rC,fontFamily:'var(--fb)',lineHeight:1.5}}>
        {result.observed.map((o,i)=>{
          const dev=o-BENFORD[i];if(Math.abs(dev)<=5)return null;
          const dir=dev>0?'over-represented':'under-represented';
          const note=i===0&&dev<-5?' — possible entries just above thresholds':i===8&&dev>5?' — possible just-below-threshold clustering':'';
          return<div key={i}>Digit {i+1}: {o.toFixed(1)}% observed vs {BENFORD[i].toFixed(1)}% expected ({dir} by {Math.abs(dev).toFixed(1)}pp){note}</div>;
        }).filter(Boolean)}
      </div>
    )}
  </div>);
}

export default function BenfordAnalysis({allRows,profiles,txFindings}){
  const[level,setLevel]=useState('full');
  const[selGroup,setSelGroup]=useState('PROVISION');
  const[selGL,setSelGL]=useState(null);

  const fullResult=useMemo(()=>benford(allRows.map(amtOf).filter(a=>a>0)),[allRows]);

  const groupResult=useMemo(()=>{
    const gls=new Set(profiles.filter(p=>p.meta.type===selGroup).map(p=>String(p.glCode)));
    const amounts=allRows.filter(r=>gls.has(String(parseInt(r['GL ACCOUNT CODE'])||0))).map(amtOf).filter(a=>a>0);
    return amounts.length>=30?benford(amounts):null;
  },[allRows,profiles,selGroup]);

  const acctResult=useMemo(()=>{
    if(!selGL)return null;
    const amounts=allRows.filter(r=>parseInt(r['GL ACCOUNT CODE'])===selGL).map(amtOf).filter(a=>a>0);
    return amounts.length>=50?benford(amounts):{tooFew:true,total:amounts.length};
  },[allRows,selGL]);

  const acctOptions=useMemo(()=>profiles.filter(p=>p.totalRows>=50).sort((a,b)=>b.totalRows-a.totalRows).slice(0,30),[profiles]);
  const groupTypes=['DUMMY','PENDING','CLEARING','PROVISION','ADVANCE','CWIP','IC','LOYALTY','REVENUE','CASH'];
  const sel=(id,label)=><button onClick={()=>setLevel(id)} style={{padding:'7px 16px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'var(--fb)',fontSize:12,fontWeight:600,background:level===id?T.text:'transparent',color:level===id?'#fff':T.sub,transition:'all 0.2s'}}>{label}</button>;
  const selStyle={fontSize:12,padding:'6px 10px',border:`1px solid ${T.border}`,borderRadius:8,background:T.mid,color:T.text,fontFamily:'var(--fb)',cursor:'pointer',outline:'none'};

  return(<div style={{display:'flex',flexDirection:'column',gap:16}}>
    <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',boxShadow:T.sm}}>
      <div style={{fontSize:14,fontWeight:700,fontFamily:'var(--fh)',marginBottom:6}}>Benford Analysis</div>
      <div style={{fontSize:12,color:T.sub,fontFamily:'var(--fb)',lineHeight:1.6}}>Benford's Law: in natural financial data, leading digits follow a logarithmic distribution (1 ≈ 30.1%, 2 ≈ 17.6%, … 9 ≈ 4.6%). Deviations signal possible manipulation, threshold avoidance, or fabricated entries. Manual/spreadsheet entries are especially relevant — run at full dataset, by account group, or by individual account.</div>
    </div>
    <div style={{display:'flex',gap:4,background:T.mid,borderRadius:10,padding:3,alignSelf:'flex-start'}}>{sel('full','Full dataset')}{sel('group','By group')}{sel('acct','By account')}</div>
    {level==='full'&&<BenfordChart result={fullResult} title="Full dataset — all GL entries" subtitle="All accounts, all periods"/>}
    {level==='group'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:8,alignItems:'center'}}><span style={{fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>Account group:</span><select value={selGroup} onChange={e=>setSelGroup(e.target.value)} style={selStyle}>{groupTypes.map(g=><option key={g} value={g}>{g}</option>)}</select></div>
      {groupResult?<BenfordChart result={groupResult} title={`${selGroup} accounts`} subtitle="All accounts of this type combined"/>:<div style={{padding:'16px',background:T.mid,borderRadius:10,fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>Insufficient data — need at least 30 entries for a reliable Benford result.</div>}
    </div>}
    {level==='acct'&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span style={{fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>Account (min 50 rows):</span><select value={selGL||''} onChange={e=>setSelGL(parseInt(e.target.value)||null)} style={selStyle}><option value="">Select account...</option>{acctOptions.map(p=><option key={p.glCode} value={p.glCode}>{p.glCode} — {p.meta.label} ({p.totalRows} rows)</option>)}</select></div>
      {!selGL&&<div style={{padding:'16px',background:T.mid,borderRadius:10,fontSize:12,color:T.sub,fontFamily:'var(--fb)'}}>Select an account. Only accounts with 50+ entries shown — smaller samples produce unreliable results.</div>}
      {selGL&&acctResult&&!acctResult.tooFew&&<BenfordChart result={acctResult} title={`Account ${selGL}`} subtitle={profiles.find(p=>p.glCode===selGL)?.meta.label||''}/>}
      {selGL&&acctResult?.tooFew&&<div style={{padding:'14px',background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:10,fontSize:12,color:T.amber,fontFamily:'var(--fb)'}}>Only {acctResult.total} entries — too few for reliable Benford analysis (minimum 50).</div>}
    </div>}
    <div style={{background:'#EFF6FF',border:'1px solid #BFDBFE',borderRadius:10,padding:'12px 14px',fontSize:12,color:'#1E40AF',fontFamily:'var(--fb)',lineHeight:1.6}}>
      <span style={{fontWeight:600}}>Interpretation: </span>Digit 1 under-represented → entries clustered just above 1×/10×/100× thresholds. Digit 9 over-represented → entries just below round thresholds (threshold avoidance). Digit 5–6 spike in manual entries → possible fixed or estimated amounts. Max deviation above 5pp warrants investigation; above 10pp is a strong anomaly signal.
    </div>
  </div>);
}

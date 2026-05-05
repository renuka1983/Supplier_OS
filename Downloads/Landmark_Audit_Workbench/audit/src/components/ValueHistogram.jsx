import React,{useEffect,useRef,useMemo}from'react';
import{Chart,registerables}from'chart.js';
import{HIST_BUCKETS}from'../utils/periodicEngine';
Chart.register(...registerables);

const T={orange:'#E8630A',green:'#059669',red:'#DC2626',amber:'#D97706',blue:'#2563EB',text:'#111827',sub:'#6B7280',dim:'#9CA3AF',mid:'#EDE8E1',card:'#FFFFFF',border:'rgba(0,0,0,0.08)',sm:'0 1px 3px rgba(0,0,0,0.08)'};
const fmtK=v=>v>=1000000?(v/1000000).toFixed(1)+'M':v>=1000?(v/1000).toFixed(0)+'K':Math.round(v).toLocaleString();

export default function ValueHistogram({rows,txFindings=[],config={},title='Value distribution',onBucketClick}){
  const ref=useRef();const chart=useRef();
  const flaggedJVs=useMemo(()=>new Set(txFindings.map(f=>f.jvNumber).filter(Boolean)),[txFindings]);

  const buckets=useMemo(()=>{
    const bs=HIST_BUCKETS.map(b=>({...b,drCount:0,crCount:0,drTotal:0,crTotal:0,flaggedCount:0}));
    for(const row of rows){
      const dr=parseFloat(row['ENTERED DR']||0);
      const cr=parseFloat(row['ENTERED CR']||0);
      const a=dr>0?dr:cr;if(a<=0)continue;
      const b=bs.find(bk=>a>=bk.min&&a<bk.max);if(!b)continue;
      if(dr>0){b.drCount++;b.drTotal+=dr;}
      if(cr>0){b.crCount++;b.crTotal+=cr;}
      if(flaggedJVs.has(String(row['JV VOUCHER NUMBER']||'')))b.flaggedCount++;
    }
    return bs;
  },[rows,flaggedJVs]);

  const flaggedPct=useMemo(()=>buckets.map(b=>{const t=b.drCount+b.crCount;return t>0?Math.round(b.flaggedCount/t*100):0;}),[buckets]);

  useEffect(()=>{
    if(!ref.current)return;
    if(chart.current){chart.current.destroy();chart.current=null;}
    const isThreshold=buckets.map(b=>!!b.threshold);
    chart.current=new Chart(ref.current,{
      type:'bar',
      data:{
        labels:buckets.map(b=>b.label),
        datasets:[
          {label:'DR',data:buckets.map(b=>b.drCount),backgroundColor:buckets.map((_,i)=>isThreshold[i]?'#DC262666':'#2563EB77'),borderRadius:2,borderSkipped:false},
          {label:'CR',data:buckets.map(b=>b.crCount),backgroundColor:buckets.map((_,i)=>isThreshold[i]?'#D9770666':'#05966977'),borderRadius:2,borderSkipped:false},
        ],
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        onClick:(_,els)=>{if(!els.length||!onBucketClick)return;const b=buckets[els[0].index];onBucketClick({min:b.min,max:b.max,label:b.label});},
        plugins:{legend:{display:false},tooltip:{callbacks:{
          title:items=>{const b=buckets[items[0].dataIndex];return b.label+(b.threshold?` ⚑ just-below ${fmtK(b.threshold)} threshold`:'');},
          afterBody:items=>{const i=items[0].dataIndex;const b=buckets[i];const fp=flaggedPct[i];const lines=[`DR: ${b.drCount} entries (${fmtK(b.drTotal)} BHD)`,`CR: ${b.crCount} entries (${fmtK(b.crTotal)} BHD)`];if(fp>0)lines.push(`Flagged: ${fp}% of bucket`);if(b.threshold)lines.push(`↑ Just-below-threshold — monitor for avoidance`);return lines;},
        }}},
        scales:{x:{grid:{display:false},ticks:{font:{size:9},color:'#9CA3AF',maxRotation:35,autoSkip:false}},y:{grid:{color:'rgba(0,0,0,0.04)'},ticks:{font:{size:9},color:'#9CA3AF'},title:{display:true,text:'Count',font:{size:9},color:'#9CA3AF'}}},
      },
    });
    return()=>{if(chart.current){chart.current.destroy();chart.current=null;}};
  },[buckets,flaggedPct]);

  const total=buckets.reduce((s,b)=>s+b.drCount+b.crCount,0);
  if(total===0)return null;
  const thrBkts=buckets.filter(b=>b.threshold&&(b.drCount+b.crCount)>0);

  return(<div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:'13px 16px',boxShadow:T.sm}}>
    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:8}}>
      <div>
        <div style={{fontSize:12,fontWeight:600,fontFamily:'var(--fb)',color:T.text,marginBottom:3}}>{title}</div>
        <div style={{fontSize:10,color:T.dim,fontFamily:'var(--fb)'}}>{total.toLocaleString()} entries · red/amber = just-below approval threshold · click bar to filter transactions</div>
      </div>
      {thrBkts.length>0&&<span style={{padding:'3px 10px',borderRadius:20,fontSize:10,fontWeight:700,background:'#FFFBEB',color:T.amber,fontFamily:'var(--fb)',flexShrink:0}}>⚑ Threshold-adjacent activity</span>}
    </div>
    <div style={{position:'relative',width:'100%',height:140}}><canvas ref={ref} role="img" aria-label="Value distribution histogram">Distribution chart</canvas></div>
    <div style={{display:'flex',gap:12,marginTop:8,flexWrap:'wrap'}}>
      {[['#2563EB77','DR entries'],['#05966977','CR entries'],['#DC262666','Just-below threshold (DR)'],['#D9770666','Just-below threshold (CR)']].map(([c,l])=>(
        <span key={l} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:T.sub,fontFamily:'var(--fb)'}}><span style={{width:9,height:9,borderRadius:2,background:c,display:'inline-block'}}/>{l}</span>
      ))}
    </div>
    {thrBkts.map(b=>(
      <div key={b.key} style={{marginTop:8,padding:'7px 12px',background:'#FFFBEB',border:'1px solid #FDE68A',borderRadius:8,fontSize:11,color:T.amber,fontFamily:'var(--fb)'}}>
        ⚑ {b.drCount+b.crCount} entries in {b.label} BHD — just below the {fmtK(b.threshold)} BHD approval threshold. Review for possible threshold avoidance.
      </div>
    ))}
  </div>);
}

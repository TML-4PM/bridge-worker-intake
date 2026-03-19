'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

type DropStatus = 'idle'|'submitting'|'pending'|'parsing'|'executing'|'done'|'error'|'blocked';
type BridgeCall = { label: string; fn: string; status: string; result?: string };
type JobResult = {
  status: string; intent_summary: string; intent_type: string;
  bridge_calls: BridgeCall[]; execution_log: any[]; retry_count: number;
  last_error?: string; completed_at?: string;
};
type Stats = { pending: number; done: number; error: number; today: number };

const SUPA = 'https://lzfgigiyqpuuxslsygjt.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6ZmdpZ2l5cXB1dXhzbHN5Z2p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ0MTc0NjksImV4cCI6MjA1OTk5MzQ2OX0.qUNzDEr2rxjRSClh5P4jeDv_18_yCCkFXTizJqNYSgg';
const CC = 'https://mcp-command-centre.vercel.app';
const KD = 'https://knowledge-drop-1z2rgjad9-troys-projects-t4h-machine.vercel.app';

const INTENT_META: Record<string,{label:string;color:string;bg:string}> = {
  deploy_ddl:      {label:'Deploy DDL',    color:'var(--exec)', bg:'var(--exec-bg)'},
  fire_mission:    {label:'Fire Mission',  color:'var(--done)', bg:'var(--done-bg)'},
  run_rpc:         {label:'Run RPC',       color:'var(--exec)', bg:'var(--exec-bg)'},
  register_spec:   {label:'Register Spec', color:'var(--warn)', bg:'var(--warn-bg)'},
  execute_code:    {label:'Execute Code',  color:'var(--exec)', bg:'var(--exec-bg)'},
  document:        {label:'Document',      color:'var(--text-3)',bg:'var(--surface2)'},
  mixed:           {label:'Mixed',         color:'var(--blocked)',bg:'var(--blocked-bg)'},
};

const STATUS_META: Record<string,{label:string;color:string;bg:string;bd:string}> = {
  pending:   {label:'PENDING',   color:'var(--text-3)',   bg:'var(--surface2)',    bd:'var(--border)'},
  parsing:   {label:'PARSING',   color:'var(--exec)',     bg:'var(--exec-bg)',     bd:'var(--exec-bd)'},
  executing: {label:'EXECUTING', color:'var(--done)',     bg:'var(--done-bg)',     bd:'var(--done-bd)'},
  done:      {label:'DONE',      color:'var(--done)',     bg:'var(--done-bg)',     bd:'var(--done-bd)'},
  error:     {label:'FAILED',    color:'var(--red)',      bg:'var(--red-bg)',      bd:'var(--red-bd)'},
  blocked:   {label:'BLOCKED',   color:'var(--blocked)',  bg:'var(--blocked-bg)',  bd:'#c8a8e8'},
};

const PROJECTS = ['','level23','maat','rdti','research','signal','infra','product','legal'];
const TYPE_OPTIONS = [
  {value:'instruction', label:'Instruction — natural language directive'},
  {value:'sql',         label:'SQL — DDL or query to execute'},
  {value:'payload',     label:'Payload — bridge JSON to fire'},
  {value:'spec',        label:'Spec — blueprint/architecture to register'},
  {value:'code',        label:'Code — script to blueprint'},
  {value:'mixed',       label:'Mixed — multiple types'},
];

function supa(fn: string, body: object) {
  return fetch(`${SUPA}/rest/v1/rpc/${fn}`, {
    method:'POST',
    headers:{apikey:ANON,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  }).then(r=>r.json());
}

export default function BridgeIntake() {
  const [content, setContent]   = useState('');
  const [url, setUrl]           = useState('');
  const [project, setProject]   = useState('');
  const [type, setType]         = useState('instruction');
  const [notes, setNotes]       = useState('');
  const [status, setStatus]     = useState<DropStatus>('idle');
  const [dropId, setDropId]     = useState('');
  const [result, setResult]     = useState<JobResult|null>(null);
  const [errMsg, setErrMsg]     = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [stats, setStats]       = useState<Stats|null>(null);
  const [history, setHistory]   = useState<{id:string;proj:string;chars:number;ts:string;type:string;summary?:string}[]>([]);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const fetchStats = useCallback(async () => {
    try { const d = await supa('bwd_stats',{}); if(d&&!d.error) setStats(d); } catch {}
  },[]);
  useEffect(()=>{ fetchStats(); const t=setInterval(fetchStats,15000); return ()=>clearInterval(t); },[fetchStats]);

  useEffect(()=>{
    const ta=textRef.current; if(!ta) return;
    ta.style.height='auto';
    ta.style.height=Math.max(260,ta.scrollHeight)+'px';
  },[content]);

  const startPolling = useCallback((id:string) => {
    let n=0;
    if(pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async()=>{
      n++;
      try {
        const d:any = await supa('bwd_job_status',{p_id:id});
        if(!d?.found) return;
        if(['parsing','executing'].includes(d.status)) {
          setStatus(d.status as DropStatus);
        } else if(d.status==='done') {
          clearInterval(pollRef.current!);
          setResult(d); setStatus('done'); fetchStats();
          if(typeof Notification!=='undefined'&&Notification.permission==='granted') {
            new Notification('Bridge drop executed',{body:d.intent_summary||'Completed'});
          }
        } else if(d.status==='error'||d.status==='blocked') {
          clearInterval(pollRef.current!);
          setErrMsg(d.last_error||'Failed'); setStatus(d.status as DropStatus);
        }
      } catch{}
      if(n>72) clearInterval(pollRef.current!);
    },5000);
  },[fetchStats]);

  useEffect(()=>()=>{ if(pollRef.current) clearInterval(pollRef.current); },[]);

  const handleDrop = useCallback((e:React.DragEvent)=>{
    e.preventDefault(); setDragOver(false);
    const d=e.dataTransfer.getData('text/plain'); if(d) setContent(p=>p?p+'\n\n'+d:d);
    const u=e.dataTransfer.getData('text/uri-list'); if(u&&!url) setUrl(u.split('\n')[0].trim());
  },[url]);

  const reset = ()=>{
    if(pollRef.current) clearInterval(pollRef.current);
    setContent(''); setUrl(''); setProject(''); setNotes(''); setType('instruction');
    setStatus('idle'); setDropId(''); setResult(null); setErrMsg('');
    setTimeout(()=>textRef.current?.focus(),50);
  };

  const submit = async ()=>{
    if(!content.trim()||status==='submitting') return;
    if(typeof Notification!=='undefined'&&Notification.permission==='default') Notification.requestPermission();
    setStatus('submitting');
    try {
      const r = await fetch('/api/drop',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({raw_content:content,source_url:url||null,project:project||null,content_type:type,notes:notes||null}),
      });
      const d = await r.json();
      if(!r.ok||d.error) throw new Error(d.error||'failed');
      setDropId(d.id); setStatus('pending');
      setHistory(h=>[{id:d.id,proj:project||'—',chars:content.length,ts:new Date().toLocaleTimeString(),type},...h].slice(0,8));
      startPolling(d.id); fetchStats();
    } catch(e:any){ setErrMsg(e.message); setStatus('error'); }
  };

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{ if((e.metaKey||e.ctrlKey)&&e.key==='Enter') submit(); };
    window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h);
  });

  const sm = status!=='idle'&&status!=='error'&&STATUS_META[status];
  const isWorking = ['submitting','pending','parsing','executing'].includes(status);
  const im = result?.intent_type ? INTENT_META[result.intent_type] : null;

  const I = (x:object={})=>({
    background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--r)',
    padding:'9px 11px',fontFamily:'var(--mono)',fontSize:'12px',color:'var(--text)',
    outline:'none',width:'100%',transition:'border-color .12s,box-shadow .12s',...x,
  });
  const focus=(e:any)=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.boxShadow='0 0 0 3px rgba(17,17,17,0.06)'};
  const blur=(e:any)=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.boxShadow='none'};

  return (
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column'}}>

      {/* Header */}
      <header style={{background:'var(--surface)',borderBottom:'1px solid var(--border)',padding:'0 24px',display:'flex',alignItems:'center',boxShadow:'var(--sh)',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'13px 0',borderRight:'1px solid var(--border)',paddingRight:'20px',marginRight:'20px'}}>
          <div style={{width:'8px',height:'8px',background:'var(--exec)',borderRadius:'1px'}}/>
          <span style={{fontFamily:'var(--mono)',fontSize:'11px',fontWeight:600,letterSpacing:'0.1em'}}>T4H // BRIDGE WORKER INTAKE</span>
        </div>
        <span style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-4)',letterSpacing:'0.08em'}}>EXECUTION DROP ZONE v1.0</span>

        {stats && (
          <div style={{marginLeft:'24px',display:'flex',gap:'18px',alignItems:'center'}}>
            {([['var(--exec)',stats.pending||0,'PENDING'],['var(--done)',stats.done,'DONE'],['var(--text-3)',stats.today,'TODAY']] as [string,number,string][]).map(([color,val,label])=>(
              <div key={label} style={{display:'flex',gap:'4px',alignItems:'baseline'}}>
                <span style={{fontFamily:'var(--mono)',fontSize:'15px',fontWeight:700,color,lineHeight:1}}>{val}</span>
                <span style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-4)',letterSpacing:'0.08em'}}>{label}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{marginLeft:'auto',display:'flex',gap:'10px',alignItems:'center'}}>
          <a href={KD} target="_blank" rel="noreferrer"
            style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-4)',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'3px',padding:'4px 9px',textDecoration:'none',letterSpacing:'0.05em'}}>
            KNOWLEDGE ↗
          </a>
          <a href={`${CC}/knowledge`} target="_blank" rel="noreferrer"
            style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-3)',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'3px',padding:'4px 9px',textDecoration:'none',letterSpacing:'0.05em'}}>
            CC ↗
          </a>
        </div>
      </header>

      <div style={{display:'flex',flex:1}}>
        <main style={{flex:1,padding:'24px',display:'flex',flexDirection:'column',gap:'14px',minWidth:0}}>

          {/* STATUS BANNER */}
          {isWorking && (
            <div style={{animation:'fadeUp 0.2s ease',background:sm?(sm as any).bg:'var(--exec-bg)',border:`1px solid ${sm?(sm as any).bd||'var(--exec-bd)':'var(--exec-bd)'}`,borderRadius:'var(--r)',padding:'13px 16px',display:'flex',alignItems:'center',gap:'12px',boxShadow:'var(--sh)'}}>
              <span style={{width:'13px',height:'13px',border:'2px solid rgba(26,77,138,0.25)',borderTopColor:'var(--exec)',borderRadius:'50%',animation:'spin 0.8s linear infinite',flexShrink:0,display:'inline-block'}}/>
              <div style={{flex:1}}>
                <div style={{fontFamily:'var(--mono)',fontSize:'11px',fontWeight:700,color:'var(--exec)',letterSpacing:'0.1em'}}>
                  {status==='submitting'?'SUBMITTING…':status==='pending'?'QUEUED — WAITING FOR WORKER':status==='parsing'?'PARSING INTENT…':'EXECUTING BRIDGE CALLS…'}
                </div>
                {dropId && <div style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-4)',marginTop:'2px'}}>{dropId}</div>}
                {status==='pending' && <div style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-3)',marginTop:'2px'}}>Worker sweeps every 5 min · executes automatically</div>}
              </div>
            </div>
          )}

          {/* DONE */}
          {status==='done' && result && (
            <div style={{animation:'fadeUp 0.25s ease',background:'var(--done-bg)',border:'1px solid var(--done-bd)',borderRadius:'6px',overflow:'hidden',boxShadow:'0 2px 12px rgba(26,110,40,0.08)'}}>
              <div style={{background:'var(--done)',padding:'11px 16px',display:'flex',alignItems:'center',gap:'10px'}}>
                <span style={{color:'#fff',fontFamily:'var(--mono)',fontSize:'12px',fontWeight:700}}>✓ EXECUTED</span>
                {im && <span style={{fontFamily:'var(--mono)',fontSize:'10px',background:'rgba(255,255,255,0.2)',color:'#fff',padding:'2px 8px',borderRadius:'3px'}}>{im.label}</span>}
                <span style={{flex:1,fontFamily:'var(--mono)',fontSize:'10px',color:'rgba(255,255,255,0.7)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{dropId}</span>
                <button onClick={reset} style={{fontFamily:'var(--mono)',fontSize:'10px',color:'#fff',background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:'3px',padding:'3px 12px',cursor:'pointer',fontWeight:600}}>+ NEW DROP</button>
              </div>
              <div style={{padding:'16px'}}>
                {result.intent_summary && (
                  <div style={{fontFamily:'var(--sans)',fontSize:'13px',color:'var(--text-2)',lineHeight:1.6,marginBottom:'14px',padding:'10px 12px',background:'var(--surface)',borderRadius:'4px',border:'1px solid var(--done-bd)'}}>{result.intent_summary}</div>
                )}
                {result.bridge_calls?.length > 0 && (
                  <div style={{marginBottom:'14px'}}>
                    <div style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-4)',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:'6px'}}>Bridge Calls Executed</div>
                    {result.bridge_calls.map((c,i)=>(
                      <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'5px 0',borderBottom:'1px solid var(--border)'}}>
                        <span style={{fontFamily:'var(--mono)',fontSize:'10px',color:c.status==='ok'?'var(--done)':'var(--red)',flexShrink:0}}>{c.status==='ok'?'✓':'✗'}</span>
                        <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text-2)',flex:1}}>{c.label||c.fn}</span>
                        {c.result && <span style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-4)',maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.result}</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{display:'flex',gap:'8px',borderTop:'1px solid var(--done-bd)',paddingTop:'12px'}}>
                  <a href={`${CC}/knowledge`} target="_blank" rel="noreferrer"
                    style={{fontFamily:'var(--mono)',fontSize:'10px',fontWeight:600,color:'var(--done)',border:'1px solid var(--done)',borderRadius:'3px',padding:'5px 12px',textDecoration:'none',letterSpacing:'0.06em'}}>
                    VIEW IN CC →
                  </a>
                  {project && <a href={`${CC}/knowledge?project=${project}`} target="_blank" rel="noreferrer"
                    style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-3)',border:'1px solid var(--border)',borderRadius:'3px',padding:'5px 12px',textDecoration:'none'}}>
                    {project.toUpperCase()} →
                  </a>}
                </div>
              </div>
            </div>
          )}

          {/* ERROR / BLOCKED */}
          {(status==='error'||status==='blocked') && (
            <div style={{animation:'fadeUp 0.2s ease',background:status==='blocked'?'var(--blocked-bg)':'var(--red-bg)',border:`1px solid ${status==='blocked'?'#c8a8e8':'var(--red-bd)'}`,borderRadius:'var(--r)',padding:'12px 16px',display:'flex',alignItems:'center',gap:'12px'}}>
              <span style={{fontFamily:'var(--mono)',fontSize:'11px',fontWeight:700,color:status==='blocked'?'var(--blocked)':'var(--red)'}}>{status==='blocked'?'⊘ BLOCKED':'✗ FAILED'}</span>
              <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text-3)',flex:1}}>{errMsg}</span>
              <button onClick={reset} style={{fontFamily:'var(--mono)',fontSize:'10px',background:'none',border:'1px solid var(--border)',borderRadius:'3px',padding:'4px 12px',cursor:'pointer'}}>RETRY</button>
            </div>
          )}

          {/* FORM */}
          {(status==='idle'||status==='error'||status==='blocked') && (<>

            {/* Drop zone */}
            <div
              onDragOver={e=>{e.preventDefault();setDragOver(true)}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop}
              style={{background:'var(--surface)',border:`1.5px solid ${dragOver?'var(--exec)':'var(--border)'}`,borderRadius:'var(--r)',boxShadow:'var(--sh)',overflow:'hidden',transition:'all .12s',position:'relative'}}>
              {dragOver && <div style={{position:'absolute',inset:0,background:'rgba(26,77,138,0.03)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:10,pointerEvents:'none'}}><span style={{fontFamily:'var(--mono)',fontSize:'12px',color:'var(--exec)',fontWeight:700,background:'var(--exec-bg)',padding:'8px 20px',borderRadius:'4px',border:'1px solid var(--exec-bd)'}}>DROP HERE</span></div>}
              <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 12px',borderBottom:'1px solid var(--border)',background:'var(--surface2)'}}>
                <span style={{fontFamily:'var(--mono)',fontSize:'10px',fontWeight:600,color:'var(--text-3)',letterSpacing:'0.1em'}}>CONTENT</span>
                <div style={{height:'12px',width:'1px',background:'var(--border)',margin:'0 2px'}}/>
                {content.length>0 && <span style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-4)'}}>{content.length.toLocaleString()} chars</span>}
                {content.match(/```/g)?.length &&
                  <span style={{fontFamily:'var(--mono)',fontSize:'10px',background:'var(--warn-bg)',color:'var(--warn)',border:'1px solid var(--warn-bd)',borderRadius:'3px',padding:'1px 7px'}}>
                    {(content.match(/```/g)||[]).length>>1} code block{((content.match(/```/g)||[]).length>>1)>1?'s':''}
                  </span>
                }
                {content.includes('"fn"') && <span style={{fontFamily:'var(--mono)',fontSize:'10px',background:'var(--exec-bg)',color:'var(--exec)',border:'1px solid var(--exec-bd)',borderRadius:'3px',padding:'1px 7px'}}>bridge payload</span>}
                {content.toLowerCase().includes('create table') && <span style={{fontFamily:'var(--mono)',fontSize:'10px',background:'var(--done-bg)',color:'var(--done)',border:'1px solid var(--done-bd)',borderRadius:'3px',padding:'1px 7px'}}>DDL detected</span>}
                {content && <button onClick={()=>setContent('')} style={{marginLeft:'auto',fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-4)',background:'none',border:'none',cursor:'pointer',padding:'2px 6px',borderRadius:'3px'}} onMouseEnter={e=>e.currentTarget.style.background='var(--surface3)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>clear ×</button>}
              </div>
              <textarea ref={textRef} value={content} onChange={e=>setContent(e.target.value)} autoFocus
                placeholder={"Drop execution instructions, bridge payloads, DDL, specs, or mixed content.\n\nThe worker reads intent and fires bridge calls automatically.\n\nExamples:\n— \"Deploy the CDR banking schema and register Lambda in mcp_lambda_registry\"\n— {\"fn\":\"t4h-orchestrator\",\"action\":\"submit_mission\",...}\n— CREATE TABLE IF NOT EXISTS ...\n— Activate the 9 daily missions and run bootstrap now"}
                style={{width:'100%',minHeight:'260px',resize:'none',overflow:'hidden',background:'var(--surface)',border:'none',outline:'none',fontFamily:'var(--mono)',fontSize:'12.5px',lineHeight:'1.75',color:'var(--text)',padding:'16px 14px',display:'block'}}
              />
            </div>

            {/* Meta */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
              <div>
                <label style={{fontFamily:'var(--mono)',fontSize:'10px',letterSpacing:'0.1em',color:'var(--text-3)',fontWeight:600,display:'block',marginBottom:'5px',textTransform:'uppercase'}}>Type</label>
                <div style={{position:'relative'}}>
                  <select value={type} onChange={e=>setType(e.target.value)} style={{...I({appearance:'none' as any,cursor:'pointer',paddingRight:'28px'}),color:'var(--text)'}} onFocus={focus} onBlur={blur}>
                    {TYPE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'var(--text-4)',fontSize:'10px'}}>▾</div>
                </div>
              </div>
              <div>
                <label style={{fontFamily:'var(--mono)',fontSize:'10px',letterSpacing:'0.1em',color:'var(--text-3)',fontWeight:600,display:'block',marginBottom:'5px',textTransform:'uppercase'}}>Project</label>
                <div style={{position:'relative'}}>
                  <select value={project} onChange={e=>setProject(e.target.value)} style={{...I({appearance:'none' as any,cursor:'pointer',paddingRight:'28px',color:project?'var(--text)':'var(--text-4)'})}} onFocus={focus} onBlur={blur}>
                    {PROJECTS.map(p=><option key={p} value={p}>{p||'— none —'}</option>)}
                  </select>
                  <div style={{position:'absolute',right:'10px',top:'50%',transform:'translateY(-50%)',pointerEvents:'none',color:'var(--text-4)',fontSize:'10px'}}>▾</div>
                </div>
              </div>
              <div>
                <label style={{fontFamily:'var(--mono)',fontSize:'10px',letterSpacing:'0.1em',color:'var(--text-3)',fontWeight:600,display:'block',marginBottom:'5px',textTransform:'uppercase'}}>Source URL</label>
                <div style={{position:'relative'}}>
                  <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..." style={I()} onFocus={focus} onBlur={blur}/>
                  {!url && <button onClick={async()=>{try{const t=await navigator.clipboard.readText();if(t)setUrl(t.trim());}catch{}}} style={{position:'absolute',right:'6px',top:'50%',transform:'translateY(-50%)',fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-4)',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'3px',padding:'2px 6px',cursor:'pointer'}}>PASTE</button>}
                  {url && <button onClick={()=>setUrl('')} style={{position:'absolute',right:'6px',top:'50%',transform:'translateY(-50%)',color:'var(--text-4)',background:'none',border:'none',cursor:'pointer',fontSize:'13px',padding:'0 4px'}}>×</button>}
                </div>
              </div>
              <div>
                <label style={{fontFamily:'var(--mono)',fontSize:'10px',letterSpacing:'0.1em',color:'var(--text-3)',fontWeight:600,display:'block',marginBottom:'5px',textTransform:'uppercase'}}>Notes</label>
                <input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="optional execution context" style={I()} onFocus={focus} onBlur={blur}/>
              </div>
            </div>

            {/* Submit */}
            <div style={{display:'flex',alignItems:'center',gap:'12px',paddingTop:'2px'}}>
              <button onClick={submit} disabled={!content.trim()}
                style={{fontFamily:'var(--mono)',fontSize:'11px',fontWeight:700,letterSpacing:'0.14em',textTransform:'uppercase',
                  background:content.trim()?'var(--exec)':'var(--surface3)',
                  color:content.trim()?'#fff':'var(--text-4)',
                  border:`1.5px solid ${content.trim()?'var(--exec)':'var(--border)'}`,
                  borderRadius:'var(--r)',padding:'11px 28px',cursor:content.trim()?'pointer':'default',transition:'all .12s',boxShadow:content.trim()?'var(--sh)':'none'}}
                onMouseEnter={e=>{if(content.trim())e.currentTarget.style.background='#12367a'}}
                onMouseLeave={e=>{if(content.trim())e.currentTarget.style.background='var(--exec)'}}>
                Fire to Bridge
              </button>
              <kbd style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-4)',background:'var(--surface3)',border:'1px solid var(--border)',borderRadius:'3px',padding:'2px 6px'}}>⌘↵</kbd>
              <span style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-4)'}}>Worker sweeps every 5 min</span>
            </div>
          </>)}
        </main>

        {/* Sidebar */}
        <aside style={{width:'210px',borderLeft:'1px solid var(--border)',padding:'20px 16px',display:'flex',flexDirection:'column',gap:'12px',background:'var(--surface)',flexShrink:0}}>
          {stats && (
            <div style={{background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:'var(--r)',padding:'12px',marginBottom:'4px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginBottom:'8px'}}>
                <div><div style={{fontFamily:'var(--mono)',fontSize:'18px',fontWeight:700,color:'var(--exec)',lineHeight:1}}>{stats.done}</div><div style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-4)',letterSpacing:'0.1em',marginTop:'2px'}}>EXECUTED</div></div>
                <div><div style={{fontFamily:'var(--mono)',fontSize:'18px',fontWeight:700,color:'var(--text-3)',lineHeight:1}}>{stats.today}</div><div style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-4)',letterSpacing:'0.1em',marginTop:'2px'}}>TODAY</div></div>
              </div>
              {stats.pending>0&&<div style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--exec)',fontWeight:500}}>⟳ {stats.pending} in queue</div>}
              {stats.error>0&&<div style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--red)',fontWeight:500}}>✗ {stats.error} errored</div>}
            </div>
          )}

          <div style={{fontFamily:'var(--mono)',fontSize:'10px',fontWeight:700,color:'var(--text-3)',letterSpacing:'0.12em',textTransform:'uppercase'}}>Recent Drops</div>
          {history.length===0
            ? <div style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text-4)'}}>Nothing yet</div>
            : history.map(h=>(
              <div key={h.id} style={{animation:'fadeUp 0.2s ease',borderLeft:'2px solid var(--exec-bd)',paddingLeft:'10px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'5px',marginBottom:'2px'}}>
                  <span style={{fontFamily:'var(--mono)',fontSize:'10px',background:'var(--exec-bg)',color:'var(--exec)',border:'1px solid var(--exec-bd)',borderRadius:'2px',padding:'0 5px'}}>{h.type}</span>
                  <span style={{fontFamily:'var(--mono)',fontSize:'11px',color:'var(--text)',fontWeight:500}}>{h.proj}</span>
                </div>
                {h.summary && <div style={{fontFamily:'var(--sans)',fontSize:'11px',color:'var(--text-3)',lineHeight:1.4}}>{h.summary.slice(0,50)}…</div>}
                <div style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-4)',marginTop:'2px'}}>{h.chars.toLocaleString()} chars · {h.ts}</div>
              </div>
            ))
          }

          <div style={{marginTop:'auto',borderTop:'1px solid var(--border)',paddingTop:'14px'}}>
            <div style={{fontFamily:'var(--mono)',fontSize:'10px',fontWeight:700,color:'var(--text-3)',letterSpacing:'0.12em',textTransform:'uppercase',marginBottom:'8px'}}>Worker does</div>
            {['Parse intent','Extract calls','Execute via bridge','Log results','Notify on done'].map(s=>(
              <div key={s} style={{display:'flex',alignItems:'center',gap:'7px',marginBottom:'5px'}}>
                <div style={{width:'5px',height:'5px',borderRadius:'50%',background:'var(--exec)',flexShrink:0}}/>
                <span style={{fontFamily:'var(--mono)',fontSize:'10px',color:'var(--text-3)'}}>{s}</span>
              </div>
            ))}
            <p style={{fontFamily:'var(--mono)',fontSize:'9px',color:'var(--text-4)',lineHeight:1.7,marginTop:'10px'}}>Sweeps every 5 min.<br/>Browser notif on done.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

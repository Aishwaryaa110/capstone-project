import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { BookOpen, LayoutDashboard, MessageCircle, Trophy, Users, Search, Plus, LogOut, Bell, Sparkles, CheckCircle2, Clock3, ShieldCheck, Send, X, Menu, GraduationCap } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const subjects = ['Computer Networks','DBMS','Operating Systems','Machine Learning','Artificial Intelligence','Data Structures','Mathematics','Software Engineering'];
async function request(path, token, options={}) {
  const r = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`} : {}), ...(options.headers||{}) } });
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}
function App(){
  const [token,setToken]=useState(localStorage.getItem('pl_token')||'');
  const [user,setUser]=useState(JSON.parse(localStorage.getItem('pl_user')||'null'));
  const [page,setPage]=useState('Overview');
  const [doubts,setDoubts]=useState([]);
  const [leaders,setLeaders]=useState([]);
  const [stats,setStats]=useState(null);
  const [query,setQuery]=useState('');
  const [subject,setSubject]=useState('');
  const [modal,setModal]=useState(false);
  const [selected,setSelected]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [mobile,setMobile]=useState(false);
  const [notifications,setNotifications]=useState([]);
  const [unread,setUnread]=useState(0);
  const [showNotifications,setShowNotifications]=useState(false);

  const api = (p,o={})=>request(p,token,o);
  async function load(){
    if(!token)return;
    try {
      const [d,l]=await Promise.all([api(`/doubts?q=${encodeURIComponent(query)}${subject?`&subject=${encodeURIComponent(subject)}`:''}`),api('/leaderboard')]);
      setDoubts(d.doubts);setLeaders(l.leaderboard);
      const n=await api("/notifications");setNotifications(n.notifications);setUnread(n.unread);
      if(user?.role==='admin') setStats(await api('/admin/stats'));
    } catch(e){setError(e.message);}
  }
  useEffect(()=>{load()},[token,query,subject]);
  useEffect(()=>{
    if(!token) return;
    const socket=io(API.replace(/\/api$/, ''),{auth:{token},transports:['websocket','polling']});
    socket.on('notification',(item)=>{setNotifications(ns=>[item,...ns].slice(0,30));setUnread(n=>n+1);});
    socket.on('connect_error',(err)=>console.warn('Live notifications unavailable:',err.message));
    return ()=>socket.disconnect();
  },[token]);
  async function login(e){
    e.preventDefault();setBusy(true);setError('');
    const fd=new FormData(e.currentTarget);
    try{const d=await request('/auth/login','',{method:'POST',body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});save(d);}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function register(e){
    e.preventDefault();setBusy(true);setError('');
    const fd=new FormData(e.currentTarget);
    try{const d=await request('/auth/register','',{method:'POST',body:JSON.stringify({name:fd.get('name'),email:fd.get('email'),password:fd.get('password'),subjects:[fd.get('subject')]})});save(d);}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  function save(d){localStorage.setItem('pl_token',d.token);localStorage.setItem('pl_user',JSON.stringify(d.user));setToken(d.token);setUser(d.user)}
  function logout(){localStorage.clear();setToken('');setUser(null);setDoubts([])}
  async function createDoubt(e){
    e.preventDefault();setBusy(true);setError('');
    const fd=new FormData(e.currentTarget);
    try{await api('/doubts',{method:'POST',body:JSON.stringify({title:fd.get('title'),description:fd.get('description'),subject:fd.get('subject'),tags:fd.get('tags').split(',').map(x=>x.trim()).filter(Boolean),difficulty:fd.get('difficulty'),anonymous:fd.get('anonymous')==='on'})});setModal(false);await load();}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function openDoubt(d){try{const x=await api(`/doubts/${d.id}`);setSelected(x.doubt)}catch(e){setError(e.message)}}
  async function answer(e){
    e.preventDefault();const fd=new FormData(e.currentTarget);
    try{const x=await api(`/doubts/${selected.id}/answers`,{method:'POST',body:JSON.stringify({body:fd.get('body')})});setSelected(x.doubt);load();}
    catch(e){setError(e.message)}
  }
  async function accept(answerId){
    try{const x=await api(`/doubts/${selected.id}/accept/${answerId}`,{method:'POST'});setSelected(x.doubt);load();}
    catch(e){setError(e.message)}
  }
  async function saveProfile(e){
    e.preventDefault();setBusy(true);setError('');
    const fd=new FormData(e.currentTarget);
    try{const d=await api('/users/profile',{method:'PUT',body:JSON.stringify({name:fd.get('name'),role:fd.get('role'),subjects:fd.getAll('subjects'),topics:fd.get('topics').split(',').map(x=>x.trim()).filter(Boolean)})});setUser(d.user);localStorage.setItem('pl_user',JSON.stringify(d.user));setError('Profile updated successfully.');}
    catch(e){setError(e.message)}finally{setBusy(false)}
  }

  if(!token) return <div className="auth-shell"><div className="auth-art"><div className="brand"><span className="brand-icon"><GraduationCap/></span> peerly</div><div className="art-copy"><span className="eyebrow">YOUR CAMPUS. YOUR COMMUNITY.</span><h1>Learn better,<br/><em>together.</em></h1><p>A smarter space to ask questions, share knowledge, and grow with your peers.</p><div className="art-stats"><div><b>01</b><small>Ask without fear</small></div><div><b>02</b><small>Find your people</small></div><div><b>03</b><small>Grow your impact</small></div></div></div><div className="orb orb1"></div><div className="orb orb2"></div></div><div className="auth-form"><div className="auth-card"><div className="mobile-brand">✦ peerly</div><span className="eyebrow">WELCOME TO PEERLY</span><h2>Sign in to your space</h2><p className="muted">Your next breakthrough could start with a question.</p><form onSubmit={login}><label>Email address</label><input name="email" type="email" placeholder="you@university.edu" required/><label>Password</label><input name="password" type="password" placeholder="At least 8 characters" required/><button className="btn primary full" disabled={busy}>Sign in <span>→</span></button></form><div className="divider"><span>NEW TO PEERLY?</span></div><details><summary>Create a student account</summary><form onSubmit={register} className="register-form"><label>Full name</label><input name="name" required placeholder="Your name"/><label>University email</label><input name="email" type="email" required placeholder="you@university.edu"/><label>Password</label><input name="password" type="password" minLength="8" required placeholder="Create a password"/><label>Strongest subject</label><select name="subject">{subjects.map(s=><option>{s}</option>)}</select><button className="btn dark full" disabled={busy}>Create account →</button></form></details>{error&&<div className="error">{error}</div>}<p className="tiny center">By continuing, you agree to use this learning space respectfully.</p></div></div></div>;

  const nav=[['Overview',LayoutDashboard],['Explore doubts',MessageCircle],['Leaderboard',Trophy],['My learning',BookOpen],...(user?.role==='admin'?[['Admin panel',ShieldCheck]]:[])];
  const filtered=useMemo(()=>doubts.filter(d=>d.title.toLowerCase().includes(query.toLowerCase())),[doubts,query]);
  return <div className="app-shell">
    <aside className={`sidebar ${mobile?'show':''}`}><div className="brand"><span className="brand-icon"><GraduationCap/></span> peerly<span className="brand-dot">.</span></div><div className="workspace"><div className="workspace-icon">C</div><div><b>Campus community</b><small>Learning workspace</small></div><span className="chevron">⌄</span></div><div className="nav-label">WORKSPACE</div><nav>{nav.map(([n,I])=><button className={page===n?'active':''} onClick={()=>{setPage(n);setMobile(false)}}><I size={18}/>{n}{n==='Explore doubts'&&<span className="nav-count">{doubts.length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="upgrade"><Sparkles size={18}/><b>Keep growing</b><p>Every good answer makes your community stronger.</p><div className="progress"><i/></div><small>{user.reputation||0} reputation points</small></div><div className="profile-mini"><div className="avatar">{user.name?.[0]?.toUpperCase()}</div><div><b>{user.name}</b><small>{user.role}</small></div><button onClick={logout} title="Sign out"><LogOut size={17}/></button></div></div></aside>
    <main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setMobile(!mobile)}><Menu/></button><div className="breadcrumb">Workspace <span>/</span> <b>{page}</b></div><div className="top-actions"><span className="date-chip">✦ &nbsp; Your learning space</span><div className="notification-wrap"><button className="icon-btn" onClick={()=>setShowNotifications(!showNotifications)} title="Notifications"><Bell size={18}/>{unread>0&&<i/>}</button>{showNotifications&&<div className="notification-pop"><div className="notification-head"><b>Notifications</b><button onClick={async()=>{await api("/notifications/read-all",{method:"PATCH"});setUnread(0);setNotifications(ns=>ns.map(n=>({...n,read:true})))}}>Mark all read</button></div>{notifications.length?notifications.slice(0,8).map(n=><button className={`notification-item ${n.read?'read':''}`} onClick={async()=>{await api(`/notifications/${n._id}/read`,{method:"PATCH"});setNotifications(ns=>ns.map(x=>x._id===n._id?{...x,read:true}:x));setUnread(v=>Math.max(0,v-(n.read?0:1)));setShowNotifications(false);if(n.doubt){const d=await api(`/doubts/${n.doubt._id}`);setSelected(d.doubt)}}}><b>{n.title}</b><span>{n.message}</span><small>{new Date(n.createdAt).toLocaleString()}</small></button>):<p className="notification-empty">You're all caught up.</p>}</div>}</div><div className="avatar small">{user.name?.[0]?.toUpperCase()}</div></div></header>
      <div className="content">
        {error&&<div className="error toast" onClick={()=>setError('')}>{error} <X size={15}/></div>}
        {page==='Overview'&&<><div className="welcome-row"><div><div className="eyebrow">THURSDAY, NOVEMBER 12, 2026</div><h1>Good to see you, {user.name?.split(' ')[0]} <span className="wave">✦</span></h1><p className="muted">Curiosity looks good on you. What will you learn today?</p></div><button className="btn primary" onClick={()=>setModal(true)}><Plus size={17}/> Ask a doubt</button></div><div className="hero-banner"><div><span className="hero-tag"><Sparkles size={13}/> THE POWER OF PEER LEARNING</span><h2>One question can<br/>start something great.</h2><p>Ask freely. Help generously. Learn together.</p><button className="btn light" onClick={()=>setPage('Explore doubts')}>Explore community <span>→</span></button></div><div className="hero-graphic"><div className="graphic-ring"></div><div className="bubble b1">How does backpropagation work?</div><div className="bubble b2">I can help! ✨</div><div className="graphic-center"><GraduationCap size={46}/></div><div className="spark s1">✦</div><div className="spark s2">✧</div></div></div><div className="stat-grid"><Stat icon={MessageCircle} label="Community doubts" value={doubts.length} note="Questions shared" /><Stat icon={CheckCircle2} label="Resolved doubts" value={doubts.filter(d=>d.status==='Resolved').length} note="Learning unlocked" /><Stat icon={Trophy} label="Your reputation" value={user.reputation||0} note="Keep contributing" /><Stat icon={Users} label="Top helpers" value={leaders.length} note="Community leaders" /></div><div className="section-head"><div><h3>Recently asked</h3><p className="muted">Questions from your learning community</p></div><button className="text-btn" onClick={()=>setPage('Explore doubts')}>View all →</button></div><DoubtList doubts={doubts.slice(0,4)} onOpen={openDoubt}/></>}
        {page==='Explore doubts'&&<><div className="page-heading"><div><div className="eyebrow">COMMUNITY KNOWLEDGE</div><h1>Explore doubts</h1><p className="muted">Find a question you can answer, or learn from someone else.</p></div><button className="btn primary" onClick={()=>setModal(true)}><Plus size={17}/> Ask a doubt</button></div><div className="filters"><div className="searchbox"><Search size={17}/><input placeholder="Search questions, topics..." value={query} onChange={e=>setQuery(e.target.value)}/></div><select value={subject} onChange={e=>setSubject(e.target.value)}><option value="">All subjects</option>{subjects.map(s=><option>{s}</option>)}</select></div><DoubtList doubts={filtered} onOpen={openDoubt}/></>}
        {page==='Leaderboard'&&<><div className="page-heading"><div><div className="eyebrow">CELEBRATING GENEROSITY</div><h1>Community leaderboard</h1><p className="muted">The people making learning better for everyone.</p></div></div><div className="leaderboard">{leaders.map((l,i)=><div className="leader-row"><div className={`rank rank-${i+1}`}>{String(i+1).padStart(2,'0')}</div><div className="avatar">{l.name[0]}</div><div className="leader-info"><b>{l.name}</b><small>{l.role} · {(l.subjects||[]).slice(0,2).join(', ')}</small></div><div className="points"><Trophy size={15}/>{l.reputation} pts</div></div>)}</div></>}
        {page==='My learning'&&<><div className="page-heading"><div><div className="eyebrow">YOUR PROGRESS & EXPERTISE</div><h1>My learning profile</h1><p className="muted">Tell the community what you can help with. Your expertise improves doubt recommendations.</p></div></div><div className="stat-grid"><Stat icon={Trophy} label="Reputation points" value={user.reputation||0} note="Earn 10 when your answer is accepted"/><Stat icon={BookOpen} label="Subjects" value={user.subjects?.length||0} note="Your selected expertise"/><Stat icon={Users} label="Account type" value={user.role} note="Student or peer mentor"/><Stat icon={CheckCircle2} label="Topics listed" value={user.topics?.length||0} note="Used for matching"/></div><div className="profile-editor"><div><h3>Profile & expertise</h3><p className="muted">Keep your details accurate so relevant questions reach you.</p></div><form onSubmit={saveProfile}><label>Display name</label><input name="name" defaultValue={user.name} required/><label>Community role</label><select name="role" defaultValue={user.role==='admin'?'student':user.role}><option value="student">Student</option><option value="mentor">Peer mentor</option></select><label>Subjects you can help with</label><div className="subject-checks">{subjects.map(s=><label className="subject-option"><input type="checkbox" name="subjects" value={s} defaultChecked={(user.subjects||[]).includes(s)}/>{s}</label>)}</div><label>Specific topics / skills</label><input name="topics" defaultValue={(user.topics||[]).join(', ')} placeholder="e.g. SQL, neural networks, normalization, Python"/><button className="btn primary" disabled={busy}>Save profile <CheckCircle2 size={16}/></button></form></div><h3 className="section-title">Community questions</h3><DoubtList doubts={doubts.slice(0,3)} onOpen={openDoubt}/></>}
        {page==='Admin panel'&&<><div className="page-heading"><div><div className="eyebrow">PLATFORM CONTROL</div><h1>Admin overview</h1><p className="muted">A snapshot of your learning community.</p></div></div><div className="stat-grid"><Stat icon={Users} label="Total users" value={stats?.users??'—'} note="Registered community members"/><Stat icon={MessageCircle} label="Total doubts" value={stats?.doubts??'—'} note="Questions posted"/><Stat icon={CheckCircle2} label="Resolved" value={stats?.resolved??'—'} note="Successfully answered"/><Stat icon={Trophy} label="Resolution rate" value={`${stats?.resolutionRate??0}%`} note="Resolved / total doubts"/></div><div className="panel-note"><ShieldCheck/> Admin access is enabled for the email configured in <code>ADMIN_EMAIL</code>. Moderation API: <code>/api/admin/reports</code> (GET) and <code>/api/admin/reports/:id</code> (PATCH).</div></>}
      </div>
    </main>
    {modal&&<div className="modal-backdrop" onClick={()=>setModal(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">ASK THE COMMUNITY</span><h2>What's on your mind?</h2><p className="muted">No question is too small. That's how learning starts.</p></div><button className="icon-btn" onClick={()=>setModal(false)}><X/></button></div><form onSubmit={createDoubt}><label>Question title</label><input name="title" required maxLength="140" placeholder="e.g. Can someone explain gradient descent?"/><label>Describe your doubt</label><textarea name="description" required rows="5" placeholder="Add context, what you tried, and where you're stuck..."/><div className="form-grid"><div><label>Subject</label><select name="subject">{subjects.map(s=><option>{s}</option>)}</select></div><div><label>Difficulty</label><select name="difficulty"><option>Beginner</option><option selected>Intermediate</option><option>Advanced</option></select></div></div><label>Topic tags <span className="muted inline">(comma separated)</span></label><input name="tags" placeholder="e.g. neural networks, backpropagation"/><label className="check-label"><input type="checkbox" name="anonymous" defaultChecked/> Post anonymously <span className="muted">— your identity stays hidden from other students</span></label><button className="btn primary full" disabled={busy}>Publish doubt <Send size={16}/></button></form></div></div>}
    {selected&&<div className="modal-backdrop" onClick={()=>setSelected(null)}><div className="modal detail-modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{selected.subject} · {selected.difficulty}</span><h2>{selected.title}</h2><p className="muted">Asked by {selected.authorLabel} · {new Date(selected.createdAt).toLocaleDateString()}</p></div><button className="icon-btn" onClick={()=>setSelected(null)}><X/></button></div><p className="detail-description">{selected.description}</p><button className="text-btn" onClick={async()=>{const reason=window.prompt('Why are you reporting this doubt?');if(reason?.trim()){try{await api('/reports',{method:'POST',body:JSON.stringify({targetType:'doubt',doubtId:selected.id,reason})});alert('Report submitted for moderator review.')}catch(e){setError(e.message)}}}}>Report this doubt</button><div className="detail-meta"><span className={`status ${selected.status}`}>{selected.status}</span>{selected.assignedHelper&&<span>Suggested helper: <b>{selected.assignedHelper.name}</b></span>}</div><h3>Answers ({selected.answers.length})</h3>{selected.answers.map(a=><div className="answer-card"><div className="answer-author"><div className="avatar tiny-avatar">{a.author?.name?.[0]||'?'}</div><b>{a.author?.name||'Community member'}</b>{a.accepted&&<span className="accepted"><CheckCircle2 size={14}/> Accepted</span>}</div><p>{a.body}</p><button className="text-btn" onClick={async()=>{const reason=window.prompt('Why are you reporting this answer?');if(reason?.trim()){try{await api('/reports',{method:'POST',body:JSON.stringify({targetType:'answer',doubtId:selected.id,answerId:a.id,reason})});alert('Report submitted for moderator review.')}catch(e){setError(e.message)}}}}>Report answer</button>{!a.accepted&&<button className="text-btn" onClick={()=>accept(a.id)}>Accept answer +10 pts</button>}</div>)}{selected.status!=='Resolved'&&<form onSubmit={answer} className="answer-form"><label>Share your answer</label><textarea name="body" rows="3" required placeholder="Explain it in a way that helps someone understand..."/><button className="btn primary">Post answer <Send size={15}/></button></form>}</div></div>}
  </div>;
}
function Stat({icon:Icon,label,value,note}){return <div className="stat-card"><div className="stat-top"><span>{label}</span><Icon size={18}/></div><b className="stat-value">{value}</b><small>{note}</small></div>}
function DoubtList({doubts,onOpen}){if(!doubts.length)return <div className="empty"><div>✦</div><h3>No doubts here yet</h3><p>Be the first to start a conversation.</p></div>;return <div className="doubt-list">{doubts.map(d=><button className="doubt-card" onClick={()=>onOpen(d)}><div className="doubt-icon"><MessageCircle size={19}/></div><div className="doubt-main"><div className="doubt-tags"><span>{d.subject}</span><span className={`status ${d.status}`}>{d.status}</span></div><h3>{d.title}</h3><p>{d.description}</p><div className="doubt-footer"><span>{d.authorLabel}</span><span>·</span><span>{new Date(d.createdAt).toLocaleDateString()}</span><span>·</span><span>{d.answers.length} answers</span></div></div><span className="arrow">↗</span></button>)}</div>}
export default App;

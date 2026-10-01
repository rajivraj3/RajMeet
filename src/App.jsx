import { useEffect, useState } from 'react'
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { Activity, ArrowDownLeft, ArrowRight, CalendarDays, Check, Copy, Headphones, History, Home, LogOut, Menu, MonitorUp, Moon, Plus, Settings2, ShieldCheck, Sparkles, Sun, UserRound, UsersRound, Video, X } from 'lucide-react'
import { api, setToken } from './services/api'
import MeetingRoom from './components/MeetingRoom'
import './App.css'

const navItems = [
  { label: 'Overview', path: '/', icon: Home },
  { label: 'Meetings', path: '/meetings', icon: Video },
  { label: 'Schedule', path: '/schedule', icon: CalendarDays },
  { label: 'History', path: '/history', icon: History },
  { label: 'Profile', path: '/profile', icon: UserRound },
]

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('rajmeet-user') || 'null'))
  const [theme, setTheme] = useState(() => localStorage.getItem('rajmeet-theme') || 'light')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('rajmeet-theme', theme)
  }, [theme])

  useEffect(() => {
    if (localStorage.getItem('rajmeet-token')) {
      api.get('/auth/me').then(({ data }) => {
        setUser(data.user)
        localStorage.setItem('rajmeet-user', JSON.stringify(data.user))
      }).catch(() => {
        setToken(null)
        localStorage.removeItem('rajmeet-user')
        setUser(null)
      })
    }
  }, [])

  const signOut = async () => {
    try { await api.post('/auth/logout') } catch { /* Token expiry is handled locally. */ }
    setToken(null)
    localStorage.removeItem('rajmeet-user')
    setUser(null)
  }

  const updateUser = (nextUser) => {
    setUser(nextUser)
    localStorage.setItem('rajmeet-user', JSON.stringify(nextUser))
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" onAuth={updateUser} />} />
        <Route path="/register" element={<AuthPage mode="register" onAuth={updateUser} />} />
        <Route path="/meeting/:meetingId" element={<MeetingRoom user={user} />} />
        <Route path="/" element={<Workspace user={user} onUpdate={updateUser} onSignOut={signOut} theme={theme} setTheme={setTheme} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />}>
          <Route index element={<Dashboard user={user} />} />
          <Route path="meetings" element={<MeetingList title="Your meetings" />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="history" element={<MeetingList title="Meeting history" history />} />
          <Route path="profile" element={<ProfilePage user={user} onUpdate={updateUser} />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

function Workspace({ user, onUpdate, onSignOut, theme, setTheme, menuOpen, setMenuOpen }) {
  const location = useLocation()
  return (
    <div className="workspace">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <Link to="/" className="brand" aria-label="RajMeet home"><span className="brand-mark"><span /><span /><span /></span><span>raj<span className="brand-light">meet</span></span></Link>
        <div className="workspace-label">YOUR SPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ label, path, icon: Icon }) => <Link key={path} to={path} onClick={() => setMenuOpen(false)} className={`nav-link ${location.pathname === path ? 'active' : ''}`}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{label === 'Meetings' && <span className="nav-count">↗</span>}</Link>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="note-icon"><Sparkles size={15} /></span><p>Good conversations<br /><strong>make good things.</strong></p><div className="note-orbit orbit-one" /><div className="note-orbit orbit-two" /></div>
          <button className="nav-link quiet-link" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}><span className="theme-switch-icon">{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}</span><span>{theme === 'light' ? 'Dark appearance' : 'Light appearance'}</span></button>
          {user ? <button className="account-row" onClick={onSignOut} title="Sign out"><Avatar user={user} /><span className="account-text"><strong>{user.name}</strong><small>Personal space</small></span><LogOut size={15} /></button> : <Link className="account-row signed-out" to="/login"><span className="avatar avatar-empty"><ArrowRight size={16} /></span><span className="account-text"><strong>Sign in</strong><small>Save your meetings</small></span><ArrowRight size={15} /></Link>}
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>{navItems.find((item) => item.path === location.pathname)?.label || (location.pathname === '/profile' ? 'Profile' : 'Overview')}</strong></div>
          <div className="top-actions"><span className="status-pill">Meet. Connect. Collaborate.</span>{user ? <Avatar user={user} /> : <Link className="text-link" to="/login">Sign in <ArrowRight size={14} /></Link>}</div>
        </header>
        <Outlet context={{ user, onUpdate }} />
        <footer className="page-footer"><span>RAJMEET <span className="footer-dot">/</span> MEET. CONNECT. COLLABORATE.</span><span>Thoughtful spaces for better conversations.</span></footer>
      </main>
    </div>
  )
}

function PageHeading({ eyebrow, title, detail, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{detail && <p>{detail}</p>}</div>{action}</div>
}

function Dashboard({ user }) {
  const [meetings, setMeetings] = useState([])
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const navigate = useNavigate()
  const firstName = user?.name?.split(' ')[0] || 'there'
  const [renderedAt] = useState(() => new Date())
  const hour = renderedAt.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    const controller = new AbortController()
    api.get('/health', { signal: controller.signal }).then(({ data: health }) => {
      const databaseConnected = health.database === 'connected'
      setConnected(databaseConnected)
      if (user && databaseConnected) api.get('/meetings', { signal: controller.signal }).then(({ data }) => setMeetings(data.meetings || [])).catch(() => {})
    }).catch(() => { if (!controller.signal.aborted) setConnected(false) })
    return () => controller.abort()
  }, [user])

  const createMeeting = async () => {
    if (!user) return navigate('/login')
    try {
      const { data } = await api.post('/meetings', { title: 'A little room to think', privacy: 'anyone-with-link' })
      navigate(`/meeting/${data.meeting.meetingId}?lobby=1`)
    } catch (e) { setError(e.response?.data?.message || 'RajMeet could not reach the server. Check that the API is running.') }
  }

  const joinMeeting = (event) => {
    event.preventDefault()
    const code = joinCode.match(/RAJ-\d{3}-\d{3}/i)?.[0]
    if (!code) return setError('Enter a RajMeet code or meeting link.')
    const meetingPath = `/meeting/${encodeURIComponent(code.toUpperCase())}?lobby=1`
    navigate(user ? meetingPath : '/login', user ? undefined : { state: { from: meetingPath } })
  }

  const upcoming = meetings.filter((meeting) => meeting.status === 'scheduled').slice(0, 2)
  const recent = meetings.filter((meeting) => meeting.status === 'ended').slice(0, 3)
  const completed = meetings.filter((meeting) => meeting.status === 'ended')
  const totalMinutes = Math.round(completed.reduce((total, meeting) => total + (meeting.duration || 0), 0) / 60)
  const connectedPeople = new Set(meetings.flatMap((meeting) => (meeting.participants || []).map((participant) => participant._id || participant)))
  return <div className="page-content dashboard-content">
    <PageHeading eyebrow={`${new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(renderedAt).toUpperCase()}  /  YOUR SPACE`} title={`${greeting}, ${firstName}.`} detail="A little room for the conversations that move things forward." action={<div className="space-signal"><span className={`connection-indicator ${connected ? 'is-connected' : ''}`} /><span>{connected ? 'Meeting service online' : 'Checking your space'}</span></div>} />
    {error && <div className="inline-error" role="alert">{error}<button aria-label="Dismiss" onClick={() => setError('')}><X size={15} /></button></div>}
    <section className="launch-row" aria-label="Meeting actions">
      <button className="launch-card" onClick={createMeeting}>
        <span className="launch-orbit orbit-a" /><span className="launch-orbit orbit-b" /><span className="launch-label"><span className="live-dot" /> READY WHEN YOU ARE</span>
        <span className="launch-title">Start a<br /><em>conversation.</em></span><span className="launch-bottom"><span>Open a fresh space, instantly.</span><span className="launch-arrow"><ArrowRight size={18} /></span></span><span className="launch-glyph"><span /><span /><span /></span>
      </button>
      <div className="join-card"><div className="join-icon"><ArrowDownLeft size={18} /></div><div className="eyebrow">HAVE AN INVITE?</div><h2>Step right in.</h2><p>Paste a meeting code or link to join someone.</p><form className="join-form" onSubmit={joinMeeting}><label className="sr-only" htmlFor="join-code">Meeting code or link</label><input id="join-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="e.g. RAJ-482-731" /><button aria-label="Join meeting" type="submit"><ArrowRight size={17} /></button></form><span className="join-footnote"><ShieldCheck size={13} /> Your link stays yours</span></div>
    </section>
    {user && connected && <section className="stats-strip" aria-label="Your meeting statistics"><Stat value={String(completed.length)} label="MEETINGS COMPLETED" /><Stat value={totalMinutes ? `${totalMinutes} min` : '0 min'} label="TIME IN CONVERSATION" /><Stat value={String(meetings.filter((meeting) => meeting.status === 'scheduled').length)} label="UPCOMING SPACES" /><Stat value={String(connectedPeople.size)} label="PEOPLE CONNECTED" /></section>}
    <div className="section-rule"><span>YOUR RHYTHM</span><span className="rule-line" /><button className="subtle-button" onClick={() => navigate('/meetings')}>All meetings <ArrowRight size={14} /></button></div>
    <section className="overview-grid">
      <div className="overview-main">
        <div className="section-title-row"><div><h2>Coming up</h2><p>Spaces you’ve already made time for.</p></div><Link to="/schedule" className="small-action"><Plus size={14} /> Schedule</Link></div>
        {upcoming.length ? <div className="meeting-list">{upcoming.map((meeting) => <MeetingRow key={meeting._id} meeting={meeting} />)}</div> : <EmptyState connected={connected} kind="upcoming" />}
        <div className="section-title-row recent-title"><div><h2>Recent conversations</h2><p>Your past spaces, all in one place.</p></div><Link to="/history" className="small-action">View history <ArrowRight size={14} /></Link></div>
        {recent.length ? <div className="recent-list">{recent.map((meeting) => <MeetingRow key={meeting._id} meeting={meeting} compact />)}</div> : <EmptyState connected={connected} kind="history" />}
      </div>
      <aside className="overview-aside">
        <div className="aside-heading"><div><div className="eyebrow">A BETTER WAY TO GATHER</div><h2>Small things.<br /><em>Big difference.</em></h2></div><span className="sparkle-seal"><Sparkles size={17} /></span></div>
        <div className="feature-list"><Feature icon={Activity} title="Room to focus" detail="A calm place for the conversation." /><Feature icon={MonitorUp} title="Show, don't tell" detail="Share your screen when words fall short." /><Feature icon={Headphones} title="Just works" detail="Jump in from the browser you already have." /></div>
        <div className="connection-card"><span className={`connection-indicator ${connected ? 'is-connected' : ''}`} /><div><strong>{connected ? 'Connected to your space' : 'Waiting for your space'}</strong><small>{connected ? 'Meeting data is synced' : 'Connect MongoDB to sync your meetings'}</small></div><span className="connection-arrow"><ArrowRight size={15} /></span></div>
      </aside>
    </section>
  </div>
}

function Stat({ value, label }) { return <div className="stat-item"><strong>{value}</strong><span>{label}</span></div> }

function Feature({ icon: Icon, title, detail }) { return <div className="feature-row"><span className="feature-icon"><Icon size={17} /></span><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={14} className="feature-chevron" /></div> }

function EmptyState({ connected, kind }) {
  const upcoming = kind === 'upcoming'
  return <div className="empty-state"><span className="empty-icon">{upcoming ? <CalendarDays size={17} /> : <History size={17} />}</span><div><strong>{upcoming ? 'Nothing on the calendar.' : 'The good conversations are still ahead.'}</strong><p>{connected ? (upcoming ? 'When you schedule a space, it’ll show up here.' : 'Your conversations will find their way here.') : 'Connect MongoDB to see and save your meetings.'}</p></div>{upcoming && <Link to="/schedule" className="empty-link" aria-label="Schedule a meeting"><ArrowRight size={16} /></Link>}</div>
}

function MeetingRow({ meeting, compact = false }) {
  const date = meeting.endedAt || meeting.scheduledAt || meeting.startedAt || meeting.createdAt
  const startDate = meeting.scheduledAt || meeting.startedAt || meeting.createdAt
  const [time] = useState(() => date ? Date.parse(date) : null)
  const [startTime] = useState(() => startDate ? Date.parse(startDate) : null)
  const [endTime] = useState(() => meeting.endedAt ? Date.parse(meeting.endedAt) : null)
  const participantCount = meeting.participants?.length || 0
  const duration = meeting.duration ? `${Math.max(1, Math.round(meeting.duration / 60))} min` : 'Duration not recorded'
  const timelineLabels = { started: 'Started', joined: 'Participant joined', left: 'Participant left', 'screen-shared': 'Screen shared', ended: 'Meeting ended' }
  return <Link to={`/meeting/${meeting.meetingId}${meeting.status === 'scheduled' ? '?lobby=1' : ''}`} className={`meeting-row ${compact ? 'meeting-row-compact' : ''}`}>
    <span className={`meeting-date ${meeting.status === 'scheduled' ? 'date-upcoming' : ''}`}><strong>{time ? new Intl.DateTimeFormat('en', { day: '2-digit' }).format(time) : '--'}</strong><small>{time ? new Intl.DateTimeFormat('en', { month: 'short' }).format(time).toUpperCase() : '---'}</small></span>
    <span className="meeting-info"><strong>{meeting.title}</strong><small><span className="meeting-code">{meeting.meetingId}</span><span className="info-divider">·</span>{startTime ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(startTime) : 'Time not set'}{!compact && meeting.status === 'ended' && endTime && <> – {new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(endTime)}</>}{!compact && meeting.status !== 'scheduled' && <><span className="info-divider">·</span>{participantCount} {participantCount === 1 ? 'person' : 'people'}<span className="info-divider">·</span>{duration}</>}</small>{!compact && meeting.status === 'ended' && meeting.timeline?.length > 0 && <span className="meeting-timeline">{meeting.timeline.map((event) => timelineLabels[event.type]).filter(Boolean).join('  ·  ')}</span>}</span>
    {!compact && <span className={`meeting-status ${meeting.status === 'scheduled' ? 'status-scheduled' : ''}`}><span />{meeting.status === 'scheduled' ? 'Scheduled' : meeting.status}</span>}
    <span className="meeting-row-arrow"><ArrowRight size={16} /></span>
  </Link>
}

function MeetingList({ title, history = false }) {
  const { user } = useOutletContext()
  const navigate = useNavigate()
  const [meetings, setMeetings] = useState([])
  const [loadedFor, setLoadedFor] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!user) return
    const controller = new AbortController()
    api.get('/meetings', { signal: controller.signal }).then(({ data }) => setMeetings(data.meetings || [])).catch(() => setMeetings([])).finally(() => { if (!controller.signal.aborted) setLoadedFor(user._id) })
    return () => controller.abort()
  }, [user])
  const loading = Boolean(user && loadedFor !== user._id)
  const visible = meetings.filter((meeting) => history ? meeting.status === 'ended' : meeting.status !== 'ended')
  const copyMeeting = async (meeting) => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/meeting/${meeting.meetingId}`); setError('Invite link copied.') }
    catch { setError('Could not copy the invitation link.') }
  }
  const cancelMeeting = async (meeting) => {
    if (!window.confirm(`Cancel “${meeting.title}”?`)) return
    try {
      await api.delete(`/meetings/${encodeURIComponent(meeting.meetingId)}`)
      setMeetings((current) => current.filter((item) => item._id !== meeting._id))
      setError('Meeting cancelled.')
    } catch (e) { setError(e.response?.data?.message || 'Could not cancel this meeting.') }
  }
  return <div className="page-content"><PageHeading eyebrow={history ? 'YOUR CONVERSATIONS / ARCHIVE' : 'YOUR SPACE / MEETINGS'} title={title} detail={history ? 'A record of the spaces you’ve shared.' : 'Every scheduled and active space, in one view.'} action={!history && <Link to="/schedule" className="button button-dark"><Plus size={16} /> New meeting</Link>} />
    {error && <div className="inline-success" role="status">{error}</div>}
    {!user ? <AuthPrompt /> : loading ? <div className="loading-line"><span /> Gathering your spaces…</div> : visible.length ? <div className="full-meeting-list">{visible.map((meeting) => {
      const isHost = String(meeting.host?._id || meeting.host) === user._id
      return <div className="managed-meeting" key={meeting._id}><MeetingRow meeting={meeting} /><div className="meeting-actions"><button type="button" className="meeting-tool" onClick={() => copyMeeting(meeting)} aria-label="Copy meeting link" title="Copy invite link"><Copy size={14} /></button>{meeting.status === 'scheduled' && isHost && <><button type="button" className="meeting-tool" onClick={() => navigate('/schedule', { state: { meeting } })} aria-label="Edit scheduled meeting" title="Edit meeting"><Settings2 size={14} /></button><button type="button" className="meeting-tool tool-danger" onClick={() => cancelMeeting(meeting)} aria-label="Cancel scheduled meeting" title="Cancel meeting"><X size={14} /></button></>}</div></div>
    })}</div> : <div className="large-empty"><span className="empty-icon">{history ? <History size={20} /> : <Video size={20} />}</span><h2>{history ? 'Your story starts with a hello.' : 'Your meeting space is waiting.'}</h2><p>{history ? 'Completed conversations will appear here, ready to revisit.' : 'Create a fresh space or schedule a conversation for later.'}</p><Link to="/schedule" className="button button-dark"><Plus size={16} /> Create a meeting</Link></div>}
  </div>
}

function SchedulePage() {
  const location = useLocation()
  const navigate = useNavigate()
  const meetingToEdit = location.state?.meeting
  const [minimumTime] = useState(() => new Date(Date.now() + 60000).toISOString().slice(0, 16))
  const [title, setTitle] = useState(() => meetingToEdit?.title || '')
  const [description, setDescription] = useState(() => meetingToEdit?.description || '')
  const [scheduledAt, setScheduledAt] = useState(() => meetingToEdit?.scheduledAt ? (() => { const date = new Date(meetingToEdit.scheduledAt); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) })() : '')
  const [privacy, setPrivacy] = useState(() => meetingToEdit?.privacy || 'anyone-with-link')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const payload = { title, description, scheduledAt: new Date(scheduledAt).toISOString(), privacy }
      const { data } = meetingToEdit
        ? await api.put(`/meetings/${encodeURIComponent(meetingToEdit.meetingId)}`, payload)
        : await api.post('/meetings', payload)
      if (meetingToEdit) navigate('/meetings', { replace: true, state: null })
      else setMessage(`Your space is booked. Invite link: ${window.location.origin}/meeting/${data.meeting.meetingId}`)
      setTitle(''); setDescription(''); setScheduledAt('')
    } catch (e) { setError(e.response?.data?.message || 'Sign in and connect to RajMeet to schedule a meeting.') }
  }
  return <div className="page-content"><PageHeading eyebrow="MAKE SOME ROOM / PLANNING" title={meetingToEdit ? 'Change the plan.' : 'Make it a date.'} detail={meetingToEdit ? 'Update the time or details for this space.' : 'Pick a time. We’ll keep a space ready for you.'} />
    <div className="schedule-layout"><form className="schedule-form" onSubmit={submit}><label>What are we calling it?<input required maxLength="100" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A little room to think" /></label><label>When should we meet?<input required type="datetime-local" min={minimumTime} value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label><label>Who can join?<select value={privacy} onChange={(e) => setPrivacy(e.target.value)}><option value="anyone-with-link">Anyone with the link</option><option value="private">Host only</option></select></label><label>Anything to add? <span className="optional">OPTIONAL</span><textarea maxLength="500" rows="4" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A note for everyone joining…" /></label>{error && <div className="inline-error" role="alert">{error}</div>}{message && <div className="inline-success"><Check size={16} />{message}</div>}<button className="button button-dark" type="submit"><CalendarDays size={16} /> {meetingToEdit ? 'Update meeting' : 'Save this time'} <ArrowRight size={15} /></button></form>
      <aside className="schedule-aside"><span className="schedule-doodle"><CalendarDays size={25} /></span><div className="eyebrow">A NOTE TO FUTURE YOU</div><h2>Good things<br />are worth<br /><em>putting on<br />the calendar.</em></h2><p>Your meeting gets its own room and a shareable link. Invite people whenever you’re ready.</p></aside></div>
  </div>
}

function ProfilePage({ user, onUpdate }) {
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [avatar, setAvatar] = useState(user?.avatar || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const save = async (event) => {
    event.preventDefault(); setError(''); setMessage('')
    try {
      const { data } = await api.put('/users/profile', { name, email, avatar, ...(currentPassword && newPassword && { currentPassword, newPassword }) })
      onUpdate(data.user); setMessage('Your profile is up to date.'); setCurrentPassword(''); setNewPassword('')
    }
    catch (e) { setError(e.response?.data?.message || 'Sign in to update your profile.') }
  }
  return <div className="page-content"><PageHeading eyebrow="YOUR SPACE / ACCOUNT" title="A little about you." detail="The details people see when they join your space." />
    {user ? <form className="profile-form" onSubmit={save}><div className="profile-avatar"><Avatar user={{ ...user, avatar }} size="large" /><div><strong>Your RajMeet profile</strong><small>Member since {user.createdAt ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(Date.parse(user.createdAt)) : 'recently'}</small></div></div><label>Your name<input required maxLength="80" value={name} onChange={(e) => setName(e.target.value)} /></label><label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Profile photo URL <span className="optional">OPTIONAL</span><input type="url" maxLength="2048" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://example.com/your-photo.jpg" /></label><div className="profile-security-title">Change password</div><label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required={Boolean(newPassword)} placeholder="Only needed to change it" /></label><label>New password<input type="password" autoComplete="new-password" minLength="8" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required={Boolean(currentPassword)} placeholder="At least 8 characters" /></label>{error && <div className="inline-error">{error}</div>}{message && <div className="inline-success"><Check size={16} />{message}</div>}<button className="button button-dark">Save changes <ArrowRight size={15} /></button></form> : <AuthPrompt />}
  </div>
}

function AuthPrompt() { return <div className="large-empty"><span className="empty-icon"><UsersRound size={20} /></span><h2>Your space, your people.</h2><p>Sign in to manage your account and keep your meetings together.</p><Link to="/login" className="button button-dark">Sign in <ArrowRight size={15} /></Link></div> }

function AuthPage({ mode, onAuth }) {
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const register = mode === 'register'
  const submit = async (event) => {
    event.preventDefault(); setError('')
    if (register && password !== confirm) return setError('Those passwords don’t match yet.')
    setBusy(true)
    try { const { data } = await api.post(`/auth/${mode}`, { ...(register && { name }), email, password }); setToken(data.token); onAuth(data.user); navigate(register ? '/' : location.state?.from || '/', { replace: true }) }
    catch (e) { setError(e.response?.data?.message || 'RajMeet couldn’t connect. Please try again.') }
    finally { setBusy(false) }
  }
  return <main className="auth-shell"><Link to="/" className="brand auth-brand"><span className="brand-mark"><span /><span /><span /></span><span>raj<span className="brand-light">meet</span></span></Link><div className="auth-layout"><div className="auth-copy"><div className="eyebrow">A SPACE THAT FEELS LIKE YOURS</div><h1>Better things<br />happen <em>together.</em></h1><p>Make room for the conversations worth having.</p><div className="auth-stamp"><span><Video size={16} /></span><span><strong>Meet. Connect. Collaborate.</strong><small>Your next good conversation starts here.</small></span></div></div><form className="auth-form" onSubmit={submit}><div className="eyebrow">{register ? 'A GOOD PLACE TO START' : 'WELCOME BACK'}</div><h2>{register ? 'Create your space.' : 'Come on in.'}</h2><p>{register ? 'Make an account and bring your people together.' : 'Your space is just around the corner.'}</p>{register && <label>Your name<input autoComplete="name" required minLength="2" maxLength="80" value={name} onChange={(e) => setName(e.target.value)} placeholder="How people know you" /></label>}<label>Email address<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>Password<input type="password" autoComplete={register ? 'new-password' : 'current-password'} minLength="8" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>{register && <label>Confirm password<input type="password" autoComplete="new-password" minLength="8" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="One more time" /></label>}{error && <div className="inline-error" role="alert">{error}</div>}<button className="button button-dark auth-submit" disabled={busy}>{busy ? 'One moment…' : register ? 'Create my account' : 'Sign in'}<ArrowRight size={16} /></button><div className="auth-switch">{register ? 'Already have a space?' : 'New to RajMeet?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Make an account'}</Link></div><div className="auth-security"><ShieldCheck size={14} /> Your account is protected with encrypted credentials.</div></form></div><div className="auth-footer">RAJMEET <span>/</span> MEET. CONNECT. COLLABORATE.</div></main>
}

function Avatar({ user, initials, tone, size }) {
  const text = initials || user?.name?.split(/\s+/).slice(0, 2).map((part) => part[0]).join('') || 'RM'
  return <span className={`avatar ${tone ? `avatar-${tone}` : ''} ${size === 'large' ? 'avatar-large' : ''}`} aria-label={user?.name || 'RajMeet member'}>{user?.avatar ? <img src={user.avatar} alt="" /> : text.toUpperCase()}</span>
}

export default App
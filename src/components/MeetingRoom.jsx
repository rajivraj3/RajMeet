import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { io } from 'socket.io-client'
import { ArrowLeft, ArrowRight, Check, Copy, MessageCircle, Mic, MicOff, MonitorUp, Phone, Send, Users, Video, VideoOff, X } from 'lucide-react'
import { api } from '../services/api'
import { addOrQueueIceCandidate, flushPendingIceCandidates } from '../utils/iceCandidates.js'

const defaultIceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

function senderForKind(peer, kind) {
  return peer.getSenders().find((sender) => sender.track?.kind === kind)
    || peer.getTransceivers().find((transceiver) => transceiver.receiver.track.kind === kind)?.sender
}

function cleanupRoomResources(peerRefs, remoteStreamsRef, pendingIceRef, socketRef, shareStreamRef, localStreamRef) {
  peerRefs.current.forEach((peer) => peer.close())
  peerRefs.current.clear()
  remoteStreamsRef.current.clear()
  pendingIceRef.current.clear()
  socketRef.current?.disconnect()
  shareStreamRef.current?.getTracks().forEach((track) => track.stop())
  localStreamRef.current?.getTracks().forEach((track) => track.stop())
}

export default function MeetingRoom({ user }) {
  const { meetingId } = useParams()
  const location = useLocation()
  const userId = user?._id
  const navigate = useNavigate()
  const [meeting, setMeeting] = useState(null)
  const [displayName, setDisplayName] = useState(user?.name || '')
  const [localStream, setLocalStream] = useState(null)
  const [remotePeers, setRemotePeers] = useState([])
  const [isJoined, setIsJoined] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [panel, setPanel] = useState('')
  const [chat, setChat] = useState([])
  const [message, setMessage] = useState('')
  const [connection, setConnection] = useState('Connecting to space')
  const [error, setError] = useState('')
  const [copyState, setCopyState] = useState(false)
  const previewRef = useRef(null)
  const localVideoRef = useRef(null)
  const peerRefs = useRef(new Map())
  const remoteStreamsRef = useRef(new Map())
  const pendingIceRef = useRef(new Map())
  const rtcConfigRef = useRef({ iceServers: defaultIceServers })
  const socketRef = useRef(null)
  const localStreamRef = useRef(null)
  const messagesEndRef = useRef(null)
  const shareStreamRef = useRef(null)

  useEffect(() => {
    if (userId) api.get(`/meetings/${encodeURIComponent(meetingId)}`).then(({ data }) => setMeeting(data.meeting)).catch((e) => setError(e.response?.data?.message || 'This meeting could not be found.'))
    return () => cleanupRoomResources(peerRefs, remoteStreamsRef, pendingIceRef, socketRef, shareStreamRef, localStreamRef)
  }, [meetingId, userId])

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = localStream || null
    const video = localVideoRef.current
    if (!video) return
    video.srcObject = localStream || null
    if (localStream?.getVideoTracks().length) {
      video.play().catch(() => setError('Your camera is ready, but this browser could not start the local preview.'))
    }
  }, [localStream, isJoined])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat])

  const addPeer = useCallback((socketId, name, createOffer) => {
    if (peerRefs.current.has(socketId)) return peerRefs.current.get(socketId)
    const peer = new RTCPeerConnection(rtcConfigRef.current)
    peerRefs.current.set(socketId, peer)
    remoteStreamsRef.current.set(socketId, new MediaStream())
    const localTracks = localStreamRef.current?.getTracks() || []
    localTracks.forEach((track) => peer.addTrack(track, localStreamRef.current))
    for (const kind of ['audio', 'video']) {
      if (!localTracks.some((track) => track.kind === kind)) peer.addTransceiver(kind, { direction: 'sendrecv' })
    }
    peer.ontrack = (event) => {
      const remoteStream = remoteStreamsRef.current.get(socketId)
      if (!remoteStream) return
      if (!remoteStream.getTracks().some((track) => track.id === event.track.id)) remoteStream.addTrack(event.track)
      setRemotePeers((current) => {
        const existing = current.find((item) => item.id === socketId)
        if (existing) return current.map((item) => item.id === socketId ? { ...item, stream: remoteStream } : item)
        return [...current, { id: socketId, name, stream: remoteStream, micOn: true, cameraOn: true }]
      })
    }
    peer.onicecandidate = (event) => {
      if (event.candidate) socketRef.current?.emit('ice-candidate', { to: socketId, candidate: event.candidate })
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') setConnection('Connection failed. A TURN relay may be needed.')
      else if (peer.connectionState === 'connected') setConnection('Media connected')
      else if (peer.connectionState === 'connecting') setConnection('Connecting media')
    }
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === 'failed') setConnection('Network path failed. A TURN relay may be needed.')
      else if (peer.iceConnectionState === 'disconnected') setConnection('Network connection interrupted')
    }
    if (createOffer) peer.createOffer().then((offer) => peer.setLocalDescription(offer).then(() => socketRef.current?.emit('offer', { to: socketId, offer: peer.localDescription, name: displayName }))).catch(() => setError('Could not start a secure peer connection.'))
    return peer
  }, [displayName])

  const joinMeeting = async (event) => {
    event.preventDefault()
    setError('')
    if (!displayName.trim()) return setError('Add a name so people know you’ve arrived.')
    try {
      let stream = localStreamRef.current
      if (!stream && (cameraOn || micOn)) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: cameraOn, audio: micOn })
          localStreamRef.current = stream
          setLocalStream(stream)
        } catch (mediaError) {
          setError(mediaError.name === 'NotAllowedError' ? 'Camera or microphone access was denied. You can still join with both turned off.' : 'No camera or microphone was found. You can still join without them.')
          return
        }
      }
      const { data } = await api.post(`/meetings/${encodeURIComponent(meetingId)}/join`, { name: displayName.trim() })
      setMeeting(data.meeting)
      try {
        const { data: iceConfig } = await api.get('/ice')
        if (iceConfig.iceServers?.length) rtcConfigRef.current = iceConfig
      } catch {
        rtcConfigRef.current = { iceServers: defaultIceServers }
        setError('The TURN relay is unavailable. Calls may fail across different networks.')
      }
      setIsJoined(true)
      const socketOptions = { auth: { token: localStorage.getItem('rajmeet-token') } }
      const socket = import.meta.env.VITE_SOCKET_URL
        ? io(import.meta.env.VITE_SOCKET_URL, socketOptions)
        : io(socketOptions)
      socketRef.current = socket
      socket.on('connect', () => {
        setConnection('Connecting to people')
        socket.emit('join-room', { meetingId, name: displayName.trim(), cameraOn, micOn }, (result) => {
          if (result?.error) { setError(result.error); socket.disconnect(); setIsJoined(false) }
        })
      })
      socket.on('room-users', (participants) => {
        setConnection(participants.length ? 'People are here' : 'You’re the first to arrive')
        const participantIds = new Set(participants.map((participant) => participant.socketId))
        peerRefs.current.forEach((peer, socketId) => {
          if (participantIds.has(socketId)) return
          peer.close()
          peerRefs.current.delete(socketId)
          remoteStreamsRef.current.delete(socketId)
          pendingIceRef.current.delete(socketId)
        })
        setRemotePeers(participants.map((participant) => ({ id: participant.socketId, name: participant.name, stream: null, micOn: participant.micOn, cameraOn: participant.cameraOn })))
        participants.forEach((participant) => addPeer(participant.socketId, participant.name, true))
      })
      socket.on('user-joined', (participant) => {
        setRemotePeers((current) => current.some((peer) => peer.id === participant.socketId) ? current : [...current, { id: participant.socketId, name: participant.name, stream: null, micOn: participant.micOn, cameraOn: participant.cameraOn }])
      })
      socket.on('offer', async ({ from, offer, name }) => {
        try {
          const peer = addPeer(from, name, false)
          await peer.setRemoteDescription(new RTCSessionDescription(offer))
          await flushPendingIceCandidates(from, peer, pendingIceRef)
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          socket.emit('answer', { to: from, answer: peer.localDescription })
        } catch {
          setConnection('Could not establish the media connection')
          setError('The secure media connection could not be negotiated. Please leave and rejoin.')
        }
      })
      socket.on('answer', async ({ from, answer }) => {
        const peer = peerRefs.current.get(from)
        if (!peer) return
        try {
          await peer.setRemoteDescription(new RTCSessionDescription(answer))
          await flushPendingIceCandidates(from, peer, pendingIceRef)
        } catch {
          setConnection('Could not establish the media connection')
          setError('The other participant’s media response could not be applied. Please rejoin.')
        }
      })
      socket.on('ice-candidate', async ({ from, candidate }) => {
        try { await addOrQueueIceCandidate(from, candidate, peerRefs, pendingIceRef) }
        catch { setConnection('A network candidate could not be applied') }
      })
      socket.on('user-left', ({ socketId }) => {
        peerRefs.current.get(socketId)?.close()
        peerRefs.current.delete(socketId)
        remoteStreamsRef.current.delete(socketId)
        pendingIceRef.current.delete(socketId)
        setRemotePeers((current) => current.filter((peer) => peer.id !== socketId))
        setConnection('Someone just left')
      })
      socket.on('participant-updated', ({ socketId, cameraOn: nextCamera, micOn: nextMic }) => setRemotePeers((current) => current.map((peer) => peer.id === socketId ? { ...peer, cameraOn: nextCamera, micOn: nextMic } : peer)))
      socket.on('receive-message', (incoming) => setChat((current) => [...current, incoming]))
      socket.on('connect_error', () => { setConnection('Signaling unavailable'); setError('The meeting signal was interrupted. Check your connection and rejoin.') })
      api.get(`/meetings/${encodeURIComponent(meetingId)}/messages`).then(({ data: messages }) => setChat(messages.messages || [])).catch(() => {})
    } catch (e) {
      setError(e.response?.data?.message || 'This meeting could not be joined. Check the link and try again.')
    }
  }

  const toggleMedia = async (kind) => {
    const isCamera = kind === 'camera'
    const next = isCamera ? !cameraOn : !micOn
    let track = localStreamRef.current?.getTracks().find((item) => item.kind === (isCamera ? 'video' : 'audio'))
    if (next && !track) {
      try {
        const deviceStream = await navigator.mediaDevices.getUserMedia({ video: isCamera, audio: !isCamera })
        track = deviceStream.getTracks()[0]
        const stream = localStreamRef.current || deviceStream
        if (localStreamRef.current) stream.addTrack(track)
        localStreamRef.current = stream
        setLocalStream(stream)
        peerRefs.current.forEach((peer) => {
          const sender = senderForKind(peer, track.kind)
          if (sender) sender.replaceTrack(track)
          else peer.addTrack(track, stream)
        })
      } catch {
        setError(`Could not turn on your ${isCamera ? 'camera' : 'microphone'}. Check its browser permission.`)
        return
      }
    }
    if (track) track.enabled = next
    if (isCamera) setCameraOn(next); else setMicOn(next)
    socketRef.current?.emit('participant-updated', { cameraOn: isCamera ? next : cameraOn, micOn: isCamera ? micOn : next })
  }

  const stopSharing = async () => {
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null
    const replacements = [...peerRefs.current.values()].map((peer) => senderForKind(peer, 'video')?.replaceTrack(cameraTrack))
    await Promise.all(replacements.filter(Boolean))
    shareStreamRef.current?.getTracks().forEach((track) => track.stop())
    shareStreamRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current
    setSharing(false)
    socketRef.current?.emit('screen-share-stopped')
  }

  const shareScreen = async () => {
    try {
      if (sharing) {
        await stopSharing()
      } else {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
        shareStreamRef.current = stream
        const track = stream.getVideoTracks()[0]
        await Promise.all([...peerRefs.current.values()].map((peer) => senderForKind(peer, 'video')?.replaceTrack(track)))
        if (localVideoRef.current) localVideoRef.current.srcObject = stream
        track.onended = () => { stopSharing().catch(() => setSharing(false)) }
        setSharing(true)
        socketRef.current?.emit('screen-share-started')
      }
    } catch (e) { if (e.name !== 'NotAllowedError') setError('Screen sharing isn’t available in this browser.') }
  }

  const leaveMeeting = async () => {
    try { await api.post(`/meetings/${encodeURIComponent(meetingId)}/leave`) } catch { /* The socket disconnect still removes this participant. */ }
    socketRef.current?.emit('leave-room', { meetingId })
    socketRef.current?.disconnect()
    peerRefs.current.forEach((peer) => peer.close())
    peerRefs.current.clear()
    localStreamRef.current?.getTracks().forEach((track) => track.stop())
    shareStreamRef.current?.getTracks().forEach((track) => track.stop())
    navigate('/')
  }

  const sendMessage = (event) => {
    event.preventDefault()
    const text = message.trim()
    if (!text) return
    socketRef.current?.emit('send-message', { meetingId, message: text })
    setMessage('')
  }

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopyState(true); setTimeout(() => setCopyState(false), 1800) } catch { setError('Could not copy the invitation link.') }
  }

  if (!isJoined) return <main className="lobby-shell"><header className="lobby-top"><Link to="/" className="brand"><span className="brand-mark"><span /><span /><span /></span><span>raj<span className="brand-light">meet</span></span></Link><Link to="/" className="lobby-back"><ArrowLeft size={15} /> Back to your space</Link></header><div className="lobby-content"><div className="eyebrow">YOUR SPACE IS READY / {meetingId}</div><h1>Welcome to<br /><em>the space.</em></h1><p className="lobby-description">{meeting ? meeting.title : 'Finding this meeting…'}{meeting?.host?.name ? ` · hosted by ${meeting.host.name}` : ''}</p><div className="lobby-grid"><div className="lobby-preview"><video ref={previewRef} autoPlay muted playsInline /><div className="preview-overlay"><span className="preview-status"><span /> Preview</span>{localStream && <button className="preview-toggle" onClick={() => toggleMedia('camera')} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}>{cameraOn ? <Video size={16} /> : <VideoOff size={16} />}</button>}</div>{!localStream && <div className="preview-empty"><span className="preview-avatar">{displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'RM'}</span><button className="preview-enable" onClick={async () => { if (!cameraOn && !micOn) return setError('Turn on a device to preview it.'); try { const stream = await navigator.mediaDevices.getUserMedia({ video: cameraOn, audio: micOn }); localStreamRef.current = stream; setLocalStream(stream); setError('') } catch { setError('Camera or microphone access was denied. You can still join with both turned off.') } }}><Video size={15} /> Turn on camera</button></div>}<div className="preview-name">{displayName || 'You'} <span>YOU</span></div></div><form className="lobby-settings" onSubmit={joinMeeting}><div className="eyebrow">BEFORE YOU JOIN</div><h2>Ready when<br />you are.</h2><label>Your display name<input required maxLength="80" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="What should we call you?" /></label><div className="lobby-device-row"><span><Mic size={16} /> Microphone</span><button type="button" className={`toggle-pill ${micOn ? 'toggle-on' : ''}`} onClick={() => toggleMedia('mic')} aria-label={micOn ? 'Turn microphone off' : 'Turn microphone on'}><span /></button></div><div className="lobby-device-row"><span><Video size={16} /> Camera</span><button type="button" className={`toggle-pill ${cameraOn ? 'toggle-on' : ''}`} onClick={() => toggleMedia('camera')} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}><span /></button></div>{error && <div className="inline-error" role="alert">{error}{!user && <Link to="/login" state={{ from: `${location.pathname}?lobby=1` }}>Sign in to join</Link>}</div>}{!user && <Link className="lobby-invite" to="/login" state={{ from: `${location.pathname}?lobby=1` }}>Sign in to join this space</Link>}<button className="button button-dark lobby-join" disabled={!user}>Join this space <ArrowRight size={16} /></button><button type="button" className="lobby-invite" onClick={copyInvite}>{copyState ? <Check size={15} /> : <Copy size={15} />}{copyState ? 'Invite copied' : 'Copy invite link'}</button></form></div></div></main>

  return <main className="room-shell"><header className="room-top"><Link to="/" className="brand"><span className="brand-mark"><span /><span /><span /></span><span>raj<span className="brand-light">meet</span></span></Link><div className="room-title"><strong>{meeting?.title || 'A RajMeet space'}</strong><span>{meetingId}</span></div><div className={`room-status ${/failed|interrupted|unavailable/i.test(connection) ? 'room-status-error' : ''}`}><span className="status-dot" />{connection}</div><button className="room-invite" onClick={copyInvite}>{copyState ? <Check size={15} /> : <Copy size={15} />}{copyState ? 'Copied' : 'Invite'}</button></header>
    {error && <div className="room-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
    {sharing && <div className="sharing-banner"><MonitorUp size={15} /> You are sharing your screen <button onClick={shareScreen}>Stop sharing</button></div>}
    <div className={`room-content ${panel ? 'with-panel' : ''}`}><section className="video-grid" aria-label="Meeting participants"><div className={`video-tile self-tile ${cameraOn ? '' : 'video-off'}`}><video ref={localVideoRef} autoPlay muted playsInline />{!cameraOn && <div className="video-placeholder"><span>{displayName.slice(0, 2).toUpperCase()}</span></div>}<div className="tile-label">{displayName} <span>YOU</span><span className="tile-mic">{micOn ? <Mic size={13} /> : <MicOff size={13} />}</span></div></div>{remotePeers.map((peer) => <PeerTile key={peer.id} peer={peer} />)}{remotePeers.length === 0 && <div className="waiting-tile"><span className="waiting-orbit"><Users size={23} /></span><strong>You’re the first to arrive.</strong><small>Share your invite to bring everyone in.</small><button onClick={copyInvite}>{copyState ? <Check size={14} /> : <Copy size={14} />}{copyState ? 'Copied' : 'Copy invite link'}</button></div>}</section>{panel && <aside className="room-panel"><div className="panel-header"><div><span className="eyebrow">{panel === 'chat' ? 'CONVERSATION' : 'IN THIS SPACE'}</span><h2>{panel === 'chat' ? 'Messages' : `People (${remotePeers.length + 1})`}</h2></div><button className="icon-button" onClick={() => setPanel('')} aria-label="Close panel"><X size={18} /></button></div>{panel === 'chat' ? <><div className="chat-messages">{chat.map((item, index) => <div className="chat-message" key={`${item.createdAt || index}-${index}`}><strong>{item.sender?.name || item.senderName || 'A participant'}</strong><p>{item.message}</p><small>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now'}</small></div>)}{chat.length === 0 && <p className="panel-empty">Say hello. Every great conversation starts somewhere.</p>}<div ref={messagesEndRef} /></div><form className="chat-form" onSubmit={sendMessage}><input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a message…" aria-label="Write a message" /><button aria-label="Send message"><Send size={16} /></button></form></> : <div className="panel-people"><Participant name={displayName} micOn={micOn} cameraOn={cameraOn} host={Boolean(user)} />{remotePeers.map((peer) => <Participant key={peer.id} name={peer.name} micOn={peer.micOn} cameraOn={peer.cameraOn} />)}</div>}</aside>}</div>
    <nav className="meeting-controls" aria-label="Meeting controls"><button onClick={() => toggleMedia('mic')} className={`control-button ${micOn ? '' : 'control-muted'}`} aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}>{micOn ? <Mic size={18} /> : <MicOff size={18} />}<span>{micOn ? 'Mute' : 'Unmute'}</span></button><button onClick={() => toggleMedia('camera')} className={`control-button ${cameraOn ? '' : 'control-muted'}`} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}>{cameraOn ? <Video size={18} /> : <VideoOff size={18} />}<span>Camera</span></button><button onClick={shareScreen} className={`control-button ${sharing ? 'control-active' : ''}`} aria-label={sharing ? 'Stop sharing screen' : 'Share screen'}><MonitorUp size={18} /><span>{sharing ? 'Stop share' : 'Share'}</span></button><button onClick={() => setPanel(panel === 'chat' ? '' : 'chat')} className={`control-button ${panel === 'chat' ? 'control-active' : ''}`} aria-label="Open chat"><MessageCircle size={18} /><span>Chat</span></button><button onClick={() => setPanel(panel === 'people' ? '' : 'people')} className={`control-button ${panel === 'people' ? 'control-active' : ''}`} aria-label="Open participants"><Users size={18} /><span>People</span><span className="control-count">{remotePeers.length + 1}</span></button><button className="leave-button" onClick={leaveMeeting} aria-label="Leave meeting"><Phone size={17} /><span>Leave</span></button></nav>
  </main>
}

function PeerTile({ peer }) {
  const videoRef = useRef(null)
  const [playbackBlocked, setPlaybackBlocked] = useState(false)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = peer.stream || null
    if (!peer.stream) return
    video.play().then(() => setPlaybackBlocked(false)).catch((playError) => {
      if (playError.name === 'NotAllowedError') setPlaybackBlocked(true)
    })
    return () => { video.srcObject = null }
  }, [peer.stream])
  const enablePlayback = () => videoRef.current?.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true))
  return <div className={`video-tile ${!peer.cameraOn ? 'video-off' : ''}`}><video ref={videoRef} autoPlay playsInline onClick={enablePlayback} aria-label={`Video from ${peer.name}`} />{!peer.cameraOn && <div className="video-placeholder"><span>{peer.name.slice(0, 2).toUpperCase()}</span></div>}{playbackBlocked && <button className="video-playback-prompt" onClick={enablePlayback}>Tap to enable audio and video</button>}<div className="tile-label">{peer.name}<span className="tile-mic">{peer.micOn ? <Mic size={13} /> : <MicOff size={13} />}</span></div></div>
}

function Participant({ name, micOn, cameraOn, host }) { return <div className="participant-row"><span className="participant-avatar">{name.slice(0, 2).toUpperCase()}</span><span className="participant-name">{name}{host && <small>YOU</small>}</span><span className={`participant-state ${micOn ? '' : 'state-muted'}`} aria-label={micOn ? 'Microphone on' : 'Microphone off'}>{micOn ? <Mic size={14} /> : <MicOff size={14} />}</span><span className="participant-state" aria-label={cameraOn ? 'Camera on' : 'Camera off'}>{cameraOn ? <Video size={14} /> : <VideoOff size={14} />}</span></div> }
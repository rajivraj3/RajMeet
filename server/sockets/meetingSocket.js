import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import Meeting from '../models/Meeting.js'
import MeetingParticipant from '../models/MeetingParticipant.js'
import Message from '../models/Message.js'
import { addTimelineEvent, closeMeetingIfEmpty } from '../controllers/meetingController.js'

const roomMembers = new Map()

async function recordParticipantLeft(meetingId, userId) {
  const meeting = await Meeting.findOne({ meetingId: meetingId.toUpperCase() })
  if (!meeting) return
  const participant = await MeetingParticipant.findOne({ meeting: meeting._id, user: userId })
  if (participant && !participant.leftAt) {
    participant.leftAt = new Date()
    participant.duration = Math.max(0, Math.round((participant.leftAt - participant.joinedAt) / 1000))
    await participant.save()
    meeting.timeline.push({ type: 'left', user: userId })
    await meeting.save()
  }
}

export function attachMeetingSockets(io) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Sign in to join a RajMeet space.'))
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET)
      socket.data.userId = payload.sub
      socket.data.name = payload.name
      return next()
    } catch {
      return next(new Error('Your session has expired. Please sign in again.'))
    }
  })

  io.on('connection', (socket) => {
    socket.on('join-room', async ({ meetingId, cameraOn, micOn }, acknowledge = () => {}) => {
      try {
        const normalizedId = String(meetingId || '').toUpperCase()
        const meeting = await Meeting.findOne({ meetingId: normalizedId }).populate('host', 'name')
        if (!meeting) return acknowledge({ error: 'That meeting code does not exist.' })
        const user = await User.findById(socket.data.userId).select('name')
        if (!user) return acknowledge({ error: 'Your account could not be found.' })
        const isHost = String(meeting.host?._id) === user.id
        const hasJoined = meeting.participants.some((participantId) => String(participantId) === user.id)
        if (meeting.privacy === 'private' && !isHost) return acknowledge({ error: 'This space is set to host only.' })
        if (!isHost && !hasJoined) return acknowledge({ error: 'Join this space from the lobby first.' })
        socket.data.meetingId = normalizedId
        socket.data.name = user.name
        socket.join(normalizedId)
        if (!roomMembers.has(normalizedId)) roomMembers.set(normalizedId, new Map())
        const members = roomMembers.get(normalizedId)
        const existing = [...members.values()]
        const participant = { socketId: socket.id, userId: user.id, name: user.name, cameraOn: Boolean(cameraOn), micOn: Boolean(micOn) }
        members.set(socket.id, participant)
        socket.emit('room-users', existing)
        socket.to(normalizedId).emit('user-joined', participant)
        acknowledge({ meeting: { meetingId: meeting.meetingId, title: meeting.title, host: meeting.host?.name } })
      } catch (error) {
        console.error('Socket join-room failed:', error.message)
        acknowledge({ error: 'Could not join this meeting right now.' })
      }
    })

    for (const event of ['offer', 'answer', 'ice-candidate']) {
      socket.on(event, ({ to, ...payload } = {}) => {
        const recipient = io.sockets.sockets.get(to)
        if (!recipient || recipient.data.meetingId !== socket.data.meetingId) return
        recipient.emit(event, { ...payload, from: socket.id, name: socket.data.name })
      })
    }

    socket.on('participant-updated', (state) => {
      if (!socket.data.meetingId) return
      const participant = roomMembers.get(socket.data.meetingId)?.get(socket.id)
      if (participant) { participant.cameraOn = Boolean(state?.cameraOn); participant.micOn = Boolean(state?.micOn) }
      socket.to(socket.data.meetingId).emit('participant-updated', { socketId: socket.id, cameraOn: Boolean(state?.cameraOn), micOn: Boolean(state?.micOn) })
    })

    socket.on('screen-share-started', async () => {
      if (!socket.data.meetingId) return
      socket.to(socket.data.meetingId).emit('screen-share-started', { socketId: socket.id, name: socket.data.name })
      try { await addTimelineEvent(socket.data.meetingId, 'screen-shared', socket.data.userId) } catch (error) { console.error('Screen-share timeline failed:', error.message) }
    })
    socket.on('screen-share-stopped', () => {
      if (socket.data.meetingId) socket.to(socket.data.meetingId).emit('screen-share-stopped', { socketId: socket.id })
    })

    socket.on('send-message', async ({ meetingId, message } = {}) => {
      const normalizedId = String(meetingId || '').toUpperCase()
      const text = typeof message === 'string' ? message.trim().slice(0, 2000) : ''
      if (!text || !socket.data.meetingId || socket.data.meetingId !== normalizedId) return
      try {
        const meeting = await Meeting.findOne({ meetingId: normalizedId })
        if (!meeting) return
        const saved = await Message.create({ meeting: meeting._id, sender: socket.data.userId, message: text })
        await saved.populate('sender', 'name avatar')
        io.to(normalizedId).emit('receive-message', saved)
      } catch (error) { console.error('Meeting message failed:', error.message) }
    })

    const leaveRoom = async () => {
      const meetingId = socket.data.meetingId
      if (!meetingId) return
      socket.data.meetingId = null
      socket.to(meetingId).emit('user-left', { socketId: socket.id, name: socket.data.name })
      const members = roomMembers.get(meetingId)
      members?.delete(socket.id)
      socket.leave(meetingId)
      try {
        await recordParticipantLeft(meetingId, socket.data.userId)
        if (!members?.size) {
          roomMembers.delete(meetingId)
          await closeMeetingIfEmpty(meetingId)
        }
      } catch (error) { console.error('Meeting leave cleanup failed:', error.message) }
    }

    socket.on('leave-room', leaveRoom)
    socket.on('disconnect', leaveRoom)
  })
}
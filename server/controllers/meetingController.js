import { randomInt } from 'node:crypto'
import { z } from 'zod'
import Meeting from '../models/Meeting.js'
import MeetingParticipant from '../models/MeetingParticipant.js'
import Message from '../models/Message.js'

const meetingIdSchema = z.string().regex(/^RAJ-\d{3}-\d{3}$/i, 'Enter a valid RajMeet code.')
const createSchema = z.object({
  title: z.string().trim().min(1).max(100).default('A little room to think'),
  description: z.string().trim().max(500).optional().default(''),
  scheduledAt: z.string().datetime().optional(),
  privacy: z.enum(['private', 'anyone-with-link']).default('private'),
})

async function createMeetingCode() {
  let meetingId
  do {
    const group = () => String(randomInt(0, 1000)).padStart(3, '0')
    meetingId = `RAJ-${group()}-${group()}`
  } while (await Meeting.exists({ meetingId }))
  return meetingId
}

async function findMeeting(meetingId) {
  const parsedId = meetingIdSchema.safeParse(meetingId)
  if (!parsedId.success) return null
  return Meeting.findOne({ meetingId: parsedId.data.toUpperCase() })
}

export async function createMeeting(request, response) {
  const input = createSchema.parse(request.body)
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null
  if (scheduledAt && scheduledAt <= new Date()) return response.status(400).json({ message: 'Choose a time in the future.' })
  const isScheduled = Boolean(scheduledAt)
  const meeting = await Meeting.create({
    meetingId: await createMeetingCode(),
    title: input.title,
    description: input.description,
    host: request.user.id,
    status: isScheduled ? 'scheduled' : 'active',
    privacy: input.privacy,
    scheduledAt,
    startedAt: isScheduled ? null : new Date(),
    timeline: isScheduled ? [] : [{ type: 'started', user: request.user.id }],
  })
  return response.status(201).json({ meeting })
}

export async function listMeetings(request, response) {
  const meetings = await Meeting.find({ $or: [{ host: request.user.id }, { participants: request.user.id }] })
    .populate('host', 'name avatar')
    .populate('participants', 'name avatar')
    .sort({ scheduledAt: -1, updatedAt: -1 })
    .limit(100)
  return response.json({ meetings })
}

export async function getMeeting(request, response) {
  const meeting = await findMeeting(request.params.meetingId)
  if (!meeting) return response.status(404).json({ message: 'That meeting code does not exist.' })
  const isHost = String(meeting.host) === request.user.id
  const isParticipant = meeting.participants.some((participant) => String(participant) === request.user.id)
  if (meeting.privacy === 'private' && !isHost && !isParticipant) return response.status(403).json({ message: 'This space is set to host only.' })
  await meeting.populate('host', 'name avatar')
  return response.json({ meeting })
}

export async function updateMeeting(request, response) {
  const input = z.object({
    title: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    scheduledAt: z.string().datetime().optional(),
    privacy: z.enum(['private', 'anyone-with-link']).optional(),
  }).refine((value) => Object.keys(value).length > 0).parse(request.body)
  const meeting = await findMeeting(request.params.meetingId)
  if (!meeting) return response.status(404).json({ message: 'That meeting code does not exist.' })
  if (String(meeting.host) !== request.user.id) return response.status(403).json({ message: 'Only the host can edit this meeting.' })
  if (input.title !== undefined) meeting.title = input.title
  if (input.description !== undefined) meeting.description = input.description
  if (input.privacy !== undefined) meeting.privacy = input.privacy
  if (input.scheduledAt) {
    const nextDate = new Date(input.scheduledAt)
    if (nextDate <= new Date()) return response.status(400).json({ message: 'Choose a time in the future.' })
    meeting.scheduledAt = nextDate
    meeting.status = 'scheduled'
  }
  await meeting.save()
  return response.json({ meeting })
}

export async function deleteMeeting(request, response) {
  const meeting = await findMeeting(request.params.meetingId)
  if (!meeting) return response.status(404).json({ message: 'That meeting code does not exist.' })
  if (String(meeting.host) !== request.user.id) return response.status(403).json({ message: 'Only the host can cancel this meeting.' })
  await Promise.all([
    Meeting.deleteOne({ _id: meeting._id }),
    MeetingParticipant.deleteMany({ meeting: meeting._id }),
    Message.deleteMany({ meeting: meeting._id }),
  ])
  return response.json({ message: 'Meeting cancelled.' })
}

export async function joinMeeting(request, response) {
  const meeting = await findMeeting(request.params.meetingId)
  if (!meeting) return response.status(404).json({ message: 'That meeting code does not exist.' })
  const isHost = String(meeting.host) === request.user.id
  if (meeting.privacy === 'private' && !isHost) return response.status(403).json({ message: 'This space is set to host only.' })
  const previousSession = await MeetingParticipant.findOne({ meeting: meeting._id, user: request.user.id })
  const isNewSession = !previousSession || Boolean(previousSession.leftAt)
  if (meeting.status === 'ended') {
    meeting.status = 'active'
    meeting.startedAt = new Date()
    meeting.endedAt = null
    meeting.duration = 0
    meeting.timeline.push({ type: 'started', user: request.user.id })
  }
  if (!meeting.startedAt) {
    meeting.startedAt = new Date()
    meeting.timeline.push({ type: 'started', user: request.user.id })
  }
  meeting.status = 'active'
  if (!meeting.participants.some((participant) => String(participant) === request.user.id)) meeting.participants.push(request.user.id)
  if (isNewSession) meeting.timeline.push({ type: 'joined', user: request.user.id })
  const now = new Date()
  await Promise.all([
    meeting.save(),
    MeetingParticipant.findOneAndUpdate(
      { meeting: meeting._id, user: request.user.id },
      { $set: { joinedAt: now, leftAt: null, duration: 0 }, $setOnInsert: { meeting: meeting._id, user: request.user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ),
  ])
  await meeting.populate('host', 'name avatar')
  return response.json({ meeting })
}

export async function leaveMeeting(request, response) {
  const meeting = await findMeeting(request.params.meetingId)
  if (!meeting) return response.status(404).json({ message: 'That meeting code does not exist.' })
  const participant = await MeetingParticipant.findOne({ meeting: meeting._id, user: request.user.id })
  if (participant && !participant.leftAt) {
    participant.leftAt = new Date()
    participant.duration = Math.max(0, Math.round((participant.leftAt - participant.joinedAt) / 1000))
    await participant.save()
    meeting.timeline.push({ type: 'left', user: request.user.id })
    await meeting.save()
  }
  return response.json({ message: 'You left the meeting.' })
}

async function findAccessibleMeeting(meetingId, userId) {
  const meeting = await findMeeting(meetingId)
  if (!meeting) return null
  const hasAccess = String(meeting.host) === userId || meeting.participants.some((id) => String(id) === userId)
  return hasAccess ? meeting : null
}

export async function getMessages(request, response) {
  const meeting = await findAccessibleMeeting(request.params.meetingId, request.user.id)
  if (!meeting) return response.status(404).json({ message: 'This meeting is not available in your space.' })
  const messages = await Message.find({ meeting: meeting._id }).populate('sender', 'name avatar').sort({ createdAt: 1 }).limit(500)
  return response.json({ messages })
}

export async function postMessage(request, response) {
  const input = z.object({ message: z.string().trim().min(1).max(2000) }).parse(request.body)
  const meeting = await findAccessibleMeeting(request.params.meetingId, request.user.id)
  if (!meeting) return response.status(404).json({ message: 'This meeting is not available in your space.' })
  const saved = await Message.create({ meeting: meeting._id, sender: request.user.id, message: input.message })
  await saved.populate('sender', 'name avatar')
  return response.status(201).json({ message: saved })
}

export async function addTimelineEvent(meetingId, type, userId) {
  const meeting = await findMeeting(meetingId)
  if (!meeting) return
  meeting.timeline.push({ type, user: userId || undefined })
  await meeting.save()
}

export async function closeMeetingIfEmpty(meetingId) {
  const meeting = await findMeeting(meetingId)
  if (!meeting || meeting.status !== 'active') return
  const openParticipants = await MeetingParticipant.exists({ meeting: meeting._id, leftAt: null })
  if (openParticipants) return
  const endedAt = new Date()
  meeting.status = 'ended'
  meeting.endedAt = endedAt
  meeting.duration = meeting.startedAt ? Math.max(0, Math.round((endedAt - meeting.startedAt) / 1000)) : 0
  meeting.timeline.push({ type: 'ended', at: endedAt })
  await meeting.save()
}
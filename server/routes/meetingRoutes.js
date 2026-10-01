import { Router } from 'express'
import requireAuth from '../middleware/auth.js'
import asyncHandler from '../utils/asyncHandler.js'
import { createMeeting, deleteMeeting, getMeeting, getMessages, joinMeeting, leaveMeeting, listMeetings, postMessage, updateMeeting } from '../controllers/meetingController.js'

const router = Router()
router.get('/', requireAuth, asyncHandler(listMeetings))
router.post('/', requireAuth, asyncHandler(createMeeting))
router.get('/:meetingId/messages', requireAuth, asyncHandler(getMessages))
router.post('/:meetingId/messages', requireAuth, asyncHandler(postMessage))
router.post('/:meetingId/join', requireAuth, asyncHandler(joinMeeting))
router.post('/:meetingId/leave', requireAuth, asyncHandler(leaveMeeting))
router.get('/:meetingId', requireAuth, asyncHandler(getMeeting))
router.put('/:meetingId', requireAuth, asyncHandler(updateMeeting))
router.delete('/:meetingId', requireAuth, asyncHandler(deleteMeeting))

export default router
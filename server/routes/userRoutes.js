import { Router } from 'express'
import requireAuth from '../middleware/auth.js'
import asyncHandler from '../utils/asyncHandler.js'
import { getProfile, updateProfile } from '../controllers/userController.js'

const router = Router()
router.use(requireAuth)
router.get('/profile', asyncHandler(getProfile))
router.put('/profile', asyncHandler(updateProfile))

export default router
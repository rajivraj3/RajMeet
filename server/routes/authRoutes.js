import { Router } from 'express'
import asyncHandler from '../utils/asyncHandler.js'
import requireAuth from '../middleware/auth.js'
import { currentUser, login, logout, register } from '../controllers/authController.js'

const router = Router()
router.post('/register', asyncHandler(register))
router.post('/login', asyncHandler(login))
router.get('/me', requireAuth, asyncHandler(currentUser))
router.post('/logout', logout)

export default router
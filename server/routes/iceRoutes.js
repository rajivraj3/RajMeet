import { Router } from 'express'
import requireAuth from '../middleware/auth.js'
import asyncHandler from '../utils/asyncHandler.js'
import { getIceConfig } from '../controllers/iceController.js'

const router = Router()
router.get('/', requireAuth, asyncHandler(getIceConfig))

export default router
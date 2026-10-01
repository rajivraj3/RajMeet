import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import User from '../models/User.js'

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
})
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) })

function createToken(user) {
  return jwt.sign({ name: user.name }, process.env.JWT_SECRET, { subject: user.id, expiresIn: '7d' })
}

function publicUser(user) {
  return { _id: user.id, name: user.name, email: user.email, avatar: user.avatar, createdAt: user.createdAt }
}

export async function register(request, response) {
  if (!process.env.JWT_SECRET) return response.status(503).json({ message: 'Account access is not configured on this server yet.' })
  const input = registerSchema.parse(request.body)
  const email = input.email.toLowerCase()
  if (await User.exists({ email })) return response.status(409).json({ message: 'An account already uses that email address.' })
  const password = await bcrypt.hash(input.password, 12)
  try {
    const user = await User.create({ name: input.name, email, password })
    return response.status(201).json({ user: publicUser(user), token: createToken(user) })
  } catch (error) {
    if (error.code === 11000) return response.status(409).json({ message: 'An account already uses that email address.' })
    throw error
  }
}

export async function login(request, response) {
  if (!process.env.JWT_SECRET) return response.status(503).json({ message: 'Account access is not configured on this server yet.' })
  const input = loginSchema.parse(request.body)
  const user = await User.findOne({ email: input.email.toLowerCase() }).select('+password')
  if (!user || !(await bcrypt.compare(input.password, user.password))) {
    return response.status(401).json({ message: 'That email and password don’t match.' })
  }
  return response.json({ user: publicUser(user), token: createToken(user) })
}

export async function currentUser(request, response) {
  const user = await User.findById(request.user.id)
  if (!user) return response.status(401).json({ message: 'Your account is no longer available.' })
  return response.json({ user: publicUser(user) })
}

export function logout(request, response) {
  return response.json({ message: 'Signed out.' })
}
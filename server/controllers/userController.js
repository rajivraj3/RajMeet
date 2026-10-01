import bcrypt from 'bcryptjs'
import { z } from 'zod'
import User from '../models/User.js'

export async function getProfile(request, response) {
  const user = await User.findById(request.user.id)
  if (!user) return response.status(404).json({ message: 'This account could not be found.' })
  return response.json({ user: { _id: user.id, name: user.name, email: user.email, avatar: user.avatar, createdAt: user.createdAt } })
}

export async function updateProfile(request, response) {
  const input = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(254),
    avatar: z.union([z.string().trim().url().max(2048), z.literal('')]).optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(128).optional(),
  }).refine((value) => Boolean(value.currentPassword) === Boolean(value.newPassword), { message: 'Enter your current and new password together.' }).parse(request.body)
  const email = input.email.toLowerCase()
  if (await User.exists({ email, _id: { $ne: request.user.id } })) return response.status(409).json({ message: 'Another account already uses that email.' })
  const user = await User.findById(request.user.id).select('+password')
  if (!user) return response.status(404).json({ message: 'This account could not be found.' })
  user.name = input.name
  user.email = email
  if (input.avatar !== undefined) user.avatar = input.avatar
  if (input.newPassword) {
    if (!(await bcrypt.compare(input.currentPassword, user.password))) return response.status(400).json({ message: 'Your current password is incorrect.' })
    user.password = await bcrypt.hash(input.newPassword, 12)
  }
  await user.save()
  return response.json({ user: { _id: user.id, name: user.name, email: user.email, avatar: user.avatar, createdAt: user.createdAt } })
}
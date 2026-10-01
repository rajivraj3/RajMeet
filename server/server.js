import 'dotenv/config'
import http from 'node:http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import mongoose from 'mongoose'
import { Server } from 'socket.io'
import { rateLimit } from 'express-rate-limit'
import { connectDatabase } from './config/database.js'
import authRoutes from './routes/authRoutes.js'
import meetingRoutes from './routes/meetingRoutes.js'
import userRoutes from './routes/userRoutes.js'
import { attachMeetingSockets } from './sockets/meetingSocket.js'

const app = express()
const server = http.createServer(app)
const port = Number(process.env.PORT) || 5000
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((origin) => origin.trim())

if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be configured in production.')
if (!process.env.JWT_SECRET) console.warn('JWT_SECRET is not set. Configure it before signing in.')
mongoose.set('bufferCommands', false)

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: allowedOrigins, credentials: false }))
app.use(express.json({ limit: '32kb' }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }))

app.get('/api/health', (request, response) => response.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))
app.use('/api/auth', authRoutes)
app.use('/api/meetings', meetingRoutes)
app.use('/api/users', userRoutes)
app.use((request, response) => response.status(404).json({ message: 'That RajMeet route could not be found.' }))
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error)
  if (error.name === 'ZodError') return response.status(400).json({ message: error.issues[0]?.message || 'Check the details and try again.' })
  if (error.code === 11000) return response.status(409).json({ message: 'That value is already in use.' })
  if (error.name === 'ValidationError') return response.status(400).json({ message: 'Check the details and try again.' })
  if (error.name === 'CastError') return response.status(400).json({ message: 'That request contains an invalid ID.' })
  if (mongoose.connection.readyState !== 1) return response.status(503).json({ message: 'RajMeet storage is unavailable. Check the MongoDB connection.' })
  console.error('API request failed:', error.message)
  return response.status(error.status || 500).json({ message: error.status ? error.message : 'Something went wrong. Please try again.' })
})

const io = new Server(server, { cors: { origin: allowedOrigins }, maxHttpBufferSize: 1e6 })
attachMeetingSockets(io)

server.listen(port, async () => {
  console.info(`RajMeet API listening on http://localhost:${port}`)
  try { await connectDatabase() } catch (error) { console.error('MongoDB connection failed:', error.message) }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    io.close()
    server.close(() => process.exit(0))
  })
}
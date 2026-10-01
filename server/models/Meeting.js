import mongoose from 'mongoose'

const timelineEventSchema = new mongoose.Schema({
  type: { type: String, enum: ['started', 'joined', 'left', 'screen-shared', 'ended'], required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  at: { type: Date, default: Date.now },
}, { _id: false })

const meetingSchema = new mongoose.Schema({
  meetingId: { type: String, required: true, unique: true, uppercase: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['scheduled', 'active', 'ended'], default: 'active', index: true },
  privacy: { type: String, enum: ['private', 'anyone-with-link'], default: 'private' },
  scheduledAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  duration: { type: Number, default: 0 },
  timeline: { type: [timelineEventSchema], default: [] },
}, { timestamps: true })

meetingSchema.index({ host: 1, status: 1, scheduledAt: 1 })

export default mongoose.model('Meeting', meetingSchema)
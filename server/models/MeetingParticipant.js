import mongoose from 'mongoose'

const participantSchema = new mongoose.Schema({
  meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date, default: null },
  duration: { type: Number, default: 0 },
}, { timestamps: true })

participantSchema.index({ meeting: 1, user: 1 }, { unique: true })

export default mongoose.model('MeetingParticipant', participantSchema)
import mongoose from 'mongoose'

const messageSchema = new mongoose.Schema({
  meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true, index: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
}, { timestamps: { createdAt: true, updatedAt: false } })

messageSchema.index({ meeting: 1, createdAt: 1 })

export default mongoose.model('Message', messageSchema)
import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  password: { type: String, required: true, select: false },
  avatar: { type: String, default: '' },
}, { timestamps: true })

userSchema.index({ email: 1 }, { unique: true })

export default mongoose.model('User', userSchema)
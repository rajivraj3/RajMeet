import mongoose from 'mongoose'

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.warn('MONGODB_URI is not set. Data-backed routes are unavailable until MongoDB is configured.')
    return false
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 7000 })
  console.info('Connected to MongoDB.')
  return true
}
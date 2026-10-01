import axios from 'axios'

const apiBaseUrl = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({ baseURL: apiBaseUrl, timeout: 12000 })

export function setToken(token) {
  if (token) {
    localStorage.setItem('rajmeet-token', token)
    api.defaults.headers.common.Authorization = `Bearer ${token}`
  } else {
    localStorage.removeItem('rajmeet-token')
    delete api.defaults.headers.common.Authorization
  }
}

const token = localStorage.getItem('rajmeet-token')
if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`
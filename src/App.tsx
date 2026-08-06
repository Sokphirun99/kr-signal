import { Routes, Route } from 'react-router'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { AuthProvider } from '@/providers/AuthProvider'
import Home from './pages/Home'
import Signals from './pages/Signals'
import TrackRecord from './pages/TrackRecord'
import Methodology from './pages/Methodology'
import Login from './pages/Login'
import Register from './pages/Register'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signals" element={<Signals />} />
        <Route path="/track-record" element={<TrackRecord />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Analytics />
      <SpeedInsights />
    </AuthProvider>
  )
}



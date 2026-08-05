import { Routes, Route } from 'react-router'
import { Analytics } from '@vercel/analytics/react'
import Home from './pages/Home'
import Signals from './pages/Signals'
import TrackRecord from './pages/TrackRecord'
import Methodology from './pages/Methodology'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signals" element={<Signals />} />
        <Route path="/track-record" element={<TrackRecord />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Analytics />
    </>
  )
}

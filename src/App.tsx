import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { Toaster } from '@/components/ui/sonner'

const Home = lazy(() => import('./pages/Home'))
const Signals = lazy(() => import('./pages/Signals'))
const TrackRecord = lazy(() => import('./pages/TrackRecord'))
const Methodology = lazy(() => import('./pages/Methodology'))
const News = lazy(() => import('./pages/News'))

export default function App() {
  return (
    <>
      <Suspense fallback={<div className="min-h-screen bg-[#070a08] text-zinc-400 flex items-center justify-center font-mono text-sm">Loading...</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/signals" element={<Signals />} />
          <Route path="/news" element={<News />} />
          <Route path="/track-record" element={<TrackRecord />} />
          <Route path="/methodology" element={<Methodology />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      <Toaster richColors position="bottom-right" theme="dark" />
      <Analytics />
      <SpeedInsights />
    </>
  )
}

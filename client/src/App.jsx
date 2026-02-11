import { Routes, Route } from 'react-router-dom'
import ControlWindow from './pages/ControlWindow'
import DisplayWindow from './pages/DisplayWindow'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ControlWindow />} />
      <Route path="/control" element={<ControlWindow />} />
      <Route path="/display" element={<DisplayWindow />} />
    </Routes>
  )
}

export default App

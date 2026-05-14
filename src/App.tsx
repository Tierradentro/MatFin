import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import AdminPage from './pages/AdminPage'
import StudentPage from './pages/StudentPage'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/student" element={<StudentPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

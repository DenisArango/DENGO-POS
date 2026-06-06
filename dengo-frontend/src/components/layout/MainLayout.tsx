import { Outlet } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Sidebar from './Sidebar.tsx'
import Header from './Header'
import { useAppStore } from '../../store'

export default function MainLayout() {
  const { isSidebarCollapsed, toggleSidebar } = useAppStore()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Backdrop for mobile — closes sidebar when tapping outside */}
      {!isSidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <Sidebar />

      {/* Main Content — full width on mobile, offset on desktop */}
      <div className={`transition-all duration-300 ${
        isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'
      }`}>
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="p-4 md:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

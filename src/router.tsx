import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import MainLayout from './components/layout/MainLayout'
import AuthLayout from './components/layout/AuthLayout'
import LoadingScreen from './components/common/LoadingScreen'
import ProtectedRoute from './components/auth/ProtectedRoute'

// Lazy loading de páginas
const Login = lazy(() => import('./pages/Login'))
const POS = lazy(() => import('./pages/POS'))
const Products = lazy(() => import('./pages/Products'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Reports = lazy(() => import('./pages/Reports'))
const CashRegister = lazy(() => import('./pages/CashRegister'))
const Transfers = lazy(() => import('./pages/Transfers'))
const Settings = lazy(() => import('./pages/Settings'))
const Users = lazy(() => import('./pages/Users'))

// Páginas de reportes
const DailySalesReport = lazy(() => import('./pages/reports/DailySalesReport'))
const InventoryAdjustmentsReport = lazy(() => import('./pages/reports/InventoryAdjustmentsReport'))
const TopProductsReport = lazy(() => import('./pages/reports/TopProductsReport'))
const InventoryStatusReport = lazy(() => import('./pages/reports/InventoryStatusReport'))
const CashFlowReport = lazy(() => import('./pages/reports/CashFlowReport'))
const SalesByPeriodReport = lazy(() => import('./pages/reports/SalesByPeriodReport'))
const HourlySalesReport = lazy(() => import('./pages/reports/HourlySalesReport'))
const ProfitMarginsReport = lazy(() => import('./pages/reports/ProfitMarginsReport'))

export default function Router() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Rutas públicas */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
        </Route>

        {/* Rutas protegidas */}
        <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
          <Route path="/" element={<Navigate to="/pos" replace />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/products" element={<Products />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/cash-register" element={<CashRegister />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<Users />} />
          
          {/* Rutas de reportes */}
          <Route path="/reports/daily-sales" element={<DailySalesReport />} />
          <Route path="/reports/inventory-adjustments" element={<InventoryAdjustmentsReport />} />
          <Route path="/reports/top-products" element={<TopProductsReport />} />
          <Route path="/reports/inventory-status" element={<InventoryStatusReport />} />
          <Route path="/reports/cash-flow" element={<CashFlowReport />} />
          <Route path="/reports/sales-by-period" element={<SalesByPeriodReport />} />
          <Route path="/reports/hourly-sales" element={<HourlySalesReport />} />
          <Route path="/reports/profit-margins" element={<ProfitMarginsReport />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
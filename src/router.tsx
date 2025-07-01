import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import MainLayout from './components/layout/MainLayout'
import AuthLayout from './components/layout/AuthLayout'
import LoadingScreen from './components/common/LoadingScreen'
import ProtectedRoute from './components/auth/ProtectedRoute'
import StoreSelectionLogin from './components/auth/StoreSelectionLogin'
import UsersManagement from './pages/Users'
import RolesPermissions from './pages/RolesPermissions'
import StoresManagement from './pages/StoresManagment'

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
const ProductRotationReport = lazy(() => import('./pages/reports/ProductRotationReport'))
const CreditSalesReport = lazy(() => import('./pages/reports/CreditSalesReport'))
const UserActivityReport = lazy(() => import('./pages/reports/UserActivityReport'))
const InventoryMovementsReport = lazy(() => import('./pages/reports/InventoryMovementsReport'))

export default function Router() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Rutas públicas */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/select-store" element={<StoreSelectionLogin />} />
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
          <Route path="/reports/product-rotation" element={<ProductRotationReport />} />
          <Route path="/reports/credit-sales" element={<CreditSalesReport />} />
          <Route path="/reports/user-activity" element={<UserActivityReport />} />
          <Route path="/reports/inventory-movements" element={<InventoryMovementsReport />} />
          <Route path="/settings/users" element={<UsersManagement />} />
          <Route path="/settings/roles" element={<RolesPermissions />} />
          <Route path="/settings/stores" element={<StoresManagement />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
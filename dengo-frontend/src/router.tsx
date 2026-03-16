import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import MainLayout from './components/layout/MainLayout'
import AuthLayout from './components/layout/AuthLayout'
import LoadingScreen from './components/common/LoadingScreen'
import ProtectedRoute from './components/auth/ProtectedRoute'
import StoreSelectionLogin from './components/auth/StoreSelectionLogin'

// Lazy loading de páginas
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Login = lazy(() => import('./pages/Login'))
const POS = lazy(() => import('./pages/POS'))
const Products = lazy(() => import('./pages/Products'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Reports = lazy(() => import('./pages/Reports'))
const CashRegister = lazy(() => import('./pages/CashRegister'))
const Transfers = lazy(() => import('./pages/Transfers'))
const Settings = lazy(() => import('./pages/Settings'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const Purchases = lazy(() => import('./pages/Purchases'))
const Customers = lazy(() => import('./pages/Customers'))
const Quotations = lazy(() => import('./pages/Quotations'))
const SalesHistoryReport = lazy(() => import('./pages/reports/SalesHistoryReport'))

// Páginas de configuración
const UsersManagement = lazy(() => import('./pages/Users'))
const RolesPermissions = lazy(() => import('./pages/RolesPermissions'))
const StoresManagement = lazy(() => import('./pages/StoresManagment'))
const CompanySettings = lazy(() => import('./pages/settings/Company'))
const StoresSettings = lazy(() => import('./pages/settings/Stores'))
const PaymentMethodsSettings = lazy(() => import('./pages/settings/PaymentMethods'))
const NotificationsSettings = lazy(() => import('./pages/settings/Notifications'))
const BackupSettings = lazy(() => import('./pages/settings/Backup'))
const AppearanceSettings = lazy(() => import('./pages/settings/Appearance'))
const LocalizationSettings = lazy(() => import('./pages/settings/Localization'))
const SecuritySettings = lazy(() => import('./pages/settings/Security'))

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
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/products" element={<Products />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/cash-register" element={<CashRegister />} />
          <Route path="/transfers" element={<Transfers />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/quotations" element={<Quotations />} />
          <Route path="/settings" element={<Settings />} />

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
          <Route path="/reports/sales-history" element={<SalesHistoryReport />} />
          {/* Rutas de configuración */}
          <Route path="/settings/users" element={<UsersManagement />} />
          <Route path="/settings/roles" element={<RolesPermissions />} />
          <Route path="/settings/company" element={<CompanySettings />} />
          <Route path="/settings/stores" element={<StoresSettings />} />
          <Route path="/settings/payment-methods" element={<PaymentMethodsSettings />} />
          <Route path="/settings/notifications" element={<NotificationsSettings />} />
          <Route path="/settings/backup" element={<BackupSettings />} />
          <Route path="/settings/appearance" element={<AppearanceSettings />} />
          <Route path="/settings/localization" element={<LocalizationSettings />} />
          <Route path="/settings/security" element={<SecuritySettings />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
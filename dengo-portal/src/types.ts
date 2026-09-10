export interface PortalConfig {
  businessName: string
  tagline?: string
  aboutText?: string
  logoUrl?: string
  heroImageUrl?: string
  primaryColor: string
  address?: string
  city?: string
  phone?: string
  whatsapp?: string
  email?: string
  facebook?: string
  instagram?: string
}

export interface TeacherSchoolAssignment {
  id: string
  grade?: string
  section?: string
  educationalLevel?: string
  school: { id: string; name: string; municipio?: string }
}

export interface TeacherUser {
  id: string
  name: string
  email: string
  role: string
  teacher?: {
    id: string
    phone?: string
    schools: TeacherSchoolAssignment[]
  }
}

export interface Program {
  id: string
  type: string
  name: string
  description?: string
  maxAmountPerTeacher?: number | null
  limitPerStudent?: number | null
  allowedCategoryIds?: string[] | null
  isActive: boolean
}

export interface ProgramOptionItem {
  id: string
  productId: string
  productName: string
  quantity: number
  basePrice: number
  imageUrl?: string | null
}

export interface ProgramOption {
  id: string
  programType: string
  name: string
  description?: string | null
  sortOrder: number
  levels?: string[]
  items: ProgramOptionItem[]
}

export interface Category {
  id: string
  name: string
  color?: string
}

export interface Product {
  id: string
  name: string
  brand?: string
  description?: string
  basePrice: number
  imageUrl?: string
  category?: { id: string; name: string }
}

export interface PortalOrderItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number
  total: number
  notes?: string
}

export interface PortalOrderGrade {
  id: string
  gradeName: string
  studentCount: number
}

export interface PortalMessage {
  id: string
  portalOrderId: string | null
  teacherId: string
  senderRole: 'TEACHER' | 'ADMIN'
  body: string
  isRead: boolean
  createdAt: string
  portalOrder?: { orderNumber: string } | null
}

export interface PortalOrder {
  id: string
  orderNumber: string
  schoolId: string
  grade?: string
  educationalLevel?: string | null
  studentCount?: number | null
  orderGradeSummary?: string | null
  programType: string
  status: string
  notes?: string
  totalAmount: number
  adminNotes?: string
  deliveryDate?: string | null
  deliveryTime?: string | null
  deliveryNotes?: string | null
  createdAt: string
  school?: { name: string }
  items?: PortalOrderItem[]
  grades?: PortalOrderGrade[]
}

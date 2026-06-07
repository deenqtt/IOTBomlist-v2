export interface User {
  id: number
  username: string
  role: 'user' | 'admin' | 'super'
}

export interface SupplierPnEntry {
  pn?: string | null
  price?: number | null
  moq?: number | null
  priceBreaks?: { qtyFrom: number; qtyTo: number | null; unitPrice: number }[] | null
  url?: string | null
  availability?: string | null
  quantity_available?: number | null
}

export interface SupplierPricesMap {
  lcsc?: SupplierPnEntry | null
  mouser?: SupplierPnEntry | null
  digikey?: SupplierPnEntry | null
  other?: SupplierPnEntry | null
}

export interface Item {
  stableId: string
  partNumber?: string | null
  productName?: string | null
  value?: string | null
  description?: string | null
  alternate?: string | null
  category?: string | null
  package?: string | null
  voltageRating?: string | null
  tolerance?: string | null
  stockCode?: string | null
  suppliers?: string | null
  links?: string | null
  priceMin?: number | null
  priceCurrency?: string | null
  manufacturer?: string | null
  stockQty?: number | null
  imageUrl?: string | null
  stockStatus?: string | null
  stockAvailable?: boolean | null
  whQty?: number | null
  whLocation?: string | null
  supplierPrices?: string | null
  alternatives?: string | null
  marketPrice?: number | null
  marketSupplier?: string | null
  marketStock?: number | null
}

export interface Product {
  id: number
  name: string
  slug?: string
  imageUrl?: string | null
  createdAt: string
  updatedAt: string
  _count?: {
    items?: number
  }
}

export interface ProductItem {
  productId: number
  stableId: string
  quantitySum?: number
  references?: string
  notes?: string
  alternatives?: string
  item?: Item
  product?: Product
}

export interface ConfigSet {
  id: number
  name: string
  parentSetId?: number
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
  parent?: ConfigSet
  items?: ConfigSetItem[]
}

export interface ConfigSetItem {
  id: number
  setId: number
  orderIndex: number
  mainProductId: number
  op: 'set_qty' | 'add' | 'remove'
  variantIds?: string
  qty: number
}

export interface Superset {
  id: number
  name: string
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
  items?: SupersetItem[]
}

export interface SupersetItem {
  id: number
  supersetId: number
  orderIndex: number
  setId: number
  qty: number
  set?: ConfigSet
}

export interface AnalyticsSummary {
  totalItems: number
  totalProducts: number
  totalSets: number
  totalSupersets: number
  bomRows: number
  enrichedItems: number
  missingPrices: number
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface ProductDocument {
  id: number
  productId?: number
  type: string
  storageKind: string
  pathOrUrl: string
  uploadedBy?: string
  createdAt: string
}

export interface AnalyzeImportResult {
  matched: { identifier: string; stableId: string; partNumber?: string; productName?: string; qty: number; resolvedMpn?: string; lcscCode?: string }[]
  notFound: { identifier: string; qty: number; resolvedMpn?: string; lcscCode?: string }[]
}

export interface PaginatedResponse<T> {
  total: number
  items: T[]
  page: number
  page_size: number
}

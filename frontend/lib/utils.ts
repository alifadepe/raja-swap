export const formatNumber = (value: number | string, decimals: number = 4) => {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return num.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

export const formatDate = (dateString: string | number | Date) => {
  if (!dateString) return 'Never'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

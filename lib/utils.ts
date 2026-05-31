export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '₹0'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function generateId(prefix: string): string {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`
}

export function getCurrentMonthNo(startDate: string): number {
  const start = new Date(startDate)
  const now = new Date()
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth()) +
    1
  return Math.max(1, months)
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

export function statusColor(status: string): string {
  switch (status) {
    case 'Paid':
      return 'bg-green-100 text-green-700'
    case 'Pending':
      return 'bg-yellow-100 text-yellow-700'
    case 'Overdue':
      return 'bg-red-100 text-red-700'
    case 'Active':
      return 'bg-blue-100 text-blue-700'
    case 'Won':
      return 'bg-purple-100 text-purple-700'
    case 'Completed':
      return 'bg-gray-100 text-gray-600'
    case 'Inactive':
      return 'bg-gray-100 text-gray-500'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

// Round to nearest 100
export function roundToHundred(amount: number): number {
  return Math.round(amount / 100) * 100
}

// Calculate proportional payment split
export function calculateSplit(
  totalPayment: number,
  groups: Array<{ group_id: string; group_name: string; remaining: number; obligation: number }>
): Array<{ group_id: string; group_name: string; allocated: number; remaining_before: number; will_complete: boolean }> {
  const activeGroups = groups.filter((g) => g.remaining > 0)
  if (activeGroups.length === 0) return []

  const totalObligation = activeGroups.reduce((sum, g) => sum + g.obligation, 0)
  const result = []
  let leftover = totalPayment

  for (let i = 0; i < activeGroups.length - 1; i++) {
    const g = activeGroups[i]
    const proportional = roundToHundred((totalPayment * g.obligation) / totalObligation)
    const allocated = Math.min(proportional, g.remaining, leftover)
    result.push({
      group_id: g.group_id,
      group_name: g.group_name,
      allocated,
      remaining_before: g.remaining,
      will_complete: allocated >= g.remaining,
    })
    leftover -= allocated
  }

  // Last group gets the remainder
  if (leftover > 0 && activeGroups.length > 0) {
    const last = activeGroups[activeGroups.length - 1]
    const allocated = Math.min(leftover, last.remaining)
    result.push({
      group_id: last.group_id,
      group_name: last.group_name,
      allocated,
      remaining_before: last.remaining,
      will_complete: allocated >= last.remaining,
    })
  }

  return result
}

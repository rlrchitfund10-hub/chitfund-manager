export interface Member {
  id: string
  member_id: string
  full_name: string
  phone: string
  phone_alt?: string
  address?: string
  aadhaar?: string
  join_date: string
  status: 'Active' | 'Inactive'
  is_daily_payer: boolean
  notes?: string
  created_at: string
}

export interface Group {
  id: string
  group_id: string
  group_name: string
  auction_day: number
  principal_amount: number
  total_slots: number
  total_months: number
  commission_pct: number
  start_date: string
  status: 'Active' | 'Completed'
  base_installment: number
  created_at: string
}

export interface MemberSlot {
  id: string
  slot_id: string
  member_id: string
  group_id: string
  slot_count: number
  partner_member_id?: string
  has_won: 'Yes' | 'No'
  won_month_no?: number
  won_payout?: number
  status: 'Active' | 'Won'
  created_at: string
}

export interface Auction {
  id: string
  auction_id: string
  group_id: string
  month_no: number
  auction_date: string
  winner_member_id: string
  bid_amount: number
  admin_commission?: number
  shared_discount?: number
  member_discount_per_slot?: number
  actual_installment?: number
  gross_payout?: number
  deduction_amount: number
  net_payout?: number
  payout_status: 'Pending' | 'Paid'
  payout_date?: string
  winner2_member_id?: string
  winner1_payout?: number
  winner2_payout?: number
  notes?: string
  created_at: string
}

export interface Payment {
  id: string
  payment_id: string
  payment_date: string
  member_id: string
  amount: number
  payment_mode: 'Cash' | 'UPI' | 'Bank Transfer' | 'Other'
  month_no: number
  notes?: string
  is_processed: boolean
  created_at: string
}

export interface Allocation {
  id: string
  allocation_id: string
  payment_id: string
  member_id: string
  group_id: string
  month_no: number
  allocated_amount: number
  allocation_date: string
  created_at: string
}

export interface MonthlyLedger {
  id: string
  ledger_id: string
  member_id: string
  group_id: string
  month_no: number
  expected_amount: number
  paid_amount: number
  balance: number
  status: 'Paid' | 'Pending' | 'Overdue'
  month_year?: string
  created_at: string
}

export interface PaymentSplitPreview {
  group_id: string
  group_name: string
  allocated_amount: number
  remaining_before: number
  remaining_after: number
  will_complete: boolean
}

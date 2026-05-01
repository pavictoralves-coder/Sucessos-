export type TransactionType = 'INCOME' | 'EXPENSE';
export type PaymentMethod = 'CREDIT' | 'CASH';
export type Frequency = 'ONCE' | 'MONTHLY';

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  method?: PaymentMethod; // Only for expenses
  frequency: Frequency;
  date: string; // ISO string
  category: string;
  isSalary?: boolean;
  installments?: number;
  installmentIndex?: number;
  groupId?: string;
}

export interface SalaryInput {
  baseSalary: number;
  commission: number;
  allowance: number; // Ajuda de custo
  date: string; // Adicionado para permitir escolher o mês
  workingDays?: number;
  restDays?: number;
}

export interface SalaryCalculation {
  gross: number;
  inss: number;
  irrf: number;
  net: number;
  allowance: number;
  totalLiquid: number;
}

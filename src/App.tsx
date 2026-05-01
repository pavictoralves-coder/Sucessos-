/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  CreditCard, 
  Calendar, 
  ArrowUpRight,
  ArrowDownRight,
  Info,
  X,
  PlusCircle,
  BarChart3
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  startOfMonth, 
  endOfMonth, 
  isSameMonth, 
  parseISO, 
  isAfter, 
  isBefore,
  addDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { v4 as uuidv4 } from 'uuid';
import { cn, calculateBrazilianSalary, getMonthDaysInfo } from './lib/utils';
import { Transaction, TransactionType, PaymentMethod, Frequency, SalaryInput, SalaryCalculation } from './types';

const STORAGE_KEY = 'sucesso_transactions';

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSalaryModalOpen, setIsSalaryModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [currentViewDate, setCurrentViewDate] = useState(new Date());

  // Load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setTransactions(JSON.parse(saved));
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  const stats = useMemo(() => {
    const currentMonthTransactions = transactions.filter(t => {
      const tDate = parseISO(t.date);
      if (t.frequency === 'MONTHLY') {
        const startOfT = startOfMonth(tDate);
        const startOfCurrent = startOfMonth(currentViewDate);
        return isBefore(startOfT, addDays(endOfMonth(currentViewDate), 1)) || isSameMonth(tDate, currentViewDate);
      }
      return isSameMonth(tDate, currentViewDate);
    });
    
    const income = currentMonthTransactions
      .filter(t => t.type === 'INCOME')
      .reduce((acc, t) => acc + t.amount, 0);
    
    const expense = currentMonthTransactions
      .filter(t => t.type === 'EXPENSE')
      .reduce((acc, t) => acc + t.amount, 0);

    return { income, expense, balance: income - expense };
  }, [transactions, currentViewDate]);

  const chartData = useMemo(() => {
    const data = [];
    // Show 12 months starting from current month
    const startOfProject = startOfMonth(new Date());
    for (let i = 0; i < 12; i++) {
      const monthDate = addMonths(startOfProject, i);
      const monthStr = format(monthDate, 'MMM', { locale: ptBR });
      
      const monthlyExpenses = transactions.filter(t => {
        if (t.type !== 'EXPENSE') return false;
        const transactionDate = parseISO(t.date);
        
        if (t.frequency === 'MONTHLY') {
          return isBefore(transactionDate, endOfMonth(monthDate)) || isSameMonth(transactionDate, monthDate);
        } else {
          return isSameMonth(transactionDate, monthDate);
        }
      }).reduce((acc, t) => acc + t.amount, 0);

      data.push({ name: monthStr, amount: monthlyExpenses, date: monthDate });
    }
    return data;
  }, [transactions]);

  const handleDelete = (id: string, groupId?: string) => {
    if (groupId) {
      const choice = confirm('Este item faz parte de um parcelamento. Deseja excluir TODAS as parcelas deste grupo? Escolha Cancelar para excluir apenas esta parcela.');
      if (choice) {
        setTransactions(prev => prev.filter(t => t.groupId !== groupId));
        return;
      }
    }
    
    if (confirm('Deseja realmente excluir este lançamento?')) {
      setTransactions(prev => prev.filter(t => t.id !== id));
    }
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsFormOpen(true);
  };

  const addOrUpdateTransaction = (t: Partial<Transaction>) => {
    if (editingTransaction) {
      setTransactions(transactions.map(prev => prev.id === editingTransaction.id ? { ...editingTransaction, ...t } as Transaction : prev));
    } else {
      if (t.method === 'CREDIT' && (t.installments || 1) > 1) {
        const numInstallments = t.installments || 1;
        const baseDate = parseISO(t.date || new Date().toISOString());
        const installmentAmount = t.amount || 0; // Use fixed amount instead of dividing
        const transactionGroupId = uuidv4();

        const newTransactions: Transaction[] = [];
        for (let i = 0; i < numInstallments; i++) {
          newTransactions.push({
            ...t,
            id: uuidv4(),
            amount: installmentAmount,
            date: addMonths(baseDate, i).toISOString(),
            installments: numInstallments,
            installmentIndex: i + 1,
            groupId: transactionGroupId,
          } as Transaction);
        }
        setTransactions([...transactions, ...newTransactions]);
      } else {
        setTransactions([...transactions, { ...t, id: uuidv4(), date: t.date || new Date().toISOString() } as Transaction]);
      }
    }
    setIsFormOpen(false);
    setEditingTransaction(null);
  };

  const handleSalarySave = (calc: SalaryCalculation, date: string) => {
    // Remove previous salary entries for the target month if they exist
    const filtered = transactions.filter(t => !t.isSalary || !isSameMonth(parseISO(t.date), parseISO(date)));
    
    // We create a group for the salary and its deductions
    const salaryGroupId = uuidv4();
    
    const transactionsToAdd: Transaction[] = [
      {
        id: salaryGroupId,
        description: `Salário Bruto - ${format(parseISO(date), 'MMMM', { locale: ptBR })}`,
        amount: calc.gross + (calc.allowance || 0),
        type: 'INCOME',
        frequency: 'ONCE', 
        date: date,
        category: 'Salário',
        isSalary: true,
        groupId: salaryGroupId
      }
    ];

    if (calc.inss > 0) {
      transactionsToAdd.push({
        id: uuidv4(),
        description: `Dedução INSS - ${format(parseISO(date), 'MMMM', { locale: ptBR })}`,
        amount: calc.inss,
        type: 'EXPENSE',
        frequency: 'ONCE',
        date: date,
        category: 'Impostos',
        isSalary: true,
        groupId: salaryGroupId
      });
    }

    if (calc.irrf > 0) {
      transactionsToAdd.push({
        id: uuidv4(),
        description: `Dedução IRRF - ${format(parseISO(date), 'MMMM', { locale: ptBR })}`,
        amount: calc.irrf,
        type: 'EXPENSE',
        frequency: 'ONCE',
        date: date,
        category: 'Impostos',
        isSalary: true,
        groupId: salaryGroupId
      });
    }

    setTransactions([...filtered, ...transactionsToAdd]);
    setIsSalaryModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-20 px-4 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-xl">
            <TrendingUp className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-indigo-900 uppercase">Sucesso</h1>
        </div>
        <button 
          onClick={() => setIsSalaryModalOpen(true)}
          className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-xl transition-all border border-indigo-50"
        >
          <Wallet className="w-4 h-4" />
          Salário
        </button>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Month Selector */}
        <section className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
          <button 
            onClick={() => setCurrentViewDate(addMonths(currentViewDate, -1))}
            className="p-3 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <ArrowDownRight className="w-5 h-5 rotate-135" />
          </button>
          <div className="text-center">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">
              {format(currentViewDate, 'MMMM yyyy', { locale: ptBR })}
            </h2>
          </div>
          <button 
            onClick={() => setCurrentViewDate(addMonths(currentViewDate, 1))}
            className="p-3 hover:bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <ArrowUpRight className="w-5 h-5" />
          </button>
        </section>

        {/* Stats Summary */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Entradas</span>
              <div className="p-1.5 bg-emerald-50 rounded-lg">
                <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <span className="text-lg sm:text-xl font-bold text-emerald-700 truncate">R$ {stats.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Saídas</span>
              <div className="p-1.5 bg-rose-50 rounded-lg">
                <ArrowDownRight className="w-3.5 h-3.5 sm:w-4 h-4 text-rose-600" />
              </div>
            </div>
            <span className="text-lg sm:text-xl font-bold text-rose-700 truncate">R$ {stats.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
          </div>
          <div className="col-span-2 bg-indigo-900 p-5 sm:p-6 rounded-[28px] sm:rounded-[32px] shadow-xl flex justify-between items-center text-white relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-800 rounded-full -mr-16 -mt-16 opacity-50 transition-transform group-hover:scale-110"></div>
            <div className="relative z-10">
              <span className="text-[9px] sm:text-[10px] opacity-60 uppercase font-black tracking-widest block mb-1">Saldo Líquido</span>
              <span className="text-3xl sm:text-4xl font-black tracking-tight block">R$ {stats.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <BarChart3 className="w-10 h-10 sm:w-12 h-12 opacity-20 relative z-10" />
          </div>
        </section>

        {/* Projections Chart */}
        <section className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
          <h2 className="text-[10px] font-black text-slate-400 mb-6 uppercase tracking-widest">
            Fluxo de Custos (12 Meses)
          </h2>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Custo']}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={isSameMonth(entry.date, currentViewDate) ? '#4f46e5' : '#e2e8f0'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Transactions List */}
        <section className="space-y-4 pb-24">
          <div className="flex justify-between items-center">
            <h2 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight">LANÇAMENTOS</h2>
          </div>
          
          <div className="space-y-3">
            {transactions
              .filter(t => {
                const tDate = parseISO(t.date);
                if (t.frequency === 'MONTHLY') {
                  const startOfT = startOfMonth(tDate);
                  const startOfCurrent = startOfMonth(currentViewDate);
                  // Item starts on or before the current visible month
                  return startOfT <= startOfCurrent;
                }
                return isSameMonth(tDate, currentViewDate);
              })
              .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
              .map(t => (
              <div 
                key={t.id} 
                onClick={() => handleEdit(t)}
                className="bg-white p-4 sm:p-5 rounded-[20px] sm:rounded-[24px] shadow-sm border border-slate-100 flex items-center justify-between group transition-all active:bg-slate-50 cursor-pointer"
              >
                <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
                  <div className={cn(
                    "w-10 h-10 sm:w-12 h-12 rounded-xl sm:rounded-2xl flex-shrink-0 flex items-center justify-center text-lg sm:text-xl shadow-inner",
                    t.type === 'INCOME' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-600"
                  )}>
                    {t.type === 'INCOME' ? '💰' : (
                      t.method === 'CREDIT' ? '💳' : '💸'
                    )}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-bold text-slate-800 leading-none mb-1 text-sm sm:text-base truncate">
                      {t.description}
                      {t.installmentIndex && t.installments && (
                        <span className="ml-2 text-indigo-500 text-[10px] sm:text-xs">
                          {t.installmentIndex}/{t.installments}
                        </span>
                      )}
                    </h3>
                    <div className="flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <span>{format(parseISO(t.date), 'dd/MM')}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="truncate">{t.frequency === 'MONTHLY' ? 'Recorrente' : 'Único'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0 ml-2">
                  <span className={cn(
                    "font-black text-xs sm:text-sm whitespace-nowrap",
                    t.type === 'INCOME' ? "text-emerald-600" : "text-slate-800"
                  )}>
                    {t.type === 'INCOME' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleEdit(t); }} 
                      className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-400 hover:text-indigo-600 transition-colors"
                    >
                      <Edit2 className="w-4 h-4 sm:w-5 h-5" />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(t.id, t.groupId); }} 
                      className="p-2 sm:p-2.5 hover:bg-slate-100 rounded-lg sm:rounded-xl text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {transactions.filter(t => isSameMonth(parseISO(t.date), currentViewDate)).length === 0 && (
              <div className="text-center py-16 bg-white rounded-[32px] border border-dashed border-slate-200">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-slate-200" />
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Nenhum lançamento planejado.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Floating Add Button */}
      <button 
        onClick={() => { setEditingTransaction(null); setIsFormOpen(true); }}
        className="fixed bottom-6 right-6 w-14 h-14 sm:w-16 sm:h-16 bg-slate-900 text-white rounded-[22px] sm:rounded-3xl shadow-2xl flex items-center justify-center hover:bg-black transition-all active:scale-90 z-30"
      >
        <Plus className="w-8 h-8 sm:w-9 sm:h-9" />
      </button>

      {/* MODALS */}
      {isFormOpen && (
        <TransactionForm 
          onClose={() => { setIsFormOpen(false); setEditingTransaction(null); }} 
          onSave={addOrUpdateTransaction}
          onDelete={() => {
            if (editingTransaction) {
              handleDelete(editingTransaction.id, editingTransaction.groupId);
              setIsFormOpen(false);
              setEditingTransaction(null);
            }
          }}
          initialData={editingTransaction}
        />
      )}

      {isSalaryModalOpen && (
        <SalaryCalculatorModal 
          onClose={() => setIsSalaryModalOpen(false)}
          onSave={handleSalarySave}
        />
      )}
    </div>
  );
}

function TransactionForm({ onClose, onSave, onDelete, initialData }: { 
  onClose: () => void, 
  onSave: (t: Partial<Transaction>) => void,
  onDelete: () => void,
  initialData: Transaction | null
}) {
  const [formData, setFormData] = useState<Partial<Transaction>>(initialData || {
    description: '',
    amount: 0,
    type: 'EXPENSE',
    frequency: 'ONCE',
    method: 'CASH',
    category: 'Geral',
    date: new Date().toISOString().split('T')[0],
    installments: 1
  });

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 overflow-hidden">
      <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h2 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight uppercase">{initialData ? 'Editar LANÇAMENTO' : 'NOVO LANÇAMENTO'}</h2>
          <button onClick={onClose} className="p-2 sm:p-3 bg-slate-100 rounded-xl sm:rounded-2xl transition-transform active:scale-90"><X className="w-5 h-5 text-slate-400" /></button>
        </div>

        <div className="flex p-1 bg-slate-100 rounded-xl sm:rounded-2xl">
          <button 
            onClick={() => setFormData({ ...formData, type: 'EXPENSE' })}
            className={cn(
              "flex-1 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all",
              formData.type === 'EXPENSE' ? "bg-white shadow text-rose-600" : "text-slate-500"
            )}
          >
            Saída
          </button>
          <button 
            onClick={() => setFormData({ ...formData, type: 'INCOME' })}
            className={cn(
              "flex-1 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all",
              formData.type === 'INCOME' ? "bg-white shadow text-emerald-600" : "text-slate-500"
            )}
          >
            Entrada
          </button>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <div className="relative">
            <span className="absolute left-5 sm:left-6 top-3 text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Descrição</span>
            <input 
              type="text" 
              className="w-full bg-slate-50 border-transparent border-2 focus:border-indigo-600 focus:bg-white rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 pt-8 sm:pt-9 text-sm font-bold text-slate-800 outline-none transition-all shadow-inner"
              placeholder="Ex: Aluguel, Almoço..."
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="relative">
              <span className="absolute left-5 sm:left-6 top-3 text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">
                {formData.method === 'CREDIT' && (formData.installments || 1) > 1 ? 'Valor da Parcela' : 'Valor'}
              </span>
              <input 
                type="number" 
                className="w-full bg-slate-50 border-transparent border-2 focus:border-indigo-600 focus:bg-white rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 pt-8 sm:pt-9 text-sm font-black text-slate-800 outline-none transition-all shadow-inner"
                placeholder="0,00"
                value={formData.amount || ''}
                onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
              />
            </div>
            <div className="relative">
              <span className="absolute left-5 sm:left-6 top-3 text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Data</span>
              <input 
                type="date" 
                className="w-full bg-slate-50 border-transparent border-2 focus:border-indigo-600 focus:bg-white rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 pt-8 sm:pt-9 text-sm font-bold text-slate-800 outline-none transition-all shadow-inner"
                value={formData.date?.split('T')[0]}
                onChange={e => setFormData({ ...formData, date: new Date(e.target.value).toISOString() })}
              />
            </div>
          </div>

          {formData.type === 'EXPENSE' && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <button 
                onClick={() => setFormData({ ...formData, method: 'CASH' })}
                className={cn(
                  "py-3 sm:py-4 rounded-xl sm:rounded-2xl border-2 font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all flex flex-col items-center gap-1 sm:gap-1.5 shadow-sm",
                  formData.method === 'CASH' ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-100 text-slate-400"
                )}
              >
                <div className="text-lg sm:text-xl">💸</div>
                À Vista
              </button>
              <button 
                onClick={() => setFormData({ ...formData, method: 'CREDIT' })}
                className={cn(
                  "py-3 sm:py-4 rounded-xl sm:rounded-2xl border-2 font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all flex flex-col items-center gap-1 sm:gap-1.5 shadow-sm",
                  formData.method === 'CREDIT' ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-100 text-slate-400"
                )}
              >
                <div className="text-lg sm:text-xl">💳</div>
                Crédito
              </button>
            </div>
          )}

          {formData.type === 'EXPENSE' && formData.method === 'CREDIT' && !initialData && (
            <div className="relative">
              <span className="absolute left-5 sm:left-6 top-3 text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Nº de Parcelas</span>
              <div className="flex items-center gap-2 bg-slate-50 border-transparent border-2 rounded-[20px] sm:rounded-[24px] p-3 pt-7 sm:p-4 sm:pt-8 shadow-inner">
                {[1, 2, 3, 4, 5, 6, 10, 12].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setFormData({ ...formData, installments: n })}
                    className={cn(
                      "flex-1 py-2 rounded-lg font-black text-[10px] transition-all",
                      formData.installments === n ? "bg-indigo-600 text-white shadow-lg" : "bg-white text-slate-400 border border-slate-100"
                    )}
                  >
                    {n}x
                  </button>
                ))}
                <input 
                  type="number"
                  className="w-12 bg-white border border-slate-100 rounded-lg py-2 text-[10px] font-black text-center text-slate-800 focus:ring-1 focus:ring-indigo-600 outline-none"
                  placeholder="+"
                  onChange={(e) => setFormData({ ...formData, installments: Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between bg-slate-50 p-5 sm:p-6 rounded-[20px] sm:rounded-[24px] shadow-inner">
            <div>
              <p className="text-[9px] sm:text-[10px] font-black text-slate-800 uppercase tracking-widest">Despesa Mensal fixa</p>
              <p className="text-[7px] sm:text-[8px] text-slate-400 font-bold uppercase mt-1">Repetir todo mês</p>
            </div>
            <button 
              type="button"
              onClick={() => setFormData({ ...formData, frequency: formData.frequency === 'MONTHLY' ? 'ONCE' : 'MONTHLY' })}
              className={cn(
                "w-10 sm:w-12 h-5 sm:h-6 rounded-full transition-colors relative flex items-center",
                formData.frequency === 'MONTHLY' ? "bg-indigo-600" : "bg-slate-300"
              )}
            >
              <div className={cn(
                "w-3.5 h-3.5 sm:w-4 h-4 bg-white rounded-full mx-1 shadow-md transition-all duration-300",
                formData.frequency === 'MONTHLY' ? "translate-x-5 sm:translate-x-6" : "translate-x-0"
              )} />
            </button>
          </div>
        </div>

        <div className="flex gap-3">
          {initialData && (
            <button 
              type="button"
              onClick={onDelete}
              className="flex-shrink-0 p-5 bg-rose-50 text-rose-600 rounded-[20px] sm:rounded-[24px] hover:bg-rose-100 transition-colors"
              title="Excluir"
            >
              <Trash2 className="w-6 h-6" />
            </button>
          )}
          <button 
            onClick={() => onSave(formData)}
            className="w-full py-5 sm:py-6 bg-slate-900 text-white rounded-[20px] sm:rounded-[24px] font-black text-[11px] sm:text-[12px] tracking-[3px] sm:tracking-[4px] uppercase shadow-2xl hover:bg-black active:scale-95 transition-all"
          >
            {initialData ? 'SALVAR' : 'CONFIRMAR'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SalaryCalculatorModal({ onClose, onSave }: { onClose: () => void, onSave: (c: SalaryCalculation, date: string) => void }) {
  const [input, setInput] = useState<SalaryInput>({
    baseSalary: 0,
    commission: 0,
    allowance: 0,
    date: new Date().toISOString().split('T')[0],
  });

  const calculation = useMemo(() => {
    return calculateBrazilianSalary(
      input.baseSalary, 
      input.commission, 
      input.allowance
    );
  }, [input]);

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-xl rounded-t-[32px] sm:rounded-[40px] p-6 sm:p-8 space-y-5 sm:space-y-6 shadow-2xl overflow-y-auto max-h-[92vh] animate-in slide-in-from-bottom duration-300">
        <div className="flex justify-between items-center">
          <h2 className="text-lg sm:text-xl font-black text-slate-800 tracking-tight uppercase flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-emerald-100 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-xl shadow-inner">💰</div>
            Recibo de Salário
          </h2>
          <button onClick={onClose} className="p-2 sm:p-3 bg-slate-100 rounded-xl sm:rounded-2xl transition-transform active:scale-90 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="relative">
              <span className="absolute left-5 sm:left-6 top-3 text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Escolha o Mês</span>
              <input 
                type="month" 
                className="w-full bg-slate-50 border-transparent border-2 focus:border-indigo-600 focus:bg-white rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 pt-8 sm:pt-9 text-xs sm:text-sm font-black text-slate-800 outline-none transition-all shadow-inner"
                value={input.date.substring(0, 7)}
                onChange={e => setInput({ ...input, date: e.target.value + '-01' })}
              />
            </div>
            
            <div className="relative">
              <span className="absolute left-5 sm:left-6 top-3 text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Salário Base (CLT)</span>
              <input 
                type="number" 
                className="w-full bg-slate-50 border-transparent border-2 focus:border-indigo-600 focus:bg-white rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 pt-8 sm:pt-9 text-xs sm:text-sm font-black text-slate-800 outline-none transition-all shadow-inner"
                placeholder="R$ 0,00"
                value={input.baseSalary || ''}
                onChange={e => setInput({ ...input, baseSalary: Number(e.target.value) })}
              />
            </div>

            <div className="relative">
              <span className="absolute left-5 sm:left-6 top-3 text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Comissão / Variável</span>
              <input 
                type="number" 
                className="w-full bg-slate-50 border-transparent border-2 focus:border-indigo-600 focus:bg-white rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 pt-8 sm:pt-9 text-xs sm:text-sm font-black text-slate-800 outline-none transition-all shadow-inner"
                placeholder="Variável"
                value={input.commission || ''}
                onChange={e => setInput({ ...input, commission: Number(e.target.value) })}
              />
            </div>

            <div className="relative">
              <span className="absolute left-5 sm:left-6 top-3 text-[7px] sm:text-[8px] font-black text-slate-400 uppercase tracking-widest">Ajuda de Custo (Isento)</span>
              <input 
                type="number" 
                className="w-full bg-slate-50 border-transparent border-2 focus:border-indigo-600 focus:bg-white rounded-[20px] sm:rounded-[24px] p-5 sm:p-6 pt-8 sm:pt-9 text-xs sm:text-sm font-bold text-slate-800 outline-none transition-all shadow-inner"
                placeholder="R$ 0,00"
                value={input.allowance || ''}
                onChange={e => setInput({ ...input, allowance: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="bg-indigo-900 rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 space-y-4 text-white shadow-xl relative overflow-hidden group">
            <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-800 rounded-full -mr-16 -mt-16 opacity-30 group-hover:scale-110 transition-transform"></div>
            
            <div className="space-y-2 sm:space-y-3 relative z-10">
              <div className="flex justify-between text-[9px] sm:text-[10px] uppercase font-black text-indigo-300 tracking-[1px]">
                <span>Salário Bruto + Comissões</span>
                <span>R$ {(input.baseSalary + input.commission).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-[9px] sm:text-[10px] uppercase font-black text-rose-300 tracking-[1px]">
                <span>INSS</span>
                <span>- R$ {calculation.inss.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-[9px] sm:text-[10px] uppercase font-black text-rose-400 tracking-[1px]">
                <span>Imposto de Renda (IRRF)</span>
                <span>- R$ {calculation.irrf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            
            <div className="pt-5 sm:pt-6 border-t border-indigo-800 flex justify-between items-baseline relative z-10">
              <span className="text-[9px] sm:text-[10px] font-black text-indigo-300 uppercase tracking-[2px]">SALÁRIO LÍQUIDO + BENEFÍCIOS</span>
              <span className="text-3xl sm:text-4xl font-black text-white whitespace-nowrap">R$ {calculation.totalLiquid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <button 
          onClick={() => onSave(calculation, input.date)}
          className="w-full py-5 sm:py-6 bg-emerald-600 text-white rounded-[20px] sm:rounded-[24px] font-black text-[11px] sm:text-[12px] tracking-[3px] sm:tracking-[4px] uppercase shadow-2xl hover:bg-emerald-700 active:scale-95 transition-all"
        >
          CONFIRMAR RECIBO
        </button>
      </div>
    </div>
  );
}



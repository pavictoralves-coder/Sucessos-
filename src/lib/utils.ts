import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { eachDayOfInterval, startOfMonth, endOfMonth, isSunday, isSaturday } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMonthDaysInfo(date: Date) {
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const days = eachDayOfInterval({ start, end });
  
  const sundays = days.filter(d => isSunday(d)).length;
  // Many companies use Mon-Sat as working days for DSR, but Mon-Fri is also common.
  // We'll calculate both and use Mon-Sat (standard for CLT) as default.
  // Working days = Total Days - Sundays - Holidays (holidays need manual input)
  const totalDays = days.length;
  
  return {
    totalDays,
    sundays,
    workingDays: totalDays - sundays, // Default: assumes Saturday is working day and no holidays
  };
}

export function calculateBrazilianSalary(
  base: number,
  commission: number,
  allowance: number
) {
  const grossTaxable = base + commission;

  // INSS 2024 Table (Simplified Progressive)
  let inss = 0;
  if (grossTaxable <= 1412.0) {
    inss = grossTaxable * 0.075;
  } else if (grossTaxable <= 2666.68) {
    inss = 1412 * 0.075 + (grossTaxable - 1412) * 0.09;
  } else if (grossTaxable <= 4000.03) {
    inss = 1412 * 0.075 + (2666.68 - 1412) * 0.09 + (grossTaxable - 2666.68) * 0.12;
  } else if (grossTaxable <= 7786.02) {
    inss =
      1412 * 0.075 +
      (2666.68 - 1412) * 0.09 +
      (4000.03 - 2666.68) * 0.12 +
      (grossTaxable - 4000.03) * 0.14;
  } else {
    inss = 908.85; // Max Ceiling
  }

  const baseIRRF = grossTaxable - inss;

  // IRRF 2024 Table
  let irrf = 0;
  if (baseIRRF <= 2259.2) {
    irrf = 0;
  } else if (baseIRRF <= 2826.65) {
    irrf = baseIRRF * 0.075 - 169.44;
  } else if (baseIRRF <= 3751.05) {
    irrf = baseIRRF * 0.15 - 381.44;
  } else if (baseIRRF <= 4664.68) {
    irrf = baseIRRF * 0.225 - 662.77;
  } else {
    irrf = baseIRRF * 0.275 - 896.0;
  }

  const net = grossTaxable - inss - irrf;
  const totalLiquid = net + allowance;

  return {
    gross: grossTaxable,
    inss,
    irrf,
    net,
    allowance,
    totalLiquid,
  };
}

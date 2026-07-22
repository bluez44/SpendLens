import type { SQLiteDatabase } from 'expo-sqlite';

import type { CategoryId } from './categories';
import { db as defaultDb } from './db';
import { toDateKey } from './format';
import { countTransactions, insertTransaction } from './transactions';

const PHOTO = {
  food: '1504674900247-0877df9cc836',
  coffee: '1461023058943-07fcbe16d735',
  tea: '1495474472287-4d71bcdd2085',
  grab: '1449965408869-eaa3f722e40d',
  shopping: '1441986300917-64674bd600d8',
  bills: '1554224155-6726b3ff858f',
  fun: '1517604931442-7e0c8ed2963c',
  market: '1542838132-92c53300491e',
} as const;

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=400&q=80&auto=format&fit=crop`;

interface SeedItem {
  dayOffset: number; // days before today
  time: string; // HH:mm
  category: CategoryId;
  name: string;
  note?: string;
  amount: number;
  isIncome?: boolean;
  photo?: keyof typeof PHOTO;
}

/** Sample diary mirroring SpendLens.dc.html, plus a few older months for the chart. */
const SEED: SeedItem[] = [
  // Hôm nay
  { dayOffset: 0, time: '08:10', category: 'transport', name: 'Grab tới công ty', amount: 32000, photo: 'grab' },
  { dayOffset: 0, time: '09:15', category: 'food', name: 'Cà phê Highlands', amount: 55000, photo: 'coffee' },
  { dayOffset: 0, time: '12:30', category: 'food', name: 'Bún bò Huế', note: 'Gần công ty, ăn trưa', amount: 45000, photo: 'food' },
  { dayOffset: 0, time: '15:40', category: 'food', name: 'Trà sữa Phúc Long', amount: 45000, photo: 'tea' },
  { dayOffset: 0, time: '17:20', category: 'food', name: 'Đi chợ chiều', amount: 53000, photo: 'market' },
  // Hôm qua
  { dayOffset: 1, time: '10:00', category: 'other', name: 'Lương freelance', amount: 2500000, isIncome: true },
  { dayOffset: 1, time: '18:00', category: 'shopping', name: 'Áo thun Uniqlo', amount: 299000, photo: 'shopping' },
  { dayOffset: 1, time: '20:30', category: 'fun', name: 'Vé phim CGV', amount: 120000, photo: 'fun' },
  // 2 ngày trước
  { dayOffset: 2, time: '09:00', category: 'bills', name: 'Tiền điện tháng 7', amount: 420000, photo: 'bills' },
  { dayOffset: 2, time: '17:00', category: 'transport', name: 'Đổ xăng xe máy', amount: 80000, photo: 'grab' },
  // Các tháng trước (cho biểu đồ cột)
  { dayOffset: 35, time: '11:00', category: 'food', name: 'Đi siêu thị', amount: 350000, photo: 'market' },
  { dayOffset: 50, time: '09:30', category: 'bills', name: 'Hóa đơn nước', amount: 180000, photo: 'bills' },
  { dayOffset: 70, time: '16:00', category: 'shopping', name: 'Mua giày thể thao', amount: 850000, photo: 'shopping' },
  { dayOffset: 100, time: '10:15', category: 'health', name: 'Khám sức khỏe', amount: 500000 },
  { dayOffset: 130, time: '14:00', category: 'transport', name: 'Bảo dưỡng xe', amount: 300000, photo: 'grab' },
  { dayOffset: 160, time: '19:00', category: 'fun', name: 'Quà sinh nhật', amount: 600000, photo: 'fun' },
];

export function seedIfEmpty(database: SQLiteDatabase = defaultDb, now: number = Date.now()): void {
  if (countTransactions(database) > 0) return;
  const items = [...SEED].sort((a, b) => b.dayOffset - a.dayOffset); // oldest first
  for (const it of items) {
    const d = new Date(now - it.dayOffset * 86_400_000);
    const [hh, mm] = it.time.split(':').map(Number);
    d.setHours(hh, mm, 0, 0);
    insertTransaction(
      {
        date: toDateKey(d),
        time: it.time,
        createdAt: d.getTime(),
        category: it.category,
        name: it.name,
        note: it.note ?? null,
        amount: it.amount,
        isIncome: !!it.isIncome,
        photoPath: it.photo ? unsplash(PHOTO[it.photo]) : null,
      },
      database
    );
  }
}

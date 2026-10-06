import { describe, expect, it } from "vitest";
import {
  calcRecord, emptyForm, filterRecords, getFormPreview, getInputWarnings, getMonthlyData, getStats,
  roundTo, sortByDateAsc, sortDrivingRecords, validateRecordInput
} from "../src/lib/drivingMath.js";
import { compareDateStrings, isValidDateString, todayLocal } from "../src/lib/dates.js";

describe("roundTo", () => {
  it("半数进位，不受二进制浮点影响", () => {
    expect(roundTo(100.925, 2)).toBe(100.93);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-2.675, 2)).toBe(-2.68);
    expect(roundTo(0.0004, 2)).toBe(0);
    expect(roundTo(Number.NaN)).toBe(0);
  });
});

describe("calcRecord（手册 5.1 算例）", () => {
  it("250km、5.5L、7.34元、过路费120、收入80", () => {
    const r = calcRecord({ distance: 250, consumption: 5.5, price: 7.34, toll: 120, income: 80 });
    expect(r.fuelLiters).toBe(13.75);
    expect(r.fuelCost).toBe(100.93);
    expect(r.totalCost).toBe(220.93);
    expect(r.profit).toBe(-140.93);
    expect(r.netSpend).toBe(140.93);
    expect(r.costPerKm).toBeCloseTo(0.8837, 4);
  });
  it("缺字段不抛错", () => {
    const r = calcRecord({ id: 1 });
    expect(r.date).toBe("");
    expect(r.from).toBe("");
    expect(r.totalCost).toBe(0);
  });
});

describe("表单预览与保存一致", () => {
  it("遍历大量输入组合，预览金额永远等于保存金额", () => {
    for (let d = 100; d <= 300; d += 0.37) {
      for (const consumption of [5.5, 6.3, 6.8, 7.1]) {
        for (const price of [7.34, 7.64, 7.91]) {
          const dd = Number(d.toFixed(2));
          const form = { distance: String(dd), consumption: String(consumption), price: String(price), toll: "12.5", income: "30" };
          const saved = calcRecord(form);
          const preview = getFormPreview(form);
          expect(preview.totalCost).toBe(saved.totalCost);
          expect(preview.fuelCost).toBe(saved.fuelCost);
          expect(preview.netSpend).toBe(saved.netSpend);
        }
      }
    }
  });
  it("输入不全返回 null", () => {
    expect(getFormPreview({ distance: "", consumption: "6", price: "7" })).toBeNull();
  });
});

describe("日期", () => {
  const rows = [
    { id: 1, date: "2025-12-30" },
    { id: 2, date: "2026-01-02" },
    { id: 3, date: "2025-03-05" },
    { id: 4, date: "2026-01-02" }
  ];
  it("跨年升序/降序正确，同日按 id", () => {
    expect(sortDrivingRecords(rows, "date", "asc").map(r => r.id)).toEqual([3, 1, 2, 4]);
    expect(sortDrivingRecords(rows, "date", "desc").map(r => r.id)).toEqual([4, 2, 1, 3]);
    expect(sortByDateAsc(rows).map(r => r.date)[0]).toBe("2025-03-05");
  });
  it("兼容未补零日期", () => {
    expect(compareDateStrings("2026-3-5", "2026-03-04")).toBeGreaterThan(0);
  });
  it("本地日期而非 UTC 日期", () => {
    // 2026-10-07 00:30（本地时区）
    const local = new Date(2026, 9, 7, 0, 30);
    expect(todayLocal(local)).toBe("2026-10-07");
    expect(emptyForm().date).toBe(todayLocal());
  });
  it("校验真实日期", () => {
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("26-02-28")).toBe(false);
  });
});

describe("校验与提示", () => {
  const base = { date: "2026-10-06", from: "A", to: "B", price: "7.5", consumption: "6", distance: "100", toll: "0", income: "0" };
  it("通过与拒绝", () => {
    expect(validateRecordInput(base)).toBe("");
    expect(validateRecordInput({ ...base, date: "2026-13-01" })).toBe("日期格式不正确");
    expect(validateRecordInput({ ...base, distance: "0" })).toMatch(/公里数/);
  });
  it("合理性提示", () => {
    expect(getInputWarnings(base)).toEqual([]);
    expect(getInputWarnings({ ...base, consumption: "60" }).length).toBe(1);
    expect(getInputWarnings({ ...base, distance: "2000", price: "75" }).length).toBe(2);
  });
});

describe("统计", () => {
  const records = [
    { id: 1, date: "2025-12-30", from: "A", to: "B", highway: "x", distance: 100, consumption: 5, price: 7, toll: 20, income: 30 },
    { id: 2, date: "2026-01-02", from: "A", to: "C", highway: "y", distance: 300, consumption: 7, price: 8, toll: 0, income: 0 }
  ].map(calcRecord);
  it("总费用、净支出、每公里、加权油耗", () => {
    const stats = getStats(records);
    expect(stats.totalCost).toBeCloseTo(35 + 20 + 168, 5);
    expect(stats.totalIncome).toBe(30);
    expect(stats.netSpend).toBeCloseTo(223 - 30, 5);
    expect(stats.costPerKm).toBeCloseTo(223 / 400, 6);
    expect(stats.netPerKm).toBeCloseTo(193 / 400, 6);
    expect(stats.avgConsumption).toBeCloseTo((5 + 21) / 400 * 100, 6);
  });
  it("月度按年月排序并含净支出", () => {
    const months = getMonthlyData(records);
    expect(months.map(m => m.month)).toEqual(["2025-12", "2026-01"]);
    expect(months[0].netSpend).toBe(25);
  });
  it("筛选：年份/月份/路线/关键字", () => {
    expect(filterRecords(records, { year: "2026" }).length).toBe(1);
    expect(filterRecords(records, { month: "2025-12" }).length).toBe(1);
    expect(filterRecords(records, { route: "A→C" }).length).toBe(1);
    expect(filterRecords(records, { keyword: "Y" }).length).toBe(1);
    expect(filterRecords(records, {}).length).toBe(2);
  });
});

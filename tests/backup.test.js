import { describe, expect, it } from "vitest";
import { BACKUP_VERSION, createBackup, parseBackupText, validateSnapshot } from "../src/lib/backup.js";

const goodRecord = (id = 1) => ({ id, date: "2026-10-06", from: "玉溪", to: "昆明", highway: "杭瑞", price: 7.5, consumption: 6, distance: 100, toll: 10, income: 0 });
const goodEtc = { businessId: "B1", amount: 12, entryStation: "云南通站站", entryTime: "2026-10-06 08:00:00", exitStation: "云南九龙池站", exitTime: "2026-10-06 09:00:00", status: "已扣款" };
const snapshot = () => ({ records: [goodRecord(1), goodRecord(2)], etcRecords: [goodEtc], ignoredIssues: ["dist-1"], routeNameRules: { "A→B": ["x", "y"] } });
const text = (obj) => JSON.stringify(obj);

describe("备份", () => {
  it("导出再解析，往返一致", () => {
    const parsed = parseBackupText(text(createBackup(snapshot())));
    expect(parsed.snapshot.records.length).toBe(2);
    expect(parsed.snapshot.etcRecords.length).toBe(1);
    expect(parsed.snapshot.routeNameRules).toEqual({ "A→B": ["x", "y"] });
    expect(parsed.warnings).toEqual([]);
  });
  it("拒绝非 JSON、非本应用、更高版本", () => {
    expect(() => parseBackupText("{oops")).toThrow(/JSON/);
    expect(() => parseBackupText(text({ app: "other", data: {} }))).toThrow(/不是有效/);
    expect(() => parseBackupText(text({ ...createBackup(snapshot()), version: BACKUP_VERSION + 1 }))).toThrow(/更新/);
  });
  it("拒绝缺日期/缺地点/非数字的行程（否则会让页面崩溃）", () => {
    const bad = snapshot();
    delete bad.records[0].date;
    bad.records[1].distance = "abc";
    const backup = createBackup(bad);
    expect(() => parseBackupText(text(backup))).toThrow(/校验未通过/);
    const missingFrom = snapshot();
    delete missingFrom.records[0].from;
    expect(validateSnapshot(missingFrom).ok).toBe(false);
  });
  it("缺 etcRecords 时拒绝（避免恢复后清空 ETC）", () => {
    const result = validateSnapshot({ records: [goodRecord()] });
    expect(result.ok).toBe(false);
    expect(result.errors.join()).toMatch(/etcRecords/);
  });
  it("声明条数与实际不符视为截断", () => {
    const backup = createBackup(snapshot());
    backup.data.records.pop();
    expect(() => parseBackupText(text(backup))).toThrow(/截断/);
  });
  it("缺少或重复 id 自动重新编号并提示", () => {
    const data = snapshot();
    data.records[1].id = 1;
    const result = validateSnapshot(data);
    expect(result.ok).toBe(true);
    expect(new Set(result.snapshot.records.map(r => r.id)).size).toBe(2);
    expect(result.warnings.join()).toMatch(/重新编号/);
  });
  it("数字字符串被规整，缺 toll/income 记 0", () => {
    const data = snapshot();
    data.records[0].price = "7.5";
    delete data.records[0].toll;
    const result = validateSnapshot(data);
    expect(result.ok).toBe(true);
    expect(result.snapshot.records[0].price).toBe(7.5);
    expect(result.snapshot.records[0].toll).toBe(0);
  });
  it("ETC 业务编号重复给出警告", () => {
    const data = snapshot();
    data.etcRecords.push({ ...goodEtc });
    expect(validateSnapshot(data).warnings.join()).toMatch(/重复/);
  });
});

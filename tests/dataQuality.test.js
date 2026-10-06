import { describe, expect, it } from "vitest";
import { detectDataIssues, getRouteNameGroups, issueKeysForRecordId } from "../src/lib/dataQuality.js";

const rec = (id, date, from, to, distance = 100, highway = "x", extra = {}) => ({ id, date, from, to, highway, distance, consumption: 6, price: 7.5, toll: 10, income: 0, ...extra });

describe("数据排查", () => {
  it("缺字段不抛错", () => {
    expect(() => detectDataIssues([{ id: 1, distance: 1 }])).not.toThrow();
    expect(() => getRouteNameGroups([{ id: 1 }])).not.toThrow();
  });
  it("空格", () => {
    const issues = detectDataIssues([rec(1, "2026-01-01", " A", "B ")]);
    expect(issues.filter(i => i.type === "空格").length).toBe(2);
  });
  it("疑似重复", () => {
    const issues = detectDataIssues([rec(1, "2026-01-01", "A", "B"), rec(2, "2026-01-01", "A", "B")]);
    expect(issues.find(i => i.type === "疑似重复")?.id).toBe(2);
    expect(detectDataIssues([rec(1, "2026-01-01", "A", "B"), rec(2, "2026-01-02", "A", "B")]).some(i => i.type === "疑似重复")).toBe(false);
  });
  it("重叠行程：同日 A→B + B→C + A→C", () => {
    const rows = [rec(1, "2026-01-01", "A", "B", 50), rec(2, "2026-01-01", "B", "C", 60), rec(3, "2026-01-01", "A", "C", 110)];
    const overlap = detectDataIssues(rows).filter(i => i.type === "重叠行程");
    expect(overlap.map(i => i.id)).toEqual([3]);
    expect(detectDataIssues(rows.slice(0, 2)).some(i => i.type === "重叠行程")).toBe(false);
  });
  it("数值异常", () => {
    const issues = detectDataIssues([rec(1, "2026-02-30", "A", "B", 5000, "x", { price: 75, consumption: 60 })]);
    const fields = issues.filter(i => i.type === "数值异常").map(i => i.field).sort();
    expect(fields).toEqual(["日期", "油价", "油耗", "里程"].sort());
  });
  it("里程偏差", () => {
    const rows = [100, 100, 100, 100, 100, 300].map((d, i) => rec(i + 1, `2026-01-0${i + 1}`, "A", "B", d));
    expect(detectDataIssues(rows).filter(i => i.type === "里程偏差").map(i => i.id)).toEqual([6]);
  });
  it("id 对应的忽略键完整", () => {
    expect(issueKeysForRecordId(7)).toContain("dist-7");
    expect(issueKeysForRecordId(7)).toContain("dup-7");
  });
});

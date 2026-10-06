import { describe, expect, it } from "vitest";
import { fromCloudRow, insertRow, updateRowIfUnchanged } from "../src/lib/cloudRepo.js";

// 极简 Supabase 假客户端：模拟一张表，支持 insert / update(eq,eq).select
const makeClient = (initialRows = []) => {
  const rows = [...initialRows];
  let tick = 0;
  const client = {
    rows,
    from() {
      return {
        insert(values) {
          return {
            select: () => ({
              single: async () => {
                if (rows.some(r => r.user_id === values.user_id)) return { data: null, error: { code: "23505", message: "duplicate key value" } };
                const row = { ...values, updated_at: `${values.updated_at}#${++tick}` };
                rows.push(row);
                return { data: { updated_at: row.updated_at }, error: null };
              }
            })
          };
        },
        update(values) {
          const filters = {};
          const chain = {
            eq(col, val) { filters[col] = val; return chain; },
            select: async () => {
              const hit = rows.filter(r => Object.entries(filters).every(([k, v]) => r[k] === v));
              hit.forEach(r => Object.assign(r, values, { updated_at: `${values.updated_at}#${++tick}` }));
              return { data: hit.map(r => ({ updated_at: r.updated_at })), error: null };
            }
          };
          return chain;
        }
      };
    }
  };
  return client;
};

const snap = (n) => ({ records: Array.from({ length: n }, (_, i) => ({ id: i + 1 })), etcRecords: [], ignoredIssues: [], routeNameRules: {} });

describe("云端乐观锁", () => {
  it("首次 insert 成功；重复 insert 返回 conflict 而不是覆盖", async () => {
    const client = makeClient();
    const first = await insertRow(client, "u1", snap(1));
    expect(first.conflict).toBe(false);
    expect(first.updatedAt).toBeTruthy();
    const second = await insertRow(client, "u1", snap(5));
    expect(second.conflict).toBe(true);
    expect(client.rows[0].records.length).toBe(1);
  });

  it("基准版本一致时更新成功并返回新版本", async () => {
    const client = makeClient();
    const { updatedAt } = await insertRow(client, "u1", snap(1));
    const result = await updateRowIfUnchanged(client, "u1", snap(2), updatedAt);
    expect(result.conflict).toBe(false);
    expect(result.updatedAt).not.toBe(updatedAt);
    expect(client.rows[0].records.length).toBe(2);
  });

  it("两台设备基于同一版本各自保存：后者被拒绝，云端内容不被覆盖", async () => {
    const client = makeClient();
    const { updatedAt: base } = await insertRow(client, "u1", snap(1));
    const deviceA = await updateRowIfUnchanged(client, "u1", snap(2), base);
    const deviceB = await updateRowIfUnchanged(client, "u1", snap(9), base);
    expect(deviceA.conflict).toBe(false);
    expect(deviceB.conflict).toBe(true);
    expect(client.rows[0].records.length).toBe(2);
  });

  it("没有基准版本时拒绝写入", async () => {
    const client = makeClient();
    await insertRow(client, "u1", snap(1));
    expect((await updateRowIfUnchanged(client, "u1", snap(3), null)).conflict).toBe(true);
    expect(client.rows[0].records.length).toBe(1);
  });

  it("fromCloudRow 对脏数据兜底", () => {
    expect(fromCloudRow({ records: null, etc_records: "x", ignored_issues: undefined, route_name_rules: [] })).toEqual({
      records: [], etcRecords: [], ignoredIssues: [], routeNameRules: {}
    });
  });
});

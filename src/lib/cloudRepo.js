export const TABLE_NAME = "driving_user_data";
const COLUMNS = "records,etc_records,ignored_issues,route_name_rules,updated_at";

export const fromCloudRow = (row) => ({
  records: Array.isArray(row.records) ? row.records : [],
  etcRecords: Array.isArray(row.etc_records) ? row.etc_records : [],
  ignoredIssues: Array.isArray(row.ignored_issues) ? row.ignored_issues : [],
  routeNameRules: row.route_name_rules && typeof row.route_name_rules === "object" && !Array.isArray(row.route_name_rules)
    ? row.route_name_rules
    : {}
});

const toPayload = (snapshot, updatedAt) => ({
  records: snapshot.records,
  etc_records: snapshot.etcRecords,
  ignored_issues: snapshot.ignoredIssues,
  route_name_rules: snapshot.routeNameRules,
  updated_at: updatedAt
});

/** 读取当前用户的数据行。 */
export const fetchRow = (client, userId) => (
  client.from(TABLE_NAME).select(COLUMNS).eq("user_id", userId).maybeSingle()
);

/** 只读 updated_at，用来低成本判断云端是否被其他设备改过。 */
export const fetchUpdatedAt = async (client, userId) => {
  const { data, error } = await client.from(TABLE_NAME).select("updated_at").eq("user_id", userId).maybeSingle();
  return { updatedAt: data?.updated_at || null, exists: Boolean(data), error };
};

/** 首次创建数据行。用 insert 而不是 upsert：如果别处已抢先创建，会得到 conflict 而不是覆盖。 */
export const insertRow = async (client, userId, snapshot, now = new Date()) => {
  const { data, error } = await client
    .from(TABLE_NAME)
    .insert({ user_id: userId, ...toPayload(snapshot, now.toISOString()) })
    .select("updated_at")
    .single();
  if (error) {
    const conflict = error.code === "23505" || /duplicate key/i.test(error.message || "");
    return { updatedAt: null, conflict, error: conflict ? null : error };
  }
  return { updatedAt: data?.updated_at || null, conflict: false, error: null };
};

/**
 * 乐观锁更新：只有云端 updated_at 仍等于本机上次读到/写入的值才会更新。
 * 更新到 0 行说明别的设备改过云端，返回 conflict=true，不写入任何内容。
 */
export const updateRowIfUnchanged = async (client, userId, snapshot, expectedUpdatedAt, now = new Date()) => {
  if (!expectedUpdatedAt) return { updatedAt: null, conflict: true, error: null };
  const { data, error } = await client
    .from(TABLE_NAME)
    .update(toPayload(snapshot, now.toISOString()))
    .eq("user_id", userId)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at");
  if (error) return { updatedAt: null, conflict: false, error };
  if (!Array.isArray(data) || data.length === 0) return { updatedAt: null, conflict: true, error: null };
  return { updatedAt: data[0].updated_at, conflict: false, error: null };
};

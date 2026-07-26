# 行车油耗追踪 / Driving Cost Tracker

一个用于记录和可视化汽车行程油耗、费用、顺风车收入的 Web 应用。支持 GitHub Pages 托管，并通过 Supabase Auth、Postgres 和行级安全策略在不同设备间同步私人数据。

## 快速启动

### 前提条件
需要安装 [Node.js](https://nodejs.org/)（建议 v18 或以上）。

### 安装与运行

```bash
# 1. 进入项目目录
cd driving-tracker-local

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

浏览器会自动打开 http://localhost:3000，即可使用。没有配置 Supabase 环境变量时，应用会使用本地模式。

### 打包部署

```bash
# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

构建产物在 `dist/` 目录，可以部署到任意静态服务器。推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会自动构建并发布 GitHub Pages。

## 云端同步

1. 在 Supabase SQL Editor 执行 `supabase/schema.sql`。
2. 将 `.env.example` 复制为 `.env.local`，填写项目 URL 和 Publishable key。
3. 在 GitHub 仓库的 Actions secrets 中设置同名的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_PUBLISHABLE_KEY`。
4. 在 Supabase Auth 的 URL Configuration 中加入 GitHub Pages 地址。

应用使用邮箱和密码登录。`driving_user_data` 开启 RLS，每个登录用户只能读取和修改 `user_id = auth.uid()` 的数据。Publishable key 会出现在浏览器代码中，这是 Supabase 的预期用法；不要把 Secret key 或数据库密码写入前端环境变量。

## 功能说明

- **数据看板**：总里程、油费、过路费、收入等汇总，5种图表
- **行程记录**：排序、筛选、编辑、删除，支持从 Excel 导入数据
- **新增记录**：自动补全出发地/目的地/路线，历史参考，实时费用计算
- **ETC 查询**：从 ETC PDF 消费明细中提取入口站、出口站、入口时间、出口时间、实收金额，按入口站/出口站查询去重后的收费项
- **出行对比**：支持分段上下高速、公共交通分段换乘票价和自动每百公里油费，比较往返总费用、人均费用并给出更划算的出行方式
- **数据排查**：按起点→终点归组路线名称，支持整组统一、只修正某个旧名称，并可保存同一起终点存在多条有效路线的规则

## 项目结构

主要功能已按后续扩展拆分：

- `src/App.jsx`：页面状态、交互和主要界面
- `src/config/appConfig.js`：标签页、图表、表单字段、表格列等配置
- `src/data/initialRecords.js`：公开构建使用的空初始数据
- `src/data/etcRecords.js`：公开构建使用的空 ETC 数据
- `src/hooks/useCloudSync.js`：登录会话、云端读取和自动保存
- `src/lib/backup.js`：完整 JSON 备份导出与恢复
- `src/lib/supabaseClient.js`：Supabase 客户端初始化
- `src/lib/drivingMath.js`：油费、总费用、盈亏、月度汇总等计算逻辑
- `src/lib/dataQuality.js`：路线名称分组、空格和里程偏差等排查规则
- `src/lib/etcLookup.js`：ETC 站点列表、统计汇总、入口/出口金额查询
- `src/lib/travelCompare.js`：公共交通/自驾往返费用对比计算
- `src/lib/excelImport.js`：Excel 解析、日期转换、行程拆分、重复判断
- `src/lib/storage.js`：浏览器本地存储读写

以后如果要添加“加油记录、保养费用、车辆档案、报销统计”等新项目，优先把计算和解析逻辑放到 `src/lib/`，把字段和菜单放到 `src/config/`，页面再从 `App.jsx` 接入。

## 本次优化点

- 将大文件中的计算、排查、导入、存储逻辑拆成独立模块，方便继续加功能。
- 初始数据移到单独文件，页面代码更轻。
- 平均油耗改为按总耗油量/总里程加权计算，比直接平均每条记录油耗更准确。
- 新增记录时增加数值校验，避免空值或异常数字写入。
- 月份标签不再写死 2025 年，跨年记录也能正常显示。
- 新增 ETC 金额查询：同一入口/出口/金额的重复通行会合并显示，并保留出现次数与最近通行时间。
- 出行费用对比支持去返程各两段高速费用、去返程各两段公共交通票价；输入油价和本次百公里油耗后自动生成每百公里油费。

## Excel 导入格式

支持与原始油耗计算表相同的格式，系统会自动识别列位置，
将"楚雄-昆明"拆分为出发地和目的地。

## 维护提示

当前 Excel 导入仍使用 `xlsx`。`npm audit` 会提示该依赖存在暂无官方修复版的安全告警；这个应用是本地自用工具时风险相对可控，但不要导入来源不明的表格。后续如果要长期公开部署，建议把 Excel 解析替换为维护状态更好的库。

## 数据与隐私

- 未登录的本地开发模式使用浏览器 `localStorage`。
- 配置 Supabase 后必须登录，修改会先写入本地缓存，再自动同步至当前用户的云端记录。
- 行程和 ETC 私人明细不在 GitHub 源码或 Pages 构建产物中。
- “导出备份”会下载完整 JSON；首次迁移或进行大批量修改前应先备份。
- 不同设备同时编辑时采用最后写入者覆盖，当前版本不做逐条冲突合并。

## 首次迁移

1. 在旧的本地页面点击“导出备份”。
2. 打开 GitHub Pages，注册并登录。
3. 点击“恢复备份”，选择 JSON 文件。
4. 等待右上角状态变为“已同步”，再在另一台设备登录验证。

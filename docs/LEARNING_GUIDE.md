# RepairFlow 学习指南

## 一次请求如何进入数据库

租客在 `app/(portal)/submit/page.tsx` 填写表单。表单提交到 `app/actions/tickets.ts` 的 `createTicketAction`，这里再次读取服务端会话并用 Zod 校验字段。随后 `services/ticket-service.ts` 的 `createTicket` 检查租客和房屋的有效关联，在一个 Prisma 事务中创建 `Ticket`、`TicketEvent`、`AuditLog` 和唯一业务键的 `OutboxJob`。页面跳转到详情页，`data/tickets.ts` 再按当前角色读取最小授权数据。

你应该能解释：为什么按钮是否显示不等于权限控制；为什么 server action 仍需重新认证；为什么 `redirect()` 的 Next.js 控制异常不能被普通错误处理吞掉。

## 认证与授权

`lib/auth.ts` 配置 Better Auth：关闭开放注册、启用数据库会话、限制登录频率，并声明服务端角色字段。`lib/session.ts` 给页面和 actions 提供当前用户；`lib/route-auth.ts` 给 API 使用。记录级规则在 `lib/permissions.ts`：物业看全部，租客只看自己创建的工单，维修人员只看当前分配给自己的工单。

邀请流程在 `services/admin-service.ts`。数据库只保存 token 哈希；邀请有过期时间、固定角色，并在事务中原子地标记已使用。待处理邀请也可以由经理撤销，领取时会同时检查是否过期、已用或已撤销。重新派单后，所有读取都会比较新的 `assignedContractorId`，旧维修人员因此立即失去详情、附件和 AI 上下文访问。

你应该能解释这些位置：`lib/auth.ts`、`lib/permissions.ts`、`services/admin-service.ts`、`app/api/attachments/[id]/route.ts`。

## 状态机、并发与金额

`domain/workflow.ts` 是允许转换和角色约束的单一入口。`services/ticket-service.ts` 的每次修改都带 `expectedVersion`，数据库只更新版本仍匹配的工单；旧页面会得到冲突而不是覆盖新状态。报价和预约各自有版本：新报价不会继承旧批准，改期不会继承旧确认。金额由 `domain/money.ts` 转成整数分，避免浮点金额误差。

开始施工必须同时满足：当前报价已批准或物业记录了豁免、当前预约版本得到租客和维修人员双方确认。实际费用保存在独立字段，不覆盖报价。

## 通知如何执行

业务事务不直接发送邮件，而是写 `OutboxJob`。独立进程 `workers/outbox-worker.ts` 用 `FOR UPDATE SKIP LOCKED` 认领到期任务，写入租约和尝试次数。进程崩溃后，超过 60 秒的租约可被其他 worker 重新认领。发送前再次读取工单状态、当前维修人员和预约版本；已关闭、已取消或已改期的旧提醒会被取消。

站内通知用业务键去重。SMTP 由 `adapters/email.ts` 处理且默认关闭。数据库去重不能保证外部邮件绝不重复：邮件服务器成功接收后，如果本地记录发送成功失败，重试仍可能再发一次。

## AI 如何校验

入口是 `services/ai-service.ts`。它先读取并授权工单，再限制角色能力和请求频率，只把必要字段传给 `ai/provider.ts`。描述被视为不可信文本；适配器没有派单、审批、文件或任意网络工具。真实适配器要求结构化输出，随后再用 `ai/schema.ts` 的 Zod schema 校验。

`ai/demo.ts` 是明确标记的 deterministic demo provider，不代表真实模型质量。AI 结果写入 `AiDraft`，用户可以编辑；只有物业能批准提取结果或发送消息。确定的金额、状态、数量、时限和权限永远由程序计算。

你应该能解释：为什么提示词注入测试重要但不能替代授权；为什么无效 JSON/超时必须回到手工流程；为什么真实模型需要有凭据后单独评估。

## 建议讲解顺序

1. 从 `prisma/schema.prisma` 画出 Ticket、Quote、Appointment、Event、Outbox 的关系。
2. 沿“页面 → action/API → service → Prisma transaction → outbox worker”追踪一次完整请求。
3. 用 `tests/integration/workflow.test.ts` 解释并发、重新派单、版本失效和 worker 恢复。
4. 用 `tests/ai-eval/demo-eval.test.ts` 与 `tests/unit/ai-provider.test.ts` 区分应用契约测试和真实模型质量。
5. 用 `docs/VERIFICATION.md` 说明哪些证据已获得、哪些外部项仍未验证，以及为什么不能把本地通过称为生产级。

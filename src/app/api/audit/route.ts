import { db } from "@/db";
import { exceptionLog } from "@/db/schema";
import { desc, eq, and, gte, lte } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { NextResponse } from "next/server";

type EntityType = InferSelectModel<typeof exceptionLog>["entityType"];
type ActionType = InferSelectModel<typeof exceptionLog>["action"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const action = searchParams.get("action");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = parseInt(searchParams.get("limit") ?? "100");

  const query = db.select().from(exceptionLog);

  const conditions = [];
  if (entityType) {
    conditions.push(eq(exceptionLog.entityType, entityType as EntityType));
  }
  if (entityId) {
    conditions.push(eq(exceptionLog.entityId, entityId));
  }
  if (action) {
    conditions.push(eq(exceptionLog.action, action as ActionType));
  }
  if (from) {
    conditions.push(gte(exceptionLog.createdAt, from));
  }
  if (to) {
    // Include all records up to end of the "to" day
    conditions.push(lte(exceptionLog.createdAt, `${to}T23:59:59`));
  }

  const logs =
    conditions.length > 0
      ? query
          .where(and(...conditions))
          .orderBy(desc(exceptionLog.createdAt))
          .limit(limit)
          .all()
      : query.orderBy(desc(exceptionLog.createdAt)).limit(limit).all();

  return NextResponse.json(logs);
}

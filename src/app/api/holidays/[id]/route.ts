import { db } from "@/db";
import { publicHoliday } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { yearOfDateString } from "@/lib/holidays/standard-holidays";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const holiday = db
    .select()
    .from(publicHoliday)
    .where(eq(publicHoliday.id, id))
    .get();

  if (!holiday) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  }

  return NextResponse.json(holiday);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();

  const updated = db
    .update(publicHoliday)
    .set({
      name: body.name,
      date: body.date,
      // Year from the string: new Date("2027-01-01").getFullYear() is 2026 on
      // any server west of UTC.
      year: body.year ?? yearOfDateString(body.date),
    })
    .where(eq(publicHoliday.id, id))
    .returning()
    .get();

  if (!updated) {
    return NextResponse.json({ error: "Holiday not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  db.delete(publicHoliday).where(eq(publicHoliday.id, id)).run();
  return NextResponse.json({ success: true });
}

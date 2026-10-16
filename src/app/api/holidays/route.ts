import { db } from "@/db";
import { publicHoliday } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { yearOfDateString } from "@/lib/holidays/standard-holidays";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");

  const query = db.select().from(publicHoliday);

  if (year) {
    const holidays = query
      .where(eq(publicHoliday.year, parseInt(year)))
      .orderBy(publicHoliday.date)
      .all();
    return NextResponse.json(holidays);
  }

  const holidays = query.orderBy(publicHoliday.date).all();
  return NextResponse.json(holidays);
}

export async function POST(request: Request) {
  const body = await request.json();

  const newHoliday = db
    .insert(publicHoliday)
    .values({
      name: body.name,
      date: body.date,
      // Year from the string: new Date("2027-01-01").getFullYear() is 2026 on
      // any server west of UTC.
      year: body.year ?? yearOfDateString(body.date),
    })
    .returning()
    .get();

  return NextResponse.json(newHoliday, { status: 201 });
}
